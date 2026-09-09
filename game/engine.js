// Agricola (Revised Edition, 2016) — 1–2 player game engine
// Pure state + rules. No DOM. Card texts come from ../data.js (CARDS).

const ROWS = 3, COLS = 5, TILES = ROWS * COLS;
const RES = ['food', 'wood', 'clay', 'reed', 'stone', 'grain', 'veg'];
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

const STEP_ZH = {
  plow: '犁田', build: '建房間／馬廄', fences: '建柵欄', sow: '播種', bake: '烤麵包',
  growth: '家庭成長', growthAny: '家庭成長（免空房）', renovate: '翻新房屋',
  playMinor: '打次要發展', playOcc: '打職業', playImprovement: '打發展卡（主要或次要）',
};

const ROOM_COST = { wood: { wood: 5, reed: 2 }, clay: { clay: 5, reed: 2 }, stone: { stone: 5, reed: 2 } };
const NEXT_HOUSE = { wood: 'clay', clay: 'stone', stone: null };

// Baking rates for the major improvements that allow "Bake Bread".
const OVENS = {
  'Fireplace':      { food: 2, max: Infinity },
  'Cooking Hearth': { food: 3, max: Infinity },
  'Clay Oven':      { food: 5, max: 1 },
  'Stone Oven':     { food: 4, max: 2 },
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
    pet: null,                // {kind} — one animal may live in the house
    begging: 0,
    hand: { occ: [], min: [] },
    played: [],               // card objects
    occPlayed: 0,
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
    out.push({
      tiles, enclosed, stables, kind, count,
      capacity: enclosed ? tiles.length * 2 * Math.pow(2, stables) : 0,
    });
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

function stableCount(p) { return p.farm.filter((t) => t.stable).length; }
function fenceCount(p) { return Object.keys(p.fences).length; }
function roomCount(p) { return p.farm.filter((t) => t.kind === 'room').length; }
function fieldCount(p) { return p.farm.filter((t) => t.kind === 'field').length; }

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
  if (p.pet && p.pet.kind === kind) n++;
  return n;
}

// ---------------------------------------------------------------- costs
function canPay(p, cost) {
  if (!cost) return true;
  return Object.keys(cost).every((k) => (p.supply[k] || 0) >= cost[k]);
}
function pay(p, cost) {
  if (!cost) return;
  for (const k of Object.keys(cost)) p.supply[k] -= cost[k];
}
function gain(p, g) {
  for (const k of Object.keys(g)) p.supply[k] = (p.supply[k] || 0) + g[k];
}
function costText(cost) {
  if (!cost || !Object.keys(cost).length) return '免費';
  return Object.keys(cost).map((k) => `${ICON[k] || ''}${cost[k]}`).join(' ');
}

// ---------------------------------------------------------------- game setup
function newGame(names, seed) {
  let s = seed >>> 0 || (Date.now() >>> 0);
  const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

  const n = names.length;
  const players = names.map(newPlayer);
  players[0].supply.food = n === 1 ? 0 : 2;
  if (n > 1) players[1].supply.food = 3;

  const occ = shuffle(CARDS.filter((c) => c.type === 'occ' && c.p <= n).map((c, i) => ({ ...c, uid: 'o' + i })), rng);
  const min = shuffle(CARDS.filter((c) => c.type === 'min' && c.p <= n).map((c, i) => ({ ...c, uid: 'm' + i })), rng);
  players.forEach((p) => { p.hand.occ = occ.splice(0, 7); p.hand.min = min.splice(0, 7); });

  // 14 round cards: shuffled within each stage, stages in order.
  const byStage = {};
  ROUND_SPACES.forEach((r) => { (byStage[r.stage] = byStage[r.stage] || []).push(r.id); });
  const order = [];
  for (let st = 1; st <= 6; st++) order.push(...shuffle(byStage[st].slice(), rng));

  const spaces = {};
  BASE_SPACES.forEach((s2) => { spaces[s2.id] = { id: s2.id, revealed: true, occupiedBy: null, goods: {} }; });
  ROUND_SPACES.forEach((s2) => { spaces[s2.id] = { id: s2.id, revealed: false, occupiedBy: null, goods: {} }; });

  const G = {
    players, n, round: 0, phase: 'setup', startPlayer: 0, current: 0,
    roundOrder: order, spaces, majors: CARDS.filter((c) => c.type === 'maj').map((c, i) => ({ ...c, uid: 'M' + i, taken: null })),
    pending: null, staging: null, feeding: null, over: false, log: [],
  };
  beginRound(G);
  return G;
}

