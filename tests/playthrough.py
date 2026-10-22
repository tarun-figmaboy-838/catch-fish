"""End-to-end playthrough in headless Chromium: python3 tests/playthrough.py

Plays all eight nets with real pointer drags, the slide arrows and the Drop Net button. Checks that Restart from
the pause card hands the corner back; that a prompt is delivered a sentence at a time, word by
word; that a wrong net dropped as fish swim under it loses its catch (the fish tear out and swim
on) and comes back mended as the child left it, with a hint; that the corner stays on the stop
the child drags it to (also through a window resize mid-drag) with nothing giving it away, and
Drop Net then locks the answer with its praise; that a right net dropped with no fish under it
comes up empty and can be dropped again; that each level's sea holds its whole school and a
drop timed for fish under the net catches some of them; that waters change, that pause freezes
the game, that the end screen appears and tells the hosting page, and that Play Again starts
over. Fails on any console error.
"""
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = (ROOT / 'index.html').as_uri() + '?debug'

STATE = '''() => { const s = window.popoDebug.state, g = window.popoDebug.game;
  return { phase: s.phase, level: s.level, loc: s.locationIndex, caught: s.caught, paused: s.paused, misses: s.misses,
           dropHidden: document.getElementById('btn-drop').hidden, dropReady: document.getElementById('btn-drop').classList.contains('ready'),
           swimming: s.fish.filter((f) => !f.gone && !f.caught && !f.frozen).length, furl: g.net.furl, tear: g.net.tear,
           complete: !document.getElementById('btn-again').hidden, ending: Boolean(g.ending && g.ending.titleAt !== undefined), start: !document.getElementById('screen-start').hidden,
           ok: g.net.check().ok, locked: g.net.locked, fish: s.fish.length, school: PopoGame.schoolSize(PopoGame.LEVELS[s.level]),
           stop: g.net.stopAt, netRight: g.netRight, handleHidden: document.getElementById('handle').hidden,
           counter: Number(document.getElementById('catch-count').textContent),
           words: document.querySelectorAll('#instruction-text .w').length, wordsIn: document.querySelectorAll('#instruction-text .w.in').length,
           lines: document.querySelectorAll('#instruction-text br').length + 1,
           oneLine: new Set([...document.querySelectorAll('#instruction-text .w')].map((w) => w.offsetTop)).size === 1,
           instruction: document.getElementById('instruction-text').textContent }; }'''

# how many fish are swimming right under the net (well inside its footprint)
UNDER = '''() => { const g = window.popoDebug.game, s = window.popoDebug.state, span = g.net.innerSpan();
  const l = g.netRest.x + span.left + 40, r = g.netRest.x + span.right - 40;
  return s.fish.filter((f) => !f.leaving && !f.waiting && !f.caught && !f.gone && f.x > l && f.x < r).length; }'''

# sends every fish well away from the net, to try a drop with nothing under it
SCATTER = '''() => { for (const f of window.popoDebug.state.fish) if (!f.caught) { f.x = f.x < 900 ? 40 : 1640; f.dir = f.x < 900 ? -1 : 1; } }'''

# the corner and its place, as client points
POINTS = '''() => { const g = window.popoDebug.game, n = g.net, k = g.stage.scale;
  const c = document.getElementById('stage').getBoundingClientRect();
  const h = n.handle(), t = n.toStage(n.target);
  return { handle: [h.x * k + c.left, h.y * k + c.top], target: [t.x * k + c.left, t.y * k + c.top] }; }'''


def check(ok, what, detail=''):
    print(('PASS ' if ok else 'FAIL ') + what + (f' -- {detail}' if detail else ''), flush=True)
    if not ok:
        raise SystemExit(1)


def state(page):
    return page.evaluate(STATE)


def drop_when_fish_under(page, at_least=2, timeout=60):
    end = time.time() + timeout
    while page.evaluate(UNDER) < at_least:
        if time.time() > end:
            raise SystemExit('FAIL no fish swam under the net')
        page.wait_for_timeout(60)
    page.click('#btn-drop')


