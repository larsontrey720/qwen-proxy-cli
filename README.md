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

## Alternatives

- [qwen-proxy](https://www.npmjs.com/package/qwen-proxy) - The underlying proxy package (installed automatically)
- [qwen-code-oai-proxy](https://github.com/aptdnfapt/qwen-code-oai-proxy) - Similar concept, different implementation

## License

MIT

## Contributing

Issues and PRs welcome at [GitHub](https://github.com/larsontrey720/qwen-proxy-cli).