function spaceDef(id) {
  return BASE_SPACES.find((s) => s.id === id) || ROUND_SPACES.find((s) => s.id === id);
}

function logEvent(G, msg) {
  G.log.unshift(`R${G.round || '-'} ${msg}`);
  if (G.log.length > 200) G.log.pop();
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

  // 2. Work phase. Newborns from the previous round are now full members.
  G.players.forEach((p) => { p.newborn = 0; p.workersLeft = p.people; });
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

  if (HARVEST_ROUNDS.includes(G.round)) startHarvest(G);
  else beginRound(G);
}

// ---------------------------------------------------------------- placing a worker
function canPlace(G, spaceId) {
  const sp = G.spaces[spaceId];
  if (!sp || !sp.revealed || sp.occupiedBy !== null) return false;
  return G.phase === 'work' && !G.pending && G.players[G.current].workersLeft > 0;
}

function placeWorker(G, spaceId) {
  if (!canPlace(G, spaceId)) return false;
  const p = G.players[G.current], sp = G.spaces[spaceId], def = spaceDef(spaceId);
  sp.occupiedBy = G.current;
  p.workersLeft--;
  logEvent(G, `${p.name} → ${def.zh}`);

  if (def.startPlayer) { G.startPlayer = G.current; logEvent(G, `${p.name} 取得起始玩家標記`); }
  if (def.gain) { gain(p, def.gain); logEvent(G, `${p.name} 獲得 ${costText(def.gain)}`); }
  if (Object.keys(sp.goods).length) {
    const taken = { ...sp.goods };
    sp.goods = {};
    for (const k of Object.keys(taken)) {
      if (ANIM.includes(k)) stageAnimals(G, k, taken[k]);
      else p.supply[k] += taken[k];
    }
    logEvent(G, `${p.name} 取走 ${costText(taken)}`);
  }

  const steps = (def.steps || []).slice();
  if (steps.length) G.pending = { spaceId, steps, i: 0, used: {}, data: {} };
  else finishAction(G);
  return true;
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
  G.pending = null;
  if (G.staging && G.staging.n > 0) return;   // player must place or discard animals first
  advanceTurn(G);
}

function advanceTurn(G) {
  if (G.phase !== 'work') return;
  if (workDone(G)) { endWorkPhase(G); return; }
  G.current = (G.current + 1) % G.n;
  skipEmptyHanded(G);
}

// ---------------------------------------------------------------- step actions
function canPlow(p, tile) {
  if (p.farm[tile].kind !== 'empty' || p.farm[tile].stable) return false;
  if (fieldCount(p) === 0) return true;
  const [r, c] = rc(tile);
  return DIRS.some(([, dr, dc]) => inBoard(r + dr, c + dc) && p.farm[idx(r + dr, c + dc)].kind === 'field');
}

function plow(G, tile) {
  const p = G.players[G.current];
  if (currentStep(G) !== 'plow' || !canPlow(p, tile)) return false;
  p.farm[tile].kind = 'field';
  logEvent(G, `${p.name} 犁了 1 塊田`);
  nextStep(G);
  return true;
}

function canBuildRoom(p, tile) {
  if (p.farm[tile].kind !== 'empty' || p.farm[tile].stable || p.farm[tile].animals) return false;
  const [r, c] = rc(tile);
  return DIRS.some(([, dr, dc]) => inBoard(r + dr, c + dc) && p.farm[idx(r + dr, c + dc)].kind === 'room');
}

