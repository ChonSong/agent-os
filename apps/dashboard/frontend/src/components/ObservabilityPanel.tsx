import { useEffect, useRef, useState } from "react";

interface AIEEvent {
  timestamp: string;
  type: string;
  source: string;
  message: string;
  data?: Record<string, unknown>;
}

export function ObservabilityPanel() {
  const [events, setEvents] = useState<AIEEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const eventsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const eventSource = new EventSource("/api/events/stream");

    eventSource.onopen = () => setConnected(true);

    eventSource.onmessage = (e) => {
      try {
        const event: AIEEvent = JSON.parse(e.data);
        setEvents((prev) => [event, ...prev].slice(0, 100));
      } catch {
        // ignore malformed messages
      }
    };

    eventSource.onerror = () => setConnected(false);

    return () => eventSource.close();
  }, []);

  useEffect(() => {
    if (eventsRef.current) {
      eventsRef.current.scrollTop = 0;
    }
  }, [events]);

  return (
    <div className="flex flex-col h-full bg-[#0a0e14] text-[#e8e6e3]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1f2937]">
        <h2 className="text-sm font-semibold">AIE Event Stream</h2>
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${
            connected
              ? "bg-[#10b981]/15 text-[#10b981]"
              : "bg-[#6b7280]/15 text-[#6b7280]"
          }`}
        >
          {connected ? "Connected" : "Disconnected"}
        </span>
      </div>

      <div ref={eventsRef} className="flex-1 overflow-y-auto p-4 space-y-2">
        {events.length === 0 ? (
          <p className="text-sm text-[#6b7280] text-center py-8">
            Waiting for events...
          </p>
        ) : (
          events.map((event, i) => (
            <div
              key={i}
              className="text-xs bg-[#111827] rounded-lg p-3 border border-[#1f2937]"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[#10b981]">{event.type}</span>
                <span className="text-[#6b7280]">•</span>
                <span className="text-[#9ca3af]">{event.source}</span>
                <span className="text-[#6b7280] ml-auto">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <p className="text-[#e8e6e3]">{event.message}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
