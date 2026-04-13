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

After running `enable`, register via UI or CLI:

**Via UI:**
1. Go to Hosting > Services
2. Click "Add Service"
3. Set entrypoint to: `/usr/local/bin/qwen-proxy-startup.sh`
4. Set protocol to: `http`
5. Set port to: `8081`

**Via CLI:**
```bash
zo service create qwen-proxy \
  --entrypoint /usr/local/bin/qwen-proxy-startup.sh \
  --protocol http \
  --port 8081
```

**Port collision prevention:**

When you register a Zo service with `local_port=8081`, the service manager injects `PORT=8081` into the environment. This could cause qwen-proxy to bind to 8081 instead of 8080, colliding with the retry server.

The startup script prevents this by explicitly setting:
```bash
PORT=8080 qwen-proxy serve --headless
```

This overrides any injected `PORT` value, ensuring qwen-proxy always binds to 8080.

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
Internet → Cloudflare Tunnel → localhost:8081 (retry-server) → localhost:8080 (qwen-proxy) → Qwen API

                ↓                    ↓                          ↓
         qwen.streamleapstudio.xyz  Port 8081              Port 8080
         (permanent domain)    (retry + cache)         (qwen-proxy OAuth)
```

### Files Created

**`/root/.cloudflared/config.yml`** — Cloudflared tunnel config
- `protocol: http2` — uses TCP/HTTP2 instead of QUIC (prevents gVisor crashes)
- `no-autocreate: true` — prevents accidental tunnel creation
- Routes `qwen.YOURDOMAIN.xyz` → `localhost:8081`

**`/usr/local/bin/qwen-proxy-startup.sh`** — Startup wrapper script
- Starts cloudflared, retry-server, and qwen-proxy in correct order with delays
- Monitors all three processes every 15 seconds
- If any process dies → immediately restarts it and logs to `/dev/shm/`
- This is what runs as the Zo service (mode: process)

**`/usr/local/bin/qwen-proxy-retry-server.ts`** — Bun/TypeScript retry proxy
- Listens on port 8081, forwards to port 8080 (qwen-proxy)
- Retries on 429/502/503/504/530 with 60 retries × 2s delay = 2 minute max wait
- Caches POST `/v1/chat/completions` responses for 5 minutes
- Logs all operations to `/dev/shm/retry-server.log`
- Debug endpoint on port 8082: `GET /` returns cache stats

### Key Design Decisions

| Decision | Why |
|----------|-----|
| HTTP/2 instead of QUIC | QUIC needs raw UDP sockets which crash in gVisor container |
| All services in one wrapper | Only 1 process-mode service slot available |
| 15s health check interval | Balance between quick recovery and not hammering the system |
| File-based caching | In-memory Map lost on restart; file cache persists across restarts |
| `PORT=8080` for qwen-proxy | Explicit port override since qwen-proxy defaults to env PORT |

### Debugging

```bash
# Check all processes
pgrep -fa 'cloudflared|qwen-proxy|qwen-proxy-retry'

# Check logs
cat /dev/shm/cloudflared.log | tail
cat /dev/shm/retry-server.log | tail
cat /dev/shm/qwen-proxy.log | tail

# Check cache stats
curl http://localhost:8082/

# Clear cache
curl http://localhost:8082/clear

# Test the tunnel
curl https://qwen.YOURDOMAIN.xyz/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{"model":"qwen3-coder-flash","messages":[{"role":"user","content":"Hi"}]}'

# Check usage
qwen-proxy usage
```

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