def wait_for(page, cond, timeout=60, what='condition'):
    end = time.time() + timeout
    while time.time() < end:
        st = state(page)
        if cond(st):
            return st
        page.wait_for_timeout(100)
    raise SystemExit(f'FAIL timed out waiting for {what}; last state {state(page)}')


# Drags the corner from where it is to a client point, in small steps like a finger would.
def drag(page, to, steps=24, resize_at=None, follow=True):
    pts = page.evaluate(POINTS)
    x0, y0 = pts['handle']
    page.mouse.move(x0, y0)
    page.mouse.down()
    for i in range(1, steps + 1):
        if resize_at is not None and i == resize_at:
            page.set_viewport_size({'width': 1100, 'height': 650})
            page.wait_for_timeout(150)
            # the target moved with the stage; aim at where it is now
            now = page.evaluate(POINTS)
            to = now['target']
            x0, y0 = now['handle']
        t = i / steps
        # the raft bobs on the waves, so aim at where the corner's place is now
        to = page.evaluate(POINTS)['target'] if follow else to
        page.mouse.move(x0 + (to[0] - x0) * t, y0 + (to[1] - y0) * t)
        page.wait_for_timeout(16)
    page.mouse.up()
    page.wait_for_timeout(350)


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
        check(st['level'] == 0 and st['fish'] == st['school'] and not st['dropHidden'],
              'the first net is ready with its whole school and Drop Net there to try', f'{st["fish"]} fish')

        # Restart from the pause card: the story again, then the corner must answer the finger
        page.click('#btn-pause')
        page.wait_for_timeout(200)
        page.click('#btn-restart')
        st = wait_for(page, lambda s: s['phase'] == 'puzzleReady', 60, 'the first net after Restart')
        before = st['stop']
        pts = page.evaluate(POINTS)
        page.mouse.move(*pts['handle'])
        page.mouse.down()
        page.mouse.move(pts['handle'][0] - 50, pts['handle'][1] - 50, steps=8)
        page.mouse.up()
        page.wait_for_timeout(200)
        check(state(page)['stop'] != before, 'Restart from the pause card hands the corner back to the child')

        levels = page.evaluate('() => PopoGame.LEVELS.map((l) => ({ location: l.location, prompt: l.prompt.replace(/\\*/g, ""), praise: l.praise.replace(/\\*/g, ""), hint: l.hint.replace(/\\*/g, "") }))')
        for i, level in enumerate(levels):
            st = wait_for(page, lambda s, i=i: s['phase'] == 'puzzleReady' and s['level'] == i, 40, f'level {i + 1}')
            check(st['loc'] == level['location'] and st['fish'] == st['school'], f'level {i + 1}: in its waters with {st["school"]} fish')
            check(st['counter'] == st['caught'], f'level {i + 1}: the counter shows every fish caught so far', f'{st["counter"]} of {st["caught"]}')
            if i == 2:
                # a two-sentence prompt: one line, its words still arriving, then all there
                check(st['lines'] == 1 and st['oneLine'] and st['wordsIn'] < st['words'], f'level {i + 1}: the prompt comes on one line, word by word',
                      f'{st["wordsIn"]} of {st["words"]} words')
                st = wait_for(page, lambda s: s['wordsIn'] == s['words'], 8, 'the whole prompt')
            st = wait_for(page, lambda s, p=level['prompt']: s['instruction'] == p, 5, 'the prompt')
            check(not st['ok'], f'level {i + 1}: shows its own prompt and starts without the property', st['instruction'])

            if i == 0:
                # a wrong net dropped as fish swim under it: they tear out, and it comes back mended
                drop_when_fish_under(page)
                st = wait_for(page, lambda s: s['phase'] == 'netLowering', 3, 'the wrong net to lower')
                st = wait_for(page, lambda s: s['phase'] == 'netBreaking', 12, 'the catch to break out')
                st = wait_for(page, lambda s: s['tear'] == 1, 5, 'the net to tear')
                st = wait_for(page, lambda s, h=level['hint']: s['instruction'] == h, 5, 'the hint')
                st = wait_for(page, lambda s: s['phase'] == 'puzzleReady', 15, 'the mended net')
                check(st['misses'] == 1 and st['caught'] == 0 and st['swimming'] == st['school'] and not st['ok'] and not st['locked']
                      and st['furl'] == 0 and st['tear'] == 0 and st['instruction'] == level['prompt'] and not st['dropHidden'],
                      'a wrong net dropped anyway loses its catch, comes back mended as it was, and the puzzle reopens')

            if i == 2:
                # the arrows beside the knob: a tap is one stop on, or back
                before = state(page)['stop']
                page.click('#step-on')
                on = state(page)['stop']
                page.click('#step-back')
                check(on == before + 1 and state(page)['stop'] == before, f'level {i + 1}: a tap on an arrow moves the corner one stop')
            drag(page, page.evaluate(POINTS)['target'], resize_at=12 if i == 1 else None)
            if i == 1:
                page.set_viewport_size({'width': 1280, 'height': 720})
                page.wait_for_timeout(200)
            st = state(page)
            check(st['ok'] and st['stop'] == 0 and not st['dropReady'], f'level {i + 1}: the corner is on the stop the child put it on, right, and nothing gives it away')

            if i == 0:
                page.evaluate('() => window.popoDebug.game.togglePause()')
                before = page.evaluate('() => PopoGame.clock.time')
                page.wait_for_timeout(500)
                check(page.evaluate('() => PopoGame.clock.time') == before and state(page)['paused'], 'pause freezes the game')
                page.evaluate('() => window.popoDebug.game.togglePause()')
                # right, but dropped with no fish under it: up it comes empty, still right, to drop again
                page.evaluate(SCATTER)
                page.click('#btn-drop')
                st = wait_for(page, lambda s, p=level['praise']: s['locked'] and s['instruction'] == p, 4, 'the right frame to lock with its praise')
                st = wait_for(page, lambda s: s['phase'] == 'puzzleReady', 15, 'the empty net')
                check(st['netRight'] and st['caught'] == 0 and st['handleHidden'] and not st['dropHidden'] and st['ok'],
                      'a right net dropped with no fish under it comes up empty, and Drop Net is there to try again')

            caught = st['caught']
            for attempt in range(5):
                drop_when_fish_under(page)
                if attempt == 0 and i > 0:
                    st = wait_for(page, lambda s, p=level['praise']: s['locked'] and s['instruction'] == p, 4, 'the right frame to lock with its praise')
                    check(st['phase'] == 'netLowering', f'level {i + 1}: Drop Net locks the answer with its praise as the net goes down', st['instruction'])
                st = wait_for(page, lambda s: s['phase'] == 'netLowering', 5, 'the net to lower')
                st = wait_for(page, lambda s: s['dropHidden'], 1, 'Drop Net to go away')
                check(st['phase'] in ('netLowering', 'catching'), f'level {i + 1}: Drop Net goes away while the net is down')
                st = wait_for(page, lambda s: s['phase'] in ('levelComplete', 'puzzleReady'), 12, 'the catch')
                if st['phase'] == 'levelComplete':
                    break
                print(f'     level {i + 1}: the fish swam out before the net landed; dropping again', flush=True)
            check(st['phase'] == 'levelComplete' and st['caught'] > caught, f'level {i + 1}: a drop timed for fish under the net catches some',
                  f'{st["caught"] - caught} of {st["school"]}')

        st = wait_for(page, lambda s: s['complete'], 20, 'the final screen')
        check(st['phase'] == 'gameComplete' and page.evaluate('() => window.completed && window.completed.levels') == len(levels),
              'the final screen appears and the page is told')
        check(st['ending'], 'the end screen closes in on Popo with The End')
        page.click('#btn-again')
        st = wait_for(page, lambda s: s['phase'] == 'puzzleReady', 20, 'Play Again')
        check(st['level'] == 0 and st['caught'] == 0 and not st['complete'], 'Play Again starts the nets over')
        st = wait_for(page, lambda s: not page.evaluate('() => Boolean(window.popoDebug.game.ending)'), 5, 'the circle to open again')
        check(page.evaluate('() => document.getElementById("scene").style.transform') == '', 'the circle opens on the first net, the scene back in place')
        check(not errors, 'no console errors', '; '.join(errors[:3]))
        browser.close()


if __name__ == '__main__':
    play()
