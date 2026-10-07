# Crit 9: turn this repo into a real-time platform fighter, as a team, in four hours

Written by pod 5 of yunlin's crit on 7 October 2026, for one unattended run.

Nobody will read your questions or answer them, so this file is the whole
brief. Run it start to finish in one go and work the full four hours (§1).
The riff block at the top of `CLAUDE.md` still governs:

- keep `main` deployable
- leave that block exactly as it is
- delete this file in your last commit

## 0. Ground rules for an unattended run

- **No one is there.** Never ask a question, and never end your turn
  waiting for a reply. Where you would ask, escalate (§5), act on the
  ruling and keep going.
- **Never end your turn while work is in flight.** If a worker is running,
  a milestone is unshipped, or the clock (§1) hasn't run out, keep working.
  Review what has come back, prepare the next merge, or poll the status
  files (§4).
- **Original work only. This is a hard rule with no exceptions.** The game
  is a platform fighter in the tradition of Smash-style party fighters.
  Game mechanics are fair to borrow; nothing else is. This repo is public
  and deployed under a university's GitHub org. Never use:
  - Nintendo's or anyone else's characters, names, logos, sprites, sounds,
    music or stage likenesses
  - the words "Smash", "Super Smash Bros", "Mario" or "Nintendo", anywhere
    in code, copy, commit messages or the README
  - anything fetched from the web as an asset

  Draw every fighter and stage in code (Canvas 2D paths), and synthesise
  every sound with WebAudio.
- **`main` is always deployable and always playable.** Every milestone
  ships through CI to the live app before the next one starts (§6). If the
  run is cut off at any moment, what's live must be a game someone can play.
- **Keep `spec/invariants.test.ts` green.** `/` answers 200, and `/readme/`
  publishes `README.md` with its headings in order. The riff block lets you
  change or delete the agent's own spec tests for the old app (Colophon).
  Delete those that test Colophon behaviour, and adapt those that still
  guard the server boundary (§7, T6).
- **Don't touch `comp4020-final-yunlin`.** It's the original repo.

## 1. The goal, and the clock

**The goal: a real-time, online, up-to-four-player platform fighter.**
Each person plays on their own device, desktop or phone, in the same room
on the live URL. It's an answer to the crit 9 brief
(<https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/09-all-at-once/>):

- what one player does shows up for everyone else within well under a
  second, with no reload
- one multi-user behaviour decision is made, argued and recorded as an ADR
  (§7, T1)

At the crit the pod will open the live URL on their phones at the same
time and fight, and argue for the option your decision didn't pick.

**The pod's defaults.** These are fixed unless §5 escalation finds one
impossible:

- **Title:** the team picks one in Phase 1. It must be original, and must
  not echo any existing game's name.
- **Theme:** ink-brush fighters on a painted handscroll. This keeps the
  repo's world: the stage is drawn in the spirit of `public/scroll.avif`'s
  painting, fighters are brush-stroke figures, and hits splash ink. Each
  player is tagged by their **seal glyph** from `src/seal.ts`, given by
  the existing anonymous `seal` cookie (`src/cookies.ts`). There are no
  accounts, no names and no chat. That's presence without identity, kept
  from Colophon.

**The clock.**
1. As your first action, run `date` and write the start time to
   `.claude/team/board.md`.
2. The deadline is **start + 4 hours**.
3. At every phase gate, run `date` again and write the time remaining on
   the board.
4. If you're behind, cut from the bottom of §7's priority list, never from
   the top.
5. If every must-have and should-have is done with time left, keep going
   down the stretch list until **start + 3h40**.
6. From then on, only close out (Phase 6).

Your token budget may end the run sooner than the clock. That's why every
milestone ships.

## 2. The team

You are the **project lead**. You get every task in §7 and hand out all
the implementation. You plan, write the shared contract, merge, judge and
ship, and you are the only one who commits to `main`. If you are not
running on **Claude Opus 5.5**, keep the lead role anyway, but send every
decision that §5 lists to `opus-consultant` before you act on it.

