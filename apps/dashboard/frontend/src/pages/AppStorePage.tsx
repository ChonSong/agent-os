/**
 * App Store — browse and install one-click apps from Docker Hub.
 */
import { useState, useEffect, useMemo } from "react";
import {
  Download, Star, Search,
  Box, Filter, CheckCircle2, AlertCircle, Loader2, Trash2,
} from "lucide-react";
import { H2 } from "@/components/NouiTypography";

interface DockerHubImage {
  name: string;
  description: string;
  star_count: number;
  pull_count: number;
  is_official: boolean;
  is_automated: boolean;
}

interface InstalledContainer {
  id: string;
  name: string;
  image: string;
  state: string;
}

const CATEGORIES = [
  "All", "Runtime", "Database", "Web Server", "Monitoring",
  "DevOps", "Security", "Network", "Media", "AI/ML",
];

const CATEGORY_TAGS: Record<string, string[]> = {
  Runtime:     ["alpine", "ubuntu", "debian", "nginx"],
  Database:    ["postgres", "mysql", "redis", "mongodb", "mariadb"],
  "Web Server":["nginx", "apache", "caddy"],
  Monitoring:  ["prometheus", "grafana", "influxdb"],
  DevOps:      ["jenkins", "gitlab", "drone", "traefik"],
  Security:    ["vault", "authelia"],
  Network:     ["wireguard", "tailscale", "netmaker"],
  Media:       ["plex", "jellyfin", "sonarr", "radarr"],
  "AI/ML":     ["tensorflow", "pytorch", "jupyter"],
};

const SEED_APPS = [
  { name: "nginx",           category: "Web Server", description: "Popular web server",                          star_count: 18000, pull_count: "10B+",  is_official: true,  is_automated: false },
  { name: "postgres",        category: "Database",   description: "Open source relational database",            star_count: 12000, pull_count: "5B+",   is_official: true,  is_automated: false },
  { name: "redis",           category: "Database",   description: "In-memory data structure store",             star_count: 9000,  pull_count: "3B+",   is_official: true,  is_automated: false },
  { name: "jenkins/jenkins", category: "DevOps",    description: "Continuous integration and delivery server", star_count: 8000,  pull_count: "1B+",   is_official: false, is_automated: true  },
  { name: "grafana/grafana", category: "Monitoring", description: "Observability platform",                    star_count: 7000,  pull_count: "500M+", is_official: false, is_automated: true  },
  { name: "plexinc/pms",     category: "Media",      description: "Media server for movies, TV, and music",    star_count: 6000,  pull_count: "100M+", is_official: false, is_automated: true  },
  { name: "ubuntu",          category: "Runtime",    description: "Open source Linux OS",                      star_count: 5500,  pull_count: "10B+",  is_official: true,  is_automated: false },
  { name: "grafana/prometheus", category: "Monitoring", description: "Metrics and alerting toolkit",           star_count: 5000,  pull_count: "100M+", is_official: false, is_automated: true  },
  { name: "wireguard",       category: "Network",   description: "Fast and modern VPN",                        star_count: 4500,  pull_count: "100M+", is_official: false, is_automated: true  },
  { name: "jupyter/datascience-notebook", category: "AI/ML", description: "Jupyter notebook for data science", star_count: 4000, pull_count: "50M+",  is_official: false, is_automated: true  },
  { name: "vault",           category: "Security",  description: "Secrets and encryption management",         star_count: 3500,  pull_count: "10M+",  is_official: false, is_automated: true  },
  { name: "mysql",           category: "Database",  description: "Open source relational database",             star_count: 10000, pull_count: "5B+",   is_official: true,  is_automated: false },
];

