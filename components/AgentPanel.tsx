"use client";

import Link from "next/link";
import AgentAvatar from "./AgentAvatar";
import AgentDiagram from "./AgentDiagram";
import { DEPT_BY_ID } from "@/lib/world";
import { dec, eur, hoursLabel, num, pct, tokensLabel } from "@/lib/format";
import type { AgentState } from "@/lib/types";

const MODE_LABEL: Record<AgentState["mode"], string> = {
  work: "Ejecutando",
  walk: "En movimiento",
  think: "Analizando",
  sync: "Sincronizando",
};

export default function AgentPanel({
  agent,
  onClose,
  huntHref,
  routeHref,
}: {
  agent: AgentState;
  onClose: () => void;
  /** Solo lo recibe el agente que sabe buscar clientes de verdad. */
  huntHref?: string;
  /** Solo lo recibe el agente que planifica rutas de verdad. */
  routeHref?: string;
}) {
  const d = agent.def;
  const dept = DEPT_BY_ID[d.dept];
  const accent = dept.accent;
  const runtimeSaved = agent.saved;
  const costPerRun = 0.041;

  return (
    <aside className="panel" style={{ "--accent": accent } as React.CSSProperties} key={d.id}>
      <button className="panel-close" onClick={onClose} aria-label="Cerrar ficha">
        ✕
      </button>

      <header className="panel-head">
        <div className="panel-avatar">
          <AgentAvatar palette={d.palette} mode={agent.mode} size={104} />
        </div>
        <div className="panel-id">
          <span className="panel-dept">{dept.name}</span>
          <h2>{d.name}</h2>
          <p className="panel-role">{d.role}</p>
          <div className="panel-tags">
            <span className="tag tag-live">
              <i className="dot" /> {MODE_LABEL[agent.mode]}
            </span>
            <span className="tag">{d.model}</span>
            <span className="tag">ID {d.id.toUpperCase()}</span>
          </div>
        </div>
      </header>

      {huntHref && (
        <section className="panel-hunt">
          <Link className="hunt-cta" href={huntHref}>
            ▶ Lanzar búsqueda de clientes
          </Link>
          <p>Busca negocios reales en el mapa, saca sus teléfonos y te los descarga en Excel.</p>
        </section>
      )}

      {huntHref && <AgentDiagram title="Así funciona por dentro" />}

      {routeHref && (
        <section className="panel-hunt">
          <Link className="hunt-cta" href={routeHref}>
            ▶ Abrir el reparto de hoy
          </Link>
          <p>
            Reparte 40 pedidos entre 6 domiciliarios y traza la ruta de cada uno sobre las calles reales de Medellín.
          </p>
        </section>
      )}

      <section className="panel-task">
        <span className="panel-label">Tarea en curso</span>
        <p>{agent.task}</p>
        <div className="progress">
          <div className="progress-fill" style={{ width: `${Math.round(agent.progress * 100)}%` }} />
        </div>
        <div className="panel-task-meta">
          <span>{Math.round(agent.progress * 100)} % completado</span>
          <span>~{d.avgRuntime} s por ejecución</span>
        </div>
      </section>

      <section className="stat-grid">
        <Stat label="Horas trabajadas hoy" value={hoursLabel(agent.hours)} hint="turno continuo" big />
        <Stat label="Ejecuciones totales" value={num(agent.runs)} hint={`+${num(agent.tasksToday)} hoy`} big />
        <Stat label="Tasa de éxito" value={pct(d.successRate)} hint="últimos 30 días" />
        <Stat label="Tokens procesados" value={tokensLabel(agent.tokens)} hint="acumulado" />
        <Stat label="Valor generado hoy" value={eur(agent.value)} hint="atribuido" accentValue />
        <Stat label="Horas humanas ahorradas" value={`${dec(runtimeSaved)} h`} hint="hoy" accentValue />
      </section>

      <section className="panel-block">
        <span className="panel-label">Actividad de las últimas 24 h</span>
        <div className="hours-chart" role="img" aria-label="Ejecuciones por hora en las últimas 24 horas">
          {agent.activity.map((v, i) => {
            const max = Math.max(...agent.activity, 1);
            return (
              <span
                key={i}
                className="hours-bar"
                style={{ height: `${Math.max(6, (v / max) * 100)}%`, opacity: i > 20 ? 0.45 : 1 }}
                title={`${String(i).padStart(2, "0")}:00 · ${v} ejecuciones`}
              />
            );
          })}
        </div>
        <div className="hours-axis">
          <span>00:00</span>
          <span>12:00</span>
          <span>23:00</span>
        </div>
      </section>

      <section className="panel-block">
        <span className="panel-label">Perfil</span>
        <p className="panel-bio">{d.bio}</p>
      </section>

      <section className="panel-block">
        <span className="panel-label">Capacidades</span>
        <ul className="skills">
          {d.skills.map((s) => (
            <li key={s.label}>
              <span className="skill-name">{s.label}</span>
              <span className="skill-track">
                <span className="skill-fill" style={{ width: `${s.value}%` }} />
              </span>
              <span className="skill-value">{s.value}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel-block">
        <span className="panel-label">Herramientas conectadas</span>
        <div className="chips">
          {d.tools.map((tool) => (
            <span className="chip" key={tool}>
              {tool}
            </span>
          ))}
        </div>
      </section>

      <footer className="panel-foot">
        <div>
          <span className="panel-label">Desplegado hace</span>
          <strong>{d.deployedDays} días</strong>
        </div>
        <div>
          <span className="panel-label">Coste por ejecución</span>
          <strong>{costPerRun.toFixed(3).replace(".", ",")} €</strong>
        </div>
        <div>
          <span className="panel-label">Cadencia media</span>
          <strong>1 cada {d.cadence} s</strong>
        </div>
      </footer>
    </aside>
  );
}

function Stat({
  label,
  value,
  hint,
  big,
  accentValue,
}: {
  label: string;
  value: string;
  hint?: string;
  big?: boolean;
  accentValue?: boolean;
}) {
  return (
    <div className={`stat${big ? " stat-big" : ""}`}>
      <span className="panel-label">{label}</span>
      <strong className={accentValue ? "accent" : undefined}>{value}</strong>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}
