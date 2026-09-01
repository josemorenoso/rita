/**
 * Deja que Node ejecute directamente el TypeScript de `lib/` sin compilarlo.
 *
 * Node 24 ya sabe quitar los tipos él solo, pero su resolución de módulos exige
 * la extensión en el import (`./datos.ts`), mientras que el resto del repo la
 * omite (`./datos`), como hace Next. En vez de cambiar el estilo de todo el
 * proyecto para que un script de build sea feliz, el script trae su propio
 * resolvedor: si el import no tiene extensión, prueba .ts, .tsx y .js.
 *
 * Uso:  node --import ./scripts/resolver-ts.mjs scripts/rutas-congelar.ts
 */

import { register } from "node:module";

register("./resolver-hooks.mjs", import.meta.url);
