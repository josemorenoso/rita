'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const { initialState } = require('./data/clients');

const PORT = process.env.PORT || 3000;
const EL_KEY = process.env.ELEVENLABS_API_KEY;
const EL_LLM = process.env.ELEVENLABS_LLM || 'gpt-4o-mini';
const EL_TTS_MODEL = process.env.ELEVENLABS_TTS_MODEL || 'eleven_flash_v2_5';
const EL_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL'; // Sarah (femenina)
const EMPRESA = 'Inmobiliaria Prados del Norte';
const EL = 'https://api.elevenlabs.io';
const H = { 'xi-api-key': EL_KEY };

// ----- Estado en memoria (fuente de verdad) -----
let clients = initialState();
const RECUPERADOS = new Set(['pagara_hoy', 'ya_pago', 'acuerdo_pago']);

function kpis() {
  const carteraTotal = clients.reduce((s, c) => s + c.cuota, 0);
  const recuperadoHoy = clients
    .filter((c) => c.resultado && RECUPERADOS.has(c.resultado))
    .reduce((s, c) => s + (c.montoAcordado || c.cuota), 0);
  const llamadasHechas = clients.filter((c) => c.estado === 'Cerrado').length;
  const enMora = clients.filter((c) => !(c.resultado && RECUPERADOS.has(c.resultado))).length;
  return { carteraTotal, recuperadoHoy, llamadasHechas, enMora, total: clients.length };
}

// ----- SSE -----
const sseClients = new Set();
function broadcast(event) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of sseClients) { try { res.write(payload); } catch (_) {} }
}
function pushClient(c) { broadcast({ type: 'update', client: c, kpis: kpis() }); }

// ----- Monto en palabras (para que el agente lo pronuncie bien) -----
function spellBelow1000(n) {
  const u = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
    'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve',
    'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis',
    'veintisiete', 'veintiocho', 'veintinueve'];
  const dec = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
  const cen = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos',
    'setecientos', 'ochocientos', 'novecientos'];
  if (n < 30) return u[n];
  if (n < 100) { const d = Math.floor(n / 10), r = n % 10; return r ? dec[d] + ' y ' + u[r] : dec[d]; }
  if (n === 100) return 'cien';
  const c = Math.floor(n / 100), r = n % 100;
  return (cen[c] + (r ? ' ' + spellBelow1000(r) : '')).trim();
}
function numeroAPalabras(n) {
  n = Math.floor(n);
  if (n === 0) return 'cero pesos';
  const parts = [];
  const millones = Math.floor(n / 1000000);
  const miles = Math.floor((n % 1000000) / 1000);
  const resto = n % 1000;
  if (millones > 0) parts.push(millones === 1 ? 'un millón' : spellBelow1000(millones).replace(/uno$/, 'ún') + ' millones');
  if (miles > 0) parts.push(miles === 1 ? 'mil' : spellBelow1000(miles).replace(/uno$/, 'ún') + ' mil');
  if (resto > 0) parts.push(spellBelow1000(resto));
  return parts.join(' ') + ' pesos';
}
const money = (n) => '$' + Number(n || 0).toLocaleString('es-CO');

// ----- Agente ElevenLabs Conversational AI -----
const AGENT_FILE = path.join(__dirname, 'data', '.agent_id');

