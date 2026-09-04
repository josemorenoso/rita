import type { Evento, Quien } from "./tipos";

/* ─────────────────────────────  SOFI  ─────────────────────────────
   El contrato entre la llamada y la pantalla. La pantalla no habla con
   ElevenLabs: le pasa un `Oyente` al motor y el motor le va contando qué
   pasa (en qué fase va, quién habla, qué se dijo, qué anotó Sofi).
   ------------------------------------------------------------------ */

export type Fase = "marcando" | "en_llamada" | "colgada";

export interface Oyente {
  onFase(fase: Fase): void;
  /** El turno que se acaba de decir, tal cual, para los subtítulos. */
  onTurno(turno: { quien: Quien; texto: string }): void;
  onEvento(evento: Evento): void;
  onHablando(quien: Quien | null): void;
  onError?(mensaje: string): void;
}

export interface Motor {
  iniciar(): Promise<void>;
  colgar(): void;
  /** Espectro de audio para la onda, o null si todavía no hay sonido. */
  frecuencias(): Uint8Array | null;
}