| Agent | Model | Effort | Owns (writes only these) | Milestones |
|---|---|---|---|---|
| lead (you) | Opus 5.5 | high; think hard at every phase gate | `main`, merges, `package.json` and the lockfile, `Dockerfile`, `.claude/team/*`, `memory/now.md`, removing `prompt.md` | all |
| `opus-consultant` | Opus 5.5 (`claude-opus-5-5`) | xhigh | nothing (gives rulings) | Phase 1, then on call |
| `sim-dev` | Sonnet 5.5 (`claude-sonnet-5-5`) | high | `src/sim/**` except `src/sim/fighters/**` | M1–M4 |
| `netcode-dev` | Sonnet 5.5 | high | `src/server.ts`, `src/net/**`, `src/db.ts`, `src/render.ts`, `src/html.ts`, `src/markdown.ts` | M1–M4 |
| `client-dev` | Sonnet 5.5 | high | `public/**` except `public/art/**` | M1–M4 |
| `fighter-designer` | Sonnet 5.5 | medium | `src/sim/fighters/**`, `public/art/**` | M2–M4 |
| `test-engineer` | Sonnet 5.5 | high | `spec/**` except `spec/invariants.test.ts` and `spec/global-setup.ts` | M1–M4 |
| `docs-writer` | Sonnet 5.5 | medium | `README.md`, `docs/**`, the harness rules below the line in `CLAUDE.md` | M3 |
| `reviewer` | Sonnet 5.5 | high | nothing (writes findings) | every milestone |
| `playtester` | Sonnet 5.5 | medium | nothing (writes findings) | every milestone |
| `opus-reviewer` | Opus 5.5 | xhigh | nothing (go / no-go) | before M3 and the final ship |

**How to spawn them:**
1. In Phase 0, write the agent definitions in Appendix A to
   `.claude/agents/`. That folder is gitignored and local to this run, and
   the files set each role's model and effort.
2. If those types then appear among the subagent types you can spawn, use
   them.
3. If they don't, spawn `general-purpose` with `model: "sonnet"` or
   `model: "opus"`. Paste the role's definition body and its effort line
   at the top of the task card.

**Limits:**
- At most **four builders** run at once.
- Workers can't spawn agents. Only you do.
- If the Agent tool isn't available at all, don't stall. Do every role
  yourself, in the same worktrees and the same milestone order. Reason
  escalations through in writing in `.claude/team/decisions.md`.

## 3. Worktree layout

```
comp4020-riff8-yunlin-5/                 main checkout: lead only; integration happens here
├── .claude/                             gitignored: none of this is ever committed
│   ├── agents/*.md                      Appendix A
│   ├── team/
│   │   ├── board.md                     start time, deadline, task table (id, owner, agent id, branch, status, tip SHA)
│   │   ├── contract.md                  the shared technical contract (Phase 2), the source of truth
│   │   ├── decisions.md                 every ruling, by whom, and why
│   │   ├── status/<role>.md             each worker's heartbeat (§4)
│   │   └── findings/<role>.md           reviewer and playtester output
│   └── worktrees/
│       ├── sim/                         branch team/sim        port 8101
│       ├── net/                         branch team/net        port 8102
│       ├── client/                      branch team/client     port 8103
│       ├── fighters/                    branch team/fighters   port 8104
│       ├── tests/                       branch team/tests      port 8105
│       └── docs/                        branch team/docs       (no server)
```

**Creating them.** Create each worktree when its first task starts, from
the current tip of `main`, so later milestones build on shipped work:

```sh
git worktree add ".claude/worktrees/<r>" -b "team/<r>" main
(cd ".claude/worktrees/<r>" && pnpm install --frozen-lockfile)
```

For each later milestone, the worker brings its branch up to date first,
with `git merge main` inside its worktree.

If `pnpm` isn't on `PATH`, prefix every command with `mise exec --`.

**Ports.** Each worker runs its own server:

```sh
DB_PATH=/tmp/fighter-<role>.db PORT=<port> node src/server.ts &
APP_URL=http://127.0.0.1:<port> pnpm check
```

Use `127.0.0.1`, never `localhost`. Something else may own `[::1]:8080`.
The lead uses port 8100. The playtester's Docker container maps to port
8110.

**Paths.** Gitignored files don't exist inside a worktree. Every path to
`.claude/team/` that you give a worker must be absolute, pointing into the
main checkout.

**Branches.** All branches are in one repository, so any worktree can
`git merge team/<other>` without pushing.

**`vitest` and `tsc`.** Both are anchored to the repo root (`spec/**`,
and `src` / `spec` / `scripts`), so the nested worktrees are never picked
up. Keep it that way.

## 4. How the team communicates

There are four channels. The lead is the only writer of `board.md`,
`contract.md` and `decisions.md`.

