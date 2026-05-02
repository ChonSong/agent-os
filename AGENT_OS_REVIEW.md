# agent-os Architecture Review — 2026-05-02

## What Exists

```
agent-os/
├── packages/
│   ├── nanobot/              # HKUDS/nanobot (ChonSong fork) — the agent engine
│   │   ├── agent/loop.py     # AgentLoop — core async processing engine (1356 lines)
│   │   ├── agent/runner.py   # AgentRunner — shared execution loop with tool calling
│   │   ├── agent/tools/      # Tool registry: file, shell, web, search, mcp, cron, spawn
│   │   ├── session/manager.py # SessionManager — file-based session persistence
│   │   ├── api/server.py     # OpenAI-compatible HTTP API (:8900)
│   │   ├── bus/events.py     # Event types (AIE events: TOOL_CALL, DRIFT, TASK_COMPLETE…)
│   │   ├── bus/queue.py      # MessageBus — async event queue
│   │   ├── channels/         # 15+ channel adapters (telegram, discord, slack, ws, …)
│   │   ├── cron/service.py   # Cron scheduling service
│   │   └── heartbeat/       # Heartbeat service
│   ├── agent-adapter/        # AgentAdapter protocol + NanobotAdapter (OpenAI API wrapper)
│   ├── observability/        # AIELogger (JSONL event logging)
│   └── shared-types/         # TypeScript types
├── apps/dashboard/
│   ├── backend/src/index.ts  # Express backend (:3001) — Docker proxy + container CRUD
│   └── frontend/src/         # React + Vite SPA on :9120
│       ├── pages/            # ContainerPage, AppStorePage, FileExplorerPage, SettingsPage
│       └── lib/api.ts        # Hermes-style API client
└── docker-compose.yml        # nanobot + dashboard services
```

---

## Is the Architecture Right?

**Broadly yes. The separation is correct.**

| Layer | Role | Correct? |
|---|---|---|
| nanobot | Agent brain — tool calling, LLM loop, session state | ✅ |
| agent-adapter | Protocol bridge — abstracts agent behind `AgentAdapter` | ✅ Good pattern |
| observability | Event emission — AIE events defined but **not wired into AgentLoop** | ⚠️ |
| dashboard backend | Docker proxy + container management | ✅ |
| React SPA | Dashboard UI | ✅ |
| docker-compose | Service orchestration | ✅ |

The `AgentAdapter` abstraction is the right idea — it decouples the dashboard from nanobot specifically, so any OpenAI-compatible agent could slot in. This is good architecture.

---

## Are We Properly Leveraging Existing Code?

### ✅ nanobot — fully utilized

