// Agricola (Revised Edition, 2016) — 1–2 player game engine
// Pure state + rules. No DOM. Card texts come from ../data.js (CARDS);
// card effects come from cards.js (CARD_FX / CARD_CHOICE), which loads first.

const ROWS = 3, COLS = 5, TILES = ROWS * COLS;
const RES = ['food', 'wood', 'clay', 'reed', 'stone', 'grain', 'veg'];
const BUILD_RES = ['wood', 'clay', 'reed', 'stone'];
const ANIM = ['sheep', 'boar', 'cattle'];
const LABEL = {
  food: '食物', wood: '木材', clay: '黏土', reed: '蘆葦', stone: '石頭',
  grain: '穀物', veg: '蔬菜', sheep: '綿羊', boar: '野豬', cattle: '牛',
};
const ICON = {
  food: '🍲', wood: '🪵', clay: '🧱', reed: '🌾', stone: '🪨',
  grain: '🌽', veg: '🥕', sheep: '🐑', boar: '🐗', cattle: '🐄',
};
const HOUSE_ZH = { wood: '木屋', clay: '黏土屋', stone: '石屋' };
const HARVEST_ROUNDS = [4, 7, 9, 11, 13, 14];
const AFTER_HARVEST_ROUNDS = [5, 8, 10, 12, 14];   // rounds immediately following a harvest

// ---------------------------------------------------------------- action spaces
const BASE_SPACES = [
  { id: 'farmland',       en: 'Farmland',        zh: '農田',     steps: ['plow'] },
  { id: 'grain_seeds',    en: 'Grain Seeds',     zh: '穀物種子', gain: { grain: 1 } },
  { id: 'farm_expansion', en: 'Farm Expansion',  zh: '農場擴建', steps: ['build'] },
  { id: 'meeting_place',  en: 'Meeting Place',   zh: '集會所',   startPlayer: true, steps: ['playMinor'] },
  { id: 'lessons',        en: 'Lessons',         zh: '授課',     steps: ['playOcc'] },
  { id: 'day_laborer',    en: 'Day Laborer',     zh: '散工',     gain: { food: 2 } },
  { id: 'forest',         en: 'Forest',          zh: '森林',     accum: { wood: 3 }, accumSolo: { wood: 2 } },
  { id: 'clay_pit',       en: 'Clay Pit',        zh: '黏土坑',   accum: { clay: 1 } },
  { id: 'reed_bank',      en: 'Reed Bank',       zh: '蘆葦地',   accum: { reed: 1 } },
  { id: 'fishing',        en: 'Fishing',         zh: '捕魚',     accum: { food: 1 } },
];

const ROUND_SPACES = [
  { id: 'major',          stage: 1, en: 'Major Improvement',   zh: '主要發展',     steps: ['playImprovement'] },
  { id: 'sheep_market',   stage: 1, en: 'Sheep Market',        zh: '綿羊市場',     accum: { sheep: 1 } },
  { id: 'fencing',        stage: 1, en: 'Fencing',             zh: '建柵欄',       steps: ['fences'] },
  { id: 'grain_util',     stage: 1, en: 'Grain Utilization',   zh: '穀物利用',     steps: ['sow', 'bake'], andOr: true },
  { id: 'family_growth',  stage: 2, en: 'Family Growth',       zh: '家庭成長',     steps: ['growth', 'playMinor'] },
  { id: 'renovation',     stage: 2, en: 'House Redevelopment', zh: '翻新房屋',     steps: ['renovate', 'playImprovement'] },
  { id: 'west_quarry',    stage: 2, en: 'Western Quarry',      zh: '西採石場',     accum: { stone: 1 } },
  { id: 'veg_seeds',      stage: 3, en: 'Vegetable Seeds',     zh: '蔬菜種子',     gain: { veg: 1 } },
  { id: 'pig_market',     stage: 3, en: 'Pig Market',          zh: '野豬市場',     accum: { boar: 1 } },
  { id: 'cattle_market',  stage: 4, en: 'Cattle Market',       zh: '牛市場',       accum: { cattle: 1 } },
  { id: 'east_quarry',    stage: 4, en: 'Eastern Quarry',      zh: '東採石場',     accum: { stone: 1 } },
  { id: 'cultivation',    stage: 5, en: 'Cultivation',         zh: '耕作',         steps: ['plow', 'sow'], andOr: true },
  { id: 'urgent_growth',  stage: 5, en: 'Urgent Family Growth', zh: '緊急家庭成長', steps: ['growthAny'] },
  { id: 'farm_redev',     stage: 6, en: 'Farm Redevelopment',  zh: '農場改建',     steps: ['renovate', 'fences'] },
];

// The printed 1–2 player board: a small board of six fixed spaces, then the big board
// with the accumulation strip on the left and the round spaces in stage columns.
const BOARD_LAYOUT = {
  small: ['farm_expansion', 'meeting_place', 'grain_seeds', 'farmland', 'lessons', 'day_laborer'],
  accum: ['forest', 'clay_pit', 'reed_bank', 'fishing'],
  roundCols: [[1], [2, 3, 4], [5, 6, 7], [8, 9], [10, 11], [12, 13], [14]],
};
// "The four action spaces above Fishing" — the round-1 slot plus the three resource spaces.
const ABOVE_FISHING = ['forest', 'clay_pit', 'reed_bank'];

const STEP_ZH = {
  plow: '犁田', build: '建房間／馬廄', fences: '建柵欄', sow: '播種', bake: '烤麵包',
  growth: '家庭成長', growthAny: '家庭成長（免空房）', renovate: '翻新房屋',
  playMinor: '打次要發展', playOcc: '打職業', playImprovement: '打發展卡',
  playAny: '打職業或次要發展', minipasture: '免費圍 1 格牧場', freestable: '免費建 1 個馬廄',
  cottager: '建 1 間房或翻新',
};

const ROOM_COST = { wood: { wood: 5, reed: 2 }, clay: { clay: 5, reed: 2 }, stone: { stone: 5, reed: 2 } };
const HOUSE_RES = { wood: 'wood', clay: 'clay', stone: 'stone' };
const NEXT_HOUSE = { wood: 'clay', clay: 'stone', stone: null };

// Baking rates for the major improvements that allow "Bake Bread".
const OVENS = {
  'Fireplace':      { food: 2, max: Infinity, zh: '火爐' },
  'Cooking Hearth': { food: 3, max: Infinity, zh: '烹飪爐灶' },
  'Clay Oven':      { food: 5, max: 1, zh: '黏土烤爐' },
  'Stone Oven':     { food: 4, max: 2, zh: '石烤爐' },
};
// "At any time" cooking conversions from Fireplace / Cooking Hearth.
const COOK = {
  'Fireplace':      { veg: 2, sheep: 2, boar: 2, cattle: 3 },
  'Cooking Hearth': { veg: 3, sheep: 2, boar: 3, cattle: 4 },
};

