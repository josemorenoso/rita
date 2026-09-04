'use strict';

// ===================== estado local =====================
let CLIENTS = [];
let autoMode = false;
let stopping = false;
let active = null; // { clientId, conversation, gotOutcome, maxTimer }
const MAX_CALL_MS = 240000; // corte de seguridad (4 min): solo por si una llamada queda colgada

const $ = (id) => document.getElementById(id);
const listEl = $('list');
const transcriptEl = $('transcript');

const RESULT_META = {
  pagara_hoy:   { label: 'Pagará hoy',      ico: '✓', cls: 'good' },
  ya_pago:      { label: 'Ya pagó',         ico: '✓', cls: 'good' },
  acuerdo_pago: { label: 'Acuerdo de pago', ico: '✓', cls: 'good' },
  reprogramar:  { label: 'Reprograma',      ico: '•', cls: 'warn' },
  no_puede:     { label: 'No puede',        ico: '×', cls: 'bad'  },
  rechaza:      { label: 'Se niega',        ico: '×', cls: 'bad'  },
};

const money = (n) => '$' + Number(n || 0).toLocaleString('es-CO');

// ===================== render =====================
function statusChip(c) {
  if (c.estado === 'Llamando') return `<span class="chip calling">Llamando…</span>`;
  if (c.estado === 'Cerrado' && c.resultado) {
    const m = RESULT_META[c.resultado] || RESULT_META.reprogramar;
    const extra = c.fechaCompromiso ? ` · ${c.fechaCompromiso}` : '';
    return `<span class="chip ${m.cls}">${m.ico} ${m.label}${extra}</span>`;
  }
  return `<span class="chip pending">Pendiente</span>`;
}

function rowHTML(c) {
  return `
    <div class="cell-client">
      <div class="cli-name">${c.nombre}</div>
      <div class="cli-ced">CC ${c.cedula}</div>
    </div>
    <div class="cell-inmueble">${c.inmueble}<span class="venc">Vence ${c.vencimiento}</span></div>
    <div class="cell-amount"><span class="amount">${money(c.cuota)}</span></div>
    <div class="mora"><span class="mora-badge">${c.diasMora} d</span></div>
    <div class="cell-status">${statusChip(c)}</div>`;
}

function renderList() {
  listEl.innerHTML = '';
  for (const c of CLIENTS) {
    const div = document.createElement('div');
    div.className = 'row' + (c.estado === 'Llamando' ? ' calling' : c.estado === 'Cerrado' ? ' closed' : '');
    div.id = 'row-' + c.id;
    div.innerHTML = rowHTML(c);
    listEl.appendChild(div);
  }
  $('list-count').textContent = CLIENTS.length;
}

function updateRow(c, flash) {
  const i = CLIENTS.findIndex((x) => x.id === c.id);
  if (i >= 0) CLIENTS[i] = { ...CLIENTS[i], ...c };
  const el = $('row-' + c.id);
  if (!el) return renderList();
  el.className = 'row' + (c.estado === 'Llamando' ? ' calling' : c.estado === 'Cerrado' ? ' closed' : '');
  el.innerHTML = rowHTML(CLIENTS[i]);
  if (flash) { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 900); }
}

function renderKpis(k) {
  if (!k) return;
  $('kpi-cartera').textContent = money(k.carteraTotal);
  $('kpi-mora').textContent = k.enMora;
  $('kpi-recuperado').textContent = money(k.recuperadoHoy);
  $('kpi-llamadas').textContent = k.llamadasHechas;
}

// ===================== transcripción =====================
function addLine(who, text, cls) {
  const div = document.createElement('div');
  div.className = 'line ' + cls;
  div.innerHTML = `<span class="who">${who}</span>${text}`;
  transcriptEl.appendChild(div);
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
  return div;
}
function clearTranscript() { transcriptEl.innerHTML = ''; }

// ===================== cabina =====================
function showCalling(c, stateText) {
  $('nc-empty').classList.add('hidden');
  $('nc-card').classList.remove('hidden');
  $('nc-state').textContent = stateText || 'En llamada';
  $('nc-name').textContent = c.nombre;
  $('nc-meta').textContent = `${c.inmueble} · ${c.diasMora} días mora`;
  $('nc-amount').textContent = money(c.cuota);
  $('equalizer').classList.add('active');
}
function hideCalling() {
  $('nc-card').classList.add('hidden');
  $('nc-empty').classList.remove('hidden');
  $('equalizer').classList.remove('active');
}
function setState(t) { const el = $('nc-state'); if (el) el.textContent = t; }

