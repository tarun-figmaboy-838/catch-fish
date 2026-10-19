"""Checks every level's net mathematically: python3 tests/geometry.py

For each of the six levels: the solved frame is a parallelogram; the starting frame is a
simple quadrilateral that is clearly wrong (well outside the snap radius) but keeps most of
its area; the snap radius is child-sized on a tablet; the solved net hangs clear of the
water; and the water its school keeps to lies inside the frame when the net is down, so
every fish can be netted. Also checks the corner's touch target is at least 48 CSS pixels.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = (ROOT / 'index.html').as_uri() + '?debug'

CHECKS = '''() => {
  const { LEVELS, LOCATIONS, state, isParallelogram, isSimpleQuad, area } = PopoGame;
  const g = window.popoDebug.game;
  return LEVELS.map((level, i) => {
    state.locationIndex = level.location;
    g.applyLocation();
    g.prepareLevel(i);
    const net = g.net;
    const start = net.points.map((p) => ({ ...p }));
    const solvedArea = area(net.solved);
    const movable = start[net.movable];
    const distance = Math.hypot(movable.x - net.target.x, movable.y - net.target.y);
    // the frame when fully lowered, and the school's water in net coordinates
    net.points = net.solved.map((p) => ({ ...p }));
    net.drop = g.catchDepth();
    net.origin = { ...g.netRest };
    const a = g.fishArea;
    const corners = [[a.left, a.top], [a.right, a.top], [a.right, a.bottom], [a.left, a.bottom], [(a.left + a.right) / 2, a.bottom]];
    const covered = corners.every(([x, y]) => net.contains({ x, y }));
    const result = {
      level: i + 1,
      parallelogram: isParallelogram(net.solved),
      simpleStart: isSimpleQuad(start),
      startAreaRatio: area(start) / solvedArea,
      startDistanceInMagnets: distance / net.magnet,
      magnet: net.magnet,
      clearOfWater: g.netRest.y + Math.max(...net.solved.map((p) => p.y)) <= g.waterline - 30,
      schoolCovered: covered,
      schoolSize: [a.right - a.left, a.bottom - a.top],
    };
    net.drop = 0;
    net.points = start;
    return result;
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
            if not r['parallelogram']:
                problems.append('solved frame is not a parallelogram')
            if not r['simpleStart']:
                problems.append('starting frame crosses itself')
            if r['startAreaRatio'] < 0.45:
                problems.append(f'starting frame too squashed ({r["startAreaRatio"]:.2f} of solved)')
            if r['startDistanceInMagnets'] < 2.4:
                problems.append(f'starting corner too close to its place ({r["startDistanceInMagnets"]:.1f} snap radii)')
            if r['magnet'] * 1024 / 1672 < 18:
                problems.append(f'snap radius too small on a tablet ({r["magnet"] * 1024 / 1672:.0f} CSS px)')
            if not r['clearOfWater']:
                problems.append('solved net hangs in the water')
            if not r['schoolCovered']:
                problems.append('school not covered by the lowered net')
            if r['schoolSize'][0] < 240 or r['schoolSize'][1] < 110:
                problems.append(f'school water too small {r["schoolSize"]}')
            print(('PASS' if not problems else 'FAIL') + f' level {r["level"]}: magnet {r["magnet"]:.0f}px, start {r["startDistanceInMagnets"]:.1f} radii away, '
                  f'area {r["startAreaRatio"]:.2f}, school {r["schoolSize"][0]:.0f}x{r["schoolSize"][1]:.0f}' + (' -- ' + '; '.join(problems) if problems else ''), flush=True)
            failed = failed or bool(problems)

        # the corner's touch target on a tablet-sized screen
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
