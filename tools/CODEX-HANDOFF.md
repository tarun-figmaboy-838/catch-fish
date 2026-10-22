# Working with Codex on this game

Two assistants work in this folder: Codex (art and UI styling) and Claude (game code,
positions, animation logic, tests). This file is how they coordinate; the user relays.

## Who owns what

- **Codex:** everything in `assets/generated/`, the prompts in `tools/*prompts*.txt`, and
  visual styling in `src/styles.css` (panels, cards, buttons, HUD look).
- **Claude:** all of `src/*.js`, `index.html` structure, `tests/`, `tools/build-*.py`.
- Neither edits the other's files. If a change is needed on the other side, describe it here
  (or in the prompts file) and the user passes it on. Never run both at the same time.
- **Keep as they are** (the user asked for these on 19 Oct 2026): the narration plate and
  Popo's speech bubble follow the Fishing Frenzy games (`~/Downloads/popo-fishing/fishing-frenzy`),
  as do the round icon buttons; Drop Net (the only action now, no Check) and the cards'
  buttons are chunky game buttons in the game's dark-brown ink. Please don't restyle them.

## How to deliver art

- Transparent PNG in `assets/generated/`, one object per file (or an even grid for frames),
  consistent padding, nothing cropped. Note the **registration points** in
  `tools/generated-art-prompts.txt` (for example: seat point, shaft tip, slot top), in image
  pixels. Claude wires each piece into the code and keeps it at one uniform scale.
- Keep Popo's identity exactly (reference `asset/popo-fishing-clean.png`); style: polished
  3D toy, soft warm light, no text, no background.

## Received and in use (19 Oct 2026)

| file | use | notes |
| --- | --- | --- |
| `winch-arched.png` | the machine | drawn whole at 0.35; pulley at image (1205, 190), axle (79, 930) |
| `popo-operating.png` | Popo at the wheel, 4 poses | registered on the shaft tip; one pose per quarter turn of the drum |
| `rope.png` | every rope the game draws | a seven-twist run (x 530–720, y 170–1012) tiled along the line |
| `rope-connector.png` | the shackle the net hangs from | drawn 43 px tall, slot top at the rope's end; the sling starts at its bottom |
| `net.png` | the net texture | warped onto the frame |
| `panel.png` | pause and final cards | scaled whole, content padded 13 % / 9 % |
| `popo.png`, `winch.png` | superseded | kept for reference |

## Changes on 22 Oct 2026 (Claude)

- **The game loads WebP copies of the generated art** from `assets/generated-web/` (same
  pictures, same pixel size, about a fifth of the download). Your PNGs in `assets/generated/`
  stay the source: after replacing one, run `python3 tools/build-assets.py --generated` (or
  ask Claude). `python3 tests/assets.py` fails if a copy is stale. `panel.png` is still used
  as it is by the cards' CSS.
- **A small block at the end of `src/styles.css`** ("text delivery") animates the instruction's
  words as they're said, keeps the instruction on one line and draws ∠ (Fredoka has none). It
  doesn't restyle the plate; please keep it.
- **The net's bag** (`drawBagVolume`, the gathered-mouth `meshPoint`, the slack taken up before
  the haul) was added by Codex in `src/net.js` and `src/sequences.js`. Claude reviewed it and
  kept the shading and the haul; at the user's request the bag now hangs plumb from the ring
  with its neck gathered up into the ring's bar (no drawn tie), shaped as a potli. Next time, describe changes to Claude's files here first, as above.

## Open asks for Codex, in order

1. **Popo expressions**, same sheet layout as `popo-operating.png` (2 × 2 cells of 694 × 566,
   same seat and shaft registration as the top-left pose, wheel grip at 12 o'clock):
   a blink (eyes closed), a happy open-mouth cheer, a thinking face (eyes up, mouth small),
   and a gasp. File: `popo-faces.png`. These give the catch and the torn net real expressions.
2. Done: the banner is now the live lake with the user's painted "Fishing Frenzy 2" logo
   (`asset/fishing-frenzy-2-logo.png`); the old title banner is no longer used.
3. **Rare fish** `fish-rare.png`, a 2 × 3 grid like `asset/fish-natural-1.png` (1448 × 1086):
   six golden or jewel-patterned fish, same size and style as the natural fish, facing right.
   They become the final level's prize school.
4. Optional: smaller exports of `rope.png` (one twist, ~200 px wide) and the connector.
5. **Popo cranking in-betweens**: `popo-operating.png` has four poses a turn, so Claude made the
   three in-betweens of each quarter by optical flow (`tools/build-crank.py`,
   `assets/sprites/popo-crank.webp`); where the paws cross the wheel they blur. Drawn frames would
   be crisper: 16 poses round one turn of the wheel (grip at 12, then every 22.5°), same cell size
   and shaft registration as the operating sheet, 4 × 4.

## Checking a change

Serve the folder (`python3 -m http.server 8000`) and open `?dev=1` for level jumps. Tests:
`python3 tests/playthrough.py`, `tests/geometry.py`, `tests/ui_layout.py`,
`tests/machine_animation.py` (Python Playwright). Nothing should log a console error.