function buildRoom(G, tile) {
  const p = G.players[G.current];
  if (currentStep(G) !== 'build' || !canBuildRoom(p, tile)) return false;
  const cost = ROOM_COST[p.house];
  if (!canPay(p, cost)) return false;
  pay(p, cost);
  p.farm[tile].kind = 'room';
  G.pending.used.room = true;
  logEvent(G, `${p.name} 建了 1 間${HOUSE_ZH[p.house]}房間`);
  return true;
}

function canBuildStable(p, tile) {
  const t = p.farm[tile];
  return t.kind === 'empty' && !t.stable && stableCount(p) < 4;
}

function buildStable(G, tile) {
  const p = G.players[G.current];
  if (currentStep(G) !== 'build' || !canBuildStable(p, tile)) return false;
  if (p.supply.wood < 2) return false;
  p.supply.wood -= 2;
  p.farm[tile].stable = true;
  G.pending.used.stable = true;
  logEvent(G, `${p.name} 建了 1 個馬廄`);
  return true;
}

function toggleFence(G, edge) {
  const p = G.players[G.current];
  if (currentStep(G) !== 'fences') return false;
  const d = G.pending.data;
  d.placed = d.placed || [];
  if (p.fences[edge]) {
    if (!d.placed.includes(edge)) return false;   // existing fences can never be removed
    delete p.fences[edge];
    d.placed.splice(d.placed.indexOf(edge), 1);
    p.supply.wood += 1;
    return true;
  }
  if (fenceCount(p) >= 15 || p.supply.wood < 1) return false;
  p.fences[edge] = true;
  d.placed.push(edge);
  p.supply.wood -= 1;
  return true;
}

function undoFences(G) {
  const p = G.players[G.current];
  if (currentStep(G) !== 'fences') return false;
  const d = G.pending.data;
  for (const e of (d.placed || [])) { delete p.fences[e]; p.supply.wood += 1; }
  d.placed = [];
  return true;
}

function confirmFences(G) {
  const p = G.players[G.current];
  if (currentStep(G) !== 'fences') return false;
  if (!fencesValid(p)) return false;
  const n = (G.pending.data.placed || []).length;
  if (n) logEvent(G, `${p.name} 建了 ${n} 條柵欄`);
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
  p.supply.food += o.food;
  d.baked[ovenName] = used + 1;
  logEvent(G, `${p.name} 用${ovenName === 'Fireplace' ? '火爐' : ovenName}烤麵包：1 穀物 → ${o.food} 食物`);
  return true;
}

