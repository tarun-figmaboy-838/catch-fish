# Popo's Parallelogram Net

A browser game for Grade 8 about parallelograms. Popo the polar bear fishes with a net hung
from a winch on his raft. Before he lowers it, the child fixes its shape: three of its corners
A, B, C, D are fixed, and the fourth slides along a track, stop by stop, until the net has the
property the level asks for. Meanwhile a crowd of fish roams the whole sea, so the child
presses Drop Net when fish swim under it. A right net locks with its praise on the way down,
nets whoever is under it as it lands, closes into a bag (a potli) around them as it is hauled
up, and the fish hop into the bucket; one that lands on nothing comes up empty and can be
dropped again. A wrong net goes down all the same, but the catch thrashes, tears through the
bag and drops back into the sea. Eight nets teach the properties one by one, then a final
card: "Parallelogram Pro!" with the five properties named one at a time.

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
command; `.vercelignore` leaves the original artwork, voice recordings and tools out of the
deployment. Assets keep Vercel's default caching (revalidated on each visit): their names
never change, so a year-long cache would keep old art against new code.

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
  intro, puzzleReady, dragging, netLowering, catching, netRaising, netBreaking,
  levelComplete, transitioning, gameComplete. Pause is a flag over the top.
- **Levels** (`src/levels.js`): eight nets, each teaching one property with its own check
  (`type`): 1 make AB parallel to CD, 2 make BC parallel to AD, 3 make CD 6 m like AB, 4 place
  C so CD = AB and BC = AD, 5 make angle C equal angle A (70°), 6 make angle B supplementary
  to angle A (65°), 7 make the diagonals bisect each other, 8 make the net a parallelogram
  with no property named. Each level gives the solved net's width, height and lean (or the
  angle at A), the corner that moves, the side or diagonal its track runs along (`along`; a
  diagonal runs toward the opposite corner) and how many stops from its place it starts, the
  side whose length in metres sets the measurement scale, its fish (3, 4, 4, 5, 5, 6, 7, 9;
  the sea holds three times as many, at most 22), the prompt, the praise and the hint a wrong
  net gives. The final level's school is rare: golden, quicker, trailing glints.
- **Geometry** (`src/geometry.js`, `src/net.js`): plain vector helpers (parallel by the
  normalised cross product, so vertical sides are no trouble; interior angles; the diagonals'
  intersection; area and self-intersection). Corners A, B, C, D in order make a parallelogram
  exactly when A + C = B + D, so the movable corner's place follows from the other three.
  The corner never stretches freely: it slides along its track through that place and clicks
  from stop to stop (20 stage pixels apart, gliding onto each), at most 12 stops each way and
  only while the frame stays simple, roomy and clear of the raft and the water. One stop is
  its exact place, so each level's check is exact: the frame is right at that stop and only
  there, and only there do the numbers on the net match (tenths of a metre, whole degrees);
  `tests/geometry.py` checks every stop of every track. Nothing pulls the corner toward its
  place, and nothing completes until the child presses Drop Net. Positions are net
  coordinates measured from the lifting ring, and the whole stage scales to the screen, so
  metres and degrees are the same everywhere and survive a resize.
- **Stage.** The world is a fixed 1672x941 logical space scaled to the viewport. The paintings
  have their waterline 41% down, so they are drawn `SCENE_SHIFT` lower (the water pass carries
  the sky on above them), putting the water at about 60% and leaving the sky to the net.
- **Teaching the shape.** Every level shows only what it is about: parallel ticks that turn
  green when a pair lines up, side lengths in metres (references fixed, the rest live), angle
  arcs with degrees, or the diagonals with O and their four halves; vertex labels A–D are always
  there, and two little arrows beside the knob show which ways the corner slides (a tap on
  one moves it a stop; the track itself isn't drawn). Drop
  Net looks the same whether the frame is right or not; pressed with the property, it locks
  with a click and lights the property with its praise while the net goes straight down (the
  child dropped it then, for the fish under it). Pressed with a wrong frame, the net goes down
  all the same: the netted fish thrash until the bag tears, then wriggle out and dive back
  into the sea; the level's hint shows while Popo winds the net up and lets it down (mended,
  if it tore), in the shape the child left it, and its corner wobbles to say it's the one to fix.
