"""Checks the game's copies of the generated art are current: python3 tests/assets.py

The game loads WebP copies of assets/generated/ from assets/generated-web/ (made by
tools/build-assets.py --generated). Each copy must come from the picture now in
assets/generated/ (its fingerprint in sources.json) and be the same size, since the code
registers on its pixels. Fails with the command to run when a picture has changed since.
"""
import hashlib
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
GENERATED = ROOT / 'assets' / 'generated'
WEB = ROOT / 'assets' / 'generated-web'


def main():
    sources = json.loads((WEB / 'sources.json').read_text())
    failed = False
    for name, fingerprint in sorted(sources.items()):
        png = GENERATED / f'{name}.png'
        webp = WEB / f'{name}.webp'
        problems = []
        if hashlib.sha1(png.read_bytes()).hexdigest() != fingerprint:
            problems.append(f'{png.name} has changed since its copy was made')
        if not webp.exists():
            problems.append(f'{webp.name} is missing')
        elif Image.open(png).size != Image.open(webp).size:
            problems.append(f'{webp.name} is not the size of {png.name}')
        print(('FAIL ' if problems else 'PASS ') + f'{name}: ' + ('; '.join(problems) or 'current copy, same size'), flush=True)
        failed = failed or bool(problems)
    if failed:
        print('Run: python3 tools/build-assets.py --generated')
    raise SystemExit(1 if failed else 0)


if __name__ == '__main__':
    main()
