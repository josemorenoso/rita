"use client";

/* ─────────────────────────  LOS GRÁFICOS DE LUPA  ─────────────────────────
   Lo que se ve a pantalla completa mientras alguien narra. La regla que
   ordena todo el fichero: aquí no se calcula negocio. Cada componente recibe
   cifras ya cerradas por el motor y solo decide dónde cae cada pixel; si un
   número no llega en las props, no sale en pantalla.

   Nada de librerías, nada de canvas: SVG en línea y CSS. Y nada de
   `Math.random` ni de relojes: la única fuente de tiempo es la marca que el
   navegador pasa a `requestAnimationFrame`, que solo mueve animaciones, nunca
   datos. Dos tomas del vídeo salen idénticas.

   Las coordenadas calculadas con trigonometría se redondean a dos decimales
   antes de escribirlas en un atributo: el servidor y el navegador tienen que
   generar exactamente la misma cadena o React se queja al hidratar.
   ------------------------------------------------------------------------- */

import { useRef, useState, useEffect, type CSSProperties, type MouseEvent } from "react";
import { COLOR_CATEGORIA, ETIQUETA_CAPA, ETIQUETA_CATEGORIA, POR_CAPA } from "@/lib/lupa/catalogo";
import { cop, copCorto, decimal, fecha, numero } from "@/lib/lupa/moneda";
import type { CategoriaFuga, EstadoRegla, Grafo, Semaforo, Serie } from "@/lib/lupa/tipos";
import "../../app/lupa-graficos.css";

/* ─────────────────────────────  utilidades  ───────────────────────────── */

const n2 = (v: number) => Math.round(v * 100) / 100;
const acotar = (v: number, min: number, max: number) => (v < min ? min : v > max ? max : v);

/** Punto de un círculo con el cero arriba y los grados creciendo a la derecha. */
function polar(cx: number, cy: number, r: number, grados: number) {
  const a = ((grados - 90) * Math.PI) / 180;
  return { x: n2(cx + r * Math.cos(a)), y: n2(cy + r * Math.sin(a)) };
}

const suma = (xs: number[]) => xs.reduce((s, v) => s + v, 0);

/* ═════════════════════════════  CONTADOR  ═════════════════════════════ */

const MS_CONTADOR = 600;

/**
 * La cifra que abre el informe. Sube desde donde estaba hasta donde le digan.
 *
 * El valor de partida se guarda en una ref y se va reescribiendo fotograma a
 * fotograma: durante la auditoría llegan subidas encadenadas y, si arrancara
 * siempre desde la última prop, el número daría un salto atrás visible cada
 * vez que un hallazgo pisa al anterior.
 */
export function Contador({ valor, activo, sufijo }: { valor: number; activo: boolean; sufijo?: string }) {
  const [mostrado, setMostrado] = useState(valor);
  const desde = useRef(valor);

  useEffect(() => {
    const inicio = desde.current;
    if (inicio === valor) return;
    let t0 = 0;
    let pedido = 0;
    const paso = (t: number) => {
      if (!t0) t0 = t;
      const k = acotar((t - t0) / MS_CONTADOR, 0, 1);
      const suavizado = 1 - Math.pow(1 - k, 3);
      const v = inicio + (valor - inicio) * suavizado;
      desde.current = k < 1 ? v : valor;
      setMostrado(desde.current);
      if (k < 1) pedido = requestAnimationFrame(paso);
    };
    pedido = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(pedido);
  }, [valor]);

  return (
    <div className="lupa-g lupa-g-contador">
      <span className="lupa-g-contador-cifra">{cop(mostrado)}</span>
      <span className={`lupa-g-contador-cursor${activo ? " late" : ""}`} aria-hidden="true" />
      {sufijo ? <span className="lupa-g-contador-sufijo">{sufijo}</span> : null}
    </div>
  );
}

/* ═════════════════════════════  WATERFALL  ═════════════════════════════ */

/**
 * La cascada del total. Se respeta el orden en que llegan las categorías: se
 * construye peldaño a peldaño según corre la auditoría, y reordenarla por
 * monto haría bailar las barras a media narración.
 */
