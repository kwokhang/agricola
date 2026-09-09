// Agricola 1–2 player — DOM layer. Renders engine state and routes clicks back into it.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
  const SAVE_KEY = 'agricola.game.v1';

  const PCOLOR = ['var(--p1)', 'var(--p2)'];
  const ic = (k, s) => ART.icon(k, s || 17);
  const costHtml = (cost) => {
    if (!cost || !Object.keys(cost).length) return '<span class="free">免費</span>';
    return Object.keys(cost).map((k) => `<span class="cst">${ic(k, 16)}<b>${cost[k]}</b></span>`).join('');
  };

  let G = null;
  const UI = { view: 0, lastCurrent: 0, buildKind: 'room', sowKind: 'grain', tab: 'occ' };

  // ------------------------------------------------------------ persistence
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ G, UI })); } catch (e) { /* private window */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const o = JSON.parse(raw);
      if (!o || !o.G || !o.G.players) return false;
      G = o.G;
      Object.assign(UI, o.UI || {});
      return true;
    } catch (e) { return false; }
  }

  function start(n) {
    G = newGame(n === 1 ? ['玩家'] : ['玩家 1', '玩家 2']);
    UI.view = 0;
    render();
  }

  // ------------------------------------------------------------ status bar
  function renderStatus() {
    if (!G) return;
    const phase = G.over ? '遊戲結束' : G.feeding ? '收成 · 餵食' : G.phase === 'work' ? '工作階段' : G.phase;
    const bits = [
      `<span class="pill">回合 <b>${G.round}</b> / 14</span>`,
      `<span class="pill">${esc(phase)}</span>`,
    ];
    if (HARVEST_ROUNDS.includes(G.round) && !G.over) bits.push(`<span class="pill harvest">${ic('grain', 15)}本回合有收成</span>`);
    G.players.forEach((p, i) => {
      const active = (G.feeding ? G.feeding.i === i : G.current === i) && !G.over;
      const men = Array.from({ length: p.people }, (_, k) =>
        `<span class="mp ${k < p.workersLeft ? '' : 'used'}">${ART.meeple(PCOLOR[i], 15)}</span>`).join('');
      bits.push(`<span class="pill ${active ? 'now' : ''}">${esc(p.name)}${i === G.startPlayer ? ART.icon('start', 15, 'sp') : ''}
        <span class="men">${men}</span>${ic('food', 15)}<b>${p.supply.food}</b></span>`);
    });
    $('status').innerHTML = bits.join('');
  }

  // ------------------------------------------------------------ action board
  const SP_W = 178, SP_H = 112, SP_GAP = 9, SP_PAD = 16, SP_COLS = 3;

  function spaceTile(def, sp, col, row, i) {
    const x = SP_PAD + col * (SP_W + SP_GAP), y = SP_PAD + row * (SP_H + SP_GAP);
    const free = canPlace(G, def.id);
    const acc = (G.n === 1 && def.accumSolo) ? def.accumSolo : def.accum;
    const sub = def.gain ? `取 ${Object.keys(def.gain).map((k) => LABEL[k] + def.gain[k]).join('、')}`
      : acc ? `每回合 +${Object.keys(acc).map((k) => LABEL[k] + acc[k]).join('、')}`
      : (def.steps || []).map((s) => STEP_ZH[s]).join(def.andOr ? ' ／ ' : ' → ');

    let s = `<g class="sp ${free ? 'free' : ''} ${sp.occupiedBy !== null ? 'taken' : ''}" transform="translate(${x} ${y})">
      <clipPath id="spc${i}"><rect width="${SP_W}" height="${SP_H}" rx="9"/></clipPath>
      <g clip-path="url(#spc${i})">
        ${ART.scene(def.id, 0, 0, SP_W, SP_H)}
        ${ART.plate(7, SP_H - 47, SP_W - 14, 40, esc(def.zh), esc(sub.length > 14 ? sub.slice(0, 13) + '…' : sub))}
        ${sp.occupiedBy !== null ? `<rect width="${SP_W}" height="${SP_H}" fill="var(--art-ink)" opacity=".3"/>` : ''}
      </g>
      <rect class="spframe" width="${SP_W}" height="${SP_H}" rx="9" fill="none" stroke="var(--art-ink)" stroke-width="2"/>`;

    const goods = Object.keys(sp.goods).filter((k) => sp.goods[k] > 0);
    goods.forEach((k, gi) => { s += ART.token(k, sp.goods[k], 8 + gi * 40, 8, 34); });

    if (sp.occupiedBy !== null) {
      s += `<g class="onspace" transform="translate(${SP_W - 46} 6)">
        <circle cx="18" cy="18" r="18" fill="var(--panel)" stroke="var(--art-ink)" stroke-width="1.6" opacity=".9"/>
        <g transform="translate(5 4)">${ART.meeple(PCOLOR[sp.occupiedBy], 26)}</g></g>`;
    }
    s += `<rect class="hit sp-hit ${free ? 'pick' : ''}" data-space="${def.id}" width="${SP_W}" height="${SP_H}" rx="9"/>
      <title>${esc(def.zh)} ${esc(def.en)} — ${esc(sub)}</title></g>`;
    return s;
  }

  function renderSpaces() {
    const list = [];
    BASE_SPACES.forEach((d) => list.push(d));
    G.roundOrder.forEach((id) => {
      if (!G.spaces[id].revealed) return;
      const d = ROUND_SPACES.find((x) => x.id === id);
      if (d) list.push(d);
    });

    const rows = Math.ceil(list.length / SP_COLS);
    const W = SP_PAD * 2 + SP_COLS * SP_W + (SP_COLS - 1) * SP_GAP;
    const H = SP_PAD * 2 + rows * SP_H + (rows - 1) * SP_GAP;
    const tiles = list.map((d, i) =>
      spaceTile(d, G.spaces[d.id], i % SP_COLS, Math.floor(i / SP_COLS), i)).join('');

    $('spaces').innerHTML = `<svg class="boardsvg" viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet">
      ${ART.board(W, H, 9)}${tiles}</svg>`;

    // Remaining cards, grouped by stage and sorted by name — the shuffled order stays hidden.
    const RANGE = { 1: '1–4', 2: '5–7', 3: '8–9', 4: '10–11', 5: '12–13', 6: '14' };
    const rest = {};
    G.roundOrder.forEach((id) => {
      if (G.spaces[id].revealed) return;
      const d = ROUND_SPACES.find((x) => x.id === id);
      (rest[d.stage] = rest[d.stage] || []).push(d.zh);
    });
    const lines = Object.keys(rest).map((st) =>
      `階段 ${st}（第 ${RANGE[st]} 回合）：${rest[st].sort().join('、')}`);
    $('upcoming').innerHTML = lines.length
      ? `<b>仲未出嘅行動卡：</b><br>${lines.map(esc).join('<br>')}`
      : '';
  }

  // ------------------------------------------------------------ farmyard
  function tilePickable(p, i) {
    if (G.staging) return true;
    if (p !== G.players[G.current]) return false;
    const st = currentStep(G);
    if (st === 'plow') return canPlow(p, i);
    if (st === 'build') return UI.buildKind === 'room' ? canBuildRoom(p, i) : canBuildStable(p, i);
    if (st === 'sow') return canSow(p, i);
    return false;
  }

  function renderFarm() {
    const p = G.players[UI.view];
    const regs = regions(p);
    const W = ART.TW, H = ART.TH;
    const layers = { ground: '', over: '', hits: '' };

    for (let i = 0; i < TILES; i++) {
      const [r, c] = rc(i);
      const t = p.farm[i];
      const g = regionOf(p, i, regs);
      const inPasture = !!(g && g.enclosed);
      let art;
      if (t.kind === 'room') art = ART.houseTile(i, p.house, p.pet);
      else if (t.kind === 'field') art = ART.fieldTile(i, t.crop);
      else art = ART.grassTile(i, inPasture);
      if (t.kind === 'empty' && t.stable) art += ART.stableArt(t.animals ? 62 : 34, 46, t.animals ? 0.7 : 1.1);
      if (t.animals && t.animals.n) art += ART.animalsArt(t.animals.kind, t.animals.n);

      layers.ground += `<g transform="translate(${c * W} ${r * H})">${art}
        <rect width="${W}" height="${H}" fill="none" stroke="var(--art-edge)" stroke-width="1"/></g>`;

      const pick = tilePickable(p, i);
      layers.hits += `<rect class="hit ${pick ? 'pick' : ''}" data-tile="${i}"
        x="${c * W}" y="${r * H}" width="${W}" height="${H}"/>`;
    }

    // Pasture capacity badges sit above the ground layer.
    for (const gr of regs) {
      if (!gr.enclosed) continue;
      const t0 = Math.min.apply(null, gr.tiles);
      const [r, c] = rc(t0);
      layers.over += `<g transform="translate(${c * W + 6} ${r * H + 6})">
        <rect width="${gr.count > 9 || gr.capacity > 9 ? 50 : 42}" height="19" rx="9.5" fill="var(--panel)" stroke="var(--art-ink)" stroke-width="1.2" opacity=".92"/>
        <text x="${(gr.count > 9 || gr.capacity > 9 ? 50 : 42) / 2}" y="13.5" text-anchor="middle" font-size="12" font-weight="700" fill="var(--ink)">${gr.count}/${gr.capacity}</text></g>`;
    }

    for (const e of Object.keys(p.fences)) layers.over += ART.fenceArt(e);

    const fencing = currentStep(G) === 'fences' && p === G.players[G.current];
    const fresh = (G.pending && G.pending.data.placed) || [];
    if (fencing) {
      for (const e of allEdges()) {
        const on = !!p.fences[e];
        if (on && !fresh.includes(e)) continue;              // built earlier: permanent
        if (!on && (fenceCount(p) >= 15 || p.supply.wood < 1)) continue;
        const h = ART.edgeHit(e);
        layers.hits += `<rect class="hit edge ${on ? 'undo' : ''}" data-edge="${e}"
          x="${h.x}" y="${h.y}" width="${h.w}" height="${h.h}" rx="4"/>`;
      }
    }

    $('farm').innerHTML = `<svg class="farmsvg" viewBox="-10 -10 ${COLS * W + 20} ${ROWS * H + 20}"
      width="100%" preserveAspectRatio="xMidYMid meet">
      <rect x="-10" y="-10" width="${COLS * W + 20}" height="${ROWS * H + 20}" rx="10" fill="var(--art-board)"/>
      ${layers.ground}${layers.over}${layers.hits}</svg>`;

    $('farmTitle').textContent = `農場 Farmyard — ${p.name}`;
    $('farmTabs').innerHTML = G.players.map((q, i) =>
      `<button data-view="${i}" class="${i === UI.view ? 'sel' : ''}">${ART.meeple(PCOLOR[i], 14)} ${esc(q.name)}</button>`).join('')
      + `<span class="muted farmstat">柵欄 ${fenceCount(p)}/15 · 馬廄 ${stableCount(p)}/4 · ${HOUSE_ZH[p.house]} ${roomCount(p)} 間</span>`;

    renderMat(p);
  }

  // ------------------------------------------------------------ player mat
  const MAT_COLS = 6, MAT_W = 92, MAT_H = 64, MAT_GAP = 8, MAT_PAD = 14, MAT_STRIP = 34;

  function matSlot(key, n, col, row, label) {
    const x = MAT_PAD + col * (MAT_W + MAT_GAP);
    const y = MAT_PAD + MAT_STRIP + 8 + row * (MAT_H + MAT_GAP);
    return `<g transform="translate(${x} ${y})">
      ${ART.slot(0, 0, MAT_W, MAT_H)}
      <g transform="translate(7 9)">${ART.icon(key, 30)}</g>
      <text class="mat-n" x="${MAT_W - 10}" y="34">${n}</text>
      <text class="mat-lb" x="7" y="${MAT_H - 8}">${esc(label)}</text></g>`;
  }

  function renderMat(p) {
    const cells = RES.map((k) => [k, p.supply[k], LABEL[k]])
      .concat(ANIM.map((k) => [k, animalTotal(p, k), LABEL[k]]))
      .concat([['begging', p.begging, '乞討']]);
    const rows = Math.ceil(cells.length / MAT_COLS);
    const W = MAT_PAD * 2 + MAT_COLS * MAT_W + (MAT_COLS - 1) * MAT_GAP;
    const H = MAT_PAD * 2 + MAT_STRIP + 8 + rows * MAT_H + (rows - 1) * MAT_GAP;

    const men = Array.from({ length: p.people }, (_, k) =>
      `<g transform="translate(${k * 22} 0)" opacity="${k < p.workersLeft ? 1 : .3}">${ART.meeple(PCOLOR[G.players.indexOf(p)], 22)}</g>`).join('');

    const strip = `<g transform="translate(${MAT_PAD} ${MAT_PAD})">
      ${ART.plate(0, 0, W - MAT_PAD * 2, MAT_STRIP, esc(`${HOUSE_ZH[p.house]} · 房間 ${roomCount(p)} · 柵欄 ${fenceCount(p)}/15 · 馬廄 ${stableCount(p)}/4`), '')}
      <g transform="translate(${W - MAT_PAD * 2 - 12 - p.people * 22} 6)">${men}</g></g>`;

    $('supply').innerHTML = `<svg class="matsvg" viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet">
      ${ART.board(W, H, 8)}${strip}
      ${cells.map(([k, n, lb], i) => matSlot(k, n, i % MAT_COLS, Math.floor(i / MAT_COLS), lb)).join('')}</svg>`;
  }

  // ------------------------------------------------------------ action panel
  function btn(action, label, disabled, extra) {
    return `<button data-act="${action}" ${extra || ''} ${disabled ? 'disabled' : ''}>${label}</button>`;
  }

  function renderPanel() {
    const el = $('panel');
    if (G.over) {
      el.innerHTML = `<div class="panel"><h3>遊戲結束</h3><p>睇右邊嘅計分表。</p></div>`;
      return;
    }
    if (G.feeding) { el.innerHTML = feedPanel(); return; }

    const parts = [];
    const p = G.players[G.current];

    if (G.staging) {
      parts.push(`<div class="panel"><h3>放置動物</h3>
        <p>${ic(G.staging.kind, 22)} ${esc(LABEL[G.staging.kind])} ×${G.staging.n} — 點擊牧場、獨立馬廄或房屋（寵物）。</p>
        <div class="row">${btn('discardStaged', '放棄剩餘動物')}</div></div>`);
    }

    const st = currentStep(G);
    if (st) {
      const def = spaceDef(G.pending.spaceId);
      const steps = G.pending.steps.map((s, i) =>
        `${i === G.pending.i ? '▶ ' : i < G.pending.i ? '✓ ' : ''}${STEP_ZH[s]}`)
        .join(def.andOr ? '　／　' : '　→　');
      let body = '';

      if (st === 'plow') {
        const any = p.farm.some((t, i) => canPlow(p, i));
        body = `<p>點擊農場上一格空地犁田${fieldCount(p) ? '（必須同已有田相鄰）' : ''}。</p>`
          + (any ? '' : '<p class="muted">冇合法位置。</p>')
          + `<div class="row">${btn('skip', '跳過')}</div>`;
      } else if (st === 'build') {
        const rc2 = ROOM_COST[p.house];
        body = `<div class="row">
            <button data-act="buildKind" data-v="room" class="${UI.buildKind === 'room' ? 'sel' : ''}">建房間 ${costText(rc2)}</button>
            <button data-act="buildKind" data-v="stable" class="${UI.buildKind === 'stable' ? 'sel' : ''}">建馬廄 ${costHtml({ wood: 2 })}</button>
            ${btn('skip', '完成')}
          </div><p class="muted">點擊農場格建造，可以連建多間。房間要同現有房間相鄰。</p>`;
      } else if (st === 'fences') {
        const ok = fencesValid(p);
        const fresh2 = (G.pending.data.placed || []).length;
        body = `<p>點擊格與格之間嘅位置起柵欄，每條 ${costHtml({ wood: 1 })}。今次新起嘅可以再撳一次取消。</p>`
          + (ok ? '' : '<p class="muted">⚠️ 有柵欄未圍成牧場，唔可以完成。移走佢哋先。</p>')
          + `<div class="row">${btn('confirmFences', '完成', !ok)}${btn('undoFences', `取消今次全部（${fresh2}）`, !fresh2)}</div>`;
      } else if (st === 'sow') {
        body = `<div class="row">
            <button data-act="sowKind" data-v="grain" class="${UI.sowKind === 'grain' ? 'sel' : ''}">播 ${ic('grain', 17)} 穀物（${p.supply.grain}）</button>
            <button data-act="sowKind" data-v="veg" class="${UI.sowKind === 'veg' ? 'sel' : ''}">播 ${ic('veg', 17)} 蔬菜（${p.supply.veg}）</button>
            ${btn('skip', '完成')}
          </div><p class="muted">點擊空田播種。穀物變 3、蔬菜變 2。</p>`;
      } else if (st === 'bake') {
        const ov = ovensOf(p);
        body = ov.length
          ? `<div class="row">${ov.map((o) => `<button data-act="bake" data-v="${esc(o)}">${esc(o)} → ${ic('food', 17)}${OVENS[o].food}</button>`).join('')}${btn('skip', '完成')}</div>`
          : `<p class="muted">你冇烤爐（火爐／烹飪爐灶／黏土烤爐／石烤爐），唔可以烤麵包。</p><div class="row">${btn('skip', '完成')}</div>`;
      } else if (st === 'growth' || st === 'growthAny') {
        const ok = canGrow(G, st === 'growthAny');
        body = `<p>${st === 'growthAny' ? '即使冇空房都可以家庭成長。' : `需要空房間：房間 ${roomCount(p)}、人數 ${p.people}。`}</p>
          <div class="row">${btn('grow', '家庭成長 +1 人', !ok)}${btn('skip', '跳過')}</div>`;
      } else if (st === 'renovate') {
        const cost = renovateCost(p);
        body = cost
          ? `<div class="row">${btn('renovate', `翻新為${HOUSE_ZH[NEXT_HOUSE[p.house]]} ${costText(cost)}`, !canPay(p, cost))}${btn('skip', '跳過')}</div>`
          : `<p class="muted">已經係石屋，唔使翻新。</p><div class="row">${btn('skip', '跳過')}</div>`;
      } else {
        body = `<p>喺右邊卡片欄撳「打出」。</p><div class="row">${btn('skip', '跳過')}</div>`;
      }

      parts.push(`<div class="panel"><h3>${esc(def.zh)} — ${esc(STEP_ZH[st])}</h3>
        <p class="muted">${esc(steps)}</p>${body}</div>`);
    } else if (!G.staging) {
      parts.push(`<div class="panel"><h3>${esc(p.name)} 放人</h3>
        <p>撳左邊一個空行動格。剩 ${p.workersLeft} 個人手。</p></div>`);
    }
    el.innerHTML = parts.join('');
  }

  function feedPanel() {
    const i = G.feeding.i, p = G.players[i];
    const need = foodNeeded(G, p);
    const short = Math.max(0, need - p.supply.food);
    const cooks = cookOptions(p);
    return `<div class="panel"><h3>餵食 — ${esc(p.name)}</h3>
      <p>需要 <b>${need}</b> 食物（成人 ${p.people - p.newborn} × ${G.n === 1 ? 3 : 2}${p.newborn ? ` ＋ 新生兒 ${p.newborn} × 1` : ''}），現有 <b>${p.supply.food}</b>。</p>
      ${short ? `<p class="muted">仲差 ${short}，唔補就每差 1 攞 1 個乞討標記（-3 分）。</p>` : ''}
      <div class="row">
        ${btn('crop2food', `${ic('grain', 16)} → ${ic('food', 16)}`, p.supply.grain < 1, 'data-v="grain"')}
        ${btn('crop2food', `${ic('veg', 16)} → ${ic('food', 16)}`, p.supply.veg < 1, 'data-v="veg"')}
        ${cooks.map((c) => `<button data-act="cook" data-v="${c.from}">${ic(c.from, 16)} → ${ic('food', 16)}${c.food}</button>`).join('')}
        ${btn('confirmFeed', short ? `確認（攞 ${short} 個乞討標記）` : '確認餵食', false, 'class="primary"')}
      </div></div>`;
  }

  // ------------------------------------------------------------ cards
  function cardHtml(c, ctx) {
    const kinds = playableNow(G);
    const p = G.players[G.current];
    const cost = c.type === 'occ' ? occCost(p) : (c.cost || {});
    const canPlay = ctx === 'hand' || ctx === 'maj'
      ? kinds.includes(c.type) && canPay(p, cost) && UI.view === G.current
      : false;
    const owner = c.taken != null ? G.players[c.taken] : null;
    const band = c.type === 'occ' ? '職業 OCCUPATION'
      : c.type === 'min' ? '次要發展 MINOR IMPROVEMENT' : '主要發展 MAJOR IMPROVEMENT';
    const vp = c.vp
      ? `<svg class="vpseal" viewBox="-16 -16 32 32" width="30" height="30" aria-hidden="true">${ART.seal(c.vp, 0, 0, 14)}</svg>`
      : '';
    return `<div class="card ${c.type}">
      <div class="band">${esc(band)}</div>
      ${vp}
      <div class="hd"><span class="nm">${esc(c.zh)}</span><span class="ennm">${esc(c.en)}</span></div>
      <div class="tx">${esc(c.txz)}</div>
      <div class="ft"><span class="costs">${costHtml(cost)}${c.alt ? `<span class="muted"> / ${esc(c.alt)}</span>` : ''}${c.trav ? '<span class="muted"> · 旅行卡</span>' : ''}</span>
        ${owner ? `<span class="muted">已被 ${esc(owner.name)} 取得</span>`
          : ctx === 'played' ? '' : `<button data-act="play" data-v="${c.uid}" ${canPlay ? '' : 'disabled'}>打出</button>`}
      </div></div>`;
  }

  function renderCards() {
    const p = G.players[UI.view];
    const tabs = [['occ', `職業 ${p.hand.occ.length}`], ['min', `次要 ${p.hand.min.length}`],
      ['maj', '主要發展'], ['played', `已打出 ${p.played.length}`]];
    $('cardTabs').innerHTML = tabs.map(([k, l]) =>
      `<button data-tab="${k}" class="${UI.tab === k ? 'sel' : ''}">${esc(l)}</button>`).join('');

    let list;
    if (UI.tab === 'occ') list = p.hand.occ.map((c) => cardHtml(c, 'hand'));
    else if (UI.tab === 'min') list = p.hand.min.map((c) => cardHtml(c, 'hand'));
    else if (UI.tab === 'maj') list = G.majors.map((c) => cardHtml(c, 'maj'));
    else list = p.played.map((c) => cardHtml(c, 'played'));
    $('cards').innerHTML = list.join('') || '<p class="muted">冇卡。</p>';
  }

  // ------------------------------------------------------------ score + log
  function renderScore() {
    const show = G.over ? G.players.map((_, i) => i) : [UI.view];
    $('score').innerHTML = show.map((i) => {
      const p = G.players[i], s = score(G, p);
      return `<h3 style="font-size:14px;margin:6px 0">${esc(p.name)}</h3>
        <table class="score">${s.rows.map((r) =>
          `<tr><td>${esc(r.zh)}</td><td class="muted">${r.val}</td><td>${r.pts > 0 ? '+' : ''}${r.pts}</td></tr>`).join('')}
        <tr class="tot"><td>總分</td><td></td><td>${s.total}</td></tr></table>
        <p class="muted" style="font-size:11.5px">${esc(s.note)}</p>`;
    }).join('');
  }

  function renderAdjust() {
    const p = G.players[UI.view];
    const rows = RES.map((k) =>
      `<span class="unit">${ic(k, 18)}${esc(LABEL[k])}
        <button data-act="adj" data-v="${k}" data-d="-1">−</button><b>${p.supply[k]}</b>
        <button data-act="adj" data-v="${k}" data-d="1">＋</button></span>`);
    if (UI.view === G.current && !G.over) {
      rows.push(...ANIM.map((k) =>
        `<span class="unit">${ic(k, 18)}${esc(LABEL[k])}
          <button data-act="adjAnimal" data-v="${k}" data-d="-1">−</button><b>${animalTotal(p, k)}</b>
          <button data-act="adjAnimal" data-v="${k}" data-d="1">＋</button></span>`));
    }
    rows.push(`<span class="unit">${ic('begging', 18)}乞討
      <button data-act="adjBeg" data-d="-1">−</button><b>${p.begging}</b>
      <button data-act="adjBeg" data-d="1">＋</button></span>`);
    $('adjust').innerHTML = rows.join('');
  }

  function render() {
    if (!G) return;
    // The board follows whoever is acting; you can still peek at the other farm within a turn.
    if (UI.lastCurrent !== G.current) { UI.view = G.current; UI.lastCurrent = G.current; }
    if (G.phase === 'work' && (G.pending || G.staging)) UI.view = G.current;
    if (G.feeding) UI.view = G.feeding.i;
    renderStatus(); renderSpaces(); renderFarm(); renderPanel();
    renderCards(); renderScore(); renderAdjust();
    $('log').innerHTML = G.log.map(esc).join('<br>');
    if (UI.mode3d && View3D.isReady()) View3D.sync(G, UI);
    save();
  }

  // ------------------------------------------------------------ shared input
  function clickTile(i) {
    if (G.staging) { placeAnimal(G, i); return; }
    const st = currentStep(G);
    if (st === 'plow') plow(G, i);
    else if (st === 'build') (UI.buildKind === 'room' ? buildRoom : buildStable)(G, i);
    else if (st === 'sow') sow(G, i, UI.sowKind);
  }

  function pick3d(d) {
    if (!G || G.over) return;
    if (d.type === 'space') placeWorker(G, d.id);
    else if (d.type === 'tile') clickTile(d.i);
    else if (d.type === 'edge') toggleFence(G, d.e);
    render();
  }

  function set3d(on) {
    UI.mode3d = !!on;
    if (UI.mode3d && !View3D.isReady()) {
      const okay = View3D.init($('stage'), { onPick: pick3d });
      if (!okay) {
        UI.mode3d = false;
        $('stage').insertAdjacentHTML('beforeend',
          '<div class="stagewarn">呢部機開唔到 WebGL，用返 2D 版面。</div>');
      }
    }
    document.body.classList.toggle('mode3d', UI.mode3d);
    $('mode3d').textContent = UI.mode3d ? '🗺 2D 版面' : '🎲 3D 檯面';
    $('mode3d').classList.toggle('sel', UI.mode3d);
    render();
    if (UI.mode3d) View3D.resize();
  }

  // ------------------------------------------------------------ events
  document.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-space],[data-tile],[data-edge],[data-act],[data-view],[data-tab]');
    if (!t || !G) return;

    if (t.dataset.view != null) { UI.view = +t.dataset.view; return render(); }
    if (t.dataset.tab) { UI.tab = t.dataset.tab; return render(); }
    if (t.dataset.space) { placeWorker(G, t.dataset.space); return render(); }
    if (t.dataset.tile != null) { clickTile(+t.dataset.tile); return render(); }
    if (t.dataset.edge) { toggleFence(G, t.dataset.edge); return render(); }

    const v = t.dataset.v, d = +t.dataset.d;
    switch (t.dataset.act) {
      case 'buildKind': UI.buildKind = v; break;
      case 'sowKind': UI.sowKind = v; break;
      case 'skip': nextStep(G); break;
      case 'confirmFences': confirmFences(G); break;
      case 'undoFences': undoFences(G); break;
      case 'bake': bake(G, v); break;
      case 'grow': grow(G); break;
      case 'renovate': renovate(G); break;
      case 'play': playCard(G, v); break;
      case 'discardStaged': discardStaged(G); break;
      case 'crop2food': convertCropToFood(G, G.feeding.i, v); break;
      case 'cook': cook(G, G.feeding.i, v); break;
      case 'confirmFeed': confirmFeed(G); break;
      case 'adj': {
        const p = G.players[UI.view];
        p.supply[v] = Math.max(0, p.supply[v] + d);
        break;
      }
      case 'adjAnimal': {
        const p = G.players[G.current];
        if (d > 0) stageAnimals(G, v, 1); else removeAnimal(p, v);
        break;
      }
      case 'adjBeg': {
        const p = G.players[UI.view];
        p.begging = Math.max(0, p.begging + d);
        break;
      }
      default: return;
    }
    render();
  });

  const restart = (n) => { if (confirm(`開新遊戲（${n} 人局）？現時進度會消失。`)) start(n); };
  $('new1').addEventListener('click', () => restart(1));
  $('new2').addEventListener('click', () => restart(2));
  $('mode3d').addEventListener('click', () => set3d(!UI.mode3d));
  $('camreset').addEventListener('click', (e) => { e.stopPropagation(); View3D.resetCamera(); });
  $('theme').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', cur === 'dark' ? 'light' : 'dark');
    render();
  });

  window.AG = { start, render, state: () => G };   // handy from the console

  if (load()) render();
  else start(2);
  set3d(UI.mode3d !== false);   // the table view is the default
})();
