# Popo's Parallelogram Net

A browser game for Grades 1–2 about parallelograms. Popo the polar bear fishes with a net
hung from a winch on his raft. Before he can lower it, the child has to fix its shape: three
corners are fixed, one glows, and dragging that corner until the frame is a parallelogram
makes the net ready. Drop Net lowers the whole net over the school, the fish are netted,
hauled up and tipped into the bucket, and the next net appears. Six nets, then a final card:
"You made parallelograms! Both pairs of opposite sides are parallel."

## Run

Plain HTML, CSS and JavaScript (canvas, WebGL for the water, Web Audio; no build step and no
dependencies). Double-click `index.html` to play, or serve the folder over HTTP:

```
python3 -m http.server 8000
# then visit http://localhost:8000/
```

Append `?debug` to expose `window.popoDebug = { state, game }`. Append `?dev=1` for a small
panel of screen jumps (bottom left): title, intro, each of the six levels, solve the current
net, drop it, row on, and the final screen. Number keys 1–9 and 0 press the first ten buttons;
the backtick key folds the panel away.

## Deploy

The folder is a static site. On Vercel, import the GitHub repository and deploy with no build
command; `vercel.json` sets long cache headers for `assets/` and `.vercelignore` leaves the
original artwork, voice recordings and tools out of the deployment.

## The game

- **Flow.** Title → Popo rows in (honk, screech, boing, poof) → three narrator lines, the first
  school swims in on the last one → the net lowers from the boom → level 1. After each catch
  the fish hop into the bucket and the next school swims in while the net morphs to its next
  shape; when a level is in new waters Popo rows there first (levels 1, 2–3, 4–5 and 6 are in
  the four locations). After level 6, the final card with Play Again, which goes straight to
  level 1. The page gets a `popo:complete` event (and a `postMessage` when framed).
- **Phases** (`src/state.js`): one phase at a time decides what input is allowed: title,
  intro, puzzleReady, dragging, snapping, shapeCorrect, dropReady, netLowering, catching,
  netRaising, levelSuccess, transitioning, gameComplete. Pause is a flag over the top.
- **Levels** (`src/levels.js`): each level gives the solved net's width, height and lean, the
  corner that moves (A top-left, B top-right, C bottom-right, D bottom-left), where it starts
  (an offset from its place, clearly wrong), how forgiving the snap is, how long before the
  hint, the number of fish and the instruction and praise lines. Levels vary the corner, the
  lean direction, the proportions and the count: 3, 4, 5, 6, 7, 8 fish.
- **Geometry** (`src/net.js`): corners A, B, C, D in order round the frame make a parallelogram
  exactly when A + C = B + D, so the movable corner's place follows from the other three
  (`targetOf`). While dragging, the corner is kept inside its limits (not into the water, not
  up to the boom) and never lets the frame fold into a bow tie; inside the snap radius it is
  pulled toward its place, and letting go there glides it home. The radius is a share of the
  net's shorter side (scaled per level), so it stays in proportion on every screen because the
  whole stage scales as one. Positions are net coordinates measured from the lifting ring, so
  lowering the net or the raft bobbing never changes the shape, and the solved frame stays
  solved through a resize.
- **Stage.** The world is a fixed 1672x941 logical space scaled to the viewport. The paintings
  have their waterline 41% down, so they are drawn `SCENE_SHIFT` lower (the water pass carries
  the sky on above them), putting the water at about 60% and leaving the sky to the net.
- **Teaching the shape.** Every net arrives as a parallelogram: its two pairs of parallel
  sides light up (the narrator says why over the first one), then one corner slips out of
  place and Popo gasps: the child's job is to put it back. While dragging, the sides carry
  parallel marks as in a geometry book (one chevron top and bottom, two left and right) that
  turn green, with a soft tick, the moment a pair lines up; the corner's glow turns green as
  it nears its place, and the frame flashes when the shape is right.
- **Hints.** Left alone for the level's hint delay (3.5 s on level 1, longer later), the hand
  appears on the glowing corner, shows the drag once along the way to its place, and fades.
  A corner let go away from its place just wobbles; after two such tries the hint comes
  sooner. Once the net is ready, idling makes the hand tap on Drop Net instead.
- **HUD.** The instruction and the narrator's lines share one translucent water panel in the
  top band; the level pill shows the net count and a fish tally that pops as each fish lands
  in the bucket; Drop Net sits bottom right, grey until the shape is right.
- **The winch** (`src/winch.js`): the generated wooden machine (`assets/generated/winch.png`) drawn
  whole on the raft's deck, scaled so its end pulley sits over the water where the net hangs.
  Its painted handle is left out and a long crank arm runs from the drum's axle into Popo's
  paws; while the winch works he leans in and pumps the arm in time with the drum, whose coil
  scrolls as rope pays out. The rope runs along the boom to the pulley and straight down to
  the ring, and two sling ropes from the ring carry the net's top corners.
