import { ROSTER, AGENTS_BY_DEPT } from "./roster";
import { DEPTS, DEPT_BY_ID } from "./world";
import type { AgentState, DeptId, LogLine, Metrics, Packet, Snapshot } from "./types";

/** Simulated work hours accrue 12× faster than real time so counters visibly move. */
const HOUR_RATE = 12 / 3600;
const WALK_SPEED = 11; // art units per second
const PACKET_SECONDS = 1.35;

/** Stretches every agent's cadence so the floor reads as a small company. */
const CADENCE = 3;
/** Share of runs that book revenue. The rest produce work, not euros. */
const CONVERSION = 0.07;
/** What an hour of the human work being replaced would have cost. */
const HUMAN_RATE = 22;

/** Deterministic on first render (no RNG) so server and client markup agree. */
export function createAgents(): AgentState[] {
  const out: AgentState[] = [];
  for (const dept of DEPTS) {
    const members = AGENTS_BY_DEPT[dept.id];
    const cols = Math.ceil(members.length / 2);
    const interiorX = dept.x + 14;
    const interiorW = dept.w - 28;
    members.forEach((def, i) => {
      const row = i < cols ? 0 : 1;
      const col = row === 0 ? i : i - cols;
      const inRow = row === 0 ? cols : members.length - cols;
      const slotW = interiorW / inRow;
      const x = interiorX + slotW * col + slotW / 2;
      const y = dept.y + (row === 0 ? 36 : 68);
      out.push({
        def,
        x,
        y,
        homeX: x,
        homeY: y,
        targetX: x,
        targetY: y,
        facing: col % 2 === 0 ? 1 : -1,
        walk: i * 0.7,
        mode: "work",
        modeUntil: 4 + i * 0.9,
        bob: 0,
        runs: def.baseRuns,
        hours: def.baseHours,
        tasksToday: Math.round(def.baseHours * (3600 / (def.cadence * CADENCE)) * 0.06),
        tokens: def.baseRuns * 1840,
        saved: def.savedPerRun * 1.2,
        value: def.valuePerRun * 0.22,
        task: def.tasks[i % def.tasks.length],
        progress: ((i * 17) % 90) / 100,
        nextRun: 1 + (i % 7) * 0.8,
        flash: 0,
        pulse: 0,
        activity: Array.from({ length: 24 }, (_, h) => {
          const shape = Math.sin(((h - 5) / 24) * Math.PI * 2) * 0.5 + 0.5;
          const office = h >= 6 && h <= 21 ? 1 : 0.22;
          return Math.round((shape * 0.7 + 0.3) * office * (3600 / def.cadence) * 0.9);
        }),
      });
    });
  }
  return out;
}

export function createMetrics(agents: AgentState[]): Metrics {
  const runsAllTime = agents.reduce((s, a) => s + a.runs, 0);
  const byDept = {} as Metrics["byDept"];
  for (const d of DEPTS) {
    const members = agents.filter((a) => a.def.dept === d.id);
    byDept[d.id] = {
      runs: members.reduce((s, a) => s + a.tasksToday, 0),
      value: members.reduce((s, a) => s + a.value, 0),
      saved: members.reduce((s, a) => s + a.saved, 0),
      load: 0.62,
    };
  }
  return {
    revenueToday: agents.reduce((s, a) => s + a.value, 0),
    pipeline: 34_600,
    dealsToday: 4,
    runsToday: agents.reduce((s, a) => s + a.tasksToday, 0),
    runsAllTime,
    hoursSavedToday: agents.reduce((s, a) => s + a.saved, 0),
    hoursSavedAllTime: 5_240,
    efficiency: 94.2,
    successRate: 98.7,
    agentCostToday: 11,
    humanCostToday: 182,
    ticketsResolved: 44,
    invoicesCleared: 38,
    shipmentsRouted: 96,
    leadsQualified: 26,
    throughput: Array.from({ length: 64 }, (_, i) => 1.6 + Math.sin(i / 5) * 0.5 + (i % 3) * 0.12),
    byDept,
  };
}

const VERBS: Record<DeptId, string[]> = {
  marketing: ["campaña actualizada", "contenido publicado", "presupuesto reasignado", "creatividad aprobada"],
  ventas: ["oportunidad movida", "propuesta enviada", "lead cualificado", "reunión agendada"],
  contabilidad: ["asiento conciliado", "factura emitida", "desvío detectado", "impuesto revisado"],
  logistica: ["ruta recalculada", "stock repuesto", "envío rastreado", "devolución resuelta"],
};

