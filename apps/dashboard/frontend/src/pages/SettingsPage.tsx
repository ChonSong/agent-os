/**
 * Settings page — agent config, Cloudflare tunnels, user profile.
 */
import { Settings } from "lucide-react";
import { H2 } from "@/components/NouiTypography";

export default function SettingsPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center px-6 py-4 border-b border-[#1f2937] shrink-0">
        <H2 variant="xl" className="text-[#e8e6e3]">Settings</H2>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex flex-col items-center justify-center h-full gap-3 text-[#6b7280]">
          <Settings size={48} className="opacity-20" />
          <p className="text-sm">Settings panel coming soon</p>
        </div>
      </div>
    </div>
  );
}