export default function AppStorePage() {
  const [activeTab, setActiveTab] = useState<"browse" | "installed">("browse");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [sortBy, setSortBy] = useState<"stars" | "pulls" | "name">("stars");
  const [images, setImages] = useState<DockerHubImage[]>([]);
  const [installed, setInstalled] = useState<InstalledContainer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [installing, setInstalling] = useState<Record<string, boolean>>({});
  const [installErrors, setInstallErrors] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(false);

  // Load installed containers
  useEffect(() => {
    if (activeTab === "installed") {
      fetch("/api/docker/containers/json?all=true")
        .then(r => r.json())
        .then(data => {
          const parsed = parseContainers(data);
          setInstalled(parsed.map((c: any) => ({
            id: c.Id,
            name: c.Names.replace(/^\/+/, ""),
            image: c.Image,
            state: c.State,
          })));
        })
        .catch(() => setInstalled([]));
    }
  }, [activeTab]);

  // Debounced search
  useEffect(() => {
    if (!search.trim()) { setImages([]); return; }
    const t = setTimeout(() => fetchImages(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  async function fetchImages(q: string) {
    setLoading(true);
    setError("");
    try {
      // Try Docker Hub API first
      const res = await fetch(`https://hub.docker.com/v2/search/repositories/?query=${encodeURIComponent(q)}&page_size=20`);
      if (res.ok) {
        const data = await res.json();
        setImages(data.results || []);
      } else {
        throw new Error("Docker Hub API failed");
      }
    } catch {
      // Fallback: search via backend proxy
      try {
        const res = await fetch(`/api/docker/search?q=${encodeURIComponent(q)}`);
        if (res.ok) setImages(await res.json());
        else throw new Error();
      } catch {
        setError("Search unavailable. Showing curated picks instead.");
        setImages([]);
      }
    }
    setLoading(false);
  }

  async function installImage(imageName: string) {
    setInstalling(prev => ({ ...prev, [imageName]: true }));
    setInstallErrors(prev => ({ ...prev, [imageName]: "" }));
    try {
      const res = await fetch("/api/docker/containers/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Image: imageName }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Failed" }));
        throw new Error(err.detail || "Install failed");
      }
      // Pull image
      await fetch("/api/docker/images/create?fromImage=" + imageName, { method: "POST" });
      setInstalled(prev => [...prev, { id: Date.now().toString(), name: imageName.split("/").pop() || imageName, image: imageName, state: "installed" }]);
    } catch (e: any) {
      setInstallErrors(prev => ({ ...prev, [imageName]: e.message }));
    }
    setInstalling(prev => ({ ...prev, [imageName]: false }));
  }

  async function uninstallContainer(id: string) {
    try {
      await fetch(`/api/docker/containers/${id}`, { method: "DELETE" });
      setInstalled(prev => prev.filter(c => c.id !== id));
    } catch {}
  }

  function parseContainers(data: any): any[] {
    if (Array.isArray(data)) return data;
    if (typeof data === "string") {
      return data.trim().split("\n").filter(Boolean).map((line: string) => {
        try { return JSON.parse(line); } catch { return {}; }
      });
    }
    return [];
  }

  const displayImages = useMemo(() => {
    let list = search.trim() && images.length > 0 ? images : SEED_APPS;
    if (selectedCategory !== "All") {
      const tags = CATEGORY_TAGS[selectedCategory] || [];
      list = (list as any).filter((img: any) => {
        const name = img.name.toLowerCase();
        return tags.some((t: string) => name.includes(t));
      });
    }
    return (list as any).sort((a: any, b: any) => {
      if (sortBy === "stars") return (b.star_count || 0) - (a.star_count || 0);
      if (sortBy === "pulls") return parsePullCount(b.pull_count) - parsePullCount(a.pull_count);
      return a.name.localeCompare(b.name);
    });
  }, [search, images, selectedCategory, sortBy]);

  function parsePullCount(s: string | number): number {
    if (!s) return 0;
    const str = String(s).toUpperCase();
    const m = str.match(/([\d.]+)([KMB]?)/);
    if (!m) return 0;
    let n = parseFloat(m[1]);
    if (m[2] === "K") n *= 1e3;
    else if (m[2] === "M") n *= 1e6;
    else if (m[2] === "B") n *= 1e9;
    return n;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-[#1f2937]">
        <div className="flex items-center justify-between mb-4">
          <H2 variant="xl" className="text-[#e8e6e3]">App Store</H2>
          <button
            onClick={() => setShowFilters(f => !f)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#1f2937] text-xs text-[#9ca3af] hover:text-[#e8e6e3] hover:bg-[#374151] transition-all"
          >
            <Filter size={13} /> Filters
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-[#1a1f2e] rounded-lg p-1 w-fit">
          {(["browse", "installed"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                activeTab === tab
                  ? "bg-[#2d3748] text-[#e8e6e3]"
                  : "text-[#6b7280] hover:text-[#9ca3af]"
              }`}
            >
              {tab === "browse" ? "Browse" : "Installed"}
            </button>
          ))}
        </div>

        {/* Search */}
        {activeTab === "browse" && (
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b7280]" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search Docker Hub for images..."
              className="w-full pl-9 pr-4 py-2 bg-[#1a1f2e] border border-[#2d3748] rounded-lg text-sm text-[#e8e6e3] placeholder-[#6b7280] focus:outline-none focus:border-[#3b82f6]"
            />
          </div>
        )}
      </div>

      {/* Filters panel */}
      {showFilters && activeTab === "browse" && (
        <div className="shrink-0 px-6 py-3 border-b border-[#1f2937] flex flex-wrap gap-2">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-full text-xs transition-all ${
                selectedCategory === cat
                  ? "bg-[#3b82f6] text-white"
                  : "bg-[#1f2937] text-[#9ca3af] hover:bg-[#2d3748]"
              }`}
            >
              {cat}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-[#6b7280]">Sort:</span>
            {(["stars", "pulls", "name"] as const).map(s => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={`px-2 py-0.5 rounded text-xs transition-all ${
                  sortBy === s ? "bg-[#3b82f6] text-white" : "text-[#6b7280] hover:text-[#9ca3af]"
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mx-6 mt-4 flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === "browse" ? (
          loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-[#6b7280]">
              <Loader2 size={32} className="animate-spin" />
              <p className="text-sm">Searching Docker Hub...</p>
            </div>
          ) : displayImages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-[#6b7280]">
              <Box size={48} className="opacity-20" />
              <p className="text-sm">No images found. Try a different search.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {(displayImages as any).map((img: any) => (
                <div
                  key={img.name}
                  className="bg-[#1a1f2e] border border-[#2d3748] rounded-xl p-4 flex flex-col gap-3 hover:border-[#3b82f6]/50 transition-all group"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{img.is_official ? "🟢" : "📦"}</span>
                      <div>
                        <H2 variant="sm" className="text-[#e8e6e3] font-semibold">{img.name.split("/").pop()}</H2>
                        <p className="text-xs text-[#6b7280]">{img.name.includes("/") ? img.name.split("/")[0] : "library"}</p>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-xs bg-[#2d3748] text-[#9ca3af]">
                      {img.is_official ? "Official" : "Community"}
                    </span>
                  </div>

                  <p className="text-xs text-[#9ca3af] line-clamp-2">{img.description || "No description available"}</p>

                  <div className="flex items-center gap-3 text-xs text-[#6b7280]">
                    <span className="flex items-center gap-1"><Star size={11} className="text-yellow-400" /> {img.star_count?.toLocaleString()}</span>
                    <span className="flex items-center gap-1"><Download size={11} /> {img.pull_count || "—"}</span>
                    {img.is_automated && <span className="text-blue-400">Auto-build</span>}
                  </div>

                  <div className="flex gap-2 mt-auto">
                    {installing[img.name] ? (
                      <button disabled className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-[#2d3748] text-[#6b7280] text-xs cursor-not-allowed">
                        <Loader2 size={13} className="animate-spin" /> Installing...
                      </button>
                    ) : (
                      <button
                        onClick={() => installImage(img.name)}
                        className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-[#3b82f6] hover:bg-[#2563eb] text-white text-xs font-medium transition-all"
                      >
                        <Download size={13} /> Install
                      </button>
                    )}
                  </div>
                  {installErrors[img.name] && (
                    <p className="text-xs text-red-400">{installErrors[img.name]}</p>
                  )}
                </div>
              ))}
            </div>
          )
        ) : (
          /* Installed tab */
          installed.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-[#6b7280]">
              <CheckCircle2 size={48} className="opacity-20" />
              <p className="text-sm">No containers installed yet</p>
              <button onClick={() => setActiveTab("browse")} className="text-xs text-[#3b82f6] hover:underline">Browse apps</button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {installed.map(container => (
                <div key={container.id} className="bg-[#1a1f2e] border border-[#2d3748] rounded-xl p-4 flex items-center gap-4">
                  <span className="text-2xl">📦</span>
                  <div className="flex-1 min-w-0">
                    <H2 variant="sm" className="text-[#e8e6e3] font-semibold truncate">{container.name}</H2>
                    <p className="text-xs text-[#6b7280] truncate">{container.image}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    container.state === "running"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-[#2d3748] text-[#6b7280]"
                  }`}>
                    {container.state}
                  </span>
                  <button
                    onClick={() => uninstallContainer(container.id)}
                    className="p-2 rounded-lg text-[#6b7280] hover:text-red-400 hover:bg-red-500/10 transition-all"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
