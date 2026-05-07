#!/usr/bin/env python3
# Cloudflare Zero Trust MCP Server
CF_API_BASE = "https://api.cloudflare.com/client/v4"
CF_API_TOKEN = os.environ.get('CLOUDFLARE_API_TOKEN', '')
CF_ACCOUNT_ID = os.environ.get('CLOUDFLARE_ACCOUNT_ID', '')

_HEADERS = {
    'Authorization': f'Bearer {CF_API_TOKEN}',
    'Content-Type': 'application/json',
    'Accept': 'application/json',
}

def _cf_get(path, params=None):
    url = f'{CF_API_BASE}/accounts/{CF_ACCOUNT_ID}{path}'
    r = httpx.get(url, headers=_HEADERS, params=params or {}, timeout=30)
    r.raise_for_status()
    return r.json()

def _cf_post(path, data=None):
    url = f'{CF_API_BASE}/accounts/{CF_ACCOUNT_ID}{path}'
    r = httpx.post(url, headers=_HEADERS, json=data or {}, timeout=30)
    r.raise_for_status()
    return r.json()

def _cf_delete(path):
    url = f'{CF_API_BASE}/accounts/{CF_ACCOUNT_ID}{path}'
    r = httpx.delete(url, headers=_HEADERS, timeout=30)
    r.raise_for_status()
    return r.json()


TOOL_DEFS = [
    {"name": "tunnel_create", "description": "Create a Cloudflare Tunnel.", "inputSchema": {"type": "object", "properties": {"name": {"type": "string", "description": "Tunnel name."}, "secret": {"type": "string", "description": "Min 32-char secret."}}, "required": ["name", "secret"]}},
    {"name": "tunnel_delete", "description": "Delete a tunnel by ID.", "inputSchema": {"type": "object", "properties": {"tunnel_id": {"type": "string"}}, "required": ["tunnel_id"]}},
    {"name": "tunnel_list", "description": "List all tunnels in account.", "inputSchema": {"type": "object", "properties": {}}},
    {"name": "tunnel_inspect", "description": "Inspect tunnel status and connections.", "inputSchema": {"type": "object", "properties": {"tunnel_id": {"type": "string"}}, "required": ["tunnel_id"]}},
    {"name": "tunnel_route_dns", "description": "Route a hostname through a tunnel.", "inputSchema": {"type": "object", "properties": {"tunnel_id": {"type": "string"}, "hostname": {"type": "string"}, "lb_pool": {"type": "boolean"}}, "required": ["tunnel_id", "hostname"]}},
    {"name": "tunnel_delete_dns", "description": "Delete tunnel DNS routing.", "inputSchema": {"type": "object", "properties": {"hostname": {"type": "string"}}, "required": ["hostname"]}},
    {"name": "access_policy_list", "description": "List Access policies.", "inputSchema": {"type": "object", "properties": {"app_name": {"type": "string", "description": "App name (optional)."}}}},
    {"name": "access_policy_create", "description": "Create an Access policy.", "inputSchema": {"type": "object", "properties": {"app_name": {"type": "string"}, "policy_name": {"type": "string"}, "decision": {"type": "string", "enum": ["allow", "deny", "block"]}, "include": {"type": "array", "items": {"type": "object"}}, "exclude": {"type": "array", "items": {"type": "object"}}, "require": {"type": "array", "items": {"type": "object"}}, "session_duration": {"type": "string"}}, "required": ["app_name", "policy_name", "decision", "include"]}},
    {"name": "access_policy_delete", "description": "Delete an Access policy.", "inputSchema": {"type": "object", "properties": {"app_name": {"type": "string"}, "policy_id": {"type": "string"}}, "required": ["app_name", "policy_id"]}},
    {"name": "access_app_create", "description": "Register an internal service as an Access app.", "inputSchema": {"type": "object", "properties": {"name": {"type": "string"}, "domain": {"type": "string"}, "origin": {"type": "string"}, "type": {"type": "string", "enum": ["ssh", "http", "rdp", "vnc"]}, "session_duration": {"type": "string"}, "auto_redirect_to_identity": {"type": "boolean"}}, "required": ["name", "domain", "origin", "type"]}},
    {"name": "access_app_delete", "description": "Delete an Access application.", "inputSchema": {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}},
]

