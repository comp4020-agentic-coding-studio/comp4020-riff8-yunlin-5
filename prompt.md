# Add in-match instructions and a pause/leave menu to 墨鬥 Mòdòu

Written for one unattended agent run. Nobody will read your questions or
answer them, so this file is the whole brief. The riff block at the top of
`CLAUDE.md` still governs:

- keep `main` deployable
- leave that block exactly as it is
- delete this file in your last commit

## 0. Ground rules for an unattended run

- **No one is there.** Never ask a question and never end your turn waiting
  for a reply. Where you would ask, make the call yourself, write down why in
  your final commit message or `memory/now.md`, and keep going.
- **This is a small, focused feature, not a rebuild.** Don't restructure the
  sim, the protocol or the render loop to fit it in. The existing UI overlay
  pattern (`public/ui.js`, plain DOM, `textContent` only, one ink colour for
  what asks for action) is what you extend.
- **Read before you touch anything:**
  - `README.md`, `CLAUDE.md` (the harness rules below the riff block)
  - `docs/decisions/0001-grace-then-forfeit-on-drop.md`
  - `public/ui.js`, `public/game.js`, `public/input.js`, `public/net.js`,
    `public/styles.css`
  - `src/net/rooms.ts`, `src/net/protocol.ts` (how the lobby/match/results
    phases and the drop grace actually work server-side)
  - `spec/README.md` and a couple of existing specs under `spec/` for the
    house style (`spec/stage.test.ts`, `spec/drop-reclaim.test.ts`)
- Confirm `pnpm check` is green before you change anything, and again before
  your last commit.

## 1. What to build

Two related pieces of UI, both client-side, both reachable without leaving
the current match:

### A. Instructions (keybindings)

A player should be able to see the controls at any time without guessing.
Today the lobby already shows a one-line `helpEl` hint
(`public/ui.js`'s `helpText`), but there is no in-match way to see it, and
it's a dense single paragraph rather than something scannable.

- Add a small "Controls" / "?" affordance visible during a match (not just
  the lobby) that opens a readable keybindings reference: movement, jump,
  attack, special, shield, fast-fall/drop-through, and the guest's second
  keymap when a guest is seated, plus the touch and gamepad equivalents.
  Reuse the facts already in `helpText`; present them as a list, not a
  wall of text.
- It must not require leaving the match or interrupting the game for other
  players: opening it should not pause anyone's game (that's a separate
  feature, part B) and should be dismissible with one tap/click or Escape.
