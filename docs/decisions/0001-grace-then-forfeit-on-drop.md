# 0001: grace, then forfeit, when a player drops

Status: accepted. 2026-10-07.

## Context

Mòdòu is a four-player fighter played by people in one room, each on their
own phone. Phones drop: a tab is backgrounded, the wifi hiccups, a thumb hits
the browser's back gesture. Something has to happen to that player's fighter,
and whatever it is, it is a rule of the game, not an implementation detail.
The README's argument for what good means here:

> Phones drop, and a match for four shouldn't be wrecked because one of them did.

The fighter must not stand there being hit by people who can see their friend
fumbling for a signal, and the other three must not be held hostage by one
phone. The repo's own idea is presence without identity: a player is a seal
glyph derived from an anonymous cookie and nothing else. The same seal coming
back is the only evidence we have that it is the same person, and that is
enough.

## Decision

When a player's socket closes mid-match, their fighter enters a 15 second
grace period (900 ticks of the 60 Hz sim):

- the fighter's ink lifts off the stage: no physics, no hurtbox, it cannot be
  hit;
- their HUD seal goes faint with a countdown, so everyone in the room can see
  who is in trouble and for how long;
- the same seal cookie reconnecting within the 15 seconds reclaims the
  fighter, which respawns with invincibility, keeping its damage and stocks;
- after 15 seconds the player forfeits: stocks go to zero and the match
  carries on without them;
- the match cannot end while anyone is in grace, so a drop never hands anyone
  a win by default before the 15 seconds are up.

- a fresh socket with the same seal takes the seat over and the old socket is
  closed, because a phone switching from wifi to 4G can leave a half-open
  socket alive for longer than the grace period.

The server keeps a token-to-slot map to match returning cookies. It never
sends it.

Defaults for the other open questions: simultaneous hits trade (both land),
and anyone who joins mid-match spectates until the next match.

## Alternatives

**Pause everyone.** Strongest case: it is the only option that costs the
dropped player nothing, and in a room full of friends that is the whole
point. Nobody is robbed, nobody wins on a technicality, and the people in the
room can shout "wait, Jo's phone died" and mean it. It also needs no timer
and no special "absent" state in the sim, just a frozen clock. Against it: one
flaky phone can freeze three other people's game indefinitely, and it needs a
second rule for when to give up waiting, at which point it has become this
decision with a longer timeout.

**Hand the fighter to the CPU.** Strongest case: the match stays a match. The
stage stays full, the other players keep fighting something that moves, and
the dropped player returns to a fighter that has been looked after and can
take it back. CPU fighters already exist for filling empty slots, so it is the
least new code. Against it: a CPU playing someone else's fighter changes who
is winning, in ways the absent player did not choose and cannot be blamed for,
and it blurs the line between a person and a stand-in on a game whose only
identity is the seal.

**Forfeit at once.** Strongest case: it is the simplest rule a person can
hold in their head, with no limbo state, no lull, no clock to read. Every
other player gets a clean, fast match, and there is no way to abuse a grace
period. Against it: a one-second wifi blip ends a player's whole match, which
is exactly the wreck the README says should not happen, and phones drop far
more often than laptops.

## Costs

- The dropped player pays: they lose their momentum and position, and after
  15 seconds their match is over.
- The others pay a lull of up to 15 seconds in which one fighter is absent and
  the match cannot end.
- Deliberately dropping to dodge a finishing blow is possible. It is bounded
  (15 seconds, then forfeit) and visible (the faint seal and countdown tell
  the whole room what happened), which is the deterrent a room of friends
  needs.
- One seal holds at most its own seat plus one local guest seat, and takeover
  and reclaim move both together. Two tabs in the same browser cannot both
  play (use another browser or profile).
- The server holds a token-to-slot map for the life of the room. It never
  leaves the server.

## How it's checked

- `spec/drop-reclaim.test.ts`: a scripted WebSocket client drops, then
  reconnects with the same seal cookie within the grace period and gets its
  fighter back.
- `spec/seat-takeover.test.ts`: a second socket with the same seal takes the
  seat and the first is closed.
- `spec/sim.test.ts`: 900 ticks of null input from an absent fighter end in
  forfeit and the other fighter wins.

What only a person can judge: whether 15 seconds feels right, on real phones,
in a real room. Too short and a tunnel ruins a match; too long and the other
players sit through it. That is a call for people playing it.
