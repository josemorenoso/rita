/**
 * Los sonidos que no son voz: el timbre al marcar y el toque cuando la ficha
 * anota algo. Se sintetizan con WebAudio para no depender de ficheros y
 * comparten el mismo AudioContext que la voz, que solo puede crearse tras
 * un gesto del usuario (pulsar «Llamar»).
 */

export class Sonidos {
  readonly ctx: AudioContext;
  private timbreActivo = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
  }

  /** Tono de llamada colombiano: 425 Hz, un segundo sonando y pausa. */
  async timbre(veces: number, sonando = 1.0, pausa = 1.4): Promise<void> {
    this.timbreActivo = true;
    for (let i = 0; i < veces; i++) {
      if (!this.timbreActivo) return;
      this.tono(425, sonando, 0.045);
      await esperar((sonando + (i === veces - 1 ? 0.35 : pausa)) * 1000);
    }
    this.timbreActivo = false;
  }

  cortarTimbre() {
    this.timbreActivo = false;
  }

  /** El «clic» de descolgar. */
  descolgar() {
    this.tono(660, 0.05, 0.03);
  }

  /** Toque breve cuando Sofi anota algo: dos notas rápidas y suaves. */
  anotar() {
    this.tono(880, 0.07, 0.025);
    setTimeout(() => this.tono(1320, 0.09, 0.02), 70);
  }

  /** Un acorde corto cuando el pedido queda cerrado. */
  cerrado() {
    this.tono(523, 0.22, 0.03);
    setTimeout(() => this.tono(659, 0.22, 0.03), 90);
    setTimeout(() => this.tono(784, 0.34, 0.035), 180);
  }

  /** Tono de colgado, más grave y seco. */
  colgar() {
    this.tono(330, 0.12, 0.03);
  }

  private tono(hz: number, segundos: number, ganancia: number) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = hz;
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(ganancia, ctx.currentTime + 0.012);
    g.gain.setValueAtTime(ganancia, ctx.currentTime + segundos - 0.03);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + segundos);
    osc.connect(g).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + segundos + 0.01);
  }
}

export const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
