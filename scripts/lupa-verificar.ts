/**
 * Verifica que el motor encuentra EXACTAMENTE los casos sembrados, ni más ni menos.
 *
 * Esto no es una suite de tests: es el guardián de la grabación. Si un número de
 * la pantalla deja de cuadrar con lo que Luis va a decir en voz alta, este script
 * lo dice aquí y no en mitad de una toma. Por eso comprueba caso por caso, con su
 * importe, y no «que haya hallazgos».
 *
 *   node --import ./scripts/resolver-ts.mjs scripts/lupa-verificar.ts
 */

import { construirLibro } from "../lib/lupa/dataset";
import { CATALOGO } from "../lib/lupa/catalogo";
import { auditar } from "../lib/lupa/motor";
import { cop, copCorto, numero, pctL } from "../lib/lupa/moneda";
import type { Hallazgo, Informe } from "../lib/lupa/tipos";

/* ─────────────────────────  Los 18 casos del contrato  ─────────────────────────
   Un caso se identifica por las reglas que tiene que disparar y por el sujeto al
   que apuntan. El importe se mide sobre ese conjunto: `max` cuando varias reglas
   miran la misma fuga desde ángulos distintos (el sobrecosto del aceite lo ven
   tres), `suma` cuando son piezas complementarias de un mismo agujero.
   ---------------------------------------------------------------------------- */

type Caso = {
  id: string;
  titulo: string;
  /** Todas tienen que producir al menos un hallazgo en el informe. */
  reglas: string[];
  /** Acota el conjunto que se mide (el sujeto al que apunta el caso). */
  sujeto?: (h: Hallazgo) => boolean;
  /** «Aparece exactamente una vez»: cuántos hallazgos deja la regla ancla. */
  cuenta: { regla: string; n: number };
  monto?: { valor: number; tol: number; modo: "max" | "suma" };
  extra?: (hs: Hallazgo[]) => string | null;
};

const esSujeto =
  (...ids: string[]) =>
  (h: Hallazgo) =>
    h.sujeto !== null && ids.includes(h.sujeto.id);