export function Waterfall({
  datos,
  total,
}: {
  datos: { categoria: CategoriaFuga; monto: number; hallazgos: number }[];
  total: number;
}) {
  const acumuladoFinal = suma(datos.map((d) => d.monto));
  // La suma cruda puede pasarse del total: un documento señalado por dos
  // categorías suma dos veces aquí y una sola en la unión. La escala se toma
  // del mayor de los dos para que ningún peldaño se salga del carril.
  const base = Math.max(acumuladoFinal, total, 1);

  let corrido = 0;
  const peldanos = datos.map((d) => {
    const inicio = corrido;
    corrido += d.monto;
    return {
      ...d,
      izq: n2((inicio / base) * 100),
      ancho: n2((Math.max(d.monto, 0) / base) * 100),
    };
  });

  return (
    <div className="lupa-g lupa-g-wf">
      {peldanos.map((p) => (
        <div className="lupa-g-wf-fila" key={p.categoria}>
          <span className="lupa-g-wf-nombre">{ETIQUETA_CATEGORIA[p.categoria]}</span>
          <span className="lupa-g-wf-carril">
            <span
              className="lupa-g-wf-barra"
              style={
                {
                  left: `${p.izq}%`,
                  width: `${p.ancho}%`,
                  "--g-cat": COLOR_CATEGORIA[p.categoria],
                } as CSSProperties
              }
            />
          </span>
          <span className="lupa-g-wf-monto">{copCorto(p.monto)}</span>
          <span className="lupa-g-wf-conteo">{p.hallazgos}</span>
        </div>
      ))}

      <div className="lupa-g-wf-fila lupa-g-wf-total">
        <span className="lupa-g-wf-nombre">Monto en riesgo</span>
        <span className="lupa-g-wf-carril">
          <span className="lupa-g-wf-barra union" style={{ left: "0%", width: `${n2((total / base) * 100)}%` }} />
        </span>
        <span className="lupa-g-wf-monto">{copCorto(total)}</span>
        <span className="lupa-g-wf-conteo">{datos.reduce((s, d) => s + d.hallazgos, 0)}</span>
      </div>
    </div>
  );
}

/* ══════════════════════════════  ANILLO  ══════════════════════════════ */

const R_ANILLO = 62;
const C_ANILLO = n2(2 * Math.PI * R_ANILLO);

