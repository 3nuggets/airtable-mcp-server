export const AIRTABLE_API = "https://api.airtable.com";
export const AIRTABLE_CONTENT = "https://content.airtable.com";

export class AirtableError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    const msg =
      body && typeof body === "object" && "error" in (body as any)
        ? JSON.stringify((body as any).error)
        : typeof body === "string"
          ? body
          : JSON.stringify(body);
    super(`Airtable API error ${status}: ${msg}`);
    this.status = status;
    this.body = body;
  }
}

/** Query value: string/number/boolean set directly; string[] serialized as key[]=v. */
export type QueryValue = string | number | boolean | string[] | undefined;
export type Query = Record<string, QueryValue>;

function applyQuery(url: URL, query: Query): void {
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) url.searchParams.append(`${key}[]`, v);
    } else {
      url.searchParams.set(key, String(value));
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  host?: string;
}

/**
 * Thin Airtable Web API client. `getToken` is called per request so token refresh
 * (with rotation) is transparent to callers.
 */
export class AirtableClient {
  constructor(private getToken: () => Promise<string>) {}

  async request<T = any>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    const host = opts.host ?? AIRTABLE_API;
    const url = new URL(host + path);
    if (opts.query) applyQuery(url, opts.query);

    const token = await this.getToken();
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    let body: string | undefined;
    if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.body);
    }

    // Airtable allows 5 req/sec per base; on 429 back off and retry a few times.
    let attempt = 0;
    const maxAttempts = 5;
    while (true) {
      const res = await fetch(url.href, { method, headers, body });
      if (res.status === 429 && attempt < maxAttempts) {
        attempt++;
        await sleep(Math.min(8000, 500 * 2 ** attempt));
        continue;
      }
      const text = await res.text();
      const data = text ? safeJson(text) : null;
      if (!res.ok) throw new AirtableError(res.status, data ?? text);
      return data as T;
    }
  }

  get<T = any>(path: string, query?: Query) {
    return this.request<T>("GET", path, { query });
  }
  post<T = any>(path: string, body?: unknown, opts: RequestOptions = {}) {
    return this.request<T>("POST", path, { ...opts, body });
  }
  patch<T = any>(path: string, body?: unknown, opts: RequestOptions = {}) {
    return this.request<T>("PATCH", path, { ...opts, body });
  }
  put<T = any>(path: string, body?: unknown, opts: RequestOptions = {}) {
    return this.request<T>("PUT", path, { ...opts, body });
  }
  delete<T = any>(path: string, query?: Query) {
    return this.request<T>("DELETE", path, { query });
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** URL-encode an Airtable table/field name (or pass an id straight through). */
export function encodePathSegment(idOrName: string): string {
  return encodeURIComponent(idOrName);
}