// ---------------------------------------------------------------- helpers
const rc = (i) => [Math.floor(i / COLS), i % COLS];
const idx = (r, c) => r * COLS + c;
const inBoard = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;

function shuffle(a, rng) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Fence edge ids. Horizontal: 'h:r:c' for r in 0..ROWS (edge above row r), c in 0..COLS-1.
// Vertical:  'v:r:c' for r in 0..ROWS-1, c in 0..COLS (edge left of column c).
function edgeBetween(r, c, dir) {
  if (dir === 'N') return `h:${r}:${c}`;
  if (dir === 'S') return `h:${r + 1}:${c}`;
  if (dir === 'W') return `v:${r}:${c}`;
  return `v:${r}:${c + 1}`;
}
const DIRS = [['N', -1, 0], ['S', 1, 0], ['W', 0, -1], ['E', 0, 1]];

function allEdges() {
  const out = [];
  for (let r = 0; r <= ROWS; r++) for (let c = 0; c < COLS; c++) out.push(`h:${r}:${c}`);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c <= COLS; c++) out.push(`v:${r}:${c}`);
  return out;
}

function edgeTiles(e) {
  const [k, a, b] = e.split(':').map((x, i) => (i ? +x : x));
  const out = [];
  if (k === 'h') {
    if (inBoard(a - 1, b)) out.push(idx(a - 1, b));
    if (inBoard(a, b)) out.push(idx(a, b));
  } else {
    if (inBoard(a, b - 1)) out.push(idx(a, b - 1));
    if (inBoard(a, b)) out.push(idx(a, b));
  }
  return out;
}

const tileEdges = (t) => { const [r, c] = rc(t); return DIRS.map(([d]) => edgeBetween(r, c, d)); };

// ---------------------------------------------------------------- card effect plumbing
const FX = () => (typeof CARD_FX === 'undefined' ? {} : CARD_FX);

function hasCard(p, en) { return p.played.some((c) => c.en === en); }
function countCard(p, en) { return p.played.filter((c) => c.en === en).length; }

// Run one hook over the cards a player has in front of them, in the order played.
function fire(hook, ctx) {
  const fx = FX();
  for (const c of ctx.p.played.slice()) {
    const h = fx[c.en];
    if (h && h[hook]) h[hook](ctx, c);
  }
  return ctx;
}

// Run one hook over every player's cards — for "each time any player…" effects.
function fireAll(G, hook, ctx) {
  const fx = FX();
  for (const owner of G.players) {
    for (const c of owner.played.slice()) {
      const h = fx[c.en];
      if (h && h[hook]) h[hook](Object.assign({}, ctx, { p: owner, owner }), c);
    }
  }
}

// ---------------------------------------------------------------- player farm
function newPlayer(name) {
  const farm = [];
  for (let i = 0; i < TILES; i++) farm.push({ kind: 'empty', stable: false, crop: null, animals: null });
  farm[idx(0, 0)].kind = 'room';
  farm[idx(1, 0)].kind = 'room';
  return {
    name,
    house: 'wood',
    farm,
    fences: {},               // edge id -> true
    supply: { food: 0, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, veg: 0 },
    people: 2,
    workersLeft: 0,
    newborn: 0,               // born this round; eats 1 at the next harvest
    pets: [],                 // animals living in the house
    begging: 0,
    hand: { occ: [], min: [] },
    played: [],               // card objects
    occPlayed: 0,
    bonusVp: 0,               // points already banked by cards (Big Country, Mantelpiece)
    futures: {},              // round number -> {res: n} waiting on that round space
    used: {},                 // once-per-round card uses: id -> round number
    turnFlags: {},            // cleared whenever this player starts a new placement
    gainedBuild: 0,           // building resources gained this work phase (Clay Pipe)
    moldboard: 0,             // Moldboard Plow: field tiles left on the card
    grocer: 0,                // Grocer: index into the goods pile
    noRenovate: false,        // Mantelpiece
    beanfield: null,          // Beanfield: {crop: {kind:'veg', n}} or {crop:null}
    caravan: false,           // Caravan: room for 1 extra person
    log: [],
  };
}

// Connected groups of empty tiles, split by fences.
function regions(p) {
  const seen = new Array(TILES).fill(false);
  const out = [];
  for (let i = 0; i < TILES; i++) {
    if (seen[i] || p.farm[i].kind !== 'empty') continue;
    const tiles = [], queue = [i];
    seen[i] = true;
    let enclosed = true;
    while (queue.length) {
      const t = queue.pop();
      tiles.push(t);
      const [r, c] = rc(t);
      for (const [d, dr, dc] of DIRS) {
        if (p.fences[edgeBetween(r, c, d)]) continue;   // fence: region boundary, fine
        const nr = r + dr, nc = c + dc;
        if (!inBoard(nr, nc)) { enclosed = false; continue; }   // open board edge
        const n = idx(nr, nc);
        if (p.farm[n].kind !== 'empty') { enclosed = false; continue; }  // leaks into room/field
        if (!seen[n]) { seen[n] = true; queue.push(n); }
      }
    }
    const stables = tiles.filter((t) => p.farm[t].stable).length;
    let kind = null, count = 0;
    for (const t of tiles) {
      const a = p.farm[t].animals;
      if (a && a.n > 0) { kind = a.kind; count += a.n; }
    }
    const g = { tiles, enclosed, stables, kind, count, capacity: 0 };
    if (enclosed) {
      const ctx = { p, region: g, extra: 0 };
      fire('capacity', ctx);
      g.capacity = tiles.length * 2 * Math.pow(2, stables) + ctx.extra;
    }
    out.push(g);
  }
  return out;
}

function regionOf(p, tile, regs) {
  return (regs || regions(p)).find((g) => g.tiles.includes(tile)) || null;
}

// A stable outside any pasture holds exactly 1 animal.
function looseStables(p, regs) {
  regs = regs || regions(p);
  const out = [];
  for (const g of regs) if (!g.enclosed) for (const t of g.tiles) if (p.farm[t].stable) out.push(t);
  return out;
}

function pastureList(p, regs) { return (regs || regions(p)).filter((g) => g.enclosed); }

// Fences can never be taken down, so a fenced-in space stays a pasture: no fields,
// no rooms. Stables are the exception — they are meant to go inside pastures.
function inPasture(p, tile, regs) {
  const g = regionOf(p, tile, regs);
  return !!(g && g.enclosed);
}

function stableCount(p) { return p.farm.filter((t) => t.stable).length; }
function fenceCount(p) { return Object.keys(p.fences).length; }
function roomCount(p) { return p.farm.filter((t) => t.kind === 'room').length; }
function fieldCount(p) { return p.farm.filter((t) => t.kind === 'field').length; }
function livingSpace(p) { return roomCount(p) + (p.caravan ? 1 : 0); }
function petCap(p) { return hasCard(p, 'Animal Tamer') ? roomCount(p) : 1; }

