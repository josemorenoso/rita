"use client";

import { useCallback, useMemo, useState } from "react";
import OfficeFloor, { type Selection } from "@/components/OfficeFloor";
import AgentPanel from "@/components/AgentPanel";
import NexusPanel from "@/components/NexusPanel";
import HeaderBar from "@/components/HeaderBar";
import LogStream from "@/components/LogStream";
import { AGENT_COUNT, AUDITOR_ID, LEAD_HUNTER_ID, ROUTE_PLANNER_ID } from "@/lib/roster";
import type { Snapshot } from "@/lib/types";

export default function Page() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [selection, setSelection] = useState<Selection>({ kind: "nexus" });
  const [speed, setSpeed] = useState(1);

  // Identity-stable so the render loop is never torn down mid-session.
  const onSnapshot = useCallback((s: Snapshot) => setSnap({ ...s }), []);

  const selectedAgent = useMemo(() => {
    if (!snap || selection?.kind !== "agent") return null;
    return snap.agents.find((a) => a.def.id === selection.id) ?? null;
  }, [snap, selection]);

  return (
    <div className="shell">
      <HeaderBar snap={snap} speed={speed} onSpeed={setSpeed} />

      <main className="stage">
        <div className="stage-left">
          <div className="floor-frame">
            <OfficeFloor
              selection={selection}
              onSelect={(s) => setSelection(s ?? { kind: "nexus" })}
              onSnapshot={onSnapshot}
              speed={speed}
            />
          </div>
          <p className="floor-hint">
            Toca cualquier agente para abrir su ficha · toca el <strong>NEXUS</strong> del centro para ver las métricas
            del sistema
          </p>
          {snap && <LogStream log={snap.log} />}
        </div>

        <div className="stage-right">
          {selectedAgent ? (
            <AgentPanel
              agent={selectedAgent}
              onClose={() => setSelection({ kind: "nexus" })}
              huntHref={selectedAgent.def.id === LEAD_HUNTER_ID ? "/" : undefined}
              routeHref={selectedAgent.def.id === ROUTE_PLANNER_ID ? "/rutas" : undefined}
              auditHref={selectedAgent.def.id === AUDITOR_ID ? "/lupa" : undefined}
            />
          ) : snap ? (
            <NexusPanel snap={snap} onClose={() => setSelection({ kind: "nexus" })} />
          ) : (
            <div className="panel panel-boot">
              <span className="panel-label">Iniciando</span>
              <p>Cargando el turno de los {AGENT_COUNT} agentes…</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
