import { Wifi, HardDrive, Cpu, Clock, Globe, Database } from "lucide-react";
import { useEffect, useState } from "react";

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

interface TunnelInfo {
  tunnel_id: string;
  url: string;
  connected: boolean | null;
}

export function StatusBar() {
  const [uptime, setUptime] = useState<number | null>(null);
  const [tunnel, setTunnel] = useState<TunnelInfo | null>(null);

  useEffect(() => {
    const read = async () => {
      try {
        const [uptimeRes, tunnelRes] = await Promise.all([
          fetch("/api/system/uptime").catch(() => null),
          fetch("/api/tunnel").catch(() => null),
        ]);
        if (uptimeRes?.ok) {
          const data = await uptimeRes.json() as { uptime: number };
          setUptime(data.uptime);
        }
        if (tunnelRes?.ok) {
          setTunnel(await tunnelRes.json());
        }
      } catch { /* noop */ }
    };
    read();
    const id = setInterval(read, 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <footer className="flex items-center h-[28px] px-3 gap-4 bg-[#0d1117] border-t border-[#1f2937] text-[10px] text-[#6b7280] shrink-0">
      <span className="flex items-center gap-1">
        <Wifi size={10} className="text-[#10b981]" />
        <span>Connected</span>
      </span>

      <span className="flex items-center gap-1">
        <HardDrive size={10} />
        <span>Docker OK</span>
      </span>

      <span className="flex items-center gap-1">
        <Cpu size={10} />
        <span>Agent Ready</span>
      </span>

      <span className="flex items-center gap-1">
        <Database size={10} className={tunnel ? "text-[#10b981]" : "text-[#6b7280]"} />
        <span>{tunnel ? "PG Connected" : "PG —"}</span>
      </span>

      {tunnel && tunnel.url && (
        <a
          href={tunnel.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 hover:text-[#10b981] transition-colors"
          title="Open agent-os in browser"
        >
          <Globe size={10} className={tunnel.connected ? "text-[#10b981]" : "text-[#f59e0b]"} />
          <span className="underline decoration-dotted">{tunnel.url.replace("https://", "")}</span>
        </a>
      )}

      <span className="flex-1" />

      <span className="flex items-center gap-1">
        <Clock size={10} />
        <span>
          Uptime: {uptime !== null ? formatUptime(Math.floor(uptime)) : "—"}
        </span>
      </span>
    </footer>
  );
}