The nanobot fork is the right choice. It already has:
- Full async agent loop with tool calling (`agent/loop.py`)
- Session management with file persistence (`session/manager.py`)
- 15+ channel integrations (don't need most of these for agent-os)
- Cron and heartbeat services
- OpenAI-compatible API server
- MCP tool support
- Skill loading system

**This is a mature, production-grade agent framework.** We're not reinventing anything here.

### ⚠️ observability — defined but not wired

`packages/observability/observability/events.py` defines event types (TOOL_CALL, DRIFT, CIRCUIT_OPEN, TASK_COMPLETE, DELEGATION, ASSUMPTION). `logger.py` has an `AIELogger` that writes JSONL.

**Problem: AgentLoop never emits these events.** The `on_progress` callback fires for tool start/finish, but the structured AIE events are never constructed or logged. The observability layer is dead code unless hooked into `AgentLoop._LoopHook`.

**Fix:** Emit `AIEEvent` from `AgentLoop` hooks → `AIELogger.log()`. This is a thin wiring job.

### ❌ agent-adapter → dashboard — not connected

The `NanobotAdapter` exists but:
- The dashboard backend (`apps/dashboard/backend/src/index.ts`) has **no agent integration**
- It only proxies Docker and lists containers
- There's no WebSocket or SSE route for real-time agent output
- There's no endpoint that calls `NanobotAdapter` or routes to nanobot's API

The dashboard frontend (`lib/api.ts`) calls Hermes-style endpoints (`/api/status`, `/api/sessions`, `/api/logs`, etc.) that **don't exist in this backend**. They're Hermes gateway endpoints.

**This is the critical gap.** The frontend and backend are from different codebases and don't match.

### ❌ docker-compose — incomplete

The compose defines nanobot + dashboard, but:
- No shared volume for agent state between restarts (session files go to `nanobot-workspace` but workspace itself isn't backed up)
- No health check wait condition between services
- nanobot healthcheck is on port 8900 but dashboard has no way to know if agent is healthy beyond Docker's `service_healthy`
- No restart policy for crash loops (watchdog is missing)
- No backup cron for session state

---

## What's Missing (Critical Path to "Agentic")

For agent-os to be a real product, these need to exist:

### 1. Control Plane — the missing layer

```
Dashboard SPA (:9120)
       ↕ HTTP/WebSocket
Control Plane (FastAPI, :8080)          ← DOES NOT EXIST
  - Routes agent requests to nanobot API
  - Manages session lifecycle
  - Emits events to observability logger
  - Watchdog for nanobot crash loops
       ↕ HTTP (OpenAI compat)
nanobot (:8900)
```

The control plane is the adapter between the React UI and nanobot. It should:
- Accept chat messages from the frontend
- Forward to nanobot's `/v1/chat/completions`
- Stream responses back via SSE/WebSocket
- Persist sessions to a database (not just nanobot's file-based sessions)
- Emit structured AIE events
- Implement watchdog: restart nanobot if healthcheck fails 3x in a row

**Without this, the dashboard is a Docker management UI — not an agent dashboard.**

### 2. Real-time event stream

The frontend needs live updates as the agent works. Currently:
- No WebSocket route exists in the backend
- nanobot has `MessageBus` and SSE streaming in its API server, but the dashboard doesn't consume it

### 3. Session persistence outside nanobot's process

nanobot's `SessionManager` writes to `~/.nanobot/workspace/sessions/` as JSON files. This is fine for durability, but:
- No unified session DB (PostgreSQL or SQLite) for cross-session queries
- No session search
- The observability events have nowhere structured to live

### 4. Iteration limit exit handling (from hermes-agent patch)

The `_handle_max_iterations` fix in hermes-agent (80%/90% warnings, session flush) has **no equivalent in nanobot**. If nanobot hits its iteration cap, it will stop abruptly with no user warning and no session flush.

---

## Agent Choice Evaluation

| Agent | Verdict |
|---|---|
| **nanobot (current)** | ✅ Right choice — lightweight, API-first, mature tool calling, already forked and running |
| hermes-agent | Over-engineered for agent-os runtime; good for the dev/CLI session you're in now |
| OpenClaw/ZeroClaw/PicoClaw | Deprecated/inactive — don't use |
| hybrid nanobot+hermes | Unnecessary complexity at this stage |

**nanobot is correct.** Don't try to merge hermes-agent's skill system or session management into nanobot. Build the control plane adapter instead.

---

## Recommended Approach

### Phase 1: Fix the broken dashboard (1-2 sessions)

- [ ] Replace dashboard backend Express app with a thin FastAPI control plane
- [ ] Wire `NanobotAdapter` to handle chat → nanobot `/v1/chat/completions`
- [ ] Add SSE streaming endpoint for real-time agent output to frontend
- [ ] Fix frontend API client to call the actual backend endpoints (or vice versa)
- [ ] Get a working chat round-trip: frontend → backend → nanobot → backend → frontend

### Phase 2: Observability + watchdog (1 session)

- [ ] Hook `AIELogger` into `AgentLoop._LoopHook` (after_iteration, before_execute_tools)
- [ ] Add watchdog to control plane: poll nanobot `/health` every 30s, restart container on 3 consecutive failures
- [ ] Emit structured events: TOOL_CALL on tool execute, TASK_COMPLETE on final response

### Phase 3: Session durability + backup (1 session)

- [ ] Add SQLite session DB to control plane (supersedes nanobot's file-based sessions for querying)
- [ ] Sync nanobot session files into the DB on agent idle
- [ ] Add cron backup: `git add sessions/ && git commit` every 5 minutes to agent-os git repo
- [ ] Optional: second container as hot standby reading same volume

### Phase 4: Skill system (later)

- [ ] Leverage nanobot's existing `skills/` loader (it already has one)
- [ ] Add skill management UI page
- [ ] Skill events → observability

---

## Key Files to Know

| File | Purpose |
|---|---|
| `packages/nanobot/nanobot/agent/loop.py` | Core AgentLoop — where events should be emitted |
| `packages/nanobot/nanobot/agent/runner.py` | AgentRunner — handles tool execution loop |
| `packages/nanobot/nanobot/api/server.py` | OpenAI-compatible API — the interface the control plane calls |
| `packages/nanobot/nanobot/session/manager.py` | File-based sessions — source of truth for now |
| `packages/agent-adapter/agent_adapter/nanobot_adapter.py` | HTTP adapter — what the control plane uses |
| `packages/observability/observability/events.py` | Event types — currently not emitted |
| `packages/observability/observability/logger.py` | JSONL logger — needs to be wired |
| `apps/dashboard/backend/src/index.ts` | Needs replacement with FastAPI control plane |
| `docker-compose.yml` | Needs watchdog + backup cron added |

---

## Open Questions

1. **Database for control plane?** SQLite (simple, no separate service) vs PostgreSQL (more robust, separate container). Recommendation: SQLite for now, migrate to PostgreSQL if multi-instance needed.

2. **Frontend framework?** Current React SPA is fine. Could swap for anything that can call HTTP/SSE.

3. **Authentication?** Not currently designed. For self-hosted use case, probably fine. For multi-user, need session tokens + auth middleware.

4. **Cloudflare tunnel DNS?** Mentioned in prior session notes. Currently not in the codebase. AppStorePage is a placeholder.

---

*Review compiled from codebase inspection. Next session should begin with Phase 1.*
