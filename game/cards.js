// Agricola — automatic card resolution for the A and B decks plus the 10 major improvements.
//
// Every card is keyed by its English name. A card contributes handlers for the hooks the
// engine fires; all handlers take a context object and mutate game state through the same
// helpers the rest of the engine uses, so nothing here needs its own rules knowledge.
//
// Hooks
//   onPlay({G,p,card})                 card is played
//   onRoundStart({G,p,round})          replenishment phase
//   onSpaceUsed({G,p,spaceId,def})     this player took an action space
//   onAnySpaceUsed({G,p,actor,...})    any player took an action space (p = card owner)
//   onBuildRoom({G,p,house,n})         a room went up (n = rooms built so far this action)
//   onRenovate({G,p,from,to})          the house was renovated
//   onPastureMade({G,p,pastures})      new pastures were fenced in
//   onImprovement / onOccupation       a card was played
//   onTurnEnd({G,p}) / onReturnHome    end of a placement / of the work phase
//   beforeField / onField({G,p})       harvest field phase
//   bakeBonus({G,p,food,oven})         extra food per Bake Bread
//   costMod({G,p,what,cost,extra})     what: room | renovate | minor | major
//   capacity({p,region,extra})         pasture capacity
//   canShare({G,p,spaceId,share})      may place on an occupied space
//   free({G,p,pi,list,acting})         actions available outside the turn structure
//   score({G,p,pts,detail})            bonus victory points
//   doFree({G,p,pi,id})                run a free action this card offered

// The Grocer's printed pile, top first (the card lists it bottom to top: wood, grain, reed,
// stone, vegetable, clay, reed, vegetable).
const GROCER_PILE = ['veg', 'reed', 'clay', 'veg', 'stone', 'reed', 'grain', 'wood'];

// ---------------------------------------------------------------- small helpers
function future(G, p, rounds, goods) {
  const hit = [];
  for (const r of rounds) {
    if (r > 14 || r <= G.round) continue;
    p.futures[r] = p.futures[r] || {};
    for (const k of Object.keys(goods)) p.futures[r][k] = (p.futures[r][k] || 0) + goods[k];
    hit.push(r);
  }
  if (hit.length) logEvent(G, `${p.name} 喺第 ${hit.join('、')} 回合格放低 ${costText(goods)}`);
}

const nextRounds = (G, n) => Array.from({ length: n }, (_, i) => G.round + i + 1);
const restRounds = (G) => { const o = []; for (let r = G.round + 1; r <= 14; r++) o.push(r); return o; };

function offer(ctx, card, id, label, ok) {
  ctx.list.push({ id, card: card.en, label, ok: !!ok });
}
const isWoodSpace = (def) => !!(def.accum && def.accum.wood);
const isStoneSpace = (def) => !!(def.accum && def.accum.stone);

function fieldsWith(p, kind) {
  return p.farm.filter((t) => t.kind === 'field' && t.crop && t.crop.kind === kind && t.crop.n > 0);
}
const emptyFields = (p) => p.farm.filter((t) => t.kind === 'field' && !t.crop);

