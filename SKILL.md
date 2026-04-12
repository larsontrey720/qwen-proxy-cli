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
| `enable` | Enable auto-startup with persistent tunnel |
| `disable` | Disable auto-startup service |

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

---

## Persistent Cloudflare Tunnel (Recommended)

Quick tunnels randomly disconnect. For a permanent URL, set up a persistent tunnel.

### Requirements

1. **Cloudflare account** (free tier works)
2. **A domain on Cloudflare** - Buy one through Cloudflare or delegate nameservers

### Setup

```bash
# 1. Login to Cloudflare
cloudflared tunnel login

# 2. Create a named tunnel
cloudflared tunnel create qwen-proxy
# Output: Tunnel credentials written to /root/.cloudflared/<id>.json

# 3. Route to a subdomain
cloudflared tunnel route dns qwen-proxy qwen.YOURDOMAIN.COM

# 4. Create config file
cat > /root/.cloudflared/config.yml << 'EOF'
tunnel: <TUNNEL_ID>
credentials-file: /root/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: qwen.YOURDOMAIN.COM
    service: http://localhost:8080
  - service: http_status:404
EOF

# 5. Run the tunnel
cloudflared tunnel run qwen-proxy
```

### Benefits

| Feature | Quick Tunnel | Persistent Tunnel |
|---------|-------------|-------------------|
| URL stability | Random, changes | Permanent |
| Reliability | Can disconnect | Stable 24/7 |
| Idle timeout | ~4 hours | None |

---

## Auto-Startup (24/7 Availability)

For permanent availability, enable auto-startup. This creates a Zo service that starts on boot.

### Requirements

- Persistent Cloudflare tunnel (set up first)
- Zo service slot (Free plan = 1 service)

### Enable

```bash
bun /home/workspace/Skills/qwen-proxy-setup/scripts/proxy.ts enable
```

This creates `/usr/local/bin/qwen-proxy-startup.sh`:

```bash
#!/bin/bash
cloudflared --config /root/.cloudflared/config.yml tunnel run &
CLOUDFLARED_PID=$!
sleep 3
exec qwen-proxy serve --headless
```

### Register as Zo Service

**Via UI:**
1. Go to Hosting > Services
2. Click "Add Service"
3. Set entrypoint: `/usr/local/bin/qwen-proxy-startup.sh`
4. Set protocol: `http`
5. Set port: `8080`

**Via CLI:**
```bash
zo service create qwen-proxy \
  --entrypoint /usr/local/bin/qwen-proxy-startup.sh \
  --protocol http \
  --port 8080
```

### How Auto-Startup Works

```
┌────────────────────────────────────────────────────────────────────┐
│                        Zo Service Manager                           │
│                     (starts on boot, auto-restart)                  │
└────────────────────────────────┬───────────────────────────────────┘
                                 │
                                 ▼
┌────────────────────────────────────────────────────────────────────┐
│              /usr/local/bin/qwen-proxy-startup.sh                  │
│                        (entrypoint)                                 │
├────────────────────────────────────────────────────────────────────┤
│  1. Fork cloudflared into background                               │
│  2. Wait 3 seconds for tunnel to establish                         │
│  3. Replace shell with qwen-proxy (exec)                           │
└────────────────────────────────┬───────────────────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    ▼                         ▼
        ┌───────────────────┐     ┌───────────────────┐
        │   cloudflared     │     │   qwen-proxy      │
        │   (background)    │     │   (foreground)    │
        │                   │     │                   │
        │  localhost:8080   │◄────│  serves API on    │
        │       ▲           │     │  port 8080        │
        │       │           │     │                   │
        └───────┼───────────┘     └───────────────────┘
                │
                ▼
        ┌───────────────────┐
        │  Cloudflare Edge  │
        │  qwen.domain.com  │
        └───────────────────┘
```

**Why `exec`?**

