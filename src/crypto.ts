/**
 * Authenticated encryption for stateless tokens.
 *
 * This server persists nothing. Every piece of state that would normally live in
 * a database — the pending authorization, the OAuth code, the access/refresh
 * tokens, the registered client — is instead sealed into an opaque string that is
 * handed to the client. The client carries the state; we only hold the key.
 *
 * Each sealed value is bound to a `purpose` and carries its own expiry, so a token
 * of one kind can never be replayed as another kind or used past its lifetime.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomBase64Url(byteLength = 32): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

async function importKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

interface Envelope<T> {
  p: string;
  exp: number | null;
  d: T;
}

/**
 * Seal a payload. `ttlSeconds === null` means it does not expire on its own
 * (used for client registrations, which are invalidated by rotating the key).
 */
export async function seal<T>(
  secret: string,
  purpose: string,
  data: T,
  ttlSeconds: number | null,
): Promise<string> {
  const envelope: Envelope<T> = {
    p: purpose,
    exp: ttlSeconds === null ? null : Math.floor(Date.now() / 1000) + ttlSeconds,
    d: data,
  };
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importKey(secret);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(JSON.stringify(envelope)),
  );
  const joined = new Uint8Array(iv.length + ciphertext.byteLength);
  joined.set(iv, 0);
  joined.set(new Uint8Array(ciphertext), iv.length);
  return bytesToBase64Url(joined);
}

/** Open a sealed value, verifying integrity, purpose and expiry. Null if invalid. */
export async function unseal<T>(
  secret: string,
  purpose: string,
  token: string,
): Promise<T | null> {
  try {
    const raw = base64UrlToBytes(token);
    if (raw.length <= 12) return null;
    const key = await importKey(secret);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: raw.subarray(0, 12) },
      key,
      raw.subarray(12),
    );
    const envelope = JSON.parse(decoder.decode(plaintext)) as Envelope<T>;
    if (envelope.p !== purpose) return null;
    if (envelope.exp !== null && envelope.exp < Math.floor(Date.now() / 1000)) return null;
    return envelope.d;
  } catch {
    return null;
  }
}
