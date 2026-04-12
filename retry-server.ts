#!/usr/bin/env bun
// Lightweight proxy that retries on 429 from upstream qwen-proxy

const UPSTREAM = "http://localhost:8080";
const PORT = 8081;
const MAX_RETRIES = 5;
const BASE_DELAY = 2; // Base delay in seconds (exponential: 2s, 4s, 8s, 16s, 32s)

async function retryRequest(url: string, options: RequestInit, retries = 0): Promise<Response> {
  const resp = await fetch(url, options);

  if (resp.status === 429 && retries < MAX_RETRIES) {
    const delay = BASE_DELAY * Math.pow(2, retries); // Exponential: 2, 4, 8, 16, 32
    console.error(`[retry] 429 hit, waiting ${delay}s (attempt ${retries + 1}/${MAX_RETRIES})`);
    await new Promise(r => setTimeout(r, delay * 1000));
    return retryRequest(url, options, retries + 1);
  }

  return resp;
}

Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    const upstreamUrl = UPSTREAM + url.pathname + (url.search || "");

    const headers: Record<string, string> = {};
    req.headers.forEach((v, k) => headers[k] = v);

    // Add keepalive for connection reuse
    headers["Connection"] = "keep-alive";

    return retryRequest(upstreamUrl, {
      method: req.method,
      headers,
      body: req.body,
      keepAlive: true,
    });
  },
});

console.log(`Retry proxy running on port ${PORT} -> ${UPSTREAM}`);
console.log(`Retry config: max=${MAX_RETRIES}, base_delay=${BASE_DELAY}s, exponential`);
