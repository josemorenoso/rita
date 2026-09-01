"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ATRIBUCION_ESRI,
  ATRIBUCION_OSM,
  aPantalla,
  encuadrar,
  metrosPorPixel,
  teselasVisibles,
  type Vista,
} from "@/lib/rutas/mapa";
import { DEPOSITO } from "@/lib/rutas/datos";
import type { Pedido, Ruta } from "@/lib/rutas/tipos";

export interface RouteMapProps {
  pedidos: Pedido[];
  rutas: Ruta[];
  geometrias: Record<string, [number, number][]>;
  /** Prefijo de la clave de geometría: "kai", "llegada", "sectores-prio"… */
  metodo: string;
  colores: Record<string, string>;
  seleccion: string | null;
  /** Índices de pedido ya repartidos. Durante el reparto en vivo va creciendo. */
  asignados: Set<number>;
  /** Pedido bajo el cursor en la lista, para resaltarlo en el mapa. */
  resaltado: number | null;
  onSeleccionar: (vehiculoId: string | null) => void;
}

export default function RouteMap({
  pedidos,
  rutas,
  geometrias,
  metodo,
  colores,
  seleccion,
  asignados,
  resaltado,
  onSeleccionar,
}: RouteMapProps) {
  const caja = useRef<HTMLDivElement>(null);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const [medida, setMedida] = useState({ ancho: 0, alto: 0 });
  /** Teselas de Esri que fallaron: se sirven de OpenStreetMap oscurecido. */
  const [caidas, setCaidas] = useState<Set<string>>(new Set());

  // El tamaño lo manda el contenedor, igual que en la planta de la oficina.
  useLayoutEffect(() => {
    const el = caja.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setMedida({ ancho: el.clientWidth, alto: el.clientHeight });
    });
    ro.observe(el);
    setMedida({ ancho: el.clientWidth, alto: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // El encuadre se DERIVA del tamaño: mete la bodega y los 40 pedidos dentro con
  // margen. Calcularlo en un efecto y guardarlo en estado obligaría a un render
  // de más con el mapa en blanco.
  const vista: Vista | null = useMemo(
    () => (medida.ancho && medida.alto ? encuadrar([DEPOSITO, ...pedidos], medida.ancho, medida.alto) : null),
    [medida.ancho, medida.alto, pedidos],
  );

  // ── El dibujo: rutas, paradas y bodega sobre las teselas ──
  useEffect(() => {
    const cv = lienzo.current;
    if (!cv || !vista || !medida.ancho) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== medida.ancho * dpr || cv.height !== medida.alto * dpr) {
      cv.width = medida.ancho * dpr;
      cv.height = medida.alto * dpr;
    }
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, medida.ancho, medida.alto);

    const punto = (lat: number, lng: number) => aPantalla(lat, lng, vista, medida.ancho, medida.alto);

    // 1. Paradas todavía sin repartir: apagadas, para que se note cómo se encienden.
    for (let i = 0; i < pedidos.length; i++) {
      if (asignados.has(i)) continue;
      const p = punto(pedidos[i].lat, pedidos[i].lng);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(111,125,180,0.55)";
      ctx.fill();
    }

    // 2. Las rutas. Cada polilínea se dibuja cuatro veces, de fuera hacia dentro:
    //    halo, resplandor, trazo y núcleo claro. Es lo que hace que se lea como
    //    luz encima del mapa y no como una avenida más del callejero.
    const dibujables = rutas.filter((r) => r.seq.length);
    for (const r of dibujables) {
      const geo = geometrias[`${metodo}:${r.vehiculoId}`];
      if (!geo?.length) continue;
      const apagada = seleccion !== null && seleccion !== r.vehiculoId;
      const color = colores[r.vehiculoId] ?? "#9B7BFF";

      ctx.beginPath();
      geo.forEach(([lat, lng], k) => {
        const p = punto(lat, lng);
        if (k === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      if (apagada) {
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.14;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
        continue;
      }

      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.1;
      ctx.lineWidth = 14;
      ctx.stroke();
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.4;
      ctx.stroke();
    }

    // 3. Las paradas ya repartidas, con el color de su domiciliario y su número
    //    de orden dentro de la ruta.
    for (const r of dibujables) {
      const apagada = seleccion !== null && seleccion !== r.vehiculoId;
      const color = colores[r.vehiculoId] ?? "#9B7BFF";
      r.seq.forEach((i, orden) => {
        if (!asignados.has(i)) return;
        const p = punto(pedidos[i].lat, pedidos[i].lng);
        const grande = seleccion === r.vehiculoId || resaltado === i;
        ctx.globalAlpha = apagada && resaltado !== i ? 0.3 : 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, grande ? 9 : 5, 0, Math.PI * 2);
        ctx.fillStyle = "#070c22";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = color;
        ctx.stroke();
        if (grande) {
          ctx.fillStyle = color;
          ctx.font = "600 9px var(--font-mono), monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(orden + 1), p.x, p.y + 0.5);
        }
        ctx.globalAlpha = 1;
      });
    }

    // 4. La bodega, siempre encima y en el cian del bus de datos.
    const b = punto(DEPOSITO.lat, DEPOSITO.lng);
    ctx.globalCompositeOperation = "lighter";
    ctx.beginPath();
    ctx.arc(b.x, b.y, 16, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(77,225,255,0.18)";
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    ctx.beginPath();
    ctx.arc(b.x, b.y, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = "#4de1ff";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#05081a";
    ctx.stroke();
  }, [vista, medida, pedidos, rutas, geometrias, metodo, colores, seleccion, asignados, resaltado]);

  const teselas = vista ? teselasVisibles(vista, medida.ancho, medida.alto) : [];
  const escala = vista ? metrosPorPixel(vista.lat, Math.round(vista.zoom)) * 80 : 0;

  return (
    <div className="rutas-mapa" ref={caja}>
      <div className="rutas-teselas" aria-hidden>
        {teselas.map((t) => {
          const falla = caidas.has(t.clave);
          return (
            <img
              key={t.clave}
              src={falla ? t.respaldo : t.base}
              alt=""
              className={falla ? "tesela tesela-respaldo" : "tesela"}
              style={{ left: t.izquierda, top: t.arriba }}
              loading="eager"
              decoding="async"
              draggable={false}
              onError={() => setCaidas((s) => (s.has(t.clave) ? s : new Set(s).add(t.clave)))}
            />
          );
        })}
        {teselas.map((t) =>
          caidas.has(t.clave) ? null : (
            <img
              key={`${t.clave}-etq`}
              src={t.etiquetas}
              alt=""
              className="tesela tesela-etiquetas"
              style={{ left: t.izquierda, top: t.arriba }}
              loading="eager"
              decoding="async"
              draggable={false}
            />
          ),
        )}
      </div>

      <div className="rutas-velo" aria-hidden />
      <canvas ref={lienzo} className="rutas-lienzo" style={{ width: medida.ancho, height: medida.alto }} />

      {/* Los botones de ruta van en HTML, no pintados en el canvas: así se
          navegan con el teclado y los lee un lector de pantalla. */}
      <div className="rutas-leyenda">
        {rutas
          .filter((r) => r.seq.length)
          .map((r) => (
            <button
              key={r.vehiculoId}
              type="button"
              className={`rutas-chip${seleccion === r.vehiculoId ? " on" : ""}`}
              style={{ "--accent": colores[r.vehiculoId] } as React.CSSProperties}
              onClick={() => onSeleccionar(seleccion === r.vehiculoId ? null : r.vehiculoId)}
            >
              <i /> {r.vehiculoId}
            </button>
          ))}
      </div>

      {vista ? (
        <div className="rutas-escala" aria-hidden>
          <span style={{ width: 80 }} />
          {escala >= 1000 ? `${(escala / 1000).toFixed(1)} km` : `${Math.round(escala)} m`}
        </div>
      ) : null}

      <p className="rutas-credito">
        {caidas.size ? ATRIBUCION_OSM : ATRIBUCION_ESRI} · rutas por{" "}
        <a href="https://project-osrm.org" target="_blank" rel="noreferrer">
          OSRM
        </a>{" "}
        sobre{" "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          OpenStreetMap
        </a>
      </p>
    </div>
  );
}
