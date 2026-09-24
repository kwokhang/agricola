// Agricola 1–2 player — DOM layer. Renders engine state and routes clicks back into it.
// One full-width view at a time (action board / farmyard / cards), a status bar on top
// and a fixed dock at the bottom holding the current prompt and everyone's resources.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
  const SAVE_KEY = 'agricola.game.v2';

  const PCOLOR = ['var(--p1)', 'var(--p2)'];
  const ic = (k, s) => ART.icon(k, s || 17);
  const costHtml = (cost) => {
    if (!cost || !Object.keys(cost).length) return '<span class="free">免費</span>';
    return Object.keys(cost).map((k) =>
      `<span class="cst" title="${ART.NAMES[k]}">${ic(k, 16)}<b>${cost[k]}</b><small>${ART.NAMES[k]}</small></span>`).join('');
  };
  // Costs spelled out in words, for the notes printed on the board.
  const costWords = (c) => (!c || !Object.keys(c).length ? '免費'
    : Object.keys(c).map((k) => `${c[k]} ${LABEL[k]}`).join('＋'));

  let G = null;
  const UI = {
    main: 'table', view: 0, lastCurrent: 0, autoKey: '', handPinned: false, logOpen: false,
    buildKind: 'room', sowKind: 'grain', cardTab: 'occ', drawerTab: 'log', allres: false,
  };

  // ------------------------------------------------------------ persistence
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ G, UI })); } catch (e) { /* private window */ }
  }
  function load() {
    try {
      const o = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!o || !o.G || !o.G.players) return false;
      G = o.G;
      Object.assign(UI, o.UI || {});
      return true;
    } catch (e) { return false; }
  }

  function start(n) {
    G = newGame(n === 1 ? ['玩家'] : ['玩家 1', '玩家 2']);
    UI.view = 0; UI.lastCurrent = 0; UI.cardTab = 'occ'; UI.main = 'table'; UI.autoKey = '';
    render();
  }

  // ------------------------------------------------------------ bar 1: game status
  // Three zones: the families on the left, the round front and centre, the menu on the right.
  function renderStatus() {
    const phase = G.over ? '遊戲結束' : G.feeding ? '收成 · 餵食' : G.phase === 'work' ? '工作階段' : G.phase;
    const harvestNow = HARVEST_ROUNDS.includes(G.round) && !G.over;

    const families = G.players.map((p, i) => {
      const active = (G.feeding ? G.feeding.i === i : G.current === i) && !G.over;
      const men = Array.from({ length: p.people }, (_, k) =>
        `<span class="mp ${k < p.workersLeft ? '' : 'used'}">${ART.meeple(PCOLOR[i], 14)}</span>`).join('');
      const pts = score(G, p).total;
      return `<div class="pcard ${active ? 'now' : ''}" style="--pc:${PCOLOR[i]}" data-view="${i}" title="睇 ${esc(p.name)} 嘅農場">
        <span class="av">${ART.meeple('#fff', 20)}</span>
        <span class="bd">
          <span class="nm">${esc(p.name)}${i === G.startPlayer ? `<span class="sp" title="起始玩家">${ART.icon('start', 14)}</span>` : ''}
            ${active ? '<span class="tag">輪到</span>' : ''}</span>
          <span class="sub"><span class="men">${men}</span>${HOUSE_ZH[p.house]} ${roomCount(p)} 間 · <b>${pts}</b> 分</span>
        </span></div>`;
    }).join('');

    // 14 segments; harvest rounds stand taller so the rhythm of the game is visible.
    const track = Array.from({ length: 14 }, (_, k) => {
      const r = k + 1;
      const cls = [r < G.round || G.over ? 'done' : r === G.round ? 'cur' : '',
        HARVEST_ROUNDS.includes(r) ? 'hv' : ''].join(' ');
      return `<i class="${cls}" title="第 ${r} 回合${HARVEST_ROUNDS.includes(r) ? '（收成）' : ''}"></i>`;
    }).join('');

    $('status').innerHTML = `
      <div class="fams">${families}</div>
      <div class="round">
        <div class="rtop">
          <span class="rk">ROUND<br>回合</span>
          <b class="rn">${G.round}</b><span class="rt">/ 14</span>
          <span class="ph">${esc(phase)}</span>
          ${harvestNow ? `<span class="hvb">${ic('grain', 15)} 本回合收成</span>` : ''}
        </div>
        <div class="track">${track}</div>
      </div>
      <div class="menu"><button id="menuBtn" class="menubtn">☰ 選單</button></div>`;
    $('menuBtn').addEventListener('click', () => openDrawer($('drawer').hidden));
  }

  // ------------------------------------------------------------ bar 2: view tabs
  // On the 3D table these are camera angles; without WebGL they are the old flat pages.
  function renderMainTabs() {
    const tabs = has3d
      ? [['table', '全景'], ['board', '行動板'], ['farm', '農場'], ['cards', '卡片'], ['majors', '主要發展']]
      : [['board', '行動板'], ['farm', '農場'], ['cards', '卡片']];
    const p = G.players[UI.view];
    const held = p.hand.occ.length + p.hand.min.length;
    $('mainTabs').innerHTML = tabs.map(([k, l]) =>
      `<button data-main="${k}" class="${UI.main === k ? 'sel' : ''}">${esc(l)}</button>`).join('')
      + (has3d ? `<button data-act="hand" class="${UI.handPinned ? 'sel' : ''}"
          title="手牌平時收埋，要打卡先會自動彈出；撳呢個掣可以一直攤開">${UI.handPinned ? '▼ 收起' : '▲ 攤開'}手牌 ${held}</button>` : '');

    $('playerTabs').innerHTML = G.n < 2 ? '' : '睇邊個：' + G.players.map((q, i) =>
      `<button data-view="${i}" class="${i === UI.view ? 'sel' : ''}">${ART.meeple(PCOLOR[i], 14)} ${esc(q.name)}</button>`).join('');

    if (has3d) return;
    $('viewBoard').hidden = UI.main !== 'board';
    $('viewFarm').hidden = UI.main !== 'farm';
    $('viewCards').hidden = UI.main !== 'cards';
  }

  // ------------------------------------------------------------ action board
  // Geometry of the printed 1–2 player board: a six-space small board on the left, then
  // the big board with the accumulation strip and the round spaces in stage columns.
  const SM = { w: 210, h: 108, gap: 8, pad: 14, rows: 6 };
  const BG = { w: 180, h: 130, gap: 8, pad: 14, rows: 5, cols: 7 };
  const BOARD_GAP = 18;
  const SM_W = SM.pad * 2 + SM.w;
  const SM_H = SM.pad * 2 + SM.rows * SM.h + (SM.rows - 1) * SM.gap;
  const BG_W = BG.pad * 2 + BG.cols * BG.w + (BG.cols - 1) * BG.gap;
  const BG_H = BG.pad * 2 + BG.rows * BG.h + (BG.rows - 1) * BG.gap;
  const STAGE_OF = {};
  ROUND_SPACES.forEach((d) => { STAGE_OF[d.id] = d.stage; });

  const accWords = (def) => {
    const a = (G.n === 1 && def.accumSolo) ? def.accumSolo : def.accum;
    return Object.keys(a).map((k) => `${a[k]} ${LABEL[k]}`).join('＋');
  };

  // What each space actually does, printed on its name plate. Costs follow the player
  // whose board is on screen, so a clay house shows clay room costs.
  function spaceNote(def) {
    const p = G.players[UI.view];
    if (def.accum) return [`每回合累積 ${accWords(def)}`, '放人攞晒格上全部'];
    switch (def.id) {
      case 'farmland': return ['犁 1 塊田', '第一塊隨意，之後要相鄰'];
      case 'grain_seeds': return ['取 1 穀物'];
      case 'farm_expansion': return [`房間 ${costWords(roomCost(G, p))}`, '馬廄 2 木材（最多 4 個）'];
      case 'meeting_place': return ['攞起始玩家標記', '之後可打 1 張次要發展'];
      case 'lessons': return ['打 1 張職業', '第 1 張免費，之後 1 食物'];
      case 'day_laborer': return ['取 2 食物'];
      case 'major': return ['打 1 張主要或次要發展'];
      case 'fencing': return ['起柵欄，每條 1 木材', '最多 15 條，要圍成密封'];
      case 'grain_util': return ['播種 and/or 烤麵包', '穀物田變 3、蔬菜田變 2'];
      case 'family_growth': return ['家庭成長（要有空房）', '之後可打 1 張次要發展'];
      case 'renovation': return [renoWords(p), '之後可打 1 張發展卡'];
      case 'veg_seeds': return ['取 1 蔬菜'];
      case 'cultivation': return ['犁 1 塊田 and/or 播種'];
      case 'urgent_growth': return ['家庭成長 +1 人', '唔使有空房'];
      case 'farm_redev': return [renoWords(p), '之後可起柵欄'];
      default: return [];
    }
  }
  function renoWords(p) {
    const c = renovateCost(G, p);
    return c ? `翻新 ${costWords(c)}` : '已經係石屋，唔使翻新';
  }

  function cellSpace(def, x, y, w, h, key) {
    const sp = G.spaces[def.id];
    const free = canPlace(G, def.id);
    const notes = spaceNote(def);
    const plateH = notes.length ? 56 : 34;

    // The English name only goes on the plate when it fits beside the Chinese one.
    const plateW = w - 12;
    const en = def.zh.length * 17 + def.en.length * 6.4 + 18 < plateW ? esc(def.en) : '';

    let s = `<g class="sp ${free ? 'free' : ''}" transform="translate(${x} ${y})">
      <clipPath id="clip${key}"><rect width="${w}" height="${h}" rx="9"/></clipPath>
      <g clip-path="url(#clip${key})">
        ${ART.scene(def.id, 0, 0, w, h, h - plateH - 6)}
        ${ART.plate(6, h - plateH - 6, plateW, plateH, esc(def.zh), en, notes.map(esc))}
        ${sp.occupiedBy !== null ? `<rect width="${w}" height="${h}" fill="var(--art-ink)" opacity=".3"/>` : ''}
      </g>
      <rect class="spframe" width="${w}" height="${h}" rx="9" fill="none" stroke="var(--art-ink)" stroke-width="2"/>`;

    Object.keys(sp.goods).filter((k) => sp.goods[k] > 0)
      .forEach((k, i) => { s += ART.token(k, sp.goods[k], 7 + i * 40, 7, 34); });

    if (sp.occupiedBy !== null) {
      s += `<g class="onspace" transform="translate(${w - 44} 5)">
        <circle cx="18" cy="18" r="18" fill="var(--panel)" stroke="var(--art-ink)" stroke-width="1.6" opacity=".9"/>
        <g transform="translate(5 4)">${ART.meeple(PCOLOR[sp.occupiedBy], 26)}</g></g>`;
    }
    s += `<rect class="sp-hit ${free ? 'pick' : ''}" data-space="${def.id}" width="${w}" height="${h}" rx="9"/>
      <title>${esc(def.zh)} ${esc(def.en)} — ${esc(notes.join('；'))}</title></g>`;
    return s;
  }

  function cellSlot(round, x, y, w, h) {
    const stage = STAGE_OF[G.roundOrder[round - 1]];
    return `<g transform="translate(${x} ${y})">
      <rect width="${w}" height="${h}" rx="9" fill="var(--art-boardface)" stroke="var(--art-ink)"
        stroke-width="1.4" stroke-dasharray="7 5" opacity=".85"/>
      <text class="slot-rnd" x="${w / 2}" y="${h / 2 - 2}">Round ${round}</text>
      <text class="slot-stage" x="${w / 2}" y="${h / 2 + 17}">Stage ${stage}</text></g>`;
  }

  function cellHarvest(after, x, y, w, h) {
    const done = G.round > after || (G.round === after && G.phase !== 'work');
    return `<g transform="translate(${x} ${y})" opacity="${done ? '.45' : '1'}">
      <rect width="${w}" height="${h}" rx="9" fill="var(--rnd-tint)" stroke="var(--art-ink)" stroke-width="1.6"/>
      <g transform="translate(${w / 2 - 52} ${h / 2 - 26})">${ART.icon('grain', 30)}</g>
      <text class="harv-tx" x="${w / 2 + 10}" y="${h / 2 - 6}">Harvest</text>
      <text class="plate-note" x="${w / 2}" y="${h / 2 + 20}" text-anchor="middle">第 ${after} 回合後收成</text>
      <title>第 ${after} 回合之後收成</title></g>`;
  }

  function renderBoard() {
    if (has3d) return;
    let s = '';

    s += `<g>${ART.board(SM_W, SM_H, 9)}</g>`;
    BOARD_LAYOUT.small.forEach((id, i) => {
      s += cellSpace(spaceDef(id), SM.pad, SM.pad + i * (SM.h + SM.gap), SM.w, SM.h, 's' + i);
    });

    const bx = SM_W + BOARD_GAP;
    s += `<g transform="translate(${bx} 0)">${ART.board(BG_W, BG_H, 9)}</g>`;
    const cellX = (c) => bx + BG.pad + c * (BG.w + BG.gap);
    const cellY = (r) => BG.pad + r * (BG.h + BG.gap);

    BOARD_LAYOUT.roundCols.forEach((rounds, c) => {
      rounds.forEach((n, r) => {
        const id = G.roundOrder[n - 1];
        s += G.spaces[id].revealed
          ? cellSpace(spaceDef(id), cellX(c), cellY(r), BG.w, BG.h, 'r' + n)
          : cellSlot(n, cellX(c), cellY(r), BG.w, BG.h);
      });
      if (c > 0) s += cellHarvest(rounds[rounds.length - 1], cellX(c), cellY(rounds.length), BG.w, BG.h);
    });
    BOARD_LAYOUT.accum.forEach((id, i) => {
      s += cellSpace(spaceDef(id), cellX(0), cellY(i + 1), BG.w, BG.h, 'a' + i);
    });

    const W = SM_W + BOARD_GAP + BG_W, H = Math.max(SM_H, BG_H);
    if (has3d) return;
    $('viewBoard').innerHTML = `<svg class="boardsvg" viewBox="0 0 ${W} ${H}" width="100%"
      preserveAspectRatio="xMidYMid meet">${s}</svg>`;
  }

  // ------------------------------------------------------------ farmyard
  function tilePickable(p, i) {
    if (G.choice) return false;
    if (G.staging) return p === G.players[G.current] && canPlaceAnimal(G, i);
    if (p !== G.players[G.current]) return false;
    const st = currentStep(G);
    if (st === 'plow') return canPlow(p, i);
    if (st === 'build') return UI.buildKind === 'room' ? canBuildRoom(p, i) : canBuildStable(p, i);
    if (st === 'cottager') return canBuildRoom(p, i);
    if (st === 'freestable') return canBuildStable(p, i);
    if (st === 'minipasture') return p.farm[i].kind === 'empty';
    if (st === 'sow') return canSow(p, i);
    return false;
  }

  // A flat farm, used when WebGL is unavailable.
  function renderFarm2D() {
    const p = G.players[UI.view];
    const regs = regions(p);
    const W = ART.TW, H = ART.TH;
    let ground = '', over = '', hits = '';
    let roomOrder = 0;

    for (let i = 0; i < TILES; i++) {
      const [r, c] = rc(i);
      const t = p.farm[i];
      const g = regionOf(p, i, regs);
      const inPasture = !!(g && g.enclosed);
      let art;
      if (t.kind === 'room') art = ART.houseTile(i, p.house, p.pets[roomOrder++]);
      else if (t.kind === 'field') art = ART.fieldTile(i, t.crop);
      else art = ART.grassTile(i, inPasture);
      if (t.kind === 'empty' && t.stable) art += ART.stableArt(t.animals ? 62 : 34, 46, t.animals ? 0.7 : 1.1);
      if (t.animals && t.animals.n) art += ART.animalsArt(t.animals.kind, t.animals.n);

      ground += `<g transform="translate(${c * W} ${r * H})">${art}
        <rect width="${W}" height="${H}" fill="none" stroke="var(--art-edge)" stroke-width="1"/></g>`;
      hits += `<rect class="hit ${tilePickable(p, i) ? 'pick' : ''}" data-tile="${i}"
        x="${c * W}" y="${r * H}" width="${W}" height="${H}"/>`;
    }

    for (const gr of regs) {
      if (!gr.enclosed) continue;
      const [r, c] = rc(Math.min.apply(null, gr.tiles));
      const bw = gr.count > 9 || gr.capacity > 9 ? 50 : 42;
      over += `<g transform="translate(${c * W + 6} ${r * H + 6})">
        <rect width="${bw}" height="19" rx="9.5" fill="var(--panel)" stroke="var(--art-ink)" stroke-width="1.2" opacity=".92"/>
        <text x="${bw / 2}" y="13.5" text-anchor="middle" font-size="12" font-weight="700" fill="var(--ink)">${gr.count}/${gr.capacity}</text></g>`;
    }
    for (const e of Object.keys(p.fences)) over += ART.fenceArt(e);

    if (currentStep(G) === 'fences' && p === G.players[G.current]) {
      const fresh = (G.pending && G.pending.data.placed) || [];
      for (const e of allEdges()) {
        const on = !!p.fences[e];
        if (on && !fresh.includes(e)) continue;
        if (!on && fenceCount(p) >= 15) continue;
        const h = ART.edgeHit(e);
        hits += `<rect class="hit edge ${on ? 'undo' : ''}" data-edge="${e}"
          x="${h.x}" y="${h.y}" width="${h.w}" height="${h.h}" rx="4"/>`;
      }
    }

    $('flatFarm').innerHTML = `<div class="farm2d"><svg class="farmsvg"
      viewBox="-10 -10 ${COLS * W + 20} ${ROWS * H + 20}" width="100%" preserveAspectRatio="xMidYMid meet">
      <rect x="-10" y="-10" width="${COLS * W + 20}" height="${ROWS * H + 20}" rx="10" fill="var(--art-board)"/>
      ${ground}${over}${hits}</svg></div>`;
  }

  function renderFarm() {
    if (has3d) return;
    const p = G.players[UI.view];
    const bits = [`${HOUSE_ZH[p.house]} ${roomCount(p)} 間`, `田 ${fieldCount(p)}`,
      `牧場 ${pastureList(p).length}`, `柵欄 ${fenceCount(p)}/15`, `馬廄 ${stableCount(p)}/4`,
      `家庭 ${p.people} 人`];
    if (p.pets.length) bits.push(`寵物 ${p.pets.map((x) => LABEL[x.kind]).join('、')}`);
    if (p.beanfield) bits.push(`豆田 ${p.beanfield.crop ? p.beanfield.crop.n + ' 蔬菜' : '空'}`);
    const due = Object.keys(p.futures).sort((a, b) => a - b)
      .map((r) => `R${r}:${Object.keys(p.futures[r]).map((k) => LABEL[k] + p.futures[r][k]).join('')}`);
    if (due.length) bits.push(`回合格待收 ${due.join(' · ')}`);
    if (!View3D.isReady()) bits.push('開唔到 WebGL，用平面農場板');
    $('farmInfo').textContent = bits.join(' · ');

    if (View3D.isReady()) View3D.sync(G, UI);
    else renderFarm2D();
  }

  // ------------------------------------------------------------ cards
  function cardHtml(c, ctx) {
    const kinds = playableNow(G);
    const p = G.players[G.current];
    const cost = cardCost(G, p, c);
    const mine = UI.view === G.current && !G.choice;
    const playable = (ctx === 'hand' || ctx === 'maj') && kinds.includes(c.type) && mine;
    const owner = c.taken != null ? G.players[c.taken] : null;
    const band = c.type === 'occ' ? '職業 OCCUPATION'
      : c.type === 'min' ? '次要發展 MINOR IMPROVEMENT' : '主要發展 MAJOR IMPROVEMENT';
    const vp = c.vp
      ? `<svg class="vpseal" viewBox="-16 -16 32 32" width="30" height="30" aria-hidden="true">${ART.seal(c.vp, 0, 0, 14)}</svg>`
      : '';
    const canSwap = c.en === 'Cooking Hearth' && playable && hasCard(p, 'Fireplace');
    return `<div class="card ${c.type}">
      <div class="band">${esc(band)}</div>${vp}
      <div class="hd"><span class="nm">${esc(c.zh)}</span><span class="ennm">${esc(c.en)}</span></div>
      <div class="tx">${esc(c.txz)}</div>
      <div class="ft"><span class="costs">${costHtml(cost)}${c.trav ? '<span class="muted"> · 旅行卡</span>' : ''}</span>
        <span class="row">
        ${canSwap ? `<button data-act="playAlt" data-v="${c.uid}">退火爐換</button>` : ''}
        ${owner ? `<span class="muted">已被 ${esc(owner.name)} 取得</span>`
          : ctx === 'played' ? '' : `<button data-act="play" data-v="${c.uid}" ${playable && canPay(p, cost) ? '' : 'disabled'}>打出</button>`}
        </span>
      </div></div>`;
  }

  function renderCards() {
    if (has3d) return;
    const p = G.players[UI.view];
    const tabs = [['occ', `職業 ${p.hand.occ.length}`], ['min', `次要 ${p.hand.min.length}`],
      ['maj', '主要發展'], ['played', `已打出 ${p.played.length}`]];
    $('cardTabs').innerHTML = tabs.map(([k, l]) =>
      `<button data-ctab="${k}" class="${UI.cardTab === k ? 'sel' : ''}">${esc(l)}</button>`).join('');

    let list;
    if (UI.cardTab === 'occ') list = p.hand.occ.map((c) => cardHtml(c, 'hand'));
    else if (UI.cardTab === 'min') list = p.hand.min.map((c) => cardHtml(c, 'hand'));
    else if (UI.cardTab === 'maj') list = G.majors.map((c) => cardHtml(c, 'maj'));
    else list = p.played.map((c) => cardHtml(c, 'played'));
    $('cards').innerHTML = list.join('') || '<p class="muted">冇卡。</p>';
  }

  // ------------------------------------------------------------ dock: prompt
  function btn(action, label, disabled, extra) {
    return `<button data-act="${action}" ${extra || ''} ${disabled ? 'disabled' : ''}>${label}</button>`;
  }

  function renderPrompt() {
    const el = $('prompt');
    if (G.over) {
      el.innerHTML = `<div class="panel"><h3>遊戲結束</h3><p>喺「☰ 選單 → 計分」睇最終分數。</p></div>`;
      return;
    }
    if (G.feeding) { el.innerHTML = feedPanel(); return; }

    const parts = [];
    const p = G.players[G.current];

    if (G.staging) {
      parts.push(`<div class="panel"><h3>放置動物</h3>
        <p>${ic(G.staging.kind, 20)} ${esc(LABEL[G.staging.kind])} ×${G.staging.n} — 喺「農場」撳牧場、獨立馬廄或房屋（寵物）。</p>
        <div class="row">${btn('discardStaged', '放棄剩餘動物')}</div></div>`);
    }

    const st = currentStep(G);
    if (st) {
      const def = G.pending.spaceId ? spaceDef(G.pending.spaceId) : null;
      const title = def ? def.zh : '卡片行動';
      const steps = G.pending.steps.map((s, i) =>
        `${i === G.pending.i ? '▶ ' : i < G.pending.i ? '✓ ' : ''}${STEP_ZH[s] || s}`)
        .join(def && def.andOr ? '　／　' : '　→　');
      let body = '';

      if (st === 'plow') {
        const any = p.farm.some((t, i) => canPlow(p, i));
        body = `<p>喺「農場」撳一格空地犁田${fieldCount(p) ? '（要同已有田相鄰）' : ''}。`
          + (any ? '' : '<span class="muted">冇合法位置。</span>') + `</p>
          <div class="row">${btn('skip', '跳過')}</div>`;
      } else if (st === 'build') {
        const noStable = G.pending.limit && G.pending.limit.stable === 0;
        body = `<div class="row">
            <button data-act="buildKind" data-v="room" class="${UI.buildKind === 'room' ? 'sel' : ''}">建房間 ${costHtml(roomCost(G, p))}</button>
            ${noStable ? '' : `<button data-act="buildKind" data-v="stable" class="${UI.buildKind === 'stable' ? 'sel' : ''}">建馬廄 ${costHtml({ wood: 2 })}</button>`}
            ${btn('skip', '完成')}
            <span class="muted">喺「農場」撳格建造，可以連建多間；房間要同現有房間相鄰。</span>
          </div>`;
      } else if (st === 'cottager') {
        const cost = renovateCost(G, p);
        body = `<div class="row">
            ${cost ? btn('renovate', `翻新為${HOUSE_ZH[nextHouse(p)]} ${costText(cost)}`, !canPay(p, cost)) : ''}
            ${btn('skip', '跳過')}
            <span class="muted">或者喺「農場」撳格建 1 間房（${costWords(roomCost(G, p))}）。</span>
          </div>`;
      } else if (st === 'freestable') {
        body = `<div class="row">${btn('skip', '跳過')}
          <span class="muted">喺「農場」撳一格空地，免費起 1 個馬廄。</span></div>`;
      } else if (st === 'minipasture') {
        body = `<div class="row">${btn('skip', '跳過')}
          <span class="muted">喺「農場」撳一格空地，免費圍起做牧場；已有牧場就要同佢相鄰。</span></div>`;
      } else if (st === 'fences') {
        const ok = fencesValid(p);
        const a = fenceAllowance(G, p);
        const d = G.pending.data;
        const n = (d.placed || []).length;
        const freeLeft = Math.max(0, a.free - (d.free || 0));
        body = `<p>喺「農場」撳格與格之間起柵欄，每條 ${costHtml({ wood: 1 })}${a.clayOk ? '（冇木可以用黏土）' : ''}${freeLeft ? `，仲有 ${freeLeft} 條免費` : ''}。今次新起嘅可以再撳一次取消。</p>`
          + (ok ? '' : '<p class="muted">⚠️ 有柵欄未圍成牧場，唔可以完成。移走佢哋先。</p>')
          + `<div class="row">${btn('confirmFences', '完成', !ok)}${btn('undoFences', `取消今次全部（${n}）`, !n)}</div>`;
      } else if (st === 'sow') {
        const bean = p.beanfield && !p.beanfield.crop;
        body = `<div class="row">
            <button data-act="sowKind" data-v="grain" class="${UI.sowKind === 'grain' ? 'sel' : ''}">播 ${ic('grain', 17)} 穀物（${p.supply.grain}）</button>
            <button data-act="sowKind" data-v="veg" class="${UI.sowKind === 'veg' ? 'sel' : ''}">播 ${ic('veg', 17)} 蔬菜（${p.supply.veg}）</button>
            ${bean ? btn('sowBean', '播落豆田', p.supply.veg < 1) : ''}
            ${btn('skip', '完成')}
            <span class="muted">喺「農場」撳空田播種。穀物變 3、蔬菜變 2。</span>
          </div>`;
      } else if (st === 'bake') {
        const ov = ovensOf(p);
        body = ov.length
          ? `<div class="row">${ov.map((o) => `<button data-act="bake" data-v="${esc(o)}" ${p.supply.grain < 1 ? 'disabled' : ''}>${esc(OVENS[o].zh)}：1 穀物 → ${ic('food', 17)}${OVENS[o].food}</button>`).join('')}${btn('skip', '完成')}</div>`
          : `<div class="row">${btn('skip', '完成')}<span class="muted">你冇烤爐，唔可以烤麵包。</span></div>`;
      } else if (st === 'growth' || st === 'growthAny') {
        const ok = canGrow(G, st === 'growthAny');
        body = `<div class="row">${btn('grow', '家庭成長 +1 人', !ok)}${btn('skip', '跳過')}
          <span class="muted">${st === 'growthAny' ? '即使冇空房都可以。' : `住得落 ${livingSpace(p)} 人、現有 ${p.people} 人。`}</span></div>`;
      } else if (st === 'renovate') {
        const cost = renovateCost(G, p);
        body = cost
          ? `<div class="row">${btn('renovate', `翻新為${HOUSE_ZH[nextHouse(p)]} ${costText(cost)}`, !canPay(p, cost))}${btn('skip', '跳過')}</div>`
          : `<div class="row">${btn('skip', '跳過')}<span class="muted">${p.noRenovate ? '壁爐架令你唔可以再翻新。' : '已經係石屋，唔使翻新。'}</span></div>`;
      } else {
        body = `<div class="row">${btn('skip', '跳過')}<span class="muted">${has3d
          ? '手牌彈咗出嚟，撳一張金框嘅打出；主要發展直接喺檯上撳。'
          : '喺「卡片」撳「打出」。'}</span></div>`;
      }

      parts.push(`<div class="panel"><h3>${esc(title)} — ${esc(STEP_ZH[st] || st)}</h3>
        <div class="steps">${esc(steps)}</div>${body}</div>`);
    } else if (!G.staging) {
      parts.push(`<div class="panel"><h3>${esc(p.name)} 放人</h3>
        <p>喺「行動板」撳一個空行動格。剩 ${p.workersLeft} 個人手。</p></div>`);
    }
    el.innerHTML = parts.join('');
  }

  function feedPanel() {
    const p = G.players[G.feeding.i];
    const need = foodNeeded(G, p);
    const short = Math.max(0, need - p.supply.food);
    return `<div class="panel"><h3>餵食 — ${esc(p.name)}</h3>
      <p>需要 <b>${need}</b> 食物（成人 ${p.people - p.newborn} × ${G.n === 1 ? 3 : 2}${p.newborn ? ` ＋ 新生兒 ${p.newborn} × 1` : ''}），現有 <b>${p.supply.food}</b>。
      ${short ? `<span class="muted">仲差 ${short}，唔補就每差 1 攞 1 個乞討標記（-3 分）。用下面「隨時可做」換食物。</span>` : ''}</p>
      <div class="row">${btn('confirmFeed', short ? `確認（攞 ${short} 個乞討標記）` : '確認餵食', false, 'class="primary"')}</div></div>`;
  }

  function renderFree() {
    const acts = freeActions(G, UI.view);
    if (!acts.length) { $('free').innerHTML = ''; return; }
    const mine = !G.choice && (G.feeding ? G.feeding.i === UI.view : G.current === UI.view);
    $('free').innerHTML = '<span class="lb">隨時可做</span>' + acts.map((a) =>
      `<button data-free="${esc(a.id)}" ${a.ok && mine ? '' : 'disabled'}>${esc(a.label)}</button>`).join('');
  }

  // ------------------------------------------------------------ action bar placement
  // Mirrors view3d's rule for when the hand is up, so the bar can sit just above it.
  function handUp() {
    if (!has3d) return false;
    if (UI.handPinned || UI.main === 'cards') return true;
    return !G.choice && !G.over && UI.view === G.current
      && ['playOcc', 'playMinor', 'playImprovement', 'playAny'].includes(currentStep(G));
  }

  let lastPromptKey = '';
  function placeActionBar() {
    const bar = $('actionbar');
    document.body.classList.toggle('hand-up', handUp());
    bar.hidden = !$('prompt').innerHTML.trim() && !$('free').innerHTML.trim();
    // A new instruction flashes the bar once, so a change of step is never missed.
    const key = $('prompt').textContent.replace(/\s+/g, ' ').slice(0, 80);
    if (key !== lastPromptKey) {
      lastPromptKey = key;
      bar.classList.remove('flash');
      void bar.offsetWidth;
      bar.classList.add('flash');
    }
  }

  // ------------------------------------------------------------ dock: resources
  const chip = (k, n, cls) =>
    `<span class="chip ${n ? '' : 'zero'} ${cls || ''}" title="${ART.NAMES[k]} ${n}">
      ${ic(k, 24)}<span class="cv"><span class="cl">${ART.NAMES[k]}</span><b>${n}</b></span></span>`;

  // Grouped by what the goods are for: building, eating, breeding.
  function chipsFor(p) {
    const row = (title, cells) => `<span class="rg">${title}</span>${cells}`;
    const fill = (n) => '<span></span>'.repeat(n);
    return `<span class="chips">
      ${row('建材', ['wood', 'clay', 'reed', 'stone'].map((k) => chip(k, p.supply[k])).join(''))}
      ${row('糧食', ['food', 'grain', 'veg'].map((k) => chip(k, p.supply[k])).join('')
        + chip('begging', p.begging, 'beg'))}
      ${row('動物', ANIM.map((k) => chip(k, animalTotal(p, k))).join('') + fill(1))}</span>`;
  }

  function renderRes() {
    const p = G.players[UI.view];
    const men = Array.from({ length: p.people }, (_, k) =>
      `<span class="mp ${k < p.workersLeft ? '' : 'used'}">${ART.meeple(PCOLOR[UI.view], 16)}</span>`).join('');
    $('resbar').innerHTML =
      `<span class="who">${ART.meeple(PCOLOR[UI.view], 16)} ${esc(p.name)}<span class="men">${men}</span></span>
       ${chipsFor(p)}
       ${G.n > 1 ? `<button class="rtoggle" data-act="allres">${UI.allres ? '▲ 收埋' : '▼ 其他玩家'}</button>` : ''}`;

    const box = $('allres');
    box.hidden = !(UI.allres && G.n > 1);
    if (box.hidden) { box.innerHTML = ''; return; }
    box.innerHTML = G.players.map((q, i) => (i === UI.view ? '' :
      `<div class="prow"><span class="who">${ART.meeple(PCOLOR[i], 16)} ${esc(q.name)}</span>${chipsFor(q)}</div>`)).join('');
  }

  // ------------------------------------------------------------ right rail: log
  function renderRail() {
    const el = $('railLog');
    if (!el) return;
    const last = G.log[G.log.length - 1] || '';
    $('railHead').innerHTML = `${UI.logOpen ? '▾' : '▸'} 紀錄 · LOG
      ${UI.logOpen ? '' : `<span class="last">${esc(last)}</span>`}<span class="n">${G.log.length}</span>`;
    el.hidden = !UI.logOpen;
    if (!UI.logOpen) return;
    const lines = G.log.slice(-90).map(esc).join('<br>');
    const stuck = el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
    el.innerHTML = lines;
    if (stuck) el.scrollTop = el.scrollHeight;
  }

  // ------------------------------------------------------------ hover tooltip
  function findCard(uid) {
    for (const q of G.players) {
      const hit = q.hand.occ.concat(q.hand.min, q.played).find((c) => c.uid === uid);
      if (hit) return hit;
    }
    return G.majors.find((c) => c.uid === uid) || null;
  }

  function showTip(info) {
    const el = $('tip');
    if (!el) return;
    if (!info || !G) { el.hidden = true; el.innerHTML = ''; $('preview').hidden = true; return; }

    // A card gets a big, upright copy in the middle of the screen: the fanned or foreshortened
    // one on the table is too slanted to read.
    const pv = $('preview');
    pv.hidden = true;
    if (info.kind === 'card') {
      el.hidden = true;
      const c = findCard(info.uid);
      if (!c) return;
      const p = G.players[G.current];
      const cost = cardCost(G, p, c);
      const owner = c.taken != null ? G.players[c.taken] : null;
      const inHand = G.players.some((q) => q.hand.occ.concat(q.hand.min).includes(c));
      const band = c.type === 'occ' ? '職業 OCCUPATION'
        : c.type === 'min' ? '次要發展 MINOR IMPROVEMENT' : '主要發展 MAJOR IMPROVEMENT';
      const vp = c.vp
        ? `<svg class="vpseal" viewBox="-16 -16 32 32" width="38" height="38" aria-hidden="true">${ART.seal(c.vp, 0, 0, 14)}</svg>` : '';
      let status = '';
      if (owner) status = `已被 ${esc(owner.name)} 取得`;
      else if (c.played || G.players.some((q) => q.played.includes(c))) status = '已打出';
      else if ((inHand || c.type === 'maj') && UI.view === G.current && !G.choice
        && playableNow(G).includes(c.type)) status = canPay(p, cost) ? '✓ 可以打出' : '資源唔夠';
      pv.innerHTML = `<div class="card ${c.type}">
        <div class="band">${esc(band)}</div>${vp}
        <div class="hd"><span class="nm">${esc(c.zh)}</span><span class="ennm">${esc(c.en)}</span></div>
        <div class="art">${ART.cardArt(c, 324, 124)}</div>
        <div class="tx">${esc(c.txz || '')}</div>
        <div class="ft"><span class="costs">${costHtml(cost)}${c.trav ? '<span class="muted"> · 旅行卡</span>' : ''}</span>
          <span class="st">${status}</span></div></div>`;
      pv.hidden = false;
      return;
    }

    if (info.kind === 'space') {
      const def = spaceDef(info.id);
      const sp = G.spaces[info.id];
      if (!def) { el.hidden = true; return; }
      const goods = Object.keys(sp.goods).filter((k) => sp.goods[k] > 0)
        .map((k) => `<span class="cst">${ic(k, 16)}<b>${sp.goods[k]}</b></span>`).join(' ');
      const who = sp.occupiedBy !== null ? `<span class="muted">${esc(G.players[sp.occupiedBy].name)} 已經放咗人</span>`
        : canPlace(G, info.id) ? '<span style="color:var(--accent)">可以放人</span>' : '';
      el.innerHTML = `<h3>${esc(def.zh)}</h3><div class="en">${esc(def.en)}</div>
        <p>${spaceNotes(G, G.players[UI.view], def).map(esc).join('<br>')}</p>
        <div class="costs">${goods}${goods && who ? ' · ' : ''}${who}</div>`;
      el.hidden = false;
      return;
    }
    el.hidden = true;
  }

  // ------------------------------------------------------------ choice modal
  function renderModal() {
    const m = $('modal');
    if (!G.choice) { m.hidden = true; m.innerHTML = ''; return; }
    const p = G.players[G.choice.pi];
    m.hidden = false;
    m.innerHTML = `<div class="panel"><h3>${esc(p.name)} 揀一項</h3>
      <div class="row">${G.choice.opts.map((o) =>
        `<button data-choice="${esc(o.id)}" class="primary">${esc(o.label)}</button>`).join('')}</div></div>`;
  }

  // ------------------------------------------------------------ drawer
  function renderDrawer() {
    if ($('drawer').hidden) return;
    const tabs = [['log', '紀錄'], ['score', '計分'], ['game', '設定']];
    $('drawerTabs').innerHTML = tabs.map(([k, l]) =>
      `<button data-dtab="${k}" class="${UI.drawerTab === k ? 'sel' : ''}">${esc(l)}</button>`).join('');

    let html;
    if (UI.drawerTab === 'log') {
      html = `<div class="log">${G.log.map(esc).join('<br>')}</div>`;
    } else if (UI.drawerTab === 'score') {
      html = G.players.map((p) => {
        const s = score(G, p);
        return `<h3 style="font-size:14px;margin:8px 0 4px">${esc(p.name)}</h3>
          <table class="score">${s.rows.map((r) =>
            `<tr><td>${esc(r.zh)}</td><td class="muted">${r.val}</td><td>${r.pts > 0 ? '+' : ''}${r.pts}</td></tr>`).join('')}
          <tr class="tot"><td>總分</td><td></td><td>${s.total}</td></tr></table>
          ${s.bonusDetail.length ? `<p class="muted" style="font-size:11.5px">${esc(s.bonusDetail.join('、'))}</p>` : ''}`;
      }).join('');
    } else {
      html = `<div class="row" style="margin-top:6px">
        ${btn('new1', '新遊戲 · 1 人')}${btn('new2', '新遊戲 · 2 人')}${btn('theme', '🌓 深／淺色')}
      </div><p class="muted" style="font-size:12px;margin-top:10px">
        A、B 兩副卡嘅效果全部自動結算，唔使手動加減物資。</p>`;
    }
    $('drawerBody').innerHTML = html;
  }

  // ------------------------------------------------------------ which view the game needs
  function wantTab() {
    if (G.over || G.choice) return null;
    if (G.staging) return 'farm';
    const st = currentStep(G);
    if (!st) return G.feeding ? null : 'board';
    if (['plow', 'build', 'cottager', 'freestable', 'minipasture', 'sow', 'fences'].includes(st)) return 'farm';
    // Occupations and minors come out of the hand, which pops up by itself; only a major
    // needs the camera to go to the cards on the table.
    if (st === 'playImprovement') return 'majors';
    if (['playOcc', 'playMinor', 'playAny'].includes(st)) return has3d ? null : 'cards';
    return null;                       // bake, growth, renovate: all done from the dock
  }

  function render() {
    if (!G) return;
    // The board follows whoever is acting; you can still peek at the other farm within a turn.
    if (UI.lastCurrent !== G.current) { UI.view = G.current; UI.lastCurrent = G.current; }
    if (G.phase === 'work' && (G.pending || G.staging)) UI.view = G.current;
    if (G.feeding) UI.view = G.feeding.i;

    // Follow the game to the view it needs, but leave manual browsing alone.
    const want = wantTab();
    const key = [want, G.current, G.round, G.pending ? G.pending.i : -1, G.staging ? 1 : 0].join('|');
    if (want && key !== UI.autoKey) UI.main = want;
    UI.autoKey = key;

    // Frame the screen in the colour of whoever has to act.
    const who = G.over ? -1 : G.feeding ? G.feeding.i : G.current;
    document.body.style.setProperty('--turn', who < 0 ? 'transparent' : PCOLOR[who]);
    $('turnTag').textContent = who < 0 ? '' : `${G.players[who].name} 嘅回合`;
    renderStatus(); renderMainTabs();
    renderBoard(); renderFarm(); renderCards();
    renderPrompt(); renderFree(); renderRes(); renderModal(); renderDrawer(); renderRail();
    if (has3d) { showTip(null); View3D.sync(G, UI); }
    placeActionBar();
    save();
  }

  // ------------------------------------------------------------ input
  function clickTile(i) {
    if (G.choice) return;
    if (G.staging) { placeAnimal(G, i); return; }
    const st = currentStep(G);
    if (st === 'plow') plow(G, i);
    else if (st === 'build') (UI.buildKind === 'room' ? buildRoom : buildStable)(G, i);
    else if (st === 'cottager') buildRoom(G, i);
    else if (st === 'freestable') buildStable(G, i);
    else if (st === 'minipasture') fenceTile(G, i);
    else if (st === 'sow') sow(G, i, UI.sowKind);
  }

  function pick3d(d) {
    if (!G || G.over) return;
    if (d.type === 'seat') { setView(d.pi); return; }
    if (G.choice) return;
    if (d.type === 'tile') clickTile(d.i);
    else if (d.type === 'edge') toggleFence(G, d.e);
    else if (d.type === 'space') placeWorker(G, d.id);
    else if (d.type === 'card') playCard(G, d.uid);
    render();
  }

  // The camera swings round to that side of the table; the flat fallback flips a card.
  function setView(i) {
    if (i === UI.view) return;
    if (has3d) { UI.view = i; render(); return; }
    const f = $('flip');
    f.classList.remove('turning');
    void f.offsetWidth;                 // restart the animation
    f.classList.add('turning');
    setTimeout(() => { UI.view = i; render(); }, 150);
  }

  // Scrolling over the table steps through the views, near to far and back.
  const VIEW_ORDER = ['table', 'board', 'farm', 'cards', 'majors'];
  function stepView(dir) {
    if (!G) return;
    const i = Math.max(0, VIEW_ORDER.indexOf(UI.main));
    const next = VIEW_ORDER[Math.min(VIEW_ORDER.length - 1, Math.max(0, i + dir))];
    if (next === UI.main) return;
    UI.main = next;
    render();
  }

  const openDrawer = (on) => {
    $('drawer').hidden = !on;
    $('scrim').hidden = !on;
    if (on) renderDrawer();
  };

  document.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-space],[data-tile],[data-edge],[data-act],[data-view],[data-main],[data-ctab],[data-free],[data-choice],[data-dtab]');
    if (!t || !G) return;

    if (t.dataset.choice) { resolveChoice(G, t.dataset.choice); return render(); }
    if (G.choice) return;                                   // a choice blocks everything else
    if (t.dataset.main) { UI.main = t.dataset.main; return render(); }
    if (t.dataset.view != null) return setView(+t.dataset.view);
    if (t.dataset.ctab) { UI.cardTab = t.dataset.ctab; return render(); }
    if (t.dataset.dtab) { UI.drawerTab = t.dataset.dtab; return renderDrawer(); }
    if (t.dataset.free) { useFree(G, UI.view, t.dataset.free); return render(); }
    if (t.dataset.space) { placeWorker(G, t.dataset.space); return render(); }
    if (t.dataset.tile != null) { clickTile(+t.dataset.tile); return render(); }
    if (t.dataset.edge) { toggleFence(G, t.dataset.edge); return render(); }

    const v = t.dataset.v;
    switch (t.dataset.act) {
      case 'allres': UI.allres = !UI.allres; break;
      case 'hand': UI.handPinned = !UI.handPinned; break;
      case 'log': UI.logOpen = !UI.logOpen; renderRail(); save(); return;
      case 'buildKind': UI.buildKind = v; break;
      case 'sowKind': UI.sowKind = v; break;
      case 'sowBean': sowBeanfield(G); break;
      case 'skip': nextStep(G); break;
      case 'confirmFences': confirmFences(G); break;
      case 'undoFences': undoFences(G); break;
      case 'bake': bake(G, v); break;
      case 'grow': grow(G); break;
      case 'renovate': renovate(G); break;
      case 'play': playCard(G, v); break;
      case 'playAlt': playCard(G, v, 'alt'); break;
      case 'discardStaged': discardStaged(G); break;
      case 'confirmFeed': confirmFeed(G); break;
      case 'new1': if (confirm('開新遊戲（1 人局）？現時進度會消失。')) { openDrawer(false); start(1); } return;
      case 'new2': if (confirm('開新遊戲（2 人局）？現時進度會消失。')) { openDrawer(false); start(2); } return;
      case 'theme': {
        const cur = document.documentElement.getAttribute('data-theme');
        document.documentElement.setAttribute('data-theme', cur === 'dark' ? 'light' : 'dark');
        break;
      }
      default: return;
    }
    render();
  });

  $('drawerClose').addEventListener('click', () => openDrawer(false));
  $('scrim').addEventListener('click', () => openDrawer(false));

  window.AG = { start, render, state: () => G, ui: UI };   // handy from the console

  // The table has to claim the window before anything renders into it.
  let has3d = false;
  try { has3d = View3D.init($('stage'), { onPick: pick3d, onHover: showTip, onStep: stepView }); } catch (e) { has3d = false; }
  if (!has3d) {
    $('stage').hidden = true;
    $('flat').hidden = false;
    document.querySelector('.vig').hidden = true;
  }

  // The table needs room: a landscape desktop window, as the gate says.
  function checkSize() {
    const ok = !has3d || (innerWidth >= 1000 && innerHeight >= 560);
    $('gate').hidden = ok;
    if (ok && has3d) View3D.resize();
  }
  addEventListener('resize', checkSize);
  checkSize();

  if (!load()) start(2);
  render();
})();
