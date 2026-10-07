import { randomUUID } from "node:crypto";

const SEAL_COOKIE = "seal";
const TEN_YEARS_SECONDS = 60 * 60 * 24 * 365 * 10;

// The seal token is a server-side identity: it keys a player's seat in a room
// (so a dropped socket can reclaim it, or a new one take it over) and is never
// sent on the wire. Every token this server issues is a randomUUID(), so a
// cookie that decodes fine but isn't one is rejected on shape too: otherwise a
// crafted Cookie header could become an arbitrary seat key.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A client can send any bytes it likes as a Cookie header, including a
// percent-encoding decodeURIComponent rejects outright (a bare "%", say).
// That's someone else's malformed cookie, not a reason to fail the request:
// treat it the same as no cookie at all, rather than let it throw synchronously
// inside the request handler and take the whole single-machine process down.
export function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

// Every visitor is identified by one anonymous, unguessable token, set the
// first time they arrive with no account and no name attached — the same
// answer to "who counts as a person" a seal gives: presence without identity.
export function sealToken(cookieHeader: string | undefined): { token: string; setCookie?: string } {
  const existing = parseCookie(cookieHeader, SEAL_COOKIE);
  if (existing && UUID_RE.test(existing)) return { token: existing };

  const token = randomUUID();
  return { token, setCookie: `${SEAL_COOKIE}=${token}; Max-Age=${TEN_YEARS_SECONDS}; Path=/; HttpOnly; SameSite=Lax` };
}
