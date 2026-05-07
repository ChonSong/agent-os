---
name: cloudflare-zero-trust
description: Manage Cloudflare Tunnel (argo tunnel) connections and Access policies to expose internal services securely to the public web. Use when you need to: (1) create or delete Cloudflare Tunnels, (2) configure Access policies (identity, device posture, service token rules) for internal dashboards, (3) inspect tunnel status and health, (4) expose an internal HTTP service (e.g. observability UI on port 3000) as a public URL with zero-trust auth. Triggers: &quot;expose my dashboard&quot;, &quot;create a tunnel&quot;, &quot;Cloudflare Access policy&quot;, &quot;tunnel my local service&quot;.
metadata: {hermes: {category: "infrastructure", requires: {env: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"]}}}
---

# Cloudflare Zero Trust MCP Server

This MCP server wraps the [Cloudflare API v4](https://developers.cloudflare.com/api/) to provide tunnel and Access management capabilities for the Hermes Agent.

## When to Use

- The user wants to expose an internal web UI (Grafana, observability dashboard, etc.) to the public internet securely
- Setting up or tearing down Cloudflare Tunnels programmatically
- Managing Access policies that control who can reach internal services
- Checking tunnel health or diagnosing connectivity issues

## Architecture

```
Hermes Agent
    └── MCP client (native hermes mcp tool)
            └── cloudflare-zero-trust MCP server (this)
                    └── Cloudflare API v4 (api.cloudflare.com)
                            ├── Tunnel management (Warp Tunnel)
                            └── Access Policy management
```

## Setup

### 1. Install the MCP server

```bash
# Add to ~/.hermes/config.yaml under mcp.servers:
cloudflare-zero-trust:
  type: streamableHttp
  url: http://localhost:9000/cloudflare-mcp
  # Or run as a stdio process:
  command: python
  args: [/opt/data/mcp-servers/cloudflare-zero-trust/server.py]
```

Or add via CLI:
```bash
hermes mcp add cloudflare-zero-trust --command python --args server.py --cwd /opt/data/mcp-servers/cloudflare-zero-trust
```

### 2. Environment variables

Create `/opt/data/mcp-servers/cloudflare-zero-trust/.env`:

```bash
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token_here
CLOUDFLARE_ACCOUNT_ID=your_account_id_here
```

The token needs these permissions:
- `Account: Tunnels: Edit`
- `Account: Access: Policies: Edit`
- `Account: Access: Service Tokens: Edit`

### 3. Start the server

```bash
cd /opt/data/mcp-servers/cloudflare-zero-trust
python server.py
# Runs on http://localhost:9000/cloudflare-mcp
```

For production, run under systemd or as a Docker sidecar.

## Tools (MCP Resources)

### Tunnels

#### `tunnel_create`

Create a new Cloudflare Tunnel.

```json
{
  "name": "my-tunnel",
  "secret": "a-random-secret-at-least-32-chars"
}
```

Returns tunnel details including the `tunnel_id` and `connector_token` (use this as the tunnel credential).

#### `tunnel_delete`

Delete a tunnel by ID. Requires tunnel ID (uuid format).

#### `tunnel_list`

List all tunnels in the account. Returns tunnel name, ID, status, and created date.

#### `tunnel_inspect`

Get detailed status and connected instances for a running tunnel.

#### `tunnel_route_dns`

Create a CNAME record that routes a specific hostname through the tunnel.

```json
{
  "tunnel_id": "uuid-here",
  "hostname": "dash.mydomain.com",
  "lb_pool": false
}
```

#### `tunnel_delete_dns`

Remove the DNS routing for a tunnel hostname.

### Access Policies

#### `access_policy_list`

List all Access policies for a given application (or all applications).

#### `access_policy_create`

Create an Access policy for an application.

```json
{
  "app_name": "observability-dashboard",
  "policy_name": "Internal Only",
  "decision": "allow",
  "include": [
    { "type": "email" }
  ],
  "exclude": [],
  "require": [
    { "type": "email_domain", "domain": "mydomain.com" }
  ]
}
```

Supported include/exclude/require types:
- `email` — specific email addresses
- `email_domain` — all users in a domain
- `gsuite` — Google Workspace group
- `github` — GitHub organization members
- `device_posture` — device posture rules (requires WARP client)
- `service_token` — service token auth (for automated/machine access)

#### `access_policy_delete`

Delete an Access policy by policy ID and application name.

### Applications (Access Apps)

#### `access_app_create`

Register an internal service as an Access application.

```json
{
  "name": "observability-dashboard",
  "domain": "dash.mydomain.com",
  "origin": "http://localhost:3000",
  "type": "ssh" | "http" | "rdp" | "vnc",
  "session_duration": "24h",
  "auto_redirect_to_identity": true
}
```

#### `access_app_delete`

Delete an Access application.

## Example Workflows

### Expose Grafana to the public web with zero-trust auth

```bash
# 1. Create the tunnel
hermes
# → Use tunnel_create tool: name="grafana-tunnel"

# 2. Create the Access application for the internal service
# → Use access_app_create: name="grafana", domain="grafana.mydomain.com", origin="http://localhost:3000", type="http"

# 3. Route DNS through the tunnel
# → Use tunnel_route_dns: tunnel_id="<id>", hostname="grafana.mydomain.com"

# 4. Create an allow policy (mydomain.com users only)
# → Use access_policy_create: app_name="grafana", policy_name="mydomain users", include=[{type:"email_domain",domain:"mydomain.com"}]
```

### Inspect a tunnel's health

```bash
# List tunnels to find the ID
hermes
# → Use tunnel_list tool

# Inspect detailed health
hermes
# → Use tunnel_inspect tool with tunnel_id
```

## Notes

- The tunnel secret must be at least 32 characters.
- Tunnel credentials (connector_token) should be stored securely — do not log them.
- Access policies are evaluated in order; more specific policies should come before general ones.
- `session_duration` uses Go duration format (e.g., `24h`, `168h`, `30m`).
- For service-token-based automated access, create the token via Cloudflare dashboard first, then use `type: "service_token"` in the policy include block.