const CASOS: Caso[] = [
  {
    id: "S1",
    titulo: "Insumos Cordillera: proveedor exprés con la cuenta de la empleada de compras",
    reglas: ["R08", "R09", "R02", "R44", "R42"],
    sujeto: esSujeto("PRV-047"),
    cuenta: { regla: "R08", n: 1 },
    monto: { valor: 19_400_000, tol: 0.03, modo: "max" },
  },
  {
    id: "S2",
    titulo: "Pago duplicado a Empaques del Norte",
    reglas: ["R01"],
    sujeto: (h) => h.reglaId === "R01" && h.semaforo !== "verde",
    cuenta: { regla: "R01", n: 1 },
    monto: { valor: 3_200_000, tol: 0.03, modo: "max" },
  },
  {
    id: "S3",
    titulo: "Seis órdenes de compra el mismo día justo bajo el umbral",
    reglas: ["R11", "R41"],
    sujeto: (h) => h.reglaId === "R11",
    cuenta: { regla: "R11", n: 1 },
    monto: { valor: 28_800_000, tol: 0.03, modo: "max" },
  },
  {
    id: "S4",
    titulo: "Sobrecosto progresivo del aceite ACE-1000",
    reglas: ["R20", "R21", "R30"],
    sujeto: esSujeto("ACE-1000", "PRV-008"),
    cuenta: { regla: "R20", n: 1 },
    monto: { valor: 42_000_000, tol: 0.25, modo: "max" },
  },
  {
    id: "S5",
    titulo: "Merma recurrente del arroz en Guayabal",
    reglas: ["R26"],
    sujeto: esSujeto("ARR-500", "BOD-02", "BOD-02 Guayabal"),
    cuenta: { regla: "R26", n: 1 },
    monto: { valor: 9_200_000, tol: 0.25, modo: "max" },
  },
  {
    id: "S6",
    titulo: "Seis notas crédito de jvargas sobre cartera vencida",
    reglas: ["R12", "R13", "R45"],
    sujeto: (h) => h.reglaId === "R12",
    cuenta: { regla: "R12", n: 1 },
    monto: { valor: 12_400_000, tol: 0.03, modo: "max" },
  },
  {
    id: "S7",
    titulo: "Falso positivo: dos pagos iguales con dos facturas distintas",
    reglas: ["R01"],
    sujeto: (h) => h.reglaId === "R01" && h.semaforo === "verde",
    cuenta: { regla: "R01", n: 1 },
    extra: (hs) => (hs[0]?.semaforo === "verde" ? null : "el falso positivo no está en verde"),
  },
  {
    id: "S8",
    titulo: "Pago tras el cambio de cuenta de Suministros del Valle",
    reglas: ["R07"],
    sujeto: (h) => h.reglaId === "R07",
    cuenta: { regla: "R07", n: 1 },
    monto: { valor: 8_400_000, tol: 0.03, modo: "max" },
  },
  {
    id: "S9",
    titulo: "Débitos bancarios sin ningún documento detrás",
    reglas: ["R14"],
    sujeto: (h) => h.reglaId === "R14",
    cuenta: { regla: "R14", n: 1 },
    monto: { valor: 18_600_000, tol: 0.25, modo: "max" },
  },
  {
    id: "S10",
    titulo: "Facturas de compra pagadas sin entrada de inventario",
    reglas: ["R03"],
    sujeto: (h) => h.reglaId === "R03",
    cuenta: { regla: "R03", n: 1 },
    monto: { valor: 14_300_000, tol: 0.25, modo: "max" },
  },
  {
    id: "S11",
    titulo: "Ventas por debajo del margen mínimo",
    reglas: ["R22"],
    sujeto: (h) => h.reglaId === "R22",
    cuenta: { regla: "R22", n: 1 },
    monto: { valor: 9_100_000, tol: 0.25, modo: "max" },
  },
  {
    id: "S12",
    titulo: "Descuentos de lramos fuera de política",
    reglas: ["R23"],
    sujeto: (h) => h.reglaId === "R23",
    cuenta: { regla: "R23", n: 1 },
    monto: { valor: 7_400_000, tol: 0.25, modo: "max" },
  },
  {
    id: "S13",
    titulo: "Recompras con el stock todavía lleno",
    reglas: ["R25"],
    sujeto: (h) => h.reglaId === "R25",
    cuenta: { regla: "R25", n: 1 },
    monto: { valor: 4_900_000, tol: 0.25, modo: "max" },
  },
  {
    id: "S14",
    titulo: "Huecos en los consecutivos de recibo de caja",
    reglas: ["R06"],
    sujeto: (h) => h.reglaId === "R06",
    // Dos series con huecos, dos hallazgos: los recibos de caja y las facturas
    // de venta. Es como lo describe el contrato, no un hallazgo repetido.
    cuenta: { regla: "R06", n: 2 },
    extra: (hs) =>
      hs.every((h) => h.montoExacto === false) ? null : "el monto de los huecos tendría que ir marcado como estimado",
  },
  {
    id: "S15",
    titulo: "Terceros sin NIT válido",
    reglas: ["R10"],
    sujeto: (h) => h.reglaId === "R10",
    cuenta: { regla: "R10", n: 1 },
  },
  {
    id: "S16",
    titulo: "Ventas sin salida de inventario y salidas huérfanas",
    reglas: ["R04", "R05"],
    sujeto: (h) => h.reglaId === "R04" || h.reglaId === "R05",
    cuenta: { regla: "R04", n: 1 },
    monto: { valor: 6_800_000, tol: 0.25, modo: "suma" },
  },
  {
    id: "S17",
    titulo: "Clientes con crédito muy por encima de la política",
    reglas: ["R28"],
    sujeto: (h) => h.reglaId === "R28",
    cuenta: { regla: "R28", n: 1 },
    extra: (hs) => (hs[0]?.semaforo === "amarillo" ? null : `la cartera expuesta debería quedar en amarillo, no en ${hs[0]?.semaforo}`),
  },
  {
    id: "S18",
    titulo: "Anomalías estadísticas: horario, atípicos y Benford",
    reglas: ["R40", "R42", "R43"],
    sujeto: (h) => h.reglaId === "R40",
    cuenta: { regla: "R40", n: 1 },
    extra: (hs) => (hs.every((h) => h.capa === 3 && h.semaforo !== "rojo") ? null : "una anomalía de capa 3 se coló en rojo"),
  },
];

const NO_EVALUABLES = ["R24", "R27", "R29"];

/** Los cuatro sujetos que tienen que acabar como hallazgo compuesto. */
const COMPUESTOS: { etiqueta: string; ids: string[] }[] = [
  { etiqueta: "PRV-047 · Insumos Cordillera", ids: ["PRV-047"] },
  { etiqueta: "jvargas · notas crédito", ids: ["jvargas"] },
  { etiqueta: "ACE-1000 / PRV-008 · sobrecosto del aceite", ids: ["ACE-1000", "PRV-008"] },
  { etiqueta: "PRV-023 · compra fraccionada", ids: ["PRV-023"] },
];

