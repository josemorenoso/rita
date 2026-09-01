/**
 * El gancho de resolución que carga `resolver-ts.mjs`. Solo toca los imports
 * relativos sin extensión; todo lo demás se lo pasa a Node sin tocarlo.
 */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const EXTENSIONES = [".ts", ".tsx", ".js", ".mjs", "/index.ts"];

export async function resolve(specifier, context, next) {
  const relativo = specifier.startsWith("./") || specifier.startsWith("../");
  const sinExtension = !/\.[a-z]+$/i.test(specifier);
  if (relativo && sinExtension && context.parentURL) {
    const base = fileURLToPath(new URL(specifier, context.parentURL));
    for (const ext of EXTENSIONES) {
      if (existsSync(base + ext)) return next(specifier + ext, context);
    }
  }
  return next(specifier, context);
}