// Every fence must border a pasture — you may not build fences that enclose nothing.
function fencesValid(p) {
  const pastTiles = new Set();
  for (const g of pastureList(p)) for (const t of g.tiles) pastTiles.add(t);
  for (const e of Object.keys(p.fences)) {
    if (!edgeTiles(e).some((t) => pastTiles.has(t))) return false;
  }
  return true;
}

function animalTotal(p, kind) {
  let n = 0;
  for (const t of p.farm) if (t.animals && t.animals.kind === kind) n += t.animals.n;
  for (const pet of p.pets) if (pet.kind === kind) n++;
  return n;
}

// ---------------------------------------------------------------- costs
function canPay(p, cost) {
  if (!cost) return true;
  return Object.keys(cost).every((k) =>
    ANIM.includes(k) ? animalTotal(p, k) >= cost[k] : (p.supply[k] || 0) >= cost[k]);
}

function pay(G, p, cost) {
  if (!cost) return;
  for (const k of Object.keys(cost)) {
    if (ANIM.includes(k)) { for (let i = 0; i < cost[k]; i++) removeAnimal(p, k); }
    else p.supply[k] -= cost[k];
  }
}

function gain(G, p, g, why) {
  const got = {};
  for (const k of Object.keys(g)) {
    if (!g[k]) continue;
    if (ANIM.includes(k)) { autoPlaceAnimal(G, p, k, g[k]); continue; }
    p.supply[k] = (p.supply[k] || 0) + g[k];
    if (BUILD_RES.includes(k)) p.gainedBuild += g[k];
    got[k] = g[k];
  }
  if (G && why && Object.keys(got).length) logEvent(G, `${p.name} ${why} ${costText(got)}`);
  return got;
}

// Spelled out ("3 木材、2 蘆葦") rather than emoji, which never matched the drawn icons.
function costText(cost) {
  if (!cost || !Object.keys(cost).length) return '免費';
  return Object.keys(cost).map((k) => `${cost[k]} ${LABEL[k] || k}`).join('、');
}

// Cost after every card modifier the player has in play.
function modCost(G, p, what, base, extra) {
  const ctx = { G, p, what, cost: Object.assign({}, base), extra: extra || {} };
  fire('costMod', ctx);
  // A card that changes its own cost (Bottles) is not in front of the player yet.
  const self = ctx.extra.card && FX()[ctx.extra.card.en];
  if (self && self.costMod && !hasCard(p, ctx.extra.card.en)) self.costMod(ctx, ctx.extra.card);
  for (const k of Object.keys(ctx.cost)) if (ctx.cost[k] <= 0) delete ctx.cost[k];
  return ctx.cost;
}

function roomCost(G, p) { return modCost(G, p, 'room', ROOM_COST[p.house], { house: p.house }); }

function renovateCost(G, p) {
  const next = nextHouse(p);
  if (!next) return null;
  const mat = HOUSE_RES[next];
  return modCost(G, p, 'renovate', { reed: 1, [mat]: roomCount(p) }, { to: next });
}

function nextHouse(p) {
  if (p.noRenovate) return null;
  if (p.house === 'wood' && hasCard(p, 'Conservator')) return 'stone';
  return NEXT_HOUSE[p.house];
}

function cardCost(G, p, card) {
  if (card.type === 'occ') return occCost(G, p);
  return modCost(G, p, card.type === 'maj' ? 'major' : 'minor', card.cost || {}, { card });
}

function occCost(G, p) {
  if (G && G.pending && G.pending.data && G.pending.data.occCostFixed != null) {
    return p.occPlayed === 0 && G.pending.data.occCostFixed === 0 ? {} : { food: G.pending.data.occCostFixed };
  }
  return p.occPlayed === 0 ? {} : { food: 1 };
}

// ---------------------------------------------------------------- game setup
function newGame(names, seed) {
  let s = seed >>> 0 || ((Date.now() ^ Math.floor(Math.random() * 4294967296)) >>> 0);
  const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

  const n = names.length;
  const players = names.map(newPlayer);


  const occ = shuffle(CARDS.filter((c) => c.type === 'occ' && c.p <= n).map((c, i) => ({ ...c, uid: 'o' + i })), rng);
  const min = shuffle(CARDS.filter((c) => c.type === 'min' && c.p <= n).map((c, i) => ({ ...c, uid: 'm' + i })), rng);
  players.forEach((p) => { p.hand.occ = occ.splice(0, 7); p.hand.min = min.splice(0, 7); });

  // 14 round cards: shuffled within each stage, stages in order.
  const byStage = {};
  ROUND_SPACES.forEach((r) => { (byStage[r.stage] = byStage[r.stage] || []).push(r.id); });
  const order = [];
  for (let st = 1; st <= 6; st++) order.push(...shuffle(byStage[st].slice(), rng));

  // The starting player is drawn at random (after the shuffles, once the generator is well
  // mixed); they get 2 food, the other player 3.
  const first = n > 1 ? Math.floor(rng() * n) : 0;
  players.forEach((p, i) => { p.supply.food = n === 1 ? 0 : (i === first ? 2 : 3); });

  const spaces = {};
  BASE_SPACES.forEach((s2) => { spaces[s2.id] = { id: s2.id, revealed: true, occupiedBy: null, goods: {} }; });
  ROUND_SPACES.forEach((s2) => { spaces[s2.id] = { id: s2.id, revealed: false, occupiedBy: null, goods: {} }; });

  const G = {
    players, n, round: 0, phase: 'setup', startPlayer: first, current: first,
    roundOrder: order, spaces,
    majors: CARDS.filter((c) => c.type === 'maj').map((c, i) => ({ ...c, uid: 'M' + i, taken: null })),
    pending: null, staging: null, feeding: null, choice: null, over: false, log: [],
  };
  beginRound(G);
  if (n > 1) logEvent(G, `隨機決定由 ${players[first].name} 先開始`);
  return G;
}

// ---------------------------------------------------------------- printed board text
// What a space actually does, spelled out for its name plate. Costs follow the player
// whose board is on screen, so a clay house shows clay room costs. Both the DOM board
// and the 3D table print the same words.
function costWords(c) {
  if (!c || !Object.keys(c).length) return '免費';
  return Object.keys(c).map((k) => `${c[k]} ${LABEL[k]}`).join('＋');
}

function accumWords(G, def) {
  const a = (G.n === 1 && def.accumSolo) ? def.accumSolo : def.accum;
  return Object.keys(a).map((k) => `${a[k]} ${LABEL[k]}`).join('＋');
}

function renovateWords(G, p) {
  const c = renovateCost(G, p);
  return c ? `翻新 ${costWords(c)}` : (p.noRenovate ? '不可再翻新' : '已是石屋，無需翻新');
}