def _tunnel_create(args):
    result = _cf_post("/tunnels", {"name": args["name"], "secret": args["secret"]})
    if not result.get("success"):
        return json.dumps({"error": result.get("errors", [{"message": "unknown"}])[0]["message"]})
    t = result["result"]
    return json.dumps({"tunnel_id": t["id"], "name": t["name"], "connector_token": t.get("connector_token", ""), "created_at": t["created_at"]})

def _tunnel_delete(args):
    _cf_delete(f"/tunnels/{args['tunnel_id']}")
    return json.dumps({"deleted": True, "tunnel_id": args["tunnel_id"]})

def _tunnel_list(_args):
    result = _cf_get("/tunnels")
    tunnels = [{"id": t["id"], "name": t["name"], "status": t["status"], "created_at": t["created_at"]} for t in result.get("result", [])]
    return json.dumps({"tunnels": tunnels, "count": len(tunnels)})

def _tunnel_inspect(args):
    result = _cf_get(f"/tunnels/{args['tunnel_id']}/connections")
    return json.dumps({"result": result.get("result"), "success": result.get("success")})

def _tunnel_route_dns(args):
    result = _cf_post(f"/tunnels/{args['tunnel_id']}/route_dns", {"hostname": args['hostname'], "lb_pool": args.get('lb_pool', False)})
    return json.dumps({"result": result.get("result"), "success": result.get("success")})

def _tunnel_delete_dns(args):
    result = _cf_delete(f"/tunnels/{args['hostname']}/route_dns")
    return json.dumps({"deleted": True, "hostname": args["hostname"], "success": result.get("success")})

def _access_policy_list(args):
    params = {"name": args["app_name"]} if args.get("app_name") else {}
    result = _cf_get("/access/policies", params=params)
    return json.dumps({"policies": result.get("result", []), "count": len(result.get("result", []))})

def _access_policy_create(args):
    app_result = _cf_get("/access/apps", params={"name": args["app_name"]})
    apps = app_result.get("result", [])
    if not apps:
        return json.dumps({'error': f"Access app not found: {args['app_name']}"})
    app_id = apps[0]["id"]
    policy_body = {"name": args["policy_name"], "decision": args["decision"], "include": args.get("include", []), "exclude": args.get("exclude", []), "require": args.get("require", [])}
    if args.get("session_duration"):
        policy_body["session_duration"] = args["session_duration"]
    result = _cf_post(f"/access/apps/{app_id}/policies", policy_body)
    if not result.get("success"):
        return json.dumps({"error": result.get("errors", [{"message": "unknown"}])[0]["message"]})
    p = result["result"]
    return json.dumps({"policy_id": p["id"], "name": p["name"], "decision": p["decision"], "created_at": p["created_at"]})

def _access_policy_delete(args):
    app_result = _cf_get("/access/apps", params={"name": args["app_name"]})
    apps = app_result.get("result", [])
    if not apps:
        return json.dumps({'error': f"Access app not found: {args['app_name']}"})
    app_id = apps[0]["id"]
    _cf_delete(f"/access/apps/{app_id}/policies/{args['policy_id']}")
    return json.dumps({"deleted": True, "policy_id": args["policy_id"], "app_name": args["app_name"]})

def _access_app_create(args):
    body = {"name": args["name"], "domain": args["domain"], "type": args["type"], "session_duration": args.get("session_duration", "24h"), "auto_redirect_to_identity": args.get("auto_redirect_to_identity", False)}
    result = _cf_post("/access/apps", body)
    if not result.get("success"):
        return json.dumps({"error": result.get("errors", [{"message": "unknown"}])[0]["message"]})
    app = result["result"]
    return json.dumps({"app_id": app["id"], "name": app["name"], "domain": app["domain"], "type": app["type"]})

