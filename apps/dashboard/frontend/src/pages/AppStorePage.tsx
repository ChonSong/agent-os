/**
 * App Store — browse and install one-click apps.
 * Curated list sourced from CasaOS app registry.
 */
import { useState } from "react";
import { LayoutGrid, Download, Star, Tag } from "lucide-react";
import { H2 } from "@/components/NouiTypography";

interface App {
  id: string;
  name: string;
  icon: string;
  category: string;
  description: string;
  installCount: string;
  rating: number;
  installed: boolean;
}

// Curated seed list — replace with live CasaOS API in production
const FEATURED_APPS: App[] = [
  { id: "portainer", name: "Portainer", icon: "🟣", category: "DevOps", description: "Container management GUI", installCount: "10M+", rating: 4.8, installed: false },
  { id: "homeassistant", name: "Home Assistant", icon: "🏠", category: "Smart Home", description: "Local smart home control", installCount: "1M+", rating: 4.7, installed: false },
  { id: "pihole", name: "Pi-hole", icon: "🛡️", category: "Network", description: "Network-wide ad blocking DNS", installCount: "5M+", rating: 4.6, installed: false },
  { id: "nzbget", name: "NZBGet", icon: "📥", category: "Download", description: "Usenet download manager", installCount: "500K+", rating: 4.5, installed: false },
  { id: "jellyfin", name: "Jellyfin", icon: "🎬", category: "Media", description: "Free media server", installCount: "2M+", rating: 4.7, installed: false },
  { id: "vaultwarden", name: "Vaultwarden", icon: "🔐", category: "Security", description: "Self-hosted Bitwarden password manager", installCount: "800K+", rating: 4.8, installed: false },
  { id: "calibre", name: "Calibre Web", icon: "📚", category: "Media", description: "eBook management", installCount: "300K+", rating: 4.4, installed: false },
  { id: "grafana", name: "Grafana", icon: "📊", category: "DevOps", description: "Metrics dashboards", installCount: "1M+", rating: 4.6, installed: false },
];

export default function AppStorePage() {
  const [apps] = useState<App[]>(FEATURED_APPS);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");

  const categories = ["All", ...Array.from(new Set(apps.map((a) => a.category)))];

  const filtered = apps.filter((app) => {
    const matchesSearch = app.name.toLowerCase().includes(search.toLowerCase()) ||
                          app.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === "All" || app.category === category;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#1f2937] shrink-0">
        <div>
          <H2 variant="xl" className="text-[#e8e6e3]">App Store</H2>
          <H2 variant="sm" className="text-[#6b7280]">
            One-click install for self-hosted apps
          </H2>
        </div>
      </div>

      {/* Search + filters */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-[#1f2937] shrink-0">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search apps..."
          className="flex-1 bg-[#111827] border border-[#1f2937] rounded-lg px-3 py-1.5 text-xs text-[#e8e6e3] placeholder-[#4b5563] focus:outline-none focus:border-[#10b981]"
        />
        <div className="flex items-center gap-1 overflow-x-auto">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-3 py-1 rounded-lg text-[10px] whitespace-nowrap transition-all ${
                category === cat
                  ? "bg-[#10b981] text-[#0a0e14] font-semibold"
                  : "bg-[#1f2937] text-[#9ca3af] hover:text-[#e8e6e3]"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* App grid */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((app) => (
            <div
              key={app.id}
              className="bg-[#111827] border border-[#1f2937] rounded-xl p-4 flex flex-col gap-3 hover:border-[#374151] transition-colors"
            >
              <div className="flex items-start gap-3">
                <span className="text-3xl">{app.icon}</span>
                <div className="flex-1 min-w-0">
                  <H2 variant="sm" className="text-[#e8e6e3]">{app.name}</H2>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Star size={10} className="text-yellow-400 fill-yellow-400" />
                    <span className="text-[10px] text-[#9ca3af]">{app.rating}</span>
                    <span className="text-[#4b5563] mx-1">·</span>
                    <Tag size={10} className="text-[#6b7280]" />
                    <span className="text-[10px] text-[#6b7280]">{app.category}</span>
                  </div>
                </div>
              </div>

              <H2 variant="sm" className="text-[#9ca3af]">
                {app.description}
              </H2>

              <div className="flex items-center justify-between pt-1 border-t border-[#1f2937]">
                <span className="text-[10px] text-[#6b7280]">{app.installCount} installs</span>
                <button
                  className={`flex items-center gap-1 px-3 py-1 rounded-lg text-[10px] font-semibold transition-all ${
                    app.installed
                      ? "bg-[#1f2937] text-[#9ca3af]"
                      : "bg-[#10b981] text-[#0a0e14] hover:bg-[#0d9f6e]"
                  }`}
                >
                  <Download size={11} />
                  {app.installed ? "Installed" : "Install"}
                </button>
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-[#6b7280]">
            <LayoutGrid size={36} className="opacity-30" />
            <p className="text-sm">No apps match your search</p>
          </div>
        )}
      </div>
    </div>
  );
}