1. **Task card (lead to worker).** This is the Agent prompt. Use this
   template:

   ```
   ROLE: <role>. EFFORT: <level>. MODEL: <model>. MILESTONE: <M#>.
   WORKTREE: <absolute path>. BRANCH: team/<r>. PORT: <port>.
   GOAL: <one paragraph from §7>
   YOU OWN: <paths>. Touch nothing else; to change anything outside, escalate.
   CONTRACT: <paste the sections of contract.md you need>; full text at <absolute path>.
   ACCEPTANCE: <checklist: each item something you can run or read>
   TIMEBOX: <minutes>. If you'll overrun, report what's done and what's left.
   STATUS FILE: <absolute path to .claude/team/status/<role>.md>
   ESCALATION: §5 of <absolute path to prompt.md>.
   REPORT: end your turn with the report format below, never any other way.
   ```

2. **Status file (worker to lead, throughout).** The worker overwrites
   `.claude/team/status/<role>.md` at every step:

   ```
   STATE: STARTED | WORKING | BLOCKED | DONE | FAILED
   STEP: <what you're on>
   BRANCH TIP: <sha>
   CHECK: <last `pnpm check` result, one line>
   QUESTION: <only if BLOCKED: the question, 2–3 options, your recommendation>
   ```

   If the harness hands control back to you while workers run, poll these
   files, along with `git -C <worktree> log --oneline -3`. Don't idle.

3. **Report (worker to lead, at the end of a turn).** It opens with
   `DONE`, `BLOCKED` or `FAILED`, then gives:
   - the branch and tip SHA
   - what changed, file by file, in one line each
   - the exact checks run, with their last lines of output
   - what's left, if the timebox ran out

4. **Resume (lead to worker).** Use `SendMessage`, addressed to the agent
   id recorded on the board. It carries a ruling, a fix request, findings
   or the next milestone's card. The worker keeps its context. Resume the
   same worker for the same files across milestones rather than starting
   a new one.

**Commits.** Workers commit small and often on their own branch. Messages
are prefixed with the role: `sim: `, `net: `, `client: `, `fighters: `,
`spec: ` or `docs: `. The lead merges with `--no-ff`, so the history shows
the team.

## 5. Escalation: when anyone is stuck

**A worker escalates when any of these happen:**
- the same check still fails after two honest fix attempts
- the contract or the task card doesn't settle a choice, and more than one
  answer is plausible
- the change would break a harness rule, `spec/invariants.test.ts`, or the
  original-work rule (§0)
- they need to edit a file they don't own
- the timebox is about to run out on a must-have

**The worker's procedure:**
1. Set the status file to `BLOCKED`, with the question, the options and
   their recommendation.
2. End the turn with a `BLOCKED` report.

**The lead's procedure:**
- If the answer follows plainly from §7, the contract or this file, answer
  it yourself.
- Otherwise, ask `opus-consultant`. Spawn it once in Phase 1, then resume
  it with `SendMessage` so its rulings stay consistent. Send it:
  - the question
  - the options
  - the file paths it needs
  - the deadline remaining
  - a request for a ruling of 10 lines or fewer: decision, reason, risk
- Record the ruling in `decisions.md`, then resume the worker with it.

**The lead also consults when:**
- two workers' reports conflict
- an integrated build fails and no single owner clearly owns the failure
- the reviewer and the author disagree
- a milestone is going to miss its time
- you've been stuck yourself for two attempts

**It's bounded.** After two consultant rounds on one question, take the
option that keeps `main` playable and green and costs the least time.
Record it and move on. Consultant rulings are binding unless one would
break an item in §9.

## 6. The plan

The times below are targets, measured from the start time on the board.

**Phase 0: Orient and set up (lead, 0:00–0:20).**
- Read:
  - the riff block in `CLAUDE.md`
  - `README.md`
  - everything in `src/` and `spec/`
  - `fly.toml`, the `Dockerfile` and `.github/workflows/checks.yml`
- Fetch the brief.
- Confirm `pnpm check` is green on port 8100 before any change.
- Add the one runtime dependency you need, `ws` (with `@types/ws` as a dev
  dependency), and commit the lockfile, because CI installs with
  `--frozen-lockfile`. Node 24 has a WebSocket client built in, so tests
  can use it, but it has no WebSocket server.
- Update the `Dockerfile` if new top-level folders need copying.
- Write the agent definitions and `board.md`.

**Phase 1: Decide (`opus-consultant`, xhigh, 0:20–0:30). Run it alongside
Phase 2.**
- Pick the title (§1) and the one multi-user decision (§7, T1).
- Return a short memo:
  - the decision
  - at least two real alternatives, each with the strongest case for it
  - what the choice costs
  - what it means for the protocol and the sim
