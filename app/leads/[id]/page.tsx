"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import LeadTable from "@/components/LeadTable";
import { downloadCsv } from "@/lib/leads/csv";
import * as store from "@/lib/leads/localstore";
import DownloadGate from "@/components/DownloadGate";
import type { LeadRun } from "@/lib/leads/types";

/** En Next 16 los parámetros de ruta llegan como promesa; `use` la resuelve. */
export default function LeadsRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [run, setRun] = useState<LeadRun | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);

  useEffect(() => {
    setRun(store.loadRun(id));
    setLoaded(true);
  }, [id]);

  if (!loaded) return null;

  if (!run) {
    return (
      <div className="leads-shell">
        <header className="leads-top">
          <div>
            <span className="panel-label">No encontrada</span>
            <h1>Esa búsqueda ya no está</h1>
          </div>
          <Link className="leads-back" href="/leads">
            ← Todas las búsquedas
          </Link>
        </header>
        <div className="leads-empty">
          <p>Las búsquedas se guardan en el navegador con el que las lanzaste.</p>
          <p className="leads-empty-hint">Si borraste los datos del navegador o entras desde otro dispositivo, no aparecerán.</p>
        </div>
      </div>
    );
  }

  const withPhone = run.leads.filter((l) => l.phone).length;
  const withEmail = run.leads.filter((l) => l.email ?? l.mapEmail).length;

  function download() {
    if (!run) return;
    if (store.isCaptured()) downloadCsv(run);
    else setGateOpen(true);
  }

  return (
    <div className="leads-shell">
      <header className="leads-top">
        <div>
          <span className="panel-label">
            {run.place} · {new Date(run.createdAt).toLocaleString("es-ES", { day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" })}
          </span>
          <h1>
            {run.categoryLabel} en {run.city}
          </h1>
        </div>
        <Link className="leads-back" href="/leads">
          ← Todas las búsquedas
        </Link>
      </header>

      <div className="leads-summary">
        <div>
          <span className="panel-label">Clientes</span>
          <strong>{run.leads.length}</strong>
        </div>
        <div>
          <span className="panel-label">Con teléfono</span>
          <strong>{withPhone}</strong>
        </div>
        <div>
          <span className="panel-label">Con correo</span>
          <strong className="accent">{withEmail}</strong>
        </div>
        <div>
          <span className="panel-label">Radio</span>
          <strong>{run.radiusKm} km</strong>
        </div>
      </div>

      <div className="finder-actions">
        <button className="hunter-launch" onClick={download}>
          Descargar en Excel
        </button>
      </div>

      <LeadTable leads={run.leads} />

      {gateOpen ? (
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
