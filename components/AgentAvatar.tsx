"use client";

import { useEffect, useRef } from "react";
import { SPRITE_H, SPRITE_W, drawCharacter, pixelPainter } from "@/lib/sprites";
import type { SpritePalette } from "@/lib/types";

/** The same pixel character as on the floor, blown up for the dossier header. */
export default function AgentAvatar({
  palette,
  mode = "work",
  size = 96,
}: {
  palette: SpritePalette;
  mode?: "work" | "walk" | "think" | "sync";
  size?: number;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const h = size;
    const w = Math.round((SPRITE_W / SPRITE_H) * h);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const scale = canvas.height / SPRITE_H;
    let raf = 0;
    let frame = 0;
    let last = performance.now();

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 190) return;
      last = now;
      frame = (frame + 1) % 4;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const put = pixelPainter(ctx, 0, 0, scale, 1);
      drawCharacter(put, palette, frame, mode);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [palette, mode, size]);

  return <canvas ref={ref} className="avatar-canvas" aria-hidden="true" />;
}