function agentConfig() {
  const prompt = `Eres "Valentina", asesora de cobranza de {{empresa}}, una inmobiliaria en Colombia. Estás en una llamada telefónica real con {{nombre}} por una cuota vencida. Hablas en español colombiano, con trato de USTED y tono de call center: cálido, cercano, POSITIVO y con energía (habla con una sonrisa), profesional y muy humano.

Datos en el sistema (NO los sueltes todos de golpe): inmueble {{inmueble}}; cuota de este mes vencida por {{monto_texto}}; {{mora}} días de mora; venció el {{vencimiento}}.

REGLA DE ORO: es una conversación telefónica natural, POR TURNOS. Avanza UNA sola idea por turno y ESPERA la respuesta antes de seguir. Nunca digas todo el guion de corrido. Frases cortas, como una persona real.

Flujo:
1. Ya saludaste con energía y preguntaste si hablas con {{nombre}}. ESPERA a que confirme.
2. Cuando confirme, preséntate breve y con calidez ("le saluda Valentina, de {{empresa}}") y pregúntale cómo está. ESPERA y contéstale con naturalidad.
3. Con tacto, dile el motivo Y en el MISMO turno hazle la pregunta clave: que en el sistema le aparece el pago de este mes vencido, por {{monto_texto}}, con {{mora}} días de mora; y a continuación "¿para cuándo cree usted que puede ponerse al día?". Es OBLIGATORIO cerrar ese turno con esa pregunta. ESPERA su respuesta.
4. NEGOCIA CON EMPATÍA Y SIEMPRE ENCUENTRA UNA SOLUCIÓN:
   - Si menciona una situación difícil, reconócelo en UNA sola frase breve ("claro, lo entiendo, {{nombre}}") y PASA de inmediato a proponer una solución de pago concreta. NO indagues en cómo se siente.
   - Tu objetivo es SIEMPRE cerrar un compromiso de pago CONCRETO. Si no puede pagar todo de una vez, ofrécele alternativas claras y flexibles:
     * Dividir en dos: un abono ahora o esta semana y el resto en una fecha concreta.
     * Varios pagos pequeños con fechas específicas.
     * Una fecha próxima para el pago completo.
   - Propón montos y fechas CONCRETAS (ej. "¿le sirve abonar la mitad esta semana y la otra mitad el día veinte?") y confírmalas con el cliente.
   - Agota al menos DOS alternativas amables antes de darte por vencida. Solo si se niega rotundamente a todo, tómalo como rechazo.
5. Cuando quede claro el compromiso (aunque sea un pago dividido), llama de inmediato a registrar_resultado_cobro con el resultado (usa acuerdo_pago cuando haya plan o fecha) y en fecha_compromiso escribe el plan concreto (ej. "cincuenta por ciento el 8 de agosto y el resto el 20 de agosto").
6. Después de registrar, DESPÍDETE bien: repite el acuerdo y las fechas para confirmar, agradece con calidez, dile que le llegará la confirmación y deséale un excelente día. Solo entonces usa end_call.

Recuerda: energía y calidez, trato de usted, una idea por turno, esperar respuestas. PROHIBIDO preguntar cómo se siente la persona o hacer de psicóloga/terapeuta: la empatía es UNA frase corta y enseguida propones cómo pagar. Nunca leas el monto como dígitos: dilo tal cual en {{monto_texto}}. No inventes datos. NUNCA te despidas sin un compromiso de pago concreto.`;

  return {
    name: 'Valentina - Cobros Inmobiliaria',
    conversation_config: {
      agent: {
        first_message: '¡Buenas, muy buenas! ¿Hablo con {{nombre}}?',
        language: 'es',
        prompt: {
          prompt,
          llm: EL_LLM,
          tools: [
            {
              type: 'client',
              name: 'registrar_resultado_cobro',
              description: 'Registra el resultado de la gestión de cobro. Llámala cuando el cliente confirme cómo y cuándo pagará. Espera la respuesta del sistema antes de confirmarle al cliente que quedó registrado.',
              expects_response: true,
              response_timeout_secs: 15,
              parameters: {
                type: 'object',
                properties: {
                  resultado: { type: 'string', description: 'Uno de: pagara_hoy, acuerdo_pago, ya_pago, no_puede, reprogramar, rechaza' },
                  fecha_compromiso: { type: 'string', description: 'Fecha o PLAN de pago acordado. Ej: "15 de agosto" o "50% el 8 de agosto y 50% el 20 de agosto". Opcional.' },
                },
                required: ['resultado'],
              },
            },
            { type: 'system', name: 'end_call', description: 'Termina la llamada después de despedirte cordialmente.' },
          ],
        },
      },
      tts: {
        model_id: EL_TTS_MODEL,
        voice_id: EL_VOICE_ID,
        stability: 0.4,          // más bajo = más expresiva/enérgica
        similarity_boost: 0.8,
        speed: 1.1,              // un poco más ágil
      },
    },
  };
}

let agentPromise = null;
async function ensureAgent() {
  // Borra el agente anterior (si existe) para no dejar duplicados y usar siempre la config actual.
  try {
    if (fs.existsSync(AGENT_FILE)) {
      const old = fs.readFileSync(AGENT_FILE, 'utf8').trim();
      if (old) await fetch(`${EL}/v1/convai/agents/${old}`, { method: 'DELETE', headers: H }).catch(() => {});
    }
  } catch (_) {}
  const r = await fetch(`${EL}/v1/convai/agents/create`, {
    method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(agentConfig()),
  });
  if (!r.ok) throw new Error(`crear agente: ${r.status} ${(await r.text()).slice(0, 300)}`);
  const id = (await r.json()).agent_id;
  try { fs.writeFileSync(AGENT_FILE, id); } catch (_) {}
  console.log('  Agente ElevenLabs listo:', id);
  return id;
}
function getAgent() { if (!agentPromise) agentPromise = ensureAgent(); return agentPromise; }

