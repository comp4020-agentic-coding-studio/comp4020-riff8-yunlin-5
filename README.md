# 墨鬥 Mòdòu

An online fighting game for up to four people in one room, each on their own
phone or laptop, all on one live URL. Brush-ink fighters brawl on a painted
handscroll stage until one is left standing. The name is "ink contest"
(墨 ink, 鬥 to vie), and puns on 墨斗, the carpenter's ink line that snaps one
straight black mark onto wood. Nobody has an account, a name or a profile:
each player is a seal glyph, and that is all anyone else sees of them.

## What good means here

The people are in the room. They are not strangers on a ladder; they are
sitting a metre apart, looking at each other as much as at a screen. That
sets the bar. The screen's job is to be legible at a glance, so a glance from
across the sofa tells you whose fighter is whose, how hurt they are and who
just got launched. The game's job is to be fair enough to laugh about: a
loss should be funny rather than feel stolen, which is why simultaneous hits
trade and nobody gets a win from a technicality. Latency has to stay well
under a second, because a delay that long is the difference between "I hit
you" and "the game says I did". The server decides everything and the clients
smooth over the gaps by drawing slightly in the past.

The part that took the most thought is the dropped phone. Phones drop, and a match for four shouldn't be wrecked because one of them did. A player who
vanishes gets a grace period to come back as themselves, and the room can see
it happening. That falls out of the world this repo already had: a handscroll
is a shared object that many people have marked over time, each with a seal
and no biography. The game is a way of being together, so
the room matters more than the result. Presence without identity is enough
to do that: the same seal coming back is the same person.

## How to play

Open the page, make a room, and send the four-letter link (`/r/ABCD`) to the
people you're with. Up to four can fight, humans or computer-controlled;
anyone beyond that watches, and anyone who arrives mid-match watches until
the next one. There are four fighters: Great Brush (巨筆), the heavy brush-master; Seal
Carver (刻印), light and fast, with a dashing special; Ink Blot (潑墨), a zoner
whose special is arcing ink blots; and Wanderer (遊士), the all-rounder with
a staff.

On a laptop: A/D or the arrow keys move; W, up or space jumps (jump again in
the air); S or down fast-falls, or drops through a platform; J attacks (hold
a direction on the ground for a strong attack); K is your special; L shields.
On a phone, hold it in landscape: a stick under the left thumb, buttons under
the right. A gamepad works too, on the standard layout: A jumps, X attacks,
B is your special, and the shoulders shield.

Two people can share one device: in the lobby, "Add a second player here"
seats a local guest with their own seal glyph. With a guest, the first player
uses WASD (W or space jumps), J attacks, K is special and L shields; the
second uses the arrows (up jumps, down fast-falls), `,` to attack, `.` for
special and `/` or right shift to shield. A second gamepad drives the guest.
After a match, "Watch the last match" in the lobby replays it from the inputs
the server recorded; the simulation is deterministic, so the replay is exact.
Only the last match per room is kept, and nothing outlives the room.

Pick a stage in the lobby. Riverbank has a wide ledge and three brush-stroke
platforms. Pine cliff is a narrower cliff with a leaning pine whose branches
are the platforms, and its side blast zones are tighter. To play alone, add a
computer-controlled fighter from the lobby.

Damage climbs as you're hit, and the more damage, the further a hit throws
you. Get launched past the edge of the stage and you lose a stock. Everyone
has three; the last one standing wins. Fall just short of the edge and
you'll catch it (the ledge assist lifts you onto the corner). Ink pots drop
onto the stage now and then: touch one and your next 8 seconds of attacks
deal 1.4 times the damage. A match lasts at most four minutes; if time runs
out, the most stocks wins, then the least damage. Finished matches are saved (winner's
seal, who fought, KOs, how long it took) and survive restarts. Rooms
themselves don't.

## What I chose not to build

No accounts, names, avatars or chat. Nothing a player types is ever shown to
anyone, because there is nowhere to type. No ranked ladder, no matchmaking,
no stats beyond the saved match history. No pausing the match for
someone who has dropped: the others would pay for it. No way to edit or undo
a result. Rooms don't persist; only the history does. There is no
client-side prediction with rollback: it would need a build step or a second
copy of the simulation, so your own fighter is simply drawn from the newest
snapshot.

## What's enforced, what's judged

`spec/` checks the things that can be checked: the simulation is
deterministic, a drop followed by a return inside 15 seconds gets the fighter
back, 900 ticks of silence ends in forfeit, bad or oversized WebSocket
messages are rejected without taking the server down, the home page
explains itself without JavaScript, picking a stage in the lobby changes
where the fighters stand, a tap shorter than one tick of the simulation
still lands, and a second socket with the same seal takes the seat over (`spec/stage.test.ts`, `spec/input-latch.test.ts`,
`spec/seat-takeover.test.ts`), a local guest seat works (`spec/guest.test.ts`), and
a replay's final frame equals the live match's last frame (`spec/replay.test.ts`). The colour rule in `CLAUDE.md` (a slot's ink
identifies a player, vermilion asks for action or attention, links are blue,
nothing else is coloured) is kept by reading, not by a test.
Whether the game is fun, whether the fighters feel different from one another
and whether 15 seconds is the right grace on a phone in a real room are for
people to judge by playing.

## The decision

When a player drops, their fighter lifts off the stage, can't be hit, and
waits 15 seconds with a faint seal and countdown. The same seal returning in
time reclaims it, with damage and stocks intact; otherwise they forfeit, and
the match can't end while anyone is waiting. The alternatives I weighed were
pausing everyone, handing the fighter to the computer and forfeiting at
once; the case for each, and what this costs, is in
[the decision record](docs/decisions/0001-grace-then-forfeit-on-drop.md).