/** Most runs move work forward rather than money, so each area reports in its own unit. */
const OUTPUTS: Record<DeptId, { unit: string; min: number; max: number }[]> = {
  marketing: [
    { unit: "piezas", min: 2, max: 9 },
    { unit: "visitas", min: 40, max: 320 },
    { unit: "anuncios", min: 1, max: 5 },
    { unit: "keywords", min: 4, max: 26 },
  ],
  ventas: [
    { unit: "leads", min: 1, max: 7 },
    { unit: "reuniones", min: 1, max: 2 },
    { unit: "propuestas", min: 1, max: 3 },
    { unit: "correos", min: 3, max: 18 },
  ],
  contabilidad: [
    { unit: "asientos", min: 4, max: 40 },
    { unit: "facturas", min: 1, max: 12 },
    { unit: "recibos", min: 2, max: 16 },
    { unit: "cuadres", min: 1, max: 4 },
  ],
  logistica: [
    { unit: "envíos", min: 3, max: 34 },
    { unit: "rutas", min: 1, max: 4 },
    { unit: "SKU", min: 2, max: 22 },
    { unit: "avisos", min: 1, max: 9 },
  ],
};

function workOutput(dept: DeptId) {
  const pool = OUTPUTS[dept];
  const o = pool[Math.floor(Math.random() * pool.length)] ?? pool[0];
  const n = o.min + Math.floor(Math.random() * (o.max - o.min + 1));
  return `${n} ${o.unit}`;
}

export class Simulation {
  agents = createAgents();
  metrics = createMetrics(this.agents);
  packets: Packet[] = [];
  log: LogLine[] = [];
  time = 0;
  /** Wall clock inside the simulation: starts at 09:14. */
  clock = 9 * 3600 + 14 * 60;
  private logId = 1;
  private runStamps: number[] = [];
  private effPhase = 0;

  constructor() {
    // Seed the feed so the first frame already looks alive.
    for (let i = 0; i < 8; i++) {
      const a = this.agents[(i * 3 + 1) % this.agents.length];
      this.pushLog(a, -i * 3, i === 2 ? a.def.valuePerRun * 0.08 : 0);
    }
  }

  private pushLog(a: AgentState, at: number, revenue: number) {
    const verbs = VERBS[a.def.dept];
    const verb = verbs[Math.floor(Math.random() * verbs.length)] ?? verbs[0];
    const money = revenue >= 1;
    this.log.unshift({
      id: this.logId++,
      at,
      dept: a.def.dept,
      agent: a.def.name,
      text: `${verb} · ${a.task}`,
      result: money ? `+${Math.round(revenue)} €` : workOutput(a.def.dept),
      isMoney: money,
    });
    if (this.log.length > 48) this.log.length = 48;
  }

  private fireRun(a: AgentState) {
    const def = a.def;
    a.runs += 1;
    a.tasksToday += 1;
    a.tokens += 900 + Math.floor(Math.random() * 3200);
    a.flash = 1;
    a.progress = 0;
    a.task = def.tasks[Math.floor(Math.random() * def.tasks.length)];
    a.nextRun = def.cadence * CADENCE * (0.65 + Math.random() * 0.8);

    // Only a minority of runs close money; the rest still save human hours.
    const converts = Math.random() < CONVERSION;
    const value = converts ? def.valuePerRun * 0.08 * (0.5 + Math.random() * 1.3) : 0;
    const saved = def.savedPerRun * 0.035 * (0.7 + Math.random() * 0.7);
    a.value += value;
    a.saved += saved;

    this.packets.push({
      dept: def.dept,
      agentId: def.id,
      t: 0,
      speed: 1 / (PACKET_SECONDS * (0.85 + Math.random() * 0.3)),
      value,
      saved,
      label: def.name,
    });
    this.pushLog(a, this.time, value);
    this.runStamps.push(this.time);

    // Stepping away from the desk after a run keeps the floor in motion.
    if (Math.random() < 0.22 && a.mode === "work") {
      const dept = DEPT_BY_ID[def.dept];
      a.targetX = dept.x + 18 + Math.random() * (dept.w - 36);
      a.targetY = dept.y + 30 + Math.random() * (dept.h - 46);
      a.mode = "walk";
    }
  }

