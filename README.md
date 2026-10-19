# Popo's Parallelogram Net

A browser game for Grades 1–2 about parallelograms. Popo the polar bear fishes with a net
hung from a winch on his raft. Before he lowers it, the child fixes its shape: three corners
A, B, C, D are fixed and one glows; the child drags that corner until the net has the property
the level asks for and presses Drop Net. A right net goes down
over the school, the fish are netted, hauled up and tipped into the bucket, and Popo winds
the net up and lets the next one down. A wrong net goes down all the same, but the catch
thrashes, tears through it and dives back into the sea. Eight nets teach the properties one
by one, then a final card: "Parallelogram Pro!" with the five properties named one at a time.

## Run

Plain HTML, CSS and JavaScript (canvas, WebGL for the water, Web Audio; no build step and no
dependencies). Double-click `index.html` to play, or serve the folder over HTTP:

```
python3 -m http.server 8000
# then visit http://localhost:8000/
```

Append `?debug` to expose `window.popoDebug = { state, game }`. Append `?dev=1` for a small
panel of screen jumps (bottom left): title, intro, each of the eight levels, put the current
net's corner in its place, drop it, row on, and the final screen. Number keys 1–9 and 0 press the first ten buttons;
the backtick key folds the panel away.

## Deploy

The folder is a static site. On Vercel, import the GitHub repository and deploy with no build
command; `vercel.json` sets long cache headers for `assets/` and `.vercelignore` leaves the
original artwork, voice recordings and tools out of the deployment.

## The game

- **Flow.** Title → Popo rows in (honk, screech, boing, poof) with the net wound up in a
  bundle under the boom → three narrator lines, the first school swims in on the last one →
  Popo lets the net down and it opens into its first frame → level 1. After each catch the fish
  hop into the bucket, Popo winds the empty net up into its bundle, rows on when the next level
  is in new waters (levels 1–2, 3–4, 5–6 and 7–8 are in the four locations), and lets the net
  down in its new shape as the next school swims in. After level 8, the final card with Play
  Again, which goes straight to level 1. The page gets a `popo:complete` event (and a
  `postMessage` when framed).
- **Phases** (`src/state.js`): one phase at a time decides what input is allowed: title,
  intro, puzzleReady, dragging, correct, netLowering, catching, netRaising, netBreaking,
  levelComplete, transitioning, gameComplete. Pause is a flag over the top.
- **Levels** (`src/levels.js`): eight nets, each teaching one property with its own check
  (`type`): 1 make AB parallel to CD, 2 make BC parallel to AD, 3 make CD 6 m like AB, 4 place
  C so CD = AB and BC = AD, 5 make angle C equal angle A (70°), 6 make angle B supplementary
  to angle A (65°), 7 make the diagonals bisect each other, 8 make the net a parallelogram
  with no property named. Each level gives the solved net's width, height and lean (or the
  angle at A), the corner that moves and where it starts, an optional line it moves along (so
  a length or angle level changes only that), the side whose length in metres sets the
  measurement scale, the fish count (3, 4, 4, 5, 5, 6, 7, 9), the prompt, the praise and the
  hint a wrong net gives. The final level's school is rare: golden, quicker, trailing glints.
- **Geometry** (`src/geometry.js`, `src/net.js`): plain vector helpers (parallel by the
  normalised cross product, so vertical sides are no trouble; interior angles; the diagonals'
  intersection; area and self-intersection). Corners A, B, C, D in order make a parallelogram
  exactly when A + C = B + D, so the movable corner's place follows from the other three;
  the check for each level uses the real measurements with child-sized tolerances (about
  3.5° of parallel, a quarter metre, 3° of angle). While dragging, the corner is kept inside
  its limits and off bow ties, and it goes exactly where the child puts it: nothing pulls it
  toward its place, nothing glows when it's right, and nothing completes until the child
  presses Drop Net. Positions
  are net coordinates measured from the lifting ring, and the whole stage scales to the
  screen, so metres and degrees are the same everywhere and survive a resize.
- **Stage.** The world is a fixed 1672x941 logical space scaled to the viewport. The paintings
  have their waterline 41% down, so they are drawn `SCENE_SHIFT` lower (the water pass carries
  the sky on above them), putting the water at about 60% and leaving the sky to the net.