// ===================== visualizador de ondas (datos reales del SDK) =====================
function roundRect(cx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  cx.beginPath();
  cx.moveTo(x + r, y);
  cx.arcTo(x + w, y, x + w, y + h, r);
  cx.arcTo(x + w, y + h, x, y + h, r);
  cx.arcTo(x, y + h, x, y, r);
  cx.arcTo(x, y, x + w, y, r);
  cx.closePath();
}

const Viz = {
  raf: null, canvas: null, cctx: null, provider: null, t: 0,
  start(canvas, provider) {
    this.canvas = canvas; this.cctx = canvas.getContext('2d'); this.provider = provider;
    if (this.raf) return;
    const loop = () => { this.draw(); this.raf = requestAnimationFrame(loop); };
    loop();
  },
  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null; this.provider = null;
    if (this.cctx && this.canvas) this.cctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  },
  draw() {
    const cv = this.canvas, cx = this.cctx; if (!cv || !cx) return;
    this.t += 0.05;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(cv.clientWidth * dpr));
    const h = Math.max(1, Math.round(cv.clientHeight * dpr));
    if (cv.width !== w) cv.width = w;   // solo re-aloca si cambió el tamaño
    if (cv.height !== h) cv.height = h;
    cx.clearRect(0, 0, w, h);
    const bins = 42;
    const data = this.provider ? this.provider() : null;
    const barW = Math.max(3 * dpr, w / (bins * 2.4));
    const gap = barW * 0.95;
    const center = w / 2;
    for (let i = 0; i < bins; i++) {
      let v;
      if (data && data.length) {
        const idx = Math.min(data.length - 1, Math.floor(i * (data.length * 0.55) / bins));
        v = (data[idx] || 0) / 255;
      } else {
        // reposo: onda suave para que nunca se vea muerto
        v = 0.06 + 0.05 * Math.abs(Math.sin(this.t + i * 0.5));
      }
      const bh = Math.max(4 * dpr, Math.pow(v, 0.85) * h * 0.92);
      const y = (h - bh) / 2;
      cx.fillStyle = '#111111';
      roundRect(cx, center + i * (barW + gap), y, barW, bh, barW / 2); cx.fill();
      if (i > 0) { roundRect(cx, center - i * (barW + gap) - barW, y, barW, bh, barW / 2); cx.fill(); }
    }
  },
};

// Lee las frecuencias del SDK de ElevenLabs (voz del agente + tu micrófono).
function elProvider() {
  const conv = active && active.conversation;
  if (!conv) return null;
  let out = null, inp = null;
  try { out = conv.getOutputByteFrequencyData && conv.getOutputByteFrequencyData(); } catch (_) {}
  try { inp = conv.getInputByteFrequencyData && conv.getInputByteFrequencyData(); } catch (_) {}
  const L = (out && out.length) || (inp && inp.length) || 0;
  if (!L) return null;
  const res = new Uint8Array(L);
  for (let i = 0; i < L; i++) res[i] = Math.max(out ? out[i] : 0, inp ? inp[i] : 0);
  return res;
}

// ===================== overlay pantalla completa =====================
function showOverlay(c) {
  $('ov-name').textContent = c.nombre;
  $('ov-meta').textContent = `${c.inmueble} · ${c.diasMora} días de mora`;
  $('ov-amount').textContent = money(c.cuota);
  $('ov-caption').textContent = '';
  $('ov-status').textContent = 'Llamando…';
  $('ov-result').className = 'ov-result hidden';
  $('ov-phone').classList.remove('hidden');
  $('call-overlay').classList.remove('hidden');
}
function overlayState(text) { const el = $('ov-status'); if (el) el.textContent = text; }
function overlayCaption(text) { const el = $('ov-caption'); if (el) el.textContent = text; }
function overlayResult(meta, args) {
  const r = $('ov-result');
  const extra = args && args.fecha_compromiso ? ' · ' + args.fecha_compromiso : '';
  r.className = 'ov-result ' + meta.cls;
  r.textContent = `${meta.ico} ${meta.label}${extra}`;
  overlayState('Acuerdo registrado');
  $('ov-phone').classList.add('hidden');
  overlayCaption('');
}
function hideOverlay() { $('call-overlay').classList.add('hidden'); }

