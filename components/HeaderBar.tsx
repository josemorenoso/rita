"use client";

import { clockLabel, eur, num, uptimeLabel } from "@/lib/format";
import { AGENT_COUNT } from "@/lib/roster";
import type { Snapshot } from "@/lib/types";

export default function HeaderBar({
  snap,
  speed,
  onSpeed,
}: {
  snap: Snapshot | null;
  speed: number;
  onSpeed: (v: number) => void;
}) {
  const m = snap?.metrics;
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">AIOS</span>
        <span className="brand-sub">Sistema operativo de agentes · Turno del 4 de agosto</span>
      </div>

      <div className="topbar-stats">
        <Readout label="Hora local" value={snap ? clockLabel(snap.clock) : "09:14:00"} />
        <Readout label="Sesión" value={snap ? uptimeLabel(snap.uptime) : "00:00"} />
        <Readout label="Agentes" value={`${AGENT_COUNT} / ${AGENT_COUNT}`} live />
        <Readout label="Ejec./min" value={snap ? num(snap.runsPerMin) : "0"} live />
        <Readout label="Ingresos hoy" value={m ? eur(m.revenueToday) : "—"} accent />
      </div>

      <div className="speed">
        <span className="panel-label">Velocidad</span>
        <div className="speed-buttons">
          {[1, 2, 4].map((v) => (
            <button key={v} className={speed === v ? "on" : undefined} onClick={() => onSpeed(v)}>
              {v}×
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

function Readout({ label, value, live, accent }: { label: string; value: string; live?: boolean; accent?: boolean }) {
  return (
    <div className={`readout${accent ? " readout-accent" : ""}`}>
      <span className="panel-label">
        {live && <i className="dot" />}
        {label}
      </span>
      <strong>{value}</strong>
    </div>
  );
}
