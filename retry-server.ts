#!/usr/bin/env bun
/**
 * Retry Server - Sits in front of qwen-proxy and retries 429s with exponential backoff
 * 
 * Flow: cloudflared → :8081 (retry server) → :8080 (qwen-proxy) → Qwen API
 * 
 * Usage: bun retry-server.ts [port] [upstream-port]
 * Default: bun retry-server.ts 8081 8080
 */

const RETRY_PORT = parseInt(process.argv[2]) || 8081;
const UPSTREAM_PORT = parseInt(process.argv[3]) || 8080;
const UPSTREAM_URL = `http://localhost:${UPSTREAM_PORT}`;

const MAX_RETRIES = 5;
const BASE_DELAY = 2; // seconds

const COLORS = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
  reset: "\x1b[0m",
};

function log(color: keyof typeof COLORS, msg: string) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`${COLORS.dim}[${timestamp}]${COLORS.reset} ${COLORS[color]}${msg}${COLORS.reset}`);
}

async function forwardRequest(req: Request, retries = 0): Promise<Response> {
  const url = new URL(req.url);
  const upstreamUrl = `${UPSTREAM_URL}${url.pathname}${url.search}`;
  
  const options: RequestInit = {
    method: req.method,
    headers: req.headers,
    body: req.body,
    redirect: 'manual',
  };

  try {
    const resp = await fetch(upstreamUrl, options);
    
    // Retry on 429 (rate limit)
    if (resp.status === 429 && retries < MAX_RETRIES) {
      const delay = BASE_DELAY * Math.pow(2, retries);
      log("yellow", `429 received, retry ${retries + 1}/${MAX_RETRIES} in ${delay}s`);
      
      // Clone the request since body can only be used once
      const clonedReq = req.clone();
      
      // Wait with exponential backoff
      await new Promise(r => setTimeout(r, delay * 1000));
      
      return forwardRequest(clonedReq, retries + 1);
    }
    
    // Log successful requests
    if (resp.status < 400) {
      log("green", `${req.method} ${url.pathname} → ${resp.status}`);
    } else if (resp.status === 429) {
      log("red", `429 after ${MAX_RETRIES} retries → ${url.pathname}`);
    } else {
      log("yellow", `${resp.status} → ${url.pathname}`);
    }
    
    return resp;
  } catch (err) {
    if (retries < MAX_RETRIES) {
      const delay = BASE_DELAY * Math.pow(2, retries);
      log("yellow", `Connection failed, retry ${retries + 1}/${MAX_RETRIES} in ${delay}s`);
      await new Promise(r => setTimeout(r, delay * 1000));
      return forwardRequest(req, retries + 1);
    }
    
    log("red", `Request failed after ${MAX_RETRIES} retries: ${err}`);
    return new Response(JSON.stringify({ error: "Upstream unavailable after retries" }), {
      status: 503,
      headers: { "Content-Type": "application/json" }
    });
  }
}

// Start server
const server = Bun.serve({
  port: RETRY_PORT,
  async fetch(req) {
    return forwardRequest(req);
  },
});

log("cyan", `Retry server running on :${RETRY_PORT}`);
log("cyan", `Forwarding to upstream :${UPSTREAM_PORT}`);
log("cyan", `Max retries: ${MAX_RETRIES}, Base delay: ${BASE_DELAY}s`);
