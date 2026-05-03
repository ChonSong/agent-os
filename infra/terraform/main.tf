terraform {
  required_version = ">= 1.6"
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4"
    }
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token (set via TF_VAR_cloudflare_api_token env var)"
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID"
  type        = string
}

variable "zone_id" {
  description = "Cloudflare zone ID for codeovertcp.com"
  type        = string
}

variable "domain" {
  description = "Domain for the tunneled application"
  type        = string
  default     = "appexample.codeovertcp.com"
}

variable "github_org" {
  description = "GitHub organization for Access policy"
  type        = string
  default     = "ChonSong"
}

variable "tunnel_secret" {
  description = "Tunnel secret (set via TF_VAR_tunnel_secret env var)"
  type        = string
  sensitive   = true
}

# ── Tunnel ──────────────────────────────────────────────────────────────────
resource "cloudflare_tunnel" "agent_os" {
  account_id = var.cloudflare_account_id
  name       = "agent-os-tunnel"
  secret     = var.tunnel_secret
}

resource "cloudflare_tunnel_route" "agent_os" {
  zone_id   = var.zone_id
  tunnel_id = cloudflare_tunnel.agent_os.id
  domain    = var.domain
}

# ── Access Policy ────────────────────────────────────────────────────────────
resource "cloudflare_access_application" "agent_os" {
  account_id = var.cloudflare_account_id
  name       = "agent-os"
  domain     = var.domain
}

resource "cloudflare_access_policy" "agent_os" {
  application_id = cloudflare_access_application.agent_os.id
  name          = "GitHub org members — ChonSong"
  include {
    github {
      organizations = [var.github_org]
    }
  }
}

# ── Outputs ─────────────────────────────────────────────────────────────────
output "tunnel_id" {
  value       = cloudflare_tunnel.agent_os.id
  description = "Tunnel UUID (use with cloudflared connect)"
}

output "tunnel_name" {
  value       = cloudflare_tunnel.agent_os.name
  description = "Tunnel name"
}

output "access_domain" {
  value = cloudflare_access_application.agent_os.domain
}
