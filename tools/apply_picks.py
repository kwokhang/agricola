#!/usr/bin/env python3
"""Apply the JSON block that picker.html exports: copy each picked picture into resource/ under
the card's plain file name, crop picked and kept pictures as chosen, then rebuild the images.

    python3 tools/apply_picks.py picks.json      # the ```json block, saved to a file

A kept picture is cropped in place. When a later export repeats a crop, the crop is taken from the\ncommitted original instead, whichever of the two the crop's shape fits.
"""
import json, os, re, shutil, subprocess, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..'))
RES = {'occ': 'occupation', 'major': 'majorimprovement', 'minor': 'minorimprovement', 'action': 'action'}


def size(path):
    out = subprocess.run(['sips', '-g', 'pixelWidth', '-g', 'pixelHeight', path],
                         capture_output=True, text=True, check=True).stdout
    return int(re.search(r'pixelWidth: (\d+)', out).group(1)), int(re.search(r'pixelHeight: (\d+)', out).group(1))


def crop(src, dst, c):
    """c holds fractions of the source: x, y, w, h."""
    W, H = size(src)
    x, y = round(c['x'] * W), round(c['y'] * H)
    w, h = min(W - x, round(c['w'] * W)), min(H - y, round(c['h'] * H))
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, 'c.png')
        # sips sometimes ignores the crop when an offset is 0 and says nothing; check the result,
        # and on a miss nudge the offset by a pixel.
        for ox, oy in ((x, y), (max(x, 1), max(y, 1))):
            ox, oy = min(ox, W - w), min(oy, H - h)
            subprocess.run(['sips', '-c', str(h), str(w), '--cropOffset', str(oy), str(ox), src, '--out', out],
                           check=True, capture_output=True)
            if size(out) == (w, h):
                break
        else:
            sys.exit(f'sips would not crop {src}')
        shutil.move(out, dst)
    return f'{W}x{H} -> {w}x{h} at {x},{y}'


# the picture window of each face in art.js / view3d.js, width / height
FRAME = {'occ': 300 / 420, 'minor': 276 / 212, 'major': 260 / 206, 'action': 186 / 124}


def original(path):
    """The committed version of a resource file, if the working copy differs from it."""
    rel = os.path.relpath(path, ROOT)
    head = subprocess.run(['git', '-C', ROOT, 'show', 'HEAD:' + rel], capture_output=True)
    if head.returncode or head.stdout == open(path, 'rb').read():
        return None
    out = os.path.join(tempfile.mkdtemp(), os.path.basename(path))
    open(out, 'wb').write(head.stdout)
    return out


def source_for(path, c, kind):
    """The picker saves its choices, so a later export repeats a crop that was already applied
    to a kept picture. A crop always has the card frame's shape on the picture it was made on,
    so of the file as it is now and the committed original, use the one that fits."""
    cands = [path] + ([o] if (o := original(path)) else [])
    def miss(p):
        W, H = size(p)
        return abs((c['w'] * W) / (c['h'] * H) / FRAME[kind] - 1)
    best = min(cands, key=miss)
    return best, miss(best)


def main():
    rows = json.load(open(sys.argv[1], encoding='utf-8'))
    for r in rows:
        if r.get('decision') not in ('pick', 'keep'):
            continue
        src = r['file'] if os.path.isabs(r['file']) else os.path.join(ROOT, r['file'])
        slug = re.sub(r'[^a-z0-9]', '', r['id'].lower())
        # a kept picture stays under its own name; a pick replaces it (or becomes it)
        # A pick takes over the file it replaces, so an old name (daylabour.png) is not left
        # behind to fight the new one in the build.
        if r['decision'] == 'keep':
            dst = src
        elif r.get('replaces'):
            dst = os.path.join(ROOT, os.path.splitext(r['replaces'])[0] + '.png')
        else:
            dst = os.path.join(ROOT, 'resource', RES[r['kind']], slug + '.png')
        if r.get('crop'):
            if r['decision'] == 'keep':
                src, miss = source_for(src, r['crop'], r['kind'])
                if miss > 0.03:
                    print(f"  {r['id']}: SKIPPED, the crop fits neither the file nor its original", flush=True)
                    continue
            print(f"  {r['id']}: crop {crop(src, dst, r['crop'])} -> {os.path.relpath(dst, ROOT)}", flush=True)
        elif src != dst:
            shutil.copyfile(src, dst)
            print(f"  {r['id']}: copy -> {os.path.relpath(dst, ROOT)}", flush=True)
    # Tell the picker what has been done, so it clears those decisions instead of exporting
    # them again (which would crop a kept picture a second time).
    log_path = os.path.join(HERE, 'picker_applied.json')
    try:
        log = json.load(open(log_path, encoding='utf-8'))
    except (OSError, ValueError):
        log = {}
    now = int(time.time() * 1000)
    for r in rows:
        if r.get('decision') in ('pick', 'keep'):
            log[r['kind'] + ':' + r['id']] = now
    json.dump(log, open(log_path, 'w', encoding='utf-8'), indent=1)
    subprocess.run([sys.executable, os.path.join(HERE, 'build_card_images.py')], check=True)


if __name__ == '__main__':
    main()
