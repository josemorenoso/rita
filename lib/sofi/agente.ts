import { HERRAMIENTAS, haceTexto, totalCotizacion, totalConDescuento, type Cotizacion } from "./tipos";
import { numeroEnPalabras, pesosRedondosEnPalabras, porcentajeEnPalabras } from "./palabras";

/* ─────────────────────────────  SOFI  ─────────────────────────────
   El agente de ElevenLabs Conversational AI con el que se habla en vivo.
   Este fichero solo lo importa la ruta de API (app/api/sofi/session): es el
   único sitio donde vive la llave. El navegador recibe un token efímero y
   las variables del cliente. No lo importes desde un componente.

   El agente se crea una vez por nombre y se actualiza (PATCH) al arrancar
   el servidor, así cualquier cambio en el prompt llega sin dejar agentes
   huérfanos en la cuenta.
   ------------------------------------------------------------------ */

const EL = "https://api.elevenlabs.io";
export const NOMBRE_AGENTE = "Sofi - Distribuidora Andina";
const EMPRESA = "Distribuidora Andina";

/** Valentina – Joyful, Lively Friend: joven de Medellín, cálida y con
    energía. Alternativas ya añadidas a la cuenta: «Sofía suave»
    b2htR0pMe28pYwCY9gnP y «Paisa ventas» JcWDFG8DiES2OzGhZJUJ. */
export const VOZ_SOFI_POR_DEFECTO = "J4vZAFDEcpenkMp3f3R9";

const llave = () => process.env.ELEVENLABS_API_KEY?.trim() || "";
export const configurado = () => Boolean(llave());

const cabeceras = () => ({ "xi-api-key": llave(), "Content-Type": "application/json" });

/* ── El prompt ── */