/* ────────────────────────────────  Comprobación  ──────────────────────────── */

const fallos: string[] = [];
const fallo = (m: string) => fallos.push(m);
const exigir = (cond: boolean, m: string) => {
  if (!cond) fallo(m);
};

const libro = construirLibro();
const informe = auditar(libro);
const individuales = informe.hallazgos.filter((h) => !h.compuesto);

/* 1 · Los 18 casos, uno por uno. */
for (const caso of CASOS) {
  for (const r of caso.reglas) {
    const n = individuales.filter((h) => h.reglaId === r).length;
    exigir(n > 0, `${caso.id}: la regla ${r} no encontró nada (${caso.titulo})`);
  }
  const conjunto = individuales.filter((h) => caso.reglas.includes(h.reglaId) && (!caso.sujeto || caso.sujeto(h)));
  const delAncla = conjunto.filter((h) => h.reglaId === caso.cuenta.regla);
  exigir(
    delAncla.length === caso.cuenta.n,
    `${caso.id}: ${caso.cuenta.regla} tendría que dejar ${caso.cuenta.n} hallazgo(s) para este caso y dejó ${delAncla.length} (${caso.titulo})`,
  );

  if (caso.monto && conjunto.length) {
    const medido =
      caso.monto.modo === "max"
        ? Math.max(...conjunto.map((h) => h.montoEnRiesgo))
        : conjunto.reduce((s, h) => s + h.montoEnRiesgo, 0);
    const desvio = Math.abs(medido - caso.monto.valor) / caso.monto.valor;
    exigir(
      desvio <= caso.monto.tol,
      `${caso.id}: el importe es ${cop(medido)} y el contrato pide ${cop(caso.monto.valor)} (±${Math.round(caso.monto.tol * 100)} %) — ${caso.titulo}`,
    );
  }

  if (caso.extra) {
    const msg = caso.extra(conjunto);
    if (msg) fallo(`${caso.id}: ${msg}`);
  }
}

/* 2 · Los cuatro compuestos, y los primeros de la lista. */
const compuestos = informe.hallazgos.filter((h) => h.compuesto);
exigir(compuestos.length === 4, `Compuestos: hay ${compuestos.length} y el contrato define 4`);
exigir(
  informe.hallazgos.slice(0, compuestos.length).every((h) => h.compuesto === true),
  "Compuestos: no van los primeros de la lista",
);
for (const c of COMPUESTOS) {
  const hay = compuestos.some((h) => h.sujeto !== null && c.ids.includes(h.sujeto.id));
  exigir(hay, `Compuestos: falta el de ${c.etiqueta}`);
}
const grafos = compuestos.filter((h) => h.grafo).length;
exigir(grafos >= 1, "Compuestos: ninguno trae grafo, y el de la cuenta compartida tiene que traerlo");

/* 3 · El falso positivo en verde. */
const verdesR01 = individuales.filter((h) => h.reglaId === "R01" && h.semaforo === "verde");
exigir(verdesR01.length === 1, `S7: tendría que haber 1 hallazgo de R01 en verde y hay ${verdesR01.length}`);

/* 4 · Cobertura: exactamente tres reglas no evaluables. */
for (const r of informe.resultados) {
  const debe = NO_EVALUABLES.includes(r.reglaId);
  if (debe) {
    exigir(r.estado === "no_evaluable", `Cobertura: ${r.reglaId} tendría que salir no evaluable y salió "${r.estado}"`);
    exigir(!!r.motivo, `Cobertura: ${r.reglaId} sale no evaluable sin explicar por qué`);
  } else {
    exigir(
      r.estado !== "no_evaluable",
      `Cobertura: ${r.reglaId} salió no evaluable — ${r.motivo ?? "sin motivo"}`,
    );
  }
}
exigir(informe.resultados.length === CATALOGO.length, `Cobertura: ${informe.resultados.length} resultados para ${CATALOGO.length} reglas`);

/* 5 · El titular. */
exigir(
  informe.pctFacturacion >= 3 && informe.pctFacturacion <= 5,
  `Titular: el riesgo es el ${pctL(informe.pctFacturacion)} de la facturación y tiene que caer entre 3,0 % y 5,0 %`,
);
exigir(informe.montoEnRiesgo > 0, "Titular: el monto en riesgo es cero");

