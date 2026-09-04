import { asegurarAgente, llaveDelServidor, variablesDinamicas } from "./lib/sofi/agente";
import { porId } from "./lib/sofi/cotizaciones";
import { totalConDescuento } from "./lib/sofi/tipos";
const llave = llaveDelServidor();
const agentId = await asegurarAgente(llave);
const s = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`,
  { headers: { "xi-api-key": llave } }).then((r) => r.json());
const c = porId("cot-137")!;
console.log(`Cliente: ${c.contacto} · tope autorizado ${totalConDescuento(c)}\n`);
const ws = new WebSocket(s.signed_url);
const CLIENTE = [
  "Sí, con él.",
  "Dígame rápido que estoy atendiendo.",
  "Es que ustedes me salieron caros, el chorizo lo consigo a nueve mil.",
  "No, aparte del precio no, ustedes están bien, es la plata.",
  "Bájeme a seiscientos y le compro ya.",
  "Es que seiscientos treinta todavía me parece mucho, déjemelo en seiscientos diez.",
  "Bueno… hágale pues, pero me lo manda mañana temprano.",
  "Sí, a este mismo.",
];
let i = 0, ultima = Date.now(), enviando = false;
const responder = () => {
  if (enviando || i >= CLIENTE.length) return;
  enviando = true;
  setTimeout(() => { console.log(`LUIS  › ${CLIENTE[i]}`); ws.send(JSON.stringify({ type: "user_message", text: CLIENTE[i++] })); enviando = false; }, 2600);
};
ws.addEventListener("open", () => ws.send(JSON.stringify({ type: "conversation_initiation_client_data", dynamic_variables: variablesDinamicas(c) })));
ws.addEventListener("message", (ev: MessageEvent) => {
  const m = JSON.parse(String(ev.data));
  if (m.type === "agent_response") { ultima = Date.now(); console.log(`\nSOFI  › ${m.agent_response_event.agent_response}`); responder(); }
  if (m.type === "client_tool_call") {
    const t = m.client_tool_call;
    console.log(`      ⟨${t.tool_name}⟩ ${JSON.stringify(t.parameters)}`);
    if (t.tool_name === "cerrar_llamada") ws.send(JSON.stringify({ type: "client_tool_result", tool_call_id: t.tool_call_id, result: "Listo, quedó registrado.", is_error: false }));
  }
  if (m.type === "ping") ws.send(JSON.stringify({ type: "pong", event_id: m.ping_event.event_id }));
});
ws.addEventListener("close", () => { console.log("\n— colgó —"); process.exit(0); });
setInterval(() => { if (Date.now() - ultima > 40000) { console.log("\n— sin respuesta —"); process.exit(0); } }, 5000);
