export type DeptId = "marketing" | "ventas" | "contabilidad" | "logistica";

export type Point = { x: number; y: number };

export interface SpritePalette {
  hair: string;
  skin: string;
  top: string;
  bottom: string;
  shoe: string;
  accent: string;
}

export interface Dept {
  id: DeptId;
  name: string;
  code: string;
  accent: string;
  accentDim: string;
  mission: string;
  /** Room rectangle in world (art) units. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Doorway on the wall that faces the NEXUS. */
  door: { side: "n" | "s" | "e" | "w"; at: number; span: number };
  /** Polyline the data bus follows, from room port to the NEXUS. */
  cable: Point[];
}

export interface AgentDef {
  id: string;
  name: string;
  role: string;
  dept: DeptId;
  bio: string;
  model: string;
  tools: string[];
  tasks: string[];
  palette: SpritePalette;
  /** Days since the agent was deployed. */
  deployedDays: number;
  /** All-time executions at t0. */
  baseRuns: number;
  /** Hours logged today at t0. */
  baseHours: number;
  /** Mean seconds between executions. */
  cadence: number;
  successRate: number;
  avgRuntime: number;
  /** Euros of value booked per execution (mean). */
  valuePerRun: number;
  /** Hours of human work replaced per execution (mean). */
  savedPerRun: number;
  skills: { label: string; value: number }[];
}

export interface AgentState {
  def: AgentDef;
  /** Position in world units (feet anchor). */
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  targetX: number;
  targetY: number;
  facing: 1 | -1;
  walk: number;
  mode: "work" | "walk" | "think" | "sync";
  modeUntil: number;
  bob: number;
  runs: number;
  hours: number;
  tasksToday: number;
  tokens: number;
  saved: number;
  value: number;
  task: string;
  progress: number;
  nextRun: number;
  flash: number;
  pulse: number;
  activity: number[];
}

export interface Packet {
  dept: DeptId;
  agentId: string;
  t: number;
  speed: number;
  value: number;
  saved: number;
  label: string;
}

export interface LogLine {
  id: number;
  at: number;
  dept: DeptId;
  agent: string;
  text: string;
  value: number;
}

export interface Metrics {
  revenueToday: number;
  pipeline: number;
  dealsToday: number;
  runsToday: number;
  runsAllTime: number;
  hoursSavedToday: number;
  hoursSavedAllTime: number;
  efficiency: number;
  successRate: number;
  agentCostToday: number;
  humanCostToday: number;
  ticketsResolved: number;
  invoicesCleared: number;
  shipmentsRouted: number;
  leadsQualified: number;
  throughput: number[];
  byDept: Record<DeptId, { runs: number; value: number; saved: number; load: number }>;
}

export interface Snapshot {
  agents: AgentState[];
  metrics: Metrics;
  log: LogLine[];
  uptime: number;
  clock: number;
  runsPerMin: number;
}
