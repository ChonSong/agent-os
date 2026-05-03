# Cloudflare Infrastructure

## What this creates

- Cloudflare Tunnel: agent-os-tunnel
- DNS record for appexample.codeovertcp.com
- Cloudflare Access Application + Policy (GitHub OAuth -- ChonSong org members only)

## Setup (one-time)

1. Create a Cloudflare API token at dash.cloudflare.com/profile/api-tokens with:
   - Account: Tunnel: Edit
   - Zone: DNS: Edit
   - Access: Organisations: Read
   - Access: Applications: Edit

2. Get Account ID and Zone ID from your domain dashboard overview page

3. Generate tunnel secret: cloudflared tunnel secret generate agent-os-tunnel

4. Apply Terraform:
   cd infra/terraform
   cp variables.auto.tfvars.example variables.auto.tfvars
   # fill in variables
   terraform init && terraform apply

5. Set CLOUDFLARED_TUNNEL_TOKEN in .env

## Notes
- Terraform apply must be run locally -- no Cloudflare credentials in GitHub
- Access policy uses GitHub OAuth -- only ChonSong org members
