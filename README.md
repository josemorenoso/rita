# Rita — encuentra clientes reales

Herramienta para regalar: escribes **qué negocio** buscas y **en qué ciudad**, y te
devuelve una lista de empresas reales con **teléfono, web y dirección**, lista para
descargar en Excel y empezar a llamar.

| Ruta | Qué es |
|---|---|
| `/` | La herramienta. Es lo que compartes. |
| `/leads` | Búsquedas anteriores de ese visitante (guardadas en su navegador). |
| `/oficina` | La simulación AIOS de 26 agentes. Tu demo, no forma parte del regalo. |

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
