# Qwen Proxy CLI

Turn your Qwen Code free tier (1,000 requests/day) into a fully OpenAI-compatible API server that works with any OpenAI SDK or tool.

## What This Does

Qwen Code gives you 1,000 free API requests per day to Qwen's powerful coding models. This CLI tool:

- Extracts your OAuth credentials from Qwen Code
- Runs a local OpenAI-compatible proxy server
- Optionally creates a public tunnel for remote access
- Manages authentication and token refresh automatically

## Requirements

- [Bun](https://bun.sh) runtime
- [Qwen Code](https://github.com/QwenLM/Qwen-Code) installed and authenticated
- `cloudflared` (optional, for public tunnel)

## Quick Start

```bash
# Clone the repo
git clone https://github.com/larsontrey720/qwen-proxy-cli.git
cd qwen-proxy-cli

# Setup (first time - extracts credentials from qwen-code)
bun proxy.ts setup

# Start the proxy server
bun proxy.ts start

# Test it works
bun proxy.ts test
```

The proxy is now running at `http://localhost:8080/v1`

## Usage Examples

### With curl

```bash
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer any" \
  -d '{
    "model": "qwen3-coder-flash",
    "messages": [{"role": "user", "content": "Write a Python hello world"}]
  }'
```

### With Python OpenAI SDK

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8080/v1",
    api_key="any"  # The proxy doesn't validate API keys
)

response = client.chat.completions.create(
    model="qwen3-coder-flash",
    messages=[{"role": "user", "content": "Explain async/await in JavaScript"}]
)
print(response.choices[0].message.content)
```

### With Node.js

```javascript
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'http://localhost:8080/v1',
  apiKey: 'any',
});

const completion = await client.chat.completions.create({
  model: 'qwen3-coder-flash',
  messages: [{ role: 'user', content: 'Write a React component' }],
});

console.log(completion.choices[0].message.content);
```

### Streaming Responses

```python
stream = client.chat.completions.create(
    model="qwen3-coder-flash",
    messages=[{"role": "user", "content": "Write a long essay about AI"}],
    stream=True
)

for chunk in stream:
    print(chunk.choices[0].delta.content, end="", flush=True)
```

## Commands

| Command | Description |
|---------|-------------|
| `setup` | Install dependencies and extract credentials from qwen-code |
| `start` | Start the proxy server on localhost:8080 |
| `stop` | Stop the proxy server |
| `restart` | Restart the proxy server |
| `status` | Check if proxy is running and show account status |
| `test` | Send a test request to verify the proxy works |
| `models` | List all available models |
| `usage` | Show how many requests you've used today |
| `tunnel` | Create a public Cloudflare tunnel (for remote access) |
| `enable` | Enable auto-startup with persistent tunnel (requires Zo service) |
| `disable` | Disable auto-startup service |

## Available Models

| Model | Description | Speed | Quality |
|-------|-------------|-------|---------|
| `qwen3-coder-flash` | Fast coding model | ⚡⚡⚡ | Good |
| `qwen3-coder-plus` | Better coding model | ⚡⚡ | Better |
| `qwen3.5-plus` | General purpose | ⚡⚡ | Good |
| `qwen3.6-plus` | Latest general model | ⚡⚡ | Better |
| `coder-model` | Full agentic coding | ⚡ | Best (can timeout) |
| `vision-model` | Multimodal (images) | ⚡⚡ | Good |

**Recommendation:** Use `qwen3-coder-flash` for most tasks. It's fast and reliable. Use `qwen3.6-plus` for general reasoning tasks.

## Public Access (Tunnel)

If you need to access the API from another machine (like a cloud service or CI/CD):

```bash
bun proxy.ts tunnel
```

This creates a public URL like `https://xyz-abc.trycloudflare.com`. You can then use this URL as the base URL in any OpenAI-compatible client.

**Note:** Cloudflare quick tunnel URLs are temporary and change each time you restart the tunnel.

## Persistent Cloudflare Tunnel (Recommended)

Quick tunnels randomly disconnect, even during active use. For a reliable, permanent URL, set up a persistent Cloudflare tunnel.

### Requirements

