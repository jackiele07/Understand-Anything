import { useCallback, useEffect, useRef, useState } from "react";
import { useDashboardStore } from "../store";
import type { SequenceDiagram } from "@understand-anything/core/types";

// Lazy-load mermaid — it's ~1MB and only needed when DiagramsTab mounts
const renderMermaid = async (id: string, definition: string): Promise<string> => {
  const mermaid = (await import("mermaid")).default;
  mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "loose" });
  const { svg } = await mermaid.render(id, definition);
  return svg;
};

function DiagramRenderer({ diagram }: { diagram: SequenceDiagram }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const safeId = `mermaid-${diagram.id.replace(/[^a-zA-Z0-9]/g, "-")}`;
    renderMermaid(safeId, diagram.mermaid)
      .then((svg) => {
        if (cancelled) return;
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
          const svgEl = containerRef.current.querySelector("svg");
          if (svgEl) {
            svgEl.removeAttribute("height");
            svgEl.style.width = "100%";
            svgEl.style.maxWidth = "100%";
          }
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(String(err));
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [diagram.id, diagram.mermaid]);

  return (
    <>
      {loading && (
        <div className="flex items-center justify-center h-32 text-text-muted text-sm">
          Rendering diagram…
        </div>
      )}
      {error && (
        <div className="p-4 bg-red-900/20 border border-red-700/40 rounded text-red-300 text-xs font-mono whitespace-pre-wrap">
          {error}
        </div>
      )}
      <div ref={containerRef} className="w-full overflow-x-auto" style={{ display: loading || error ? "none" : "block" }} />
    </>
  );
}

const PROTOCOL_COLORS: Record<string, string> = {
  REST: "text-green-400 bg-green-400/10 border-green-400/30",
  gRPC: "text-blue-400 bg-blue-400/10 border-blue-400/30",
  WebSocket: "text-purple-400 bg-purple-400/10 border-purple-400/30",
  NATS: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
};

function FullscreenButton({ diagram }: { diagram: SequenceDiagram }) {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, close]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-elevated text-text-secondary hover:text-text-primary transition-colors shrink-0"
        title="View full screen"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
        </svg>
        Full screen
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm"
          onMouseDown={close}
        >
          <div
            className="flex items-center gap-3 px-6 py-4 border-b border-white/10 shrink-0"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded border ${PROTOCOL_COLORS[diagram.protocol] ?? "text-text-muted bg-elevated border-border-medium"}`}>
              {diagram.protocol}
            </span>
            <h2 className="text-base font-semibold text-white flex-1">{diagram.title}</h2>
            <button
              type="button"
              onClick={close}
              className="text-white/50 hover:text-white transition-colors"
              title="Close (Esc)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div
            className="flex-1 overflow-auto p-8"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <DiagramRenderer key={`fullscreen-${diagram.id}`} diagram={diagram} />
          </div>
        </div>
      )}
    </>
  );
}

export default function DiagramsTab() {
  const graph = useDashboardStore((s) => s.graph);
  const activeDiagramId = useDashboardStore((s) => s.activeDiagramId);
  const setActiveDiagram = useDashboardStore((s) => s.setActiveDiagram);

  const PROTOCOL_ORDER: Record<string, number> = { REST: 0, WebSocket: 1, NATS: 2, gRPC: 3 };
  const diagrams: SequenceDiagram[] = [...(graph?.diagrams ?? [])].sort(
    (a, b) => (PROTOCOL_ORDER[a.protocol] ?? 99) - (PROTOCOL_ORDER[b.protocol] ?? 99)
  );

  if (diagrams.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
        <svg className="w-12 h-12 text-text-muted/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
        </svg>
        <p className="text-text-muted text-sm">No sequence diagrams generated yet.</p>
        <p className="text-text-muted/60 text-xs font-mono">Run <span className="text-accent">/understand --with-flowchart</span> to generate them.</p>
      </div>
    );
  }

  const activeDiagram = diagrams.find((d) => d.id === activeDiagramId) ?? diagrams[0];

  return (
    <div className="flex h-full min-h-0">
      {/* Left: diagram list */}
      <div className="w-[220px] shrink-0 border-r border-border-subtle overflow-y-auto">
        <div className="p-3 border-b border-border-subtle">
          <p className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">
            {diagrams.length} diagram{diagrams.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="space-y-0.5 p-2">
          {diagrams.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setActiveDiagram(d.id)}
              className={`w-full text-left px-3 py-2.5 rounded-md transition-colors group ${
                (activeDiagramId ?? diagrams[0].id) === d.id
                  ? "bg-accent/15 text-accent"
                  : "text-text-secondary hover:bg-elevated hover:text-text-primary"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${PROTOCOL_COLORS[d.protocol] ?? "text-text-muted bg-elevated border-border-medium"}`}>
                  {d.protocol}
                </span>
              </div>
              <p className="text-xs leading-snug truncate">{d.title}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Right: diagram viewer */}
      <div className="flex-1 min-w-0 overflow-auto p-6">
        {activeDiagram && (
          <>
            <div className="flex items-center gap-3 mb-6">
              <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded border ${PROTOCOL_COLORS[activeDiagram.protocol] ?? "text-text-muted bg-elevated border-border-medium"}`}>
                {activeDiagram.protocol}
              </span>
              <h2 className="text-base font-semibold text-text-primary flex-1">{activeDiagram.title}</h2>
              <FullscreenButton diagram={activeDiagram} />
            </div>
            <DiagramRenderer key={activeDiagram.id} diagram={activeDiagram} />
          </>
        )}
      </div>
    </div>
  );
}
