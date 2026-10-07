import { escapeHtml } from "./html.ts";
import type { MatchRecord } from "./db.ts";
import { FIGHTERS, STAGES } from "./sim/index.ts";

const fighterName = (id: string): string => (Object.hasOwn(FIGHTERS, id) ? FIGHTERS[id as keyof typeof FIGHTERS].name : id);

const TITLE = "墨鬥 Mòdòu";

function head(title: string, extra = ""): string {
  return `<!doctype html>
<html lang="en-AU">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta
      name="description"
      content="Mòdòu: an ink-brush platform fighter for up to four, played in the browser on a painted handscroll."
    />
    <link rel="icon" href="/public/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/public/styles.css" />${extra}
  </head>`;
}

function layout(title: string, body: string): string {
  return `${head(title)}
  <body>
    ${body}
  </body>
</html>
`;
}

// Glyphs and fighter ids come from the server's own tables, but they're
// escaped anyway: nothing reaches a template string unescaped.
function historyList(matches: MatchRecord[]): string {
  if (matches.length === 0) return `<p class="empty-note">No matches yet. The scroll is blank.</p>`;
  const items = matches.map((m) => {
    const who = m.winnerGlyph ? `${escapeHtml(m.winnerGlyph)} won with ${escapeHtml(fighterName(m.winnerFighter ?? "?"))}` : "no winner";
    const where = m.stage ? ` on ${escapeHtml(Object.hasOwn(STAGES, m.stage) ? STAGES[m.stage as keyof typeof STAGES].name : m.stage)}` : "";
    const roster = m.players.map((p) => `${escapeHtml(p.glyph)} ${escapeHtml(fighterName(p.fighter))}`).join(", ");
    return `<li>${who}${where} <span class="history-roster">(${roster})</span></li>`;
  });
  return `<ol class="history-list">\n          ${items.join("\n          ")}\n        </ol>`;
}

export function renderShell(matches: MatchRecord[], room?: string): string {
  const list = historyList(matches);
  const roomAttr = room ? ` data-room="${escapeHtml(room)}"` : "";
  return `${head(room ? `${TITLE} — room ${room}` : TITLE)}
  <body${roomAttr}>
    <main id="stage">
      <canvas id="game" width="960" height="540" aria-label="Mòdòu match view"></canvas>
      <div id="ui"></div>
      <div id="touch"></div>
    </main>
    <noscript>
      <section class="prose">
        <h1>${TITLE}: Ink Contest</h1>
        <p>
          Mòdòu is a platform fighter for two to four players. Each fighter is a brush
          stroke on a painted handscroll; the aim is to knock your rivals off the stage
          and out past the edge of the scroll, three times over. The more damage a fighter
          has taken, the further each hit sends them.
        </p>
        <p>
          A match starts when everyone in a room has picked a fighter and pressed ready.
          Share the room link to play with friends, or add a computer fighter. Nobody has
          a name or an account: each player is a single seal glyph.
        </p>
        <p>
          <strong>This game needs JavaScript</strong> to draw the scroll and send your
          moves, so it can't be played with scripts turned off.
        </p>
        <h2>Recent matches</h2>
        ${list}
        <p><a href="/readme/">What good means here</a></p>
      </section>
    </noscript>
    <footer class="history" id="history">
      <h2>Recent matches</h2>
      ${list}
      <p><a href="/readme/">What good means here</a></p>
    </footer>
    <script type="module" src="/public/game.js"></script>
  </body>
</html>
`;
}

export function renderReadme(html: string): string {
  const body = `
    <header class="site-header">
      <h1><a href="/">${TITLE}</a></h1>
      <p class="kicker">what good means here</p>
    </header>
    <main class="prose">
      ${html}
    </main>
  `;
  return layout(`About — ${TITLE}`, body);
}