function spaceNotes(G, p, def) {
  if (def.accum) return [`每回合累積 ${accumWords(G, def)}`, '放置工人即取走格上全部物資'];
  switch (def.id) {
    case 'farmland': return ['犁 1 塊田', '第一塊可任選，之後須相鄰'];
    case 'grain_seeds': return ['取 1 穀物'];
    case 'farm_expansion': return [`房間 ${costWords(roomCost(G, p))}`, '馬廄 2 木材（最多 4 個）'];
    case 'meeting_place': return ['取得起始玩家標記', '之後可打 1 張次要發展'];
    case 'lessons': return ['打 1 張職業', '第 1 張免費，之後 1 食物'];
    case 'day_laborer': return ['取 2 食物'];
    case 'major': return ['打 1 張主要或次要發展'];
    case 'fencing': return ['建造柵欄，每條 1 木材', '最多 15 條，須圍成封閉區域'];
    case 'grain_util': return ['播種 and/or 烤麵包', '穀物田變為 3、蔬菜田變為 2'];
    case 'family_growth': return ['家庭成長（須有空房間）', '之後可打 1 張次要發展'];
    case 'renovation': return [renovateWords(G, p), '之後可打 1 張發展卡'];
    case 'veg_seeds': return ['取 1 蔬菜'];
    case 'cultivation': return ['犁 1 塊田 and/or 播種'];
    case 'urgent_growth': return ['家庭成長 +1 人', '無需空房間'];
    case 'farm_redev': return [renovateWords(G, p), '之後可建造柵欄'];
    default: return [];
  }
}

function spaceDef(id) {
  return BASE_SPACES.find((s) => s.id === id) || ROUND_SPACES.find((s) => s.id === id);
}

// Which round number a round card is revealed on, or 0 for the fixed spaces.
function roundOf(G, id) { return G.roundOrder.indexOf(id) + 1; }

function logEvent(G, msg) {
  G.log.unshift(`R${G.round || '-'} ${msg}`);
  if (G.log.length > 300) G.log.pop();
}

// ---------------------------------------------------------------- round flow
function beginRound(G) {
  G.round++;
  if (G.round > 14) { G.phase = 'scoring'; G.over = true; return; }

  // 1. Replenishment: reveal the round card, then top up every accumulation space.
  const newId = G.roundOrder[G.round - 1];
  G.spaces[newId].revealed = true;
  logEvent(G, `新行動卡：${spaceDef(newId).zh}`);

  for (const id of Object.keys(G.spaces)) {
    const sp = G.spaces[id], def = spaceDef(id);
    if (!sp.revealed) continue;
    const acc = (G.n === 1 && def.accumSolo) ? def.accumSolo : def.accum;
    if (!acc) continue;
    for (const k of Object.keys(acc)) sp.goods[k] = (sp.goods[k] || 0) + acc[k];
  }

  // Goods that cards parked on this round space are handed out now.
  for (const p of G.players) {
    const due = p.futures[G.round];
    if (due) {
      gain(G, p, due, '從回合格取得');
      delete p.futures[G.round];
    }
  }

  // 2. Work phase. Newborns from the previous round are now full members.
  G.players.forEach((p) => {
    p.newborn = 0;
    p.workersLeft = p.people;
    p.used = {};
    p.turnFlags = {};
    p.gainedBuild = 0;
    fire('onRoundStart', { G, p, round: G.round });
  });
  G.phase = 'work';
  G.current = G.startPlayer;
  skipEmptyHanded(G);
}

function skipEmptyHanded(G) {
  for (let i = 0; i < G.n; i++) {
    if (G.players[G.current].workersLeft > 0) return;
    G.current = (G.current + 1) % G.n;
  }
  endWorkPhase(G);
}

function workDone(G) { return G.players.every((p) => p.workersLeft === 0); }

function endWorkPhase(G) {
  // 3. Returning home.
  for (const id of Object.keys(G.spaces)) G.spaces[id].occupiedBy = null;
  for (const p of G.players) fire('onReturnHome', { G, p });

  if (HARVEST_ROUNDS.includes(G.round)) startHarvest(G);
  else beginRound(G);
}

// ---------------------------------------------------------------- placing a worker
function canPlace(G, spaceId) {
  const sp = G.spaces[spaceId];
  if (!sp || !sp.revealed) return false;
  if (G.phase !== 'work' || G.pending || G.staging || G.choice) return false;
  if (G.players[G.current].workersLeft < 1) return false;
  if (sp.occupiedBy === null) return true;
  // Sleeping Corner lets you share a family growth space with one other player's person.
  const ctx = { G, p: G.players[G.current], spaceId, share: false };
  fire('canShare', ctx);
  return ctx.share && sp.occupiedBy !== G.current;
}

function placeWorker(G, spaceId) {
  if (!canPlace(G, spaceId)) return false;
  const p = G.players[G.current], sp = G.spaces[spaceId], def = spaceDef(spaceId);
  sp.occupiedBy = G.current;
  p.workersLeft--;
  p.turnFlags = {};
  logEvent(G, `${p.name} → ${def.zh}`);

  if (def.startPlayer) { G.startPlayer = G.current; logEvent(G, `${p.name} 取得起始玩家標記`); }
  if (def.gain) gain(G, p, def.gain, '獲得');
  if (Object.keys(sp.goods).length) {
    const taken = { ...sp.goods };
    sp.goods = {};
    for (const k of Object.keys(taken)) {
      if (ANIM.includes(k)) stageAnimals(G, k, taken[k]);
      else { p.supply[k] += taken[k]; if (BUILD_RES.includes(k)) p.gainedBuild += taken[k]; }
    }
    logEvent(G, `${p.name} 取走 ${costText(taken)}`);
  }

  const steps = (def.steps || []).slice();
  G.pending = { spaceId, steps, i: 0, used: {}, data: {} };

  // Card bonuses fire now, and may append extra steps to this action.
  fire('onSpaceUsed', { G, p, spaceId, def });
  fireAll(G, 'onAnySpaceUsed', { G, actor: p, actorIdx: G.current, spaceId, def });

  if (!G.pending.steps.length) { G.pending = null; finishAction(G); }
  return true;
}

function addStep(G, step) {
  if (!G.pending) return;
  G.pending.steps.push(step);
}

function stageAnimals(G, kind, n) {
  if (G.staging && G.staging.kind !== kind) return false;   // only one kind waiting at a time
  G.staging = G.staging ? { kind, n: G.staging.n + n } : { kind, n };
  return true;
}

function currentStep(G) { return G.pending ? G.pending.steps[G.pending.i] : null; }

function nextStep(G) {
  if (!G.pending) return;
  G.pending.i++;
  if (G.pending.i >= G.pending.steps.length) finishAction(G);
}

function finishAction(G) {
  const wasFree = G.pending && G.pending.free;
  const p = G.players[G.current];
  G.pending = null;
  if (G.staging && G.staging.n > 0) return;   // player must place or discard animals first
  if (wasFree) return;                        // a card action: the turn carries on
  fire('onTurnEnd', { G, p });
  if (G.choice) return;                       // a card is asking something first
  advanceTurn(G);
}

