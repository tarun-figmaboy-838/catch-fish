"""Paddling frames and row-to-the-next-waters check: python3 tests/rowing.py

Every frame of the pre-rendered stroke (tools/build-rowing-cycle.py) must be whole inside its
cell. Then, in headless Chromium at a few sizes (one with reduced motion), Popo rows from the
first waters to the second: the waterline, the raft and the net all arrive, Popo is back on
his seat with nothing left swinging, and there are no console errors.
"""
import json
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = (ROOT / 'index.html').as_uri() + '?debug'

meta = (ROOT / 'src/rowing-cycle-data.js').read_text()
cycle = json.loads(meta[meta.index('{', meta.index('ROWING_CYCLE')):meta.rindex('}') + 1])
sheet = Image.open(ROOT / 'assets/sprites/popo-row-cycle.webp')
assert sheet.mode == 'RGBA'
for i in range(cycle['frames']):
    x, y = i % cycle['columns'] * cycle['width'], i // cycle['columns'] * cycle['height']
    box = sheet.crop((x, y, x + cycle['width'], y + cycle['height'])).getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    assert box and min(box[:2]) > 0 and box[2] < cycle['width'] and box[3] < cycle['height'], (i, box)

ROW = '''() => { const g = window.popoDebug.game; g.audio.init(); g.reset(); g.ui.showHud(); g.net.visible = true;
  PopoGame.state.phase = PopoGame.PHASE.TRANSITIONING;
  return PopoGame.rowTo(g, 1, PopoGame.newToken()).then(() => true, () => false); }'''
AFTER = '''() => { const g = window.popoDebug.game, s = PopoGame.state;
  return { rowing: !!g.popo.rowing, shift: g.popo.travelShift, swing: g.net.swing, loc: s.locationIndex,
           waterline: g.waterline, expected: g.locationWaterline(1), transition: !!g.transition }; }'''

with sync_playwright() as p:
    browser = p.chromium.launch()
    for width, height, reduced in [(1600, 900, False), (1024, 640, False), (768, 1024, True)]:
        page = browser.new_page(viewport={'width': width, 'height': height}, reduced_motion='reduce' if reduced else 'no-preference')
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.goto(URL)
        page.wait_for_function('() => !document.getElementById("btn-play").disabled', timeout=30000)
        arrived = page.evaluate(ROW)
        after = page.evaluate(AFTER)
        assert arrived and not after['rowing'] and after['shift'] == 0 and after['swing'] == 0, after
        assert after['loc'] == 1 and after['waterline'] == after['expected'] and not after['transition'], after
        assert not errors, errors
        print(width, height, 'reduced' if reduced else 'full', after, flush=True)
        page.close()
    browser.close()
print('PASS: whole stroke frames; the row arrives at the second waters at three sizes.')
