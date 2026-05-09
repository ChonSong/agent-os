import { useEffect, useRef, useState } from "react";

type EventType = "tool_call" | "task_complete" | "delegation" | "assumption" | "drift" | "circuit_open";

interface AIEEvent {
  type: EventType;
  timestamp: string;
  data: Record<string, unknown>;
}

const EVENT_COLORS: Record<string, string> = {
  tool_call: "text-[#3B82F6] bg-blue-400/10",
  task_complete: "text-emerald-400 bg-emerald-400/10",
  delegation: "text-[#8B5CF6] bg-purple-400/10",
  assumption: "text-[#D97706] bg-yellow-400/10",
  drift: "text-red-400 bg-red-400/10",
  circuit_open: "text-orange-400 bg-orange-400/10",
};

function formatEvent(event: AIEEvent): { summary: string; detail: string } {
  const d = event.data;
  switch (event.type) {
    case "tool_call":
      return {
        summary: `🔧 ${d.tool_name ?? "unknown"}`,
        detail: JSON.stringify(d.tool_args ?? {}, null, 0).slice(0, 120),
      };
    case "task_complete":
      return {
        summary: `✅ Done (iter ${d.iteration ?? "?"})`,
        detail: String(d.final_content ?? "").slice(0, 150),
      };
    case "delegation":
      return {
        summary: `🤖 Delegation`,
        detail: JSON.stringify(d, null, 0).slice(0, 120),
      };
    case "assumption":
      return {
        summary: `💭 Assumption`,
        detail: String(d.message ?? JSON.stringify(d)).slice(0, 120),
      };
    case "drift":
      return {
        summary: `⚠️ Drift`,
        detail: String(d.message ?? JSON.stringify(d)).slice(0, 120),
      };
    case "circuit_open":
      return {
        summary: `🔌 Circuit Open`,
        detail: JSON.stringify(d, null, 0).slice(0, 120),
      };
    default:
      return {
        summary: event.type,
        detail: JSON.stringify(d, null, 0).slice(0, 120),
      };
  }
}

export function ObservabilityPanel() {
  const [events, setEvents] = useState<AIEEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [filter, setFilter] = useState<EventType | "all">("all");
  const eventsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const eventSource = new EventSource("/api/events/stream");

    eventSource.onopen = () => setConnected(true);
    eventSource.onerror = () => setConnected(false);

    eventSource.onmessage = (e) => {
      try {
        const event: AIEEvent = JSON.parse(e.data);
        setEvents((prev) => [event, ...prev].slice(0, 200));
      } catch {
        // ignore malformed messages
      }
    };

    return () => eventSource.close();
  }, []);

  // Auto-scroll to top (newest first)
  useEffect(() => {
    eventsRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [events]);

  const filtered = filter === "all" ? events : events.filter((e) => e.type === filter);

  const typeCounts = events.reduce<Record<string, number>>((acc, e) => {
    acc[e.type] = (acc[e.type] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full bg-[#FFF5E6] text-[#111827]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#F0E6D8]">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">Observability</h2>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              connected ? "bg-emerald-400/10 text-emerald-400" : "bg-[#6b7280]/10 text-[#6B7280]"
            }`}
          >
            {connected ? "Live" : "Disconnected"}
          </span>
          <span className="text-xs text-[#6B7280]">{events.length} events</span>
        </div>
        {/* Filter pills */}
        <div className="flex gap-1">
          {(["all", "tool_call", "task_complete", "delegation"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                filter === t
                  ? "bg-[#FFF5E6] text-[#111827]"
                  : "text-[#6B7280] hover:text-[#9CA3AF]"
              }`}
            >
              {t === "all" ? "All" : t.replace("_", " ")}
              {t !== "all" && typeCounts[t] != null && (
                <span className="ml-1 opacity-60">({typeCounts[t]})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Event list */}
      <div ref={eventsRef} className="flex-1 overflow-y-auto p-4 space-y-2">
        {filtered.length === 0 ? (
          <p className="text-sm text-[#6B7280] text-center py-12">
            {connected ? "Waiting for events..." : "No events (SSE disconnected)"}
          </p>
        ) : (
          filtered.map((event, i) => {
            const { summary, detail } = formatEvent(event);
            const colorClass = EVENT_COLORS[event.type] ?? "text-gray-400 bg-gray-400/10";
            const [colorText, colorBg] = colorClass.split(" ");
            return (
              <div
                key={i}
                className="text-xs bg-[#FFFBF5] rounded-lg p-3 border border-[#F0E6D8] hover:border-[#D4C8B8] transition-colors"
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${colorBg} ${colorText}`}>
                    {event.type.replace("_", " ")}
                  </span>
                  <span className="text-[#6B7280] ml-auto whitespace-nowrap">
                    {new Date(event.timestamp).toLocaleTimeString("en-AU", { hour12: false })}
                  </span>
                </div>
                <div className={`font-medium mb-0.5 ${colorText}`}>{summary}</div>
                {detail && <div className="text-[#9CA3AF] font-mono break-all">{detail}</div>}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
