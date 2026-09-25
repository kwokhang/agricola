// Applies i18n/zh.js (generated from i18n/zh.json) over the built-in Chinese text, so the
// wording can be edited in one JSON file. Loaded after engine.js and art.js.
(function () {
  if (typeof ZH === 'undefined') return;
  const cards = ZH.cards || {};
  for (const c of CARDS) {
    const t = cards[c.en];
    if (!t) continue;
    if (t.zh) c.zh = t.zh;
    if (t.text != null) c.txz = t.text;
  }
  const spaces = ZH.spaces || {};
  for (const s of BASE_SPACES.concat(ROUND_SPACES)) {
    if (spaces[s.id] && spaces[s.id].zh) s.zh = spaces[s.id].zh;
  }
  Object.assign(LABEL, ZH.goods || {});
  Object.assign(HOUSE_ZH, ZH.houses || {});
  Object.assign(STEP_ZH, ZH.steps || {});
  Object.assign(ART.NAMES, ZH.goods || {});
  for (const k of Object.keys(ZH.cardTypes || {})) {
    if (ART.TYPE_BAND[k]) ART.TYPE_BAND[k].zh = ZH.cardTypes[k];
  }
})();

// A saved game holds its own copies of the cards; give them the current wording.
function refreshCardText(G) {
  if (!G) return;
  const byEn = {};
  for (const c of CARDS) if (!byEn[c.en]) byEn[c.en] = c;
  const fix = (c) => { const src = c && byEn[c.en]; if (src) { c.zh = src.zh; c.txz = src.txz; } };
  (G.majors || []).forEach(fix);
  for (const p of G.players || []) {
    [].concat(p.hand ? p.hand.occ : [], p.hand ? p.hand.min : [], p.played || []).forEach(fix);
  }
}