const CARD_FX = {

  // ================================================================ OCCUPATIONS — deck A
  'Wood Cutter': {
    onSpaceUsed(x) { if (isWoodSpace(x.def)) gain(x.G, x.p, { wood: 1 }, '伐木工：'); },
  },

  'Hedge Keeper': {
    fenceMod(x) { x.free += 3; },
  },

  'Firewood Collector': {
    onSpaceUsed(x) {
      if (['farmland', 'grain_seeds', 'grain_util', 'cultivation'].includes(x.spaceId)) x.p.turnFlags.firewood = true;
    },
    onTurnEnd(x) { if (x.p.turnFlags.firewood) gain(x.G, x.p, { wood: 1 }, '柴火收集者：'); },
  },

  'Scythe Worker': {
    onPlay(x) { gain(x.G, x.p, { grain: 1 }, '鐮刀手：'); },
    onField(x) {
      let extra = 0;
      for (const t of x.p.farm) {
        if (t.kind === 'field' && t.crop && t.crop.kind === 'grain' && t.crop.n > 0) {
          t.crop.n--; extra++;
          if (t.crop.n === 0) t.crop = null;
        }
      }
      if (extra) gain(x.G, x.p, { grain: extra }, '鐮刀手額外收割');
    },
  },

  'Seasonal Worker': {
    onSpaceUsed(x) {
      if (x.spaceId !== 'day_laborer') return;
      gain(x.G, x.p, { grain: 1 }, '季節工：');
      if (x.G.round >= 6) x.p.turnFlags.seasonal = true;
    },
    free(x, c) {
      if (x.acting && x.p.turnFlags.seasonal && x.p.supply.grain > 0) {
        offer(x, c, 'seasonal:veg', '季節工：改攞 1 蔬菜', true);
      }
    },
    doFree(x) {
      x.p.supply.grain--; x.p.supply.veg++;
      x.p.turnFlags.seasonal = false;
      logEvent(x.G, `${x.p.name} 季節工改攞 1 蔬菜`);
    },
  },

  'Clay Hut Builder': {
    onRenovate(x) {
      if (x.p.clayHutDone || x.to === 'wood') return;
      x.p.clayHutDone = true;
      future(x.G, x.p, nextRounds(x.G, 5), { clay: 2 });
    },
  },

  'Grocer': {
    free(x, c) {
      const good = GROCER_PILE[x.p.grocer];
      const left = GROCER_PILE.length - x.p.grocer;
      if (good) offer(x, c, 'grocer', `雜貨商：1 食物買 1 ${LABEL[good]}（仲有 ${left} 件）`, x.p.supply.food >= 1);
    },
    doFree(x) {
      const good = GROCER_PILE[x.p.grocer];
      if (!good || x.p.supply.food < 1) return false;
      x.p.supply.food--; x.p.grocer++;
      gain(x.G, x.p, { [good]: 1 }, '雜貨商買入');
    },
  },

  'Stable Architect': {
    score(x) {
      const fenced = new Set();
      pastureList(x.p).forEach((g) => g.tiles.forEach((t) => fenced.add(t)));
      const n = x.p.farm.filter((t, i) => t.stable && !fenced.has(i)).length;
      if (n) { x.pts += n; x.detail.push(`馬廄建築師 +${n}`); }
    },
  },

  'Wall Builder': {
    onBuildRoom(x) { if (x.n === 1) future(x.G, x.p, nextRounds(x.G, 4), { food: 1 }); },
  },

  'Rough Caster': {
    onBuildRoom(x) { if (x.house === 'clay' && x.n === 1) gain(x.G, x.p, { food: 3 }, '粗灰泥匠：'); },
    onRenovate(x) { if (x.from === 'clay' && x.to === 'stone') gain(x.G, x.p, { food: 3 }, '粗灰泥匠：'); },
  },

  'Adoptive Parents': {
    free(x, c) {
      if (x.acting && x.p.newborn > 0) offer(x, c, 'adopt', '養父母：1 食物令新生兒即刻行動', x.p.supply.food >= 1);
    },
    doFree(x) {
      if (x.p.newborn < 1 || x.p.supply.food < 1) return false;
      x.p.supply.food--; x.p.newborn--; x.p.workersLeft++;
      logEvent(x.G, `${x.p.name} 用養父母，新生兒即刻可以行動`);
    },
  },

  'Mushroom Collector': {
    onSpaceUsed(x) { if (isWoodSpace(x.def)) x.p.turnFlags.woodSpace = true; },
    free(x, c) {
      if (x.acting && x.p.turnFlags.woodSpace) offer(x, c, 'mushroom', '採菇人：1 木材 → 2 食物', x.p.supply.wood >= 1);
    },
    doFree(x) {
      if (x.p.supply.wood < 1) return false;
      x.p.supply.wood--; x.p.supply.food += 2;
      logEvent(x.G, `${x.p.name} 採菇人：1 木材 → 2 食物`);
    },
  },

  'Plow Driver': {
    free(x, c) {
      if (!x.acting || x.p.house !== 'stone' || x.G.pending) return;
      offer(x, c, 'plowdriver', '犁田工：1 食物犁 1 塊田',
        x.p.supply.food >= 1 && !usedThisRound(x.G, x.p, 'plowdriver'));
    },
    doFree(x) {
      if (x.p.supply.food < 1) return false;
      x.p.supply.food--;
      markUsed(x.G, x.p, 'plowdriver');
      freePending(x.G, ['plow']);
    },
  },

  'Animal Tamer': {
    onPlay(x) { ask(x.G, 'animalTamer', x.G.current, [{ id: 'wood', label: '1 木材' }, { id: 'grain', label: '1 穀物' }]); },
  },

  'Conservator': {},   // handled by nextHouse()

  'Frame Builder': {
    costMod(x) {
      if (x.what !== 'room' && x.what !== 'renovate') return;
      const have = x.p.supply.wood - (x.cost.wood || 0);
      if (have < 1) return;
      if ((x.cost.clay || 0) >= 2) { x.cost.clay -= 2; x.cost.wood = (x.cost.wood || 0) + 1; }
      else if ((x.cost.stone || 0) >= 2) { x.cost.stone -= 2; x.cost.wood = (x.cost.wood || 0) + 1; }
    },
  },

  'Priest': {
    onPlay(x) {
      if (x.p.house === 'clay' && roomCount(x.p) === 2) gain(x.G, x.p, { clay: 3, reed: 2, stone: 2 }, '牧師：');
    },
  },

  'Stonecutter': {
    costMod(x) { if (x.cost.stone) x.cost.stone -= 1; },
  },

  // ================================================================ OCCUPATIONS — deck B
  'Paper Maker': {
    free(x, c) {
      if (x.acting && currentStep(x.G) === 'playOcc' && !usedThisRound(x.G, x.p, 'papermaker')) {
        offer(x, c, 'papermaker', `造紙師：1 木材 → ${x.p.occPlayed} 食物`, x.p.supply.wood >= 1 && x.p.occPlayed > 0);
      }
    },
    doFree(x) {
      if (x.p.supply.wood < 1) return false;
      x.p.supply.wood--;
      markUsed(x.G, x.p, 'papermaker');
      gain(x.G, x.p, { food: x.p.occPlayed }, '造紙師：');
    },
  },

  'Consultant': {
    onPlay(x) { gain(x.G, x.p, x.G.n === 1 ? { grain: 2 } : { clay: 3 }, '顧問：'); },
  },

  'Assistant Tiller': {
    onSpaceUsed(x) { if (x.spaceId === 'day_laborer') addStep(x.G, 'plow'); },
  },

  'Groom': {
    onPlay(x) { gain(x.G, x.p, { wood: 1 }, '馬伕：'); },
    free(x, c) {
      if (!x.acting || x.p.house !== 'stone' || x.G.pending) return;
      offer(x, c, 'groom', '馬伕：1 木材建 1 個馬廄',
        x.p.supply.wood >= 1 && stableCount(x.p) < 4 && !usedThisRound(x.G, x.p, 'groom'));
    },
    doFree(x) {
      if (x.p.supply.wood < 1 || stableCount(x.p) >= 4) return false;
      x.p.supply.wood--;
      markUsed(x.G, x.p, 'groom');
      freePending(x.G, ['freestable']);
    },
  },

  'Master Bricklayer': {
    costMod(x) {
      if (x.what !== 'major' || !x.cost.stone) return;
      x.cost.stone = Math.max(0, x.cost.stone - Math.max(0, roomCount(x.p) - 2));
    },
  },

  'Carpenter': {
    costMod(x) { if (x.what === 'room') x.cost = { [HOUSE_RES[x.extra.house]]: 3, reed: 2 }; },
  },

  'Small-Scale Farmer': {
    onRoundStart(x) { if (roomCount(x.p) === 2) gain(x.G, x.p, { wood: 1 }, '小農：'); },
  },

  'Cottager': {
    onSpaceUsed(x) {
      if (x.spaceId !== 'day_laborer') return;
      addStep(x.G, 'cottager');
      x.G.pending.limit = Object.assign({}, x.G.pending.limit, { room: 1 });
    },
  },

  'Roof Ballaster': {
    onPlay(x) {
      if (x.p.supply.food < 1) return;
      ask(x.G, 'roofBallaster', x.G.current,
        [{ id: 'yes', label: `付 1 食物換 ${roomCount(x.p)} 石頭` }, { id: 'no', label: '唔要' }]);
    },
  },

  'Tutor': {
    score(x) {
      const i = x.p.played.findIndex((c) => c.en === 'Tutor');
      const n = x.p.played.slice(i + 1).filter((c) => c.type === 'occ').length;
      if (n) { x.pts += n; x.detail.push(`家庭教師 +${n}`); }
    },
  },

  'Oven Firing Boy': {
    onSpaceUsed(x) { if (isWoodSpace(x.def)) addStep(x.G, 'bake'); },
  },

  'Organic Farmer': {
    score(x) {
      const n = pastureList(x.p).filter((g) => g.count >= 1 && g.capacity - g.count >= 3).length;
      if (n) { x.pts += n; x.detail.push(`有機農夫 +${n}`); }
    },
  },

  'Manservant': {
    onRoundStart(x) {
      if (x.p.house !== 'stone' || x.p.manservantDone) return;
      x.p.manservantDone = true;
      future(x.G, x.p, restRounds(x.G), { food: 3 });
    },
    onRenovate(x) {
      if (x.to !== 'stone' || x.p.manservantDone) return;
      x.p.manservantDone = true;
      future(x.G, x.p, restRounds(x.G), { food: 3 });
    },
  },

  'Childless': {
    free(x, c) {
      if (!x.acting) return;
      const ok = roomCount(x.p) >= 3 && x.p.people === 2 && !usedThisRound(x.G, x.p, 'childless');
      offer(x, c, 'childless:grain', '無兒無女：1 食物 + 1 穀物', ok);
      offer(x, c, 'childless:veg', '無兒無女：1 食物 + 1 蔬菜', ok);
    },
    doFree(x) {
      const kind = x.id.split(':')[1];
      markUsed(x.G, x.p, 'childless');
      gain(x.G, x.p, { food: 1, [kind]: 1 }, '無兒無女：');
    },
  },

  'Geologist': {
    onSpaceUsed(x) {
      if (x.spaceId === 'forest' || x.spaceId === 'reed_bank') gain(x.G, x.p, { clay: 1 }, '地質學家：');
    },
  },

  'Scholar': {
    free(x, c) {
      if (!x.acting || x.p.house !== 'stone' || x.G.pending) return;
      offer(x, c, 'scholar', '學者：打 1 張職業（1 食物）或次要發展', !usedThisRound(x.G, x.p, 'scholar'));
    },
    doFree(x) {
      markUsed(x.G, x.p, 'scholar');
      freePending(x.G, ['playAny'], { occCostFixed: 1 });
    },
  },

  'Sheep Walker': {
    free(x, c) {
      const have = animalTotal(x.p, 'sheep') > 0;
      offer(x, c, 'sheepwalk:boar', '趕羊人：1 綿羊 → 1 野豬', have);
      offer(x, c, 'sheepwalk:veg', '趕羊人：1 綿羊 → 1 蔬菜', have);
      offer(x, c, 'sheepwalk:stone', '趕羊人：1 綿羊 → 1 石頭', have);
    },
    doFree(x) {
      const to = x.id.split(':')[1];
      if (!removeAnimal(x.p, 'sheep')) return false;
      gain(x.G, x.p, { [to]: 1 }, '趕羊人換到');
    },
  },

  'Braggart': {
    score(x) {
      const n = x.p.played.filter((c) => c.type !== 'occ').length;
      const pts = n >= 10 ? 9 : n >= 9 ? 7 : n >= 8 ? 5 : n >= 7 ? 4 : n >= 6 ? 3 : n >= 5 ? 2 : 0;
      if (pts) { x.pts += pts; x.detail.push(`吹噓者 +${pts}`); }
    },
  },

  // ================================================================ MINOR IMPROVEMENTS — deck A
  'Basket': {
    onSpaceUsed(x) { if (isWoodSpace(x.def)) x.p.turnFlags.woodSpace = true; },
    free(x, c) {
      if (x.acting && x.p.turnFlags.woodSpace) offer(x, c, 'basket', '籃子：2 木材 → 3 食物', x.p.supply.wood >= 2);
    },
    doFree(x) {
      if (x.p.supply.wood < 2) return false;
      x.p.supply.wood -= 2; x.p.supply.food += 3;
      logEvent(x.G, `${x.p.name} 籃子：2 木材 → 3 食物`);
    },
  },

  'Clay Embankment': {
    onPlay(x) {
      const n = Math.floor(x.p.supply.clay / 2);
      if (n) gain(x.G, x.p, { clay: n }, '黏土堤：');
    },
  },

  'Large Greenhouse': {
    onPlay(x) { future(x.G, x.p, [x.G.round + 4, x.G.round + 7, x.G.round + 9], { veg: 1 }); },
  },

  "Shepherd's Crook": {
    onPastureMade(x) {
      for (const g of x.pastures) if (g.tiles.length >= 4) putAnimalsOnPasture(x.G, x.p, 'sheep', 2, g);
    },
  },

  'Manger': {
    score(x) {
      const n = pastureList(x.p).reduce((s, g) => s + g.tiles.length, 0);
      const pts = n >= 10 ? 4 : n >= 8 ? 3 : n >= 7 ? 2 : n >= 6 ? 1 : 0;
      if (pts) { x.pts += pts; x.detail.push(`飼料槽 +${pts}`); }
    },
  },

  'Sleeping Corner': {
    canShare(x) { if (x.spaceId === 'family_growth' || x.spaceId === 'urgent_growth') x.share = true; },
  },

  'Clearing Spade': {
    free(x, c) {
      const empty = emptyFields(x.p).length > 0;
      offer(x, c, 'spade:grain', '開墾鏟：搬 1 穀物到空田', empty && fieldsWith(x.p, 'grain').some((t) => t.crop.n >= 2));
      offer(x, c, 'spade:veg', '開墾鏟：搬 1 蔬菜到空田', empty && fieldsWith(x.p, 'veg').some((t) => t.crop.n >= 2));
    },
    doFree(x) {
      const kind = x.id.split(':')[1];
      const src = fieldsWith(x.p, kind).filter((t) => t.crop.n >= 2).sort((a, b) => b.crop.n - a.crop.n)[0];
      const dst = emptyFields(x.p)[0];
      if (!src || !dst) return false;
      src.crop.n--;
      if (src.crop.n === 0) src.crop = null;
      dst.crop = { kind, n: 1 };
      logEvent(x.G, `${x.p.name} 開墾鏟：搬 1 ${LABEL[kind]}到空田`);
    },
  },

  'Wool Blankets': {
    score(x) {
      const pts = x.p.house === 'wood' ? 3 : x.p.house === 'clay' ? 2 : 0;
      if (pts) { x.pts += pts; x.detail.push(`羊毛毯 +${pts}`); }
    },
  },

  'Canoe': {
    onSpaceUsed(x) { if (x.spaceId === 'fishing') gain(x.G, x.p, { food: 1, reed: 1 }, '獨木舟：'); },
  },

  'Big Country': {
    onPlay(x) {
      const left = 14 - x.G.round;
      x.p.bonusVp += left;
      gain(x.G, x.p, { food: left * 2 }, '大國：');
      logEvent(x.G, `${x.p.name} 大國：+${left} 獎勵分`);
    },
  },

  'Junk Room': {
    onImprovement(x) { gain(x.G, x.p, { food: 1 }, '雜物房：'); },
  },

  'Drinking Trough': {
    capacity(x) { x.extra += 2; },
  },

  'Young Animal Market': {
    onPlay(x) { autoPlaceAnimal(x.G, x.p, 'cattle', 1); },
  },

  'Clay Pipe': {
    onReturnHome(x) { if (x.p.gainedBuild >= 7) gain(x.G, x.p, { food: 2 }, '黏土煙斗：'); },
  },

  'Lumber Mill': {
    costMod(x) { if ((x.what === 'minor' || x.what === 'major') && x.cost.wood) x.cost.wood -= 1; },
  },

  'Shifting Cultivation': {
    onPlay(x) { addStep(x.G, 'plow'); },
  },

  'Pond Hut': {
    onPlay(x) { future(x.G, x.p, nextRounds(x.G, 3), { food: 1 }); },
  },

  'Corn Scoop': {
    onSpaceUsed(x) { if (x.spaceId === 'grain_seeds') gain(x.G, x.p, { grain: 1 }, '穀鏟：'); },
  },

  'Rammed Clay': {
    onPlay(x) { gain(x.G, x.p, { clay: 1 }, '夯土：'); },
    fenceMod(x) { x.clayOk = true; },
  },

  'Threshing Board': {
    onSpaceUsed(x) { if (x.spaceId === 'farmland' || x.spaceId === 'cultivation') addStep(x.G, 'bake'); },
  },

  'Dutch Windmill': {
    bakeBonus(x) { if (AFTER_HARVEST_ROUNDS.includes(x.G.round)) x.food += 3; },
  },

  'Stone Tongs': {
    onSpaceUsed(x) { if (isStoneSpace(x.def)) gain(x.G, x.p, { stone: 1 }, '石鉗：'); },
  },

  'Handplow': {
    onPlay(x) {
      x.p.handplow = x.G.round + 5;
      if (x.p.handplow <= 14) logEvent(x.G, `${x.p.name} 手犁：第 ${x.p.handplow} 回合可犁 1 塊田`);
    },
    free(x, c) {
      if (x.acting && x.p.handplow === x.G.round && !x.G.pending) offer(x, c, 'handplow', '手犁：犁 1 塊田', true);
    },
    doFree(x) { x.p.handplow = 0; freePending(x.G, ['plow']); },
  },

  'Milk Jug': {
    onAnySpaceUsed(x) {
      if (x.spaceId !== 'cattle_market') return;
      gain(x.G, x.p, { food: 3 }, '奶壺：');
      for (const q of x.G.players) if (q !== x.p) gain(x.G, q, { food: 1 }, '（奶壺）獲得');
    },
  },

  // ================================================================ MINOR IMPROVEMENTS — deck B
  'Mantelpiece': {
    onPlay(x) {
      const left = 14 - x.G.round;
      x.p.bonusVp += left;
      x.p.noRenovate = true;
      logEvent(x.G, `${x.p.name} 壁爐架：+${left} 獎勵分，之後唔可以翻新`);
    },
  },

  'Herring Pot': {
    onSpaceUsed(x) { if (x.spaceId === 'fishing') future(x.G, x.p, nextRounds(x.G, 3), { food: 1 }); },
  },

  'Scullery': {
    onRoundStart(x) { if (x.p.house === 'wood') gain(x.G, x.p, { food: 1 }, '洗碗間：'); },
  },

  'Mining Hammer': {
    onPlay(x) { gain(x.G, x.p, { food: 1 }, '採礦錘：'); },
    onRenovate(x) { if (stableCount(x.p) < 4) addStep(x.G, 'freestable'); },
  },

  'Hard Porcelain': {
    free(x, c) {
      offer(x, c, 'porcelain:2', '硬瓷：2 黏土 → 1 石頭', x.p.supply.clay >= 2);
      offer(x, c, 'porcelain:3', '硬瓷：3 黏土 → 2 石頭', x.p.supply.clay >= 3);
      offer(x, c, 'porcelain:4', '硬瓷：4 黏土 → 3 石頭', x.p.supply.clay >= 4);
    },
    doFree(x) {
      const n = +x.id.split(':')[1];
      if (x.p.supply.clay < n) return false;
      x.p.supply.clay -= n;
      x.p.supply.stone += n - 1;
      logEvent(x.G, `${x.p.name} 硬瓷：${n} 黏土 → ${n - 1} 石頭`);
    },
  },

  'Caravan': {
    onPlay(x) { x.p.caravan = true; },
  },

  'Loam Pit': {
    onSpaceUsed(x) { if (x.spaceId === 'day_laborer') gain(x.G, x.p, { clay: 3 }, '壤土坑：'); },
  },

  'Loom': {
    onField(x) {
      const s = animalTotal(x.p, 'sheep');
      const f = s >= 7 ? 3 : s >= 4 ? 2 : s >= 1 ? 1 : 0;
      if (f) gain(x.G, x.p, { food: f }, '織布機：');
    },
    score(x) {
      const n = Math.floor(animalTotal(x.p, 'sheep') / 3);
      if (n) { x.pts += n; x.detail.push(`織布機 +${n}`); }
    },
  },

  'Moldboard Plow': {
    onPlay(x) { x.p.moldboard = 2; },
    onSpaceUsed(x) {
      if (x.spaceId !== 'farmland' || x.p.moldboard < 1) return;
      addStep(x.G, 'plow');
      x.G.pending.data.moldboardPending = true;
    },
  },

  'Mini Pasture': {
    onPlay(x) { addStep(x.G, 'minipasture'); },
  },

  'Pitchfork': {
    onSpaceUsed(x) {
      if (x.spaceId === 'grain_seeds' && x.G.spaces.farmland.occupiedBy !== null) {
        gain(x.G, x.p, { food: 3 }, '乾草叉：');
      }
    },
  },

  'Lasso': {
    onSpaceUsed(x) {
      if (['sheep_market', 'pig_market', 'cattle_market'].includes(x.spaceId)) x.p.turnFlags.lasso = true;
    },
    onTurnEnd(x) {
      if (!x.p.turnFlags.lasso || x.p.workersLeft < 1 || usedThisRound(x.G, x.p, 'lasso')) return;
      markUsed(x.G, x.p, 'lasso');
      ask(x.G, 'lasso', x.G.current, [{ id: 'yes', label: '套索：即刻再放一個人' }, { id: 'no', label: '結束回合' }]);
    },
  },

  'Bottles': {
    costMod(x) {
      if (x.what !== 'minor' || !x.extra.card || x.extra.card.en !== 'Bottles') return;
      x.cost.clay = (x.cost.clay || 0) + x.p.people;
      x.cost.food = (x.cost.food || 0) + x.p.people;
    },
  },

  'Three-Field Rotation': {
    beforeField(x) {
      const grain = x.p.farm.some((t) => t.kind === 'field' && t.crop && t.crop.kind === 'grain');
      const veg = x.p.farm.some((t) => t.kind === 'field' && t.crop && t.crop.kind === 'veg');
      const bare = x.p.farm.some((t) => t.kind === 'field' && !t.crop);
      if (grain && veg && bare) gain(x.G, x.p, { food: 3 }, '三圃輪作：');
    },
  },

  'Market Stall': {
    onPlay(x) { gain(x.G, x.p, { veg: 1 }, '市集攤位：'); },
  },

  'Beanfield': {
    onPlay(x) { x.p.beanfield = { crop: null }; },
  },

  'Butter Churn': {
    onField(x) {
      const f = Math.floor(animalTotal(x.p, 'sheep') / 3) + Math.floor(animalTotal(x.p, 'cattle') / 2);
      if (f) gain(x.G, x.p, { food: f }, '攪乳器：');
    },
  },

  "Carpenter's Parlor": {
    costMod(x) { if (x.what === 'room' && x.extra.house === 'wood') x.cost = { wood: 2, reed: 2 }; },
  },

  'Acorn Basket': {
    onPlay(x) { future(x.G, x.p, nextRounds(x.G, 2), { boar: 1 }); },
  },

  'Strawberry Patch': {
    onPlay(x) { future(x.G, x.p, nextRounds(x.G, 3), { food: 1 }); },
  },

  'Thick Forest': {
    onPlay(x) { future(x.G, x.p, restRounds(x.G).filter((r) => r % 2 === 0), { wood: 1 }); },
  },

  'Bread Paddle': {
    onPlay(x) { gain(x.G, x.p, { food: 1 }, '麵包鏟：'); },
    onOccupation(x) { addStep(x.G, 'bake'); },
  },

  'Brook': {
    onSpaceUsed(x) {
      if (ABOVE_FISHING.includes(x.spaceId) || x.spaceId === x.G.roundOrder[0]) {
        gain(x.G, x.p, { food: 1 }, '小溪：');
      }
    },
  },

  'Sack Cart': {
    onPlay(x) { future(x.G, x.p, [5, 8, 11, 14], { grain: 1 }); },
  },

  // ================================================================ MAJOR IMPROVEMENTS
  'Well': {
    onPlay(x) { future(x.G, x.p, nextRounds(x.G, 5), { food: 1 }); },
  },

  'Clay Oven': { onPlay(x) { addStep(x.G, 'bake'); } },
  'Stone Oven': { onPlay(x) { addStep(x.G, 'bake'); } },

  'Joinery': {
    free(x, c) {
      if (x.G.phase !== 'harvest') return;
      offer(x, c, 'joinery', '細木工坊：1 木材 → 2 食物',
        x.p.supply.wood >= 1 && !usedThisRound(x.G, x.p, 'joinery'));
    },
    doFree(x) {
      if (x.p.supply.wood < 1) return false;
      markUsed(x.G, x.p, 'joinery');
      x.p.supply.wood--; x.p.supply.food += 2;
      logEvent(x.G, `${x.p.name} 細木工坊：1 木材 → 2 食物`);
    },
    score(x) {
      const w = x.p.supply.wood;
      const pts = w >= 7 ? 3 : w >= 5 ? 2 : w >= 3 ? 1 : 0;
      if (pts) { x.pts += pts; x.detail.push(`細木工坊 +${pts}`); }
    },
  },

  'Pottery': {
    free(x, c) {
      if (x.G.phase !== 'harvest') return;
      offer(x, c, 'pottery', '陶器坊：1 黏土 → 2 食物',
        x.p.supply.clay >= 1 && !usedThisRound(x.G, x.p, 'pottery'));
    },
    doFree(x) {
      if (x.p.supply.clay < 1) return false;
      markUsed(x.G, x.p, 'pottery');
      x.p.supply.clay--; x.p.supply.food += 2;
      logEvent(x.G, `${x.p.name} 陶器坊：1 黏土 → 2 食物`);
    },
    score(x) {
      const n = x.p.supply.clay;
      const pts = n >= 7 ? 3 : n >= 5 ? 2 : n >= 3 ? 1 : 0;
      if (pts) { x.pts += pts; x.detail.push(`陶器坊 +${pts}`); }
    },
  },

  "Basketmaker's Workshop": {
    free(x, c) {
      if (x.G.phase !== 'harvest') return;
      offer(x, c, 'basketmaker', '編籃工坊：1 蘆葦 → 3 食物',
        x.p.supply.reed >= 1 && !usedThisRound(x.G, x.p, 'basketmaker'));
    },
    doFree(x) {
      if (x.p.supply.reed < 1) return false;
      markUsed(x.G, x.p, 'basketmaker');
      x.p.supply.reed--; x.p.supply.food += 3;
      logEvent(x.G, `${x.p.name} 編籃工坊：1 蘆葦 → 3 食物`);
    },
    score(x) {
      const n = x.p.supply.reed;
      const pts = n >= 5 ? 3 : n >= 4 ? 2 : n >= 2 ? 1 : 0;
      if (pts) { x.pts += pts; x.detail.push(`編籃工坊 +${pts}`); }
    },
  },
};

// ---------------------------------------------------------------- choices
const CARD_CHOICE = {
  animalTamer(G, ch, id) {
    const p = G.players[ch.pi];
    gain(G, p, { [id === 'grain' ? 'grain' : 'wood']: 1 }, '馴獸師：');
  },
  roofBallaster(G, ch, id) {
    const p = G.players[ch.pi];
    if (id !== 'yes' || p.supply.food < 1) return;
    p.supply.food--;
    gain(G, p, { stone: roomCount(p) }, '屋頂壓載工：');
  },
  lasso(G, ch, id) {
    if (id !== 'yes') return;
    logEvent(G, `${G.players[ch.pi].name} 用套索，即刻再放一個人`);
    return 'hold';                      // keep the turn with this player
  },
};
