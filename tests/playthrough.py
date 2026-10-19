"""End-to-end playthrough in headless Chromium: python3 tests/playthrough.py

Plays all six nets with real pointer drags and Drop Net clicks. Checks that a corner let go
away from its place leaves the puzzle open, that one dragged close snaps to an exact
parallelogram (also when the window is resized mid-drag), that Drop Net only arms once the
shape is right, that every fish of every level is netted, that levels and waters advance,
that pause freezes the game, that the final screen appears and tells the hosting page, and
that Play Again starts over. Fails on any console error.
"""
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = (ROOT / 'index.html').as_uri() + '?debug'

STATE = '''() => { const s = window.popoDebug.state, g = window.popoDebug.game;
  return { phase: s.phase, level: s.level, loc: s.locationIndex, caught: s.caught, paused: s.paused, misses: s.misses,
           dropHidden: document.getElementById('btn-drop').hidden, dropDisabled: document.getElementById('btn-drop').disabled,
           complete: !document.getElementById('overlay-complete').hidden, start: !document.getElementById('screen-start').hidden,
           parallelogram: PopoGame.isParallelogram(g.net.points), locked: g.net.locked, fish: s.fish.length }; }'''

# the corner and its place, as client points
POINTS = '''() => { const g = window.popoDebug.game, n = g.net, k = g.stage.scale;
  const c = document.getElementById('stage').getBoundingClientRect();
  const h = n.handle(), t = n.toStage(n.target);
  return { handle: [h.x * k + c.left, h.y * k + c.top], target: [t.x * k + c.left, t.y * k + c.top], scale: k, rect: [c.left, c.top] }; }'''


def check(ok, what, detail=''):
    print(('PASS ' if ok else 'FAIL ') + what + (f' -- {detail}' if detail else ''), flush=True)
    if not ok:
        raise SystemExit(1)


def state(page):
    return page.evaluate(STATE)


def wait_for(page, cond, timeout=60, what='condition'):
    end = time.time() + timeout
    while time.time() < end:
        st = state(page)
        if cond(st):
            return st
        page.wait_for_timeout(100)
    raise SystemExit(f'FAIL timed out waiting for {what}; last state {state(page)}')


# Drags the corner from where it is to a client point, in small steps like a finger would.
def drag(page, to, steps=24, resize_at=None):
    pts = page.evaluate(POINTS)
    x0, y0 = pts['handle']
    page.mouse.move(x0, y0)
    page.mouse.down()
    for i in range(1, steps + 1):
        if resize_at is not None and i == resize_at:
            page.set_viewport_size(resize_at and {'width': 1100, 'height': 650})
            page.wait_for_timeout(150)
            # the target moved with the stage; aim at where it is now
            now = page.evaluate(POINTS)
            to = now['target']
            x0, y0 = now['handle']
        t = i / steps
        page.mouse.move(x0 + (to[0] - x0) * t, y0 + (to[1] - y0) * t)
        page.wait_for_timeout(16)
    page.mouse.up()


def play():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': 1280, 'height': 720})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.goto(URL)
        page.wait_for_function('() => !document.getElementById("btn-play").disabled', timeout=30000)
        page.evaluate('() => { window.completed = null; window.addEventListener("popo:complete", (e) => { window.completed = e.detail; }); }')
        page.click('#btn-play', force=True)
        st = wait_for(page, lambda s: s['phase'] == 'puzzleReady', 60, 'the first net')
        check(st['level'] == 0 and st['fish'] == 3 and not st['dropHidden'] and st['dropDisabled'],
              'the first net is ready with its school and Drop Net disabled')

        levels = page.evaluate('() => PopoGame.LEVELS.map((l) => ({ fish: l.fish, location: l.location }))')
        for i, level in enumerate(levels):
            st = wait_for(page, lambda s, i=i: s['phase'] == 'puzzleReady' and s['level'] == i, 30, f'level {i + 1}')
            check(st['loc'] == level['location'] and st['fish'] == level['fish'], f'level {i + 1}: in its waters with {level["fish"]} fish')
            check(not st['parallelogram'], f'level {i + 1}: starts off as a wrong shape')

            if i == 0:
                # letting go far from the right place is not a snap
                pts = page.evaluate(POINTS)
                drag(page, [pts['handle'][0] - 60, pts['handle'][1] + 70])
                page.wait_for_timeout(300)
                st = state(page)
                check(st['phase'] == 'puzzleReady' and st['misses'] == 1 and not st['locked'], 'a corner let go off its place stays loose')

            drag(page, page.evaluate(POINTS)['target'], resize_at=12 if i == 1 else None)
            st = wait_for(page, lambda s: s['phase'] in ('shapeCorrect', 'dropReady'), 5, 'the snap')
            check(st['parallelogram'] and st['locked'], f'level {i + 1}: the corner snapped to an exact parallelogram')
            if i == 1:
                page.set_viewport_size({'width': 1280, 'height': 720})
                check(True, 'level 2: snapped after a resize in the middle of the drag')

            if i == 0:
                page.evaluate('() => window.popoDebug.game.togglePause()')
                before = page.evaluate('() => PopoGame.clock.time')
                page.wait_for_timeout(500)
                check(page.evaluate('() => PopoGame.clock.time') == before and state(page)['paused'], 'pause freezes the game')
                page.evaluate('() => window.popoDebug.game.togglePause()')

            st = wait_for(page, lambda s: s['phase'] == 'dropReady', 15, 'Drop Net to arm')
            check(not st['dropDisabled'], f'level {i + 1}: Drop Net is armed once the shape is right')
            caught = st['caught']
            page.click('#btn-drop')
            st = wait_for(page, lambda s: s['phase'] == 'netLowering', 3, 'the net to lower')
            check(st['dropHidden'], f'level {i + 1}: Drop Net goes away while the net is down')
            st = wait_for(page, lambda s: s['phase'] == 'levelSuccess', 12, 'the catch')
            check(st['caught'] == caught + level['fish'], f'level {i + 1}: every fish was netted', f'{st["caught"] - caught} of {level["fish"]}')

        st = wait_for(page, lambda s: s['complete'], 20, 'the final screen')
        check(st['phase'] == 'gameComplete' and page.evaluate('() => window.completed && window.completed.levels') == 6,
              'the final screen appears and the page is told')
        page.click('#btn-again')
        st = wait_for(page, lambda s: s['phase'] == 'puzzleReady', 20, 'Play Again')
        check(st['level'] == 0 and st['caught'] == 0 and not st['complete'], 'Play Again starts the nets over')
        check(not errors, 'no console errors', '; '.join(errors[:3]))
        browser.close()


if __name__ == '__main__':
    play()