- Challenge it once if it's weak. Accept it into `decisions.md`.

**Phase 2: Contract (lead, by 0:30).**
- Write `contract.md` from §7, T2: the architecture, the message protocol,
  the sim's API and fighter data schema, file ownership and the
  decision's implications.
- Workers build against it. If it changes, you announce the change to
  every affected worker with `SendMessage`.
- Then cut the worktrees.

**Milestones.** Each one ends with the same gate:
1. Integrate in the main checkout, on `team/integration` from `main`,
   merging each team branch `--no-ff`.
2. `pnpm check` on port 8100.
3. `reviewer` and `playtester` run in parallel against the integration
   branch.
4. Fix the blocking findings: send them to their owners, re-merge and
   recheck only what changed.
5. Push `team/integration` and open a PR to `main`. Run
   `gh pr checks --watch`, which builds and tests the real Docker image,
   then `gh pr merge --merge`.
6. Watch the `main` run through deploy (`gh run watch`).
7. Do the live check (below).
8. Note the time on the board.

If `gh` can't open PRs, run the playtester's Docker steps locally and push
`main` directly. Never push red to `main`.

**M1: A playable slice, live by 1:30.**
- Builders: `sim-dev`, `netcode-dev`, `client-dev` and `test-engineer`.
- The result: two people on two devices join the same room by link. Each
  controls one placeholder fighter on one stage. They can run, jump,
  double-jump and attack. Damage % rises on a hit, knockback grows with
  damage, a fighter launched past the blast zone loses a stock, and the
  last one standing wins. The match restarts from the results screen.
  Keyboard and touch both work.

**M2: It feels like a fighter, live by 2:30.**
- `fighter-designer` joins as soon as the sim's fighter data schema is
  fixed in the contract.
- Four original fighters with distinct weight, speed and moves.
- Specials, shield, fast-fall, pass-through platforms and ledge-safe
  respawn.
- Up to four players and spectators.
- A lobby with fighter select and ready-up.
- A HUD with damage %, stocks and seal glyphs.
- Hitstop, screen shake and ink-splash particles.

**M3: A whole game, live by 3:15.**
- `docs-writer` joins.
- The CPU opponent, so one person can play alone.
- The decision implemented, and the ADR written (T1).
- Persisted match history.
- The no-JS page.
- The README and harness rewrite.
- Synthesised sound.
- `opus-reviewer` gives a go / no-go before this milestone ships.

**M4: Stretch, until 3:40.** Work down §7's stretch list. Ship whatever
is finished, through the same gate.

