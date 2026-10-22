"""Checks every level's mathematics: python3 tests/geometry.py

For each of the eight levels, at the solved position the level's property holds exactly
(parallel sides, matching lengths, matching or supplementary angles, bisecting diagonals, or
the whole parallelogram) and Check passes; at the starting position Check fails, the frame is
still a simple quadrilateral with most of its area, and the corner is well away from its place.
Along the corner's track, the one stop that is its place passes Drop Net and every other stop
fails, and the numbers the net shows match at that stop and at no other (so the numbers never
say right while Drop Net says wrong, or the other way round). Also: the solved net hangs clear
of the water, the school's water lies inside the lowered net, and the touch target is big enough.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = (ROOT / 'index.html').as_uri() + '?debug'

CHECKS = '''() => {
  const { LEVELS, state, geo } = PopoGame;
  const g = window.popoDebug.game;
  const net = g.net;
  const vec = (name) => net.sideOf(name);
  return LEVELS.map((level, i) => {
    state.locationIndex = level.location;
    g.applyLocation();
    g.prepareLevel(i);
    const start = net.points.map((p) => ({ ...p }));
    const startOk = net.check().ok;
    const startSimple = geo.isSimpleQuad(start);
    const startArea = geo.area(start) / geo.area(net.solved);
    const distance = geo.distance(start[net.movable], net.target) / net.nearby;
    // every stop on the track: does Drop Net pass, and do the numbers on the net match?
    const shown = {
      parallel: () => net.slopeShown(level.sides[0]) === net.slopeShown(level.sides[1]),
      length: () => net.metresShown(level.side).toFixed(1) === level.metres[level.reference].toFixed(1),
      sides: () => net.metresShown('CD').toFixed(1) === level.metres.AB.toFixed(1) && net.metresShown('BC').toFixed(1) === level.metres.AD.toFixed(1),
      angle: () => net.degreesShown(level.vertex) === level.degrees,
      supplementary: () => net.degreesShown(level.vertex) === 180 - level.degrees,
      diagonals: () => { const h = net.halvesShown(); return h.AO === h.OC && h.BO === h.OD; },
      parallelogram: () => net.metresShown('AB') === net.metresShown('CD') && net.metresShown('BC') === net.metresShown('AD'),
    }[level.type];
    const stops = [];
    for (let k = net.track.min; k <= net.track.max; k += 1) {
      net.setHandle(net.stop(k));
      stops.push({ k, ok: net.check().ok, match: shown() });
    }
    const track = { min: net.track.min, max: net.track.max, start: net.stopAt,
      passOnlyAtPlace: stops.every((s) => s.ok === (s.k === 0)), numbersAgree: stops.every((s) => s.match === s.ok),
      bad: stops.filter((s) => s.ok !== (s.k === 0) || s.match !== s.ok).map((s) => s.k) };
    net.showSolved();
    const tiny = (a, b) => Math.abs(a - b) < 0.05;
    const property = {
      parallel: () => Math.abs(geo.cross(geo.normalize(vec(level.sides[0])), geo.normalize(vec(level.sides[1])))) < 1e-6,
      length: () => tiny(net.metres(level.side), level.metres[level.reference]),
      sides: () => tiny(net.metres('CD'), net.metres('AB')) && tiny(net.metres('BC'), net.metres('AD')),
      angle: () => tiny(net.angle(level.vertex), level.degrees) && tiny(net.angle(level.reference), level.degrees),
      supplementary: () => tiny(net.angle(level.reference) + net.angle(level.vertex), 180) && tiny(net.angle(level.reference), level.degrees),
      diagonals: () => { const h = net.halves(); return tiny(h.AO, h.OC) && tiny(h.BO, h.OD); },
      parallelogram: () => Math.abs(net.solved[0].x + net.solved[2].x - net.solved[1].x - net.solved[3].x) < 1e-6
        && Math.abs(net.solved[0].y + net.solved[2].y - net.solved[1].y - net.solved[3].y) < 1e-6,
    }[level.type]();
    const solvedOk = net.check().ok;
    const l = net.limits;
    const inLimits = net.target.x >= l.left && net.target.x <= l.right && net.target.y >= l.top && net.target.y <= l.bottom;
    // the frame when fully lowered, and the school's water in net coordinates
    net.drop = g.catchDepth();
    net.origin = { ...g.netRest };
    const a = g.fishArea;
    const covered = [[a.left, a.top], [a.right, a.top], [a.right, a.bottom], [a.left, a.bottom], [(a.left + a.right) / 2, a.bottom]]
      .every(([x, y]) => net.contains({ x, y }));
    net.drop = 0;
    net.points = start;
    net.locked = false;
    return {
      level: i + 1, type: level.type, property, solvedOk, startOk, startSimple, startArea, distance, inLimits, covered, track,
      clearOfWater: g.netRest.y + Math.max(...net.solved.map((p) => p.y)) <= g.waterline - 30,
      schoolSize: [a.right - a.left, a.bottom - a.top],
    };
  });
}'''


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': 1024, 'height': 768})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(URL)
        page.wait_for_function('() => !document.getElementById("btn-play").disabled', timeout=30000)
        failed = False
        for r in page.evaluate(CHECKS):
            problems = []
            if not r['property']:
                problems.append('the solved net does not have the property exactly')
            if not r['solvedOk']:
                problems.append('Check fails at the solved position')
            if r['startOk']:
                problems.append('Check already passes at the start')
            if not r['startSimple']:
                problems.append('starting frame crosses itself')
            if r['startArea'] < 0.45:
                problems.append(f'starting frame too squashed ({r["startArea"]:.2f} of solved)')
            if r['distance'] < 2:
                problems.append(f'starting corner too close to its place ({r["distance"]:.1f} "nearby" radii)')
            if not r['inLimits']:
                problems.append('the corner cannot be dragged to its place')
            t = r['track']
            if not (t['min'] < 0 < t['max'] or (t['min'] < 0 and t['start'] < 0) or (t['max'] > 0 and t['start'] > 0)):
                problems.append(f'the track does not run through its place {t}')
            if not t['passOnlyAtPlace']:
                problems.append(f'Drop Net passes away from the place, or not at it, at stops {t["bad"]}')
            if not t['numbersAgree']:
                problems.append(f'the numbers on the net disagree with Drop Net at stops {t["bad"]}')
            if not r['clearOfWater']:
                problems.append('solved net hangs in the water')
            if not r['covered']:
                problems.append('school not covered by the lowered net')
            if r['schoolSize'][0] < 200 or r['schoolSize'][1] < 110:
                problems.append(f'school water too small {r["schoolSize"]}')
            print(('PASS' if not problems else 'FAIL') + f' level {r["level"]} ({r["type"]}): start {r["distance"]:.1f} radii away, '
                  f'area {r["startArea"]:.2f}, track {r["track"]["min"]}..{r["track"]["max"]} from {r["track"]["start"]}, school {r["schoolSize"][0]:.0f}x{r["schoolSize"][1]:.0f}' + (' -- ' + '; '.join(problems) if problems else ''), flush=True)
            failed = failed or bool(problems)

        page.evaluate('() => { const g = window.popoDebug.game; g.reset(); g.ui.showHud(); g.spawnSchool(); g.net.visible = true; g.beginPuzzle(); }')
        page.wait_for_timeout(200)
        size = page.evaluate('() => { const r = document.getElementById("handle").getBoundingClientRect(); return [r.width, r.height]; }')
        ok = min(size) >= 48
        print(('PASS' if ok else 'FAIL') + f' corner touch target {size[0]:.0f}x{size[1]:.0f} CSS px at 1024x768', flush=True)
        failed = failed or not ok or bool(errors)
        if errors:
            print('FAIL console errors:', errors[:3])
        browser.close()
        raise SystemExit(1 if failed else 0)


if __name__ == '__main__':
    main()
