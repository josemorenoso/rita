"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BRAND } from "@/lib/leads/brand";
import * as store from "@/lib/leads/localstore";
import type { LeadRun } from "@/lib/leads/types";

/**
 * El historial vive en el navegador del visitante, así que esta página se
 * renderiza en cliente. En el primer render no hay nada que leer todavía —
 * de ahí el estado `loaded`, que evita enseñar "no hay búsquedas" durante
 * un instante a quien sí las tiene.
 */
export default function LeadsIndex() {
  const [runs, setRuns] = useState<LeadRun[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setRuns(store.listRuns());
    setLoaded(true);
  }, []);

  return (
    <div className="leads-shell">
      <header className="leads-top">
        <div>
          <span className="panel-label">{BRAND.toolName}</span>
          <h1>Mis búsquedas</h1>
        </div>
        <Link className="leads-back" href="/">
          ← Buscar clientes
        </Link>
      </header>

      {!loaded ? null : runs.length === 0 ? (
        <div className="leads-empty">
          <p>Todavía no has lanzado ninguna búsqueda.</p>
          <p className="leads-empty-hint">
            Las búsquedas se guardan en este navegador. Si entras desde otro dispositivo no las verás aquí — descarga
            el Excel para conservarlas.
          </p>
        </div>
      ) : (
        <>
          <ul className="run-list">
            {runs.map((r) => {
              const withPhone = r.leads.filter((l) => l.phone).length;
              const withEmail = r.leads.filter((l) => l.email ?? l.mapEmail).length;
              return (
                <li key={r.id}>
                  <Link href={`/leads/${r.id}`} className="run-card">
                    <div className="run-main">
                      <strong>{r.categoryLabel}</strong>
                      <span className="run-city">{r.city}</span>
                    </div>
                    <div className="run-stats">
                      <span>
                        <b>{r.leads.length}</b> clientes
                      </span>
                      <span>
                        <b>{withPhone}</b> con teléfono
                      </span>
                      <span className="accent">
                        <b>{withEmail}</b> con correo
                      </span>
                    </div>
                    <time className="run-when">
                      {new Date(r.createdAt).toLocaleString("es-ES", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </Link>
                </li>
              );
            })}
          </ul>

          <button
            className="hunter-secondary leads-clear"
            onClick={() => {
              store.clearRuns();
              setRuns([]);
            }}
          >
            Borrar el historial de este navegador
          </button>
        </>
      )}
    </div>
  );
}
