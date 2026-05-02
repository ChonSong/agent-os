import { NavLink } from "react-router-dom";
import {
  LayoutGrid,
  Box,
  Folder,
  Wrench,
  Settings,
  ChevronRight,
  Terminal,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  path: string;
  label: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { path: "/containers", label: "Containers", icon: Box },
  { path: "/appstore", label: "App Store", icon: LayoutGrid },
  { path: "/files", label: "Files", icon: Folder },
  { path: "/tools", label: "Tools", icon: Wrench },
  { path: "/settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  onToggleChat: () => void;
  chatOpen: boolean;
}

export function Sidebar({ onToggleChat, chatOpen }: SidebarProps) {
  return (
    <aside className="flex flex-col w-[68px] bg-[#111827] border-r border-[#1f2937] shrink-0">
      {/* Logo / brand mark */}
      <div className="flex items-center justify-center h-[56px] border-b border-[#1f2937]">
        <span className="text-xs font-bold tracking-widest text-[#10b981]">AO</span>
      </div>

      {/* Nav icons */}
      <nav className="flex flex-col items-center gap-1 py-3 flex-1">
        {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            title={label}
            className={({ isActive }) =>
              cn(
                "flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-150",
                "text-[#9ca3af] hover:text-[#e8e6e3] hover:bg-[#1f2937]",
                isActive && "bg-[#10b981]/15 text-[#10b981]"
              )
            }
          >
            <Icon size={20} />
          </NavLink>
        ))}
      </nav>

      {/* Chat toggle */}
      <div className="flex flex-col items-center py-3 border-t border-[#1f2937] gap-1">
        <button
          onClick={onToggleChat}
          title={chatOpen ? "Collapse chat" : "Expand chat"}
          className={cn(
            "flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-150",
            "text-[#9ca3af] hover:text-[#e8e6e3] hover:bg-[#1f2937]",
            chatOpen && "bg-[#10b981]/15 text-[#10b981]"
          )}
        >
          <Terminal size={20} />
        </button>
        <ChevronRight
          size={14}
          className={cn(
            "text-[#374151] transition-transform duration-200",
            !chatOpen && "rotate-180"
          )}
        />
      </div>
    </aside>
  );
}
