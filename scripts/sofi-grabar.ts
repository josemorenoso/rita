/**
 * Graba la llamada de muestra de Sofi: un MP3 por turno del guion, con la
 * voz de Sofi para sus líneas y una voz masculina paisa para el cliente.
 *
 * Por qué grabar en vez de sintetizar al abrir la página:
 *
 *  1. El vídeo se graba en varias tomas y la voz tiene que sonar idéntica
 *     en todas. Una síntesis en vivo cambia de entonación cada vez.
 *  2. Cada síntesis consume caracteres de la cuota de ElevenLabs. Grabado,
 *     la llamada se reproduce mil veces sin gastar nada.
 *  3. La página no depende de que la API esté en pie en el momento de grabar.
 *
 * Solo genera los ficheros que faltan; `--forzar` los regenera todos.
 *
 *   npm run sofi:grabar
 *   npm run sofi:grabar -- --forzar
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GUION_SANCHO_PAISA } from "../lib/sofi/guion";
import type { Turno } from "../lib/sofi/tipos";

const SALIDA = join(process.cwd(), "public", "sofi", "audio");
const EL = "https://api.elevenlabs.io";
const LLAVE = process.env.ELEVENLABS_API_KEY?.trim();

/** Las voces ya añadidas a la cuenta desde la librería de ElevenLabs. */
const VOCES = {
  sofi: process.env.ELEVENLABS_SOFI_VOICE_ID || "J4vZAFDEcpenkMp3f3R9", // Valentina – Joyful, Lively Friend (Medellín)
  cliente: process.env.ELEVENLABS_CLIENTE_VOICE_ID || "o2vbTbO3g4GrKUg7rehy", // Cristian Sánchez (paisa)
};

/** v3 es el modelo más expresivo y entiende etiquetas como [laughs]. Si la
    cuenta no lo tiene habilitado se cae a multilingual v2. */
const MODELO = process.env.ELEVENLABS_GRABAR_MODELO || "eleven_v3";
const MODELO_RESPALDO = "eleven_multilingual_v2";

const forzar = process.argv.includes("--forzar");

if (!LLAVE) {
  console.error("Falta ELEVENLABS_API_KEY. Ponla en .env.local y corre: npm run sofi:grabar");
  process.exit(1);
}

mkdirSync(SALIDA, { recursive: true });

async function sintetizar(turno: Turno, anterior: Turno | undefined, siguiente: Turno | undefined, modelo: string) {
  const voz = VOCES[turno.quien];
  const cuerpo: Record<string, unknown> = {
    text: turno.voz ?? turno.texto,
    model_id: modelo,
    voice_settings:
      modelo === "eleven_v3"
        ? { stability: 0.5, similarity_boost: 0.8, use_speaker_boost: true }
        : { stability: 0.38, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true, speed: turno.quien === "sofi" ? 1.05 : 1.0 },
  };
  // Contexto del mismo hablante para que la entonación tenga continuidad.
  // v3 no lo admite (devuelve 400 «unsupported_model»): ahí va sin él.
  if (modelo !== "eleven_v3") {
    if (anterior) cuerpo.previous_text = anterior.voz ?? anterior.texto;
    if (siguiente) cuerpo.next_text = siguiente.voz ?? siguiente.texto;
  }

  const r = await fetch(`${EL}/v1/text-to-speech/${voz}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": LLAVE!, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify(cuerpo),
  });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 300)}`);
  return Buffer.from(await r.arrayBuffer());
}

async function main() {
  const turnos = GUION_SANCHO_PAISA.turnos;
  let caracteres = 0;
  let hechos = 0;

  for (let i = 0; i < turnos.length; i++) {
    const t = turnos[i];
    const destino = join(SALIDA, `${t.id}.mp3`);
    if (!forzar && existsSync(destino)) {
      console.log(`  ✓ ${t.id} ya existe`);
      continue;
    }
    const anterior = turnos.slice(0, i).reverse().find((x) => x.quien === t.quien);
    const siguiente = turnos.slice(i + 1).find((x) => x.quien === t.quien);
    const texto = t.voz ?? t.texto;
    process.stdout.write(`  ● ${t.id} ${t.quien.padEnd(7)} ${texto.length.toString().padStart(3)} car. `);
    let mp3: Buffer;
    try {
      mp3 = await sintetizar(t, anterior, siguiente, MODELO);
    } catch (e) {
      console.log(`\n    ${MODELO} falló (${String(e).slice(0, 120)}), probando ${MODELO_RESPALDO}…`);
      mp3 = await sintetizar(t, anterior, siguiente, MODELO_RESPALDO);
    }
    writeFileSync(destino, mp3);
    caracteres += texto.length;
    hechos++;
    console.log(`→ ${(mp3.length / 1024).toFixed(0)} KB`);
  }

  console.log(`\n  ${hechos} ficheros nuevos · ${caracteres} caracteres gastados · ${SALIDA}`);
}

main().catch((e) => {
  console.error("\n  Falló:", e);
  process.exit(1);
});