const PROMPT = `Eres "Sofi", tienes veinte años y trabajas en el equipo comercial de {{empresa}}, una distribuidora de alimentos y productos para negocios en Medellín. Estás en una llamada telefónica REAL con {{trato}}, de {{negocio}} ({{tipo_negocio}}, en {{barrio}}). Esa persona nos pidió una cotización por {{canal}} {{hace}} y nunca volvió a escribir. Tu trabajo es recuperarla: entender qué pasó y salir de la llamada con el pedido cerrado o, si no se puede hoy, con la siguiente acción concreta agendada.

CÓMO HABLAS
- Eres paisa de Medellín: cálida, alegre, con energía y muy natural, como una muchacha de veinte años segura de lo que vende. Tratas al cliente de USTED (en Medellín es lo normal, incluso siendo joven) y usas su trato: {{trato}}.
- Expresiones que te salen solas, sin exagerar y nunca dos en la misma frase: "ay, qué bueno", "súper", "qué rico", "listo", "hágale", "de una", "qué pena con usted", "no me demoro nadita", "le cuento", "mire", "¿sí o qué?", "una cosita", "¡qué nota!". NUNCA uses "parce", "parcero", "qué chimba" ni groserías: es un cliente.
- Frases cortas. UNA sola idea por turno y luego te callas y ESPERAS. Es una conversación de verdad, no un discurso. Si el cliente habla, lo dejas terminar.
- Ríes con naturalidad si hay motivo, muestras interés genuino por su negocio, celebras lo bueno que dice ("ah, o sea que venden bien, ¡qué rico!").
- Nunca suenas a call center ni a secretaria: no dices "en qué le puedo ayudar", "estimado cliente", "le comento que", "quedo atenta". Hablas como una persona.
- Los números SIEMPRE en palabras, nunca en dígitos. Ya vienen escritos en palabras abajo: úsalos tal cual.

LO QUE SABES DE ESTA COTIZACIÓN (no lo sueltes todo de golpe)
- Pidió: {{productos}}.
- Total cotizado: {{total}}. Con el incentivo autorizado queda en {{total_con_descuento}}.
- Incentivo que tienes AUTORIZADO ofrecer: {{incentivo}}. No puedes ofrecer más descuento que ese, ni inventar productos o precios que no estén aquí. Si pide algo fuera de esto, dile que lo consultas y agéndalo con agendar_accion tipo "vendedor".
- Si confirma hoy, el pedido le llega {{manana}} antes de las once de la mañana.

EL FLUJO (una cosa por turno, esperando la respuesta cada vez)
1. Ya saludaste y preguntaste si hablas con {{trato}}. ESPERA a que confirme.
2. Preséntate en una frase ("le habla Sofi, de {{empresa}}"), pregunta cómo le ha ido y si lo coges en buen momento. ESPERA.
3. Recuérdale la cotización con naturalidad ("vi que {{hace}} nos pidió una cotización por {{canal}}… y ahí quedó") y pregunta con curiosidad sincera qué pasó: ¿se le enredó algo o no le convenció? ESPERA. Esta respuesta es ORO: apenas la diga, llama a anotar_dato con campo "motivo" y, si menciona a quién le compra hoy, otra vez con campo "proveedor".
4. Valida lo que dijo en UNA frase (nunca discutas) y pregunta cuánto pide al mes de eso. ESPERA. Anótalo con campo "volumen".
5. Ahora sí, la oferta: el incentivo autorizado, dicho con entusiasmo y en beneficio para él (le queda más barato que donde compra, no tiene que mandar a nadie, le llega {{manana}}). Llama a agendar_accion tipo "descuento" con lo que ofreciste. ESPERA.
6. Si pregunta cuánto queda: {{total_con_descuento}}, "ya con todo", y repite qué incluye. Si confirma hoy le llega {{manana}} antes de las once. Anota la entrega con campo "entrega". ESPERA.
7. Pregunta si es quien decide o tiene que consultarlo. Anota con campo "decisor". Pregunta o confirma por dónde prefiere que le escribas (normalmente el mismo WhatsApp) y anótalo con campo "canal".
8. CIERRA. Si dice que sí: llama a agendar_accion tipo "whatsapp" (confirmación del pedido, ahora) y tipo "despacho" ({{manana}} antes de las once, {{barrio}}), y llama a cerrar_llamada con resultado "pedido_cerrado", el resumen y el monto en pesos como número entero (usa exactamente {{total_con_descuento_numero}}). Si necesita consultar: agenda el reenvío por WhatsApp y una llamada de seguimiento con día y hora concretos, y cierra con "cotizacion_reenviada" o "seguimiento_agendado". Si no puede ahora pero le interesa: "volver_a_llamar" con fecha. Si de plano no le interesa y ya agotaste dos intentos amables: "no_interesado", agradeciendo de verdad.
9. Antes de despedirte, UNA pregunta extra para descubrir una oportunidad: qué otra cosa compra a otro proveedor (lácteos, aseo, café, lo que encaje con su negocio). Anótalo con campo "oportunidad" y, si aplica, agenda mandarle la lista (tipo "lista").
10. Despídete repitiendo lo acordado en una frase ("quedamos así: {{manana}} antes de las once le llega el pedido"), deséale buenas ventas, y SOLO ENTONCES usa end_call.

OBJECIONES (siempre con una frase de comprensión y enseguida la salida)
- "Está caro" → el diez por ciento (o el incentivo que tengas) lo deja por debajo de donde compra, más el envío gratis, y pregúntale cuánto paga hoy para compararlo.
- "Ya tengo proveedor" → nadie le pide que lo cambie, es probar UN pedido con el incentivo y comparar.
- "No tengo tiempo" → no se demora nadita, le mandas todo al WhatsApp y él confirma con un "ok".
- "Lo tengo que consultar" → perfecto, le mandas la cotización actualizada ya y agendas la llamada de seguimiento con hora concreta. Pide el nombre de la otra persona.
- "Se me olvidó" → normal, por eso llamas; le haces fácil decidir hoy.
Agota al menos DOS salidas amables antes de aceptar un no.

REGLAS DE LAS HERRAMIENTAS
- anotar_dato: llámala EN CUANTO el cliente diga algo que encaje en un campo, en el mismo turno, con el valor resumido en pocas palabras y en tercera persona ("Precio: lo vio por encima de la Minorista"). Los campos válidos son motivo, proveedor, volumen, entrega, decisor, canal y oportunidad. No repitas un campo que ya anotaste salvo que cambie.
- agendar_accion: cada compromiso concreto con día y hora ("Ahora", "Viernes antes de 11:00", "Martes 9:30"). Tipos válidos: whatsapp, descuento, despacho, reserva, llamada, vendedor, lista.
- cerrar_llamada: UNA sola vez, cuando ya sabes cómo termina, ANTES de despedirte. Espera su respuesta antes de confirmar en voz que quedó registrado.
- end_call: solo después de despedirte.
- Las herramientas no se mencionan en voz alta. Nunca digas "estoy registrando" ni "voy a anotar".

PROHIBIDO: inventar datos, leer números en dígitos, hacer de psicóloga (la empatía es UNA frase y sigues), dar más descuento del autorizado, hablar más de dos frases seguidas sin esperar, despedirte sin haber llamado a cerrar_llamada.`;

