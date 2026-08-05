"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Simulation } from "@/lib/sim";
import { DEPTS, NEXUS, WORLD_H, WORLD_W, pointOnCable } from "@/lib/world";
import { SPRITE_H, SPRITE_W, drawCharacter, drawShadow, pixelPainter } from "@/lib/sprites";
import type { AgentState, Snapshot } from "@/lib/types";

export type Selection = { kind: "agent"; id: string } | { kind: "nexus" } | null;

interface Props {
  selection: Selection;
  onSelect: (s: Selection) => void;
  onSnapshot: (s: Snapshot) => void;
  speed: number;
}

const WALL = "#1A2350";
const WALL_TOP = "#26326E";
const VOID_FLOOR = "#0A0F26";
const BUS = "#4DE1FF";

export default function OfficeFloor({ selection, onSelect, onSnapshot, speed }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simRef = useRef<Simulation | null>(null);
  const selRef = useRef<Selection>(selection);
  const speedRef = useRef(speed);
  const hoverRef = useRef<string | null>(null);
  const [hover, setHover] = useState<{ name: string; role: string; x: number; y: number } | null>(null);

  selRef.current = selection;
  speedRef.current = speed;

  if (simRef.current === null) simRef.current = new Simulation();

  const hitTest = useCallback((wx: number, wy: number): Selection => {
    const sim = simRef.current!;
    const sorted = [...sim.agents].sort((a, b) => b.y - a.y);
    for (const a of sorted) {
      if (wx >= a.x - 7 && wx <= a.x + 7 && wy >= a.y - SPRITE_H - 2 && wy <= a.y + 3) {
        return { kind: "agent", id: a.def.id };
      }
    }
    if (wx >= NEXUS.x - 4 && wx <= NEXUS.x + NEXUS.w + 4 && wy >= NEXUS.y - 6 && wy <= NEXUS.y + NEXUS.h + 4) {
      return { kind: "nexus" };
    }
    return null;
  }, []);

  const toWorld = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      wx: ((e.clientX - rect.left) / rect.width) * WORLD_W,
      wy: ((e.clientY - rect.top) / rect.height) * WORLD_H,
    };
  };

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d", { alpha: false })!;
    const sim = simRef.current!;
    let raf = 0;
    let last = performance.now();
    let sinceEmit = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(rect.width * dpr);
      const h = Math.round(rect.height * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      sim.step(dt * speedRef.current);

      sinceEmit += dt;
      if (sinceEmit > 0.2) {
        sinceEmit = 0;
        onSnapshot(sim.snapshot());
      }
      draw(ctx, canvas, sim, selRef.current, hoverRef.current);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [onSnapshot]);

  return (
    <div className="floor-wrap">
      <canvas
        ref={canvasRef}
        className="floor-canvas"
        onClick={(e) => {
          const { wx, wy } = toWorld(e);
          onSelect(hitTest(wx, wy));
        }}
        onMouseMove={(e) => {
          const { wx, wy } = toWorld(e);
          const hit = hitTest(wx, wy);
          const id = hit?.kind === "agent" ? hit.id : hit?.kind === "nexus" ? "__nexus" : null;
          hoverRef.current = id;
          if (id === null) {
            setHover(null);
          } else if (id === "__nexus") {
            setHover({ name: "NEXUS", role: "Centro de control", x: NEXUS.x + NEXUS.w / 2, y: NEXUS.y - 8 });
          } else {
            const a = simRef.current!.agents.find((s) => s.def.id === id)!;
            setHover({ name: a.def.name, role: a.def.role, x: a.x, y: a.y - SPRITE_H - 4 });
          }
        }}
        onMouseLeave={() => {
          hoverRef.current = null;
          setHover(null);
        }}
      />

      <div className="floor-overlay">
        {DEPTS.map((d) => (
          <div
            key={d.id}
            className="room-sign"
            style={
              {
                left: `${((d.x + d.w / 2) / WORLD_W) * 100}%`,
                top: `${((d.y + 6) / WORLD_H) * 100}%`,
                "--accent": d.accent,
              } as React.CSSProperties
            }
          >
            <span className="room-sign-code">{d.code}</span>
            <span className="room-sign-name">{d.name}</span>
          </div>
        ))}

        <div
          className="nexus-sign"
          style={{
            left: `${((NEXUS.x + NEXUS.w / 2) / WORLD_W) * 100}%`,
            top: `${((NEXUS.y + NEXUS.h + 3) / WORLD_H) * 100}%`,
          }}
        >
          NEXUS · NÚCLEO
        </div>

        {hover && (
          <div
            className="floor-tip"
            style={{ left: `${(hover.x / WORLD_W) * 100}%`, top: `${(hover.y / WORLD_H) * 100}%` }}
          >
            <strong>{hover.name}</strong>
            <span>{hover.role}</span>
          </div>
        )}
      </div>
      <div className="floor-scanlines" aria-hidden="true" />
    </div>
  );
}

