"use client";

import type { Lead } from "@/lib/leads/types";

/** La tabla de clientes. Los teléfonos son enlaces `tel:` para llamar desde el móvil. */
export default function LeadTable({ leads }: { leads: Lead[] }) {
  return (
    <div className="leads-table-wrap">
      <table className="leads-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Negocio</th>
            <th>Teléfono</th>
            <th>Correo</th>
            <th>Contacto</th>
            <th>Web</th>
            <th>Dirección</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead, i) => {
            const email = lead.email ?? lead.mapEmail;
            return (
              <tr key={lead.id}>
                <td className="col-num">{i + 1}</td>
                <td className="col-name">{lead.name}</td>
                <td>
                  {lead.phone ? (
                    <a href={`tel:${lead.phone.replace(/\s/g, "")}`}>{lead.phone}</a>
                  ) : (
                    <span className="col-none">—</span>
                  )}
                </td>
                <td>
                  {email ? (
                    <a href={`mailto:${email}`} className="accent">
                      {email}
                    </a>
                  ) : (
                    <span className="col-none">—</span>
                  )}
                </td>
                <td>
                  {lead.contactName ? (
                    <>
                      {lead.contactName}
                      {lead.contactPosition && <span className="col-role"> · {lead.contactPosition}</span>}
                      {lead.confidence !== null && <span className="col-role"> · {lead.confidence} %</span>}
                    </>
                  ) : (
                    <span className="col-none">—</span>
                  )}
                </td>
                <td>
                  {lead.website ? (
                    <a href={lead.website} target="_blank" rel="noreferrer">
                      {lead.domain ?? "abrir"}
                    </a>
                  ) : (
                    <span className="col-none">—</span>
                  )}
                </td>
                <td className="col-addr">{lead.address ?? <span className="col-none">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
