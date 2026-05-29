import { useState, useMemo } from "react";
import { useDashboardStore } from "../store";
import type { ApiEndpoint } from "@understand-anything/core/types";

const METHOD_COLORS: Record<string, string> = {
  GET:    "text-green-400 bg-green-400/10 border-green-400/30",
  POST:   "text-blue-400 bg-blue-400/10 border-blue-400/30",
  PUT:    "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  PATCH:  "text-orange-400 bg-orange-400/10 border-orange-400/30",
  DELETE: "text-red-400 bg-red-400/10 border-red-400/30",
  WS:     "text-purple-400 bg-purple-400/10 border-purple-400/30",
  gRPC:   "text-cyan-400 bg-cyan-400/10 border-cyan-400/30",
};

const METHOD_ORDER: Record<string, number> = {
  GET: 0, POST: 1, PUT: 2, PATCH: 3, DELETE: 4, WS: 5, gRPC: 6,
};

function parseTypeToSchema(typeStr: string | null | undefined): Record<string, unknown> | undefined {
  if (!typeStr) return undefined;

  // array of { ... }
  if (typeStr.startsWith("array of ")) {
    const inner = typeStr.slice("array of ".length);
    return { type: "array", items: parseTypeToSchema(inner) ?? { type: "object" } };
  }

  // stream of { ... }
  if (typeStr.startsWith("stream of ")) {
    const inner = typeStr.slice("stream of ".length);
    return { type: "array", items: parseTypeToSchema(inner) ?? { type: "object" }, description: "Streaming" };
  }

  // { field: type, field?: type, ... }
  const objMatch = typeStr.match(/^\{([^}]+)\}/);
  if (objMatch) {
    const properties: Record<string, Record<string, unknown>> = {};
    const required: string[] = [];
    for (const raw of objMatch[1].split(",")) {
      const m = raw.trim().match(/^(\w+)(\?)?\s*:\s*(.+)$/);
      if (!m) continue;
      const [, name, optional, t] = m;
      const tt = t.trim();
      const schemaType =
        tt === "string" || tt === "DateTime" || tt === "Guid" ? "string"
        : tt === "number" ? "number"
        : tt === "boolean" ? "boolean"
        : tt.endsWith("[]") ? "array"
        : "string";
      properties[name] = schemaType === "array"
        ? { type: "array", items: { type: "object" } }
        : { type: schemaType };
      if (!optional) required.push(name);
    }
    return {
      type: "object",
      properties,
      ...(required.length > 0 ? { required } : {}),
    };
  }

  // fallback: preserve as description
  return { type: "object", description: typeStr };
}

function generateOpenApi(apis: ApiEndpoint[], projectName: string): string {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const api of apis) {
    if (api.method === "WS" || api.method === "gRPC") continue;
    const method = api.method.toLowerCase();
    if (!paths[api.path]) paths[api.path] = {};
    const reqSchema = parseTypeToSchema(api.requestType);
    const resSchema = parseTypeToSchema(api.responseType);
    paths[api.path][method] = {
      summary: api.summary,
      tags: [api.layerId.replace("layer:", "")],
      security: api.auth && api.auth !== "None" ? [{ [api.auth]: [] }] : [],
      ...(reqSchema ? {
        requestBody: {
          required: true,
          content: { "application/json": { schema: reqSchema } },
        },
      } : {}),
      responses: {
        "200": {
          description: "Success",
          ...(resSchema ? { content: { "application/json": { schema: resSchema } } } : {}),
        },
      },
    };
  }

  return JSON.stringify({
    openapi: "3.0.3",
    info: { title: projectName, version: "1.0.0" },
    paths,
  }, null, 2);
}

function downloadOpenApi(apis: ApiEndpoint[], projectName: string) {
  const json = generateOpenApi(apis, projectName);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "openapi.json";
  a.click();
  URL.revokeObjectURL(url);
}

