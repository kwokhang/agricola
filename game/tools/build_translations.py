#!/usr/bin/env python3
"""Turn game/i18n/zh.json into game/i18n/zh.js.

The game opens from file://, where a page cannot read a JSON file, so the JSON you edit is
wrapped as a script. Edit zh.json, then run:

    python3 game/tools/build_translations.py

`--extract` rebuilds zh.json from the current game data (overwrites your edits).
"""
import json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..'))
SRC = os.path.join(GAME, 'i18n', 'zh.json')
OUT = os.path.join(GAME, 'i18n', 'zh.js')

EXTRACT_JS = r"""
const fs = require('fs'), vm = require('vm');
const ctx = { console, Math, JSON, Object, Array, String, Number, Set, Map };
vm.createContext(ctx);
for (const f of ['../data.js', 'cards.js', 'engine.js'])
  vm.runInContext(fs.readFileSync(f, 'utf8').replace(/^(const|let) /mg, 'var '), ctx, { filename: f });
const cards = {};
for (const c of ctx.CARDS) {
  if (c.type === 'rnd' || cards[c.en]) continue;
  cards[c.en] = { zh: c.zh, text: c.txz || '' };
}
const spaces = {};
for (const s of ctx.BASE_SPACES.concat(ctx.ROUND_SPACES)) spaces[s.id] = { en: s.en, zh: s.zh };
process.stdout.write(JSON.stringify({
  _說明: '改呢個檔，然後行 python3 game/tools/build_translations.py。cards 用英文卡名做 key，spaces 用行動格 id。',
  cardTypes: { occ: '職業', min: '次要發展', maj: '主要發展' },
  majorRows: { cooking: '煮食', baking: '烤麵包', workshops: '工坊', well: '水井' },
  goods: Object.assign({}, ctx.LABEL, { begging: '乞討' }),
  houses: ctx.HOUSE_ZH,
  steps: ctx.STEP_ZH,
  spaces, cards,
}, null, 2));
"""

def extract():
    out = subprocess.run(['node', '-e', EXTRACT_JS], cwd=GAME, check=True, capture_output=True, text=True).stdout
    open(SRC, 'w', encoding='utf-8').write(out + '\n')
    print('wrote', SRC)

def build():
    data = json.load(open(SRC, encoding='utf-8'))      # fails loudly on a JSON typo
    with open(OUT, 'w', encoding='utf-8') as fh:
        fh.write('// Generated from zh.json by tools/build_translations.py — edit zh.json, not this.\n')
        fh.write('const ZH = ' + json.dumps(data, ensure_ascii=False, indent=1) + ';\n')
    print('wrote', OUT, f"({len(data.get('cards', {}))} cards, {len(data.get('spaces', {}))} spaces)")

if __name__ == '__main__':
    if '--extract' in sys.argv:
        extract()
    build()
