import { AwsClient } from "aws4fetch";
import type { Env } from "./types";

/**
 * Staging store for attachment bytes on Cloudflare R2 using presigned S3 URLs, so
 * both the upload client and Airtable talk to R2 directly (bytes never pass through
 * the Worker's ~100 MB request-body limit). Supports files up to Airtable's 5 GB max.
 *
 *   presignPut  -> client streams file bytes straight into R2 (up to 5 GB)
 *   presignGet  -> Airtable fetches the staged file for ingestion, then we delete it
 *
 * Direct object ops (put/head/delete) go through the R2 binding and need no creds.
 */

const KEY_PREFIX = "staged/";
/** Must match the bucket_name in wrangler.jsonc. */
const BUCKET = "airtable-mcp-files";
/** Presigned URL lifetime — long enough for Airtable's async ingestion. */
const DEFAULT_TTL = 2 * 60 * 60;

/** Generate a unique, safe R2 key for a filename. */
export function makeKey(filename: string): string {
  const safe = (filename || "file").replace(/[^A-Za-z0-9._-]/g, "_").slice(-120);
  return `${KEY_PREFIX}${crypto.randomUUID()}_${safe}`;
}

function r2Client(env: Env): AwsClient {
  return new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: "s3",
    region: "auto",
  });
}

function objectUrl(env: Env, key: string): string {
  return `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET}/${key}`;
}

async function presign(env: Env, key: string, method: "GET" | "PUT", ttl: number): Promise<string> {
  const url = new URL(objectUrl(env, key));
  url.searchParams.set("X-Amz-Expires", String(ttl));
  const signed = await r2Client(env).sign(new Request(url, { method }), { aws: { signQuery: true } });
  return signed.url;
}

/** Presigned URL Airtable will GET to ingest the staged file. */
export function presignGet(env: Env, key: string, ttl = DEFAULT_TTL): Promise<string> {
  return presign(env, key, "GET", ttl);
}

/** Presigned URL a client PUTs raw bytes to (direct to R2, up to 5 GB). */
export function presignPut(env: Env, key: string, ttl = DEFAULT_TTL): Promise<string> {
  return presign(env, key, "PUT", ttl);
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

export function headObject(env: Env, key: string): Promise<R2Object | null> {
  return env.ATTACHMENTS_BUCKET.head(key);
}

export async function deleteObject(env: Env, key: string): Promise<void> {
  await env.ATTACHMENTS_BUCKET.delete(key);
}