1. **Cloudflare account** (free tier works) - [Sign up here](https://dash.cloudflare.com/sign-up)
2. **A domain on Cloudflare** - Either:
   - Buy a domain through Cloudflare (~$10/year)
   - Or delegate your existing domain's nameservers to Cloudflare

### Setup Steps

```bash
# 1. Login to Cloudflare (opens browser for authorization)
cloudflared tunnel login

# 2. Create a named tunnel
cloudflared tunnel create qwen-proxy
# Output: Tunnel credentials written to /root/.cloudflared/<id>.json
# Output: Created tunnel qwen-proxy with id <uuid>

# 3. Route to a subdomain (replace YOURDOMAIN.COM with your domain)
cloudflared tunnel route dns qwen-proxy qwen.YOURDOMAIN.COM
# Output: Added CNAME qwen.YOURDOMAIN.COM which will route to this tunnel

# 4. Run the tunnel (in foreground for testing)
cloudflared tunnel run --url http://localhost:8080 qwen-proxy

# 5. For background/production use:
nohup cloudflared tunnel run --url http://localhost:8080 qwen-proxy > /dev/shm/cloudflared-persistent.log 2>&1 &
```

### Verify It Works

```bash
curl https://qwen.YOURDOMAIN.COM/health
```

You should see a JSON response with `"status": "ok"`.

### Benefits Over Quick Tunnels

| Feature | Quick Tunnel | Persistent Tunnel |
|---------|-------------|-------------------|
| URL stability | Random, changes | Permanent (`qwen.yourdomain.com`) |
| Reliability | Can disconnect anytime | Stable 24/7 |
| Idle timeout | ~4 hours | None |
| Use case | Testing | Production |

### Managing Your Tunnel

```bash
# List all tunnels
cloudflared tunnel list

# View tunnel info
cloudflared tunnel info qwen-proxy

# Delete tunnel (if needed)
cloudflared tunnel delete qwen-proxy

# View logs
cat /dev/shm/cloudflared-persistent.log
```

### Example Config for Zo BYOK

After setting up your persistent tunnel:

1. Go to your AI provider settings
2. Add custom provider:
   - **Name**: Qwen Proxy
   - **Base URL**: `https://qwen.YOURDOMAIN.COM/v1`
   - **API Key**: `any` (not validated)
3. Create a model mapping for `qwen3.6-plus`

## Auto-Startup (Recommended for 24/7)

For permanent availability, enable auto-startup. This creates a Zo service that starts on boot and runs both cloudflared tunnel + qwen-proxy together.

### Requirements

- Persistent Cloudflare tunnel (set up first, see above)
- Zo service slot (Free plan = 1 service)

### Enable

```bash
bun proxy.ts enable
```

This creates the startup script at `/usr/local/bin/qwen-proxy-startup.sh`:

```bash
#!/bin/bash
# Start cloudflared tunnel in background
cloudflared --config /root/.cloudflared/config.yml tunnel run &
CLOUDFLARED_PID=$!

# Wait briefly for tunnel to establish
sleep 3

# Start qwen-proxy (replaces this process)
exec qwen-proxy serve --headless
```

### Register as Zo Service

After running `enable`, register via UI or CLI:

**Via UI:**
1. Go to Hosting > Services
2. Click "Add Service"
3. Set entrypoint to: `/usr/local/bin/qwen-proxy-startup.sh`
4. Set protocol to: `http`
5. Set port to: `8080`

**Via CLI:**
```bash
zo service create qwen-proxy \
  --entrypoint /usr/local/bin/qwen-proxy-startup.sh \
  --protocol http \
  --port 8080
```

### Disable

```bash
bun proxy.ts disable
```

Removes the service and startup script.

### How Auto-Startup Works

The startup script uses a clever process replacement pattern:

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
│     ├─ cloudflared tunnel run &                                    │
│     └─ PID stored in $CLOUDFLARED_PID                              │
│                                                                     │
│  2. Wait 3 seconds for tunnel to establish                         │
│     └─ sleep 3                                                      │
│                                                                     │
│  3. Replace shell with qwen-proxy                                  │
│     └─ exec qwen-proxy serve --headless                            │
│                                                                     │
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
        │  Cloudflare       │
        │  Edge Network     │
        │                   │
        │  qwen.domain.com  │
        └───────────────────┘
```

**Why `exec`?**

The `exec` command replaces the current shell process with qwen-proxy. This means:

- The service manager sees qwen-proxy as the main process
- If qwen-proxy crashes, the service manager detects it and restarts
- Signals (SIGTERM, SIGINT) go directly to qwen-proxy for graceful shutdown
- No orphaned shell processes

**Process tree after startup:**

```
systemd/service-manager
└── qwen-proxy serve --headless (PID: main)
    └── cloudflared tunnel run (PID: child, background)
```

**On shutdown:**

1. Service manager sends SIGTERM to qwen-proxy (main process)
2. qwen-proxy handles graceful shutdown
3. cloudflared continues running briefly, then exits when connection closes
4. Service manager considers service stopped

**On crash:**

1. qwen-proxy crashes
2. Service manager detects main process died
3. Service manager restarts the entrypoint script
4. Script starts fresh cloudflared + qwen-proxy

## Architecture

```
Internet → Cloudflare Tunnel → localhost:8081 (retry-server) → localhost:8080 (qwen-proxy) → Qwen API

                ↓                    ↓                          ↓
         qwen.YOURDOMAIN.xyz     Port 8081              Port 8080
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
curl https://qwen.YOURDOMAIN.xyz/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen3-coder-flash","messages":[{"role":"user","content":"Hi"}]}'

# Check usage
qwen-proxy usage
```

## Rate Limits

- **Free tier**: 1,000 requests per day
- Check your usage: `bun proxy.ts usage`

## Troubleshooting

### "Model stream was interrupted before completion"

This usually means:
1. You're using `coder-model` (it's slow and can timeout)
2. Qwen's API had a temporary issue (retry the request)
3. The response was very long (use streaming: `"stream": true`)

**Fix:** Use `qwen3-coder-flash` instead of `coder-model`, or enable streaming.

### "Connection refused" / "Failed to connect to localhost:8080"

The proxy isn't running. Start it:
```bash
bun proxy.ts start
```

### "No qwen-code credentials found"

You need to authenticate with Qwen Code first:
```bash
qwen-code
# Follow the authentication flow
```

Then run `bun proxy.ts setup` again.

### "Invalid/Expired token"

Run setup again to refresh:
```bash
bun proxy.ts setup
bun proxy.ts restart
```

### Tunnel URL not working

Cloudflare quick tunnels can be unreliable. Restart the tunnel:
```bash
bun proxy.ts stop
bun proxy.ts start
bun proxy.ts tunnel
```

## Prerequisites Installation

### Install Bun
```bash
curl -fsSL https://bun.sh/install | bash
```

### Install Qwen Code
```bash
npm install -g @qwen-code/qwen-code

# Authenticate
qwen-code
```

### Install cloudflared (optional, for tunnel)
```bash
# Linux
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

# macOS
brew install cloudflared
```

## License

MIT

## Contributing

Issues and PRs welcome at [GitHub](https://github.com/larsontrey720/qwen-proxy-cli).
