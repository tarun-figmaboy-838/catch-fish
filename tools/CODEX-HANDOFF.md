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

## Open asks for Codex, in order

1. **Popo expressions**, same sheet layout as `popo-operating.png` (2 × 2 cells of 694 × 566,
   same seat and shaft registration as the top-left pose, wheel grip at 12 o'clock):
   a blink (eyes closed), a happy open-mouth cheer, a thinking face (eyes up, mouth small),
   and a gasp. File: `popo-faces.png`. These give the catch and the torn net real expressions.
2. **Title banner** `title.png`, 1672 × 941, for "Popo's Parallelogram Net": the current scene
   (raft with the arched winch, the net as a parallelogram, Arctic water) with the title at
   the top right. Keep a clear circle for the play button at (836, 772), radius 112.
3. **Rare fish** `fish-rare.png`, a 2 × 3 grid like `asset/fish-natural-1.png` (1448 × 1086):
   six golden or jewel-patterned fish, same size and style as the natural fish, facing right.
   They become the final level's prize school.
4. Optional: smaller exports of `rope.png` (one twist, ~200 px wide) and the connector.

## Checking a change

Serve the folder (`python3 -m http.server 8000`) and open `?dev=1` for level jumps. Tests:
`python3 tests/playthrough.py`, `tests/geometry.py`, `tests/ui_layout.py`,
`tests/machine_animation.py` (Python Playwright). Nothing should log a console error.
