#!/usr/bin/env python3
"""Pack the card and action-space artwork in resource/ into cardimages.js.

The game runs from file://, where an SVG texture cannot load an external PNG and a
file:// image would taint the WebGL canvas, so each picture is shrunk to 900 px, encoded
as AVIF and embedded as a data URI. A file is matched to a card by its English name with
spaces and punctuation removed: "animaltamer.png" -> "Animal Tamer".

Run from anywhere:  python3 tools/build_card_images.py
Needs macOS `sips` for the resize.
"""
import base64, json, os, re, struct, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..'))
SRC = os.path.join(ROOT, 'resource')
OUT = os.path.join(ROOT, 'cardimages.js')
KINDS = ['occupation', 'minor', 'minorimprovement', 'major', 'majorimprovement']
SIZE, QUALITY = 900, 62          # AVIF: about a third the size of a JPEG at this quality
# Minor improvements only show in a small picture window, so they need less.
SIZE_BY_KIND = {'minor': 640, 'minorimprovement': 640}

def key(s):
    # files straight from the Draw Things script carry a prefix; ignore it
    s = re.sub(r'^agricola_(minor|major|occ|action)_', '', s.lower())
    return re.sub(r'[^a-z0-9]', '', s)

def card_names():
    text = open(os.path.join(ROOT, 'data.js'), encoding='utf-8').read()
    names = {}
    for _q, m in re.findall(r"""en:(['"])((?:(?!\1)[^\\]|\\.)*)\1""", text):
        en = m.replace("\\'", "'").replace('\\"', '"')
        names[key(en)] = en
        names.setdefault(key(re.sub(r"'s\b", '', en)), en)   # basketmakerworkshop -> Basketmaker's Workshop
    return names

def read_bmp(path):
    """Pixels of an uncompressed 24/32-bit BMP as rows of (r, g, b), top row first."""
    d = open(path, 'rb').read()
    off = struct.unpack_from('<I', d, 10)[0]
    w, h = struct.unpack_from('<ii', d, 18)
    bpp = struct.unpack_from('<H', d, 28)[0] // 8
    stride = (w * bpp + 3) & ~3
    rows = []
    for y in range(abs(h)):
        base = off + y * stride
        rows.append([(d[base + x * bpp + 2], d[base + x * bpp + 1], d[base + x * bpp]) for x in range(w)])
    return rows if h < 0 else rows[::-1]

def border(path):
    """How many pixels of flat frame (a near-uniform dark or light band) each edge carries."""
    with tempfile.TemporaryDirectory() as tmp:
        bmp = os.path.join(tmp, 'x.bmp')
        subprocess.run(['sips', '-Z', '256', '-s', 'format', 'bmp', path, '--out', bmp], check=True, capture_output=True)
        px = read_bmp(bmp)
    h, w = len(px), len(px[0])
    def flat(line):
        lum = [0.3 * r + 0.59 * g + 0.11 * b for r, g, b in line]
        m = sum(lum) / len(lum)
        sd = (sum((v - m) ** 2 for v in lum) / len(lum)) ** 0.5
        return sd < 14 and (m < 60 or m > 225)
    def run(lines):
        n = 0
        for line in lines[:int(len(lines) * 0.08)]:
            if not flat(line): break
            n += 1
        return n
    cols = [[px[y][x] for y in range(h)] for x in range(w)]
    edges = {'top': run(px), 'bottom': run(px[::-1]), 'left': run(cols), 'right': run(cols[::-1])}
    found = {k: v for k, v in edges.items() if v}
    # A frame runs round the picture; a pale sky or a dark floor along one edge is not one.
    return (found if len(found) >= 3 else {}), (w, h)

