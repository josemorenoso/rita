import { BRAND } from "./brand";
import type { LeadRun } from "./types";

/**
 * Genera el fichero que se descarga. Va con BOM UTF-8 y punto y coma como
 * separador porque es lo que abre bien el Excel en español: sin el BOM los
 * acentos salen rotos, y con coma en vez de punto y coma las columnas se
 * amontonan en una sola.
 */

const SEPARATOR = ";";

const HEADERS = [
  "#",
  "Negocio",
  "Teléfono",
  "Correo",
  "Contacto",
  "Cargo",
  "Fiabilidad correo",
  "Web",
  "Dirección",
  "Categoría",
  "Mapa",
];

function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  // Un campo con separador, comillas o salto de línea rompe la tabla si no se entrecomilla.
  if (text.includes(SEPARATOR) || text.includes('"') || text.includes("\n") || text.includes("\r")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function leadsToCsv(run: LeadRun): string {
  const lines: string[] = [];

  lines.push(HEADERS.map(cell).join(SEPARATOR));

  run.leads.forEach((lead, i) => {
    lines.push(
      [
        i + 1,
        lead.name,
        lead.phone,
        lead.email ?? lead.mapEmail,
        lead.contactName,
        lead.contactPosition,
        lead.confidence !== null ? `${lead.confidence}%` : "",
        lead.website,
        lead.address,
        lead.category,
        `https://www.google.com/maps/search/?api=1&query=${lead.lat},${lead.lon}`,
      ]
        .map(cell)
        .join(SEPARATOR),
    );
  });

  // Pie con la procedencia de la lista y, si la has rellenado, tu marca.
  lines.push("");
  lines.push(cell(`${run.categoryLabel} en ${run.city} · ${run.leads.length} negocios`));
  lines.push(cell(`Generado el ${new Date(run.createdAt).toLocaleString("es-ES")} con ${BRAND.toolName}`));
  if (BRAND.owner) lines.push(cell(BRAND.owner));
  if (BRAND.link) lines.push(cell(BRAND.link));

  return `﻿${lines.join("\r\n")}`;
}

export function csvFilename(run: LeadRun): string {
  const slug = (text: string) =>
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  const date = run.createdAt.slice(0, 10);
  return `${slug(run.categoryLabel)}-${slug(run.city)}-${date}.csv`;
}

/** Lanza la descarga en el navegador sin pasar por el servidor. */
export function downloadCsv(run: LeadRun): void {
  const blob = new Blob([leadsToCsv(run)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = csvFilename(run);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
