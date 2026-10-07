import { request } from "node:http";
import { expect, inject, it } from "vitest";

// The "what could a crafted request do at the API boundary" question (already
// asked of the POST body and the Cookie header — see request-limits.test.ts,
// cookie-safety.test.ts) applies to the static-file route too: it reads
// `.${url.pathname}` straight off disk, gated only by `startsWith("/public/")`.
// The server's own WHATWG URL parsing collapses every dot segment (including
// percent-encoded forms) before that check runs, so a ".." can't survive to
// the filesystem read — already true, not a fix, locked in against whatever a
// future refactor of this route does. A second, independent gate sits behind
// it: only paths in the allowlist built from public/ at startup are ever
// served, so these cases check the route's whole property, not the path guard
// alone.
//
// The paths go out over node:http, not fetch: fetch runs them through the
// same URL parser on the client side first, so "/public/../README.md" would
// leave this process as "/README.md" and the test would pass without ever
// sending the server a traversal. node:http sends the path verbatim.
const baseUrl = inject("baseUrl");

function rawGet(path: string): Promise<number> {
  const { hostname, port } = new URL(baseUrl);
  return new Promise((resolve, reject) => {
    const req = request({ hostname, port, path, method: "GET" }, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode ?? 0));
    });
    req.on("error", reject);
    req.end();
  });
}

it("a real file under /public/ is still served", async () => {
  expect(await rawGet("/public/styles.css")).toBe(200);
});

it.each(["/public/nope.css", "/public/", "/public", "/public/game.js.map", "/public/styles.css/extra", "/public/.env"])(
  "a path under /public/ that isn't in the allowlist (%s) is a 404",
  async (path) => {
    expect(await rawGet(path)).toBe(404);
  },
);

it.each([
  "/public/../README.md",
  "/public/../package.json",
  "/public/../src/server.ts",
  "/public/../../etc/passwd",
  "/public/../public/../README.md",
  "/public/%2e%2e/README.md",
  "/public/.%2e/src/server.ts",
  "/public/%252e%252e/README.md",
  "/public/..%2fsrc%2fserver.ts",
  "/public/..%5c..%5csrc%5cserver.ts",
  "/public%2f..%2f..%2fetc%2fpasswd",
])("traversal attempt %s never escapes /public/", async (path) => {
  expect(await rawGet(path)).not.toBe(200);
});
