---
name: qwen-proxy-setup
description: "Set up and manage an OpenAI-compatible proxy server using Qwen Code's free tier (1k requests/day). Extracts OAuth credentials from qwen-code and runs a local API server with access to Qwen3 Coder models. Includes cloudflare tunnel for public access."
compatibility: Created for Zo Computer
metadata:
  author: georgeo.zo.computer
  daily_limit: 1000 requests/day
  models: ["qwen3-coder-plus","qwen3-coder-flash","qwen3.5-plus","qwen3.6-plus","coder-model","vision-model"]
---
# Qwen Proxy Setup

Create an OpenAI-compatible API server using your Qwen Code credentials. This lets you use Qwen's coding models through any OpenAI SDK or tool.

## Quick Start

```bash
# Setup (first time)
bun /home/workspace/Skills/qwen-proxy-setup/scripts/proxy.ts setup

# Start the proxy
bun /home/workspace/Skills/qwen-proxy-setup/scripts/proxy.ts start

# Create public tunnel (for Zo BYOK)
bun /home/workspace/Skills/qwen-proxy-setup/scripts/proxy.ts tunnel
```

## Commands

| Command | Description |
|---------|-------------|
| `setup` | Install qwen-proxy and extract credentials from qwen-code |
| `start` | Start the proxy server on localhost:8080 |
| `stop` | Stop the proxy server |
| `restart` | Restart the proxy server |
| `status` | Check proxy and account status |
| `test` | Test the proxy with a sample request |
| `models` | List available models |
| `usage` | Show daily usage count |
| `tunnel` | Create a cloudflare tunnel for public access |

## Available Models

- `qwen3-coder-flash` - Fast, good for most tasks (recommended)
- `qwen3-coder-plus` - Higher quality, slower
- `qwen3.5-plus` - General purpose
- `qwen3.6-plus` - Latest general model
- `coder-model` - Full agentic coding model (slow, can timeout)
- `vision-model` - Vision/multimodal

## Usage Examples

### Local Usage (curl)

```bash
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer any" \
  -d '{
    "model": "qwen3-coder-flash",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

### Python OpenAI SDK

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8080/v1",
    api_key="any"  # Doesn't matter
)

response = client.chat.completions.create(
    model="qwen3-coder-flash",
    messages=[{"role": "user", "content": "Write a hello world"}]
)
print(response.choices[0].message.content)
```

### Zo BYOK Integration

1. Run `bun .../proxy.ts tunnel` to get a public URL
2. Go to [Settings > AI > Providers](/?t=settings&s=ai&d=providers)
3. Add a custom provider with:
   - **Name**: Qwen Proxy
   - **Base URL**: `https://xxx.trycloudflare.com/v1` (from tunnel command)
   - **API Key**: `any`
4. Create a model and use `qwen3-coder-flash`

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │ --> │ Qwen Proxy  │ --> │  Qwen API   │
│ (OpenAI SDK)│     │ (localhost) │     │ (portal.ai) │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           v (optional)
                    ┌─────────────┐
                    │ Cloudflare  │
                    │   Tunnel    │
                    └─────────────┘
```

## Persistent Cloudflare Tunnel (Recommended)

Quick tunnels randomly disconnect. For a permanent URL, set up a persistent tunnel.

### Requirements

1. **Cloudflare account** (free) - https://dash.cloudflare.com/sign-up
2. **Domain on Cloudflare** - either buy one there (~$10/year) or delegate nameservers

### Setup Steps

```bash
# 1. Login to Cloudflare (opens browser)
cloudflared tunnel login

# 2. Create a named tunnel
cloudflared tunnel create qwen-proxy

# 3. Route to a subdomain (replace YOURDOMAIN.COM)
cloudflared tunnel route dns qwen-proxy qwen.YOURDOMAIN.COM

# 4. Run in background
nohup cloudflared tunnel run --url http://localhost:8080 qwen-proxy > /dev/shm/cloudflared-persistent.log 2>&1 &
```

### Verify

```bash
curl https://qwen.YOURDOMAIN.COM/health
```

### Benefits

- Permanent URL (no random changes)
- No idle timeout disconnects
- Works 24/7

### Manage Tunnel

```bash
# List tunnels
cloudflared tunnel list

# Delete tunnel
cloudflared tunnel delete qwen-proxy

# View logs
cat /dev/shm/cloudflared-persistent.log
```

## Notes

- Free tier: 1,000 requests per day
- Tokens auto-refresh using refresh_token
- Tunnel URLs change on restart (cloudflare quick tunnels)
- Avoid `coder-model` for simple requests - it's slow and can timeout
- Use streaming (`"stream": true`) for long responses

## Troubleshooting

### "Model stream interrupted"

Usually caused by:
1. Using `coder-model` instead of `qwen3-coder-flash`
2. Qwen API temporary timeout (retry)
3. Long prompts without streaming

### "Connection refused"

Proxy not running. Run `start` command.

### "Unauthorized" / "Invalid token"

Token expired. Run `setup` to refresh, or `restart` the proxy.
