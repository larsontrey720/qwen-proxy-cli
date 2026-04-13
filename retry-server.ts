#!/usr/bin/env bun
// Lightweight proxy that retries on 429, 5xx errors, and connection failures
//
// IMPORTANT: This server binds to :8081 (hardcoded).
// We intentionally DO NOT read PORT from env to avoid collision with qwen-proxy.
// Zo service with local_port=8081 injects PORT=8081, but we want to stay explicit.

const UPSTREAM = "http://localhost:8080";
const PORT = 8081;  // Hardcoded - do not use process.env.PORT
const RETRY_DELAY = 2000; // 2s fixed delay
const MAX_RETRIES_429 = 15; // More patience for rate limits
const MAX_RETRIES_5XX = 5; // Less patience for server errors
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 100;

// Status codes that trigger retry
const RETRY_STATUSES = [429, 502, 503, 504];

// Response cache: Map<hash, {response: CachedResponse, timestamp: number}>
const responseCache = new Map<string, { response: CachedResponse; timestamp: number }>();

interface CachedResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

// Simple hash function for request body
async function hashBody(body: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(body);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

// Clean expired entries and enforce size limit
function cleanCache() {
  const now = Date.now();
  
  // Remove expired entries
  for (const [key, entry] of responseCache) {
    if (now - entry.timestamp > CACHE_TTL) {
      responseCache.delete(key);
    }
  }
  
  // Enforce size limit (delete oldest)
  if (responseCache.size > MAX_CACHE_SIZE) {
    const entries = [...responseCache.entries()];
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toDelete = entries.slice(0, responseCache.size - MAX_CACHE_SIZE);
    for (const [key] of toDelete) {
      responseCache.delete(key);
    }
  }
}

// Check cache for a given hash
function checkCache(hash: string): CachedResponse | null {
  const entry = responseCache.get(hash);
  if (!entry) return null;
  
  // Check TTL
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    responseCache.delete(hash);
    return null;
  }
  
  return entry.response;
}

// Store response in cache
function cacheResponse(hash: string, response: CachedResponse) {
  cleanCache(); // Clean before adding
  responseCache.set(hash, {
    response,
    timestamp: Date.now(),
  });
}

async function retryRequest(
  url: string,
  options: RequestInit,
  retries: number,
  is429: boolean
): Promise<Response> {
  const maxRetries = is429 ? MAX_RETRIES_429 : MAX_RETRIES_5XX;
  
  try {
    const resp = await fetch(url, options);

    // Retry on specific status codes
    if (RETRY_STATUSES.includes(resp.status) && retries < maxRetries) {
      const isRateLimit = resp.status === 429;
      console.error(
        `[retry] ${resp.status} hit, waiting ${RETRY_DELAY}ms (attempt ${retries + 1}/${maxRetries})`
      );
      await new Promise((r) => setTimeout(r, RETRY_DELAY));
      return retryRequest(url, options, retries + 1, isRateLimit);
    }

    return resp;
  } catch (err: any) {
    // Retry on connection errors
    if (retries < MAX_RETRIES_5XX) {
      console.error(
        `[retry] Connection failed: ${err.message || err}, waiting ${RETRY_DELAY}ms (attempt ${retries + 1}/${MAX_RETRIES_5XX})`
      );
      await new Promise((r) => setTimeout(r, RETRY_DELAY));
      return retryRequest(url, options, retries + 1, false);
    }
    throw err;
  }
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const upstreamUrl = UPSTREAM + url.pathname + (url.search || "");

    // Read request body for hashing
    const body = req.body ? await req.text() : "";
    const cacheKey = await hashBody(body);

    // Check cache for GET or POST with body
    if (req.method === "POST" && body) {
      const cached = checkCache(cacheKey);
      if (cached) {
        console.log(`[cache] HIT for ${cacheKey.slice(0, 8)}...`);
        return new Response(cached.body, {
          status: cached.status,
          headers: cached.headers,
        });
      }
      console.log(`[cache] MISS for ${cacheKey.slice(0, 8)}...`);
    }

    const headers: Record<string, string> = {};
    req.headers.forEach((v, k) => headers[k] = v);
    headers["Connection"] = "keep-alive";

    const resp = await retryRequest(
      upstreamUrl,
      {
        method: req.method,
        headers,
        body: body || null,
      },
      0,
      false
    );

    // Cache successful responses
    if (resp.status === 200 && req.method === "POST" && body) {
      const respBody = await resp.text();
      const cachedHeaders: Record<string, string> = {};
      resp.headers.forEach((v, k) => cachedHeaders[k] = v);
      
      cacheResponse(cacheKey, {
        status: resp.status,
        headers: cachedHeaders,
        body: respBody,
      });
      console.log(`[cache] Stored ${cacheKey.slice(0, 8)}...`);
      
      return new Response(respBody, {
        status: resp.status,
        headers: cachedHeaders,
      });
    }

    return resp;
  },
});

console.log(`Retry proxy running on port ${PORT} -> ${UPSTREAM}`);
console.log(`Retries: 429 → ${MAX_RETRIES_429}x, 5xx/connection → ${MAX_RETRIES_5XX}x (${RETRY_DELAY}ms delay)`);
console.log(`Cache: ${MAX_CACHE_SIZE} entries max, ${CACHE_TTL / 1000}s TTL`);
