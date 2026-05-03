/**
 * File Explorer page — browse filesystem.
 * @xterm/xterm terminal embedded for shell access.
 */
import { Folder, Upload } from "lucide-react";
import { H2 } from "@/components/NouiTypography";

export default function FileExplorerPage() {
    return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#1f2937] shrink-0">
        <div>
          <H2 variant="xl" className="text-[#e8e6e3]">Files</H2>
          <H2 variant="sm" className="text-[#6b7280]">/</H2>
        </div>
        <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#1f2937] text-xs text-[#9ca3af] hover:text-[#e8e6e3] hover:bg-[#374151] transition-all">
          <Upload size={13} />
          Upload
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex flex-col items-center justify-center h-full gap-3 text-[#6b7280]">
          <Folder size={48} className="opacity-20" />
          <p className="text-sm">File explorer coming soon — use the terminal instead</p>
        </div>
      </div>
    </div>
  );
}
