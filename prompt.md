# Crit 9: make Colophon real-time, as a team

Written by pod 5 of yunlin's crit, 7 October 2026, for one unattended run.

Nobody will read your questions or answer them. This file is the whole
brief. Run it start to finish in one go. Don't stop until every item in
§9 (Definition of done) is true. The riff block at the top of `CLAUDE.md`
still governs:

- keep `main` deployable
- leave that block exactly as it is
- delete this file in your last commit

## 0. Ground rules for an unattended run

- **No one is there.** Never ask a question or end your turn waiting for a
  reply. When you would ask, escalate (§5), act on the ruling and keep going.
- **Never end your turn while work is in flight.** If a worker is still
  running or anything in §9 is unmet, keep working. Review what has come
  back, prepare the next merge, or poll the status files (§4). The run ends
  only when §9 is all true.
- **Never write to the live app.** A colophon can't be edited or deleted,
  so anything you post to `https://comp4020-riff8-yunlin-5.fly.dev` stays
  there forever. All write tests run against local or CI containers.
- **The product rules still hold.** The harness below the rule in
  `CLAUDE.md` still governs the code:
  - every body goes through `escapeHtml`
  - no-JS keeps working
  - `--seal` has one meaning
  - no accounts, no notifications
  - reject, don't truncate

  The riff block only lifts the grading obligations.
- **Don't touch `comp4020-final-yunlin`.** It's the original repo.

## 1. The goal

The brief is at <https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/09-all-at-once/>.
Fetch it in Phase 0. In short:

1. **Real-time.** A colophon one person writes appears in every other open
   session within about a second, with no reload.
2. **One decision.** Make one multi-user behaviour decision and judge it
   against what `README.md` says good means. Record it in the repo with the
   alternatives you weighed and what the choice costs. Use an architecture
   decision record (ADR).