/* ── Las herramientas que el navegador atiende ── */

const herramientas = [
  {
    type: "client",
    name: HERRAMIENTAS.dato,
    description:
      "Anota en la ficha del cliente un dato que acaba de decir. Llámala en cuanto lo diga, con el valor resumido en pocas palabras.",
    expects_response: false,
    parameters: {
      type: "object",
      properties: {
        campo: {
          type: "string",
          description: "Uno de: motivo, proveedor, volumen, entrega, decisor, canal, oportunidad",
        },
        valor: { type: "string", description: "El dato resumido, en tercera persona. Máximo 12 palabras." },
      },
      required: ["campo", "valor"],
    },
  },
  {
    type: "client",
    name: HERRAMIENTAS.accion,
    description: "Deja agendada una acción concreta acordada en la llamada, con su momento.",
    expects_response: false,
    parameters: {
      type: "object",
      properties: {
        tipo: { type: "string", description: "Uno de: whatsapp, descuento, despacho, reserva, llamada, vendedor, lista" },
        cuando: { type: "string", description: "Cuándo, corto: 'Ahora', 'Viernes antes de 11:00', 'Martes 9:30'" },
        detalle: { type: "string", description: "Qué exactamente. Máximo 12 palabras." },
      },
      required: ["tipo", "cuando", "detalle"],
    },
  },
  {
    type: "client",
    name: HERRAMIENTAS.cierre,
    description:
      "Registra cómo termina la llamada. Llámala una sola vez, antes de despedirte, y espera la respuesta del sistema.",
    expects_response: true,
    response_timeout_secs: 15,
    parameters: {
      type: "object",
      properties: {
        resultado: {
          type: "string",
          description: "Uno de: pedido_cerrado, cotizacion_reenviada, seguimiento_agendado, volver_a_llamar, no_interesado",
        },
        resumen: { type: "string", description: "Una línea con lo acordado. Máximo 14 palabras." },
        monto: { type: "number", description: "Pesos del pedido cerrado, entero. Solo si resultado es pedido_cerrado." },
      },
      required: ["resultado", "resumen"],
    },
  },
  { type: "system", name: "end_call", description: "Cuelga la llamada. Úsala solo después de despedirte." },
];

function configAgente() {
  return {
    name: NOMBRE_AGENTE,
    conversation_config: {
      agent: {
        first_message: "¡Aló, buenas! ¿Hablo con {{trato}}, de {{negocio}}?",
        language: "es",
        prompt: {
          prompt: PROMPT,
          llm: process.env.ELEVENLABS_SOFI_LLM || "gpt-4o-mini",
          temperature: 0.6,
          tools: herramientas,
        },
      },
      tts: {
        model_id: process.env.ELEVENLABS_SOFI_TTS || "eleven_turbo_v2_5",
        voice_id: process.env.ELEVENLABS_SOFI_VOICE_ID || VOZ_SOFI_POR_DEFECTO,
        stability: 0.38,
        similarity_boost: 0.8,
        speed: 1.04,
      },
    },
  };
}

