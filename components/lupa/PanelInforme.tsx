"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Anillo,
  Barras,
  BarraScore,
  Benford,
  GrafoVinculos,
  MatrizReglas,
  Reloj,
  SerieDePrecio,
  Waterfall,
} from "./graficos";
import { CATALOGO, ETIQUETA_CATEGORIA, REGLA } from "@/lib/lupa/catalogo";
import { cop, copCorto, fecha, numero, pctL } from "@/lib/lupa/moneda";
import type { CategoriaFuga, EstadoRegla, Hallazgo, Informe, Semaforo } from "@/lib/lupa/tipos";

/* El informe. La misma rejilla sirve para ver correr la auditoría y para
   leerla después: a la izquierda todo lo que se revisó, en el centro el
   detalle, a la derecha lo que se encontró.

   No hay salto de pantalla entre auditar y leer porque ese salto es justo el
   momento que se narra: la consola se apaga, se abre el hallazgo más grave y
   la cifra ya está arriba. */

const MARCA: Record<string, string> = { run: "▸", ok: "✓", hit: "✕", skip: "—" };

const ETIQUETA_SEMAFORO: Record<Semaforo, string> = {
  rojo: "Requiere acción",
  amarillo: "Revisar",
  verde: "Sin indicio",
};

export default function PanelInforme({
  informe,
  cursor,
  enVivo,
}: {
  informe: Informe;
  cursor: number;
  enVivo: boolean;
}) {
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Semaforo | "todos">("todos");

  const eventos = informe.eventos;
  const hasta = enVivo ? Math.min(cursor, eventos.length - 1) : eventos.length - 1;

  /** Lo que se ha visto hasta el cursor: estado de cada regla, hallazgos,
      acumulado y reparto por categoría. Todo sale de los eventos, así que el
      contador, la cascada y la rejilla no pueden contradecirse entre ellos. */
  const vivo = useMemo(() => {
    const estados: Record<string, EstadoRegla> = {};
    for (const r of CATALOGO) estados[r.id] = "pendiente";
    const encontrados: string[] = [];
    const porCategoria = new Map<CategoriaFuga, { monto: number; hallazgos: number }>();
    let acumulado = 0;
    let anterior = 0;

    for (let i = 0; i <= hasta; i++) {
      const e = eventos[i];
      if (e.marca === "ok") estados[e.reglaId] = "limpia";
      if (e.marca === "skip") estados[e.reglaId] = "no_evaluable";
      if (e.marca === "hit") {
        estados[e.reglaId] = "hallazgo";
        if (e.hallazgoId) encontrados.push(e.hallazgoId);
        if (e.categoria) {
          const previo = porCategoria.get(e.categoria) ?? { monto: 0, hallazgos: 0 };
          porCategoria.set(e.categoria, {
            monto: previo.monto + Math.max(0, e.acumulado - anterior),
            hallazgos: previo.hallazgos + 1,
          });
        }
      }
      acumulado = e.acumulado;
      anterior = e.acumulado;
    }

    // Sin reordenar: el Map conserva el orden en que apareció cada categoría y
    // la cascada se construye peldaño a peldaño según corre la auditoría. Ordenar
    // por monto haría bailar las barras a media narración.
    const datosCascada = [...porCategoria.entries()].map(([categoria, v]) => ({
      categoria,
      monto: v.monto,
      hallazgos: v.hallazgos,
    }));

    return { estados, encontrados, acumulado, datosCascada, activa: eventos[hasta]?.reglaId ?? null };
  }, [eventos, hasta]);

  const porId = useMemo(() => new Map(informe.hallazgos.map((h) => [h.id, h])), [informe.hallazgos]);

  /** Durante la auditoría manda el orden de llegada —se ve aparecer cada uno—;
      cuando termina, manda el score, que es el orden con el que se trabaja. */
  const lista = useMemo(() => {
    if (enVivo) {
      return vivo.encontrados
        .map((id) => porId.get(id))
        .filter((h): h is Hallazgo => !!h)
        .reverse();
    }
    return informe.hallazgos;
  }, [enVivo, vivo.encontrados, porId, informe.hallazgos]);

  const filtrada = filtro === "todos" ? lista : lista.filter((h) => h.semaforo === filtro);

  // Al terminar la auditoría se abre solo el hallazgo más grave: es el plano
  // que cierra ese tramo del vídeo.
  useEffect(() => {
    if (!enVivo && !seleccion && informe.hallazgos.length) setSeleccion(informe.hallazgos[0].id);
  }, [enVivo, seleccion, informe.hallazgos]);

  const abierto = seleccion ? (porId.get(seleccion) ?? null) : null;
  const consola = eventos.slice(Math.max(0, hasta - 15), hasta + 1).reverse();

  const noEvaluables = informe.resultados.filter((r) => r.estado === "no_evaluable");
  const evaluadas = informe.resultados.length - noEvaluables.length;
  const conteoVivo = useMemo(() => {
    const c = { rojo: 0, amarillo: 0, verde: 0 };
    for (const h of lista) c[h.semaforo]++;
    return c;
  }, [lista]);

  return (
    <main className="lupa-stage">
      {/* ── Izquierda: todo lo que se revisó, incluido lo que salió limpio ── */}
      <aside className="lupa-rail">
        <div className="lupa-col-head">
          <span className="panel-label">
            Reglas · {evaluadas} evaluadas de {informe.resultados.length}
          </span>
        </div>
        <MatrizReglas estados={vivo.estados} activa={enVivo ? vivo.activa : null} />

        <div className="lupa-cobertura">
          <div className="lupa-col-head">
            <span className="panel-label">Qué no se pudo revisar</span>
          </div>
          {noEvaluables.length === 0 ? (
            <p className="lupa-ok">Los datos alcanzaron para las 31 reglas.</p>
          ) : (
            <ul>
              {noEvaluables.map((r) => (
                <li key={r.reglaId}>
                  <b>
                    {r.reglaId} · {REGLA.get(r.reglaId)?.nombre}
                  </b>
                  <span>{r.motivo}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="lupa-cobertura-pie">
            Decirlo es parte del trabajo: una regla que no se pudo evaluar no es una regla que salió limpia.
          </p>
        </div>
      </aside>

      {/* ── Centro: la cifra, la cascada y, debajo, la consola o el detalle ── */}
      <section className="lupa-centro">
        <div className="lupa-banda">
          <div className="lupa-titular">
            <span className="panel-label">Dinero en riesgo detectado</span>
            <span className="lupa-titular-pie">
              {pctL((vivo.acumulado / informe.facturacion) * 100)} de {copCorto(informe.facturacion)} facturados en
              el período · sin contar dos veces ningún documento
            </span>
            {!enVivo ? (
              <button type="button" className="lupa-exportar" onClick={() => window.print()}>
                Exportar el informe ↧
              </button>
            ) : null}
          </div>

          <div className="lupa-cascada">
            <span className="panel-label">De dónde sale</span>
            <Waterfall datos={vivo.datosCascada} total={Math.max(1, vivo.acumulado)} />
          </div>

          <div className="lupa-semaforo">
            <span className="panel-label">Hallazgos</span>
            <Anillo rojo={conteoVivo.rojo} amarillo={conteoVivo.amarillo} verde={conteoVivo.verde} />
            <ul className="lupa-leyenda-semaforo">
              <li className="rojo">
                <b>{conteoVivo.rojo}</b> requieren acción
              </li>
              <li className="amarillo">
                <b>{conteoVivo.amarillo}</b> a revisar
              </li>
              <li className="verde">
                <b>{conteoVivo.verde}</b> sin indicio
              </li>
            </ul>
          </div>
        </div>

        {enVivo || !abierto ? (
          <div className="lupa-consola">
            <div className="lupa-col-head">
              <span className="panel-label">
                <i className="dot" /> Razonamiento en directo
              </span>
            </div>
            <ul>
              {consola.map((e) => (
                <li key={e.seq} className={`lupa-linea lupa-linea-${e.marca}`}>
                  <span className="lupa-linea-marca">{MARCA[e.marca]}</span>
                  <span className="lupa-linea-regla">{e.reglaId}</span>
                  {e.log}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <Detalle hallazgo={abierto} porId={porId} onIr={setSeleccion} />
        )}
      </section>

      {/* ── Derecha: los hallazgos ── */}
      <aside className="lupa-hallazgos">
        <div className="lupa-col-head lupa-col-head-filtros">
          <span className="panel-label">
            {filtrada.length} {filtrada.length === 1 ? "hallazgo" : "hallazgos"}
          </span>
          <div className="lupa-filtros">
            {(["todos", "rojo", "amarillo", "verde"] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={`lupa-filtro lupa-filtro-${f}${filtro === f ? " on" : ""}`}
                onClick={() => setFiltro(f)}
              >
                {f === "todos" ? "Todos" : f === "rojo" ? "Rojos" : f === "amarillo" ? "Amarillos" : "Verdes"}
              </button>
            ))}
          </div>
        </div>

        <ul className="lupa-lista">
          {filtrada.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                className={`lupa-tarjeta lupa-${h.semaforo}${seleccion === h.id ? " on" : ""}${
                  h.compuesto ? " compuesta" : ""
                }`}
                onClick={() => setSeleccion(h.id)}
              >
                <span className="lupa-tarjeta-top">
                  <i />
                  <span className="lupa-tarjeta-regla">
                    {h.compuesto ? "Compuesto" : h.reglaId} · capa {h.capa}
                  </span>
                  <span className="lupa-tarjeta-score">{h.score}</span>
                </span>
                <strong>{h.titulo}</strong>
                <span className="lupa-tarjeta-pie">
                  {h.montoEnRiesgo > 0
                    ? `${h.montoExacto ? "" : "≈ "}${cop(h.montoEnRiesgo)}`
                    : "sin monto directo"}{" "}
                  · {ETIQUETA_CATEGORIA[h.categoria]}
                </span>
                <BarraScore score={h.score} semaforo={h.semaforo} />
              </button>
            </li>
          ))}
          {filtrada.length === 0 ? <li className="lupa-vacio">Nada con ese color.</li> : null}
        </ul>
      </aside>

      {/* Lo que sale por la impresora. Vive fuera de pantalla y solo existe para
          el PDF: el informe completo, con TODOS los hallazgos y su evidencia,
          porque en pantalla solo hay abierto uno cada vez. */}
      {!enVivo ? <Impreso informe={informe} /> : null}
    </main>
  );
}

/* ─────────────────────────  La versión de papel  ───────────────────────── */

function Impreso({ informe }: { informe: Informe }) {
  const noEvaluables = informe.resultados.filter((r) => r.estado === "no_evaluable");
  const limpias = informe.resultados.filter((r) => r.estado === "limpia");

  return (
    <section className="lupa-impreso" aria-hidden="true">
      <header>
        <h1>Auditoría de fugas · {informe.empresa}</h1>
        <p>
          Período {fecha(informe.periodo.desde)} — {fecha(informe.periodo.hasta)} · {informe.resultados.length} reglas
          aplicadas sobre {numero(informe.hallazgos.length)} hallazgos
        </p>
        <div className="lupa-impreso-cifras">
          <div>
            <span>Dinero en riesgo detectado</span>
            <strong>{cop(informe.montoEnRiesgo)}</strong>
            <em>{pctL(informe.pctFacturacion)} de la facturación del período</em>
          </div>
          <div>
            <span>Facturación del período</span>
            <strong>{cop(informe.facturacion)}</strong>
            <em>compras: {cop(informe.compras)}</em>
          </div>
          <div>
            <span>Semáforo</span>
            <strong>
              {informe.conteo.rojo} · {informe.conteo.amarillo} · {informe.conteo.verde}
            </strong>
            <em>requieren acción · a revisar · sin indicio</em>
          </div>
        </div>
        <p className="lupa-impreso-aviso">
          LUPA señala transacciones, no personas. Cada hallazgo trae el hecho observado, la evidencia con su fichero y
          su fila, hipótesis ordenadas de la más inocente a la más grave, y qué revisar. La conclusión la saca quien
          lee, con los documentos delante. El total no suma dos veces un mismo documento aunque lo señalen varias
          reglas.
        </p>
      </header>

      {informe.hallazgos.map((h, i) => (
        <article key={h.id} className="lupa-impreso-hallazgo">
          <h2>
            {i + 1}. {h.titulo}
          </h2>
          <p className="lupa-impreso-meta">
            {h.compuesto ? "Hallazgo compuesto" : `${h.reglaId} · ${REGLA.get(h.reglaId)?.nombre ?? ""}`} · capa{" "}
            {h.capa} · {ETIQUETA_CATEGORIA[h.categoria]} · {ETIQUETA_SEMAFORO[h.semaforo].toUpperCase()} · score{" "}
            {h.score} · {h.montoEnRiesgo > 0 ? `${h.montoExacto ? "" : "≈ "}${cop(h.montoEnRiesgo)}` : "sin monto"}
          </p>
          <p>{h.resumen}</p>

          <h3>Qué puede estar pasando</h3>
          <ol>
            {h.quePuedeEstarPasando.map((t, n) => (
              <li key={n}>{t}</li>
            ))}
          </ol>

          <h3>Qué revisar</h3>
          <ul>
            {h.queRevisar.map((t, n) => (
              <li key={n}>{t}</li>
            ))}
          </ul>

          <h3>Control sugerido</h3>
          <p>{h.controlSugerido}</p>

          <h3>Evidencia</h3>
          <table>
            <thead>
              <tr>
                <th>Documento</th>
                <th>Número</th>
                <th>Fecha</th>
                <th>Tercero</th>
                <th>Monto</th>
                <th>Fichero · hoja · fila</th>
              </tr>
            </thead>
            <tbody>
              {h.evidencia.map((e, n) => (
                <tr key={n}>
                  <td>{e.documento}</td>
                  <td>{e.numero}</td>
                  <td>{fecha(e.fecha)}</td>
                  <td>{e.tercero}</td>
                  <td>{e.monto === null ? "—" : cop(e.monto)}</td>
                  <td>
                    {e.archivo} · {e.hoja} · fila {e.fila}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      ))}

      <article className="lupa-impreso-hallazgo">
        <h2>Cobertura de la revisión</h2>
        <h3>Lo que no se pudo evaluar</h3>
        {noEvaluables.length === 0 ? (
          <p>Los datos alcanzaron para las {informe.resultados.length} reglas.</p>
        ) : (
          <ul>
            {noEvaluables.map((r) => (
              <li key={r.reglaId}>
                <b>
                  {r.reglaId} · {REGLA.get(r.reglaId)?.nombre}
                </b>
                : {r.motivo}
              </li>
            ))}
          </ul>
        )}
        <h3>Reglas que se aplicaron y salieron limpias</h3>
        <p>
          {limpias.map((r) => `${r.reglaId} ${REGLA.get(r.reglaId)?.nombre} (${numero(r.revisados)} registros)`).join(" · ")}
        </p>
      </article>
    </section>
  );
}

/* ─────────────────────────────  El detalle  ───────────────────────────── */

function Detalle({
  hallazgo: h,
  porId,
  onIr,
}: {
  hallazgo: Hallazgo;
  porId: Map<string, Hallazgo>;
  onIr: (id: string) => void;
}) {
  const [abierta, setAbierta] = useState<number | null>(null);
  const def = REGLA.get(h.reglaId);
  const hijos = (h.hijos ?? []).map((id) => porId.get(id)).filter((x): x is Hallazgo => !!x);

  return (
    <article className={`lupa-detalle lupa-${h.semaforo}`} key={h.id}>
      <header className="lupa-detalle-head">
        <div>
          <span className="panel-label">
            {h.compuesto ? "Hallazgo compuesto" : `${h.reglaId} · ${def?.nombre ?? ""}`} · capa {h.capa} ·{" "}
            {ETIQUETA_CATEGORIA[h.categoria]}
          </span>
          <h2>{h.titulo}</h2>
          <p className="lupa-detalle-resumen">{h.resumen}</p>
        </div>
        <div className="lupa-detalle-cifra">
          <span className={`lupa-chip lupa-chip-${h.semaforo}`}>{ETIQUETA_SEMAFORO[h.semaforo]}</span>
          <strong>{h.montoEnRiesgo > 0 ? `${h.montoExacto ? "" : "≈ "}${cop(h.montoEnRiesgo)}` : "—"}</strong>
          <span className="lupa-detalle-pie">
            {h.montoExacto ? "monto exacto, sumado de los documentos" : "estimado a partir de la serie"}
          </span>
        </div>
      </header>

      <div className="lupa-detalle-score">
        <BarraScore score={h.score} semaforo={h.semaforo} />
        <span>
          score {h.score} = impacto {h.impacto} + confianza {h.confianza} + recurrencia {h.recurrencia}
        </span>
      </div>

      {hijos.length ? (
        <div className="lupa-hijos">
          <span className="panel-label">Se apoya en {hijos.length} hallazgos que caen sobre el mismo sujeto</span>
          <div>
            {hijos.map((c) => (
              <button key={c.id} type="button" className={`lupa-hijo lupa-${c.semaforo}`} onClick={() => onIr(c.id)}>
                <b>{c.reglaId}</b> {c.titulo}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {h.grafo ? (
        <div className="lupa-grafico lupa-grafico-ancho">
          <span className="panel-label">Cómo están conectados</span>
          <GrafoVinculos grafo={h.grafo} />
        </div>
      ) : null}

      {h.serie ? (
        <div className="lupa-grafico">
          <span className="panel-label">
            {h.serie.clase === "benford"
              ? "Primer dígito: observado contra lo esperado"
              : h.serie.clase === "precio"
                ? h.serie.etiqueta
                : h.serie.clase === "reloj"
                  ? "A qué hora se tecleó"
                  : "Reparto"}
          </span>
          {h.serie.clase === "benford" ? <Benford serie={h.serie} /> : null}
          {h.serie.clase === "precio" ? <SerieDePrecio serie={h.serie} /> : null}
          {h.serie.clase === "barras" ? <Barras serie={h.serie} /> : null}
          {h.serie.clase === "reloj" ? <Reloj serie={h.serie} /> : null}
        </div>
      ) : null}

      <div className="lupa-hipotesis">
        <span className="panel-label">Qué puede estar pasando</span>
        <ol>
          {h.quePuedeEstarPasando.map((t, i) => (
            <li key={i}>
              <span className="lupa-hipotesis-n">{i + 1}</span>
              <p>{t}</p>
            </li>
          ))}
        </ol>
        <p className="lupa-hipotesis-pie">
          Ordenadas de la explicación más inocente a la más grave. LUPA señala transacciones, no personas: la
          conclusión la sacas tú con la evidencia delante.
        </p>
      </div>

      <div className="lupa-acciones">
        <div className="lupa-revisar">
          <span className="panel-label">Qué revisar</span>
          <ul>
            {h.queRevisar.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
        <div className="lupa-control">
          <span className="panel-label">Control sugerido</span>
          <p>{h.controlSugerido}</p>
        </div>
      </div>

      <div className="lupa-evidencia">
        <span className="panel-label">
          Evidencia · {numero(h.evidencia.length)} filas con su fichero y su número de fila
          {h.documentos.length > h.evidencia.length
            ? ` · se muestran las primeras de ${numero(h.documentos.length)}`
            : ""}
        </span>
        <table className="lupa-tabla">
          <thead>
            <tr>
              <th>Documento</th>
              <th>Número</th>
              <th>Fecha</th>
              <th>Tercero</th>
              <th className="der">Monto</th>
              <th>De dónde sale</th>
            </tr>
          </thead>
          <tbody>
            {h.evidencia.map((e, i) => (
              <tr
                key={`${e.numero}-${i}`}
                className={abierta === i ? "abierta" : undefined}
                onClick={() => setAbierta(abierta === i ? null : i)}
              >
                <td>{e.documento}</td>
                <td className="lupa-mono">{e.numero}</td>
                <td>{fecha(e.fecha)}</td>
                <td>{e.tercero}</td>
                <td className="der lupa-mono">{e.monto === null ? "—" : cop(e.monto)}</td>
                <td className="lupa-traza">
                  <span>{e.archivo}</span>
                  <span>{e.hoja}</span>
                  <b>fila {numero(e.fila)}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {h.evidencia.some((e) => e.nota) ? (
          <ul className="lupa-notas-evidencia">
            {h.evidencia
              .map((e, i) => (e.nota ? { i, nota: e.nota, numero: e.numero } : null))
              .filter((x): x is { i: number; nota: string; numero: string } => !!x)
              .slice(0, 6)
              .map((x) => (
                <li key={x.i}>
                  <b>{x.numero}</b> {x.nota}
                </li>
              ))}
          </ul>
        ) : null}
      </div>
    </article>
  );
}
