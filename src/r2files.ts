import type { Env } from "./types";

/**
 * Staging store for attachment bytes on Cloudflare R2, plus HMAC-signed, short-lived
 * URLs so Airtable (and the upload client) can GET/PUT an object without any R2
 * credentials. Everything runs off the R2 *binding* — no S3 API tokens required.
 *
 *   PUT  /upload/:key?exp=&sig=   -> client streams file bytes into R2
 *   GET  /files/:key?exp=&sig=    -> Airtable fetches the staged file, then we delete it
 */

const KEY_PREFIX = "staged/";

function base64url(bytes: ArrayBuffer): string {
  const b = new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return base64url(sig);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/** Generate a unique, filesystem-safe, single-segment R2 key for a filename. */
export function makeKey(filename: string): string {
  const safe = (filename || "file").replace(/[^A-Za-z0-9._-]/g, "_").slice(-120);
  return `${KEY_PREFIX}${crypto.randomUUID()}_${safe}`;
}

/** Build a signed URL for `GET /files/:key` or `PUT /upload/:key`. */
export async function mintSignedUrl(
  env: Env,
  origin: string,
  key: string,
  method: "GET" | "PUT",
  ttlSeconds: number,
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = await hmac(env.FILE_SIGNING_SECRET, `${method}:${key}:${exp}`);
  const route = method === "PUT" ? "upload" : "files";
  const u = new URL(`${origin}/${route}/${encodeURIComponent(key)}`);
  u.searchParams.set("exp", String(exp));
  u.searchParams.set("sig", sig);
  return u.href;
}

/** Verify a signed request for a given key/method. */
export async function verifySignedUrl(
  env: Env,
  key: string,
  method: "GET" | "PUT",
  exp: string | null,
  sig: string | null,
): Promise<boolean> {
  if (!exp || !sig) return false;
  if (Number(exp) < Math.floor(Date.now() / 1000)) return false;
  const expected = await hmac(env.FILE_SIGNING_SECRET, `${method}:${key}:${exp}`);
  return timingSafeEqual(expected, sig);
}

export async function putObject(
  env: Env,
  key: string,
  body: ArrayBuffer | ArrayBufferView | ReadableStream,
  contentType?: string,
): Promise<void> {
  await env.ATTACHMENTS_BUCKET.put(key, body, {
    httpMetadata: contentType ? { contentType } : undefined,
  });
}

export function getObject(env: Env, key: string): Promise<R2ObjectBody | null> {
  return env.ATTACHMENTS_BUCKET.get(key);
}

export async function deleteObject(env: Env, key: string): Promise<void> {
  await env.ATTACHMENTS_BUCKET.delete(key);
}
