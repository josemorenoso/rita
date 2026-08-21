"use client";

import { DEPTS } from "@/lib/world";
import { AGENT_COUNT } from "@/lib/roster";
import { dec, eur, eurCompact, num, pct } from "@/lib/format";
import type { Snapshot } from "@/lib/types";

export default function NexusPanel({ snap, onClose }: { snap: Snapshot; onClose: () => void }) {
  const m = snap.metrics;
  const working = snap.agents.filter((a) => a.mode !== "think").length;
  const saving = m.humanCostToday - m.agentCostToday;
  const savingPct = (saving / m.humanCostToday) * 100;
  const maxDeptRuns = Math.max(...DEPTS.map((d) => m.byDept[d.id].runs), 1);
  const target = 1_150;
  const targetPct = Math.min(100, (m.revenueToday / target) * 100);

  return (
    <aside className="panel panel-nexus">
      <button className="panel-close" onClick={onClose} aria-label="Cerrar centro de control">
        ✕
      </button>

      <header className="nexus-head">
        <span className="panel-dept">CENTRO DE CONTROL</span>
        <h2>NEXUS</h2>
        <p className="panel-role">
          Orquesta {AGENT_COUNT} agentes en cuatro áreas. Cada paquete de luz que llega por el bus es una ejecución
          contabilizada aquí.
        </p>
      </header>

      <section className="hero-metric">
        <span className="panel-label">Ingresos generados hoy</span>
        <strong className="hero-value">{eur(m.revenueToday)}</strong>
        <div className="hero-track">
          <div className="hero-fill" style={{ width: `${targetPct}%` }} />
        </div>
        <div className="hero-foot">
          <span>{dec(targetPct)} % del objetivo diario</span>
          <span>meta {eur(target)} · 25 k € / mes</span>
        </div>
      </section>

      <section className="kpi-grid">
        <Kpi label="Horas totales ahorradas" value={`${dec(m.hoursSavedToday)} h`} hint="hoy" tone="cyan" />
        <Kpi label="Eficiencia del equipo" value={pct(m.efficiency)} hint="media móvil 60 s" tone="green" />
        <Kpi label="Ejecuciones totales" value={num(m.runsAllTime)} hint={`${num(m.runsToday)} hoy`} tone="cyan" />
        <Kpi label="Agentes activos" value={`${working}/${AGENT_COUNT}`} hint={`${snap.runsPerMin} ejec./min`} tone="green" />
      </section>

      <section className="panel-block">
        <span className="panel-label">Rendimiento del bus · ejecuciones por segundo</span>
        <Throughput values={m.throughput} />
      </section>

      <section className="panel-block">
        <span className="panel-label">Carga por área</span>
        <ul className="dept-list">
          {DEPTS.map((d) => {
            const b = m.byDept[d.id];
            return (
              <li key={d.id} style={{ "--accent": d.accent } as React.CSSProperties}>
                <div className="dept-row-top">
                  <span className="dept-name">{d.name}</span>
                  <span className="dept-value">{eur(b.value)}</span>
                </div>
                <div className="dept-track">
                  <div className="dept-fill" style={{ width: `${(b.runs / maxDeptRuns) * 100}%` }} />
                </div>
                <div className="dept-row-bottom">
                  <span>{num(b.runs)} ejecuciones</span>
                  <span>{dec(b.saved)} h ahorradas</span>
                  <span>carga {Math.round(b.load * 100)} %</span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="panel-block savings">
        <span className="panel-label">Coste de hoy frente a un equipo humano equivalente</span>
        <div className="compare">
          <div className="compare-row">
            <span>Equipo humano</span>
            <div className="compare-track">
              <div className="compare-fill human" style={{ width: "100%" }} />
            </div>
            <strong>{eur(m.humanCostToday)}</strong>
          </div>
          <div className="compare-row">
            <span>{AGENT_COUNT} agentes</span>
            <div className="compare-track">
              <div
                className="compare-fill agents"
                style={{ width: `${(m.agentCostToday / m.humanCostToday) * 100}%` }}
              />
            </div>
            <strong>{eur(m.agentCostToday)}</strong>
          </div>
        </div>
        <p className="savings-line">
          Ahorro de <strong>{eur(saving)}</strong> hoy · <strong>{dec(savingPct)} %</strong> menos de coste operativo
        </p>
      </section>

      <section className="panel-block">
        <span className="panel-label">Operaciones cerradas</span>
        <div className="ops-grid">
          <Op label="Leads cualificados" value={num(m.leadsQualified)} />
          <Op label="Negocios cerrados" value={num(m.dealsToday)} />
          <Op label="Facturas conciliadas" value={num(m.invoicesCleared)} />
          <Op label="Envíos gestionados" value={num(m.shipmentsRouted)} />
          <Op label="Incidencias resueltas" value={num(m.ticketsResolved)} />
          <Op label="Pipeline abierto" value={eurCompact(m.pipeline)} />
        </div>
      </section>

      <section className="panel-block">
        <span className="panel-label">Estado del sistema</span>
        <ul className="sys-list">
          <SysRow label="Bus de datos" value="Estable · 4 canales" ok />
          <SysRow label="Tasa de éxito global" value={pct(m.successRate)} ok />
          <SysRow label="Horas ahorradas acumuladas" value={`${num(m.hoursSavedAllTime)} h`} ok />
          <SysRow label="Reintentos en cola" value="0" ok />
          <SysRow label="Supervisión humana" value="2 aprobaciones pendientes" />
        </ul>
      </section>
    </aside>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: "cyan" | "green" }) {
  return (
    <div className={`kpi kpi-${tone}`}>
      <span className="panel-label">{label}</span>
      <strong>{value}</strong>
      <span className="stat-hint">{hint}</span>
    </div>
  );
}

function Op({ label, value }: { label: string; value: string }) {
  return (
    <div className="op">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function SysRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <li>
      <span className={`sys-dot${ok ? " ok" : " warn"}`} />
      <span className="sys-label">{label}</span>
      <span className="sys-value">{value}</span>
    </li>
  );
}

/** Filled area trace of recent throughput. */
function Throughput({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const w = 300;
  const h = 64;
  const pts = values.map((v, i) => {
    const x = (i / Math.max(1, values.length - 1)) * w;
    const y = h - (v / max) * (h - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = `M ${pts.join(" L ")}`;
  const area = `${line} L ${w},${h} L 0,${h} Z`;
  const lastY = h - (values[values.length - 1] / max) * (h - 6) - 3;

  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="Rendimiento del bus">
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4DE1FF" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#4DE1FF" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#sparkFill)" />
      <path d={line} fill="none" stroke="#4DE1FF" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      <circle cx={w} cy={lastY} r="2.6" fill="#E8FCFF" />
    </svg>
  );
}