def encode(path, size=None):
    with tempfile.TemporaryDirectory() as tmp:
        src = path
        found, (sw, sh) = border(path)
        if found:
            # scale the trim from the 256 px sample back to full size, plus a pixel of anti-alias
            fw, fh = [int(v) for v in subprocess.run(['sips', '-g', 'pixelWidth', '-g', 'pixelHeight', path],
                      capture_output=True, text=True).stdout.split()[-3::2]]
            k = fw / sw
            t, b_, l, r = [int(round((found.get(e, 0) + (1 if found.get(e) else 0)) * k)) for e in ('top', 'bottom', 'left', 'right')]
            src = os.path.join(tmp, 'crop.png')
            subprocess.run(['sips', '-c', str(fh - t - b_), str(fw - l - r), '--cropOffset', str(t), str(l),
                            path, '--out', src], check=True, capture_output=True)
            print(f'    trimmed border {found} from {os.path.basename(path)}')
        out = os.path.join(tmp, 'x.avif')
        subprocess.run(['sips', '-Z', str(size or SIZE), '-s', 'format', 'avif',
                        '-s', 'formatOptions', str(QUALITY), src, '--out', out],
                       check=True, capture_output=True)
        return 'data:image/avif;base64,' + base64.b64encode(open(out, 'rb').read()).decode()

def main():
    names = card_names()
    found, unmatched = {}, []
    for kind in KINDS:
        folder = os.path.join(SRC, kind)
        if not os.path.isdir(folder):
            continue
        for f in sorted(os.listdir(folder)):
            base, ext = os.path.splitext(f)
            if ext.lower() not in ('.png', '.jpg', '.jpeg', '.webp'):
                continue
            en = names.get(key(base))
            if not en:
                unmatched.append(f'{kind}/{f}')
                continue
            found[en] = encode(os.path.join(folder, f), SIZE_BY_KIND.get(kind))
            print(f'  {kind}/{f} -> {en} ({len(found[en]) * 3 // 4 // 1024} KB)')
    # Action spaces, keyed by space id, matched on the space's English name or its id.
    spaces = {}
    eng = open(os.path.join(ROOT, 'engine.js'), encoding='utf-8').read()
    for sid, en in re.findall(r"id:\s*'([a-z_0-9]+)',[^}]*?en:\s*'([^']+)'", eng):
        for k in {key(en), key(sid)}:
            spaces[k] = sid
            spaces.setdefault(k.rstrip('s'), sid)                  # grainseed -> Grain Seeds
            spaces.setdefault(k.replace('or', 'our'), sid)         # daylabour -> Day Laborer
    # File names people actually use that the rules above do not cover.
    ALIASES = {'daylabour': 'day_laborer', 'daylabor': 'day_laborer', 'daylabourer': 'day_laborer'}
    for k, sid in ALIASES.items():
        spaces.setdefault(k, sid)
    actions = {}
    folder = os.path.join(SRC, 'action')
    for f in sorted(os.listdir(folder)) if os.path.isdir(folder) else []:
        base, ext = os.path.splitext(f)
        if ext.lower() not in ('.png', '.jpg', '.jpeg', '.webp'):
            continue
        sid = spaces.get(key(base)) or spaces.get(key(base).rstrip('s'))
        if not sid:
            unmatched.append(f'action/{f}')
            continue
        actions[sid] = encode(os.path.join(folder, f))
        print(f'  action/{f} -> {sid} ({len(actions[sid]) * 3 // 4 // 1024} KB)')

    with open(OUT, 'w', encoding='utf-8') as fh:
        fh.write('// Generated by tools/build_card_images.py — do not edit by hand.\n')
        fh.write('// Card artwork keyed by English card name, as embedded JPEG data URIs.\n')
        fh.write('const CARD_IMAGES = ' + json.dumps(found, indent=0) + ';\n')
        fh.write('// Action space artwork keyed by space id.\n')
        fh.write('const ACTION_IMAGES = ' + json.dumps(actions, indent=0) + ';\n')
    print(f'wrote {OUT}: {len(found)} card images, {len(actions)} action images')
    if unmatched:
        print('no card matched:', ', '.join(unmatched), file=sys.stderr)

if __name__ == '__main__':
    main()