function dynamicVars(c) {
  return {
    empresa: EMPRESA,
    nombre: c.nombre,
    inmueble: c.inmueble,
    monto_texto: numeroAPalabras(c.cuota),
    monto: money(c.cuota),
    mora: String(c.diasMora),
    vencimiento: c.vencimiento,
  };
}

// ----- App -----
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/clients', (req, res) => {
  res.json({ empresa: EMPRESA, clients, kpis: kpis() });
});

app.get('/api/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write(`data: ${JSON.stringify({ type: 'snapshot', clients, kpis: kpis() })}\n\n`);
  sseClients.add(res);
  const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (_) {} }, 15000);
  req.on('close', () => { clearInterval(ping); sseClients.delete(res); });
});

// Devuelve un signed URL de ElevenLabs + variables dinámicas del cliente; marca "Llamando".
app.post('/api/session', async (req, res) => {
  const { clientId } = req.body || {};
  const c = clients.find((x) => x.id === Number(clientId));
  if (!c) return res.status(404).json({ error: 'Cliente no encontrado' });
  if (!EL_KEY) return res.status(500).json({ error: 'Falta ELEVENLABS_API_KEY en el archivo .env' });

  try {
    const agentId = await getAgent();

    // 1) Preferimos WebRTC (token): audio más estable, menos entrecortado.
    let mode = null, conversation_token = null, signed_url = null;
    try {
      const tr = await fetch(`${EL}/v1/convai/conversation/token?agent_id=${agentId}`, { headers: H });
      if (tr.ok) {
        const tok = (await tr.json()).token;
        if (tok) { mode = 'webrtc'; conversation_token = tok; }
      } else {
        console.warn('token webrtc ->', tr.status, (await tr.text()).slice(0, 150));
      }
    } catch (e) { console.warn('token webrtc err:', String(e)); }

    // 2) Fallback: signed URL (WebSocket).
    if (!mode) {
      const sr = await fetch(`${EL}/v1/convai/conversation/get-signed-url?agent_id=${agentId}`, { headers: H });
      if (!sr.ok) {
        const detail = await sr.text();
        console.error('get-signed-url error:', sr.status, detail);
        return res.status(502).json({ error: 'ElevenLabs rechazó la sesión', detail });
      }
      mode = 'websocket'; signed_url = (await sr.json()).signed_url;
    }

    c.estado = 'Llamando';
    c.resultado = null;
    pushClient(c);

    res.json({ mode, conversation_token, signed_url, dynamicVariables: dynamicVars(c), clientId: c.id });
  } catch (err) {
    console.error('Error al crear sesión:', err);
    res.status(500).json({ error: 'Error al crear la sesión de voz', detail: String(err) });
  }
});

// El navegador reporta el resultado que dictó la herramienta del agente.
app.post('/api/outcome', (req, res) => {
  const { clientId, resultado, fecha_compromiso, monto, nota } = req.body || {};
  const c = clients.find((x) => x.id === Number(clientId));
  if (!c) return res.status(404).json({ error: 'Cliente no encontrado' });
  c.estado = 'Cerrado';
  c.resultado = resultado || 'reprogramar';
  c.fechaCompromiso = fecha_compromiso || null;
  c.montoAcordado = typeof monto === 'number' ? monto : null;
  c.nota = nota || null;
  pushClient(c);
  res.json({ ok: true, client: c, kpis: kpis() });
});

app.post('/api/cancel', (req, res) => {
  const { clientId } = req.body || {};
  const c = clients.find((x) => x.id === Number(clientId));
  if (!c) return res.status(404).json({ error: 'Cliente no encontrado' });
  if (c.estado === 'Llamando') { c.estado = 'Pendiente'; pushClient(c); }
  res.json({ ok: true });
});

app.post('/api/reset', (req, res) => {
  clients = initialState();
  broadcast({ type: 'snapshot', clients, kpis: kpis() });
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`\n  ${EMPRESA} · Centro de Cobros IA (ElevenLabs)`);
  console.log(`  ➜  http://localhost:${PORT}`);
  console.log(`  Voz: ${EL_VOICE_ID} · Modelo TTS: ${EL_TTS_MODEL} · LLM: ${EL_LLM}`);
  if (!EL_KEY) console.log('  ⚠  Falta ELEVENLABS_API_KEY en .env (el modo voz no funcionará; usa "Simular").');
  console.log('');
});
