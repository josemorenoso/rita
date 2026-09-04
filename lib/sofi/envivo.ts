import type { Motor, Oyente } from "./reproductor";
import { HERRAMIENTAS, type Accion, type Campo, type Cierre, type Resultado, type TipoAccion } from "./tipos";
import { CAMPOS, ACCIONES, RESULTADOS } from "./tipos";

/* ─────────────────────────────  SOFI  ─────────────────────────────
   La llamada en vivo: el navegador pide al servidor un token efímero y abre
   la conversación con ElevenLabs por WebRTC. Cuando Sofi llama a una de sus
   herramientas (anotar_dato, agendar_accion, cerrar_llamada) el evento sale
   por el mismo `Oyente` que usa el guion grabado, así la pantalla es una.
   ------------------------------------------------------------------ */

interface Sesion {
  modo: "webrtc" | "websocket";
  token?: string;
  signedUrl?: string;
  variables: Record<string, string>;
  error?: string;
  detalle?: string;
}

/** Lo poco del SDK que usamos, tipado a mano para no depender de sus tipos. */
interface Conversacion {
  endSession(): Promise<void>;
  getOutputByteFrequencyData?(): Uint8Array;
  getInputByteFrequencyData?(): Uint8Array;
}

const CAMPOS_VALIDOS = new Set<string>(CAMPOS.map((c) => c.id));
const ACCIONES_VALIDAS = new Set<string>(Object.keys(ACCIONES));
const RESULTADOS_VALIDOS = new Set<string>(Object.keys(RESULTADOS));

export class LlamadaEnVivo implements Motor {
  private conversacion: Conversacion | null = null;
  private mezcla: Uint8Array | null = null;
  private terminada = false;

  constructor(
    private cotizacionId: string,
    private oyente: Oyente,
  ) {}

  frecuencias() {
    const c = this.conversacion;
    if (!c) return null;
    let salida: Uint8Array | null = null;
    let entrada: Uint8Array | null = null;
    try {
      salida = c.getOutputByteFrequencyData?.() ?? null;
    } catch {
      salida = null;
    }
    try {
      entrada = c.getInputByteFrequencyData?.() ?? null;
    } catch {
      entrada = null;
    }
    const n = salida?.length || entrada?.length || 0;
    if (!n) return null;
    if (!this.mezcla || this.mezcla.length !== n) this.mezcla = new Uint8Array(n);
    for (let i = 0; i < n; i++) this.mezcla[i] = Math.max(salida ? salida[i] : 0, entrada ? entrada[i] : 0);
    return this.mezcla;
  }

  async iniciar() {
    this.oyente.onFase("marcando");

    const r = await fetch("/api/sofi/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cotizacionId: this.cotizacionId }),
    });
    const sesion = (await r.json()) as Sesion;
    if (!r.ok) throw new Error(sesion.error || "No se pudo abrir la sesión");

    const { Conversation } = await import("@elevenlabs/client");

    const opciones: Record<string, unknown> = {
      connectionType: sesion.modo,
      dynamicVariables: sesion.variables,
      clientTools: {
        [HERRAMIENTAS.dato]: (p: { campo?: string; valor?: string }) => {
          const campo = (p?.campo || "").trim().toLowerCase();
          if (!CAMPOS_VALIDOS.has(campo) || !p?.valor) return "Campo no válido";
          this.oyente.onEvento({ tipo: "dato", dato: { campo: campo as Campo, valor: p.valor } });
          return "Anotado";
        },
        [HERRAMIENTAS.accion]: (p: { tipo?: string; cuando?: string; detalle?: string }) => {
          const tipo = (p?.tipo || "").trim().toLowerCase();
          const accion: Accion = {
            tipo: (ACCIONES_VALIDAS.has(tipo) ? tipo : "llamada") as TipoAccion,
            cuando: p?.cuando || "Pendiente",
            detalle: p?.detalle || "",
          };
          this.oyente.onEvento({ tipo: "accion", accion });
          return "Agendado";
        },
        [HERRAMIENTAS.cierre]: async (p: { resultado?: string; resumen?: string; monto?: number | string }) => {
          const resultado = (p?.resultado || "").trim().toLowerCase();
          const monto = typeof p?.monto === "string" ? Number(p.monto.replace(/[^\d]/g, "")) : p?.monto;
          const cierre: Cierre = {
            resultado: (RESULTADOS_VALIDOS.has(resultado) ? resultado : "volver_a_llamar") as Resultado,
            resumen: p?.resumen || "",
            monto: cierre_valido(resultado) && monto && isFinite(monto) ? Math.round(monto) : undefined,
          };
          this.oyente.onEvento({ tipo: "cierre", cierre });
          // Un respiro antes de confirmar: se nota que el sistema hizo algo.
          await new Promise((r) => setTimeout(r, 1200));
          return "Listo, quedó registrado en el sistema.";
        },
      },
      onConnect: () => this.oyente.onFase("en_llamada"),
      onDisconnect: () => this.terminar(),
      onError: (m: unknown) => {
        const texto = typeof m === "string" ? m : ((m as { message?: string })?.message ?? "error de conexión");
        this.oyente.onError?.(`ElevenLabs: ${texto}`);
      },
      onModeChange: ({ mode }: { mode: string }) => this.oyente.onHablando(mode === "speaking" ? "sofi" : null),
      onMessage: (m: { source?: string; role?: string; message?: string; text?: string }) => {
        const fuente = m?.source || m?.role;
        const texto = m?.message || m?.text;
        if (!texto) return;
        if (fuente === "ai" || fuente === "agent") this.oyente.onTurno({ quien: "sofi", texto });
        else if (fuente === "user") this.oyente.onTurno({ quien: "cliente", texto });
      },
    };
    if (sesion.modo === "webrtc") opciones.conversationToken = sesion.token;
    else opciones.signedUrl = sesion.signedUrl;

    this.conversacion = (await (Conversation as unknown as {
      startSession(o: Record<string, unknown>): Promise<Conversacion>;
    }).startSession(opciones)) as Conversacion;
  }

  colgar() {
    const c = this.conversacion;
    this.conversacion = null;
    c?.endSession().catch(() => {});
    this.terminar();
  }

  private terminar() {
    if (this.terminada) return;
    this.terminada = true;
    this.conversacion = null;
    this.oyente.onHablando(null);
    this.oyente.onFase("colgada");
  }
}

const cierre_valido = (r: string) => r === "pedido_cerrado";
