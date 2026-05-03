/**
 * Tool Manager — manage nanobot agent tools/skills.
 */
import { Wrench, Plus } from "lucide-react";
import { H2 } from "@/components/NouiTypography";

export default function ToolManagerPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#1f2937] shrink-0">
        <div>
          <H2 variant="xl" className="text-[#e8e6e3]">Tool Manager</H2>
          <H2 variant="sm" className="text-[#6b7280]">Configure agent capabilities</H2>
        </div>
        <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#10b981] text-xs text-[#0a0e14] font-semibold hover:bg-[#0d9f6e] transition-all">
          <Plus size={13} />
          Add Tool
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex flex-col items-center justify-center h-full gap-3 text-[#6b7280]">
          <Wrench size={48} className="opacity-20" />
          <p className="text-sm">Tool manager coming soon</p>
        </div>
      </div>
    </div>
  );
}