**Out of scope:**
- `PROCESS.md` and `reflections/` (this run isn't marked). Leave them as
  they are, since `pnpm check:evidence` already passes on them.
- Accounts, profiles, likes, replies, threads or notifications.
- Rewriting the app, or swapping the stack. It's ~400 lines of plain Node,
  `node:sqlite` and server-rendered HTML, and that is part of the argument.

## 2. The team

You are the **project lead**. You get every task in §7 and hand out all
the implementation. You plan, write the shared contract, merge, judge and
ship, and you are the only one who commits to `main`. If you are not
running on **Claude Opus 5.5**, keep the lead role anyway, but send every
decision listed in §5 to `opus-consultant` before you act on it.

| Agent | Model | Effort | Owns (writes only these) | Phase |
|---|---|---|---|---|
| lead (you) | Opus 5.5 | high, and think hard at every phase gate | `main`, merges, `.claude/team/*`, `memory/now.md`, removing `prompt.md` | all |
| `opus-consultant` | Opus 5.5 (`claude-opus-5-5`) | xhigh | nothing (gives rulings) | 1, then on call |
| `backend-dev` | Sonnet 5.5 (`claude-sonnet-5-5`) | high | `src/**` | 3 |
| `frontend-dev` | Sonnet 5.5 | medium | `public/**` | 3 |
| `test-engineer` | Sonnet 5.5 | high | `spec/realtime.test.ts`, plus any new `spec/*.test.ts` | 3 |
| `docs-writer` | Sonnet 5.5 | medium | `docs/**`, `README.md`, harness rules below the line in `CLAUDE.md` | 3 |
| `reviewer` | Sonnet 5.5 | high | nothing (writes findings) | 5 |
| `verifier` | Sonnet 5.5 | medium | nothing (writes findings) | 5 |
| `opus-reviewer` | Opus 5.5 | xhigh | nothing (go / no-go) | 6 |

**How to spawn them:**
1. In Phase 0, write the agent definitions in Appendix A to
   `.claude/agents/`. That folder is gitignored and local to this run, and
   the files set each role's model and effort.
2. If those types then appear among the subagent types you can spawn, use
   them.
3. If they don't appear (definitions may not load mid-session), spawn
   `general-purpose` with `model: "sonnet"` or `model: "opus"`. Paste the
   role's definition body and its effort line at the top of the task card.

**Limits:**
- At most four workers run at once.
- Workers can't spawn agents. Only you do.
- If the Agent tool isn't available at all, don't stall. Do every role
  yourself, in the same worktrees and the same order, and keep the same
  escalation rules, with `opus-consultant` replaced by stopping to reason
  it through in writing in `.claude/team/decisions.md`.

## 3. Worktree layout

```
comp4020-riff8-yunlin-5/                 main checkout: lead only, integration branch lives here
├── .claude/                             gitignored: none of this is ever committed
│   ├── agents/*.md                      Appendix A
│   ├── team/
│   │   ├── board.md                     task table: id, owner, agent id, branch, status, tip SHA
│   │   ├── contract.md                  the shared technical contract (Phase 2)
│   │   ├── decisions.md                 every ruling, by whom, and why
│   │   ├── status/<role>.md             each worker's heartbeat (§4)
│   │   └── findings/<role>.md           reviewer and verifier output
│   └── worktrees/
│       ├── backend/                     branch team/backend    port 8101
│       ├── frontend/                    branch team/frontend   port 8102
│       ├── tests/                       branch team/tests      port 8103
│       └── docs/                        branch team/docs       (no server)
```

**Creating them**, from the main checkout after Phase 2, so every branch
starts from the commit that carries this file:

```sh
for r in backend frontend tests docs; do
  git worktree add ".claude/worktrees/$r" -b "team/$r" HEAD
  (cd ".claude/worktrees/$r" && pnpm install --frozen-lockfile)
done
```

If `pnpm` isn't on `PATH`, prefix every command with `mise exec --`.

**Ports.** Each worker runs its own server so they never collide:

```sh
DB_PATH=/tmp/colophon-<role>.db PORT=<port> node src/server.ts &
APP_URL=http://127.0.0.1:<port> pnpm check
```

Use `127.0.0.1`, never `localhost`. Something else may own `[::1]:8080`
on this machine. The lead uses port 8100. The verifier's Docker container
maps to port 8104.

**Paths.** Gitignored files don't exist inside a worktree. Every path to
`.claude/team/` that you give a worker must be absolute, pointing into the
main checkout.

**Branches.** They're all in one repository, so any worktree can
`git merge team/<other>` without pushing.

## 4. How the team communicates

There are four channels. The lead is the only writer of `board.md`,
`contract.md` and `decisions.md`.

1. **Task card (lead to worker).** This is the Agent prompt. Use this
   template:

   ```
   ROLE: <role>. EFFORT: <level>. MODEL: <model>.
   WORKTREE: <absolute path>. BRANCH: team/<role>. PORT: <port>.
   GOAL: <one paragraph, from §7>
   YOU OWN: <paths>. Touch nothing else; to change anything outside, escalate.
   CONTRACT: <paste the sections of contract.md you need>; full text at <absolute path>.
   ACCEPTANCE: <checklist from §7: each item is something you can run or read>
   STATUS FILE: <absolute path to .claude/team/status/<role>.md>
   ESCALATION: §5 of <absolute path to prompt.md>.
   REPORT: end your turn with the report format below; never end it any other way.
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
   - anything the lead should know before merging

4. **Resume (lead to worker).** Use `SendMessage`, addressed to the agent
   id recorded on the board. It carries a ruling, a fix request or
   findings. The worker keeps its context. Always resume the same worker
   rather than starting a new one for the same files.

**Commits.** Workers commit small and often on their own branch. Messages
are prefixed with the role, for example `backend: broadcast after a
successful insert`. The lead merges with `--no-ff`, so the history shows
the team.

## 5. Escalation: when anyone is stuck

**A worker escalates when any of these happen:**
- the same check still fails after two honest fix attempts
- the contract or the task card doesn't settle a choice, and more than one
  answer is plausible
- the change would break a harness rule, an existing spec test, or
  something `README.md` promises
- they need to edit a file they don't own
- anything would touch the live app

**The worker's procedure:**
1. Set the status file to `BLOCKED`, with the question, the options and
   their recommendation.
2. End the turn with a `BLOCKED` report.
3. Never guess past a harness rule.

**The lead's procedure:**
- If the answer follows plainly from §7, the contract or `README.md`,
  answer it yourself.
- Otherwise, ask `opus-consultant`. Spawn it once in Phase 1, then resume
  it with `SendMessage` so its rulings stay consistent. Send it:
  - the question
  - the options
  - the file paths it needs
  - the README passages at stake
  - a request for a ruling of 10 lines or fewer: decision, reason, risk
- Record the ruling in `decisions.md`, then resume the worker with it.

**The lead also consults when:**
- two workers' reports conflict
- the integrated build fails and no single owner clearly owns the failure
- the reviewer and the author disagree
- you've been stuck yourself for two attempts

**It's bounded.** After two consultant rounds on one question, take the
most conservative option. That's the one that keeps `main` green, keeps
the harness rules intact and adds the least. Record it in `decisions.md`,
and in the ADR's alternatives if it's relevant, then move on. Consultant
rulings are binding unless one would break an item in §9.

## 6. The plan

**Phase 0: Orient and baseline (lead).**
- Read:
  - the riff block in `CLAUDE.md` and the harness rules below it
  - `README.md`
  - everything in `src/` and `spec/`
  - `memory/now.md`
  - `fly.toml` and `.github/workflows/checks.yml`
- Fetch the brief.
- Start the app on port 8100 with a scratch DB. Confirm `pnpm check` is
  green before any change.
- Write the agent definitions and `board.md`, listing §7's tasks with
  owners.

**Phase 1: Decide (`opus-consultant`, xhigh).**
- Pick the one multi-user decision (§7, T1).
- Return a decision memo:
  - the choice
  - at least two real alternatives, each with the strongest case for it
  - what the choice costs
  - what it means for the implementation: what goes live, what waits, and
    what someone sees when they come back
  - whether `README.md` or a harness rule has to change first
- Challenge the memo once if it's weak, then accept it into
  `decisions.md`.

**Phase 2: Contract (lead).**
- Write `contract.md`: the technical contract in §7, T2, made concrete
  with the decision's implications folded in. Every worker builds against
  this file, so be exact about routes, payload shapes, IDs and file
  ownership.
- Create the worktrees (§3).

**Phase 3: Build (four workers, in parallel, one message spawning all
four).**
- `backend-dev` takes T3.
- `frontend-dev` takes T4.
- `test-engineer` takes T5. Write the tests against the contract first.
  Commit them showing red for the right reason against the untouched app.
  Then, once `backend-dev` reports `DONE`, `git merge team/backend` in your
  worktree and make sure they pass. Report flaky tests as failures.
- `docs-writer` takes T6.
- While they work: answer escalations, poll status, and read each branch's
  diff as it lands.

**Phase 4: Integrate (lead).**
1. In the main checkout:
   `git switch -c team/integration`
2. Merge `team/backend`, `team/frontend`, `team/tests` and `team/docs`,
   in that order, each with `--no-ff`.
3. Resolve conflicts by ownership. If a conflict isn't clearly one owner's,
   escalate.
4. Typecheck, start the app on port 8100, and run `pnpm check`.

**Phase 5: Review and verify (`reviewer` and `verifier`, in parallel).**
- **`reviewer`** reads `git diff riff-start..team/integration`, checking
  it against the contract, every harness rule and §7's acceptance lines.
  In particular it checks:
  - escaping on every path a body travels
  - no seal token on the wire
  - no `var(--seal)` drift
  - no-JS still works
  - no unbounded memory or connections

  Findings go to `findings/reviewer.md`, each marked blocking or minor,
  with file:line.
- **`verifier`** checks out `team/integration` in a detached worktree. It
  builds and runs the Docker image exactly as CI does (with `--tmpfs
  /data`, on `-p 8104:8080`) and runs `APP_URL=http://127.0.0.1:8104 pnpm
  check`. It also proves real-time by hand: two `curl -N` streams with
  different seal cookies, then a POST from a third. It times arrival and
  confirms both streams got it within a second, with the right "yours"
  marking. If a headless browser is available, it repeats this with two
  real pages. Results go to `findings/verifier.md`.
- **Fix loop.** Send each blocking finding to its owner with `SendMessage`.
  The owner fixes it on their branch. You re-merge, then the reviewer and
  verifier recheck only what changed. Repeat until there are no blocking
  findings. A finding still open after three rounds gets escalated, and
  then descoped with a reason recorded in the ADR, never left red.

**Phase 6: Pre-ship review (`opus-reviewer`, xhigh, fresh context).**
- It reads the whole integration diff, the ADR and `README.md`, and
  answers:
  - Does this ship?
  - Is the decision argued from the README, or bolted on?
  - What would a sceptical crit attack first?
- Act on any "no", back through Phase 5. Minor notes are your call.

**Phase 7: Ship (lead).**
1. Push `team/integration` and open a PR to `main` with `gh pr create`.
   This is the one PR, the team's merge.
2. `gh pr checks --watch`. CI builds the same Docker image and runs the
   whole spec against it. That is the strongest proof you have.
3. When the PR is green, `gh pr merge --merge`, then watch the `main` run
   through deploy with `gh run watch`.
4. If `gh` can't open a PR, run the CI-equivalent from Phase 5 locally,
   merge into `main` and push. Never push red to `main`.
5. **Live check, read-only.**
   - `curl -s -o /dev/null -w '%{http_code}'` on `/` and on `/readme/`
     must both return 200.
   - `curl -sN -D - --max-time 5` on the live stream route must show
     `content-type: text/event-stream` and a first frame.
   - Post nothing.

**Phase 8: Hand off and close (lead).**
1. Rewrite `memory/now.md` as a hand-off in the agent's existing style:
   - what this run did
   - the decision
   - where the ADR is
   - what C10 should look at next
2. Remove the worktrees with `git worktree remove`, delete the merged
   `team/*` branches locally and on the remote, and stop any servers or
   containers you started.
3. Make the **last commit**: the `memory/now.md` update, plus
   `git rm prompt.md`. Push it, watch that run go green through deploy,
   and repeat the live check.

## 7. Tasks

**Pod's choice for the decision:** none. The consultant decides in Phase 1.

**T1. The decision (`opus-consultant`).** Choose one, judged against
`README.md`'s argument: one unhurried object that strangers add to, a
trace the next visitor can actually find, no feed, nothing to win.

- **(a) How a new colophon arrives for people already reading.** It could
  appear instantly, or arrive quietly at the end of the scroll without
  pulling anyone's attention. Is "live" itself at odds with "unhurried"?
- **(b) Whether anyone can see who else is here.** For example, faint
  seals of people currently reading, a count, or deliberately nothing.
  "Presence without identity" is the README's own phrase for a seal, but
  "no feed of other people's activity" and "no notifications" are
  harness rules. If presence wins, `README.md` and the rule have to change
  first, in the same commit.
- **(c) What someone sees when they come back the next day.** A mark at
  where they last read, or nothing, the same as a real scroll. The tension
  here is with "no notifications".

Two people writing at once is not a candidate. The table is append-only
and ordered by ID, so there's nothing to decide.

**T2. The technical contract (lead writes this into `contract.md`).**
These lines are fixed. Workers don't relitigate them.

- **Transport.** Server-sent events on `GET /live`, using `text/event-stream`
  and plain `node:http`. Add no dependency.
  - The stream identifies the viewer by their existing `seal` cookie,
    through `sealToken`. EventSource sends same-origin cookies.
  - It does **not** set a new cookie on the stream response.
- **Payload.** Each event is `id: <colophon id>`, `event: colophon`,
  `data: {"id":<n>,"html":"<li …>"}`, JSON-encoded so a body's newlines
  can't break SSE framing.
  - `html` comes from the **one** colophon renderer in `src/render.ts`.
    Export it rather than writing a second one, so every body still passes
    through `escapeHtml` on exactly one path.
  - It's rendered **for each subscriber, using that subscriber's token**,
    so `colophon--mine` and "— yours" are right for each viewer.
  - No seal token, and nothing derived from one beyond the glyph, ever goes
    over the wire.
- **Broadcast.** Keep an in-memory set of subscribers. That's fine on this
  app's single Fly machine (`--ha=false`). Broadcast only after the insert
  succeeds.
  - Cap the subscribers. Over the cap, return `503`. The page still works
    by reload.
  - Remove a subscriber on `close`.
  - Keep nothing per subscriber beyond its response and token. The
    machine has 256 MB.
- **No gaps.**
  - The rendered `<ol class="colophon-list">` carries `data-last-id`.
  - The script connects to `/live?after=<that id>`.
  - On a reconnect, honour `Last-Event-ID`.
  - Either way, replay every colophon with a higher ID, in order, before
    going live.
  - The client drops any ID it already has.
- **Keep-alive.**
  - Send a comment frame (`: ping`) at least every 20 seconds, so Fly's
    proxy doesn't drop an idle stream.
  - Send `retry: 3000`.
  - Don't change `fly.toml`. An open stream keeps the machine awake only
    while someone has the page open, which is acceptable.
- **The script.** It's served at the **exact** route `GET /public/live.js`
  with `text/javascript`, from a fixed path. Do **not** add `.js` to the
  generic MIME map. `spec/static-files.test.ts` relies on that map as a
  second gate, and `node_modules` ships `.js` files. The page includes it
  with `<script src="/public/live.js" defer>`.
- **Progressive enhancement.**
  - Without JavaScript the page is unchanged: a plain form posting to
    `/colophons`, then a 303 back to `/`.
  - With JavaScript, colophons from other people appear in the list
    without a reload, and `.empty-note` goes away when the first one
    arrives.
  - Writing can stay a normal POST and redirect.
  - New entries are announced politely (`aria-live="polite"`).
  - Any arrival styling honours `prefers-reduced-motion` and never uses
    `var(--seal)`. `spec/accent.test.ts` enforces that.
- **Decision-specific behaviour.** It comes from the Phase 1 memo, written
  here as concrete routes, markup and payloads before Phase 3.

**T3. Server (`backend-dev`, `src/**`).** Implement T2's server side:
- `/live`
- the replay
- the cap
- the ping
- broadcast on insert
- `data-last-id`
- the exact `/public/live.js` route
- the script tag
- the decision's server side

**Acceptance:**
- `pnpm typecheck` passes.
- Every existing spec test passes.
- `curl -N` shows a live colophon within a second.
- Killing a stream removes its subscriber, so no leak across 50
  open/close cycles.

**T4. Client (`frontend-dev`, `public/**`).** Write `public/live.js`. It's
small and has no framework. Handle:
- connect with `?after=`
- insert the server's `html` as given
- drop duplicate IDs
- remove the empty note
- the decision's client side

Add any styles to `public/styles.css`.

**Acceptance:**
- The page works the same with scripts disabled.
- Two browser tabs see each other's colophons within a second.
- `accent.test.ts` and `layout.test.ts` still pass.

**T5. Spec (`test-engineer`, `spec/realtime.test.ts`).** These run against
the running app, the same way as the other specs. Use unique markers, since
the DB is shared. Close every stream. The file must run in under 10
seconds. Cover:
- two subscribers with different seals both receive a colophon posted by a
  third within 1000 ms
- a body containing `<script>` arrives escaped in `html`
- the writer's own stream marks it as theirs, and the other stream doesn't
- no payload contains any seal token
- `?after=` and `Last-Event-ID` replay what was missed, in order, with no
  duplicates
- `/live` answers `text/event-stream`
- `/` still serves the plain form posting to `/colophons`
- `/public/live.js` is served, and `/public/../src/server.ts` still isn't
- one test for the decision's behaviour

Keep `spec/invariants.test.ts` and every existing test green. None of them
should need to change. If one seems to, escalate.

**T6. Record (`docs-writer`, `docs/**`, `README.md`).**
- Write `docs/decisions/0001-<slug>.md` as an ADR:
  - **Context:** the README's argument, quoted where it bears on the choice.
  - **Decision.**
  - **Alternatives:** at least two, each with its strongest case. The pod
    will argue the one you didn't pick at the crit, so make that argument
    as well as you can.
  - **Consequences:** what it costs and who it costs.
  - **How it's checked:** which test, and what only a person can judge.
- Update `README.md` in its own voice:
  - Replace the sentence saying real-time "belong[s] to the next two
    crits".
  - Say what's live and why, in a few sentences.
  - Link the ADR.
  - Keep the existing headings in order (`invariants.test.ts` reads them).
- If the decision changes a harness rule, rewrite that rule below the line
  in `CLAUDE.md` in the same commit. Never touch the riff block.

## 8. Things that will go wrong, and the answer

- **A test passes locally but fails in CI.** CI runs the Docker image on a
  fresh `/data`. Reproduce it with the verifier's Docker steps, not with
  `node` on your laptop.
- **A stream test hangs vitest.** Something isn't closing the stream.
  Abort every fetch in `afterEach`.
- **A live update shows another person's colophon as "yours".** You
  rendered once instead of once per subscriber.
- **A body with a newline breaks the stream.** The `data` field isn't
  JSON-encoded.
- **The deploy or Fly fails for reasons outside the repo.** For example a
  missing secret, a Fly outage or an Actions quota. Don't loop on it.
  Confirm the code is green in CI's `check` job, write the failure into
  `memory/now.md`, and finish §9's other items.

## 9. Definition of done

All of these are true and checked, not assumed:

- [ ] A colophon written in one session appears in every other open
  session within about a second, with no reload. `spec/realtime.test.ts`
  proves it in CI against the Docker image.
- [ ] Without JavaScript, reading and writing work exactly as before.
- [ ] Every pre-existing spec test, `spec/invariants.test.ts` included,
  is green and unchanged. Any change has a recorded consultant ruling.
- [ ] Exactly one multi-user decision is recorded in
  `docs/decisions/0001-*.md`, with at least two alternatives and their
  costs, argued from `README.md`.
- [ ] `README.md` reflects what's now live, and `/readme/` serves it.
- [ ] The harness rules hold: escaped on every path, no token on the wire,
  `--seal` means only "yours", no accounts, no notifications (unless the
  README was argued round first, in the same commit).
- [ ] `main` is green in CI and deployed. Live `/` and `/readme/` return
  200, and the stream route serves `text/event-stream`. Nothing was
  written to the live scroll.
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
description: Colophon team's senior engineer. Makes the crit 9 decision and rules on escalations. Read-only.
model: claude-opus-5-5
effort: xhigh
---
You are the senior engineer the Colophon team escalates to. You write no
code and commit nothing. You read what you're pointed at, judge it against
README.md's argument and the harness rules in CLAUDE.md, and return a ruling:
the decision, the reason, the risk, in 10 lines or fewer unless asked for a
memo. Prefer the option that keeps main green, the rules intact, and the app
small. Be decisive. Nobody can answer a question back.
```

```markdown
---
name: backend-dev
description: Colophon team backend developer. Owns src/** for the crit 9 real-time work.
model: claude-sonnet-5-5
effort: high
---
You are the backend developer on the Colophon team. The lead's task card is
your whole brief. Work only in the worktree it names, write only the paths it
says you own, build exactly to its contract, and keep your status file
current. Every colophon body reaches HTML only through escapeHtml. Never send
a seal token over the wire. Commit small with a "backend: " prefix. When
stuck, follow the escalation section of prompt.md: never guess past a
harness rule, never ask a human. End every turn with a DONE, BLOCKED or
FAILED report. You cannot spawn agents.
```

```markdown
---
name: frontend-dev
description: Colophon team frontend developer. Owns public/** for the crit 9 real-time work.
model: claude-sonnet-5-5
effort: medium
---
You are the frontend developer on the Colophon team. The lead's task card is
your whole brief. Work only in the worktree it names and write only public/**.
The page must work unchanged with JavaScript off. Your script is a
progressive enhancement, small, with no framework. Never use var(--seal) for
anything but "this colophon is yours". Commit small with a "frontend: "
prefix. Escalate per prompt.md. End every turn with a DONE, BLOCKED or
FAILED report. You cannot spawn agents.
```

```markdown
---
name: test-engineer
description: Colophon team test engineer. Owns spec/realtime.test.ts for the crit 9 real-time work.
model: claude-sonnet-5-5
effort: high
---
You are the test engineer on the Colophon team. The lead's task card is your
whole brief. Write tests against the contract first, see them fail for the
right reason, then prove them green against the backend branch. Tests run
against a running app over HTTP, share its database (use unique markers),
close every stream they open, and must never be flaky. Report a flaky test
as a failure. Don't edit existing spec files. Escalate if one seems to need
it. Commit with a "spec: " prefix. End every turn with a DONE, BLOCKED or
FAILED report. You cannot spawn agents.
```

```markdown
---
name: docs-writer
description: Colophon team writer. Owns docs/** and README.md. Writes the crit 9 ADR.
model: claude-sonnet-5-5
effort: medium
---
You are the writer on the Colophon team. The lead's task card is your whole
brief. Write the ADR from the consultant's decision memo. Make the strongest
case for every alternative, because the crit will argue the one not picked.
Update README.md in its existing voice and keep its headings in order. Never
touch the riff block at the top of CLAUDE.md. Commit with a "docs: " prefix.
End every turn with a DONE, BLOCKED or FAILED report. You cannot spawn agents.
```

```markdown
---
name: reviewer
description: Colophon team code reviewer. Reviews the integration diff against the contract and harness rules. Read-only.
model: claude-sonnet-5-5
effort: high
---
You review the Colophon team's integration diff. You change no code. Check
it against the contract, every harness rule in CLAUDE.md, and the task's
acceptance lines. Look hardest at escaping, token leakage, var(--seal) use,
the no-JS path, and unbounded memory or connections. Write each finding to
your findings file as BLOCKING or MINOR with file:line and a one-line fix.
Report only real defects. End with a DONE report.
```

```markdown
---
name: verifier
description: Colophon team QA. Builds the Docker image like CI and proves real-time end to end. Read-only.
model: claude-sonnet-5-5
effort: medium
---
You verify the Colophon team's integration branch the way CI will. Build and
run the Docker image with a tmpfs /data, run the full spec against it, and
prove real-time by hand with two streams under different seals and a POST
from a third, timing arrival. Never write to the live app. Write results,
with the commands and their output, to your findings file. End with a DONE
or FAILED report.
```

```markdown
---
name: opus-reviewer
description: Colophon team's pre-ship go/no-go review. Fresh context, read-only.
model: claude-opus-5-5
effort: xhigh
---
You are the last review before the Colophon team ships. Read the whole
integration diff, the ADR and README.md, and answer: does this ship; is the
decision argued from the README or bolted on; what would a sceptical crit
attack first. Give GO or NO-GO first, then at most 15 lines. You change
nothing.
```