- It must work for a spectator too (so they can learn controls before they
  get a seat) and must not show controls for a scheme that isn't relevant
  (e.g. don't show the guest keymap when there is no guest).
- Follow the existing colour rule in `CLAUDE.md`: nothing new gets its own
  colour; reuse `--seal` only for the thing that asks for action (the
  open/close affordance), and keep the ink-wash/paper look.

### B. Pause and leave (go back)

There is currently no way for a player to step out of a match on their own
terms: the only states are playing, a hidden tab (which starts the 15 s
drop grace per ADR 0001), or forfeiting by waiting it out.

**Read `docs/decisions/0001-grace-then-forfeit-on-drop.md` before writing
any code here.** It already rejected "pause everyone" as the drop-handling
rule, for reasons that still hold (one flaky phone can't freeze three other
people's game). This feature does **not** reopen that decision and must not
freeze the simulation for other players. What you're building is a
**local** pause: a menu on the requesting player's own screen, for their own
convenience, that:

- opens a menu overlaying the game (reuse or extend the `blocked`-style
  full-panel overlay pattern in `public/ui.js`, or add a sibling to it) with
  at least:
  - **Resume** — closes the menu, play continues exactly as before
  - **Instructions** — opens part A's keybindings view from inside the menu
  - **Leave** — the player's own "go back" exit (see below)
- while the menu is open, the requesting player's own inputs stop being
  sent (don't fight the server's physics by sending stale or garbage
  input), but the match keeps simulating and snapshotting for everyone
  else, same as it does today when a tab is merely in the foreground but
  idle. Do not add a new server message type that stops the sim loop.
- is reachable with a key (Escape is the natural choice; make sure it
  doesn't collide with any bound game key in `public/input.js`) and with a
  touch affordance for phones, matching the existing touch-first design in
  that file.
- **Leave** takes the player back to a sensible, safe place — at minimum,
  back to this room's lobby view/landing, not an error page or a dead
  screen. Decide yourself exactly what "leave" closes or disconnects
  (e.g. the socket, same as backgrounding today) and make the resulting
  server-side behaviour match an existing, already-decided path (the drop
  grace in ADR 0001) rather than inventing a new one. If "leave" needs the
  server to treat it any differently from a plain socket close, that is a
  new decision and needs its own short note — don't make that call lightly;
  prefer reusing the existing drop/forfeit path if it already does the
  right thing.
- A spectator's version of this menu doesn't need a "pause" or "leave the
  fight" framing since they aren't in it, but should still be reachable and
  should still offer instructions and a way to close the tab/room view
  cleanly if you add one — don't overbuild this part, a bare-minimum
  working version for spectators is enough.

**What not to do:**
- Don't let a paused player's fighter sit on stage, immune to physics, while
  everyone else gets stuck — that's exactly the frozen-game-for-everyone
  problem the ADR already rejected the global version of.
- Don't touch `src/sim/**`'s pure, deterministic simulation to add a pause
  concept to it. If the fix belongs in `src/net/rooms.ts` or
  `src/net/protocol.ts` because "leave" needs a real new client→server
  message, keep it to the smallest possible addition and validate it the
  same way every other message is validated (type, ranges, size cap) per
  the harness rules in `CLAUDE.md`.

## 2. Feedback loops: verify as you go, don't just ship a diff

Build this in small steps and check each one before moving to the next,
rather than writing everything then testing once at the end:

1. **After wiring the instructions panel:** open it, read it back to
   yourself for a real device (does the guest keymap only show when a
   guest exists? does the touch wording match `public/input.js`'s actual
   touch button labels? does the blurb list match the gamepad mapping in
   `pollPad`?). Fix any mismatch you find before moving on.
2. **After wiring the pause menu:** run a scripted check (either a new
   `spec/` test using the existing WebSocket test helpers in
   `spec/helpers/`, or, if the behaviour is purely client-side with no new
   wire message, a manual check you can describe) that confirms: opening
   the menu stops that player's inputs from being sent, other players'
   snapshots keep advancing while the menu is open, and resuming puts input
   flowing again with no leftover stuck button state. If you add a new
   message type, write a `spec/` test for it the way `spec/stage.test.ts`
   or `spec/drop-reclaim.test.ts` test theirs: a scripted client, not just
   reading the code.
3. **After wiring "leave":** actually run the check — two scripted clients
   in a room, one leaves mid-match, confirm the drop grace / forfeit
   behaviour documented in ADR 0001 is what happens (it already has tests;
   if "leave" reuses the existing close path, those tests already cover
   you — point to them, don't just assume it; if you added new behaviour,
   add a new test).
4. **Before your final commit, run the full loop, not a subset:**
   - `pnpm check` (typecheck + the whole spec suite) must be green.
   - Manually trace the new UI code paths once more against
     `public/styles.css` and `CLAUDE.md`'s colour rule: grep for any new
     colour literal you introduced and justify it or remove it.
   - Confirm the instructions panel and pause menu both still work for:
     a solo player, a player with a local guest seated, and a spectator.
     If you can't run a real browser, reason through each state explicitly
     in your final summary rather than skipping it silently.
   - Re-read your own diff once, cold, as if reviewing someone else's PR:
     does it touch any file outside `public/**`, `src/net/**` (only if you
     added a message), and `spec/**`? If so, justify why in your summary.

If any check fails twice in a row after an honest fix attempt, don't loop
on it a third time blindly — step back, reconsider whether the approach is
right, and if it's genuinely a judgment call with more than one reasonable
answer, make the call yourself, record the reasoning, and move on. Nobody
is there to break the tie for you.

## 3. Definition of done

- [ ] A player mid-match can open a readable, accurate keybindings
      reference without pausing or leaving the match, and close it again.
- [ ] A player mid-match can open a local pause menu (Resume / Instructions
      / Leave) that stops only their own input from being sent, without
      freezing the simulation for anyone else.
- [ ] "Leave" returns the player to a working lobby/landing view, and its
      effect on the match (drop grace, forfeit) matches or extends
      `docs/decisions/0001-grace-then-forfeit-on-drop.md` rather than
      silently diverging from it.
- [ ] Spectators have a working, if minimal, equivalent.
- [ ] Both features work with keyboard, touch and (if reasonably in scope)
      gamepad, matching the existing input model in `public/input.js`.
- [ ] No new colour literal outside the rule in `CLAUDE.md`; chrome stays
      ink-wash, vermilion is still only for what asks for action.
- [ ] `pnpm check` is green.
- [ ] Any new spec test lives under `spec/**` in the existing style, closes
      every socket it opens, and doesn't touch `spec/invariants.test.ts`.
- [ ] `memory/now.md` is updated with a short hand-off: what you built,
      any judgment call you made without being able to ask, and anything
      you left for a human to actually play-test on a phone.
- [ ] The last commit deletes `prompt.md`.
