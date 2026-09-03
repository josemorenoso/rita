/* Diagnóstico temporal: mirar qué hay de verdad en el dataset antes de tocar
   ninguna regla. Se borra en cuanto se cierran los ajustes. */

import { construirLibro } from "../lib/lupa/dataset";

const libro = construirLibro();
const pol = libro.politicas!;
const nombres = new Map(libro.terceros.map((t) => [t.id, t.nombre]));
const docs = new Map(libro.documentos.map((d) => [d.id, d]));

console.log("umbral de aprobación:", pol.umbralAprobacion);

const ocs = libro.documentos.filter((d) => d.tipo === "orden_compra");
const porDia = new Map<string, typeof ocs>();
for (const o of ocs) {
  const k = `${o.terceroId}|${o.fecha}`;
  const l = porDia.get(k) ?? [];
  l.push(o);
  porDia.set(k, l);
}
const grupos = [...porDia.entries()].filter(([, l]) => l.length >= 3).sort((a, b) => b[1].length - a[1].length);
console.log("");
console.log("== grupos de >=3 OC al mismo proveedor el mismo día ==", grupos.length);
for (const [k, l] of grupos.slice(0, 6)) {
  console.log(k, "n=" + l.length, "suma=" + l.reduce((s, o) => s + o.montoTotal, 0), l.map((o) => o.montoTotal).join(","));
}

const lineasAce = libro.lineas.filter((l) => l.sku === "ACE-1000");
const porProv = new Map<string, number[]>();
for (const l of lineasAce) {
  const d = docs.get(l.documentoId);
  if (!d || d.tipo !== "factura_compra") continue;
  const p = porProv.get(d.terceroId ?? "?") ?? [];
  p.push(l.precioUnitario);
  porProv.set(d.terceroId ?? "?", p);
}
console.log("");
console.log("== ACE-1000: precio unitario por proveedor ==");
for (const [id, ps] of porProv) {
  ps.sort((a, b) => a - b);
  console.log(id, nombres.get(id), "n=" + ps.length, "min=" + ps[0], "mediana=" + ps[Math.floor(ps.length / 2)], "max=" + ps[ps.length - 1]);
}

const compras = libro.documentos.filter((d) => d.tipo === "orden_compra" || d.tipo === "factura_compra");
const franja = compras.filter((d) => d.montoTotal >= pol.umbralAprobacion * 0.85 && d.montoTotal < pol.umbralAprobacion);
const redondos = franja.filter((d) => d.montoTotal % 100000 === 0);
console.log("");
console.log("== franja 85-100% del umbral:", franja.length, "· redondos a 100k:", redondos.length);
for (const d of redondos.slice(0, 10)) {
  console.log(d.numero, d.montoTotal, d.fecha, nombres.get(d.terceroId ?? ""));
}

const cor = libro.terceros.find((t) => t.nombre.includes("Cordillera"));
const fc = libro.documentos.filter((d) => d.terceroId === cor?.id && d.tipo === "factura_compra");
console.log("");
console.log("== Cordillera ==", cor?.id, cor?.fechaCreacion, cor?.cuentaBancaria);
console.log("facturas:", fc.length, "suma:", fc.reduce((s, d) => s + d.montoTotal, 0));

const ferro = libro.terceros.find((t) => t.nombre.includes("Ferrocentro"));
const ocsFerro = ocs.filter((o) => o.terceroId === ferro?.id);
console.log("");
console.log("== Ferrocentro ==", ferro?.id, "órdenes:", ocsFerro.length);
const porFecha = new Map<string, number>();
for (const o of ocsFerro) porFecha.set(o.fecha, (porFecha.get(o.fecha) ?? 0) + 1);
console.log([...porFecha.entries()].filter(([, n]) => n > 1).map(([f, n]) => `${f}: ${n}`).join(" · ") || "ningún día con más de una");
console.log("montos:", ocsFerro.map((o) => o.montoTotal).join(","));

// Cuántos pares de OC bajo umbral que sumadas lo superan hay en total: la
// magnitud del falso positivo de R11.
let pares = 0;
const porProvOc = new Map<string, typeof ocs>();
for (const o of ocs) {
  const l = porProvOc.get(o.terceroId ?? "") ?? [];
  l.push(o);
  porProvOc.set(o.terceroId ?? "", l);
}
for (const [, l] of porProvOc) {
  const orden = [...l].sort((a, b) => a.fecha.localeCompare(b.fecha));
  for (let i = 0; i < orden.length; i++) {
    for (let j = i + 1; j < orden.length; j++) {
      const dd = (Date.parse(orden[j].fecha) - Date.parse(orden[i].fecha)) / 86400000;
      if (dd > 7) break;
      if (orden[i].montoTotal < pol.umbralAprobacion && orden[j].montoTotal < pol.umbralAprobacion) pares++;
    }
  }
}
console.log("");
console.log("== pares de OC bajo umbral en <=7 días (ruido natural):", pares);