// ===================== toast =====================
let toastT;
function toast(msg, isErr) {
  let t = $('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.className = 'toast show' + (isErr ? ' err' : '');
  clearTimeout(toastT);
  toastT = setTimeout(() => { t.className = 'toast' + (isErr ? ' err' : ''); }, 4000);
}

// ===================== SSE =====================
function connectEvents() {
  const es = new EventSource('/api/events');
  es.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'snapshot') { CLIENTS = msg.clients; renderList(); renderKpis(msg.kpis); }
    else if (msg.type === 'update') { updateRow(msg.client, msg.client.estado === 'Cerrado'); renderKpis(msg.kpis); }
  };
  es.onerror = () => {};
}

// ===================== SDK de ElevenLabs (carga diferida) =====================
let _sdk;
function loadSDK() {
  if (!_sdk) {
    _sdk = import('https://cdn.jsdelivr.net/npm/@elevenlabs/client/+esm')
      .catch(() => import('https://esm.sh/@elevenlabs/client'));
  }
  return _sdk;
}

// ===================== llamada =====================
function nextPending() { return CLIENTS.find((c) => c.estado === 'Pendiente'); }

async function startCall(clientId) {
  if (active) return;
  const c = CLIENTS.find((x) => x.id === clientId);
  if (!c) return;

  clearTranscript();
  showCalling(c, 'Conectando…');
  showOverlay(c);
  addLine('Sistema', `Llamando a ${c.nombre}…`, 'sys');
  $('btn-next').disabled = true;
  $('btn-all').disabled = true;
  $('btn-stop').disabled = false;

  active = { clientId, gotOutcome: false, conversation: null, maxTimer: null };

  // 1) signed URL + variables del cliente
  let session;
  try {
    const r = await fetch('/api/session', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId }),
    });
    session = await r.json();
    if (!r.ok) throw new Error(session.error || 'No se pudo crear la sesión');
  } catch (err) {
    toast('Error: ' + err.message, true);
    addLine('Sistema', 'No se pudo iniciar la sesión de voz. Revisa ELEVENLABS_API_KEY.', 'sys');
    return endCall(false);
  }

  // 2) SDK
  let Conversation;
  try { ({ Conversation } = await loadSDK()); }
  catch (err) { toast('No se pudo cargar el SDK de voz (revisa tu internet).', true); return endCall(false); }

  // 3) inicia la conversación (el SDK pide el micrófono)
  try {
    const opts = {
      connectionType: session.mode === 'webrtc' ? 'webrtc' : 'websocket',
      dynamicVariables: session.dynamicVariables,
      clientTools: {
        registrar_resultado_cobro: async (params) => {
          handleOutcome(params || {});
          // Pausa de "procesamiento" para que se note el tiempo antes de confirmar.
          await new Promise((r) => setTimeout(r, 2000));
          return 'Listo, el acuerdo quedó registrado correctamente en el sistema.';
        },
      },
      onConnect: () => { setState('En llamada'); overlayState('En llamada'); },
      onDisconnect: () => { endCall(true); },
      onError: (msg) => { console.error('[elevenlabs] error:', msg); toast('ElevenLabs: ' + ((msg && msg.message) || msg || 'error'), true); },
      onModeChange: ({ mode }) => { if (!active || !active.gotOutcome) overlayState(mode === 'speaking' ? 'Valentina hablando…' : 'Escuchando…'); },
      onMessage: (props) => {
        const src = props && (props.source || props.role);
        const text = props && (props.message || props.text);
        if (!text) return;
        if (src === 'ai' || src === 'agent') { addLine('Valentina', text, 'agent'); overlayCaption(text); }
        else if (src === 'user') { addLine('Cliente', text, 'user'); }
      },
    };
    if (session.mode === 'webrtc') opts.conversationToken = session.conversation_token;
    else opts.signedUrl = session.signed_url;
    const conversation = await Conversation.startSession(opts);
    active.conversation = conversation;
    Viz.start($('ov-wave'), elProvider);
    active.maxTimer = setTimeout(() => {
      addLine('Sistema', '⏱ Corte de seguridad: llamada finalizada.', 'sys');
      autoMode = false;
      endCall(true);
    }, MAX_CALL_MS);
  } catch (err) {
    console.error(err);
    toast('Error de conexión de voz: ' + (err.message || err), true);
    addLine('Sistema', 'Falló la conexión o el permiso del micrófono.', 'sys');
    return endCall(false);
  }
}

