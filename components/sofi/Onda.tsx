"use client";

import { useEffect, useRef } from "react";

/**
 * La onda de la llamada. Barras simétricas desde el centro que siguen el
 * espectro real del audio (voz grabada o WebRTC) y, cuando nadie habla,
 * respiran despacio para que la pantalla nunca parezca muerta.
 */
export default function Onda({
  frecuencias,
  activa,
  color = "#3FE38A",
  colorReposo = "#2A3568",
}: {
  /** Devuelve el espectro actual o null si no hay audio. */
  frecuencias: () => Uint8Array | null;
  activa: boolean;
  color?: string;
  colorReposo?: string;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const fref = useRef(frecuencias);
  fref.current = frecuencias;
  const activaRef = useRef(activa);
  activaRef.current = activa;

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let t = 0;
    let nivel = 0;

    const pintar = () => {
      raf = requestAnimationFrame(pintar);
      t += 0.035;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      ctx.clearRect(0, 0, w, h);

      const datos = activaRef.current ? fref.current() : null;
      const barras = 44;
      const ancho = Math.max(2 * dpr, w / (barras * 2.6));
      const hueco = ancho * 1.1;
      const centro = w / 2;

      // Energía media, suavizada, para teñir las barras según cuánto se habla.
      let suma = 0;
      if (datos && datos.length) {
        const n = Math.min(datos.length, 64);
        for (let i = 0; i < n; i++) suma += datos[i];
        suma = suma / n / 255;
      }
      nivel += (suma - nivel) * 0.18;

      for (let i = 0; i < barras; i++) {
        let v: number;
        if (datos && datos.length) {
          const idx = Math.min(datos.length - 1, Math.floor((i * (datos.length * 0.5)) / barras));
          v = (datos[idx] || 0) / 255;
        } else {
          v = 0.05 + 0.035 * Math.abs(Math.sin(t + i * 0.42));
        }
        const alto = Math.max(3 * dpr, Math.pow(v, 0.9) * h * 0.94);
        const y = (h - alto) / 2;
        const lejos = i / barras;
        ctx.globalAlpha = 0.95 - lejos * 0.55;
        ctx.fillStyle = datos && nivel > 0.02 ? color : colorReposo;
        redondo(ctx, centro + i * (ancho + hueco), y, ancho, alto, ancho / 2);
        if (i > 0) redondo(ctx, centro - i * (ancho + hueco) - ancho, y, ancho, alto, ancho / 2);
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(pintar);
    return () => cancelAnimationFrame(raf);
  }, [color, colorReposo]);

  return <canvas ref={ref} className="sofi-onda" aria-hidden="true" />;
}

function redondo(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}