/* 6 · Ningún hallazgo sin evidencia: lo que no es trazable no se enseña. */
for (const h of informe.hallazgos) {
  exigir(h.evidencia.length > 0, `Evidencia: ${h.id} (${h.reglaId}) no trae ni una fila de origen`);
  for (const e of h.evidencia) {
    exigir(
      !!e.archivo && !!e.hoja && e.fila > 0,
      `Evidencia: ${h.id} trae una fila sin origen completo (${e.archivo}/${e.hoja}/${e.fila})`,
    );
  }
}

/* 7 · El contador de la animación cierra en la cifra del titular. */
const ultimo = informe.eventos[informe.eventos.length - 1];
exigir(!!ultimo, "Eventos: el informe no trae ninguno");
if (ultimo) {
  exigir(
    ultimo.acumulado === informe.montoEnRiesgo,
    `Eventos: el contador cierra en ${cop(ultimo.acumulado)} y el titular dice ${cop(informe.montoEnRiesgo)}`,
  );
}
exigir(
  informe.eventos.every((e, i) => e.seq === i),
  "Eventos: la secuencia no es correlativa",
);
// A 180 ms por evento, la animación tiene que durar entre 16 y 20 segundos.
exigir(
  informe.eventos.length >= 90 && informe.eventos.length <= 110,
  `Eventos: son ${informe.eventos.length} y la animación necesita entre 90 y 110`,
);
exigir(
  informe.eventos.every((e, i) => i === 0 || e.acumulado >= informe.eventos[i - 1].acumulado),
  "Eventos: el acumulado baja en algún paso, y el contador de pantalla solo sube",
);

/* 8 · Dos tomas idénticas. */
const sinMs = (_: string, v: unknown) => (_ === "ms" ? undefined : v);
const segunda = auditar(construirLibro());
exigir(
  JSON.stringify(informe, sinMs) === JSON.stringify(segunda, sinMs),
  "Determinismo: dos auditorías seguidas dan informes distintos",
);

/* ─────────────────────────────────  Salida  ───────────────────────────────── */

const SEM = { rojo: "ROJO", amarillo: "AMAR", verde: "VERDE" } as const;
const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n));
const padL = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s.padStart(n));

console.log("");
console.log(`LUPA · ${informe.empresa} · ${informe.periodo.desde} → ${informe.periodo.hasta}`);
console.log(
  `Facturación ${copCorto(informe.facturacion)} · compras ${copCorto(informe.compras)} · ` +
    `${numero(libro.documentos.length)} documentos · ${numero(libro.lineas.length)} líneas · ` +
    `auditoría en ${informe.ms} ms`,
);
console.log("");
console.log(`${pad("#", 6)}${pad("SEM", 6)}${padL("SCORE", 6)}  ${pad("CAPA", 5)}${pad("REGLA", 6)}${padL("MONTO", 16)}  TÍTULO`);
console.log("─".repeat(120));
for (const h of informe.hallazgos) {
  console.log(
    `${pad(h.id, 6)}${pad(SEM[h.semaforo], 6)}${padL(String(h.score), 6)}  ${pad(String(h.capa), 5)}${pad(h.compuesto ? "COMP" : h.reglaId, 6)}` +
      `${padL(h.montoEnRiesgo ? cop(h.montoEnRiesgo) : "—", 16)}  ${h.titulo}`,
  );
}
console.log("─".repeat(120));
console.log(
  `Monto en riesgo (unión de documentos): ${cop(informe.montoEnRiesgo)}  ·  ${pctL(informe.pctFacturacion)} de la facturación`,
);
console.log(`Suma cruda de los hallazgos (solapa): ${cop(informe.sumaHallazgos)}`);
console.log(
  `Semáforo: ${informe.conteo.rojo} rojos · ${informe.conteo.amarillo} amarillos · ${informe.conteo.verde} verdes  ·  ` +
    `${informe.hallazgos.length} hallazgos · ${informe.eventos.length} eventos de reproducción`,
);
console.log("");
for (const c of informe.porCategoria) {
  console.log(`  ${pad(c.categoria, 12)}${padL(cop(c.monto), 16)}   ${c.hallazgos} hallazgo(s)`);
}
console.log("");
for (const r of informe.resultados.filter((x) => x.estado === "no_evaluable")) {
  console.log(`  ${r.reglaId} no evaluable · ${r.motivo ?? ""}`);
}
console.log("");

if (fallos.length) {
  console.log(`✗ ${fallos.length} comprobación(es) fallan:`);
  for (const f of fallos) console.log(`   · ${f}`);
  console.log("");
  process.exit(1);
}

console.log(`✓ ${CASOS.length} casos sembrados, 4 compuestos, cobertura, titular, evidencia y determinismo: todo cuadra.`);
console.log("");
