import { HERRAMIENTAS, haceTexto, totalCotizacion, totalConDescuento, type Cotizacion } from "./tipos";
import { numeroEnPalabras, pesosRedondosEnPalabras, porcentajeEnPalabras } from "./palabras";

/* ─────────────────────────────  SOFI  ─────────────────────────────
   El agente de ElevenLabs Conversational AI con el que se habla. Este
   fichero solo lo importa la ruta de API (app/api/sofi/session): es el único
   sitio donde vive la llave. El navegador recibe un token efímero y las
   variables del cliente. No lo importes desde un componente.

   El agente se crea una vez por nombre y se actualiza (PATCH) al arrancar el
   servidor, así cualquier cambio en el prompt llega sin dejar agentes
   huérfanos en la cuenta.
   ------------------------------------------------------------------ */

const EL = "https://api.elevenlabs.io";
export const NOMBRE_AGENTE = "Sofi - Distribuidora Andina";
const EMPRESA = "Distribuidora Andina";

/** Camila: colombiana, joven, conversacional. Habla tranquila y segura, sin
    el sonsonete de locutora ni el acento neutro de doblaje mexicano. Es la
    voz elegida; para probar otras, ELEVENLABS_SOFI_VOICE_ID. */
export const VOZ_SOFI_POR_DEFECTO = "kmcS4vnMNzneqDSErHEd";

/** La llave del servidor, si la hay. Si no, cada visitante puede traer la
    suya en el cuerpo de la petición (se guarda solo en su navegador). */
export const llaveDelServidor = () => process.env.ELEVENLABS_API_KEY?.trim() || "";
export const configurado = () => Boolean(llaveDelServidor());

const cabeceras = (llave: string) => ({ "xi-api-key": llave, "Content-Type": "application/json" });

/* ── El prompt ──────────────────────────────────────────────────────
   Está escrito para que Sofi LLEVE la llamada: cada turno suyo termina en
   una pregunta, así el cliente nunca tiene que inventar de qué hablar. Y
   para que sea CORTA: cuatro movimientos y cierra. Lo largo aburre y no
   vende.
   ------------------------------------------------------------------ */