  step(dt: number) {
    this.time += dt;
    this.clock += dt * 12;

    for (const a of this.agents) {
      const def = a.def;
      a.hours += HOUR_RATE * dt;
      a.flash = Math.max(0, a.flash - dt * 2.4);
      a.pulse += dt;

      a.nextRun -= dt;
      if (a.nextRun <= 0) this.fireRun(a);
      a.progress = Math.min(0.99, 1 - Math.max(0, a.nextRun) / (def.cadence * CADENCE * 1.1));

      if (a.mode === "walk") {
        const dx = a.targetX - a.x;
        const dy = a.targetY - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 1.2) {
          a.x = a.targetX;
          a.y = a.targetY;
          a.mode = Math.random() < 0.5 ? "think" : "work";
          a.modeUntil = this.time + 2 + Math.random() * 4;
        } else {
          a.x += (dx / dist) * WALK_SPEED * dt;
          a.y += (dy / dist) * WALK_SPEED * dt;
          if (Math.abs(dx) > 0.6) a.facing = dx > 0 ? 1 : -1;
          a.walk += dt * 7;
        }
      } else {
        if (this.time > a.modeUntil) {
          const awayFromDesk = Math.hypot(a.x - a.homeX, a.y - a.homeY) > 2;
          if (awayFromDesk) {
            a.targetX = a.homeX;
            a.targetY = a.homeY;
            a.mode = "walk";
          } else {
            a.mode = Math.random() < 0.8 ? "work" : "think";
            a.modeUntil = this.time + 3 + Math.random() * 6;
          }
        }
        a.walk += dt * (a.mode === "work" ? 4.5 : 1.6);
      }
    }

    // Light packets carry each execution to the NEXUS; metrics land on arrival.
    for (let i = this.packets.length - 1; i >= 0; i--) {
      const p = this.packets[i];
      p.t += p.speed * dt;
      if (p.t >= 1) {
        this.packets.splice(i, 1);
        this.applyArrival(p);
      }
    }

    this.effPhase += dt;
    const drift = Math.sin(this.effPhase / 9) * 1.1 + Math.sin(this.effPhase / 3.3) * 0.4;
    this.metrics.efficiency = Math.max(90, Math.min(97.8, 94.4 + drift));

    const cutoff = this.time - 60;
    while (this.runStamps.length && this.runStamps[0] < cutoff) this.runStamps.shift();

    // Throughput trace, one sample per ~0.5 s.
    const t = this.metrics.throughput;
    const rpm = this.runStamps.length;
    t.push(rpm / 60 + Math.random() * 0.2);
    if (t.length > 64) t.shift();

    for (const d of DEPTS) {
      const bucket = this.metrics.byDept[d.id];
      const members = this.agents.filter((a) => a.def.dept === d.id);
      const working = members.filter((a) => a.mode === "work").length / members.length;
      bucket.load += (working * 0.85 + 0.12 - bucket.load) * Math.min(1, dt * 1.6);
    }
  }

  private applyArrival(p: Packet) {
    const m = this.metrics;
    m.runsToday += 1;
    m.runsAllTime += 1;
    m.revenueToday += p.value;
    m.hoursSavedToday += p.saved;
    m.hoursSavedAllTime += p.saved;
    m.byDept[p.dept].runs += 1;
    m.byDept[p.dept].value += p.value;
    m.byDept[p.dept].saved += p.saved;
    m.agentCostToday += 0.004 + Math.random() * 0.009;

    switch (p.dept) {
      case "ventas":
        m.leadsQualified += Math.random() < 0.35 ? 1 : 0;
        m.pipeline += p.value * 6.5;
        if (p.value > 0 && Math.random() < 0.22) m.dealsToday += 1;
        break;
      case "contabilidad":
        m.invoicesCleared += Math.random() < 0.5 ? 1 : 0;
        break;
      case "logistica":
        m.shipmentsRouted += Math.random() < 0.6 ? 1 : 0;
        break;
      case "marketing":
        m.ticketsResolved += Math.random() < 0.2 ? 1 : 0;
        break;
    }
    m.humanCostToday += p.saved * HUMAN_RATE;
  }

  snapshot(): Snapshot {
    return {
      agents: this.agents,
      metrics: this.metrics,
      log: this.log,
      uptime: this.time,
      clock: this.clock,
      runsPerMin: this.runStamps.length,
    };
  }
}

export const TOTAL_AGENTS = ROSTER.length;
