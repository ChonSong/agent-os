# Migration Status: agent-os → hermes-web-computer

**Target Stack:** Go backend + Svelte 5 frontend (hermes-web-computer)
**Source Stack:** Express backend + React frontend (agent-os)

---

## Migrated (v1.0 Complete)

| Feature | agent-os Source | hermes-web-computer Target | Status |
|---------|----------------|---------------------------|--------|
| Terminal | `/terminal` (xterm.js, Socket.IO) | `Terminal.svelte` (WS multiplexer) | ✅ Phase 1 |
| Editor | — | `Monaco.svelte` (Ctrl+S save) | ✅ Phase 1 |
| Agent Chat | `/chat` (SSE) | `RightPanel.svelte` (WS, voice) | ✅ Phase 1 |
| Voice UI | — | MediaRecorder → WS audio bridge | ✅ Phase 1 |
| Browser | — | `Browser.svelte` (chromedp backend) | ✅ Phase 2 |
| Dashboard Overview | `/dashboard` | `DashOverview.svelte` | ✅ Phase 3 |
| File Manager | `/files` | `DashFileManager.svelte` | ✅ Phase 3 |
| System Status | `/containers` | `DashSystemStatus.svelte` | ✅ Phase 3 |
| Analytics | `/analytics` | `DashAnalytics.svelte` | ✅ Phase 3 |
| Observability | `/observability` | `DashObservability.svelte` | ✅ Phase 3 |
| Tiling Layout | — | `Tile.svelte` + layout tree | ✅ Phase 3 |
| Glassmorphism UI | — | Illogical Impulse theme | ✅ Phase A-F |

## Pending Migration

| Feature | agent-os Page | Complexity | Notes |
|---------|--------------|------------|-------|
| Cron Management | `/cron` | Medium | Job CRUD, schedule editor |
| Profiles | `/profiles` | Medium | Profile CRUD, soul.md editor |
| Skills | `/skills` | Low | Toggle, install |
| Tools | `/tools` | Low | Toolset config |
| MCP | `/mcp` | Medium | Server management |
| Models | `/models` | Low | Model info, assignment |
| Settings | `/settings` | Low | Theme picker, prefs |
| Config Editor | `/config` | Low | Raw YAML/JSON editor |
| Logs | `/logs` | Medium | Real-time container log streaming |
| Container Mgmt | `/containers` | High | Dockerode integration |
| Sessions | `/sessions` | Medium | History, search |
| Memory | `/memory` | Low | File browser |
| Env | `/env` | Low | Variable management |

## Design Migration

| Element | agent-os | hermes-web-computer |
|---------|----------|---------------------|
| Theme System | 11 themes via data-theme CSS vars | Illogical Impulse glassmorphism (single) |
| Color Palette | Warm Bento default + variants | Purple/white glass palette |
| Layout | Fixed page routes | Dynamic tiling window manager |
| Navigation | Sidebar + page routes | Workspace pills + dock + keyboard shortcuts |

## Not Migrating (Deferred to Plugins)

- App Store UI → plugin system
- Docs page → external documentation
- Environment variable management → config file
