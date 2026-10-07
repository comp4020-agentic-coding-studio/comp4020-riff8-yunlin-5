# This repo is a pod riff: pods write the prompt, the agent does the work

This repo is a copy of [`comp4020-final-yunlin`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yunlin) at
`27036a72` --- yunlin's crit agent's final project as it stood at
`08-its-alive`. Their repo is untouched and off limits. From here to the end of
semester, each crit a pod picks this repo up from wherever the last run left
it.

**Pods: the only file you change is `prompt.md`, at the repo root.** Read the
live app, the code and the history, then write the prompt that would take
this app to a strong, interesting answer to the next brief (the crit runsheet
links it). The prompt can point at any file here. After the session,
yunlin's crit agent runs `prompt.md` once, unattended, start to finish, and
nobody is there to answer its questions --- so say what you want, what good
looks like and what to leave alone. Push it before you leave.

**Crit agent: when `prompt.md` exists, it is your brief.** Run it to
completion in one go, keep `main` deployable, and delete `prompt.md` in your
last commit. Leave this block of `CLAUDE.md` as it is.

**Nothing here is marked.** No cutoff, no reflection, no `PROCESS.md` entry.
The next crit opens by looking at where each pod repo ended up, beside the
prompt that got it there (the `prompt-crit<N>` tag).

**The agent's own spec tests are `spec/accent.test.ts`, `spec/colophon-concurrency.test.ts`, `spec/colophon.test.ts`, `spec/cookie-safety.test.ts`, `spec/layout.test.ts`, `spec/request-limits.test.ts` and `spec/static-files.test.ts`.** They encode the brief it was
working to, and they gate the deploy. A prompt aimed at a different brief can
have them changed or deleted; keep `spec/invariants.test.ts` green, since that
one is true of any good site.

Everything below this line was written for the agent's graded submission. Its
marks, cutoff and weekly skills don't govern this repo: read it for how the
agent was directed, not for what anyone owes.

---

# Your harness

Rules for working on 墨鬥 Mòdòu, derived from what `README.md` argues good
means here. If a change would break one, the argument in `README.md` changes
first, in the same commit.

- No accounts, names, avatars or profiles. A player is their seal glyph,
  derived from an anonymous per-browser cookie, and nothing else. Never send
  a token over the wire.
- Nothing a user types is rendered; there is no free text. If free text is
  ever added, it goes through `escapeHtml` before reaching any template.
- Every WebSocket message is untrusted: validate type and ranges, cap it at
  1 KB, rate-limit it, and close sockets that misbehave. No exception may
  escape a handler or the game loop.
- `src/sim/` stays pure and deterministic: no `Date`, `Math.random` or I/O.
- `/` explains itself without JavaScript.
- One accent colour, vermilion `--seal`, the colour of the seal stamp. Don't
  add a second colour; if `--seal` starts meaning several unrelated things,
  the design has drifted. Grep for every use before claiming otherwise.
- A player who drops gets the 15 s grace in
  `docs/decisions/0001-grace-then-forfeit-on-drop.md`. Change that file
  before changing the behaviour.
- When a check finds a real bug, the fix is a new `spec/` test or a rule in
  this file, not just a patched line.
