import { createServer } from "node:http";
import { readFile, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { recentMatches } from "./db.ts";
import { sealToken } from "./cookies.ts";
import { renderReadme, renderShell } from "./render.ts";
import { renderMarkdown } from "./markdown.ts";
import { attachWs } from "./net/socket.ts";

const PORT = Number(process.env.PORT ?? 8080);
const ROOT = join(import.meta.dirname, "..");
const README = readFileSync(join(ROOT, "README.md"), "utf8");

const MIME: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

// Listed once at startup: a request is served only if its exact path is a key
// here. No filesystem path is ever built from a URL.
function listPublic(): Map<string, { file: string; type: string }> {
  const dir = join(ROOT, "public");
  const out = new Map<string, { file: string; type: string }>();
  for (const rel of readdirSync(dir, { recursive: true, encoding: "utf8" })) {
    const file = join(dir, rel);
    const type = MIME[extname(rel).toLowerCase()];
    if (type && statSync(file).isFile()) out.set(`/public/${rel.split("\\").join("/")}`, { file, type });
  }
  return out;
}
const STATIC = listPublic();

const ROOM_PATH = /^\/r\/([A-Za-z]{4})\/?$/;

const server = createServer((req, res) => {
  try {
    res.setHeader("X-Content-Type-Options", "nosniff");
    const url = new URL(req.url ?? "/", "http://internal");
    const { setCookie } = sealToken(req.headers.cookie);
    if (setCookie) res.setHeader("Set-Cookie", setCookie);

    if (req.method === "GET" || req.method === "HEAD") {
      const room = ROOM_PATH.exec(url.pathname)?.[1];
      if (url.pathname === "/" || room) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
        res.end(renderShell(recentMatches(10), room?.toUpperCase()));
        return;
      }
      if (url.pathname === "/readme/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(renderReadme(renderMarkdown(README)));
        return;
      }
      const asset = STATIC.get(url.pathname);
      if (asset) {
        readFile(asset.file, (err, data) => {
          if (err) {
            res.writeHead(404);
            res.end("not found");
            return;
          }
          res.writeHead(200, { "Content-Type": asset.type, "Cache-Control": "no-cache" });
          res.end(data);
        });
        return;
      }
    }
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("not found");
  } catch (err) {
    console.error("request failed", err);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
});

const net = attachWs(server);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`mòdòu listening on 0.0.0.0:${PORT}`);
});

// Log and keep serving: one bad handler must not end every match in progress.
process.on("uncaughtException", (err) => console.error("uncaughtException", err));
process.on("unhandledRejection", (err) => console.error("unhandledRejection", err));

process.on("SIGTERM", () => {
  net.close();
  server.close(() => process.exit(0));
  server.closeAllConnections();
  setTimeout(() => process.exit(0), 3000).unref();
});