function advanceTurn(G) {
  if (G.phase !== 'work' || G.choice) return;
  if (workDone(G)) { endWorkPhase(G); return; }
  G.current = (G.current + 1) % G.n;
  skipEmptyHanded(G);
}

// ---------------------------------------------------------------- step actions
function canPlow(p, tile) {
  if (p.farm[tile].kind !== 'empty' || p.farm[tile].stable || p.farm[tile].animals) return false;
  if (inPasture(p, tile)) return false;
  if (fieldCount(p) === 0) return true;
  const [r, c] = rc(tile);
  return DIRS.some(([, dr, dc]) => inBoard(r + dr, c + dc) && p.farm[idx(r + dr, c + dc)].kind === 'field');
}

function plow(G, tile) {
  const p = G.players[G.current];
  if (currentStep(G) !== 'plow' || !canPlow(p, tile)) return false;
  p.farm[tile].kind = 'field';
  G.pending.used.plows = (G.pending.used.plows || 0) + 1;
  if (G.pending.data.moldboardPending && G.pending.used.plows > 1) {
    p.moldboard--;
    G.pending.data.moldboardPending = false;
    logEvent(G, `${p.name} 用犁板多犁 1 塊田`);
  }
  logEvent(G, `${p.name} 犁了 1 塊田`);
  nextStep(G);
  return true;
}

function canBuildRoom(p, tile) {
  if (p.farm[tile].kind !== 'empty' || p.farm[tile].stable || p.farm[tile].animals) return false;
  if (inPasture(p, tile)) return false;
  const [r, c] = rc(tile);
  return DIRS.some(([, dr, dc]) => inBoard(r + dr, c + dc) && p.farm[idx(r + dr, c + dc)].kind === 'room');
}

function buildRoom(G, tile) {
  const p = G.players[G.current];
  const step = currentStep(G);
  if ((step !== 'build' && step !== 'cottager') || !canBuildRoom(p, tile)) return false;
  const lim = G.pending.limit && G.pending.limit.room;
  if (lim != null && (G.pending.used.rooms || 0) >= lim) return false;
  const cost = roomCost(G, p);
  if (!canPay(p, cost)) return false;
  pay(G, p, cost);
  p.farm[tile].kind = 'room';
  G.pending.used.rooms = (G.pending.used.rooms || 0) + 1;
  G.pending.used.house = p.house;
  logEvent(G, `${p.name} 建了 1 間${HOUSE_ZH[p.house]}房間（${costText(cost)}）`);
  fire('onBuildRoom', { G, p, house: p.house, n: G.pending.used.rooms });
  if (step === 'cottager') nextStep(G);
  return true;
}

function canBuildStable(p, tile) {
  const t = p.farm[tile];
  return t.kind === 'empty' && !t.stable && stableCount(p) < 4;
}

function buildStable(G, tile) {
  const p = G.players[G.current];
  const step = currentStep(G);
  if (step !== 'build' && step !== 'freestable') return false;
  if (!canBuildStable(p, tile)) return false;
  if (step === 'build' && G.pending.limit && G.pending.limit.stable === 0) return false;
  const free = step === 'freestable';
  if (!free && p.supply.wood < 2) return false;
  if (!free) p.supply.wood -= 2;
  p.farm[tile].stable = true;
  logEvent(G, `${p.name} 建了 1 個馬廄${free ? '（免費）' : ''}`);
  if (free) nextStep(G);
  else G.pending.used.stable = true;
  return true;
}

// Fences cost 1 wood each — or 1 clay with Rammed Clay, and some are free with Hedge Keeper.
function fenceAllowance(G, p) {
  const ctx = { G, p, free: 0, clayOk: false };
  fire('fenceMod', ctx);
  return ctx;
}

function fencePayable(G, p, d) {
  const a = fenceAllowance(G, p);
  const usedFree = (d.free || 0);
  if (usedFree < a.free) return 'free';
  if (p.supply.wood >= 1) return 'wood';
  if (a.clayOk && p.supply.clay >= 1) return 'clay';
  return null;
}

function toggleFence(G, edge) {
  const p = G.players[G.current];
  if (currentStep(G) !== 'fences') return false;
  const d = G.pending.data;
  d.placed = d.placed || [];
  d.paid = d.paid || {};
  if (p.fences[edge]) {
    if (!d.placed.includes(edge)) return false;   // existing fences can never be removed
    delete p.fences[edge];
    d.placed.splice(d.placed.indexOf(edge), 1);
    const how = d.paid[edge];
    if (how === 'wood') p.supply.wood += 1;
    else if (how === 'clay') p.supply.clay += 1;
    else d.free = (d.free || 0) - 1;
    delete d.paid[edge];
    return true;
  }
  if (fenceCount(p) >= 15) return false;
  const how = fencePayable(G, p, d);
  if (!how) return false;
  if (how === 'wood') p.supply.wood -= 1;
  else if (how === 'clay') p.supply.clay -= 1;
  else d.free = (d.free || 0) + 1;
  p.fences[edge] = true;
  d.placed.push(edge);
  d.paid[edge] = how;
  return true;
}

function undoFences(G) {
  const p = G.players[G.current];
  if (currentStep(G) !== 'fences') return false;
  const d = G.pending.data;
  for (const e of (d.placed || []).slice()) toggleFence(G, e);
  return true;
}

function confirmFences(G) {
  const p = G.players[G.current];
  if (currentStep(G) !== 'fences') return false;
  if (!fencesValid(p)) return false;
  const placed = (G.pending.data.placed || []).slice();
  if (placed.length) {
    logEvent(G, `${p.name} 建了 ${placed.length} 條柵欄`);
    const fresh = pastureList(p).filter((g) => g.tiles.some((t) => tileEdges(t).some((e) => placed.includes(e))));
    fire('onPastureMade', { G, p, pastures: fresh });
  }
  nextStep(G);
  return true;
}

// Fence a single empty tile for free (Mini Pasture).
function fenceTile(G, tile) {
  const p = G.players[G.current];
  if (currentStep(G) !== 'minipasture') return false;
  const t = p.farm[tile];
  if (t.kind !== 'empty') return false;
  const need = tileEdges(tile).filter((e) => !p.fences[e]);
  if (fenceCount(p) + need.length > 15) return false;
  const past = pastureList(p);
  if (past.length && !past.some((g) => g.tiles.some((x) => {
    const [r1, c1] = rc(x), [r2, c2] = rc(tile);
    return Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;
  }))) return false;                                // must touch an existing pasture
  need.forEach((e) => { p.fences[e] = true; });
  logEvent(G, `${p.name} 免費圍起 1 格牧場（${need.length} 條柵欄）`);
  fire('onPastureMade', { G, p, pastures: pastureList(p).filter((g) => g.tiles.includes(tile)) });
  nextStep(G);
  return true;
}

function canSow(p, tile) {
  const t = p.farm[tile];
  return t.kind === 'field' && !t.crop;
}