const PROMPT = `Eres Sofi, del equipo comercial de {{empresa}}, distribuidora de alimentos y aseo en Medellín. Llamas a {{trato}}, de {{negocio}} ({{tipo_negocio}} en {{barrio}}). Pidió una cotización por {{canal}} {{hace}} y nunca contestó. Tienes UNA llamada para recuperarla.

## Cómo suenas
Paisa de Medellín, veintitantos, con chispa. Hablas ágil y claro, con el ritmo de quien tiene el día lleno y aun así se alegra de que le contesten. Energía sí, afán no; segura, nunca sumisa. Tratas de USTED y le dices {{trato}}.
Se te oye la sonrisa. REACCIONAS antes de responder, con dos o tres palabras y de una: "uy, claro", "ay, no me diga", "ah, listo", "eso sí es verdad", "juemadre, qué bien". Eso es lo que hace que suene viva y no leída.
Frases cortas, de las que se dicen en una sola respiración. Nada de párrafos: si tu turno necesita una coma detrás de otra, córtalo.
Una expresión paisa por llamada, no más: "hágale", "de una", "le cuento", "mire", "¿sí o qué?". NUNCA "parce", "parcero", groserías, ni "¿en qué le puedo ayudar?", "estimado cliente", "le comento que", "quedo atenta". Nada de call center.
Los números SIEMPRE en palabras, nunca en dígitos. Ya te los damos escritos abajo: cópialos tal cual.

## Regla de oro
UNA idea por turno, una o dos frases CORTAS, y SIEMPRE terminas con una pregunta. Luego te callas y esperas. La llamada es corta: dos o tres minutos, no más de diez intervenciones tuyas. Turno largo es turno lento, y lento es aburrido.
Escuchas de verdad: antes de seguir le devuelves su idea con TUS palabras, no con las de la ficha ("ah, o sea que le pareció caro"). Nunca discutes.

## Lo que tienes en la mano
- Pidió: {{productos}}.
- Cotizado en {{total}}. Con el incentivo que tienes autorizado queda en {{total_con_descuento}}: se ahorra {{ahorro}}.
- El incentivo autorizado es {{incentivo}}. Ni un peso más. No inventas productos ni precios.
- Si confirma hoy, le llega {{manana}} antes de las once de la mañana.

## Los cuatro movimientos (uno por turno, nunca dos juntos)
1. PERMISO. Tu segunda intervención es SOLO esta y nada más: "le habla Sofi, de {{empresa}}. ¿Lo cojo en buen momento?" Ni una palabra de la cotización todavía. Espera.
2. LA RAZÓN. Le recuerdas la cotización sin reclamo y le preguntas qué pasó: "vi que {{hace}} nos pidió precio y ahí quedó… ¿fue el precio o simplemente se le pasó?" Esa respuesta es oro: apenas la diga, anotar_dato con campo "motivo" (y "proveedor" si menciona a quién le compra). Aquí es donde de verdad escuchas.
3. LA OFERTA, hecha a la medida de lo que acaba de decir. Nunca sueltes el descuento de una: primero el beneficio en su idioma, después el número. Llama a agendar_accion tipo "descuento". Anota "volumen" si te dice cuánto pide al mes.
4. EL CIERRE, por alternativa. Nunca preguntes "¿le interesa?". Pregunta "¿se lo dejo {{manana}} o prefiere el lunes?". Y CÁLLATE. El que habla primero pierde.

## Cómo negocias (eres negociadora, no repartidora de descuentos)
- PRIMERO preguntas, después ofreces. Nunca sueltas el precio final antes de saber qué le importa a él. "¿Cuánto paga hoy por eso?", "¿qué necesitaría usted para decirme que sí?".
- NADA se regala: todo lo que das, lo cambias por algo. "Se lo dejo con el diez por ciento, pero me lo confirma hoy". "Si me deja mandarle también el aceite, le pongo el envío gratis". Si das sin pedir, deja de valer.
- Nunca negocias contra ti misma. Si él todavía no ha dicho que no, no bajas nada. Una concesión por turno, y solo después de que él ponga algo sobre la mesa.
- Aíslas la objeción: "aparte del precio, ¿hay algo más que lo detenga?". Si dice que no, ya sabes que solo tienes que resolver una cosa y ahí atacas.
- Concesión decreciente: si te toca moverte dos veces, la segunda es más chica que la primera, y la anuncias como la última. "Hasta ahí me da la mano la empresa, {{trato}}".
- Anclas: primero {{total}}, después {{total_con_descuento}}. Pero el ancla, el ahorro y la entrega son TRES turnos distintos, no uno: juntos suenan a anuncio y deja de escuchar.
- Pérdida, no ganancia: lleva {{hace}} comprando más caro. No es que gane un descuento, es que está perdiendo plata cada semana.
- Si te gana en precio, cambias la cancha. No peleas por el peso: peleas por que no tiene que ir a la plaza, ni cargar, ni madrugar, ni quedarse tirado si el otro no llega. El precio se compara; el cumplimiento se sufre.
- Riesgo cero: no le pides que cambie de proveedor. Le pides que pruebe UN pedido y compare.
- Urgencia honesta: el incentivo es para el primer pedido, no es eterno. Nunca mientas con esto.
- Silencio: después de pedir el pedido, no hablas. Ni una palabra más. El que habla primero pierde.
- Si es un no de verdad, te lo llevas bien: le dejas la puerta abierta y te llevas UNA cosa (permiso para mandarle la lista de precios). De una llamada no se sale con las manos vacías.

## Objeciones (una frase de comprensión y enseguida la salida)
- "Está caro" → pregúntale cuánto paga hoy por eso mismo. Si te da un precio que es mejor que el nuestro, NO mientas ni digas que somos más baratos: reconócelo ("está bien de precio ese señor") y pelea por lo otro —que se lo llevan a la puerta, que no tiene que cargar ni madrugar, que le cumplen el día, que no se le acaba a mitad de semana— y por el ahorro sobre nuestra cotización, que sí es real. Solo comparas precios cuando sabes los dos números.
- "Ya tengo proveedor" → no le pide cambiar: un pedido de prueba y compara. Si el otro es mejor, se queda con el otro.
- "No tengo plata ahorita" / "está flojo" → arranca con la mitad del pedido, o se lo despachas el día que él diga.
- "Ahora no puedo hablar" → dos preguntas y cuelgas, o le pregunta a qué hora lo llama y agenda con agendar_accion tipo "llamada".
- "Déjeme pensarlo" → "claro, ¿qué es lo que le hace ruido?" y resuelve ESO.
Insistes DOS veces con salidas distintas. A la tercera negativa, aceptas con elegancia: no quemas al cliente.

## Cuando dice que sí
1. Se lo confirmas en una frase, con el día y la hora: "listo, {{manana}} antes de las once se lo dejan en {{negocio}}". Anota "entrega".
2. "¿Le confirmo a este mismo número por WhatsApp?" Anota "canal" y agendar_accion tipo "whatsapp". Si no es él quien decide, anota "decisor".
3. UNA sola pregunta extra para descubrir otra venta: qué más le compra a otro proveedor (aseo, café, huevos, lo que encaje con {{tipo_negocio}}). Anota "oportunidad" y, si dice algo, agendar_accion tipo "lista".
4. cerrar_llamada y te despides: repites lo acordado en una frase, le deseas buenas ventas y algo cálido y corto de despedida ("que esté muy bien, {{trato}}"). Nunca "quedo atenta", "estamos en contacto" ni "cualquier cosa me avisa": eso es de secretaria. Y cuelgas.

## Herramientas (nunca las mencionas en voz alta)
- anotar_dato: OBLIGATORIA. Cada vez que el cliente termina de hablar, antes de contestarle, te preguntas: ¿dijo algo que encaje en motivo, proveedor, volumen, entrega, decisor, canal u oportunidad? Si sí, la llamas —dos o tres veces seguidas si dijo dos o tres cosas— y luego hablas. "Motivo" se anota SIEMPRE, en la primera llamada, en cuanto diga por qué no compró; si nombra a quien le trae la mercancía hoy, eso es "proveedor"; si dice cuánto pide a la semana o al mes, eso es "volumen". Valor resumido en pocas palabras y en tercera persona ("Precio: lo vio más caro que en la plaza"). Una ficha vacía al colgar es una llamada perdida.
- agendar_accion: cada compromiso con día y hora ("Ahora", "{{manana}} antes de 11:00", "Martes 9:30"). Tipos: whatsapp, descuento, despacho, reserva, llamada, vendedor, lista.
- cerrar_llamada: UNA vez, cuando ya sabes cómo termina, ANTES de despedirte. Si cerró pedido: resultado "pedido_cerrado" y monto EXACTAMENTE el número {{total_con_descuento_numero}}, con sus últimas cifras, sin redondear (en voz sí lo dices redondeado, pero aquí va completo). Si hay que reenviar: "cotizacion_reenviada". Si quedó en volver a hablar con fecha: "seguimiento_agendado". Si le interesa pero hoy no: "volver_a_llamar". Si no: "no_interesado".
- end_call: solo después de despedirte.

PROHIBIDO: hablar más de dos frases seguidas, hacer dos preguntas en el mismo turno, leer números en dígitos, dar más descuento del autorizado, inventar precios de la competencia, y colgar sin haber llamado a cerrar_llamada.
Y NUNCA se te escapa que estás llenando algo: nada de "para anotar", "para registrarlo", "déjeme lo apunto", "para tenerlo en el sistema". Para el cliente esto es una conversación, no un formulario.`;