function MethodBadge({ method }: { method: string }) {
  return (
    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border min-w-[42px] text-center inline-block ${METHOD_COLORS[method] ?? "text-text-muted bg-elevated border-border-medium"}`}>
      {method}
    </span>
  );
}

function EndpointRow({ api, layers }: { api: ApiEndpoint; layers: { id: string; name: string }[] }) {
  const [expanded, setExpanded] = useState(false);
  const layerName = layers.find(l => l.id === api.layerId)?.name ?? api.layerId.replace("layer:", "");

  return (
    <>
      <tr
        className="border-b border-border-subtle hover:bg-elevated/50 cursor-pointer transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <td className="px-4 py-2.5 w-20">
          <MethodBadge method={api.method} />
        </td>
        <td className="px-4 py-2.5 font-mono text-xs text-text-primary">{api.path}</td>
        <td className="px-4 py-2.5 text-xs text-text-secondary">{layerName}</td>
        <td className="px-4 py-2.5 text-xs text-text-muted">{api.auth ?? "—"}</td>
        <td className="px-4 py-2.5 text-xs text-text-muted font-mono">{api.requestType ?? "—"}</td>
        <td className="px-4 py-2.5 text-xs text-text-muted font-mono">{api.responseType ?? "—"}</td>
        <td className="px-3 py-2.5 text-text-muted/40">
          <svg className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border-subtle bg-elevated/30">
          <td colSpan={7} className="px-4 py-3">
            <div className="text-xs text-text-secondary leading-relaxed">
              <span className="text-text-muted mr-2">Summary:</span>{api.summary}
            </div>
            <div className="text-xs text-text-muted mt-1 font-mono">
              {api.filePath}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function ApiTab() {
  const graph = useDashboardStore((s) => s.graph);
  const apis: ApiEndpoint[] = graph?.apis ?? [];
  const layers = graph?.layers ?? [];

  const allMethods = useMemo(() =>
    [...new Set(apis.map(a => a.method))].sort((a, b) => (METHOD_ORDER[a] ?? 99) - (METHOD_ORDER[b] ?? 99)),
    [apis]
  );
  const allLayerIds = useMemo(() => [...new Set(apis.map(a => a.layerId))], [apis]);

  const [selectedMethods, setSelectedMethods] = useState<Set<string>>(() => new Set(allMethods));
  const [selectedLayerId, setSelectedLayerId] = useState<string>("__all__");

  const filtered = useMemo(() =>
    [...apis]
      .filter(a => selectedMethods.has(a.method))
      .filter(a => selectedLayerId === "__all__" || a.layerId === selectedLayerId)
      .sort((a, b) => {
        const layerCmp = a.layerId.localeCompare(b.layerId);
        if (layerCmp !== 0) return layerCmp;
        const methodCmp = (METHOD_ORDER[a.method] ?? 99) - (METHOD_ORDER[b.method] ?? 99);
        if (methodCmp !== 0) return methodCmp;
        return a.path.localeCompare(b.path);
      }),
    [apis, selectedMethods, selectedLayerId]
  );

  function toggleMethod(m: string) {
    setSelectedMethods(prev => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m); else next.add(m);
      return next;
    });
  }

  if (apis.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
        <svg className="w-12 h-12 text-text-muted/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-text-muted text-sm">No API endpoints extracted yet.</p>
        <p className="text-text-muted/60 text-xs font-mono">Run <span className="text-accent">/understand --with-api</span> to generate them.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border-subtle shrink-0 flex-wrap">
        {/* Layer filter */}
        <select
          value={selectedLayerId}
          onChange={e => setSelectedLayerId(e.target.value)}
          className="text-xs bg-elevated border border-border-medium rounded-md px-2 py-1 text-text-secondary focus:outline-none"
        >
          <option value="__all__">All layers</option>
          {allLayerIds.map(id => (
            <option key={id} value={id}>
              {layers.find(l => l.id === id)?.name ?? id.replace("layer:", "")}
            </option>
          ))}
        </select>

        {/* Method toggles */}
        <div className="flex items-center gap-1">
          {allMethods.map(m => (
            <button
              key={m}
              type="button"
              onClick={() => toggleMethod(m)}
              className={`text-[9px] font-bold uppercase px-2 py-1 rounded border transition-colors ${
                selectedMethods.has(m)
                  ? METHOD_COLORS[m] ?? "text-text-muted bg-elevated border-border-medium"
                  : "text-text-muted/30 bg-transparent border-transparent line-through"
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <span className="text-[10px] text-text-muted">{filtered.length} endpoint{filtered.length !== 1 ? "s" : ""}</span>

        {/* Download OpenAPI */}
        <button
          type="button"
          onClick={() => downloadOpenApi(apis, graph?.project.name ?? "API")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-elevated text-text-secondary hover:text-text-primary border border-border-medium transition-colors"
          title="Download openapi.json"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download OpenAPI
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-surface border-b border-border-subtle z-10">
            <tr>
              <th className="px-4 py-2 text-[10px] uppercase tracking-wider text-text-muted font-semibold w-20">Method</th>
              <th className="px-4 py-2 text-[10px] uppercase tracking-wider text-text-muted font-semibold">Path</th>
              <th className="px-4 py-2 text-[10px] uppercase tracking-wider text-text-muted font-semibold">Layer</th>
              <th className="px-4 py-2 text-[10px] uppercase tracking-wider text-text-muted font-semibold">Auth</th>
              <th className="px-4 py-2 text-[10px] uppercase tracking-wider text-text-muted font-semibold">Request</th>
              <th className="px-4 py-2 text-[10px] uppercase tracking-wider text-text-muted font-semibold">Response</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {filtered.map(api => (
              <EndpointRow key={api.id} api={api} layers={layers} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