function sow(G, tile, kind) {
  const p = G.players[G.current];
  if (currentStep(G) !== 'sow' || !canSow(p, tile)) return false;
  if (p.supply[kind] < 1) return false;
  p.supply[kind]--;
  p.farm[tile].crop = { kind, n: kind === 'grain' ? 3 : 2 };
  G.pending.used.sow = true;
  logEvent(G, `${p.name} 播種 1 ${LABEL[kind]}`);
  return true;
}

function sowBeanfield(G) {
  const p = G.players[G.current];
  if (currentStep(G) !== 'sow' || !p.beanfield || p.beanfield.crop) return false;
  if (p.supply.veg < 1) return false;
  p.supply.veg--;
  p.beanfield.crop = { kind: 'veg', n: 2 };
  G.pending.used.sow = true;
  logEvent(G, `${p.name} 在豆田播種 1 蔬菜`);
  return true;
}

function ovensOf(p) {
  return p.played.filter((c) => OVENS[c.en]).map((c) => c.en);
}

function bake(G, ovenName) {
  const p = G.players[G.current];
  if (currentStep(G) !== 'bake' || !ovensOf(p).includes(ovenName)) return false;
  const o = OVENS[ovenName];
  const d = G.pending.data;
  d.baked = d.baked || {};
  const used = d.baked[ovenName] || 0;
  if (used >= o.max || p.supply.grain < 1) return false;
  p.supply.grain--;
  let food = o.food;
  const ctx = { G, p, food, oven: ovenName };
  fire('bakeBonus', ctx);
  food = ctx.food;
  p.supply.food += food;
  d.baked[ovenName] = used + 1;
  logEvent(G, `${p.name} 用${o.zh}烤麵包：1 穀物 → ${food} 食物`);
  return true;
}

function canGrow(G, any) {
  const p = G.players[G.current];
  if (p.people >= 5) return false;
  return any || p.people < livingSpace(p);
}

function grow(G) {
  const st = currentStep(G);
  if (st !== 'growth' && st !== 'growthAny') return false;
  if (!canGrow(G, st === 'growthAny')) return false;
  const p = G.players[G.current];
  p.people++;
  p.newborn++;
  logEvent(G, `${p.name} 家庭成長，現有 ${p.people} 人`);
  nextStep(G);
  return true;
}

function renovate(G) {
  const p = G.players[G.current];
  const step = currentStep(G);
  if (step !== 'renovate' && step !== 'cottager') return false;
  const cost = renovateCost(G, p);
  if (!cost || !canPay(p, cost)) return false;
  const from = p.house, to = nextHouse(p);
  pay(G, p, cost);
  p.house = to;
  logEvent(G, `${p.name} 翻新為${HOUSE_ZH[p.house]}（${costText(cost)}）`);
  fire('onRenovate', { G, p, from, to });
  nextStep(G);
  return true;
}

// ---------------------------------------------------------------- playing cards
function playableNow(G) {
  const st = currentStep(G);
  if (st === 'playOcc') return ['occ'];
  if (st === 'playMinor') return ['min'];
  if (st === 'playImprovement') return ['min', 'maj'];
  if (st === 'playAny') return ['occ', 'min'];
  return [];
}

function findCard(G, p, uid) {
  const own = p.hand.occ.concat(p.hand.min).find((c) => c.uid === uid);
  if (own) return { card: own, fromMajors: false };
  const maj = G.majors.find((c) => c.uid === uid && c.taken === null);
  return maj ? { card: maj, fromMajors: true } : null;
}

function playCard(G, uid, opt) {
  const p = G.players[G.current];
  const kinds = playableNow(G);
  if (!kinds.length) return false;
  const found = findCard(G, p, uid);
  if (!found) return false;
  const { card, fromMajors } = found;
  if (!kinds.includes(card.type)) return false;

  // Cooking Hearth may be taken by returning a Fireplace instead of paying clay.
  if (opt === 'alt') {
    if (card.en !== 'Cooking Hearth') return false;
    const fp = p.played.find((c) => c.en === 'Fireplace');
    if (!fp) return false;
    p.played.splice(p.played.indexOf(fp), 1);
    const slot = G.majors.find((c) => c.uid === fp.uid);
    if (slot) slot.taken = null;
    logEvent(G, `${p.name} 退回火爐換取烹飪爐灶`);
  } else {
    const cost = cardCost(G, p, card);
    if (!canPay(p, cost)) return false;
    pay(G, p, cost);
  }

  if (fromMajors) card.taken = G.current;
  else {
    const list = card.type === 'occ' ? p.hand.occ : p.hand.min;
    list.splice(list.findIndex((c) => c.uid === uid), 1);
  }
  if (card.type === 'occ') p.occPlayed++;
  p.played.push(card);
  logEvent(G, `${p.name} 打出 ${card.zh}（${card.en}）`);

  const fx = FX()[card.en];
  if (fx && fx.onPlay) fx.onPlay({ G, p, card });
  if (card.type !== 'occ') fire('onImprovement', { G, p, card });
  if (card.type === 'occ') fire('onOccupation', { G, p, card });

  if (card.trav && G.n === 1) {
    logEvent(G, `單人局：${card.zh} 為旅行卡，結算後移出遊戲`);
  }
  nextStep(G);
  return true;
}

// ---------------------------------------------------------------- animals
// Where a staged animal is allowed to go: the house, a pasture with room for its kind,
// or an empty stable outside any pasture.
function canPlaceAnimal(G, tile) {
  if (!G.staging || G.staging.n < 1) return false;
  const p = G.players[G.current], kind = G.staging.kind, t = p.farm[tile];
  if (t.kind === 'room') return p.pets.length < petCap(p);
  const g = regionOf(p, tile);
  if (!g) return false;
  if (g.enclosed) return (!g.kind || g.kind === kind) && g.count < g.capacity;
  return t.stable && !t.animals;
}

function placeAnimal(G, tile) {
  if (!G.staging || G.staging.n < 1) return false;
  const p = G.players[G.current], kind = G.staging.kind, t = p.farm[tile];
  const regs = regions(p);

  if (t.kind === 'room') {
    if (p.pets.length >= petCap(p)) return false;
    p.pets.push({ kind });
    G.staging.n--;
  } else {
    const g = regionOf(p, tile, regs);
    if (!g) return false;
    if (g.enclosed) {
      if (g.kind && g.kind !== kind) return false;
      if (g.count >= g.capacity) return false;
    } else {
      if (!t.stable || t.animals) return false;   // a lone stable holds exactly 1 animal
    }
    t.animals = t.animals && t.animals.kind === kind ? { kind, n: t.animals.n + 1 } : { kind, n: 1 };
    G.staging.n--;
  }
  if (G.staging.n === 0) {
    const moving = G.staging.moving;
    G.staging = null;
    if (!G.pending && !moving) finishAction(G);   // rearranging is free; it ends nothing
  }
  return true;
}

