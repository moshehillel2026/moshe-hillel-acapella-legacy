const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; style-src 'self' 'unsafe-inline'"
};
const accessKeyCache = new Map();

function decodeBase64Url(value) {
  return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), byte => byte.charCodeAt(0));
}

function decodeJson(value) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
}

async function accessKeys(issuer) {
  const cached = accessKeyCache.get(issuer);
  if (cached && cached.expires > Date.now()) return cached.keys;
  const response = await fetch(`${issuer}/cdn-cgi/access/certs`);
  if (!response.ok) throw new Error("Access signing keys unavailable");
  const { keys } = await response.json();
  accessKeyCache.set(issuer, { keys, expires: Date.now() + 300_000 });
  return keys;
}

async function authenticated(request, env) {
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return false;
  try {
    const [first, second, signature, extra] = token.split(".");
    if (!first || !second || !signature || extra !== undefined) return false;
    const header = decodeJson(first);
    const claims = decodeJson(second);
    const now = Date.now() / 1_000;
    if (header.alg !== "RS256" || !header.kid || claims.iss !== env.ACCESS_ISSUER
      || !Array.isArray(claims.aud) || !claims.aud.includes(env.ACCESS_AUD)
      || typeof claims.exp !== "number" || claims.exp <= now
      || (typeof claims.nbf === "number" && claims.nbf > now)) return false;
    const jwk = (await accessKeys(env.ACCESS_ISSUER)).find(key => key.kid === header.kid);
    if (!jwk) {
      accessKeyCache.delete(env.ACCESS_ISSUER);
      return false;
    }
    const key = await crypto.subtle.importKey(
      "jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]
    );
    return await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5", key, decodeBase64Url(signature), new TextEncoder().encode(`${first}.${second}`)
    );
  } catch {
    return false;
  }
}

function parseRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value);
  if (!match || (!match[1] && !match[2]) || !size) return null;
  const offset = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (!Number.isSafeInteger(offset) || offset >= size || end < offset) return null;
  return { offset, length: end - offset + 1 };
}

function empty(status, headers = {}) {
  return new Response(null, { status, headers: { ...privateHeaders, ...headers } });
}

async function recording(request, bucket, key) {
  const rangeRequest = request.headers.get("Range");
  const head = request.method === "HEAD";
  const headers = { ...privateHeaders, "Accept-Ranges": "bytes", "Content-Type": "audio/mpeg" };
  if (!rangeRequest && !head) {
    const object = await bucket.get(key);
    if (!object) return empty(404);
    headers["Content-Length"] = String(object.size);
    headers.ETag = object.httpEtag;
    return new Response(object.body, { headers });
  }
  const info = await bucket.head(key);
  if (!info) return empty(404);
  headers.ETag = info.httpEtag;
  const ifRange = request.headers.get("If-Range");
  const useRange = !head && rangeRequest && (!ifRange || ifRange === info.httpEtag);
  if (useRange) {
    const range = parseRange(rangeRequest, info.size);
    if (!range) return empty(416, { "Content-Range": `bytes */${info.size}` });
    const object = await bucket.get(key, { range, onlyIf: { etagMatches: info.etag } });
    if (!object) return empty(404);
    if (!("body" in object)) return empty(503, { "Retry-After": "1" });
    headers["Content-Length"] = String(range.length);
    headers["Content-Range"] = `bytes ${range.offset}-${range.offset + range.length - 1}/${info.size}`;
    return new Response(object.body, { status: 206, headers });
  }
  if (head) {
    headers["Content-Length"] = String(info.size);
    return new Response(null, { headers });
  }
  const object = await bucket.get(key);
  if (!object) return empty(404);
  headers["Content-Length"] = String(object.size);
  headers.ETag = object.httpEtag;
  return new Response(object.body, { headers });
}

export default {
  async fetch(request, env) {
    if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_ISSUER || "") || !env.ACCESS_AUD) {
      return empty(503);
    }
    if (!await authenticated(request, env)) return empty(403);
    if (request.method !== "GET" && request.method !== "HEAD") return empty(405, { Allow: "GET, HEAD" });
    const path = new URL(request.url).pathname;
    if (path.startsWith("/media/")) {
      if (!/^\/media\/[a-z0-9][a-z0-9-]*\.mp3$/.test(path)) return empty(404);
      return recording(request, env.RECORDINGS, path.slice(1));
    }
    const asset = await env.ASSETS.fetch(request);
    const headers = new Headers(asset.headers);
    for (const [name, value] of Object.entries(privateHeaders)) headers.set(name, value);
    return new Response(asset.body, { status: asset.status, headers });
  }
};