async function handleOutcome(args) {
  if (!active) return;
  const meta = RESULT_META[args.resultado] || RESULT_META.reprogramar;
  active.gotOutcome = true;
  active.resultMeta = meta;
  active.resultArgs = args;
  // Actualiza el dashboard por detrás, pero NO muestres el resultado grande todavía:
  // dejamos que Valentina confirme y se despida; el "Acuerdo registrado" aparece al colgar.
  addLine('Sistema', 'Registrando acuerdo…', 'sys');
  overlayState('Registrando acuerdo…');
  try {
    await fetch('/api/outcome', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: active.clientId, ...args }),
    });
  } catch (_) {}
  // No colgamos aquí: Valentina se despide y llama a end_call (onDisconnect cerrará).
}

function endCall(ok) {
  const a = active;
  if (!a) return; // idempotente
  active = null;
  if (a.maxTimer) clearTimeout(a.maxTimer);
  try { a.conversation && a.conversation.endSession(); } catch (_) {}
  if (!a.gotOutcome) fetch('/api/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: a.clientId }) }).catch(() => {});
  Viz.stop();
  hideCalling();
  $('btn-stop').disabled = true;
  $('btn-next').disabled = false;
  $('btn-all').disabled = false;

  // Ahora sí: muestra el resultado grande (al despedirse/colgar), no en medio de la llamada.
  if (a.gotOutcome && a.resultMeta) {
    overlayResult(a.resultMeta, a.resultArgs);
    addLine('Sistema', `${a.resultMeta.ico} Acuerdo registrado`, 'sys');
  }
  const showResultMs = a.gotOutcome ? 2800 : 0;
  setTimeout(() => {
    hideOverlay();
    if (autoMode && !stopping) {
      const next = nextPending();
      if (next) { stopping = false; return startCall(next.id); }
      autoMode = false;
      toast('✅ Ronda de cobros completada');
    }
    stopping = false;
  }, showResultMs);
}

// ===================== controles =====================
$('btn-next').addEventListener('click', () => {
  const c = nextPending();
  if (!c) return toast('No hay clientes pendientes. Reinicia el demo.');
  autoMode = false;
  startCall(c.id);
});

$('btn-all').addEventListener('click', () => {
  const c = nextPending();
  if (!c) return toast('No hay clientes pendientes. Reinicia el demo.');
  autoMode = true; stopping = false;
  startCall(c.id);
});

$('btn-stop').addEventListener('click', () => {
  autoMode = false; stopping = true;
  if (active) endCall(false); else stopping = false;
});

$('ov-hangup').addEventListener('click', () => {
  autoMode = false; stopping = true;
  if (active) endCall(false); else { stopping = false; hideOverlay(); }
});

// Simular resultado (sin voz) para probar la animación del dashboard
const SIM_RESULTS = ['pagara_hoy', 'acuerdo_pago', 'ya_pago', 'no_puede', 'reprogramar'];
$('btn-sim').addEventListener('click', () => {
  const c = active ? CLIENTS.find((x) => x.id === active.clientId) : nextPending();
  if (!c) return toast('No hay clientes pendientes.');
  const resultado = SIM_RESULTS[Math.floor(Math.random() * SIM_RESULTS.length)];
  const fecha = resultado === 'acuerdo_pago' ? '15 de agosto' : null;
  fetch('/api/outcome', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: c.id, resultado, fecha_compromiso: fecha }),
  }).then(() => toast('Resultado simulado para ' + c.nombre));
});

$('btn-reset').addEventListener('click', () => {
  if (active) endCall(false);
  autoMode = false;
  fetch('/api/reset', { method: 'POST' }).then(() => { clearTranscript(); toast('Demo reiniciado'); });
});

// ===================== init =====================
async function init() {
  try {
    const r = await fetch('/api/clients');
    const data = await r.json();
    CLIENTS = data.clients;
    renderList();
    renderKpis(data.kpis);
  } catch (_) { toast('No se pudo cargar la lista', true); }
  connectEvents();
}
init();
