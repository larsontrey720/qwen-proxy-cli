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

## Architecture

```
┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐
│  Your Client    │  HTTP  │  Qwen Proxy     │  OAuth │   Qwen API      │
│  (OpenAI SDK)   │───────>│  (localhost)    │───────>│  (portal.qwen)  │
└─────────────────┘        └─────────────────┘        └─────────────────┘
                                    │
                                    │ optional
                                    v
                           ┌─────────────────┐
                           │ Cloudflare      │
                           │ Tunnel (public) │
                           └─────────────────┘
```

The proxy:
1. Accepts OpenAI-format requests on localhost:8080
2. Converts them to Qwen's API format
3. Authenticates using your Qwen Code OAuth token
4. Returns OpenAI-format responses

## How It Works

1. **Credential Extraction**: Qwen Code stores OAuth tokens in `~/.qwen/oauth_creds.json.bak`. This CLI copies them to the format expected by `qwen-proxy`.

2. **Token Refresh**: Access tokens expire after a few hours. The proxy automatically refreshes them using the refresh token.

3. **OpenAI Compatibility**: The `qwen-proxy` npm package translates between OpenAI's API format and Qwen's internal API.

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
