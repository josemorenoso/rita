# Rita — encuentra clientes reales

Herramienta para regalar: escribes **qué negocio** buscas y **en qué ciudad**, y te
devuelve una lista de empresas reales con **teléfono, web y dirección**, lista para
descargar en Excel y empezar a llamar.

| Ruta | Qué es |
|---|---|
| `/` | La herramienta. Es lo que compartes. |
| `/leads` | Búsquedas anteriores de ese visitante (guardadas en su navegador). |
| `/rutas` | El reparto del día: 40 pedidos, 6 domiciliarios y la ruta de cada uno sobre el mapa de Medellín. |
| `/lupa` | El auditor de fugas financieras de Ruth Alcaraz: 31 reglas sobre las exportaciones del ERP. |
| `/sofi` | El teléfono de Sofi: llama a quien cotizó y nunca compró, cierra el pedido y llena la ficha. |
| `/oficina` | La simulación AIOS de 27 agentes. Tu demo, no forma parte del regalo. |

---

## Cómo funciona por dentro

**Los negocios salen de OpenStreetMap** (Nominatim + Overpass): sin registro, sin clave y
sin límite de uso. Es la parte que funciona siempre y para todo el mundo.

**Los correos son opcionales** y los pone [Hunter.io](https://hunter.io). Cada visitante
usa **su propia clave gratuita** (50 búsquedas al mes), que se guarda en su navegador y
viaja al servidor solo para usarse — nunca se almacena. Así puedes regalar la herramienta
a miles de personas sin pagar nada ni compartir tu cuota.

**Las listas no se guardan en el servidor.** Viven en el `localStorage` del visitante.
No almacenas datos de contacto de terceros y no hay nada que limpiar.

---

## El planificador de rutas (`/rutas`)

Es la herramienta del agente **Kai Moreno** (`log-01`, Logística). Reparte 40
pedidos entre 6 domiciliarios, ordena la ruta de cada uno y la dibuja sobre el
callejero real de Medellín. Al entrar en un domiciliario sale su ruta completa y
un botón que la abre en Google Maps con todas sus paradas.

**Los datos están congelados y la página no hace ninguna llamada de red.** Los
kilómetros son reales: salen de una matriz de distancias de OpenStreetMap (vía
OSRM) que se pidió una sola vez y vive en `lib/rutas/matriz.json`. Así la ruta es
idéntica en cada recarga —necesario para grabar en varias tomas— y no depende de
que un servidor gratuito de terceros esté en pie.

Para regenerar el día de reparto (otras direcciones, otros pedidos):

```bash
npm run rutas:congelar            # geocodifica de nuevo: tarda ~2 min
npm run rutas:congelar -- --reusar  # reaprovecha direcciones y matriz
```

El script aborta si algún pedido queda sin asignar o aparece dos veces, así que
un fallo del algoritmo no llega nunca a la pantalla.

### De qué presume y frente a qué

El panel compara el plan de Kai contra tres formas de repartir, todas con los
**mismos 6 domiciliarios**. La comparación que vale es contra un despachador que
ya agrupa por sectores y atiende los express primero, porque consigue la misma
puntualidad: ahí el ahorro es de un 29 % en kilómetros. Frente a repartir por
orden de llegada el ahorro sube al 54 %, pero ese plan llega tarde a 404 minutos
de entregas — se enseñan las dos cifras con su base, no solo la más vistosa.

---

## Sofi, la que llama (`/sofi`)

Es la herramienta de **Sofi Restrepo** (`sls-08`, Ventas). Tiene delante las
cotizaciones que Distribuidora Andina mandó y nadie convirtió en pedido, llama
al que las pidió, escucha por qué no compró, ofrece el incentivo que tiene
autorizado y cuelga con el pedido cerrado o con la siguiente acción agendada.
Mientras habla, la ficha del cliente se llena sola (por qué no compró, a quién
le compra hoy, cuánto pide al mes, quién decide…) y la agenda recoge cada
compromiso con su hora.

**Hay dos maneras de que suene, y la pantalla es la misma para las dos:**

- **En vivo.** Con `ELEVENLABS_API_KEY` en `.env.local`, «Llamar» abre una
  conversación de voz real con ElevenLabs Conversational AI: Sofi habla con la
  voz de una muchacha de Medellín y tú haces de cliente por el micrófono. Ella
  va llamando a sus herramientas (`anotar_dato`, `agendar_accion`,
  `cerrar_llamada`) y eso es lo que llena la ficha. El prompt y la voz están
  en [`lib/sofi/agente.ts`](./lib/sofi/agente.ts); el agente se crea o se
  actualiza solo en tu cuenta la primera vez que alguien llama.
- **Grabada.** La llamada a don Andrés, del Sancho Paisa, está escrita en
  [`lib/sofi/guion.ts`](./lib/sofi/guion.ts) y su audio vive en
  `public/sofi/audio/`. Suena idéntica en cada toma, no gasta cuota y no
  depende de la conexión: es la que conviene para grabar el vídeo. Si no hay
  llave, o si la voz en vivo falla al arrancar, «Llamar» tira de ella sola.

Los mandos (elegir en vivo o grabada, quitar el timbre, reiniciar el día)
están detrás de la tecla **«a»**, con una pista mínima abajo a la derecha.
Nada de eso aparece en pantalla mientras narras.

Para regrabar el audio del guion después de cambiar el texto:

```bash
npm run sofi:grabar              # solo los turnos que falten
npm run sofi:grabar -- --forzar  # todos otra vez (≈2.300 caracteres de cuota)
```

---

## Desplegar en Vercel

1. Entra en [vercel.com/new](https://vercel.com/new) e importa este repositorio.
2. No cambies nada de la configuración. Pulsa **Deploy**.
3. Cuando termine, ya tienes la URL para compartir.

### Variables de entorno

Ninguna es obligatoria: **la herramienta funciona sin configurar nada**.

| Variable | Para qué | ¿Obligatoria? |
|---|---|---|
| `SHEETS_WEBHOOK_URL` | Recibir en una hoja de Google los datos de quien descarga la lista. Ver [APPS_SCRIPT.md](./APPS_SCRIPT.md). | No, pero **sin ella no capturas ningún contacto** |
| `HUNTER_API_KEY` | Clave de respaldo para desarrollo local. **No la pongas en Vercel**: se la comerían entre los visitantes en un día. | No |

Se configuran en **Settings → Environment Variables**, y después hay que
**redesplegar** para que surtan efecto.

---

## Personalizar

Todo lo tuyo está en un único fichero: [`lib/leads/brand.ts`](./lib/leads/brand.ts).

```ts
export const BRAND = {
  toolName: "Rita",              // nombre y título de la pestaña
  tagline: "Encuentra negocios…", // frase de debajo
  owner: "",                      // tu nombre o empresa (vacío = no se muestra)
  link: "",                       // tu Instagram, WhatsApp o web
  linkLabel: "",                  // el texto del enlace
};
```

Guarda, haz commit y Vercel vuelve a desplegar solo.

---

## Correr en local

```bash
npm install
npm run dev
```

Abre <http://localhost:3000>. Si quieres probar los correos sin pegar la clave en la
interfaz cada vez, crea un fichero `.env.local` con `HUNTER_API_KEY=tu_clave`.

---

## Qué esperar de los datos

OpenStreetMap está mucho mejor documentado en unas zonas que en otras. Medido sobre
40 resultados por búsqueda, radio de 20 km:

| Ciudad | Nicho | Con teléfono |
|---|---|---|
| Medellín | Colegios | 35 de 40 |
| Bogotá | Hoteles | 38 de 40 |
| Medellín | Restaurantes | 24 de 40 |

Las categorías con muy pocos registros en Latinoamérica (inmobiliarias, despachos de
abogados) devuelven listas cortas. Los botones de categoría del formulario son los que
mejor funcionan; el texto libre busca por nombre y encuentra bastante menos.