def _access_app_delete(args):
    app_result = _cf_get("/access/apps", params={"name": args["name"]})
    apps = app_result.get("result", [])
    if not apps:
        return json.dumps({'error': f"Access app not found: {args['name']}"})
    app_id = apps[0]["id"]
    _cf_delete(f"/access/apps/{app_id}")
    return json.dumps({"deleted": True, "name": args["name"]})


TOOL_HANDLERS = {
    "tunnel_create": _tunnel_create,
    "tunnel_delete": _tunnel_delete,
    "tunnel_list": _tunnel_list,
    "tunnel_inspect": _tunnel_inspect,
    "tunnel_route_dns": _tunnel_route_dns,
    "tunnel_delete_dns": _tunnel_delete_dns,
    "access_policy_list": _access_policy_list,
    "access_policy_create": _access_policy_create,
    "access_policy_delete": _access_policy_delete,
    "access_app_create": _access_app_create,
    "access_app_delete": _access_app_delete,
}

def _handle_call_tool(name, arguments):
    handler = TOOL_HANDLERS.get(name)
    if not handler:
        return json.dumps({"error": f"Unknown tool: {name}"})
    try:
        return handler(arguments)
    except httpx.HTTPStatusError as e:
        try:
            err_body = e.response.json()
            msg = err_body.get("errors", [{}])[0].get("message", str(e))
        except Exception:
            msg = str(e)
        return json.dumps({"error": f"Cloudflare API error: {msg}"})
    except Exception as e:
        return json.dumps({"error": str(e)})


async def app(scope, receive, send):
    if scope["method"] == "GET" and scope["path"] == "/":
        await send({"type": "http.response.start", "status": 200, "headers": [[b"content-type", b"application/json"]]})
        await send({"type": "http.response.body", "body": json.dumps({"name": "cloudflare-zero-trust", "version": "1.0.0", "tools": TOOL_DEFS}).encode()})
        return
    if scope["method"] != "POST":
        await send({"type": "http.response.start", "status": 405, "headers": []})
        await send({"type": "http.response.body", "body": b""})
        return
    content_length = int(next((h[1] for h in scope["headers"] if h[0] == b"content-length"), b"0"))
    body = b""
    while len(body) < content_length:
        chunk = await receive()
        if chunk["type"] == "http.request":
            body += chunk["body"]
        elif chunk["type"] == "http.disconnect":
            break
    try:
        request = json.loads(body.decode())
    except Exception as e:
        await send({"type": "http.response.start", "status": 400, "headers": []})
        await send({"type": "http.response.body", "body": json.dumps({"error": f"Bad JSON: {e}"}).encode()})
        return
    method = request.get("method", "")
    if method == "tools/list":
        response_body = json.dumps({"tools": TOOL_DEFS}).encode()
    elif method == "tools/call":
        name = request.get("name", "")
        arguments = request.get("arguments") or {}
        try:
            result = _handle_call_tool(name, arguments)
            response_body = json.dumps({"content": [{"type": "text", "text": result}]}).encode()
        except Exception as e:
            response_body = json.dumps({"error": str(e)}).encode()
    else:
        response_body = json.dumps({"error": f"Unknown method: {method}"}).encode()
    await send({"type": "http.response.start", "status": 200, "headers": [[b"content-type", b"application/json"]]})
    await send({"type": "http.response.body", "body": response_body})

if __name__ == '__main__':
    import sys
    import argparse
    parser = argparse.ArgumentParser(description="Cloudflare Zero Trust MCP Server")
    parser.add_argument("--port", type=int, default=9000)
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args()
    if not CF_API_TOKEN or not CF_ACCOUNT_ID:
        print("ERROR: Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.", file=sys.stderr)
        sys.exit(1)
    print(f"Starting on {args.host}:{args.port}")
    try:
        import uvicorn
        from asgiref.simple_server import make_app
    except ImportError:
        print("ERROR: uvicorn and asgiref required: pip install -r requirements.txt")
        sys.exit(1)
    uvicorn.run(make_app(app), host=args.host, port=args.port, log_level="info")
