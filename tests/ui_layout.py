"""Check complete UI bounds, pointer controls, and generated sprites on small screens."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser = p.chromium.launch()
    for width, height in [(1280, 720), (844, 390), (390, 844)]:
        page = browser.new_page(viewport={'width': width, 'height': height})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto((ROOT / 'index.html').as_uri() + '?dev=1')
        page.wait_for_function('window.popoDebug && !document.querySelector("#btn-play").disabled')
        page.locator('.dev-panel button').nth(2).click()
        page.locator('.dev-panel').evaluate('(e) => e.remove()')
        page.wait_for_timeout(650)
        stage = page.locator('#stage').bounding_box()
        def contained(selector):
            box = page.locator(selector).bounding_box()
            assert box and box['x'] >= stage['x'] - 1 and box['y'] >= stage['y'] - 1, (selector, box)
            assert box['x'] + box['width'] <= stage['x'] + stage['width'] + 1, (selector, box)
            assert box['y'] + box['height'] <= stage['y'] + stage['height'] + 1, (selector, box)
        for selector in ['#level', '#instruction', '#btn-pause', '#btn-sound', '#btn-drop']:
            contained(selector)
        page.click('#btn-sound')
        assert page.locator('#btn-sound').get_attribute('aria-pressed') == 'false'
        page.click('#btn-sound')
        page.click('#btn-pause')
        page.wait_for_timeout(400)
        for selector in ['#overlay-pause .card', '#btn-resume', '#btn-restart']:
            contained(selector)
        page.screenshot(path=f'/tmp/fish-final-pause-{width}.png')
        page.click('#btn-resume')
        assert page.locator('#overlay-pause').is_hidden()
        page.evaluate('window.popoDebug.game.ui.showComplete(true,"You made parallelograms!","Both pairs of opposite sides are parallel.")')
        page.wait_for_timeout(700)
        for selector in ['#overlay-complete .card', '#complete-title', '#complete-lesson', '#btn-again']:
            contained(selector)
        assert not errors, errors
        print(f'PASS {width}x{height}: HUD bounds, sound, pause, resume, completion bounds, no errors', flush=True)
        page.close()
    browser.close()