export function Anillo({ rojo, amarillo, verde }: { rojo: number; amarillo: number; verde: number }) {
  const total = rojo + amarillo + verde;
  const tramos: { clave: string; valor: number; color: string }[] = [
    { clave: "rojo", valor: rojo, color: "var(--g-rojo)" },
    { clave: "amarillo", valor: amarillo, color: "var(--g-ambar)" },
    { clave: "verde", valor: verde, color: "var(--g-verde)" },
  ];

  let recorrido = 0;
  return (
    <div className="lupa-g lupa-g-anillo">
      <svg viewBox="0 0 160 160" className="lupa-g-anillo-svg" role="img" aria-label={`${total} hallazgos`}>
        <circle cx="80" cy="80" r={R_ANILLO} className="lupa-g-anillo-pista" />
        {total > 0
          ? tramos.map((t) => {
              const largo = n2((t.valor / total) * C_ANILLO);
              const desfase = n2(-recorrido);
              recorrido += largo;
              if (t.valor === 0) return null;
              // Dos píxeles de aire entre tramos: sin ellos el rojo y el ámbar
              // se funden en un naranja que no dice nada a tres metros.
              const pintado = Math.max(largo - 2, 0.5);
              return (
                <circle
                  key={t.clave}
                  cx="80"
                  cy="80"
                  r={R_ANILLO}
                  className="lupa-g-anillo-tramo"
                  stroke={t.color}
                  strokeDasharray={`${pintado} ${n2(C_ANILLO - pintado)}`}
                  strokeDashoffset={desfase}
                />
              );
            })
          : null}
        <text x="80" y="76" className="lupa-g-anillo-cifra">
          {total}
        </text>
        <text x="80" y="94" className="lupa-g-anillo-pie">
          HALLAZGOS
        </text>
      </svg>
      <div className="lupa-g-anillo-chips">
        {tramos.map((t) => (
          <span className="lupa-g-chip" key={t.clave}>
            <i style={{ background: t.color }} />
            {t.valor}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════  BENFORD  ═════════════════════════════ */

/** Un dígito se marca cuando se pasa un 15 % del peso que le tocaba. Por
    debajo de ese margen la desviación es ruido de muestra, no una señal. */
const EXCESO_BENFORD = 1.15;

export function Benford({ serie }: { serie: Extract<Serie, { clase: "benford" }> }) {
  // Se normalizan las dos series por su propia suma: así da igual que lleguen
  // en conteos, en tantos por uno o en porcentaje, y siempre se comparan
  // participaciones contra participaciones.
  const sObs = suma(serie.observado) || 1;
  const sEsp = suma(serie.esperado) || 1;
  const obs = serie.observado.map((v) => v / sObs);
  const esp = serie.esperado.map((v) => v / sEsp);
  const tope = Math.max(...obs, ...esp) * 1.2 || 1;

  const x0 = 52;
  const x1 = 624;
  const yTop = 26;
  const yBase = 198;
  const paso = (x1 - x0) / 9;
  const anchoBarra = n2(paso * 0.5);
  const centro = (i: number) => n2(x0 + paso * (i + 0.5));
  const alY = (v: number) => n2(yBase - (v / tope) * (yBase - yTop));

  const rejilla = [0, 0.1, 0.2, 0.3].filter((v) => v <= tope);

  return (
    <div className="lupa-g lupa-g-benford">
      <svg viewBox="0 0 640 236" role="img" aria-label="Distribución del primer dígito frente a Benford">
        {rejilla.map((v) => (
          <g key={v}>
            <line x1={x0} x2={x1} y1={alY(v)} y2={alY(v)} className="lupa-g-rejilla" />
            <text x={x0 - 10} y={alY(v) + 3.5} className="lupa-g-eje der">
              {Math.round(v * 100)}%
            </text>
          </g>
        ))}

        {obs.map((v, i) => {
          const excedido = v > esp[i] * EXCESO_BENFORD;
          return (
            <rect
              key={i}
              x={n2(centro(i) - anchoBarra / 2)}
              y={alY(v)}
              width={anchoBarra}
              height={n2(yBase - alY(v))}
              className={`lupa-g-benford-barra${excedido ? " excedida" : ""}`}
            />
          );
        })}

        <polyline points={esp.map((v, i) => `${centro(i)},${alY(v)}`).join(" ")} className="lupa-g-benford-curva" />
        {esp.map((v, i) => (
          <circle key={i} cx={centro(i)} cy={alY(v)} r="3.2" className="lupa-g-benford-punto" />
        ))}

        <line x1={x0} x2={x1} y1={yBase} y2={yBase} className="lupa-g-base" />
        {obs.map((_, i) => (
          <text key={i} x={centro(i)} y={yBase + 18} className="lupa-g-eje medio">
            {i + 1}
          </text>
        ))}

        <text x={x1} y={16} className="lupa-g-benford-stat">
          {`χ² ${decimal(serie.chi2)} · n ${numero(serie.n)}`}
        </text>
        <text x={x0} y={yBase + 34} className="lupa-g-pie">
          barras: primer dígito observado · línea: lo que predice Benford
        </text>
      </svg>
    </div>
  );
}

/* ═══════════════════════════  SERIE DE PRECIO  ════════════════════════ */

export function SerieDePrecio({ serie }: { serie: Extract<Serie, { clase: "precio" }> }) {
  const puntos = serie.puntos;
  if (puntos.length === 0) return <div className="lupa-g lupa-g-vacio">sin puntos</div>;

  const x0 = 62;
  const x1 = 616;
  const yTop = 26;
  const yBase = 190;

  const valores = puntos.map((p) => p.valor);
  const minCrudo = Math.min(...valores, serie.referencia);
  const maxCrudo = Math.max(...valores, serie.referencia);
  const aire = (maxCrudo - minCrudo) * 0.18 || Math.max(maxCrudo * 0.1, 1);
  const min = minCrudo - aire;
  const max = maxCrudo + aire;

  const t0 = Date.parse(puntos[0].fecha.slice(0, 10));
  const t1 = Date.parse(puntos[puntos.length - 1].fecha.slice(0, 10));
  const span = t1 - t0;
  // Con una sola fecha —o todas iguales— el reparto proporcional divide por
  // cero; en ese caso los puntos se reparten a pasos iguales.
  const alX = (i: number) =>
    n2(span > 0 ? x0 + ((Date.parse(puntos[i].fecha.slice(0, 10)) - t0) / span) * (x1 - x0) : x0 + (i / Math.max(puntos.length - 1, 1)) * (x1 - x0));
  const alY = (v: number) => n2(yBase - ((v - min) / (max - min || 1)) * (yBase - yTop));

  const yRef = alY(serie.referencia);
  const vertices = puntos.map((p, i) => `${alX(i)},${alY(p.valor)}`);
  const linea = vertices.join(" ");
  // El sobrecosto es el área entre la línea y la referencia, pero solo por
  // encima: se recorta con un rectángulo que acaba en la referencia, de modo
  // que los tramos en los que el precio va por debajo no pintan nada.
  const area = [
    `M ${alX(0)},${yRef}`,
    ...vertices.map((v) => `L ${v}`),
    `L ${alX(puntos.length - 1)},${yRef}`,
    "Z",
  ].join(" ");
  const ultimo = puntos[puntos.length - 1];

  return (
    <div className="lupa-g lupa-g-precio">
      <svg viewBox="0 0 640 230" role="img" aria-label="Precio unitario frente a la referencia del mercado">
        <defs>
          <clipPath id="lupa-g-corte-sobrecosto">
            <rect x={x0} y={yTop - 6} width={n2(x1 - x0)} height={n2(yRef - yTop + 6)} />
          </clipPath>
        </defs>

        {[max, (max + min) / 2, min].map((v, i) => (
          <g key={i}>
            <line x1={x0} x2={x1} y1={alY(v)} y2={alY(v)} className="lupa-g-rejilla" />
            <text x={x0 - 10} y={alY(v) + 3.5} className="lupa-g-eje der">
              {copCorto(v)}
            </text>
          </g>
        ))}

        <rect x={x0} y={n2(yRef - 3)} width={n2(x1 - x0)} height="6" className="lupa-g-precio-banda" />
        <line x1={x0} x2={x1} y1={yRef} y2={yRef} className="lupa-g-precio-ref" />

        <path d={area} className="lupa-g-precio-sobrecosto" clipPath="url(#lupa-g-corte-sobrecosto)" />
        <polyline points={linea} className="lupa-g-precio-linea" />
        {puntos.map((p, i) => (
          <circle key={p.fecha + i} cx={alX(i)} cy={alY(p.valor)} r="2.8" className="lupa-g-precio-punto" />
        ))}
        <circle cx={alX(puntos.length - 1)} cy={alY(ultimo.valor)} r="4.6" className="lupa-g-precio-punto ultimo" />

        <text x={x1} y={n2(yRef - 9)} className="lupa-g-precio-etiqueta">
          {`${serie.etiqueta} · ${copCorto(serie.referencia)}`}
        </text>
        <text x={n2(alX(puntos.length - 1) - 8)} y={n2(alY(ultimo.valor) - 12)} className="lupa-g-precio-ultimo">
          {copCorto(ultimo.valor)}
        </text>

        <line x1={x0} x2={x1} y1={yBase} y2={yBase} className="lupa-g-base" />
        <text x={x0} y={yBase + 18} className="lupa-g-eje izq">
          {fecha(puntos[0].fecha)}
        </text>
        <text x={x1} y={yBase + 18} className="lupa-g-eje der">
          {fecha(ultimo.fecha)}
        </text>
      </svg>
    </div>
  );
}

/* ══════════════════════════════  BARRAS  ══════════════════════════════ */

export function Barras({ serie }: { serie: Extract<Serie, { clase: "barras" }> }) {
  const tope = Math.max(...serie.puntos.map((p) => Math.abs(p.valor)), 1);
  const formato = serie.unidad === "dinero" ? copCorto : numero;

  return (
    <div className="lupa-g lupa-g-barras">
      {serie.puntos.map((p, i) => (
        <div className={`lupa-g-barras-fila${p.marcado ? " marcada" : ""}`} key={`${p.etiqueta}-${i}`}>
          <span className="lupa-g-barras-nombre" title={p.etiqueta}>
            {p.etiqueta}
          </span>
          <span className="lupa-g-barras-carril">
            <span className="lupa-g-barras-barra" style={{ width: `${n2((Math.abs(p.valor) / tope) * 100)}%` }} />
          </span>
          <span className="lupa-g-barras-valor">{formato(p.valor)}</span>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════  RELOJ  ══════════════════════════════ */

const CX_RELOJ = 130;
const CY_RELOJ = 130;
const R_INTERIOR = 46;
const R_EXTERIOR = 114;

/** Sector de corona circular de una hora. */
function sectorHora(hora: number, r: number) {
  const a0 = hora * 15 - 7.5 + 0.7;
  const a1 = hora * 15 + 7.5 - 0.7;
  const pi0 = polar(CX_RELOJ, CY_RELOJ, R_INTERIOR, a0);
  const pi1 = polar(CX_RELOJ, CY_RELOJ, R_INTERIOR, a1);
  const pe0 = polar(CX_RELOJ, CY_RELOJ, r, a0);
  const pe1 = polar(CX_RELOJ, CY_RELOJ, r, a1);
  return `M ${pi0.x},${pi0.y} L ${pe0.x},${pe0.y} A ${n2(r)} ${n2(r)} 0 0 1 ${pe1.x},${pe1.y} L ${pi1.x},${pi1.y} A ${R_INTERIOR} ${R_INTERIOR} 0 0 0 ${pi0.x},${pi0.y} Z`;
}

/** El rótulo del sector más alto de fuera de jornada, pegado a su punta. */
function PicoReloj({ hora, valor, tope }: { hora: number; valor: number; tope: number }) {
  const r = R_INTERIOR + (valor / tope) * (R_EXTERIOR - R_INTERIOR);
  const p = polar(CX_RELOJ, CY_RELOJ, r + 13, hora * 15);
  return (
    <text x={p.x} y={n2(p.y + 3)} className="lupa-g-reloj-pico">
      {`${String(hora).padStart(2, "0")}:00 · ${valor}`}
    </text>
  );
}

export function Reloj({ serie }: { serie: Extract<Serie, { clase: "reloj" }> }) {
  const horas = serie.horas;
  const [inicio, fin] = serie.laboral;
  const tope = Math.max(...horas, 1);
  const total = suma(horas);

  const dentro = (h: number) => h >= inicio && h < fin;
  // Fuera de jornada es ámbar; la madrugada, roja. Un registro a las 19:00 es
  // una jornada larga, uno a las 03:00 no tiene ninguna lectura inocente.
  const claseHora = (h: number) => (dentro(h) ? "laboral" : h >= 22 || h < 5 ? "madrugada" : "fuera");

  // Solo se rotula el peor sector de fuera de jornada: con cuatro etiquetas
  // el radial deja de leerse de un golpe, que es justo lo que se le pide.
  let pico = -1;
  for (let h = 0; h < horas.length; h++) {
    if (dentro(h) || horas[h] === 0) continue;
    if (pico < 0 || horas[h] > horas[pico]) pico = h;
  }

  const arcoJornada = (() => {
    const p0 = polar(CX_RELOJ, CY_RELOJ, R_INTERIOR - 9, inicio * 15 - 7.5);
    const p1 = polar(CX_RELOJ, CY_RELOJ, R_INTERIOR - 9, fin * 15 - 7.5);
    const largo = (fin - inicio) * 15 > 180 ? 1 : 0;
    return `M ${p0.x},${p0.y} A ${R_INTERIOR - 9} ${R_INTERIOR - 9} 0 ${largo} 1 ${p1.x},${p1.y}`;
  })();

  return (
    <div className="lupa-g lupa-g-reloj">
      <svg viewBox="0 0 260 268" role="img" aria-label="Registros por hora del día">
        <circle cx={CX_RELOJ} cy={CY_RELOJ} r={R_EXTERIOR} className="lupa-g-reloj-borde" />
        <path d={arcoJornada} className="lupa-g-reloj-jornada" />

        {horas.map((v, h) => (
          <path
            key={h}
            d={sectorHora(h, v > 0 ? R_INTERIOR + (v / tope) * (R_EXTERIOR - R_INTERIOR) : R_INTERIOR + 2)}
            className={`lupa-g-reloj-sector ${v > 0 ? claseHora(h) : "cero"}`}
          />
        ))}

        {[0, 6, 12, 18].map((h) => {
          const p = polar(CX_RELOJ, CY_RELOJ, R_EXTERIOR + 14, h * 15);
          return (
            <text key={h} x={p.x} y={n2(p.y + 3.5)} className="lupa-g-reloj-hora">
              {String(h).padStart(2, "0")}
            </text>
          );
        })}

        {pico >= 0 ? <PicoReloj hora={pico} valor={horas[pico]} tope={tope} /> : null}

        <text x={CX_RELOJ} y={CY_RELOJ - 2} className="lupa-g-reloj-total">
          {numero(total)}
        </text>
        <text x={CX_RELOJ} y={CY_RELOJ + 14} className="lupa-g-reloj-pie">
          REGISTROS
        </text>
        <text x={CX_RELOJ} y="262" className="lupa-g-pie centro">
          {`jornada ${String(inicio).padStart(2, "0")}:00–${String(fin).padStart(2, "0")}:00`}
        </text>
      </svg>
    </div>
  );
}

/* ═══════════════════════════  GRAFO DE VÍNCULOS  ══════════════════════ */

type ClaseNodo = Grafo["nodos"][number]["clase"];

/** Manda en el desempate del centro y en el orden de los anillos: primero los
    actores, y los documentos siempre fuera. */
const PRIORIDAD_CLASE: Record<ClaseNodo, number> = {
  proveedor: 0,
  empleado: 1,
  usuario: 2,
  banco: 3,
  sku: 4,
  documento: 5,
};

const ROTULO_CLASE: Record<ClaseNodo, string> = {
  proveedor: "PROVEEDOR",
  empleado: "EMPLEADO",
  usuario: "USUARIO",
  banco: "CUENTA",
  sku: "PRODUCTO",
  documento: "DOCUMENTO",
};

const CX_GRAFO = 380;
const CY_GRAFO = 234;
const R_NODO = 25;

/** El dibujo de cada clase: forma e icono, sin una sola palabra. La imagen
    tiene que leerse en dos segundos y sin leyenda al lado. */
function FormaNodo({ clase }: { clase: ClaseNodo }) {
  switch (clase) {
    case "proveedor":
      return (
        <g>
          <rect x="-21" y="-16" width="42" height="32" rx="3" className="lupa-g-nodo-forma" />
          <path d="M -21 -6 L 0 -19 L 21 -6" className="lupa-g-nodo-glifo" />
          <path d="M -11 16 L -11 3 L -1 3 L -1 16 M 5 3 L 15 3 M 5 9 L 15 9" className="lupa-g-nodo-glifo" />
        </g>
      );
    case "empleado":
      return (
        <g>
          <circle r="20" className="lupa-g-nodo-forma" />
          <circle cy="-5" r="6" className="lupa-g-nodo-glifo" />
          <path d="M -10 12 A 10 10 0 0 1 10 12" className="lupa-g-nodo-glifo" />
        </g>
      );
    case "usuario":
      return (
        <g>
          <path d="M 0 -22 L 19 -11 L 19 11 L 0 22 L -19 11 L -19 -11 Z" className="lupa-g-nodo-forma" />
          <path d="M -8 -6 L -2 0 L -8 6 M 1 8 L 9 8" className="lupa-g-nodo-glifo" />
        </g>
      );
    case "documento":
      return (
        <g>
          <path d="M -14 -19 L 7 -19 L 15 -11 L 15 19 L -14 19 Z" className="lupa-g-nodo-forma" />
          <path d="M 7 -19 L 7 -11 L 15 -11 M -8 -2 L 9 -2 M -8 6 L 9 6 M -8 13 L 3 13" className="lupa-g-nodo-glifo" />
        </g>
      );
    case "sku":
      return (
        <g>
          <path d="M 0 -21 L 20 -9 L 20 10 L 0 22 L -20 10 L -20 -9 Z" className="lupa-g-nodo-forma" />
          <path d="M -20 -9 L 0 2 L 20 -9 M 0 2 L 0 22" className="lupa-g-nodo-glifo" />
        </g>
      );
    case "banco":
      return (
        <g>
          <rect x="-21" y="-18" width="42" height="36" rx="4" className="lupa-g-nodo-forma" />
          <path d="M -15 -6 L 0 -14 L 15 -6" className="lupa-g-nodo-glifo" />
          <path d="M -11 -2 L -11 9 M 0 -2 L 0 9 M 11 -2 L 11 9 M -15 13 L 15 13" className="lupa-g-nodo-glifo" />
        </g>
      );
  }
}

export function GrafoVinculos({ grafo }: { grafo: Grafo }) {
  const grado = new Map<string, number>();
  for (const n of grafo.nodos) grado.set(n.id, 0);
  for (const a of grafo.aristas) {
    grado.set(a.de, (grado.get(a.de) ?? 0) + 1);
    grado.set(a.a, (grado.get(a.a) ?? 0) + 1);
  }

  const porClase = (x: (typeof grafo.nodos)[number], y: (typeof grafo.nodos)[number]) =>
    PRIORIDAD_CLASE[x.clase] - PRIORIDAD_CLASE[y.clase] || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);

  // El centro es el nodo más conectado; los empates los rompen la clase y el
  // id, nunca el orden en que vinieron. Sin esto la misma toma sale distinta.
  const porGrado = [...grafo.nodos].sort((x, y) => (grado.get(y.id) ?? 0) - (grado.get(x.id) ?? 0) || porClase(x, y));
  const centro = porGrado[0];

  const resto = porGrado.slice(1);
  const actores = resto.filter((n) => n.clase !== "documento").sort(porClase);
  const papeles = resto.filter((n) => n.clase === "documento").sort(porClase);

  const posicion = new Map<string, { x: number; y: number }>();
  if (centro) posicion.set(centro.id, { x: CX_GRAFO, y: CY_GRAFO });

  const repartir = (lista: typeof resto, radio: number, desfase: number) => {
    lista.forEach((n, i) => {
      posicion.set(n.id, polar(CX_GRAFO, CY_GRAFO, radio, (i * 360) / lista.length + desfase));
    });
  };

  // Un anillo cuando no hay papeles que sacar fuera; dos cuando sí, para que la
  // trama de actores no quede enterrada entre facturas.
  if (papeles.length === 0) repartir(actores, 152, 0);
  else if (actores.length === 0) repartir(papeles, 176, 0);
  else {
    repartir(actores, 118, 0);
    repartir(papeles, 198, 180 / Math.max(papeles.length, 1));
  }

  const enAlerta = new Set<string>();
  for (const a of grafo.aristas) {
    if (!a.alerta) continue;
    enAlerta.add(a.de);
    enAlerta.add(a.a);
  }

  const aristas = grafo.aristas
    .map((a, i) => {
      const p = posicion.get(a.de);
      const q = posicion.get(a.a);
      if (!p || !q) return null;
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const largo = Math.hypot(dx, dy) || 1;
      const recorte = R_NODO + 4;
      return {
        clave: `${a.de}|${a.a}|${i}`,
        etiqueta: a.etiqueta,
        alerta: a.alerta === true,
        x1: n2(p.x + (dx / largo) * recorte),
        y1: n2(p.y + (dy / largo) * recorte),
        x2: n2(q.x - (dx / largo) * recorte),
        y2: n2(q.y - (dy / largo) * recorte),
        mx: n2((p.x + q.x) / 2),
        my: n2((p.y + q.y) / 2),
      };
    })
    .filter((a): a is NonNullable<typeof a> => a !== null);

  return (
    <div className="lupa-g lupa-g-grafo">
      <svg viewBox="0 0 760 480" role="img" aria-label="Vínculos del hallazgo compuesto">
        {aristas.map((a) => (
          <g key={a.clave} className={`lupa-g-arista${a.alerta ? " alerta" : ""}`}>
            <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} className="lupa-g-arista-linea" />
            {a.alerta ? <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} className="lupa-g-arista-recorrido" /> : null}
            <text x={a.mx} y={a.my - 5} className="lupa-g-arista-texto">
              {a.etiqueta}
            </text>
          </g>
        ))}

        {grafo.nodos.map((n) => {
          const p = posicion.get(n.id);
          if (!p) return null;
          const marcado = enAlerta.has(n.id);
          return (
            <g
              key={n.id}
              transform={`translate(${p.x} ${p.y})`}
              className={`lupa-g-nodo c-${n.clase}${marcado ? " marcado" : ""}`}
            >
              {marcado ? <circle r="32" className="lupa-g-nodo-halo" /> : null}
              <FormaNodo clase={n.clase} />
              <text y="42" className="lupa-g-nodo-etiqueta">
                {n.etiqueta}
              </text>
              <text y="56" className="lupa-g-nodo-clase">
                {ROTULO_CLASE[n.clase]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ═════════════════════════════  MATRIZ DE REGLAS  ═════════════════════ */

const ANCHO_PISTA = 260;

const ROTULO_ESTADO: Record<EstadoRegla, string> = {
  pendiente: "por correr",
  limpia: "limpia",
  hallazgo: "hallazgo",
  no_evaluable: "sin datos",
};

export function MatrizReglas({ estados, activa }: { estados: Record<string, EstadoRegla>; activa: string | null }) {
  const caja = useRef<HTMLDivElement>(null);
  const [pista, setPista] = useState<{ id: string; x: number; y: number } | null>(null);

  // El tooltip se coloca midiendo la celda en el momento de entrar: es la única
  // forma de que no se salga por el borde derecho sin saber cuántas columnas
  // decidió meter la rejilla en el ancho que le tocó.
  function entrar(e: MouseEvent<HTMLDivElement>, id: string) {
    const cont = caja.current;
    if (!cont) return;
    const celda = e.currentTarget.getBoundingClientRect();
    const marco = cont.getBoundingClientRect();
    const x = acotar(celda.left - marco.left + celda.width / 2 - ANCHO_PISTA / 2, 0, Math.max(marco.width - ANCHO_PISTA, 0));
    setPista({ id, x: n2(x), y: n2(celda.top - marco.top) });
  }

  const definicion = pista ? POR_CAPA.flatMap((c) => c.reglas).find((r) => r.id === pista.id) : undefined;

  return (
    <div className="lupa-g lupa-g-matriz" ref={caja} onMouseLeave={() => setPista(null)}>
      {POR_CAPA.map(({ capa, reglas }) => {
        const corridas = reglas.filter((r) => (estados[r.id] ?? "pendiente") !== "pendiente").length;
        return (
          <div className="lupa-g-matriz-capa" key={capa}>
            <div className="lupa-g-matriz-cabecera">
              <span className="lupa-g-matriz-nombre">
                <b>Capa {capa}</b> · {ETIQUETA_CAPA[capa]}
              </span>
              <span className="lupa-g-matriz-cuenta">
                {corridas}/{reglas.length}
              </span>
            </div>
            <div className="lupa-g-matriz-rejilla">
              {reglas.map((r) => {
                const estado = estados[r.id] ?? "pendiente";
                return (
                  <div
                    key={r.id}
                    className={`lupa-g-celda e-${estado}${activa === r.id ? " activa" : ""}`}
                    onMouseEnter={(e) => entrar(e, r.id)}
                  >
                    {r.id}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="lupa-g-matriz-leyenda">
        {(["pendiente", "limpia", "hallazgo", "no_evaluable"] as EstadoRegla[]).map((e) => (
          <span className="lupa-g-chip" key={e}>
            <i className={`lupa-g-muestra e-${e}`} />
            {ROTULO_ESTADO[e]}
          </span>
        ))}
      </div>

      {pista && definicion ? (
        <div className="lupa-g-pista" style={{ left: pista.x, top: pista.y, width: ANCHO_PISTA }}>
          <b>
            {definicion.id} · {definicion.nombre}
          </b>
          <span>{definicion.mira}</span>
        </div>
      ) : null}
    </div>
  );
}

/* ═══════════════════════════════  BARRA DE SCORE  ═════════════════════ */

export function BarraScore({ score, semaforo }: { score: number; semaforo: Semaforo }) {
  const v = acotar(score, 0, 100);
  return (
    <div className={`lupa-g lupa-g-score s-${semaforo}`}>
      <span className="lupa-g-score-carril">
        <span className="lupa-g-score-relleno" style={{ width: `${n2(v)}%` }} />
        <span className="lupa-g-score-marca" style={{ left: "40%" }} />
        <span className="lupa-g-score-marca" style={{ left: "70%" }} />
      </span>
      <span className="lupa-g-score-cifra">{Math.round(v)}</span>
    </div>
  );
}
