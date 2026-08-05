import type { SpritePalette } from "./types";

export const SPRITE_W = 10;
export const SPRITE_H = 14;

type Put = (x: number, y: number, w: number, h: number, color: string) => void;

/**
 * Builds a `put` that draws sprite-local pixels into a canvas at a given
 * origin and scale, rounding to device pixels so edges stay hard.
 */
export function pixelPainter(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  scale: number,
  facing: 1 | -1,
): Put {
  return (x, y, w, h, color) => {
    const lx = facing === 1 ? x : SPRITE_W - x - w;
    const px = Math.round(originX + lx * scale);
    const py = Math.round(originY + y * scale);
    const pw = Math.round(originX + (lx + w) * scale) - px;
    const ph = Math.round(originY + (y + h) * scale) - py;
    ctx.fillStyle = color;
    ctx.fillRect(px, py, pw, ph);
  };
}

const SHADE = "rgba(0,0,0,0.28)";
const EYE = "#171326";

/**
 * One pixel character. `frame` drives the walk cycle, `mode` swaps the arm
 * pose so a working agent visibly types and a walking one swings.
 */
export function drawCharacter(
  put: Put,
  p: SpritePalette,
  frame: number,
  mode: "work" | "walk" | "think" | "sync",
) {
  const step = frame % 4;
  const walking = mode === "walk";
  // Bob the whole body one pixel on the off-beats of the walk cycle.
  const bob = walking && (step === 1 || step === 3) ? 1 : 0;
  const y = (v: number) => v + bob;

  // Hair crown
  put(3, y(0), 4, 1, p.hair);
  put(2, y(1), 6, 1, p.hair);
  // Head
  put(2, y(2), 6, 1, p.skin);
  put(1, y(2), 1, 1, p.hair);
  put(8, y(2), 1, 1, p.hair);
  put(2, y(3), 6, 1, p.skin);
  put(1, y(3), 1, 1, p.hair);
  put(8, y(3), 1, 1, p.hair);
  put(3, y(3), 1, 1, EYE);
  put(6, y(3), 1, 1, EYE);
  put(3, y(4), 4, 1, p.skin);
  put(2, y(4), 1, 1, SHADE);
  put(7, y(4), 1, 1, SHADE);

  // Shoulders and torso
  put(2, y(5), 6, 1, p.top);
  put(2, y(6), 6, 1, p.top);
  put(2, y(7), 6, 1, p.accent);
  put(2, y(8), 6, 1, p.top);
  put(2, y(9), 6, 1, p.top);

  // Arms: typing when working, swinging when walking, resting otherwise.
  let armL = y(6);
  let armR = y(6);
  if (mode === "work") {
    armL = y(6) + (step < 2 ? 1 : 0);
    armR = y(6) + (step < 2 ? 0 : 1);
  } else if (walking) {
    armL = y(6) + (step === 1 ? 1 : 0);
    armR = y(6) + (step === 3 ? 1 : 0);
  } else if (mode === "think") {
    armL = y(5);
  }
  put(1, armL, 1, 3, p.top);
  put(1, armL + 3, 1, 1, p.skin);
  put(8, armR, 1, 3, p.top);
  put(8, armR + 3, 1, 1, p.skin);

  // Legs and shoes
  const legLift = walking ? (step === 1 ? 1 : step === 3 ? -1 : 0) : 0;
  const lL = y(10) + Math.max(0, legLift);
  const lR = y(10) + Math.max(0, -legLift);
  put(2, lL, 3, 3, p.bottom);
  put(5, lR, 3, 3, p.bottom);
  put(2, lL + 3, 3, 1, p.shoe);
  put(5, lR + 3, 3, 1, p.shoe);
}

/** Ground shadow, drawn before the body. */
export function drawShadow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  scale: number,
) {
  ctx.fillStyle = "rgba(3,6,20,0.45)";
  const w = Math.round(7 * scale);
  const h = Math.max(2, Math.round(1.6 * scale));
  ctx.fillRect(Math.round(cx - w / 2), Math.round(baseY - h / 2), w, h);
}
