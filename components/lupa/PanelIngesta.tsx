"use client";

import { useMemo, useState } from "react";
import { CATALOGO, ETIQUETA_CAPA } from "@/lib/lupa/catalogo";
import { numero } from "@/lib/lupa/moneda";
import type { Incidencia } from "@/lib/lupa/ingesta";
import type { Libro } from "@/lib/lupa/tipos";
import type { Fase } from "./Lupa";
import { ETIQUETA_RAZON, type HojaMapeo } from "./mapeo-vista";

/* La entrada: arrastrar los ficheros, verlos leerse y confirmar que LUPA
   entendió las columnas de un ERP que no había visto nunca.

   El paso de mapeo parece burocracia y es justo lo contrario: es donde se ve
   que la herramienta no está atada a un ERP concreto. Por eso enseña la
   confianza de cada columna, incluidas las que no llegan al 100 %. */

const CAPAS = [1, 2, 3] as const;

export default function PanelIngesta({
  fase,
  libro,
  leidos,
  mapeos,
  incidencias,
  error,
  onSoltar,
  onAuditar,
}: {
  fase: Fase;
  libro: Libro | null;
  leidos: number;
  mapeos: HojaMapeo[];
  incidencias: Incidencia[];
  error: string | null;
  onSoltar: (archivos: FileList | File[]) => void;
  onAuditar: () => void;
}) {
  const [encima, setEncima] = useState(false);
  const [hoja, setHoja] = useState(0);

  const archivos = libro?.archivos ?? [];
  const visibles = archivos.slice(0, leidos);
  const filasTotales = archivos.reduce((s, a) => s + a.filas, 0);
  const errores = incidencias.filter((i) => i.gravedad === "error").length;
  const avisos = incidencias.filter((i) => i.gravedad === "aviso").length;

  const seleccionada = mapeos[Math.min(hoja, Math.max(0, mapeos.length - 1))];

  const columnasFlojas = useMemo(
    () => mapeos.reduce((s, h) => s + h.columnas.filter((c) => c.campo && c.confianza < 0.9).length, 0),
    [mapeos],
  );
  const columnasTotales = useMemo(
    () => mapeos.reduce((s, h) => s + h.columnas.filter((c) => c.campo).length, 0),
    [mapeos],
  );

  if (fase === "mapeo" && libro) {
    return (
      <main className="lupa-ingesta lupa-ingesta-mapeo">
        <section className="lupa-mapa">
          <div className="lupa-col-head">
            <span className="panel-label">
              Columnas reconocidas · {numero(columnasTotales)} en {mapeos.length} hojas
            </span>
          </div>

          <div className="lupa-mapa-cuerpo">
            <ul className="lupa-hojas">
              {mapeos.map((h, i) => (
                <li key={`${h.archivo}·${h.hoja}`}>
                  <button
                    type="button"
                    className={`lupa-hoja${i === hoja ? " on" : ""}`}
                    onClick={() => setHoja(i)}
                  >
                    <span className="lupa-hoja-archivo">{h.archivo}</span>
                    <strong>{h.hoja}</strong>
                    <span className="lupa-hoja-meta">
                      {h.tabla || "sin clasificar"} · {h.columnas.filter((c) => c.campo).length} columnas
                    </span>
                    <span className={`lupa-conf${h.minima < 0.9 ? " tibia" : ""}`}>
                      {Math.round(h.minima * 100)} %
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="lupa-columnas">
              <table className="lupa-tabla">
                <thead>
                  <tr>
                    <th>Col.</th>
                    <th>Columna en tu fichero</th>
                    <th />
                    <th>Campo de LUPA</th>
                    <th>Confianza</th>
                    <th>Por qué</th>
                  </tr>
                </thead>
                <tbody>
                  {seleccionada?.columnas.map((c) => (
                    <tr
                      key={`${c.letra}-${c.encabezado}`}
                      className={c.campo && c.confianza < 0.9 ? "tibia" : undefined}
                    >
                      <td className="lupa-letra">{c.letra}</td>
                      <td className="lupa-origen-col">{c.encabezado}</td>
                      <td className="lupa-flecha">→</td>
                      <td className="lupa-destino-col">{c.etiqueta || <em>sin usar</em>}</td>
                      <td className="lupa-conf-celda">
                        {c.campo ? (
                          <>
                            <span className="lupa-barrita">
                              <span style={{ width: `${Math.round(c.confianza * 100)}%` }} />
                            </span>
                            {Math.round(c.confianza * 100)} %
                          </>
                        ) : (
                          <span className="lupa-sin">—</span>
                        )}
                      </td>
                      <td className="lupa-razon">
                        <b>{ETIQUETA_RAZON[c.razon]}</b>
                        {c.porque ? ` · ${c.porque}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <aside className="lupa-listo">
          <div className="lupa-col-head">
            <span className="panel-label">Lo que entró</span>
          </div>
          <ul className="lupa-cifras">
            <Cifra n={numero(libro.terceros.length)} t="terceros" />
            <Cifra n={numero(libro.documentos.length)} t="documentos" />
            <Cifra n={numero(libro.lineas.length)} t="líneas de detalle" />
            <Cifra n={numero(libro.inventario.length)} t="movimientos de inventario" />
            <Cifra n={numero(libro.banco.length)} t="movimientos de banco" />
            <Cifra n={numero(libro.items.length)} t="productos" />
          </ul>

          <div className="lupa-integridad">
            <span className="panel-label">Validación de integridad</span>
            {incidencias.length === 0 ? (
              <p className="lupa-ok">Ninguna inconsistencia al leer los ficheros.</p>
            ) : (
              <>
                <p>
                  {errores > 0 ? <b className="lupa-rojo">{errores} errores</b> : null}
                  {errores > 0 && avisos > 0 ? " · " : null}
                  {avisos > 0 ? <b className="lupa-ambar">{avisos} avisos</b> : null}
                  {" antes de empezar. Ya son hallazgos: entran al informe."}
                </p>
                <ul className="lupa-incidencias">
                  {incidencias.slice(0, 6).map((i, n) => (
                    <li key={n} className={i.gravedad}>
                      <span>
                        {i.archivo} · {i.hoja}
                        {i.fila ? ` · fila ${i.fila}` : ""}
                      </span>
                      {i.texto}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <p className="lupa-nota-mapeo">
            {columnasFlojas === 0
              ? "Todas las columnas se reconocieron por coincidencia directa."
              : `${columnasFlojas} de ${columnasTotales} columnas se resolvieron por parecido y no por coincidencia exacta. Están marcadas arriba para que las revises antes de firmar nada.`}
          </p>

          <button type="button" className="lupa-cta" onClick={onAuditar}>
            Auditar {numero(libro.documentos.length)} documentos
          </button>
          <p className="lupa-pie-cta">
            31 reglas sobre {numero(filasTotales)} filas. Todo se calcula aquí, en tu navegador: ningún fichero sale
            de este equipo.
          </p>
        </aside>
      </main>
    );
  }

  return (
    <main className="lupa-ingesta">
      <section
        className={`lupa-soltar${encima ? " encima" : ""}${fase === "leyendo" ? " leyendo" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setEncima(true);
        }}
        onDragLeave={() => setEncima(false)}
        onDrop={(e) => {
          e.preventDefault();
          setEncima(false);
          onSoltar(e.dataTransfer.files);
        }}
      >
        {fase === "leyendo" ? (
          <div className="lupa-leyendo">
            <span className="panel-label">
              Leyendo · {leidos} de {archivos.length || "…"}
            </span>
            <ul className="lupa-archivos">
              {visibles.map((a) => (
                <li key={a.nombre}>
                  <span className="lupa-archivo-nombre">{a.nombre}</span>
                  <span className="lupa-archivo-meta">
                    {a.hojas.join(" · ")} — {numero(a.filas)} filas · {Math.round(a.bytes / 1024)} KB
                  </span>
                  <span className="lupa-archivo-aporta">{a.aporta.join(", ")}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            <MarcaLupa />
            <label className="lupa-soltar-texto">
              <strong>Arrastra aquí lo que te exporte tu ERP</strong>
              <span>Excel o CSV, tantos ficheros como quieras. Nada sale de este navegador.</span>
              <input
                type="file"
                multiple
                accept=".xlsx,.xls,.csv"
                onChange={(e) => e.target.files && onSoltar(e.target.files)}
              />
              <span className="lupa-soltar-boton">o elígelos</span>
            </label>
            {error ? <p className="lupa-error">{error}</p> : null}
          </>
        )}
      </section>

      <section className="lupa-capas">
        {CAPAS.map((capa) => {
          const reglas = CATALOGO.filter((r) => r.capa === capa);
          return (
            <article key={capa} className={`lupa-capa lupa-capa-${capa}`}>
              <span className="panel-label">
                Capa {capa} · {ETIQUETA_CAPA[capa]}
              </span>
              <strong>{reglas.length} reglas</strong>
              <p>
                {capa === 1
                  ? "Algo no cuadra documentalmente: un pago sin factura, una factura sin orden, un proveedor con la cuenta de un empleado."
                  : capa === 2
                    ? "El dinero no se comporta como debería: precios que se disparan, márgenes negativos, mermas que se repiten."
                    : "La forma de los datos llama la atención: Benford, montos redondos justo bajo el umbral, registros de madrugada."}
              </p>
              <ul>
                {reglas.slice(0, 6).map((r) => (
                  <li key={r.id}>
                    <b>{r.id}</b> {r.nombre}
                  </li>
                ))}
                {reglas.length > 6 ? <li className="lupa-mas">y {reglas.length - 6} más</li> : null}
              </ul>
            </article>
          );
        })}
      </section>
    </main>
  );
}

function Cifra({ n, t }: { n: string; t: string }) {
  return (
    <li>
      <strong>{n}</strong>
      <span>{t}</span>
    </li>
  );
}

/** La lupa sobre una rejilla de celdas: el objeto y lo que mira, en un trazo. */
function MarcaLupa() {
  return (
    <svg className="lupa-marca-svg" viewBox="0 0 120 120" aria-hidden="true">
      <g stroke="currentColor" fill="none" strokeWidth="1" opacity="0.28">
        {[24, 44, 64, 84].map((y) => (
          <line key={`h${y}`} x1="14" y1={y} x2="106" y2={y} />
        ))}
        {[24, 44, 64, 84].map((x) => (
          <line key={`v${x}`} x1={x} y1="14" x2={x} y2="106" />
        ))}
      </g>
      <circle cx="52" cy="52" r="27" fill="rgba(77,225,255,0.07)" stroke="currentColor" strokeWidth="2.5" />
      <line x1="71" y1="71" x2="96" y2="96" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M40 56 L48 46 L56 60 L64 40" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.85" />
    </svg>
  );
}