function discardStaged(G) {
  if (!G.staging) return false;
  const moving = G.staging.moving;
  logEvent(G, `${G.players[G.current].name} ${moving ? '放走' : '放棄'} ${G.staging.n} 隻${LABEL[G.staging.kind]}`);
  G.staging = null;
  if (!G.pending && !moving) finishAction(G);
  return true;
}

// Animals may be rearranged at any time on your turn: pick one up from a pasture, a stable
// or a room, then place it with placeAnimal like a new arrival. Holding animals blocks
// placing a worker until they are put down (or released).
function pickUpAnimal(G, tile) {
  if (G.choice || G.over || G.phase !== 'work' || G.feeding) return false;
  const p = G.players[G.current], t = p.farm[tile];
  let kind = null;
  if (t.kind === 'room') {
    const order = p.farm.reduce((n, q, j) => n + (j < tile && q.kind === 'room' ? 1 : 0), 0);
    const pet = p.pets[order];
    if (!pet || (G.staging && G.staging.kind !== pet.kind)) return false;
    kind = pet.kind;
    p.pets.splice(order, 1);
  } else {
    const g = regionOf(p, tile);
    const tiles = g && g.enclosed ? g.tiles : [tile];
    const src = tiles.find((x) => p.farm[x].animals && p.farm[x].animals.n > 0);
    if (src == null) return false;
    kind = p.farm[src].animals.kind;
    if (G.staging && G.staging.kind !== kind) return false;
    p.farm[src].animals.n--;
    if (p.farm[src].animals.n === 0) p.farm[src].animals = null;
  }
  G.staging = G.staging ? Object.assign({}, G.staging, { n: G.staging.n + 1 }) : { kind, n: 1, moving: true };
  return true;
}

// Free capacity for one more animal of `kind`, used for breeding and for card gifts.
function freeSlot(p, kind) {
  const regs = regions(p);
  for (const g of pastureList(p, regs)) {
    if (g.count < g.capacity && (!g.kind || g.kind === kind)) {
      const t = g.tiles.find((x) => p.farm[x].animals && p.farm[x].animals.kind === kind) ?? g.tiles[0];
      return { tile: t };
    }
  }
  for (const t of looseStables(p, regs)) if (!p.farm[t].animals) return { tile: t };
  if (p.pets.length < petCap(p)) return { pet: true };
  return null;
}

function putAnimal(p, kind, slot) {
  if (slot.pet) { p.pets.push({ kind }); return; }
  const t = p.farm[slot.tile];
  t.animals = t.animals && t.animals.kind === kind ? { kind, n: t.animals.n + 1 } : { kind, n: 1 };
}

// Animals handed out by cards go wherever they fit; anything that does not fit is lost.
function autoPlaceAnimal(G, p, kind, n) {
  let placed = 0;
  for (let i = 0; i < n; i++) {
    const slot = freeSlot(p, kind);
    if (!slot) break;
    putAnimal(p, kind, slot);
    placed++;
  }
  if (G) {
    if (placed) logEvent(G, `${p.name} 獲得 ${placed} 隻${LABEL[kind]}`);
    if (placed < n) logEvent(G, `${p.name} 沒有位置，${n - placed} 隻${LABEL[kind]}流失`);
  }
  return placed;
}

// Put the animals on a specific pasture if it fits (Shepherd's Crook).
function putAnimalsOnPasture(G, p, kind, n, region) {
  let placed = 0;
  for (let i = 0; i < n; i++) {
    const regs = regions(p);
    const g = regs.find((x) => x.enclosed && x.tiles[0] === region.tiles[0]);
    if (!g || g.count >= g.capacity || (g.kind && g.kind !== kind)) break;
    putAnimal(p, kind, { tile: g.tiles.find((t) => p.farm[t].animals && p.farm[t].animals.kind === kind) ?? g.tiles[0] });
    placed++;
  }
  if (placed) logEvent(G, `${p.name} 在新牧場獲得 ${placed} 隻${LABEL[kind]}`);
  return placed;
}

function removeAnimal(p, kind) {
  for (const t of p.farm) {
    if (t.animals && t.animals.kind === kind && t.animals.n > 0) {
      t.animals.n--;
      if (t.animals.n === 0) t.animals = null;
      return true;
    }
  }
  const i = p.pets.findIndex((x) => x.kind === kind);
  if (i >= 0) { p.pets.splice(i, 1); return true; }
  return false;
}

// ---------------------------------------------------------------- free actions
// Everything a player may do outside the normal turn structure: cooking, card
// exchanges, once-per-round card offers. Each entry is plain data so the whole
// game state stays JSON-serialisable.
function freeActions(G, pi) {
  const p = G.players[pi];
  const list = [];
  const acting = (G.feeding ? G.feeding.i : G.current) === pi && !G.over;

  // Cooking is always allowed, for whoever needs food.
  for (const o of cookOptions(p)) {
    list.push({ id: 'cook:' + o.from, card: null,
      label: `煮 1 ${LABEL[o.from]} → ${o.food} 食物`, ok: true });
  }
  if (G.feeding && G.feeding.i === pi) {
    if (p.supply.grain > 0) list.push({ id: 'crop:grain', card: null, label: '1 穀物 → 1 食物', ok: true });
    if (p.supply.veg > 0) list.push({ id: 'crop:veg', card: null, label: '1 蔬菜 → 1 食物', ok: true });
  }

  const ctx = { G, p, pi, list, acting };
  fire('free', ctx);
  return list;
}

function useFree(G, pi, id) {
  const p = G.players[pi];
  if (id.startsWith('cook:')) return cook(G, pi, id.slice(5));
  if (id.startsWith('crop:')) return convertCropToFood(G, pi, id.slice(5));
  const avail = freeActions(G, pi).find((a) => a.id === id);
  if (!avail || !avail.ok) return false;
  const fx = FX()[avail.card];
  if (!fx || !fx.doFree) return false;
  return fx.doFree({ G, p, pi, id }) !== false;
}

function markUsed(G, p, key) { p.used[key] = G.round; }
function usedThisRound(G, p, key) { return p.used[key] === G.round; }

// Start a card-driven mini action that does not consume a worker.
function freePending(G, steps, data) {
  if (G.pending) return false;
  G.pending = { spaceId: null, steps: steps.slice(), i: 0, used: {}, data: data || {}, free: true };
  return true;
}

// ---------------------------------------------------------------- choices
function ask(G, kind, pi, opts, data) {
  G.choice = { kind, pi, opts, data: data || {} };
}

function resolveChoice(G, id) {
  if (!G.choice) return false;
  const ch = G.choice;
  const handler = (typeof CARD_CHOICE === 'undefined' ? {} : CARD_CHOICE)[ch.kind];
  G.choice = null;
  const hold = handler ? handler(G, ch, id) === 'hold' : false;
  if (!hold && !G.pending && !G.staging && !G.choice && G.phase === 'work') advanceTurn(G);
  return true;
}

