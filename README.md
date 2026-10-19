# Popo's Parallelogram Net

A browser game for Grades 1–2 about parallelograms. Popo the polar bear fishes with a net
hung from a winch on his raft. Before he can lower it, the child has to fix its shape: three
corners A, B, C, D are fixed and one glows; the child drags that corner until the net has the
property the level asks for, presses Check, and if the net is right, Drop Net lowers it over
the school, the fish are netted, hauled up and tipped into the bucket, and the next net
appears. Eight nets teach the properties one by one, then a final card:
"Parallelogram Pro!" with the five properties named one at a time.

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
  shape; when a level is in new waters Popo rows there first (levels 1–2, 3–4, 5–6 and 7–8 are
  in the four locations). After level 8, the final card with Play Again, which goes straight
  to level 1. The page gets a `popo:complete` event (and a `postMessage` when framed).
- **Phases** (`src/state.js`): one phase at a time decides what input is allowed: title,
  intro, puzzleReady, dragging, snapping, shapeCorrect, dropReady, netLowering, catching,
  netRaising, levelSuccess, transitioning, gameComplete. Pause is a flag over the top.
- **Levels** (`src/levels.js`): eight nets, each teaching one property with its own check
  (`type`): 1 make AB parallel to CD, 2 make BC parallel to AD, 3 make CD 6 m like AB, 4 place
  C so CD = AB and BC = AD, 5 make angle C equal angle A (70°), 6 make angle B supplementary
  to angle A (65°), 7 make the diagonals bisect each other, 8 make the net a parallelogram
  with no property named. Each level gives the solved net's width, height and lean (or the
  angle at A), the corner that moves and where it starts, an optional line it moves along (so
  a length or angle level changes only that), the side whose length in metres sets the
  measurement scale, the fish count (3, 4, 4, 5, 5, 6, 7, 9), the prompt, the praise and the
  hint a wrong Check gives. The final level's school is rare: golden, quicker, trailing glints.
- **Geometry** (`src/geometry.js`, `src/net.js`): plain vector helpers (parallel by the
  normalised cross product, so vertical sides are no trouble; interior angles; the diagonals'
  intersection; area and self-intersection). Corners A, B, C, D in order make a parallelogram
  exactly when A + C = B + D, so the movable corner's place follows from the other three;
  the check for each level uses the real measurements with child-sized tolerances (about
  3.5° of parallel, a quarter metre, 3° of angle). While dragging, the corner is kept inside
  its limits and off bow ties; inside the snap radius it is pulled toward its place and
  settles onto it when let go, but nothing completes until the child presses Check. Positions
  are net coordinates measured from the lifting ring, and the whole stage scales to the
  screen, so metres and degrees are the same everywhere and survive a resize.
- **Stage.** The world is a fixed 1672x941 logical space scaled to the viewport. The paintings
  have their waterline 41% down, so they are drawn `SCENE_SHIFT` lower (the water pass carries
  the sky on above them), putting the water at about 60% and leaving the sky to the net.
- **Teaching the shape.** The first net arrives as a parallelogram, its two pairs of
  parallel sides light up while the narrator says why, then a corner slips: the child's job
  is to put it back. Every level shows only what it is about: parallel ticks that turn green
  when a pair lines up, side lengths in metres (references fixed, the rest live), angle arcs
  with degrees, or the diagonals with O and their four halves; vertex labels A–D are always
  there. A right Check locks the exact answer and lights the property; a wrong one wobbles
  the corner, makes Popo think and gives a short hint without resetting anything.
- **Hints.** Left alone, the first net shows the hand dragging once toward the corner's
  place; later nets swell their measurements instead (the supplementary level shows
  65° + ? = 180° once the child starts), so the game teaches rather than solves itself. Once
  the net is ready, idling makes the hand tap on Drop Net.
- **HUD.** The instruction and the narrator's lines share one translucent water panel in the
  top band; the level pill shows the net count and a fish tally; Check and Drop Net sit
  bottom right (Check while solving, Drop Net armed once the answer is right).
- **The winch** (`src/winch.js`): the generated arched machine (`assets/generated/winch-arched.png`)
  drawn whole at one scale on the raft's deck, its end pulley out over the water where the
  net hangs. Popo (`assets/generated/popo-operating.png`, four poses of him turning a
  handwheel, registered on the wheel's shaft so it stays on the drum's axle) changes pose
  with the drum as rope pays out or winds in. Every rope the game draws (the lifting rope,
  the sling to the net's top corners) is one twist of the generated rope (`rope.png`) tiled
  along the line, and the net hangs from the generated brass shackle (`rope-connector.png`).
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
  `sequences.js` holds the opening, the Check, the drop/catch/raise, the row and the finale,
  `geometry.js` the vector helpers, `net.js` the net, its checks and measurements, `winch.js` the machine, `fish.js` the fish, `popo.js`
  Popo and the raft, `water.js` the WebGL water pass, `effects.js` bubbles, splashes and
  sparkles, `audio.js` the synthesised music and effects plus the recorded voice lines,
  `ui.js` the HUD and the corner's pointer handling, `levels.js` the level and story data.
- `asset/` – the untouched source artwork and voice recordings (not deployed).
- `assets/` – the compressed art the game loads, generated from `asset/`, and
  `assets/generated/` – Popo's poses, the winch, the rope and shackle, the net texture and
  the dialogue panel: generated images used whole (prompts in `tools/generated-art-prompts.txt`;
  the division of work with Codex, which makes them, is in `tools/CODEX-HANDOFF.md`).
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
`voiceKey` in `src/audio.js`), so the prompt, praise, hint and story lines in `src/levels.js`
find their recordings (lines with symbols, like ∠A = 70°, carry a spoken form in the script); the words of a line appear as they are spoken, the music ducks under
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

- `python3 tests/playthrough.py` – plays all eight nets with real pointer drags and the Check
  and Drop Net buttons: a wrong Check leaves the puzzle open, a right one locks an exact
  answer (also through a mid-drag resize), Drop Net arms only then, every fish is netted,
  waters change, pause freezes the game, the final card appears, Play Again starts over.
- `python3 tests/geometry.py` – every level's property holds exactly at the solved position and
  fails at the start, the start is a simple frame well outside the snap radius, the corner can
  reach its place, the net hangs clear of the water and the school's water is inside the
  lowered net.
- `python3 tests/rowing.py` – the paddling frames and a row to the next waters at three sizes.
- `python3 tests/ui_layout.py` – the HUD, pause and final cards stay inside the stage at
  three sizes, and the sound and pause controls work.
- `python3 tests/machine_animation.py` – the operating poses are whole, follow the drum both
  ways, and every level's corner can be dragged to its place clear of the raft.

## Notes on the art

- Popo's operating poses (`assets/generated/popo-operating.png`) were generated from the
  original character (`asset/popo-fishing-clean.png`, kept for reference; `popo.png` is the
  first rod-less take). He breathes from his seat, bounces when pleased and tilts his head
  when a Check is wrong. While rowing he is the pre-rendered paddling stroke of the original
  art (`asset/popo-paddling-rig-source.png`), scaled to the seated character.
- The raft with its bucket comes from `asset/props-new.png`. The hint hand is `asset/hint-hand.png`.
- `asset/winch-concept.png` was the first machine concept and `assets/generated/winch.png` the
  second; the game uses the arched one, whose boom leaves room for the net.
- Each background gets a water mask: the surface waves move only open water, so the sky,
  mountains, ice shelves and icebergs stay still. The seaweed sway stops at the plant tips.
- The title banner and play button are built into `assets/` and embedded as data URLs so the
  canvas can use them from the file system.
