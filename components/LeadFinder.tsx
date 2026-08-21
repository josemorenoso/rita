"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import LeadTable from "./LeadTable";
import DownloadGate from "./DownloadGate";
import { CHIP_CATEGORIES } from "@/lib/leads/categories";
import { BRAND, SEARCH_DEFAULTS } from "@/lib/leads/brand";
import { downloadCsv } from "@/lib/leads/csv";
import * as store from "@/lib/leads/localstore";
import type { Lead, LeadRun } from "@/lib/leads/types";

type Phase = "form" | "running" | "results";
type LineState = "run" | "ok" | "warn" | "err";

interface Line {
  id: number;
  text: string;
  state: LineState;
  detail?: string;
}

interface Quota {
  configured: boolean;
  remaining?: number;
  available?: number;
  error?: string;
  badKey?: boolean;
}

const MARK: Record<LineState, string> = { run: "▸", ok: "✓", warn: "!", err: "✕" };

export default function LeadFinder() {
  const [phase, setPhase] = useState<Phase>("form");
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [limit, setLimit] = useState(SEARCH_DEFAULTS.limit);
  const [enrichCount, setEnrichCount] = useState(10);

  const [hunterKey, setHunterKeyState] = useState("");
  const [quota, setQuota] = useState<Quota | null>(null);
  const [checkingKey, setCheckingKey] = useState(false);

  const [lines, setLines] = useState<Line[]>([]);
  const [run, setRun] = useState<LeadRun | null>(null);
  const [emails, setEmails] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [gateOpen, setGateOpen] = useState(false);

  const lineId = useRef(0);
  const consoleRef = useRef<HTMLDivElement>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    // Rearmado en cada montaje: con StrictMode React monta, desmonta y vuelve a
    // montar en desarrollo, y sin esta línea la limpieza del desmontaje simulado
    // dejaría el componente cancelado desde el principio.
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  // Recupera la clave que el visitante guardó en visitas anteriores.
  useEffect(() => {
    const saved = store.getHunterKey();
    if (saved) {
      setHunterKeyState(saved);
      void checkKey(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    consoleRef.current?.scrollTo({ top: consoleRef.current.scrollHeight, behavior: "smooth" });
  }, [lines]);

  useEffect(() => {
    if (phase !== "running" || startedAt === null) return;
    const id = setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 250);
    return () => clearInterval(id);
  }, [phase, startedAt]);

  const push = useCallback((text: string, state: LineState = "run", detail?: string) => {
    const id = ++lineId.current;
    setLines((prev) => [...prev, { id, text, state, detail }]);
    return id;
  }, []);

  const settle = useCallback((id: number, state: LineState, detail?: string) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, state, detail } : l)));
  }, []);

  async function checkKey(key: string) {
    setCheckingKey(true);
    try {
      const res = await fetch("/api/leads/quota", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hunterKey: key }),
      });
      setQuota((await res.json()) as Quota);
    } catch {
      setQuota({ configured: true, error: "No se pudo comprobar la clave." });
    } finally {
      setCheckingKey(false);
    }
  }

  function saveKey(key: string) {
    setHunterKeyState(key);
    store.setHunterKey(key);
    if (key.trim().length > 20) void checkKey(key);
    else setQuota(null);
  }

  async function launch() {
    if (!query.trim() || !city.trim()) return;

    setPhase("running");
    setLines([]);
    setRun(null);
    setEmails(0);
    setFatal(null);
    setStartedAt(Date.now());
    setElapsed(0);
    lineId.current = 0;

    // ── Paso 1: el mapa. Gratis, ilimitado y sin ninguna clave. ──
    const searchLine = push(`Barriendo el mapa · ${query} · ${city}`);
    let data: { run: LeadRun; matchedCategory: boolean };

    try {
      const res = await fetch("/api/leads/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, city, limit, radiusKm: SEARCH_DEFAULTS.radiusKm }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "La búsqueda falló.");
      data = json;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      settle(searchLine, "err", message);
      setFatal(message);
      setPhase("results");
      return;
    }

    if (cancelled.current) return;

    let current = data.run;
    setRun(current);
    settle(searchLine, "ok", `${current.leads.length} negocios`);

    if (!current.leads.length) {
      push("El mapa no tiene negocios de ese tipo en esa zona", "warn", "prueba otra categoría o ciudad");
      store.saveRun(current);
      setPhase("results");
      return;
    }

    push(`Zona · ${current.place}`, "ok", `radio ${current.radiusKm} km`);

    if (!data.matchedCategory) {
      push(`"${query}" no es una categoría del mapa: busqué por nombre`, "warn", "usa un botón para más resultados");
    }

    const callable = current.leads.filter((l) => l.phone).length;
    push("Filtrando por forma de contacto", "ok", `${callable} con teléfono`);

    const haveEmail = new Set(current.leads.filter((l) => l.mapEmail).map((l) => l.id));
    if (haveEmail.size) push("Correos publicados en el propio mapa", "ok", `${haveEmail.size} gratis, sin cuota`);
    setEmails(haveEmail.size);

    // ── Paso 2: los correos. Solo si el visitante trajo su clave. ──
    const usable = quota?.configured && !quota.error && (quota.remaining ?? 0) > 0;

    if (!usable || !enrichCount) {
      push(
        quota?.configured ? "Búsqueda de correos desactivada" : "Sin clave de Hunter.io: no busco correos",
        "warn",
        "los teléfonos están completos",
      );
    } else {
      // Primero los que no tienen correo: ahí la cuota rinde más.
      const targets = current.leads
        .filter((l) => l.domain)
        .sort((a, b) => Number(Boolean(a.mapEmail)) - Number(Boolean(b.mapEmail)))
        .slice(0, Math.min(enrichCount, quota?.remaining ?? 0));

      if (!targets.length) {
        push("Ningún negocio tiene web propia que consultar", "warn", "Hunter.io no puede actuar aquí");
      } else {
        push(`Hunter.io · ${targets.length} dominios en cola`, "ok");

        for (const lead of targets) {
          if (cancelled.current) return;

          const id = push(`Hunter.io › ${lead.domain}`);
          try {
            const res = await fetch("/api/leads/enrich", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ domain: lead.domain, hunterKey }),
            });
            const json = (await res.json()) as {
              contact?: {
                email: string;
                name: string | null;
                position: string | null;
                confidence: number | null;
              } | null;
              error?: string;
              quotaExhausted?: boolean;
              badKey?: boolean;
            };

            if (json.quotaExhausted) {
              settle(id, "err", "cuota mensual agotada");
              push("Paro aquí para no seguir fallando", "warn", "la lista de teléfonos sigue completa");
              break;
            }

            if (json.badKey) {
              settle(id, "err", "clave no válida");
              push("Revisa tu clave de Hunter.io", "warn", "los teléfonos no se ven afectados");
              break;
            }

            if (!res.ok || !json.contact) {
              settle(id, json.contact === null ? "warn" : "err", json.contact === null ? "sin correos conocidos" : (json.error ?? "sin respuesta"));
              continue;
            }

            const c = json.contact;
            const updated: Lead = {
              ...lead,
              email: c.email,
              contactName: c.name,
              contactPosition: c.position,
              confidence: c.confidence,
              enrich: "done",
            };

            settle(id, "ok", `${c.email}${c.name ? ` · ${c.name}` : ""} (${c.confidence ?? "?"} %)`);
            haveEmail.add(lead.id);
            setEmails(haveEmail.size);

            current = { ...current, leads: current.leads.map((l) => (l.id === lead.id ? updated : l)) };
            setRun(current);
            setQuota((q) => (q?.remaining ? { ...q, remaining: q.remaining - 1 } : q));
          } catch {
            settle(id, "err", "fallo de red");
          }
        }
      }
    }

    if (cancelled.current) return;

    store.saveRun(current);
    push("Lista lista para llamar", "ok", `${current.leads.length} clientes · ${haveEmail.size} con correo`);
    setPhase("results");
  }

  function askForDownload() {
    if (!run) return;
    // Quien ya dejó sus datos no tiene que volver a rellenarlos.
    if (store.isCaptured()) downloadCsv(run);
    else setGateOpen(true);
  }

  const canLaunch = query.trim().length > 0 && city.trim().length > 0 && phase !== "running";
  const withPhone = run?.leads.filter((l) => l.phone).length ?? 0;

  return (
    <div className="finder">
      <header className="finder-head">
        <div>
          <h1>{BRAND.toolName}</h1>
          <p className="finder-tagline">{BRAND.tagline}</p>
        </div>
        <Link className="leads-back" href="/leads">
          Mis búsquedas
        </Link>
      </header>

      <section className="finder-form">
        <label className="hunter-field">
          <span className="panel-label">¿Qué tipo de negocio buscas?</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="clínicas dentales, gimnasios, hoteles…"
          />
        </label>

        <div className="hunter-chips">
          {CHIP_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`hunter-chip${query === c.label ? " on" : ""}`}
              onClick={() => setQuery(c.label)}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="finder-row">
          <label className="hunter-field">
            <span className="panel-label">¿En qué ciudad?</span>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Medellín, Colombia · Bogotá · Madrid"
              onKeyDown={(e) => {
                if (e.key === "Enter" && canLaunch) void launch();
              }}
            />
          </label>

          <label className="hunter-field">
            <span className="panel-label">
              Cuántos negocios <strong className="accent">{limit}</strong>
            </span>
            <input
              type="range"
              min={10}
              max={SEARCH_DEFAULTS.maxLimit}
              step={5}
              value={limit}
              onChange={(e) => setLimit(+e.target.value)}
            />
          </label>
        </div>

        <details className="finder-optional">
          <summary>
            Buscar también los correos <span className="finder-optional-tag">opcional</span>
          </summary>
          <div className="finder-optional-body">
            <p className="hunter-note">
              Los teléfonos salen siempre y son gratis. Para los correos hace falta una clave de{" "}
              <a href="https://hunter.io/users/sign_up" target="_blank" rel="noreferrer">
                Hunter.io
              </a>
              , que es gratuita y da 50 búsquedas al mes. Se guarda solo en tu navegador: nunca la almacenamos.
            </p>

            <label className="hunter-field">
              <span className="panel-label">Tu clave de Hunter.io</span>
              <input
                type="password"
                value={hunterKey}
                onChange={(e) => saveKey(e.target.value)}
                placeholder="pega aquí tu clave"
              />
            </label>

            {quota && (
              <p className="hunter-quota">
                {checkingKey
                  ? "Comprobando…"
                  : quota.error
                    ? `Hunter.io · ${quota.error}`
                    : `Hunter.io · ${quota.remaining} de ${quota.available} búsquedas este mes`}
              </p>
            )}

            <label className="hunter-field">
              <span className="panel-label">
                Buscar correo en <strong className="accent">{enrichCount}</strong> negocios
              </span>
              <input
                type="range"
                min={0}
                max={Math.min(25, quota?.remaining ?? 25)}
                step={1}
                value={enrichCount}
                onChange={(e) => setEnrichCount(+e.target.value)}
              />
            </label>
          </div>
        </details>

        <button className="hunter-launch" disabled={!canLaunch} onClick={() => void launch()}>
          {phase === "running" ? "Buscando…" : "▶ Buscar clientes"}
        </button>
      </section>

      {phase !== "form" && (
        <section className="finder-results">
          <div className="hunter-counters">
            <div>
              <span className="panel-label">Clientes</span>
              <strong>{run?.leads.length ?? 0}</strong>
            </div>
            <div>
              <span className="panel-label">Con teléfono</span>
              <strong>{withPhone}</strong>
            </div>
            <div>
              <span className="panel-label">Con correo</span>
              <strong className="accent">{emails}</strong>
            </div>
            <div>
              <span className="panel-label">{fatal ? "Estado" : "Tiempo"}</span>
              <strong>{fatal ? "Detenido" : `${elapsed} s`}</strong>
            </div>
          </div>

          <div className="hunter-console" ref={consoleRef}>
            {lines.map((l) => (
              <p key={l.id} className={`hline hline-${l.state}`}>
                <span className="hline-mark">{MARK[l.state]}</span>
                <span className="hline-text">{l.text}</span>
                {l.detail ? <span className="hline-detail">{l.detail}</span> : null}
              </p>
            ))}
          </div>

          {phase === "results" && run && run.leads.length > 0 ? (
            <>
              <div className="finder-actions">
                <button className="hunter-launch" onClick={askForDownload}>
                  Descargar en Excel
                </button>
                <button className="hunter-secondary" onClick={() => setPhase("form")}>
                  Nueva búsqueda
                </button>
              </div>
              <LeadTable leads={run.leads} />
            </>
          ) : null}
        </section>
      )}

      {(BRAND.owner || BRAND.link) && (
        <footer className="finder-foot">
          {BRAND.owner && <span>{BRAND.owner}</span>}
          {BRAND.link && (
            <a href={BRAND.link} target="_blank" rel="noreferrer">
              {BRAND.linkLabel || BRAND.link}
            </a>
          )}
        </footer>
      )}

      {gateOpen && run ? (
        <DownloadGate
          run={run}
          onClose={() => setGateOpen(false)}
          onDone={() => {
            store.markCaptured();
            setGateOpen(false);
            downloadCsv(run);
          }}
        />
      ) : null}
    </div>
  );
}