The `exec` command replaces the shell process with qwen-proxy:
- Service manager sees qwen-proxy as the main process
- If qwen-proxy crashes, service manager restarts it
- Signals go directly to qwen-proxy for graceful shutdown

### Disable

```bash
bun /home/workspace/Skills/qwen-proxy-setup/scripts/proxy.ts disable
```

---

## Migrating to Another VM

To move the tunnel to a new machine while keeping the same URL:

**Step 1: Copy credentials from current VM**

```bash
# Cloudflare tunnel credentials
cat /root/.cloudflared/<tunnel-id>.json

# Qwen OAuth token
cat /root/.qwen/oauth_creds_myqwen.json
```

**Step 2: On the new VM**

```bash
# Install dependencies
npm install -g qwen-proxy
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

# Create directories
mkdir -p /root/.cloudflared /root/.qwen

# Add tunnel credentials
cat > /root/.cloudflared/<tunnel-id>.json << 'EOF'
{...paste credentials here...}
EOF

# Add config
cat > /root/.cloudflared/config.yml << 'EOF'
tunnel: <tunnel-id>
credentials-file: /root/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: qwen.YOURDOMAIN.COM
    service: http://localhost:8080
  - service: http_status:404
EOF

# Add Qwen credentials
cat > /root/.qwen/oauth_creds_myqwen.json << 'EOF'
{...paste token here...}
EOF

# Enable auto-startup
bun proxy.ts enable
```

---

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │ --> │ Retry Server │ --> │ Qwen Proxy  │ --> │  Qwen API   │
│ (OpenAI SDK)│     │   (:8081)    │     │   (:8080)   │     │ (portal.ai) │
└─────────────┘     └──────────────┘     └─────────────┘     └─────────────┘
                           │
                           │ retry 429s with exponential backoff
                           v
                    ┌─────────────┐
                    │ Cloudflare  │
                    │   Tunnel    │
                    └─────────────┘
```

### Retry Server

The retry server sits in front of qwen-proxy on port 8081 and handles:

**Retries on:**
- `429` - Rate limited (up to 15 retries)
- `502/503/504` - Upstream errors (up to 5 retries)
- Connection failures - Network errors, timeouts, ECONNREFUSED (up to 5 retries)

**Retry logic:**
```typescript
// Fixed 2s delay, up to 5 retries
RETRY_STATUSES = [429, 502, 503, 504];

// Also catches fetch() exceptions (network errors)
catch (err) {
  // Retry on connection failure
}
```

**Architecture:**
```
cloudflared → :8081 (retry server) → :8080 (qwen-proxy) → Qwen API
```

When the tunnel drops and Cloudflare returns a 502 error page, the retry server catches it and keeps retrying until the tunnel recovers or qwen-proxy comes back online.

### Response Caching

The retry server also caches successful responses to avoid redundant API calls:

```
Request → Generate hash key from body → Check cache map
                                         ↓
                                   HIT? → Return cached response immediately
                                         ↓ no
                                   MISS? → Fetch from upstream qwen-proxy (with retry)
                                         ↓
                                   Cache response if OK (status 200)
                                         ↓
                                   Return to client
```

**Cache settings:**

| Aspect | How it works |
|--------|-------------|
| **Cache key** | SHA-256 hash of the raw request body — identical prompts = same key |
| **TTL** | 5 minutes per entry — after that, treated as fresh |
| **Scope** | Only caches successful responses (status 200) |
| **Eviction** | If > 100 entries, deletes oldest ones on next cache write |
| **What's cached** | Full HTTP response — body + headers + status code |

**Intended for:** Repeating the same system prompt or identical user messages hits cache instead of hitting Qwen's API again, avoiding 429s and saving tokens.

---

## Notes

- Free tier: 1,000 requests per day
- Tokens auto-refresh using refresh_token
- Tunnel URLs change on restart (cloudflare quick tunnels)
- Avoid `coder-model` for simple requests - it's slow and can timeout
- Use streaming (`"stream": true`) for long responses

---

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

### "Tunnel not working"
