import { afterEach, expect, inject, it } from "vitest";
import { Clients, uniqueRoom } from "./helpers/ws.ts";

// A visitor's own Cookie header is as untrusted as any POST body — the same
// "what could a crafted request do at the API boundary" question this repo's
// other spec/ files already ask of the write endpoint. Before the fix this
// test guards, a seal cookie with a percent-encoding decodeURIComponent
// rejects (a bare "%", say) threw synchronously inside the request handler
// and took the whole single-machine process down: every visitor, not just
// the one who sent it, got nothing until the deploy restarted.
const baseUrl = inject("baseUrl");
const clients = new Clients(baseUrl);
afterEach(() => clients.closeAll());

it("a malformed seal cookie doesn't crash the request", async () => {
  const res = await fetch(new URL("/", baseUrl), { headers: { Cookie: "seal=%" } });
  expect(res.status).toBe(200);
  expect(res.headers.get("set-cookie"), "expected a fresh seal cookie to replace the malformed one").toBeTruthy();
});

it("the server still answers normal requests right after a malformed cookie", async () => {
  await fetch(new URL("/", baseUrl), { headers: { Cookie: "seal=%" } });
  const res = await fetch(new URL("/", baseUrl));
  expect(res.status).toBe(200);
});

// Every token this server issues is a randomUUID(). A well-formed but
// non-UUID cookie (no decode error, just not what this server would ever
// hand out) must not be trusted as an identity either: the visitor gets a
// fresh real token instead of the claimed one.
it("a cookie claiming an arbitrary, oversized token isn't trusted as an identity", async () => {
  const huge = "a".repeat(8000);
  const res = await fetch(new URL("/", baseUrl), { headers: { Cookie: `seal=${huge}` } });
  expect(res.status).toBe(200);
  const setCookie = res.headers.get("set-cookie");
  expect(setCookie, "expected a fresh seal cookie to replace the untrusted one").toBeTruthy();
  const issued = setCookie!.split(";")[0]!.split("=")[1]!;
  expect(issued).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
});

// The same cookie arrives on the /ws upgrade, which is where the token is
// actually used. A malformed one is treated as no cookie: the visitor gets a
// fresh identity for that socket and a normal welcome.
it("a malformed seal cookie on the /ws upgrade still gets a welcome", async () => {
  for (const cookie of ["seal=%", `seal=${"a".repeat(8000)}`, "seal=not-a-uuid"]) {
    const { welcome } = await clients.join(uniqueRoom(), cookie);
    expect(welcome.t).toBe("welcome");
  }
  expect((await fetch(new URL("/", baseUrl))).status).toBe(200);
});