- **The net's look**: the generated net texture (`assets/generated/net.png`, rope frame,
  floats and weights) is warped onto the frame triangle by triangle, cached per shape, so it
  deforms with the puzzle and rides with the raft for free.
- **Fish** (`src/fish.js`): the natural cartoon fish of `asset/fish-natural-*.png`, drawn in
  vertical strips that ripple head to tail so they visibly swim. A level's school swims in
  from the edges and keeps to the water under the net; as the net comes down they slow and
  turn back under it; those inside the frame are netted and rise with it. The shape fish of
  `fish.webp` only circle the play button on the title.

## Layout

- `index.html`, `src/` – the game. Classic scripts sharing the `PopoGame` namespace, loaded in
  dependency order from `index.html`. `game.js` orchestrates (levels, input, hints, drawing),
  `sequences.js` holds the opening, the snap, the drop/catch/raise, the row and the finale,
  `net.js` the net geometry and drawing, `winch.js` the machine, `fish.js` the fish, `popo.js`
  Popo and the raft, `water.js` the WebGL water pass, `effects.js` bubbles, splashes and
  sparkles, `audio.js` the synthesised music and effects plus the recorded voice lines,
  `ui.js` the HUD and the corner's pointer handling, `levels.js` the level and story data.
- `asset/` – the untouched source artwork and voice recordings (not deployed).
- `assets/` – the compressed art the game loads, generated from `asset/`, and
  `assets/generated/` – Popo, the winch, the net texture and the dialogue panel, generated
  images used whole (their prompts are in `tools/generated-art-prompts.txt`).
- `tools/build-assets.py` – rebuilds `assets/` and `src/sprite-data.js` (needs Pillow): the
  backgrounds and their water masks, the raft, the title fish and the natural fish (blue and
  teal ones are left out because they vanish against the water).
- `tools/build-voice.py` – records the voice lines into `src/voice-data.js` (below).
- `tools/build-rowing.py` – Popo's paddling rig (`src/rowing.js`, `src/rowing-data.js`);
  `tools/build-rowing-cycle.py` pre-renders one stroke of it into
  `assets/sprites/popo-row-cycle.webp`, which the game crossfades through while Popo rows
  (the rig's blade path still times the splashes).

## Voice-overs

The narrator and Popo are voiced. Each clip is keyed by speaker and on-screen text (see
`voiceKey` in `src/audio.js`), so the instruction, praise and story lines in `src/levels.js`
find their recordings; the words of a line appear as they are spoken, the music ducks under
the voice, and a line without a clip falls back to the synthesised blips. The shipped clips
were recorded locally with Kokoro-82M:

```
python3 -m venv ~/.cache/popo-voice311   # Python 3.10+
~/.cache/popo-voice311/bin/pip install kokoro soundfile lameenc
~/.cache/popo-voice311/bin/python tools/build-voice.py --engine kokoro   # records missing lines
```

They can also be recorded with Gemini text-to-speech (`GEMINI_API_KEY` in `.env`; see the
script). Edit a line in `LINES` and the game's text together, then run the script again.

## Tests

Headless Chromium through Python Playwright (`pip install playwright pillow`):

- `python3 tests/playthrough.py` – plays all six nets with real pointer drags and Drop Net
  clicks: a miss leaves the puzzle open, a drag onto the place snaps to an exact
  parallelogram (also through a mid-drag resize), Drop Net arms only then, every fish is
  netted, waters change, pause freezes the game, the final card appears, Play Again starts over.
- `python3 tests/geometry.py` – every level's solved frame is a parallelogram, its start is a
  simple, clearly wrong frame, the snap radius is child-sized on a tablet, the net hangs clear
  of the water and the school's water is inside the lowered net.
- `python3 tests/rowing.py` – the paddling frames and a row to the next waters at three sizes.
- `python3 tests/ui_layout.py` – the HUD, pause and final cards stay inside the stage at
  three sizes, and the sound and pause controls work.

## Notes on the art

- Popo (`assets/generated/popo.png`) was generated from the original character sheet
  (`asset/popo-fishing-clean.png`, kept for reference) without the rod; he is drawn whole,
  breathing, with a bounce for reactions. While rowing he is the pre-rendered paddling stroke
  of the original art (`asset/popo-paddling-rig-source.png`), scaled to the seated character.
- The raft with its bucket comes from `asset/props-new.png`. The hint hand is `asset/hint-hand.png`.
- `asset/winch-concept.png` was the first machine concept; the game uses the generated winch.
- Each background gets a water mask: the surface waves move only open water, so the sky,
  mountains, ice shelves and icebergs stay still. The seaweed sway stops at the plant tips.
- The title banner and play button are built into `assets/` and embedded as data URLs so the
  canvas can use them from the file system.
