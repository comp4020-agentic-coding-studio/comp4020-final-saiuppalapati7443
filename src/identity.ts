import { randomUUID } from "node:crypto";

// ADR 0004: identity comes only from a server-set cookie, never from
// anything a client sends in a request body. This is the one place that
// cookie is read, validated, and (when absent or invalid) minted.

export const VISITOR_COOKIE = "cairn_visitor";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidVisitorId(id: string): boolean {
  return UUID_RE.test(id);
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

export interface ResolvedVisitor {
  visitorId: string;
  isNew: boolean;
}

// A cookie value that isn't a well-formed UUID (forged, truncated, tampered
// with — or simply absent) is never trusted or repaired: it's treated
// exactly like no cookie at all, and a fresh identity is minted instead.
// That guarantees a tampered cookie can only ever produce a *new* visitor,
// never one that collides with (or impersonates) a real one — there is no
// path from "the client sent this string" to "the server treats it as an
// existing identity" unless that string already is one of the UUIDs the
// server itself minted and set.
export function resolveVisitor(cookieHeader: string | undefined): ResolvedVisitor {
  const existing = parseCookies(cookieHeader)[VISITOR_COOKIE];
  if (existing && isValidVisitorId(existing)) {
    return { visitorId: existing, isNew: false };
  }
  return { visitorId: randomUUID(), isNew: true };
}

export function setCookieHeader(visitorId: string, secure: boolean): string {
  const attrs = [`${VISITOR_COOKIE}=${visitorId}`, "HttpOnly", "Path=/", "SameSite=Lax", "Max-Age=31536000"];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

// Fly's proxy terminates TLS and forwards plain HTTP to the app (fly.toml),
// so the only way to know the original request was HTTPS is the header the
// proxy sets. Locally (no proxy, no header) this is false, and the cookie is
// set without `Secure` so dev over plain http still works.
export function isSecureRequest(headers: Record<string, string | string[] | undefined>): boolean {
  return headers["x-forwarded-proto"] === "https";
}
