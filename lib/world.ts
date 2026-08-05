import type { Dept, DeptId } from "./types";

/** The floor is drawn in art units and scaled up with nearest-neighbour crispness. */
export const WORLD_W = 384;
export const WORLD_H = 216;

export const NEXUS = { x: 170, y: 88, w: 44, h: 40 };
export const NEXUS_CENTER = { x: NEXUS.x + NEXUS.w / 2, y: NEXUS.y + NEXUS.h / 2 };

export const DEPTS: Dept[] = [
  {
    id: "marketing",
    name: "MARKETING",
    code: "MKT",
    accent: "#FF5FA2",
    accentDim: "#8E2E5C",
    mission: "Demanda, marca y contenido en seis canales a la vez.",
    x: 14,
    y: 16,
    w: 146,
    h: 76,
    door: { side: "e", at: 54, span: 18 },
    cable: [
      { x: 160, y: 62 },
      { x: 184, y: 62 },
      { x: 184, y: 88 },
    ],
  },
  {
    id: "ventas",
    name: "VENTAS",
    code: "SLS",
    accent: "#3FE38A",
    accentDim: "#1B7048",
    mission: "Del primer contacto a la firma, sin huecos en el pipeline.",
    x: 224,
    y: 16,
    w: 146,
    h: 76,
    door: { side: "w", at: 54, span: 18 },
    cable: [
      { x: 224, y: 62 },
      { x: 200, y: 62 },
      { x: 200, y: 88 },
    ],
  },
  {
    id: "contabilidad",
    name: "CONTABILIDAD",
    code: "FIN",
    accent: "#FFC24B",
    accentDim: "#8A6212",
    mission: "Cierre continuo: cada euro conciliado el mismo día.",
    x: 14,
    y: 124,
    w: 146,
    h: 76,
    door: { side: "e", at: 22, span: 18 },
    cable: [
      { x: 160, y: 154 },
      { x: 184, y: 154 },
      { x: 184, y: 128 },
    ],
  },
  {
    id: "logistica",
    name: "LOGÍSTICA",
    code: "LOG",
    accent: "#9B7BFF",
    accentDim: "#4B3894",
    mission: "Stock, rutas y devoluciones bajo control en tiempo real.",
    x: 224,
    y: 124,
    w: 146,
    h: 76,
    door: { side: "w", at: 22, span: 18 },
    cable: [
      { x: 224, y: 154 },
      { x: 200, y: 154 },
      { x: 200, y: 128 },
    ],
  },
];

export const DEPT_BY_ID: Record<DeptId, Dept> = DEPTS.reduce((acc, d) => {
  acc[d.id] = d;
  return acc;
}, {} as Record<DeptId, Dept>);

export const ACCENT: Record<DeptId, string> = {
  marketing: "#FF5FA2",
  ventas: "#3FE38A",
  contabilidad: "#FFC24B",
  logistica: "#9B7BFF",
};

/** Total length of a cable polyline, used to place travelling light packets. */
export function cableLength(points: { x: number; y: number }[]) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.abs(points[i].x - points[i - 1].x) + Math.abs(points[i].y - points[i - 1].y);
  }
  return total;
}

/** Point at normalised distance t (0..1) along a polyline. */
export function pointOnCable(points: { x: number; y: number }[], t: number) {
  const total = cableLength(points);
  let travel = Math.max(0, Math.min(1, t)) * total;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const seg = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    if (travel <= seg || i === points.length - 1) {
      const k = seg === 0 ? 0 : travel / seg;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
    travel -= seg;
  }
  return points[points.length - 1];
}
