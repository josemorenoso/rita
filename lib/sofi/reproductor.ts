import { rutaAudio } from "./guion";
import { Sonidos, esperar } from "./sonidos";
import type { Evento, Guion, Quien } from "./tipos";

/* ─────────────────────────────  SOFI  ─────────────────────────────
   Reproduce la llamada grabada como si estuviera ocurriendo: timbra,
   descuelga, suena cada turno con su audio y, al terminar cada uno, suelta
   los eventos que llenan la ficha. La interfaz no sabe si lo que oye es el
   guion o el agente en vivo: los dos hablan por la misma interfaz `Oyente`.
   ------------------------------------------------------------------ */

export type Fase = "marcando" | "en_llamada" | "colgada";

export interface Oyente {
  onFase(fase: Fase): void;
  /** El turno que está sonando. `progreso` (0..1) sirve para ir revelando
      palabras al ritmo del audio; en vivo no hay progreso y se enseña entero. */
  onTurno(turno: { quien: Quien; texto: string; progreso?: number }): void;
  onEvento(evento: Evento): void;
  onHablando(quien: Quien | null): void;
  onError?(mensaje: string): void;
}

export interface Motor {
  iniciar(): Promise<void>;
  colgar(): void;
  frecuencias(): Uint8Array | null;
}

/** Pausas entre turnos, en ms. Un pelín más largas cuando le toca a Sofi
    contestar: es el instante en que «piensa». */
const PAUSA_TRAS_CLIENTE = 520;
const PAUSA_TRAS_SOFI = 380;
/** Cuánto tarda la ficha en anotar después de que el cliente dice la cosa. */
const RETARDO_ANOTAR = 260;

export class Reproductor implements Motor {
  private ctx: AudioContext | null = null;
  private analizador: AnalyserNode | null = null;
  private datos: Uint8Array<ArrayBuffer> | null = null;
  private sonidos: Sonidos | null = null;
  private audios = new Map<string, HTMLAudioElement>();
  private vivo = false;
  private actual: HTMLAudioElement | null = null;

  constructor(
    private guion: Guion,
    private oyente: Oyente,
    private opciones: { timbre?: boolean } = {},
  ) {
    // Precarga todo para que no haya huecos entre turnos.
    for (const t of guion.turnos) {
      const a = new Audio(rutaAudio(t.id));
      a.preload = "auto";
      this.audios.set(t.id, a);
    }
  }

  frecuencias() {
    if (!this.analizador || !this.datos) return null;
    this.analizador.getByteFrequencyData(this.datos);
    return this.datos;
  }

  async iniciar() {
    this.vivo = true;
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.analizador = ctx.createAnalyser();
    this.analizador.fftSize = 256;
    this.analizador.smoothingTimeConstant = 0.78;
    this.analizador.connect(ctx.destination);
    this.datos = new Uint8Array(this.analizador.frequencyBinCount);
    this.sonidos = new Sonidos(ctx);

    this.oyente.onFase("marcando");
    if (this.opciones.timbre !== false) await this.sonidos.timbre(2);
    else await esperar(700);
    if (!this.vivo) return;
    this.sonidos.descolgar();
    await esperar(420);
    if (!this.vivo) return;
    this.oyente.onFase("en_llamada");

    for (const turno of this.guion.turnos) {
      if (!this.vivo) return;
      await this.sonar(turno.id, turno.quien, turno.texto);
      if (!this.vivo) return;
      if (turno.eventos?.length) {
        await esperar(RETARDO_ANOTAR);
        for (const e of turno.eventos) {
          if (!this.vivo) return;
          this.oyente.onEvento(e);
          if (e.tipo === "cierre" && e.cierre.resultado === "pedido_cerrado") this.sonidos.cerrado();
          else if (e.tipo === "dato") this.sonidos.anotar();
          await esperar(e.tipo === "cierre" ? 520 : 340);
        }
      }
      await esperar(turno.quien === "cliente" ? PAUSA_TRAS_CLIENTE : PAUSA_TRAS_SOFI);
    }

    if (!this.vivo) return;
    await esperar(350);
    this.sonidos.colgar();
    this.vivo = false;
    this.oyente.onHablando(null);
    this.oyente.onFase("colgada");
  }

  colgar() {
    if (!this.vivo) return;
    this.vivo = false;
    this.sonidos?.cortarTimbre();
    if (this.actual) {
      this.actual.pause();
      this.actual = null;
    }
    this.sonidos?.colgar();
    this.oyente.onHablando(null);
    this.oyente.onFase("colgada");
    setTimeout(() => this.ctx?.close().catch(() => {}), 400);
  }

  private sonar(id: string, quien: Quien, texto: string) {
    return new Promise<void>((resolver) => {
      const audio = this.audios.get(id);
      const ctx = this.ctx;
      if (!audio || !ctx || !this.analizador) return resolver();

      let fuente: MediaElementAudioSourceNode | null = null;
      try {
        fuente = ctx.createMediaElementSource(audio);
        fuente.connect(this.analizador);
      } catch {
        // Ya estaba conectado (segunda reproducción del mismo elemento).
      }

      this.actual = audio;
      this.oyente.onHablando(quien);
      this.oyente.onTurno({ quien, texto, progreso: 0 });

      let raf = 0;
      const tic = () => {
        if (this.actual !== audio) return;
        const d = audio.duration;
        // Las palabras van un poco por delante del audio: se leen antes de oírse.
        const p = d && isFinite(d) ? Math.min(1, (audio.currentTime + 0.18) / d) : 0;
        this.oyente.onTurno({ quien, texto, progreso: p });
        raf = requestAnimationFrame(tic);
      };

      const fin = () => {
        cancelAnimationFrame(raf);
        audio.removeEventListener("ended", fin);
        audio.removeEventListener("error", fin);
        if (this.actual === audio) this.actual = null;
        this.oyente.onTurno({ quien, texto, progreso: 1 });
        this.oyente.onHablando(null);
        resolver();
      };
      audio.addEventListener("ended", fin);
      audio.addEventListener("error", () => {
        this.oyente.onError?.(`No se pudo reproducir ${rutaAudio(id)}. ¿Corriste npm run sofi:grabar?`);
        fin();
      });

      audio.currentTime = 0;
      audio.play().then(() => {
        raf = requestAnimationFrame(tic);
      }).catch(() => fin());
    });
  }
}
