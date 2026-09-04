# Diseño: Agente de Cobros IA — Demo para video (Inmobiliaria)

**Fecha:** 2026-08-06
**Objetivo:** Demo funcional y visualmente impactante para grabar un video de ~1 min. Una sola pantalla estilo "centro de cobros" con look tecnológico; el usuario presiona un botón, arranca una llamada de voz IA que conversa con él por el PC, y al cerrar el acuerdo la fila del moroso se actualiza en vivo.

## Decisiones tomadas (locked)

- **Motor de voz:** OpenAI Realtime API (voz nativa en español). Sin ElevenLabs.
- **Canal:** Navegador / PC (WebRTC directo a OpenAI). Sin Twilio por ahora (opcional a futuro).
- **Vista:** Una sola pantalla, look tecnológico oscuro con acentos neón. Lista de morosos a la izquierda con **montos en rojo**; cabina de llamada a la derecha.
- **Datos:** 25 morosos falsos colombianos (cédulas, montos COP, conjuntos residenciales, +57). En memoria; se reinician al reiniciar el server (ideal para regrabar tomas).
- **Credencial requerida:** solo `OPENAI_API_KEY`.

## Concepto

Dashboard "Inmobiliaria Prados del Norte S.A.S. · Centro de Cobros IA". El usuario presiona **"Llamar al siguiente"** (o **"Llamar a todos — automático"**). Arranca una llamada de voz por el PC; el usuario hace de deudor. La IA (agente "Valentina") saluda por nombre, menciona el monto y los días de mora, negocia, y al final llama a una herramienta `registrar_resultado_cobro`. Eso actualiza el estado del cliente en el servidor → se empuja por SSE → la fila se anima y muestra el resultado (✅ Acuerdo 15/ago, 💰 Pagará hoy, etc.). Los KPIs de arriba (Recuperado hoy, Llamadas) suben.

## Arquitectura

```
Navegador (dashboard + WebRTC)  ──POST /api/session──►  Server Node (Express)
        │  voz WebRTC                                        │  OPENAI_API_KEY
        ▼                                                    │  estado de 25 clientes
   OpenAI Realtime  ── tool call ──► navegador ──POST /api/outcome──► actualiza estado
                                                             │
   Dashboard  ◄────────────── SSE /api/events ──────────────┘  (fila se anima)
```

- **Servidor = única fuente de verdad** del estado de los 25 clientes.
- El navegador nunca ve la API key: pide un **token efímero** a `/api/session` (el server lo mina contra OpenAI con la key real) y con eso abre WebRTC a OpenAI.

## Componentes

### 1. Servidor (`server.js`) — Express + `ws` no necesario (SSE nativo)
- `GET /` y estáticos → sirve `public/`.
- `GET /api/clients` → estado inicial de los 25.
- `GET /api/events` → **SSE**: emite `{type:'update', client}` y `{type:'call', ...}`.
- `POST /api/session` `{clientId}` → construye las `instructions` con el contexto del cliente y mina un token efímero de OpenAI Realtime (voz, tools, transcripción). Devuelve `{client_secret, model, clientId}`.
- `POST /api/outcome` `{clientId, resultado, fecha_compromiso?, monto?, nota?}` → actualiza estado, recalcula KPIs, broadcast SSE.
- `POST /api/reset` → reinicia todos los estados a "Pendiente" (para regrabar).
- Config vía `.env`: `OPENAI_API_KEY`, `PORT` (default 3000), `OPENAI_REALTIME_MODEL`, `OPENAI_VOICE`.

### 2. Datos (`data/clients.js`)
25 objetos: `{ id, nombre, cedula, inmueble, telefono, cuota (número COP), vencimiento, diasMora, estado:'Pendiente', resultado:null }`. Nombres colombianos, cédulas tipo `1.024.567.890`, montos entre ~$850.000 y ~$4.200.000, conjuntos/torres, teléfonos `+57 3xx xxx xxxx`.

### 3. Frontend (`public/`)
- **Barra superior:** marca + KPIs en vivo (Cartera total, En mora, Recuperado hoy, Llamadas hechas).
- **Izquierda:** lista/tabla de 25 morosos, tema oscuro, **monto en rojo brillante**, badge de días de mora, estado. Fila activa iluminada durante la llamada; al cerrar, animación + resultado.
- **Derecha (cabina):** botones grandes "📞 Llamar al siguiente" y "⚡ Llamar a todos (automático)" + "⏹ Detener"; indicador de onda/mic; tarjeta del cliente actual; **transcripción en vivo** (usuario + agente); resultado aterrizado.
- **Dev:** botón discreto "Simular resultado" para probar la animación sin gastar voz.
- **Realtime (app.js):** `/api/session` → `RTCPeerConnection` + mic + data channel `oai-events` → offer/answer SDP contra OpenAI. Escucha `response.audio_transcript.delta` (voz del agente) y transcripción del usuario para el panel. Al recibir la function call `registrar_resultado_cobro`, hace `POST /api/outcome`, responde `function_call_output` al modelo, y (modo automático) encadena el siguiente tras una pausa.

### 4. Agente (prompt + herramienta)
- Persona: "Valentina", asistente de cobros de Inmobiliaria Prados del Norte. Español colombiano, cordial pero firme, breve (es un video de ~35s). Saluda por nombre, menciona monto y mora, ofrece opciones de pago, cierra registrando el resultado.
- Herramienta `registrar_resultado_cobro`:
  - `resultado`: `pagara_hoy | acuerdo_pago | ya_pago | no_puede | reprogramar | rechaza`
  - opcionales: `fecha_compromiso` (texto), `monto` (número), `nota` (texto)

## Flujos

- **Llamar al siguiente:** toma el primer cliente `Pendiente` → sesión → WebRTC → agente saluda primero (`response.create`) → conversación → tool call → outcome → fila actualizada.
- **Llamar a todos (automático):** cola de pendientes; tras cada outcome, pausa ~1.5s, cierra sesión, arranca el siguiente. "Detener" corta la cola.

## Manejo de errores
- Sin `OPENAI_API_KEY` → `/api/session` responde 500 con mensaje claro; el frontend muestra aviso.
- Fallo de mic/permiso → mensaje en la cabina.
- Fallo de red WebRTC → botón vuelve a estado idle; se puede reintentar.
- El botón "Simular resultado" siempre funciona (no depende de OpenAI) → toma de respaldo garantizada para el dashboard.

## Pruebas (ligeras, es un demo)
- `npm install && npm start`, abrir `localhost:3000`.
- Smoke: "Simular resultado" en un cliente → la fila se anima y los KPIs suben (verifica SSE + render sin usar voz).
- Con key: "Llamar al siguiente" → hablar → verificar transcripción en vivo y que la fila se actualice al registrar el resultado.

## Fuera de alcance (YAGNI)
Twilio/teléfono real, ElevenLabs, base de datos, autenticación, export .xlsx, CRM, persistencia entre reinicios.