/* ────────────────────────────── rendering ────────────────────────────── */

function draw(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  sim: Simulation,
  sel: Selection,
  hoverId: string | null,
) {
  const S = canvas.width / WORLD_W;
  const t = sim.time;
  const R = (v: number) => Math.round(v * S);
  const rect = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(R(x), R(y), R(x + w) - R(x), R(y + h) - R(y));
  };

  ctx.fillStyle = "#05081A";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawVoid(ctx, rect, R, S, canvas, t);
  for (const d of DEPTS) drawRoom(ctx, rect, R, S, d, t);
  for (const d of DEPTS) drawCable(ctx, R, S, d, t);
  drawPackets(ctx, R, S, sim);
  drawNexus(ctx, rect, R, S, sim, t, sel?.kind === "nexus", hoverId === "__nexus");

  const ordered = [...sim.agents].sort((a, b) => a.y - b.y);
  for (const a of ordered) {
    drawDesk(rect, a);
  }
  for (const a of ordered) {
    const isSel = sel?.kind === "agent" && sel.id === a.def.id;
    drawAgent(ctx, rect, R, S, a, isSel, hoverId === a.def.id, t);
  }
}

function drawVoid(
  ctx: CanvasRenderingContext2D,
  rect: (x: number, y: number, w: number, h: number, c: string) => void,
  R: (v: number) => number,
  S: number,
  canvas: HTMLCanvasElement,
  t: number,
) {
  rect(0, 0, WORLD_W, WORLD_H, VOID_FLOOR);

  // Slab grid on the open floor between the rooms.
  ctx.fillStyle = "#111A3E";
  for (let x = 0; x < WORLD_W; x += 8) ctx.fillRect(R(x), 0, Math.max(1, Math.round(S * 0.25)), canvas.height);
  for (let y = 0; y < WORLD_H; y += 8) ctx.fillRect(0, R(y), canvas.width, Math.max(1, Math.round(S * 0.25)));

  // Ambient glow pooling under the core.
  const g = ctx.createRadialGradient(R(192), R(112), 0, R(192), R(112), R(96));
  g.addColorStop(0, "rgba(77,225,255,0.16)");
  g.addColorStop(0.5, "rgba(77,225,255,0.05)");
  g.addColorStop(1, "rgba(77,225,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Slow sweep across the floor, like a scanning beam.
  const sweep = ((t * 14) % (WORLD_W + 120)) - 60;
  const sg = ctx.createLinearGradient(R(sweep - 40), 0, R(sweep + 40), 0);
  sg.addColorStop(0, "rgba(77,225,255,0)");
  sg.addColorStop(0.5, "rgba(77,225,255,0.045)");
  sg.addColorStop(1, "rgba(77,225,255,0)");
  ctx.fillStyle = sg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawRoom(
  ctx: CanvasRenderingContext2D,
  rect: (x: number, y: number, w: number, h: number, c: string) => void,
  R: (v: number) => number,
  S: number,
  d: (typeof DEPTS)[number],
  t: number,
) {
  const { x, y, w, h } = d;

  // Outer wall block with a lit top edge.
  rect(x, y, w, h, WALL);
  rect(x, y, w, 2, WALL_TOP);

  // Floor inside the walls, checkered.
  const fx = x + 3;
  const fy = y + 3;
  const fw = w - 6;
  const fh = h - 6;
  rect(fx, fy, fw, fh, "#0F1636");
  ctx.save();
  ctx.beginPath();
  ctx.rect(R(fx), R(fy), R(fx + fw) - R(fx), R(fy + fh) - R(fy));
  ctx.clip();
  for (let ty = fy; ty < fy + fh; ty += 8) {
    for (let tx = fx; tx < fx + fw; tx += 8) {
      const odd = (Math.floor((tx - fx) / 8) + Math.floor((ty - fy) / 8)) % 2 === 0;
      rect(tx, ty, 8, 8, odd ? "#121A3F" : "#0E1431");
    }
  }
  // Department tint washed over the floor.
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = d.accent;
  ctx.fillRect(R(fx), R(fy), R(fx + fw) - R(fx), R(fy + fh) - R(fy));
  ctx.globalAlpha = 1;
  ctx.restore();

  // Accent trim just inside the wall.
  ctx.globalAlpha = 0.55;
  rect(fx, fy, fw, 1, d.accent);
  rect(fx, fy + fh - 1, fw, 1, d.accentDim);
  rect(fx, fy, 1, fh, d.accentDim);
  rect(fx + fw - 1, fy, 1, fh, d.accentDim);
  ctx.globalAlpha = 1;

  // Sign band behind the DOM label.
  rect(x + 3, y + 3, w - 6, 13, "#0B1130");
  rect(x + 3, y + 15, w - 6, 1, d.accent);
  const beacon = 0.5 + Math.sin(t * 2.2 + x) * 0.5;
  ctx.globalAlpha = 0.35 + beacon * 0.5;
  rect(x + 6, y + 8, 3, 3, d.accent);
  rect(x + w - 9, y + 8, 3, 3, d.accent);
  ctx.globalAlpha = 1;

  // Doorway cut into the wall facing the core.
  const door = d.door;
  if (door.side === "e") {
    rect(x + w - 3, y + door.at, 3, door.span, "#0A1130");
    rect(x + w - 1, y + door.at, 1, door.span, d.accent);
  } else {
    rect(x, y + door.at, 3, door.span, "#0A1130");
    rect(x, y + door.at, 1, door.span, d.accent);
  }

  drawProps(rect, d, t, S, ctx);
}

/** A few pieces of furniture so each room reads as a real workspace. */
function drawProps(
  rect: (x: number, y: number, w: number, h: number, c: string) => void,
  d: (typeof DEPTS)[number],
  t: number,
  S: number,
  ctx: CanvasRenderingContext2D,
) {
  const { x, y, w, h } = d;

  // Server rack in the corner, LEDs blinking.
  rect(x + 6, y + 20, 10, 22, "#131B42");
  rect(x + 6, y + 20, 10, 2, "#1E2A5E");
  for (let i = 0; i < 5; i++) {
    const on = Math.sin(t * 3 + i * 1.7 + x) > 0;
    rect(x + 8, y + 24 + i * 4, 6, 1, on ? d.accent : "#1B2350");
  }

  // Plant against the far wall.
  const px = x + w - 12;
  const py = y + h - 14;
  rect(px, py + 6, 6, 5, "#2A2036");
  rect(px + 1, py + 1, 4, 5, "#2E8F63");
  rect(px + 2, py - 1, 2, 3, "#3FBF83");

  // Whiteboard with shifting content.
  rect(x + w - 34, y + 20, 22, 14, "#0C1233");
  rect(x + w - 34, y + 20, 22, 1, "#2A3568");
  ctx.globalAlpha = 0.7;
  for (let i = 0; i < 3; i++) {
    const len = 6 + ((Math.floor(t * 0.6) + i * 3) % 12);
    rect(x + w - 31, y + 24 + i * 3, len, 1, d.accent);
  }
  ctx.globalAlpha = 1;
}

function drawDesk(rect: (x: number, y: number, w: number, h: number, c: string) => void, a: AgentState) {
  const dx = a.homeX - 10;
  const dy = a.homeY - 6;
  // Desks stay put even when the agent walks away.
  rect(dx, dy, 20, 6, "#1D2550");
  rect(dx, dy, 20, 1, "#2B3672");
  rect(dx, dy + 6, 20, 1, "#0A0F28");
  // Monitor on the left so it never covers the face.
  rect(dx + 2, dy - 6, 8, 6, "#101740");
  rect(dx + 3, dy - 5, 6, 4, a.def.palette.accent);
  rect(dx + 5, dy, 2, 1, "#1A2350");
}

function drawAgent(
  ctx: CanvasRenderingContext2D,
  rect: (x: number, y: number, w: number, h: number, c: string) => void,
  R: (v: number) => number,
  S: number,
  a: AgentState,
  selected: boolean,
  hovered: boolean,
  t: number,
) {
  const left = a.x - SPRITE_W / 2;
  const top = a.y - SPRITE_H;

  if (selected || hovered) {
    const ring = selected ? 0.9 : 0.45;
    ctx.globalAlpha = ring * (selected ? 0.6 + Math.sin(t * 5) * 0.25 : 1);
    ctx.fillStyle = a.def.palette.accent;
    ctx.fillRect(R(a.x - 8), R(a.y - 1), R(16) - R(0), Math.max(1, Math.round(S)));
    ctx.globalAlpha = 1;
  }

  drawShadow(ctx, R(a.x), R(a.y + 0.5), S);

  const put = pixelPainter(ctx, R(left), R(top), S, a.facing);
  drawCharacter(put, a.def.palette, Math.floor(a.walk) % 4, a.mode);

  // Execution flash: a spark lifting off the agent's head.
  if (a.flash > 0) {
    ctx.globalAlpha = a.flash;
    ctx.fillStyle = "#FFFFFF";
    const lift = (1 - a.flash) * 8;
    ctx.fillRect(R(a.x - 1), R(a.y - SPRITE_H - 3 - lift), Math.max(2, R(2) - R(0)), Math.max(2, R(2) - R(0)));
    ctx.globalAlpha = a.flash * 0.55;
    ctx.fillStyle = a.def.palette.accent;
    ctx.fillRect(R(a.x - 2), R(a.y - SPRITE_H - 2 - lift), Math.max(2, R(4) - R(0)), Math.max(1, R(1) - R(0)));
    ctx.globalAlpha = 1;
  }

  // Status dot above the head.
  const statusColor = a.mode === "work" ? "#3FE38A" : a.mode === "walk" ? "#4DE1FF" : "#FFC24B";
  const blink = a.mode === "work" ? 0.75 + Math.sin(t * 4 + a.x) * 0.25 : 1;
  ctx.globalAlpha = blink;
  rect(a.x - 1, a.y - SPRITE_H - 3, 2, 2, statusColor);
  ctx.globalAlpha = 1;

  if (selected) {
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#FFFFFF";
    const c = a.def.palette.accent;
    ctx.fillStyle = c;
    // Corner brackets framing the selected agent.
    const bx = R(a.x - 8);
    const by = R(a.y - SPRITE_H - 5);
    const bw = R(a.x + 8) - bx;
    const bh = R(a.y + 2) - by;
    const th = Math.max(1, Math.round(S * 0.8));
    const arm = Math.max(2, Math.round(S * 3));
    ctx.fillRect(bx, by, arm, th);
    ctx.fillRect(bx, by, th, arm);
    ctx.fillRect(bx + bw - arm, by, arm, th);
    ctx.fillRect(bx + bw - th, by, th, arm);
    ctx.fillRect(bx, by + bh - th, arm, th);
    ctx.fillRect(bx, by + bh - arm, th, arm);
    ctx.fillRect(bx + bw - arm, by + bh - th, arm, th);
    ctx.fillRect(bx + bw - th, by + bh - arm, th, arm);
    ctx.globalAlpha = 1;
  }
}

function drawCable(
  ctx: CanvasRenderingContext2D,
  R: (v: number) => number,
  S: number,
  d: (typeof DEPTS)[number],
  t: number,
) {
  const pts = d.cable;

  // Outer glow, conduit, then the lit core.
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
  const stroke = (width: number, color: string, alpha: number) => {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, width * S);
    ctx.beginPath();
    ctx.moveTo(R(pts[0].x), R(pts[0].y));
    for (let i = 1; i < pts.length; i++) ctx.lineTo(R(pts[i].x), R(pts[i].y));
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  stroke(7, BUS, 0.1);
  stroke(4.5, "#0B1740", 1);
  stroke(2.4, "#12356B", 1);
  stroke(1, BUS, 0.55 + Math.sin(t * 3 + d.x) * 0.12);

  // Ambient light beads always flowing toward the core.
  const beads = 7;
  for (let i = 0; i < beads; i++) {
    const p = ((t * 0.34 + i / beads) % 1 + 1) % 1;
    const pos = pointOnCable(pts, p);
    const fade = Math.sin(p * Math.PI);
    ctx.globalAlpha = 0.25 + fade * 0.55;
    ctx.fillStyle = BUS;
    const s = Math.max(2, Math.round(S * 1.6));
    ctx.fillRect(R(pos.x) - s / 2, R(pos.y) - s / 2, s, s);
    ctx.globalAlpha = 0.9 * fade;
    ctx.fillStyle = "#E8FCFF";
    const c = Math.max(1, Math.round(S * 0.8));
    ctx.fillRect(R(pos.x) - c / 2, R(pos.y) - c / 2, c, c);
    ctx.globalAlpha = 1;
  }

  // Port nub where the cable leaves the room.
  ctx.fillStyle = d.accent;
  const n = Math.max(2, Math.round(S * 3));
  ctx.fillRect(R(pts[0].x) - n / 2, R(pts[0].y) - n / 2, n, n);
  ctx.globalAlpha = 0.35;
  ctx.fillRect(R(pts[0].x) - n, R(pts[0].y) - n, n * 2, n * 2);
  ctx.globalAlpha = 1;
}

function drawPackets(ctx: CanvasRenderingContext2D, R: (v: number) => number, S: number, sim: Simulation) {
  for (const p of sim.packets) {
    const dept = DEPTS.find((d) => d.id === p.dept)!;
    const pos = pointOnCable(dept.cable, p.t);
    const tail = pointOnCable(dept.cable, Math.max(0, p.t - 0.08));

    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = dept.accent;
    ctx.lineWidth = Math.max(1, S * 1.4);
    ctx.beginPath();
    ctx.moveTo(R(tail.x), R(tail.y));
    ctx.lineTo(R(pos.x), R(pos.y));
    ctx.stroke();
    ctx.globalAlpha = 1;

    const halo = Math.max(3, Math.round(S * 4));
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = dept.accent;
    ctx.fillRect(R(pos.x) - halo / 2, R(pos.y) - halo / 2, halo, halo);
    ctx.globalAlpha = 1;

    const core = Math.max(2, Math.round(S * 2.2));
    ctx.fillStyle = dept.accent;
    ctx.fillRect(R(pos.x) - core / 2, R(pos.y) - core / 2, core, core);
    const dot = Math.max(1, Math.round(S * 1));
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(R(pos.x) - dot / 2, R(pos.y) - dot / 2, dot, dot);
  }
}

function drawNexus(
  ctx: CanvasRenderingContext2D,
  rect: (x: number, y: number, w: number, h: number, c: string) => void,
  R: (v: number) => number,
  S: number,
  sim: Simulation,
  t: number,
  selected: boolean,
  hovered: boolean,
) {
  // Landing flash when packets are about to arrive.
  const incoming = sim.packets.filter((p) => p.t > 0.9).length;
  const heat = Math.min(1, incoming * 0.45);

  const g = ctx.createRadialGradient(R(192), R(112), 0, R(192), R(112), R(52));
  g.addColorStop(0, `rgba(77,225,255,${0.22 + heat * 0.25})`);
  g.addColorStop(1, "rgba(77,225,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(R(140), R(60), R(105) - R(0), R(105) - R(0));

  // Dais
  rect(170, 104, 44, 24, "#141C48");
  rect(170, 104, 44, 3, "#243070");
  rect(170, 127, 44, 1, "#070B22");
  ctx.globalAlpha = 0.5 + Math.sin(t * 2) * 0.2;
  rect(170, 106, 44, 1, BUS);
  ctx.globalAlpha = 1;

  // Ring of ground light around the dais
  ctx.globalAlpha = 0.22 + Math.sin(t * 1.6) * 0.08;
  rect(166, 100, 52, 1, BUS);
  rect(166, 130, 52, 1, BUS);
  rect(166, 100, 1, 31, BUS);
  rect(217, 100, 1, 31, BUS);
  ctx.globalAlpha = 1;

  // Console body
  rect(176, 86, 32, 20, "#0E1438");
  rect(176, 86, 32, 2, "#2B3878");
  rect(176, 104, 32, 2, "#080C24");

  // Screen with a live trace
  rect(179, 89, 26, 13, "#050A1E");
  ctx.save();
  ctx.beginPath();
  ctx.rect(R(179), R(89), R(205) - R(179), R(102) - R(89));
  ctx.clip();
  for (let i = 0; i < 22; i++) {
    const v = (Math.sin(t * 2.4 + i * 0.55) * 0.5 + 0.5) * 8 + 1;
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = i % 4 === 0 ? "#FFFFFF" : BUS;
    ctx.fillRect(R(180 + i), R(101 - v), Math.max(1, Math.round(S)), R(101) - R(101 - v));
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  ctx.globalAlpha = 0.18 + heat * 0.3;
  rect(179, 89, 26, 13, BUS);
  ctx.globalAlpha = 1;

  // Keyboard and beacon
  rect(180, 107, 24, 3, "#1B2454");
  rect(181, 108, 22, 1, "#2E3B7E");
  rect(191, 78, 2, 8, "#1B2454");
  const pulse = 0.5 + Math.sin(t * 4) * 0.5;
  ctx.globalAlpha = 0.4 + pulse * 0.6;
  rect(190, 76, 4, 3, BUS);
  ctx.globalAlpha = 1;

  if (selected || hovered) {
    ctx.globalAlpha = selected ? 0.75 + Math.sin(t * 5) * 0.2 : 0.4;
    ctx.strokeStyle = BUS;
    ctx.lineWidth = Math.max(1, S);
    ctx.strokeRect(R(165), R(74), R(219) - R(165), R(132) - R(74));
    ctx.globalAlpha = 1;
  }
}
