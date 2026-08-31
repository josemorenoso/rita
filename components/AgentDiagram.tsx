"use client";

import { useState } from "react";
import { RITA_PIPELINE, type ChannelIcon, type DiagramNode } from "@/lib/leads/diagram";

/**
 * El diagrama "impresionante" que vive en la ficha de Rita: el paso a paso
 * con logos, donde lo verde ya corre gratis y lo bloqueado es el plan Pro.
 * Nunca simula que un canal bloqueado se ejecuta — al tocarlo se abre el
 * mismo tipo de modal que el resto de la herramienta, diciéndolo tal cual.
 */
export default function AgentDiagram({ title = "Así funciona Rita por dentro" }: { title?: string }) {
  const [locked, setLocked] = useState<DiagramNode | null>(null);

  return (
    <section className="diagram">
      <header className="diagram-head">
        <span className="panel-label">Arquitectura</span>
        <h2>{title}</h2>
        <p className="diagram-sub">
          Lo marcado <strong className="diagram-hint-ok">✓ Activo</strong> ya corre gratis, ahora mismo. Lo marcado{" "}
          <strong className="diagram-hint-locked">🔒 Pro</strong> es lo próximo — toca para ver qué hace.
        </p>
      </header>

      <ol className="diagram-grid">
        {RITA_PIPELINE.map((node, i) => (
          <li key={node.id}>
            <button
              type="button"
              className={`diagram-node diagram-node-${node.status}`}
              onClick={() => node.status === "locked" && setLocked(node)}
              aria-haspopup={node.status === "locked" ? "dialog" : undefined}
            >
              <span className="diagram-step">{i + 1}</span>
              <Icon kind={node.icon} />
              <span className="diagram-label">{node.label}</span>
              <span className="diagram-sublabel">{node.sublabel}</span>
              <span className={`diagram-badge diagram-badge-${node.status}`}>
                {node.status === "active" ? "✓ Activo" : "🔒 Pro"}
              </span>
            </button>
          </li>
        ))}
      </ol>

      {locked && (
        <div
          className="hunter-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={`${locked.label} · plan Pro`}
          onClick={() => setLocked(null)}
        >
          <div className="hunter gate" onClick={(e) => e.stopPropagation()}>
            <header className="hunter-head">
              <div>
                <span className="panel-label">Bloqueado en la versión gratuita</span>
                <h2>
                  🔒 {locked.label} <span className="diagram-modal-sub">· {locked.sublabel}</span>
                </h2>
              </div>
              <button className="panel-close" onClick={() => setLocked(null)} aria-label="Cerrar">
                ✕
              </button>
            </header>
            <div className="hunter-body">
              <p className="gate-intro">{locked.lockedNote}</p>
              <p className="hunter-note">
                Lo gratuito ya te entrega negocios reales con teléfono, web y correo — sin clave y sin límite. Esto es
                lo que se activa en el plan Pro.
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Icon({ kind }: { kind: ChannelIcon }) {
  switch (kind) {
    case "bolt":
      return (
        <svg className="diagram-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#ff2e93" d="M13 2 4 14h6l-1 8 9-12h-6z" />
        </svg>
      );
    case "map":
      return (
        <svg className="diagram-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#34d399"
            d="M12 2C7.6 2 4 5.6 4 10c0 6 8 12 8 12s8-6 8-12c0-4.4-3.6-8-8-8Z"
          />
          <circle cx="12" cy="10" r="3.1" fill="#052e1f" />
        </svg>
      );
    case "google":
      return (
        <svg className="diagram-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#e8eaf6" d="M12 2C7.6 2 4 5.6 4 10c0 6 8 12 8 12s8-6 8-12c0-4.4-3.6-8-8-8Z" />
          <circle cx="10.1" cy="8.6" r="1.7" fill="#4285F4" />
          <circle cx="13.9" cy="8.6" r="1.7" fill="#EA4335" />
          <circle cx="10.1" cy="12.1" r="1.7" fill="#34A853" />
          <circle cx="13.9" cy="12.1" r="1.7" fill="#FBBC05" />
        </svg>
      );
    case "instagram":
      return (
        <svg className="diagram-icon" viewBox="0 0 24 24" aria-hidden="true">
          <defs>
            <linearGradient id="ig-g" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="#FEDA75" />
              <stop offset="35%" stopColor="#D62976" />
              <stop offset="70%" stopColor="#962FBF" />
              <stop offset="100%" stopColor="#4F5BD5" />
            </linearGradient>
          </defs>
          <rect x="2.5" y="2.5" width="19" height="19" rx="6" fill="url(#ig-g)" />
          <circle cx="12" cy="12" r="4.6" fill="none" stroke="#fff" strokeWidth="1.7" />
          <circle cx="17.1" cy="6.9" r="1.15" fill="#fff" />
        </svg>
      );
    case "linkedin":
      return (
        <svg className="diagram-icon" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="2.5" y="2.5" width="19" height="19" rx="4" fill="#0A66C2" />
          <text x="12" y="16.5" textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff" fontFamily="Arial, sans-serif">
            in
          </text>
        </svg>
      );
    case "phantom":
      return (
        <svg className="diagram-icon" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="2.5" y="2.5" width="19" height="19" rx="6" fill="#5B3DE0" />
          <path
            fill="#fff"
            d="M12 5.4c-2.6 0-4.7 2-4.7 4.6v6.1c0 .5.6.8 1 .4l1-.9 1 .9c.3.3.8.3 1.1 0l.9-.9.9.9c.3.3.8.3 1.1 0l1-.9 1 .9c.4.4 1 .1 1-.4v-6.1c0-2.6-2.1-4.6-4.7-4.6Z"
          />
          <circle cx="10" cy="10.2" r="1" fill="#5B3DE0" />
          <circle cx="14" cy="10.2" r="1" fill="#5B3DE0" />
        </svg>
      );
    case "database":
      return (
        <svg className="diagram-icon" viewBox="0 0 24 24" aria-hidden="true">
          <ellipse cx="12" cy="6" rx="7.2" ry="2.6" fill="#8b93c9" />
          <path d="M4.8 6v6c0 1.4 3.2 2.6 7.2 2.6s7.2-1.2 7.2-2.6V6" fill="none" stroke="#8b93c9" strokeWidth="1.6" />
          <path
            d="M4.8 12v6c0 1.4 3.2 2.6 7.2 2.6s7.2-1.2 7.2-2.6v-6"
            fill="none"
            stroke="#8b93c9"
            strokeWidth="1.6"
          />
        </svg>
      );
    case "hunter":
      return (
        <svg className="diagram-icon" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="2.5" y="2.5" width="19" height="19" rx="6" fill="#F95C3C" />
          <text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff" fontFamily="Arial, sans-serif">
            @
          </text>
        </svg>
      );
    case "flag":
      return (
        <svg className="diagram-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#3fe38a" d="M5 2h1.6v20H5z" />
          <path
            fill="#3fe38a"
            d="M6.6 3.4h11l-2.6 3.6 2.6 3.6h-11z"
            opacity="0.55"
          />
          <path fill="#3fe38a" d="M6.6 3.4h11l-2.6 3.3H6.6z" />
        </svg>
      );
    default:
      return null;
  }
}