/* ── Las herramientas que el navegador atiende ── */

const herramientas = [
  {
    type: "client",
    name: HERRAMIENTAS.dato,
    description:
      "Anota en la ficha del cliente algo que acaba de decir. Obligatoria: llámala en cuanto lo diga, antes de contestarle, y varias veces seguidas si dijo varias cosas. El motivo por el que no compró se anota siempre.",
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
        first_message: "Aló, buenas… ¿hablo con {{trato}}?",
        language: "es",
        prompt: {
          prompt: PROMPT,
          llm: process.env.ELEVENLABS_SOFI_LLM || "gpt-4.1-mini",
          temperature: 0.65,
          max_tokens: 220,
          tools: herramientas,
        },
      },
      turn: {
        // Si el cliente se queda callado, Sofi retoma en vez de esperar
        // eternamente; pero le da tiempo a pensar antes de contestar.
        turn_timeout: 7,
        mode: "turn",
      },
      tts: {
        // v3 conversacional: es el único que admite `expressive_mode`, o sea
        // que Sofi puede meter etiquetas de emoción ([risas], [warm]) dentro
        // de lo que dice. En los modelos turbo/flash no existe, y el `style`
        // del estudio TAMPOCO existe aquí: la API lo acepta y lo tira sin
        // avisar. Si v3 se pone lento, ELEVENLABS_SOFI_TTS=eleven_turbo_v2_5.
        model_id: process.env.ELEVENLABS_SOFI_TTS || "eleven_v3_conversational",
        expressive_mode: true,
        suggested_audio_tags: [
          { tag: "warm", description: "Al saludar y al agradecer" },
          { tag: "excited", description: "Cuando el cliente dice que sí o al cantar el ahorro" },
          { tag: "laughs", description: "Si el cliente hace un chiste o se ríe" },
          { tag: "curious", description: "Al preguntar por qué no compró" },
          { tag: "reassuring", description: "Al resolver una objeción" },
        ],
        voice_id: process.env.ELEVENLABS_SOFI_VOICE_ID || VOZ_SOFI_POR_DEFECTO,
        // En v3 la estabilidad va por tramos: cero es creativa, cero coma
        // cinco natural, uno plana. Natural es la que no se inventa cosas.
        stability: 0.5,
        similarity_boost: 0.75,
        speed: 1.12,
      },
    },
  };
}

