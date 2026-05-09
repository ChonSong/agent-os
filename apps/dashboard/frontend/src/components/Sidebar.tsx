import { NavLink, type NavLinkRenderProps } from "react-router-dom";
import {
  LayoutGrid,
  Box,
  Folder,
  Wrench,
  Settings,
  ChevronRight,
  Terminal,
  Activity,
  MessageSquare,
  Clock,
  User,
  BarChart3,
  Key,
  FileText,
  Bot,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  path: string;
  label: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { path: "/containers", label: "Containers", icon: Box },
  { path: "/sessions", label: "Sessions", icon: MessageSquare },
  { path: "/cron", label: "Cron", icon: Clock },
  { path: "/profiles", label: "Profiles", icon: User },
  { path: "/observability", label: "Observability", icon: Activity },
  { path: "/analytics", label: "Analytics", icon: BarChart3 },
  { path: "/appstore", label: "App Store", icon: LayoutGrid },
  { path: "/files", label: "Files", icon: Folder },
  { path: "/tools", label: "Tools", icon: Wrench },
  { path: "/settings", label: "Settings", icon: Settings },
  { path: "/env", label: "Env Vars", icon: Key },
  { path: "/logs", label: "Logs", icon: FileText },
  { path: "/models", label: "Models", icon: Bot },
  { path: "/chat", label: "Terminal", icon: Terminal },
  { path: "/docs", label: "Docs", icon: BookOpen },
];

interface SidebarProps {
  onToggleChat: () => void;
  chatOpen: boolean;
}

export function Sidebar({ onToggleChat, chatOpen }: SidebarProps) {
  return (
    <aside className="flex flex-col w-[68px] bg-[#FFFBF5] border-r border-[#F0E6D8] shrink-0">
      {/* Logo / brand mark */}
      <div className="flex items-center justify-center h-[56px] border-b border-[#F0E6D8]">
        <span className="text-xs font-bold tracking-widest text-[#FAD4C0]">AO</span>
      </div>

      {/* Nav icons */}
      <nav className="flex flex-col items-center gap-1 py-3 flex-1">
        {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            title={label}
            className={({ isActive }: NavLinkRenderProps) =>
              cn(
                "flex items-center justify-center w-10 h-10 rounded-[10px] transition-all duration-150",
                "text-[#9CA3AF] hover:text-[#111827] hover:bg-[#FAD4C0]",
                isActive && "bg-[#FAD4C0] text-[#111827] shadow-sm"
              )
            }
          >
            <Icon size={20} />
          </NavLink>
        ))}
      </nav>

      {/* Chat toggle */}
      <div className="flex flex-col items-center py-3 border-t border-[#F0E6D8] gap-1">
        <button
          onClick={onToggleChat}
          title={chatOpen ? "Collapse chat" : "Expand chat"}
          className={cn(
            "flex items-center justify-center w-10 h-10 rounded-[10px] transition-all duration-150",
            "text-[#9CA3AF] hover:text-[#111827] hover:bg-[#FAD4C0]",
            chatOpen && "bg-[#FAD4C0] text-[#111827] shadow-sm"
          )}
        >
          <Terminal size={20} />
        </button>
        <ChevronRight
          size={14}
          className={cn(
            "text-[#D4C8B8] transition-transform duration-200",
            !chatOpen && "rotate-180"
          )}
        />
      </div>
    </aside>
  );
}
