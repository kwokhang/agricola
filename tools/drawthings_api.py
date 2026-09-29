#!/usr/bin/env python3
"""Run a Draw Things script through the Draw Things HTTP API server instead of the app's
Scripts panel.

The script is executed with node against stand-ins for Draw Things' pipeline / canvas /
filesystem objects, which only record what it would paint (prompt, size, seed, file name).
Each picture is then requested from the API server (Draw Things → API Server, HTTP) and saved.
A file that already exists is skipped, so after a crash or a quit just run it again.

    python3 tools/drawthings_api.py SCRIPT.js
    python3 tools/drawthings_api.py SCRIPT.js --dry                          # list only
    python3 tools/drawthings_api.py SCRIPT.js --only "Pig Market" --force    # redo one card

The model, sampler and steps are whatever the app currently has; the script's size and seed
are sent with each request.
"""
import argparse, base64, json, os, subprocess, sys, time, urllib.request

HARNESS = r"""
const fs = require('fs');
const jobs = [];
const cfg = {};
globalThis.pipeline = {
  configuration: cfg,
  prompts: { prompt: '', negativePrompt: '' },
  run(o) {
    const c = o.configuration || cfg;
    jobs.push({ prompt: o.prompt, negative: o.negativePrompt || '', width: c.width, height: c.height,
      seed: c.seed, strength: c.strength, file: null });
  },
};
globalThis.canvas = { clear() {}, saveImage(p) { jobs[jobs.length - 1].file = p; } };
globalThis.filesystem = { pictures: { path: process.argv[2] } };
console.log = () => {};
eval(fs.readFileSync(process.argv[1], 'utf8'));
process.stdout.write(JSON.stringify(jobs));
"""


def jobs_of(script, outdir):
    out = subprocess.run(['node', '-e', HARNESS, script, outdir], capture_output=True, text=True)
    if out.returncode:
        sys.exit('node could not run the script:\n' + out.stderr)
    return json.loads(out.stdout)


def paint(host, job, timeout):
    body = {'prompt': job['prompt'], 'negative_prompt': job['negative'], 'width': job['width'],
            'height': job['height'], 'seed': job['seed'], 'strength': job.get('strength') or 1.0,
            'loras': [], 'batch_count': 1, 'batch_size': 1}
    req = urllib.request.Request(host.rstrip('/') + '/sdapi/v1/txt2img', data=json.dumps(body).encode(),
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = json.load(r)
    return base64.b64decode(data['images'][0])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('script')
    ap.add_argument('--host', default='http://127.0.0.1:7860')
    ap.add_argument('--dir', default=os.path.expanduser('~/Pictures'))
    ap.add_argument('--only', action='append', default=[], help='file name must contain this (repeatable)')
    ap.add_argument('--force', action='store_true', help='repaint files that already exist')
    ap.add_argument('--dry', action='store_true')
    ap.add_argument('--timeout', type=int, default=600)
    args = ap.parse_args()

    jobs = [j for j in jobs_of(args.script, args.dir) if j['file']]
    if args.only:
        keys = [o.lower().replace(' ', '').replace('-', '').replace("'", '') for o in args.only]
        jobs = [j for j in jobs if any(k in os.path.basename(j['file']) for k in keys)]
    todo = [j for j in jobs if args.force or not os.path.exists(j['file'])]
    print(f'{len(jobs)} pictures in the script, {len(jobs) - len(todo)} already there, {len(todo)} to paint', flush=True)
    if args.dry:
        for j in todo:
            print(f"  {os.path.basename(j['file'])}  {j['width']}x{j['height']}  seed {j['seed']}")
        return

    t0 = time.time()
    for n, j in enumerate(todo, 1):
        name = os.path.basename(j['file'])
        t = time.time()
        for tries in range(3):
            try:
                png = paint(args.host, j, args.timeout)
                break
            except Exception as e:           # the server drops a request now and then; try again
                print(f'  {name}: {e} (try {tries + 1})', flush=True)
                time.sleep(5)
        else:
            sys.exit(f'giving up at {name}; run again to carry on from here')
        tmp = j['file'] + '.part'
        open(tmp, 'wb').write(png)
        os.replace(tmp, j['file'])
        left = (time.time() - t0) / n * (len(todo) - n)
        print(f'({n}/{len(todo)}) {name}  {time.time() - t:.0f}s   about {left / 60:.0f} min left', flush=True)
    print(f'done: {len(todo)} pictures in {(time.time() - t0) / 60:.1f} min')


if __name__ == '__main__':
    main()
