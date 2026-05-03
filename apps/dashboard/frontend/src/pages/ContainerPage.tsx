/**
 * Container management page — lists Docker containers, shows status,
 * allows start/stop/restart/remove via Docker Engine API.
 */
import { useEffect, useState, useCallback } from "react";
import { Box, Play, Square, RotateCw, Trash2, Plus, RefreshCw } from "lucide-react";
import { H2 } from "@/components/NouiTypography";

interface Container {
  Id: string;
  Names: string;
  Image: string;
  State: string;
  Status: string;
  Ports: string;
}

function containerStateColor(state: string): string {
  switch (state.toLowerCase()) {
    case "running": return "text-[#10b981]";
    case "exited":  return "text-[#6b7280]";
    case "paused":  return "text-yellow-400";
    default:        return "text-[#9ca3af]";
  }
}

async function fetchContainers(): Promise<Container[]> {
  const res = await fetch("/api/docker/containers/json?all=true");
  if (!res.ok) return [];
  return res.json();
}

async function containerAction(id: string, action: "start" | "stop" | "restart" | "remove") {
  await fetch(`/api/docker/containers/${id}/${action}`, { method: "POST" });
}

export default function ContainerPage() {
  const [containers, setContainers] = useState<Container[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setContainers(await fetchContainers());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const doAction = async (id: string, action: "start" | "stop" | "restart" | "remove") => {
    setActionInFlight(id);
    await containerAction(id, action);
    await load();
    setActionInFlight(null);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#1f2937] shrink-0">
        <div>
          <H2 variant="xl" className="text-[#e8e6e3]">Containers</H2>
          <H2 variant="sm" className="text-[#6b7280]">
            {containers.length} container{containers.length !== 1 ? "s" : ""} total
          </H2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#1f2937] text-xs text-[#9ca3af] hover:text-[#e8e6e3] hover:bg-[#374151] transition-all"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
          <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#10b981] text-xs text-[#0a0e14] font-semibold hover:bg-[#0d9f6e] transition-all">
            <Plus size={13} />
            New Container
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading && containers.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[#6b7280] text-sm">
            Loading containers...
          </div>
        ) : containers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-[#6b7280]">
            <Box size={40} className="opacity-30" />
            <p className="text-sm">No containers found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {containers.map((c) => (
              <div
                key={c.Id}
                className="bg-[#111827] border border-[#1f2937] rounded-xl p-4 flex flex-col gap-3 hover:border-[#374151] transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <H2 variant="sm" className="text-[#e8e6e3] truncate">
                      {c.Names.replace(/^\//, "")}
                    </H2>
                    <H2 variant="sm" className="text-[#6b7280] truncate">
                      {c.Image}
                    </H2>
                  </div>
                  <span className={`text-xs font-mono font-semibold ${containerStateColor(c.State)}`}>
                    {c.State}
                  </span>
                </div>

                <H2 variant="sm" className="text-[#6b7280]">
                  {c.Status}
                </H2>

                {c.Ports && (
                  <H2 variant="sm" className="text-[#6b7280]">
                    Ports: {c.Ports}
                  </H2>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-2 pt-1 border-t border-[#1f2937]">
                  {c.State !== "running" && (
                    <ActionBtn icon={Play} label="Start" onClick={() => doAction(c.Id, "start")} loading={actionInFlight === c.Id} />
                  )}
                  {c.State === "running" && (
                    <ActionBtn icon={Square} label="Stop" onClick={() => doAction(c.Id, "stop")} loading={actionInFlight === c.Id} />
                  )}
                  <ActionBtn icon={RotateCw} label="Restart" onClick={() => doAction(c.Id, "restart")} loading={actionInFlight === c.Id} />
                  <ActionBtn icon={Trash2} label="Remove" onClick={() => doAction(c.Id, "remove")} loading={actionInFlight === c.Id} danger />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionBtn({
  icon: Icon, label, onClick, loading, danger
}: {
  icon: React.ElementType; label: string; onClick: () => void;
  loading: boolean; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] transition-all ${
        danger
          ? "text-red-400 hover:bg-red-400/10"
          : "text-[#9ca3af] hover:text-[#e8e6e3] hover:bg-[#374151]"
      } disabled:opacity-30`}
    >
      <Icon size={12} />
      {label}
    </button>
  );
}