- **Teaching the shape.** Every level shows only what it is about: parallel ticks that turn
  green when a pair lines up, side lengths in metres (references fixed, the rest live), angle
  arcs with degrees, or the diagonals with O and their four halves; vertex labels A–D are always
  there. Drop Net looks the same whether the frame is right or not; pressed with the property
  (within child-sized tolerances), it locks the exact answer with a small click into place,
  lights the property with its praise, and the net goes down for the catch.
  Pressed with a wrong frame, the net goes down all the same: the netted fish thrash until the
  mesh tears, then wriggle out and dive back into the sea; the level's hint shows while Popo
  winds the torn net up and lets it down mended, in the shape the child left it, and its corner
  wobbles to say it's the one to fix.
- **Hints.** Left alone, the first net shows the hand dragging once toward the corner's
  place; later nets swell their measurements instead (the supplementary level shows
  65° + ? = 180° once the child starts), so the game teaches rather than solves itself. No hint
  says whether the net is right; Drop Net does.
- **HUD.** Narration follows the Fishing Frenzy games: the instruction (prompt, praise, hint)
  and the narrator's lines sit on one translucent navy plate with a faint gold rim, white
  text and the key word in gold, fitted to the words (a line that wraps is balanced and the
  plate hugs it). Popo's own lines are its cream speech bubble with dark ink and an orange key
  word, growing word by word with its line breaks pinned. Sound and pause are its round orange
  icon buttons. Drop Net, the one action, is a chunky game button bottom right: a sunny face
  with dark-brown outline, label (about 10:1 contrast) and a lip it presses down onto, the net
  icon in a badge; it pops in and a shine sweeps it now and then.
  The pause and final cards' buttons match it.
- **The winch** (`src/winch.js`): the generated arched machine (`assets/generated/winch-arched.png`)
  drawn whole at one scale on the raft's deck, its end pulley out over the water where the
  net hangs. Popo (`assets/generated/popo-operating.png`, four poses of him turning a
  handwheel, registered on the wheel's shaft so it stays on the drum's axle) changes pose
  with the drum as rope pays out or winds in. Every rope the game draws (the lifting rope,
  the sling to the net's top corners) is one twist of the generated rope (`rope.png`) tiled
  along the line, and the net hangs from the generated brass shackle (`rope-connector.png`).
- **The net's look**: the generated net texture (`assets/generated/net.png`, rope frame,
  floats and weights) is warped onto the frame triangle by triangle, cached per shape, so it
  deforms with the puzzle and rides with the raft for free. Wound up, it is drawn gathered
  toward its sling (narrow and short) under the pulley while the drum and Popo's wheel turn;
  torn, a ragged hole is cut out of the mesh with frayed, dark-edged strands around it and
  bits flung out as it rips (the frame holds).
- **Fish** (`src/fish.js`): the natural cartoon fish of `asset/fish-natural-*.png`, drawn in
  vertical strips that ripple head to tail so they visibly swim. A level's school swims in
  from the edges and keeps to the water under the net; as the net comes down they slow and
  turn back under it; those inside the frame are netted and rise with it.

## Layout

- `index.html`, `src/` – the game. Classic scripts sharing the `PopoGame` namespace, loaded in
  dependency order from `index.html`. `game.js` orchestrates (levels, input, hints, drawing),
  `sequences.js` holds the opening, the drop (right or wrong), the catch and raise, a wrong
  net breaking, the net winding up and letting down, the row and the finale,
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

- `python3 tests/playthrough.py` – plays all eight nets with real pointer drags and the Drop
  Net button: a wrong net dropped anyway loses its catch and comes back mended with a hint,
  the corner stays where it's dragged (also through a mid-drag resize) with nothing giving the
  answer away, and Drop Net then locks the exact answer with its praise, every fish is netted, waters change, pause freezes
  the game, the final card appears, Play Again starts over.
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
  when a net breaks. While rowing he is the pre-rendered paddling stroke of the original
  art (`asset/popo-paddling-rig-source.png`), scaled to the seated character.
- The raft with its bucket comes from `asset/props-new.png`. The hint hand is `asset/hint-hand.png`.
- `asset/winch-concept.png` was the first machine concept and `assets/generated/winch.png` the
  second; the game uses the arched one, whose boom leaves room for the net.
- Each background gets a water mask: the surface waves move only open water, so the sky,
  mountains, ice shelves and icebergs stay still. The seaweed sway stops at the plant tips.
- The title banner and play button are built into `assets/` and embedded as data URLs so the
  canvas can use them from the file system.
