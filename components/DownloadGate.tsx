"use client";

import { useState } from "react";
import type { LeadRun } from "@/lib/leads/types";

/**
 * Lo que convierte la herramienta en lead magnet: la lista se ve entera y
 * gratis en pantalla, y solo se piden los datos para llevársela en Excel.
 * Quien llega aquí ya vio el valor, así que los deja sin dudar.
 */
export default function DownloadGate({
  run,
  onDone,
  onClose,
}: {
  run: LeadRun;
  /** Se llama cuando ya se puede descargar, haya llegado o no a la hoja. */
  onDone: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = name.trim().length > 1 && phone.trim().length > 5 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

  async function submit() {
    if (!ready || sending) return;
    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          email,
          query: run.categoryLabel,
          city: run.city,
          total: run.leads.length,
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "No se pudo enviar. Revisa los datos.");
        setSending(false);
        return;
      }

      onDone();
    } catch {
      // Un fallo de red no debe costarle la lista a quien ya rellenó el formulario.
      onDone();
    }
  }

  return (
    <div className="hunter-backdrop" role="dialog" aria-modal="true" aria-label="Descargar la lista">
      <div className="hunter gate">
        <header className="hunter-head">
          <div>
            <span className="panel-label">Último paso</span>
            <h2>Descargar en Excel</h2>
          </div>
          <button className="panel-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </header>

        <div className="hunter-body">
          <p className="gate-intro">
            Te llevas los <strong>{run.leads.length} negocios</strong> de {run.categoryLabel.toLowerCase()} en {run.city}{" "}
            con sus teléfonos, listos para abrir en Excel.
          </p>

          <label className="hunter-field">
            <span className="panel-label">Tu nombre</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cómo te llamas" autoFocus />
          </label>

          <label className="hunter-field">
            <span className="panel-label">Tu teléfono</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+57 300 000 0000"
              inputMode="tel"
            />
          </label>

          <label className="hunter-field">
            <span className="panel-label">Tu correo</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
              inputMode="email"
              onKeyDown={(e) => {
                if (e.key === "Enter" && ready) submit();
              }}
            />
          </label>

          {error && <p className="gate-error">{error}</p>}

          <button className="hunter-launch" disabled={!ready || sending} onClick={submit}>
            {sending ? "Preparando…" : "Descargar mi lista"}
          </button>

          <p className="hunter-note">Solo te escribimos para esto. Nada de correo basura.</p>
        </div>
      </div>
    </div>
  );
}