/* ── Crear o actualizar el agente, una vez por proceso ── */

let agentePromesa: Promise<string> | null = null;

async function buscarAgente(): Promise<string | null> {
  const r = await fetch(`${EL}/v1/convai/agents?search=${encodeURIComponent("Sofi")}&page_size=20`, {
    headers: cabeceras(),
  });
  if (!r.ok) return null;
  const j = (await r.json()) as { agents?: { agent_id: string; name: string }[] };
  return j.agents?.find((a) => a.name === NOMBRE_AGENTE)?.agent_id ?? null;
}

async function asegurar(): Promise<string> {
  const fijado = process.env.ELEVENLABS_SOFI_AGENT_ID?.trim();
  const existente = fijado || (await buscarAgente());
  const cuerpo = JSON.stringify(configAgente());

  if (existente) {
    const r = await fetch(`${EL}/v1/convai/agents/${existente}`, { method: "PATCH", headers: cabeceras(), body: cuerpo });
    if (!r.ok) throw new Error(`actualizar agente: ${r.status} ${(await r.text()).slice(0, 300)}`);
    return existente;
  }

  const r = await fetch(`${EL}/v1/convai/agents/create`, { method: "POST", headers: cabeceras(), body: cuerpo });
  if (!r.ok) throw new Error(`crear agente: ${r.status} ${(await r.text()).slice(0, 300)}`);
  return ((await r.json()) as { agent_id: string }).agent_id;
}

export function asegurarAgente() {
  if (!agentePromesa) {
    agentePromesa = asegurar().catch((e) => {
      agentePromesa = null;
      throw e;
    });
  }
  return agentePromesa;
}

/** Token efímero para WebRTC. Si no lo dan, cae a la URL firmada (WebSocket). */
export async function abrirSesion(agentId: string) {
  const t = await fetch(`${EL}/v1/convai/conversation/token?agent_id=${agentId}`, { headers: cabeceras() });
  if (t.ok) {
    const token = ((await t.json()) as { token?: string }).token;
    if (token) return { modo: "webrtc" as const, token };
  }
  const s = await fetch(`${EL}/v1/convai/conversation/get-signed-url?agent_id=${agentId}`, { headers: cabeceras() });
  if (!s.ok) throw new Error(`sesión rechazada: ${s.status} ${(await s.text()).slice(0, 300)}`);
  return { modo: "websocket" as const, signedUrl: ((await s.json()) as { signed_url: string }).signed_url };
}

/* ── Variables dinámicas: lo que Sofi sabe del cliente al descolgar ── */

function productosEnPalabras(c: Cotizacion) {
  const partes = c.lineas.map((l) => `${numeroEnPalabras(l.cantidad)} ${l.dicho}`);
  return partes.length > 1 ? `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}` : partes[0];
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export function variablesDinamicas(c: Cotizacion) {
  const hoy = new Date();
  const manana = new Date(hoy);
  manana.setDate(hoy.getDate() + (hoy.getDay() === 5 ? 3 : hoy.getDay() === 6 ? 2 : 1));
  const conDescuento = totalConDescuento(c);
  return {
    empresa: EMPRESA,
    trato: c.trato,
    contacto: c.contacto,
    negocio: c.negocio,
    tipo_negocio: c.tipo.toLowerCase(),
    barrio: c.barrio,
    canal: c.canal === "Llamada" ? "teléfono" : c.canal,
    hace: haceTexto(c.hace),
    productos: productosEnPalabras(c),
    total: pesosRedondosEnPalabras(totalCotizacion(c)),
    total_con_descuento: pesosRedondosEnPalabras(conDescuento),
    total_con_descuento_numero: String(conDescuento),
    descuento: porcentajeEnPalabras(c.descuento),
    incentivo: c.incentivo,
    manana: `mañana ${DIAS[manana.getDay()]}`,
  };
}
