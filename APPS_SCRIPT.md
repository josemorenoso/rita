# Recibir los contactos en una hoja de Google

Cada vez que alguien descarga la lista en Excel, deja su **nombre, teléfono y correo**.
Esto los hace aparecer como una fila nueva en una hoja de cálculo tuya.

Son 5 minutos y se hace una sola vez.

---

## 1. Crea la hoja

Entra en [sheets.new](https://sheets.new) y ponle el nombre que quieras.

En la **fila 1** escribe estas siete cabeceras, una por columna:

| A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|
| Fecha | Nombre | Teléfono | Email | Búsqueda | Ciudad | Resultados |

## 2. Pega el script

En el menú de la hoja: **Extensiones → Apps Script**.

Borra todo lo que haya y pega esto tal cual:

```javascript
function doPost(e) {
  var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var d = JSON.parse(e.postData.contents);

  hoja.appendRow([
    new Date(),
    d.nombre || '',
    d.telefono || '',
    d.email || '',
    d.busqueda || '',
    d.ciudad || '',
    d.resultados || 0
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

Guarda con el icono del disquete.

## 3. Publícalo

Arriba a la derecha: **Implementar → Nueva implementación**.

1. Pulsa el engranaje ⚙ junto a «Tipo» y elige **Aplicación web**
2. En **«Ejecutar como»** deja **Yo**
3. En **«Quién tiene acceso»** elige **Cualquier usuario** ← *importante, si no, no funciona*
4. Pulsa **Implementar**
5. Google te pedirá permiso. Acepta. Si sale un aviso de «app no verificada», pulsa **Configuración avanzada → Ir a (nombre) (no seguro)**. Es tu propio script, no hay riesgo.
6. **Copia la URL que te da.** Termina en `/exec`

> Se ve así: `https://script.google.com/macros/s/AKfycb.....largo...../exec`

## 4. Pégala en Vercel

En tu proyecto de Vercel: **Settings → Environment Variables**.

| Nombre | Valor |
|---|---|
| `SHEETS_WEBHOOK_URL` | la URL que copiaste |

Guarda y vuelve a desplegar (**Deployments → ⋯ → Redeploy**).

---

## Comprobar que funciona

Entra en tu herramienta, haz una búsqueda cualquiera, pulsa **Descargar en Excel** y
rellena el formulario con tus propios datos. En un par de segundos debería aparecer la
fila en tu hoja.

## Si no aparece la fila

- **Revisa el paso 3.3**: si «Quién tiene acceso» no es *Cualquier usuario*, Google rechaza la petición.
- **Cada vez que edites el script** hay que hacer **Implementar → Gestionar implementaciones → ✏️ → Versión: Nueva versión**. Si no, sigue corriendo el código viejo.
- **Mira los registros en Vercel** (pestaña *Logs*). Si ves `[capture]`, el problema está en la hoja; si no lo ves, la variable de entorno no está puesta.

> **La descarga funciona igual aunque la hoja falle.** Está hecho a propósito: nunca se le
> niega la lista a un visitante por un problema tuyo. Solo perderías ese contacto, y quedará
> registrado en los logs de Vercel.