// ---------------------------------------------------------------- cooking (anytime)
function cookOptions(p) {
  const out = [];
  for (const c of p.played) {
    const rates = COOK[c.en];
    if (!rates) continue;
    for (const k of Object.keys(rates)) {
      const have = k === 'veg' ? p.supply.veg : animalTotal(p, k);
      if (have > 0) out.push({ card: c.en, from: k, food: rates[k] });
    }
  }
  const best = {};
  for (const o of out) if (!best[o.from] || best[o.from].food < o.food) best[o.from] = o;
  return Object.values(best);
}

function cook(G, playerIdx, from) {
  const p = G.players[playerIdx];
  const opt = cookOptions(p).find((o) => o.from === from);
  if (!opt) return false;
  if (from === 'veg') p.supply.veg--;
  else if (!removeAnimal(p, from)) return false;
  p.supply.food += opt.food;
  logEvent(G, `${p.name} 煮食：1 ${LABEL[from]} → ${opt.food} 食物`);
  return true;
}

function convertCropToFood(G, playerIdx, kind) {
  const p = G.players[playerIdx];
  if (p.supply[kind] < 1) return false;
  p.supply[kind]--;
  p.supply.food++;
  logEvent(G, `${p.name} 1 ${LABEL[kind]} → 1 食物`);
  return true;
}

// ---------------------------------------------------------------- harvest
// Newborns of the current round eat 1; everyone else eats 2 (3 in a solo game).
function foodNeeded(G, p) {
  const adults = p.people - p.newborn;
  return adults * (G.n === 1 ? 3 : 2) + p.newborn;
}

function startHarvest(G) {
  G.phase = 'harvest';
  logEvent(G, '=== 收成 ===');

  for (const p of G.players) {
    p.used = {};
    fire('beforeField', { G, p });

    // 1. Field phase: every sown field yields exactly 1 good.
    let got = 0;
    for (const t of p.farm) {
      if (t.crop && t.crop.n > 0) {
        p.supply[t.crop.kind]++;
        got++;
        t.crop.n--;
        if (t.crop.n === 0) t.crop = null;
      }
    }
    if (p.beanfield && p.beanfield.crop && p.beanfield.crop.n > 0) {
      p.supply.veg++;
      got++;
      p.beanfield.crop.n--;
      if (p.beanfield.crop.n === 0) p.beanfield.crop = null;
    }
    if (got) logEvent(G, `${p.name} 收割 ${got} 個作物`);
    fire('onField', { G, p });
  }

  // 2. Feeding phase — needs player input.
  G.feeding = { i: 0 };
  G.current = 0;
}

function feedingPlayer(G) { return G.feeding ? G.players[G.feeding.i] : null; }

function confirmFeed(G) {
  if (!G.feeding) return false;
  const p = G.players[G.feeding.i];
  const need = foodNeeded(G, p);
  if (p.supply.food >= need) p.supply.food -= need;
  else {
    const short = need - p.supply.food;
    p.supply.food = 0;
    p.begging += short;
    logEvent(G, `${p.name} 食物不足，取得 ${short} 個乞討標記`);
  }
  G.feeding.i++;
  G.current = Math.min(G.feeding.i, G.n - 1);
  if (G.feeding.i >= G.n) { G.feeding = null; breedPhase(G); }
  return true;
}

function breedPhase(G) {
  for (const p of G.players) {
    for (const k of ANIM) {
      if (animalTotal(p, k) < 2) continue;
      const slot = freeSlot(p, k);
      if (!slot) { logEvent(G, `${p.name} 的${LABEL[k]}無位繁殖`); continue; }
      putAnimal(p, k, slot);
      logEvent(G, `${p.name} 的${LABEL[k]}繁殖 +1`);
    }
  }
  if (G.round >= 14) { G.phase = 'scoring'; G.over = true; logEvent(G, '=== 遊戲結束 ==='); }
  else beginRound(G);
}

// ---------------------------------------------------------------- scoring
function bracket(n, cuts) {
  for (const [min, pts] of cuts) if (n >= min) return pts;
  return -1;
}
const SCORE_TABLE = {
  field:  [[5, 4], [4, 3], [3, 2], [2, 1]],
  pasture:[[4, 4], [3, 3], [2, 2], [1, 1]],
  grain:  [[8, 4], [6, 3], [4, 2], [1, 1]],
  veg:    [[4, 4], [3, 3], [2, 2], [1, 1]],
  sheep:  [[8, 4], [6, 3], [4, 2], [1, 1]],
  boar:   [[7, 4], [5, 3], [3, 2], [1, 1]],
  cattle: [[7, 4], [5, 3], [3, 2], [1, 1]],
};

function score(G, p) {
  const regs = regions(p);
  const past = pastureList(p, regs);
  const pastTiles = new Set();
  past.forEach((g) => g.tiles.forEach((t) => pastTiles.add(t)));

  let grain = p.supply.grain, veg = p.supply.veg;
  for (const t of p.farm) if (t.crop) { if (t.crop.kind === 'grain') grain += t.crop.n; else veg += t.crop.n; }
  if (p.beanfield && p.beanfield.crop) veg += p.beanfield.crop.n;

  const rows = [];
  const add = (zh, val, pts) => rows.push({ zh, val, pts });

  add('田 Fields', fieldCount(p), bracket(fieldCount(p), SCORE_TABLE.field));
  add('牧場 Pastures', past.length, bracket(past.length, SCORE_TABLE.pasture));
  add('穀物 Grain', grain, bracket(grain, SCORE_TABLE.grain));
  add('蔬菜 Vegetables', veg, bracket(veg, SCORE_TABLE.veg));
  for (const k of ANIM) {
    const n = animalTotal(p, k);
    add(`${LABEL[k]} ${k}`, n, bracket(n, SCORE_TABLE[k]));
  }

  const unused = p.farm.filter((t, i) => t.kind === 'empty' && !t.stable && !pastTiles.has(i)).length;
  add('未用農場格 Unused', unused, -unused);

  const fencedStables = [...pastTiles].filter((t) => p.farm[t].stable).length;
  add('圍柵馬廄 Fenced stables', fencedStables, fencedStables);

  const rooms = roomCount(p);
  const roomPts = p.house === 'clay' ? rooms : p.house === 'stone' ? rooms * 2 : 0;
  add(`${HOUSE_ZH[p.house]}房間 Rooms`, rooms, roomPts);

  add('家庭成員 People', p.people, p.people * 3);
  add('乞討標記 Begging', p.begging, -p.begging * 3);

  const cardVp = p.played.reduce((s, c) => s + (c.vp || 0), 0);
  add('發展卡印分 Card VP', p.played.length, cardVp);

  const ctx = { G, p, pts: 0, detail: [] };
  fire('score', ctx);
  const bonus = ctx.pts + p.bonusVp;
  if (bonus || p.bonusVp) add('卡片獎勵分 Card bonus', ctx.detail.length + (p.bonusVp ? 1 : 0), bonus);

  const total = rows.reduce((s, r) => s + r.pts, 0);
  return { rows, total, bonusDetail: ctx.detail.slice() };
}
