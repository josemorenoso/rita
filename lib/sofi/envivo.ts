import type { Motor, Oyente } from "./motor";
import { porId } from "./cotizaciones";
import { Sonidos, esperar } from "./sonidos";
import { HERRAMIENTAS, type Accion, type Campo, type Cierre, type Resultado, type TipoAccion } from "./tipos";
import { CAMPOS, ACCIONES, RESULTADOS, totalConDescuento } from "./tipos";

/* ─────────────────────────────  SOFI  ─────────────────────────────
   La llamada. Es una llamada de verdad: el navegador pide al servidor un
   token efímero, timbra mientras conecta y abre la conversación con
   ElevenLabs por WebRTC. Sofi habla, tú contestas por el micrófono y ella
   sigue. No hay grabación ni respaldo: lo que se oye está pasando.

   Cuando Sofi llama a una de sus herramientas (anotar_dato, agendar_accion,
   cerrar_llamada) el evento sale por el `Oyente` y la pantalla se mueve.
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

/** Lo que timbra antes de que descuelguen, como cualquier teléfono. */
const TIMBRES_MINIMOS = 2;

export class LlamadaEnVivo implements Motor {
  private conversacion: Conversacion | null = null;
  private mezcla: Uint8Array | null = null;
  private terminada = false;
  private ctx: AudioContext | null = null;
  private sonidos: Sonidos | null = null;

  constructor(
    private cotizacionId: string,
    private oyente: Oyente,
    private opciones: { timbre?: boolean; llave?: string } = {},
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

    // El audio se abre aquí, pegado al clic, que es el gesto que el navegador
    // exige. Después ya se puede esperar sin que se cierre la puerta.
    this.abrirAudio();

    // Primero el micrófono: si no lo pedimos a la cara, el navegador que lo
    // tenga bloqueado no enseña ningún diálogo y la llamada se muere muda.
    await this.pedirMicrofono();

    // Y ahora sí timbra, mientras se pide el token: en una llamada de verdad
    // tampoco descuelgan al primer tono.
    const timbrando = this.timbrar();

    const r = await fetch("/api/sofi/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cotizacionId: this.cotizacionId, llave: this.opciones.llave || undefined }),
    });
    const sesion = (await r.json()) as Sesion;
    if (!r.ok) {
      this.callarTimbre();
      // El detalle es feo, pero delante de la cámara vale más saber qué pasó
      // que un mensaje bonito que no dice nada.
      throw new Error([sesion.error || "No se pudo abrir la sesión", sesion.detalle].filter(Boolean).join(" · "));
    }

    const { Conversation } = await import("@elevenlabs/client");
    await timbrando;
    if (this.terminada) return;

    const opciones: Record<string, unknown> = {
      connectionType: sesion.modo,
      dynamicVariables: sesion.variables,
      clientTools: {
        [HERRAMIENTAS.dato]: (p: { campo?: string; valor?: string }) => {
          const campo = (p?.campo || "").trim().toLowerCase();
          if (!CAMPOS_VALIDOS.has(campo) || !p?.valor) return "Campo no válido";
          this.sonidos?.anotar();
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
          this.sonidos?.anotar();
          this.oyente.onEvento({ tipo: "accion", accion });
          return "Agendado";
        },
        [HERRAMIENTAS.cierre]: async (p: { resultado?: string; resumen?: string; monto?: number | string }) => {
          const resultado = (p?.resultado || "").trim().toLowerCase();
          const monto = typeof p?.monto === "string" ? Number(p.monto.replace(/[^\d]/g, "")) : p?.monto;
          const cierre: Cierre = {
            resultado: (RESULTADOS_VALIDOS.has(resultado) ? resultado : "volver_a_llamar") as Resultado,
            resumen: p?.resumen || "",
            monto: resultado === "pedido_cerrado" ? this.montoExacto(monto) : undefined,
          };
          if (cierre.resultado === "pedido_cerrado") this.sonidos?.cerrado();
          this.oyente.onEvento({ tipo: "cierre", cierre });
          // Un respiro antes de confirmar: se nota que el sistema hizo algo.
          await esperar(1200);
          return "Listo, quedó registrado en el sistema.";
        },
      },
      onConnect: () => {
        this.callarTimbre();
        this.sonidos?.descolgar();
        this.oyente.onFase("en_llamada");
      },
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

    try {
      this.conversacion = (await (Conversation as unknown as {
        startSession(o: Record<string, unknown>): Promise<Conversacion>;
      }).startSession(opciones)) as Conversacion;
    } catch (e) {
      this.callarTimbre();
      throw e;
    }
  }

  colgar() {
    const c = this.conversacion;
    this.conversacion = null;
    this.callarTimbre();
    this.sonidos?.colgar();
    c?.endSession().catch(() => {});
    this.terminar();
  }

  /** Sofi dice el total redondeado —«quinientos dos mil pesos»— porque así se
      habla, y el modelo suele registrar ese mismo número redondo. Lo que entra
      al sistema es la cifra de la cotización, que es la que existe: solo se
      respeta la del modelo si de verdad pidió otra cosa (medio pedido, por
      ejemplo) y no un redondeo de la misma. */
  private montoExacto(dicho?: number) {
    const c = porId(this.cotizacionId);
    const exacto = c ? totalConDescuento(c) : undefined;
    if (!dicho || !isFinite(dicho)) return exacto;
    if (!exacto) return Math.round(dicho);
    return Math.abs(dicho - exacto) / exacto <= 0.05 ? exacto : Math.round(dicho);
  }

  /* ── Micrófono y timbre ── */

  /** El permiso, pedido de frente. Si el navegador lo tiene bloqueado no
      aparece ningún diálogo, así que hay que decirle a la persona dónde
      desbloquearlo en vez de dejar la llamada colgada sin explicación. */
  private async pedirMicrofono() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Este navegador no deja usar el micrófono. Abre la página en Chrome o Edge, en http://localhost.");
    }
    try {
      const pista = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Solo queríamos el permiso: el SDK abre su propia pista.
      pista.getTracks().forEach((t) => t.stop());
    } catch (e) {
      const nombre = (e as { name?: string })?.name;
      if (nombre === "NotAllowedError" || nombre === "SecurityError") {
        throw new Error("El navegador tiene bloqueado el micrófono. Pulsa el candado de la barra de direcciones → Micrófono → Permitir, y vuelve a llamar.");
      }
      if (nombre === "NotFoundError" || nombre === "OverconstrainedError") {
        throw new Error("No encuentro ningún micrófono conectado.");
      }
      throw new Error(`No se pudo abrir el micrófono: ${(e as Error)?.message ?? String(e)}`);
    }
  }

  /** El audio de los tonos: WebAudio, sin ficheros. Se abre pegado al clic en
      «Llamar», que es el gesto que el navegador exige. */
  private abrirAudio() {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.sonidos = new Sonidos(this.ctx);
    } catch {
      /* sin audio: la llamada sigue igual, solo que sin tonos */
    }
  }

  private async timbrar() {
    if (this.opciones.timbre === false) return;
    try {
      await this.sonidos?.timbre(TIMBRES_MINIMOS);
    } catch {
      /* da igual: el timbre es adorno */
    }
  }

  private callarTimbre() {
    this.sonidos?.cortarTimbre();
  }

  private terminar() {
    if (this.terminada) return;
    this.terminada = true;
    this.conversacion = null;
    this.callarTimbre();
    this.oyente.onHablando(null);
    this.oyente.onFase("colgada");
    // Deja que suene el tono de colgado antes de cerrar el contexto.
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx) setTimeout(() => ctx.close().catch(() => {}), 900);
  }
}