- **The catch.** The school roams the whole sea at the depth the lowered net reaches, so the
  net catches whoever is under it when it lands: the child times the drop. Hauled up, the net
  first gathers its mouth underwater, then rises as a bag with the catch in its belly, clear of
  the water. A right net that caught nothing comes up empty and Drop Net comes back (the frame
  stays right). The fish the net missed stay and swim on into the next level (rowing to new
  waters, they come along), joined by newcomers; for the golden final school they swim off out
  of the sea as the golden fish swim in behind them. No fish ever vanishes or pops into view.
- **Hints.** Left alone, the first hint reads the prompt again, word by word; on the first net
  the hand also shows the drag, once; later hints nudge the plate and swell the measurements
  (the supplementary level shows 65° + ? = 180° once the child starts), so the game teaches
  rather than solves itself. No hint says whether the net is right; Drop Net does.
- **HUD.** Narration follows the Fishing Frenzy games: the instruction (prompt, praise, hint)
  and the narrator's lines sit on one translucent navy plate with a faint gold rim, white
  text and the key word in gold, fitted to the words. The instruction is always one line (a
  long one shrinks to fit) and comes word by word in time with its voice: each word pops in, a
  stressed one boings, and the plate bounces as each new sentence starts. The final card's
  lessons come the same way. ∠ is drawn, since Fredoka has no angle sign. Popo's own lines are its cream speech bubble with dark ink and an orange key
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
  closing round a catch, it becomes a potli hanging plumb from the ring: its short neck gathers
  up into the ring's bottom bar (the floats along its top fold away and the sling's legs shorten
  to nothing), round shoulders fill out into the full belly with the fish inside, and
  translucent shading gives it volume (Codex's `drawBagVolume`);
  torn, a ragged hole is cut out of the mesh with frayed, dark-edged strands around it and
  bits flung out as it rips (the frame holds).
- **Fish** (`src/fish.js`): the natural cartoon fish of `asset/fish-natural-*.png`, drawn in
  vertical strips that ripple head to tail so they visibly swim. The school swims in two lanes
  across the water the lowered net reaches, a fish-height or more apart and going opposite
  ways, so no two fish ever overlap or meet head on; in a lane each fish keeps its own loose,
  slowly changing spacing and depth (the `Sea` eases its speed to hold it), so none stops,
  turns back or catches up, and they loop round just out of sight at the ends and float gently.
  Newcomers wait out of sight at a lane's start and swim in when there's room. The pace rises
  level by level (about 65 to 130 pixels a second). Those under the net when it lands are
  netted and ride up in its bag.

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
  the division of work with Codex, which makes them, is in `tools/CODEX-HANDOFF.md`), and
  `assets/generated-web/` – the WebP copies of them the game loads (same pictures and size,
  about a fifth of the download), made by `tools/build-assets.py --generated`.
- `tools/build-assets.py` – rebuilds `assets/` and `src/sprite-data.js` (needs Pillow): the
  backgrounds and their water masks, the raft, the title fish and the natural fish (blue and
  teal ones are left out because they vanish against the water), and the WebP copies of the
  generated art; `--generated` rebuilds only those (run it whenever `assets/generated/` changes).
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
  Net button: Restart from the pause card hands the corner back, a prompt comes on one line
  word by word, a wrong net dropped as fish swim under it loses its catch and comes back
  mended with a hint, the corner stays on the stop it's dragged to (also through a mid-drag
  resize) with nothing giving the answer away, a right net dropped over no fish comes up empty
  and can go again, Drop Net locks the answer with its praise, a drop timed for fish under the
  net catches some, waters change, pause freezes the game, the final card appears, Play Again
  starts over.
- `python3 tests/geometry.py` – every level's property holds exactly at the solved position and
  fails at the start, the start is a simple frame well away from its place, the track runs
  through the place, Drop Net passes at that stop and at no other and the numbers on the net
  agree with it at every stop, the net hangs clear of the water and the school's water is
  inside the lowered net.
- `python3 tests/assets.py` – the WebP copies in `assets/generated-web/` match the generated
  art they were made from.
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
