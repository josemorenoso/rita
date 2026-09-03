# Agente de Cobros IA — Demo (Inmobiliaria)

Dashboard estilo "centro de cobros" con look tecnológico + agente de voz IA (OpenAI Realtime).
Presionas **Llamar al siguiente** (o **Llamar a todos**), hablas con la IA por el PC haciendo
de deudor, y cuando cierras el acuerdo la fila del moroso se actualiza en vivo.

- 25 morosos falsos colombianos (montos en rojo).
- Voz por **OpenAI Realtime** (voz `marin`, español natural). **No usa ElevenLabs ni Twilio.**
- Actualización en vivo del dashboard vía SSE.

## Requisitos
- Node.js 18+ (probado en Node 24).
- Una **API key de OpenAI** con acceso a la Realtime API.
- Navegador Chrome/Edge (para el micrófono y WebRTC). Permite el micrófono cuando lo pida.

## Puesta en marcha (3 pasos)
```bash
npm install
cp .env.example .env      # en Windows PowerShell: copy .env.example .env
# edita .env y pon tu OPENAI_API_KEY
npm start
```
Abre **http://localhost:3000**.

## Cómo grabar el video
1. Abre `http://localhost:3000` a pantalla completa (F11).
2. Presiona **📞 Llamar al siguiente** → concede el micrófono → Valentina te saluda por nombre.
3. Habla como si fueras el deudor ("sí, le pago el 15 de agosto"). Al cerrar, la fila se pinta
   con el resultado (✅ Acuerdo 15 de agosto) y suben los KPIs "Recuperado hoy" y "Llamadas".
4. **⚡ Llamar a todos**: encadena morosos automáticamente uno tras otro. **⏹ Detener** corta.
5. **♻ Reiniciar demo** deja todo en Pendiente para regrabar una toma limpia.

## Botón de respaldo (sin gastar voz)
**🧪 Simular resultado** actualiza la fila con un resultado aleatorio sin llamar a OpenAI.
Útil para probar/mostrar la animación del dashboard aunque no tengas la key a mano.

## Configuración (.env)
| Variable | Default | Descripción |
|---|---|---|
| `OPENAI_API_KEY` | — | **Obligatoria** para el modo voz. |
| `PORT` | `3000` | Puerto del servidor. |
| `OPENAI_REALTIME_MODEL` | `gpt-realtime` | Modelo Realtime. |
| `OPENAI_VOICE` | `marin` | Voz del agente (`marin`, `cedar`, `shimmer`, `coral`, `alloy`…). |

## Notas
- Los datos viven en memoria: reiniciar el servidor (o **Reiniciar demo**) limpia todo.
- Si `/api/session` falla, revisa que la key tenga acceso a Realtime y que estés en un origen
  seguro (localhost cuenta como seguro para el micrófono).
- Twilio (teléfono real) quedó fuera a propósito; se puede añadir después sin tocar el dashboard.
