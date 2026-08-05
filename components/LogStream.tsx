"use client";

import { ACCENT } from "@/lib/world";
import { eur } from "@/lib/format";
import type { LogLine } from "@/lib/types";

export default function LogStream({ log }: { log: LogLine[] }) {
  return (
    <section className="logstream" aria-label="Registro de ejecuciones en directo">
      <div className="logstream-head">
        <i className="dot" />
        Flujo de ejecuciones
      </div>
      <ul>
        {log.slice(0, 14).map((l) => (
          <li key={l.id} style={{ "--accent": ACCENT[l.dept] } as React.CSSProperties}>
            <span className="log-dept" />
            <span className="log-agent">{l.agent}</span>
            <span className="log-text">{l.text}</span>
            <span className="log-value">+{eur(l.value)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
