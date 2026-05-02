import { Wifi, HardDrive, Cpu, Clock } from "lucide-react";
import { useEffect, useState } from "react";

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function StatusBar() {
  const [uptime, setUptime] = useState<number | null>(null);

  useEffect(() => {
    const read = async () => {
      try {
        const res = await fetch("/api/system/uptime");
        if (res.ok) {
          const data = await res.json() as { uptime: number };
          setUptime(data.uptime);
        }
      } catch {}
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