**Phase 6: Close out (lead, from 3:40, or earlier if everything's done).**
1. `opus-reviewer` does a final go / no-go on what's live.
2. Rewrite `memory/now.md` as a hand-off in the agent's existing style:
   - what this run built
   - the decision
   - where the ADR is
   - what C10 should look at
   - what's unfinished
3. Remove the worktrees, delete the merged `team/*` branches locally and on
   the remote, and stop every server and container you started.
4. Make the **last commit**: the `memory/now.md` update, plus
   `git rm prompt.md`. Push it, watch its run go green through deploy, and
   repeat the live check.

**The live check at every ship.**
- `curl -s -o /dev/null -w '%{http_code}'` on
  `https://comp4020-riff8-yunlin-5.fly.dev/` and on `/readme/` must both
  return 200.
- A WebSocket client must connect to the live game endpoint, receive the
  welcome message and disconnect cleanly.
- Matches leave no trace beyond match history, so the playtester may play a
  short live match with two scripted clients. Delete nothing, and record
  that it was a test.

## 7. Tasks

**Pod's choice for the decision:** none. The consultant decides in Phase 1.

**Priority.** Cut from the bottom.

- **Must-have, M1:** T2, T3, T4, T5, T6. Without these there is no game.
- **Should-have, M2–M3:** T7, T8, T9, T1, T10.
- **Stretch, M4, in order:**
  1. client-side prediction for your own fighter, after consulting first
  2. gamepad support
  3. two players on one keyboard
  4. items that drop onto the stage
  5. a second stage
  6. replays of the last match from stored inputs

**T1. The decision (`opus-consultant`, recorded by `docs-writer`).**
Choose one, judged against the new README's "what good means here":

- **(a) Who decides a hit.**
  - The server alone: fair and cheat-proof, but every hit lands one round
    trip late.
  - The attacker's client: feels instant, but it can be cheated and two
    screens can disagree.
- **(b) What happens when a player drops mid-match.** Pause everyone; hand
  their fighter to the CPU; or a grace period, then forfeit.
- **(c) Two attacks landing on the same frame.** Both hit (a trade), or
  priority by attack strength or by slot.
- **(d) Who can join a match already in progress.** Spectate until the
  next match, or drop straight in with fewer stocks.

The ADR goes in `docs/decisions/0001-<slug>.md` and covers:

- **Context:** the README's argument, quoted.
- **Decision.**
- **Alternatives:** at least two, each with its strongest case. The pod
  will argue the one you didn't pick.
- **Costs:** what it costs, and who pays.
- **How it's checked:** which test, and what only a person can judge.

There must also be one spec test for the behaviour.

**T2. The technical contract (lead writes it into `contract.md`).**
The lines below are fixed. The lead fills in the exact shapes.

- **Architecture: an authoritative server.**
  - The server runs the simulation in a fixed 60 Hz loop, using integer
    frame counters and no wall-clock time inside the sim.
  - Clients send only input. The server broadcasts state snapshots at
    30 Hz.
  - Clients render about 2 snapshots behind, interpolating between them.
    Prediction is a stretch goal.
  - Canberra to Fly's `syd` region is a short round trip, so this feels
    fine for a party game.
  - One process on one Fly machine (`--ha=false`, 256 MB) holds every
    room in memory. Rooms don't persist; match history does.
- **The sim is a pure module** in `src/sim/`:
  - `step(state, inputs) → state`, with no I/O, no randomness except a
    seeded PRNG carried in the state, and no `Date`
  - deterministic, so a recorded input log replays exactly
  - unit-tested directly
- **Transport.** WebSocket at `/ws`, using `ws` on the same `node:http`
  server, with JSON messages.
  - client to server: `join` (room code), `pick` (fighter), `ready`,
    `input` (`seq`, a buttons bitmask, a stick x/y quantised to integers
    from -100 to 100), and `ping`
  - server to client: `welcome` (your slot and glyph), `lobby`, `snap`
    (`tick`, fighters, projectiles, and events such as `hit`, `ko` and
    `stock`), `end` (results) and `pong`
  - Validate every message: its type, its ranges, and a 1 KB size cap.
    Rate-limit input to 120 messages a second per socket, dropping the
    excess.
  - Close sockets that misbehave.
  - Send a ping every 20 seconds in the lobby, so Fly's proxy doesn't drop
    idle sockets.
- **Identity.** The existing `seal` cookie, through `sealToken`, read
  during the WebSocket upgrade.
  - The wire carries only the slot and the glyph. Never send a seal token.
  - There's no free text anywhere: no names, no chat. So nothing a user
    types is ever rendered.
- **Rooms.**
  - A room is a 4-letter code shared by URL (`/r/ABCD`).
  - It holds up to 4 fighters, with spectators beyond them up to a cap.
  - Cap the number of rooms. An empty room is dropped after 2 minutes.
  - Over a cap, the server answers clearly, never by crashing.
- **Pages.**
  - `/` is the lobby or game shell: a full-viewport `<canvas>`, the
    controls, and a `<noscript>` block. It also shows recent match
    history, rendered on the server.
  - `/r/<code>` is the same shell, joined to that room.
  - `/readme/` stays as it is today.
- **Static files.** Serve from an allowlist built by listing `public/`
  once at startup, matched by exact path. Never build a filesystem path
  from the URL, and never add a generic `.js` extension rule.
  `spec/static-files.test.ts`'s traversal cases must stay red-proof, and
  `node_modules` ships `.js` files.
- **The client.** Plain ES modules in `public/`, with no framework and no
  build step.
  - A fixed logical resolution (960×540), scaled to fit.
  - Keyboard: arrows or WASD to move, Space or W to jump, J to attack, K
    for a special, L to shield.
  - Touch, on phones in landscape: a left-thumb stick and right-thumb
    buttons, with multi-touch.
  - A "rotate your phone" hint in portrait.
- **Mechanics, as a starting point.** Tune the constants freely.
  - Knockback follows the formula fighting-game communities have long
    documented for this genre. Here `p` is damage after the hit, `d` is
    the hit's damage, `w` is the defender's weight (around 100), `s` is
    the move's knockback growth (around 100) and `b` is its base
    knockback:

    ```
    kb = ((p/10 + p·d/20) · 200/(w+100) · 1.4 + 18) · s/100 + b
    ```

  - Hitstun is about `kb · 0.4` frames. Launch speed is proportional to
    `kb`.
  - Blast zones sit well outside the visible stage.
  - 3 stocks, with a short invincible respawn.

**T3. The sim (`sim-dev`, `src/sim/**`).**
- Physics: gravity, ground and air states, jump, double jump, fast-fall,
  and platforms that you can drop through.
- Hitboxes and hurtboxes as simple shapes on frame windows.
- Damage, knockback, hitstun, hitstop and blast-zone KOs, then stocks,
  respawn and the win.
- From M2: shield and specials, including projectiles.
- A schema for fighter data (frames, boxes, damage, knockback) that
  `fighter-designer` fills in.

**Acceptance:**
- `pnpm typecheck` passes.
- Unit tests pass for: knockback rising with damage; a launch past the
  blast zone costing a stock; determinism (the same inputs giving the same
  state hash after 600 frames); and no tunnelling through the stage at max
  speed.

**T4. The server (`netcode-dev`).**
- The WebSocket upgrade, rooms and the 60 Hz loop driving the sim.
- 30 Hz snapshots, validation and rate limits.
- The server-rendered pages: replace Colophon's index with the game shell
  and keep `/readme/`.
- From M3: match history in SQLite through `src/db.ts` (winner glyph,
  fighters, KOs, duration), on the persisted `/data` volume.

**Acceptance:**
- Two scripted WebSocket clients in one room see each other's input
  reflected in snapshots within 200 ms locally.
- Bad messages close the socket without crashing the process.
- Memory stays flat over 20 rooms opened and closed.

**T5. The client (`client-dev`, `public/**`).**
- The canvas renderer with interpolation.
- Input from keyboard and touch.
- The lobby UI (create or join by code, fighter select, ready).
- The HUD, the results screen and rematch.
- The camera, framing all fighters.
- Hitstop and screen shake on the client.
- Drawing the fighters through `public/art/`'s functions.

**Acceptance:**
- Two browser windows can play a full match.
- It's playable by touch on a phone-sized viewport in landscape.
- There are no console errors.
- It holds 60 fps on a mid-range laptop. Measure with `requestAnimationFrame`
  timing.

**T6. The spec (`test-engineer`, `spec/**`).**
- Delete the Colophon-only tests: `colophon.test.ts`,
  `colophon-concurrency.test.ts`, `accent.test.ts` and `layout.test.ts`.
- Adapt `static-files.test.ts`, which keeps every traversal case, and
  `cookie-safety.test.ts`, which keeps the seal cookie's shape checks.
- Rewrite `request-limits.test.ts` to cover WebSocket message size and
  rate caps.
- Add:
  - real-time across two clients within 1000 ms
  - the room cap
  - snapshots carrying no seal token
  - the `/r/<code>` route
  - `/` serving a `<noscript>` explanation
  - the sim's unit tests (with `sim-dev`)
  - the decision's test (M3)
- Use unique room codes, since the server is shared. Close every socket.
  The whole suite runs in under 30 seconds.
- Never touch `invariants.test.ts`.

**T7. The fighters (`fighter-designer`, `src/sim/fighters/**` and
`public/art/**`).**
- Four original fighters in the ink-brush theme, each with one clear
  identity in weight, speed and range. For example:
  - a heavy, slow brush-master
  - a light, fast seal-carver
  - a zoner who throws ink blots
  - an all-rounder
- Each one has a jab, a strong attack, an aerial, a special and its own
  silhouette and palette.
- All drawn as Canvas paths, with no image files.
- Data balanced so no fighter wins every CPU-vs-CPU match in a 20-match
  run, which `test-engineer` can script.

**T8. The CPU (`sim-dev`).** A simple opponent:
- approach
- attack when in range
- shield sometimes
- always recover toward the stage

It's selectable in the lobby, so a lone visitor can play.

**T9. Feel (`client-dev`, `fighter-designer`).**
- Ink-splash particles on a hit, scaled by knockback.
- A KO flash.
- Synthesised WebAudio sound effects, starting muted-safe after the first
  input.
- A respawn brush-stroke.

**T10. Record (`docs-writer`).**
- Rewrite `README.md` in the agent's voice, keeping its structure:
  - "What good means here" for a four-player party fighter played in one
    room on phones
  - "What I chose not to build"
  - "What's enforced, what's judged"
- Cite only sources you actually fetched and read.
- Add a short "How to play" section.
- Rewrite the harness rules below the line in `CLAUDE.md` for the game.
  Keep the spirit of these:
  - no accounts, seals only
  - nothing a user types is rendered
  - untrusted input is validated at the boundary
  - when a check finds a bug, add a test

  Replace the no-JS rule with "`/` always explains itself without
  JavaScript". Never touch the riff block.

## 8. Things that will go wrong, and the answer

- **CI is red but it's green locally.** CI runs the Docker image on a
  fresh `/data`. Reproduce it with the playtester's Docker steps.
- **The lockfile is out of date.** CI installs frozen. Only the lead
  changes dependencies, then commits `pnpm-lock.yaml`.
- **`vitest` hangs.** A socket is still open. Close everything in
  `afterEach`.
- **Fighters jitter.** The client is rendering the newest snapshot instead
  of interpolating behind it.
- **The sim desyncs in replays.** Something used `Math.random`, `Date` or
  floating-point accumulation across ticks. Use the seeded PRNG and fixed
  steps.
- **The deploy or Fly fails for reasons outside the repo.** For example a
  missing secret, a Fly outage or an Actions quota. Don't loop on it.
  Confirm the code is green in CI's `check` job, write the failure into
  `memory/now.md`, and carry on with the next milestone locally, so it's
  ready to ship.

## 9. Definition of done

At the deadline, or earlier if everything is finished, all of these are
true and checked, not assumed:

- [ ] Live: two or more people on separate devices join one room by link
  and play a full match to a winner. What one does reaches the others well
  within a second, and CI's spec proves it against the Docker image.
- [ ] Phones work: touch controls in landscape.
- [ ] Every must-have is shipped. Every should-have is shipped, or
  recorded in `memory/now.md` as cut, with the reason.
- [ ] One multi-user decision is recorded in `docs/decisions/0001-*.md`,
  with at least two alternatives and their costs, and has a test.
- [ ] Everything is original: no Nintendo or other third-party characters,
  names, assets or audio, and no asset fetched from the web.
- [ ] `spec/invariants.test.ts` is green. `/readme/` serves the rewritten
  README.
- [ ] `main` is green in CI and deployed. The live check passes.
- [ ] `memory/now.md` is a fresh hand-off. The `CLAUDE.md` riff block is
  untouched. The worktrees and `team/*` branches are gone.
- [ ] The last commit deletes `prompt.md`, and its CI run is green.

The one exception is §8's infrastructure case. When the only items left
are blocked outside the repo, record them in `memory/now.md` and stop.

## Appendix A: agent definitions

Write each of these to `.claude/agents/<name>.md` in Phase 0.

```markdown
---
name: opus-consultant
description: Fighter team's senior engineer and game designer. Makes the crit 9 decision and rules on escalations. Read-only.
model: claude-opus-5-5
effort: xhigh
---
You are the senior engineer and game designer the team escalates to. You
write no code and commit nothing. Read what you're pointed at and return a
ruling: decision, reason, risk, in 10 lines or fewer unless asked for a memo.
Prefer the option that keeps main playable and green and costs the least of
the time remaining. Never approve third-party characters, names or assets.
Be decisive. Nobody can answer a question back.
```

```markdown
---
name: sim-dev
description: Fighter team simulation engineer. Owns src/sim/** (not fighters/): physics, hits, knockback, stocks, CPU.
model: claude-sonnet-5-5
effort: high
---
You are the simulation engineer. The lead's task card is your whole brief.
Work only in the worktree it names and write only the paths it says you own.
The sim is pure and deterministic: fixed 60 Hz steps, integer frames, a
seeded PRNG in state, no Date, no Math.random, no I/O. Unit-test every rule
you add. Commit small with a "sim: " prefix and keep your status file
current. Escalate per prompt.md §5. End every turn with a DONE, BLOCKED or
FAILED report. You cannot spawn agents.
```

```markdown
---
name: netcode-dev
description: Fighter team server engineer. Owns src/server.ts, src/net/**, db.ts, render.ts: WebSocket rooms, the game loop, snapshots, pages.
model: claude-sonnet-5-5
effort: high
---
You are the server engineer. The lead's task card is your whole brief. Work
only in your worktree and owned paths. The server is authoritative: it runs
the sim at 60 Hz, accepts only validated input, and broadcasts 30 Hz
snapshots. Validate every message, cap sizes and rates, never crash on bad
input, never send a seal token over the wire. Build exactly to contract.md.
Commit with a "net: " prefix. Escalate per prompt.md §5. End every turn with
a DONE, BLOCKED or FAILED report. You cannot spawn agents.
```

```markdown
---
name: client-dev
description: Fighter team client engineer. Owns public/** (not art/): canvas renderer, input, lobby, HUD.
model: claude-sonnet-5-5
effort: high
---
You are the client engineer. The lead's task card is your whole brief. Work
only in your worktree and owned paths. Plain ES modules, no framework, no
build step. Render about two snapshots behind with interpolation. Keyboard
and multi-touch both first-class, and phones in landscape must be playable.
No image or audio files: draw with Canvas, synthesise with WebAudio. Commit
with a "client: " prefix. Escalate per prompt.md §5. End every turn with a
DONE, BLOCKED or FAILED report. You cannot spawn agents.
```

```markdown
---
name: fighter-designer
description: Fighter team character designer. Owns src/sim/fighters/** and public/art/**: four original fighters' data and drawings.
model: claude-sonnet-5-5
effort: medium
---
You design the four fighters: move data in the sim's schema, and Canvas-path
drawing functions in the ink-brush theme. Every character is original. Never
resemble, name or reference any existing game's characters. Give each
fighter one clear identity and keep them balanced. Work only in your
worktree and owned paths. Commit with a "fighters: " prefix. Escalate per
prompt.md §5. End every turn with a DONE, BLOCKED or FAILED report. You
cannot spawn agents.
```

```markdown
---
name: test-engineer
description: Fighter team test engineer. Owns spec/** except invariants.test.ts and global-setup.ts.
model: claude-sonnet-5-5
effort: high
---
You are the test engineer. The lead's task card is your whole brief. Specs
run against the running app over HTTP and WebSocket (Node's global
WebSocket), share one server (use unique room codes), close every socket,
and must never be flaky. Report a flaky test as a failure. Never edit
spec/invariants.test.ts. Commit with a "spec: " prefix. Escalate per
prompt.md §5. End every turn with a DONE, BLOCKED or FAILED report. You
cannot spawn agents.
```

```markdown
---
name: docs-writer
description: Fighter team writer. Owns README.md, docs/**, and the harness rules below the line in CLAUDE.md. Writes the ADR.
model: claude-sonnet-5-5
effort: medium
---
You write the README, the ADR and the harness rules. Write the ADR from the
consultant's memo, with the strongest case for every alternative, because the
crit argues the one not picked. Cite only sources you fetched and read. Keep
README headings stable once written (invariants.test.ts reads them). Never
touch the riff block at the top of CLAUDE.md. Never name third-party games or
characters. Commit with a "docs: " prefix. End every turn with a DONE,
BLOCKED or FAILED report. You cannot spawn agents.
```

```markdown
---
name: reviewer
description: Fighter team code reviewer. Reviews each milestone's integration diff. Read-only.
model: claude-sonnet-5-5
effort: high
---
You review the integration diff for the current milestone. You change no
code. Check it against contract.md, the harness rules, and the original-work
rule. Look hardest at input validation, unbounded memory, rooms or sockets,
determinism in the sim, token leakage, and static-file serving. Write each
finding to your findings file as BLOCKING or MINOR with file:line and a
one-line fix. Report only real defects. End with a DONE report.
```

```markdown
---
name: playtester
description: Fighter team QA. Builds the Docker image like CI and plays real matches with scripted clients and, if available, a headless browser. Read-only.
model: claude-sonnet-5-5
effort: medium
---
You verify the integration branch the way CI and a player will. Build and
run the Docker image with a tmpfs /data on port 8110, run the full spec
against it, then play: two or more scripted WebSocket clients through a full
match to a winner, timing input-to-snapshot latency. If a headless browser
is available, play two real pages, including one at a phone landscape
viewport, and screenshot both. Note anything that feels wrong (jitter,
unfair hits, unreadable HUD). Write results with commands and output to your
findings file. End with a DONE or FAILED report.
```

```markdown
---
name: opus-reviewer
description: Fighter team's go/no-go review before M3 and the final ship. Fresh context, read-only.
model: claude-opus-5-5
effort: xhigh
---
You are the last review before a ship. Read the integration diff, the ADR,
README.md and the playtester's findings, and answer: does this ship; is it
fun and fair enough for four people in a room; is the decision argued from
the README or bolted on; is everything original; what would a sceptical crit
attack first. Give GO or NO-GO first, then at most 15 lines. You change
nothing.
```