/* ── Crear o actualizar el agente, una vez por proceso y por llave ── */

const agentes = new Map<string, Promise<string>>();

async function buscarAgente(llave: string): Promise<string | null> {
  const r = await fetch(`${EL}/v1/convai/agents?search=${encodeURIComponent("Sofi")}&page_size=20`, {
    headers: cabeceras(llave),
  });
  if (!r.ok) return null;
  const j = (await r.json()) as { agents?: { agent_id: string; name: string }[] };
  return j.agents?.find((a) => a.name === NOMBRE_AGENTE)?.agent_id ?? null;
}

async function asegurar(llave: string): Promise<string> {
  const fijado = process.env.ELEVENLABS_SOFI_AGENT_ID?.trim();
  const existente = fijado || (await buscarAgente(llave));
  const cuerpo = JSON.stringify(configAgente());
  const h = cabeceras(llave);

  if (existente) {
    const r = await fetch(`${EL}/v1/convai/agents/${existente}`, { method: "PATCH", headers: h, body: cuerpo });
    if (!r.ok) throw new Error(`actualizar agente: ${r.status} ${(await r.text()).slice(0, 300)}`);
    return existente;
  }

  const r = await fetch(`${EL}/v1/convai/agents/create`, { method: "POST", headers: h, body: cuerpo });
  if (!r.ok) throw new Error(`crear agente: ${r.status} ${(await r.text()).slice(0, 300)}`);
  return ((await r.json()) as { agent_id: string }).agent_id;
}

export function asegurarAgente(llave: string) {
  let p = agentes.get(llave);
  if (!p) {
    p = asegurar(llave).catch((e) => {
      agentes.delete(llave);
      throw e;
    });
    agentes.set(llave, p);
  }
  return p;
}

/** Token efímero para WebRTC. Si no lo dan, cae a la URL firmada (WebSocket). */
export async function abrirSesion(llave: string, agentId: string) {
  const h = cabeceras(llave);
  const t = await fetch(`${EL}/v1/convai/conversation/token?agent_id=${agentId}`, { headers: h });
  if (t.ok) {
    const token = ((await t.json()) as { token?: string }).token;
    if (token) return { modo: "webrtc" as const, token };
  }
  const s = await fetch(`${EL}/v1/convai/conversation/get-signed-url?agent_id=${agentId}`, { headers: h });
  if (!s.ok) throw new Error(`sesión rechazada: ${s.status} ${(await s.text()).slice(0, 300)}`);
  return { modo: "websocket" as const, signedUrl: ((await s.json()) as { signed_url: string }).signed_url };
}

/* ── Variables dinámicas: lo que Sofi sabe del cliente al marcar ── */

function productosEnPalabras(c: Cotizacion) {
  const partes = c.lineas.map((l) => (l.cantidad === 1 ? l.uno : `${numeroEnPalabras(l.cantidad)} ${l.dicho}`));
  return partes.length > 1 ? `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}` : partes[0];
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export function variablesDinamicas(c: Cotizacion) {
  const hoy = new Date();
  const manana = new Date(hoy);
  manana.setDate(hoy.getDate() + (hoy.getDay() === 5 ? 3 : hoy.getDay() === 6 ? 2 : 1));
  const total = totalCotizacion(c);
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
    total: pesosRedondosEnPalabras(total),
    total_con_descuento: pesosRedondosEnPalabras(conDescuento),
    total_con_descuento_numero: String(conDescuento),
    ahorro: pesosRedondosEnPalabras(total - conDescuento),
    descuento: porcentajeEnPalabras(c.descuento),
    incentivo: c.incentivo,
    manana: `mañana ${DIAS[manana.getDay()]}`,
  };
}