function canGrow(G, any) {
  const p = G.players[G.current];
  if (p.people >= 5) return false;
  return any || p.people < roomCount(p);
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

function renovateCost(p) {
  const next = NEXT_HOUSE[p.house];
  if (!next) return null;
  const mat = next === 'clay' ? 'clay' : 'stone';
  return { reed: 1, [mat]: roomCount(p) };
}

function renovate(G) {
  const p = G.players[G.current];
  if (currentStep(G) !== 'renovate') return false;
  const cost = renovateCost(p);
  if (!cost || !canPay(p, cost)) return false;
  pay(p, cost);
  p.house = NEXT_HOUSE[p.house];
  logEvent(G, `${p.name} 翻新為${HOUSE_ZH[p.house]}`);
  nextStep(G);
  return true;
}

// ---------------------------------------------------------------- playing cards
function occCost(p) { return p.occPlayed === 0 ? {} : { food: 1 }; }

function playableNow(G) {
  const st = currentStep(G);
  if (st === 'playOcc') return ['occ'];
  if (st === 'playMinor') return ['min'];
  if (st === 'playImprovement') return ['min', 'maj'];
  return [];
}

function playCard(G, uid) {
  const p = G.players[G.current];
  const kinds = playableNow(G);
  if (!kinds.length) return false;

  let card = p.hand.occ.concat(p.hand.min).find((c) => c.uid === uid);
  let fromMajors = false;
  if (!card) { card = G.majors.find((c) => c.uid === uid && !c.taken); fromMajors = true; }
  if (!card || !kinds.includes(card.type)) return false;

  const cost = card.type === 'occ' ? occCost(p) : (card.cost || {});
  if (!canPay(p, cost)) return false;
  pay(p, cost);

  if (fromMajors) card.taken = G.current;
  else {
    const list = card.type === 'occ' ? p.hand.occ : p.hand.min;
    list.splice(list.findIndex((c) => c.uid === uid), 1);
  }
  if (card.type === 'occ') p.occPlayed++;
  p.played.push(card);
  logEvent(G, `${p.name} 打出 ${card.zh}（${card.en}）`);
  if (card.trav && G.n === 1) logEvent(G, `單人局：${card.zh} 為旅行卡，結算後移出遊戲`);
  nextStep(G);
  return true;
}

// ---------------------------------------------------------------- animals
function placeAnimal(G, tile) {
  if (!G.staging || G.staging.n < 1) return false;
  const p = G.players[G.current], kind = G.staging.kind, t = p.farm[tile];
  const regs = regions(p);

  if (t.kind === 'room') {
    if (p.pet) return false;
    p.pet = { kind };
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
  if (G.staging.n === 0) { G.staging = null; if (!G.pending) advanceTurn(G); }
  return true;
}

function discardStaged(G) {
  if (!G.staging) return false;
  logEvent(G, `${G.players[G.current].name} 放棄 ${G.staging.n} 隻${LABEL[G.staging.kind]}`);
  G.staging = null;
  if (!G.pending) advanceTurn(G);
  return true;
}

// Free capacity for one more animal of `kind`, used for breeding.
function freeSlot(p, kind) {
  const regs = regions(p);
  for (const g of pastureList(p, regs)) {
    if (g.count < g.capacity && (!g.kind || g.kind === kind)) {
      const t = g.tiles.find((x) => p.farm[x].animals && p.farm[x].animals.kind === kind) ?? g.tiles[0];
      return { tile: t };
    }
  }
  for (const t of looseStables(p, regs)) if (!p.farm[t].animals) return { tile: t };
  if (!p.pet) return { pet: true };
  return null;
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
  // Keep only the best rate per good.
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

function removeAnimal(p, kind) {
  for (const t of p.farm) {
    if (t.animals && t.animals.kind === kind && t.animals.n > 0) {
      t.animals.n--;
      if (t.animals.n === 0) t.animals = null;
      return true;
    }
  }
  if (p.pet && p.pet.kind === kind) { p.pet = null; return true; }
  return false;
}

function convertCropToFood(G, playerIdx, kind) {
  const p = G.players[playerIdx];
  if (p.supply[kind] < 1) return false;
  p.supply[kind]--;
  p.supply.food++;
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

  // 1. Field phase: every sown field yields exactly 1 good.
  for (const p of G.players) {
    let got = 0;
    for (const t of p.farm) {
      if (t.crop && t.crop.n > 0) {
        p.supply[t.crop.kind]++;
        got++;
        t.crop.n--;
        if (t.crop.n === 0) t.crop = null;
      }
    }
    if (got) logEvent(G, `${p.name} 收割 ${got} 個作物`);
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
  if (G.feeding.i >= G.n) { G.feeding = null; breedPhase(G); }
  return true;
}

function breedPhase(G) {
  for (const p of G.players) {
    for (const k of ANIM) {
      if (animalTotal(p, k) < 2) continue;
      const slot = freeSlot(p, k);
      if (!slot) { logEvent(G, `${p.name} 的${LABEL[k]}無位繁殖`); continue; }
      if (slot.pet) p.pet = { kind: k };
      else {
        const t = p.farm[slot.tile];
        t.animals = t.animals && t.animals.kind === k ? { kind: k, n: t.animals.n + 1 } : { kind: k, n: 1 };
      }
      logEvent(G, `${p.name} 的${LABEL[k]}繁殖 +1`);
    }
  }
  if (G.round >= 14) { G.phase = 'scoring'; G.over = true; logEvent(G, '=== 遊戲結束 ==='); }
  else beginRound(G);
}

// ---------------------------------------------------------------- scoring
function bracket(n, cuts) {
  // cuts: array of [min, points], evaluated top-down.
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

  const total = rows.reduce((s, r) => s + r.pts, 0);
  return { rows, total, note: '卡上的獎勵分（例如吹噓者、細木工坊）需自行加入。' };
}
