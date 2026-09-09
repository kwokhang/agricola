// Agricola 1–2 player — DOM layer. Renders engine state and routes clicks back into it.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
  const SAVE_KEY = 'agricola.game.v1';

  const TW = 88, TH = 78, E = 10, OFF = E / 2;

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
    if (HARVEST_ROUNDS.includes(G.round) && !G.over) bits.push('<span class="pill">本回合有收成 🌾</span>');
    G.players.forEach((p, i) => {
      const active = (G.feeding ? G.feeding.i === i : G.current === i) && !G.over;
      bits.push(`<span class="pill ${active ? 'now' : ''}">${esc(p.name)}${i === G.startPlayer ? ' ⭐' : ''} · 人手 ${p.workersLeft}/${p.people} · 🍲${p.supply.food}</span>`);
    });
    $('status').innerHTML = bits.join('');
  }

  // ------------------------------------------------------------ action spaces
  function renderSpaces() {
    const out = [];
    const draw = (def, isBase) => {
      const sp = G.spaces[def.id];
      if (!sp.revealed) return;
      const goods = Object.keys(sp.goods).filter((k) => sp.goods[k] > 0)
        .map((k) => `${ICON[k]}${sp.goods[k]}`).join(' ');
      const acc = (G.n === 1 && def.accumSolo) ? def.accumSolo : def.accum;
      const sub = def.gain ? `取 ${costText(def.gain)}`
        : acc ? `累積 每回合 +${costText(acc)}`
        : (def.steps || []).map((s) => STEP_ZH[s]).join(def.andOr ? ' ／ ' : ' → ');
      const free = canPlace(G, def.id);
      out.push(`<button class="space ${isBase ? 'base' : ''} ${sp.occupiedBy !== null ? 'taken' : ''} ${free ? 'avail' : ''}"
        data-space="${def.id}" ${free ? '' : 'disabled'}>
        <span class="zh"><b>${esc(def.zh)}</b> <span class="muted" style="font-weight:400">${esc(def.en)}</span></span>
        <span class="sub">${esc(sub)}</span>
        ${goods ? `<span class="goods">${goods}</span>` : ''}
        ${sp.occupiedBy !== null ? `<span class="worker">👤 ${esc(G.players[sp.occupiedBy].name)}</span>` : ''}
      </button>`);
    };
    BASE_SPACES.forEach((d) => draw(d, true));
    G.roundOrder.slice(0, G.round).forEach((id) => {
      const d = ROUND_SPACES.find((x) => x.id === id);
      if (d) draw(d, false);
    });
    $('spaces').innerHTML = out.join('');

    // Remaining cards, grouped by stage and sorted by name — the shuffled order stays hidden.
    const RANGE = { 1: '1–4', 2: '5–7', 3: '8–9', 4: '10–11', 5: '12–13', 6: '14' };
    const rest = {};
    G.roundOrder.slice(G.round).forEach((id) => {
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
  function tileGlyph(p, i, regs) {
    const t = p.farm[i];
    if (t.kind === 'room') {
      const pet = p.pet ? ` ${ICON[p.pet.kind]}` : '';
      return { cls: 'room', glyph: '🏠' + pet, cap: HOUSE_ZH[p.house] };
    }
    if (t.kind === 'field') {
      if (!t.crop) return { cls: 'field', glyph: '🟫', cap: '空田' };
      return { cls: 'field', glyph: ICON[t.crop.kind], cap: `×${t.crop.n}` };
    }
    const g = regionOf(p, i, regs);
    const inPasture = g && g.enclosed;
    let glyph = t.stable ? '🐴' : '';
    let cap = '';
    if (t.animals) { glyph = ICON[t.animals.kind].repeat(Math.min(t.animals.n, 3)); cap = `×${t.animals.n}`; }
    else if (t.stable) cap = '馬廄';
    if (inPasture && !cap) cap = `牧場 ${g.count}/${g.capacity}`;
    return { cls: inPasture ? 'pasture' : '', glyph: glyph || (inPasture ? '🌱' : ''), cap };
  }

  function tilePickable(p, i) {
    if (G.staging) return true;
    const st = currentStep(G);
    if (p !== G.players[G.current]) return false;
    if (st === 'plow') return canPlow(p, i);
    if (st === 'build') return UI.buildKind === 'room' ? canBuildRoom(p, i) : canBuildStable(p, i);
    if (st === 'sow') return canSow(p, i);
    return false;
  }

  function renderFarm() {
    const p = G.players[UI.view];
    const regs = regions(p);
    const el = $('farm');
    el.style.width = (COLS * TW + E) + 'px';
    el.style.height = (ROWS * TH + E) + 'px';

    const out = [];
    for (let i = 0; i < TILES; i++) {
      const [r, c] = rc(i);
      const g = tileGlyph(p, i, regs);
      const pick = tilePickable(p, i);
      out.push(`<div class="tile ${g.cls} ${pick ? 'pick' : ''}" data-tile="${i}"
        style="left:${OFF + c * TW}px;top:${OFF + r * TH}px;width:${TW}px;height:${TH}px">
        <span class="glyph">${g.glyph}</span>${g.cap ? `<span class="cap">${esc(g.cap)}</span>` : ''}
      </div>`);
    }

    const fencing = currentStep(G) === 'fences' && p === G.players[G.current];
    const fresh = (G.pending && G.pending.data.placed) || [];
    for (const e of allEdges()) {
      const [k, a, b] = e.split(':');
      const on = !!p.fences[e];
      const cls = ['edge', on ? 'on' : '', on && fresh.includes(e) ? 'new' : '', fencing && (!on || fresh.includes(e)) ? 'pick' : ''].join(' ');
      const style = k === 'h'
        ? `left:${OFF + (+b) * TW + 3}px;top:${OFF + (+a) * TH - E / 2}px;width:${TW - 6}px;height:${E}px`
        : `left:${OFF + (+b) * TW - E / 2}px;top:${OFF + (+a) * TH + 3}px;width:${E}px;height:${TH - 6}px`;
      out.push(`<div class="${cls}" data-edge="${e}" style="${style}"></div>`);
    }
    el.innerHTML = out.join('');

    $('farmTitle').textContent = `農場 Farmyard — ${p.name}`;
    $('farmTabs').innerHTML = G.players.map((q, i) =>
      `<button data-view="${i}" class="${i === UI.view ? 'sel' : ''}">${esc(q.name)}</button>`).join('')
      + `<span class="muted" style="font-size:12px">柵欄 ${fenceCount(p)}/15 · 馬廄 ${stableCount(p)}/4 · ${HOUSE_ZH[p.house]} ${roomCount(p)} 間</span>`;

    $('supply').innerHTML = RES.map((k) => `<span class="chip">${ICON[k]} ${esc(LABEL[k])} <b>${p.supply[k]}</b></span>`).join('')
      + ANIM.map((k) => `<span class="chip">${ICON[k]} ${esc(LABEL[k])} <b>${animalTotal(p, k)}</b></span>`).join('')
      + `<span class="chip">🥺 乞討 <b>${p.begging}</b></span>`;
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
        <p>${ICON[G.staging.kind]} ${esc(LABEL[G.staging.kind])} ×${G.staging.n} — 點擊牧場、獨立馬廄或房屋（寵物）。</p>
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
            <button data-act="buildKind" data-v="stable" class="${UI.buildKind === 'stable' ? 'sel' : ''}">建馬廄 🪵2</button>
            ${btn('skip', '完成')}
          </div><p class="muted">點擊農場格建造，可以連建多間。房間要同現有房間相鄰。</p>`;
      } else if (st === 'fences') {
        const ok = fencesValid(p);
        const fresh2 = (G.pending.data.placed || []).length;
        body = `<p>點擊格與格之間嘅位置起柵欄，每條 🪵1。今次新起嘅可以再撳一次取消。</p>`
          + (ok ? '' : '<p class="muted">⚠️ 有柵欄未圍成牧場，唔可以完成。移走佢哋先。</p>')
          + `<div class="row">${btn('confirmFences', '完成', !ok)}${btn('undoFences', `取消今次全部（${fresh2}）`, !fresh2)}</div>`;
      } else if (st === 'sow') {
        body = `<div class="row">
            <button data-act="sowKind" data-v="grain" class="${UI.sowKind === 'grain' ? 'sel' : ''}">播 🌽 穀物（${p.supply.grain}）</button>
            <button data-act="sowKind" data-v="veg" class="${UI.sowKind === 'veg' ? 'sel' : ''}">播 🥕 蔬菜（${p.supply.veg}）</button>
            ${btn('skip', '完成')}
          </div><p class="muted">點擊空田播種。穀物變 3、蔬菜變 2。</p>`;
      } else if (st === 'bake') {
        const ov = ovensOf(p);
        body = ov.length
          ? `<div class="row">${ov.map((o) => `<button data-act="bake" data-v="${esc(o)}">${esc(o)} → 🍲${OVENS[o].food}</button>`).join('')}${btn('skip', '完成')}</div>`
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
        ${btn('crop2food', '🌽 穀物 → 🍲', p.supply.grain < 1, 'data-v="grain"')}
        ${btn('crop2food', '🥕 蔬菜 → 🍲', p.supply.veg < 1, 'data-v="veg"')}
        ${cooks.map((c) => `<button data-act="cook" data-v="${c.from}">${ICON[c.from]} → 🍲${c.food}</button>`).join('')}
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
    return `<div class="card ${c.type}">
      <div class="hd"><span class="nm">${esc(c.zh)} <span class="muted">${esc(c.en)}</span></span>
        ${c.vp ? `<span class="vp">${c.vp} 分</span>` : ''}</div>
      <div class="tx">${esc(c.txz)}</div>
      <div class="ft"><span class="muted">${c.type === 'occ' ? '職業' : c.type === 'min' ? '次要發展' : '主要發展'} · ${costText(cost)}${c.alt ? ' / ' + esc(c.alt) : ''}${c.trav ? ' · 👢旅行卡' : ''}</span>
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
      `<span class="unit">${ICON[k]}${esc(LABEL[k])}
        <button data-act="adj" data-v="${k}" data-d="-1">−</button><b>${p.supply[k]}</b>
        <button data-act="adj" data-v="${k}" data-d="1">＋</button></span>`);
    if (UI.view === G.current && !G.over) {
      rows.push(...ANIM.map((k) =>
        `<span class="unit">${ICON[k]}${esc(LABEL[k])}
          <button data-act="adjAnimal" data-v="${k}" data-d="-1">−</button><b>${animalTotal(p, k)}</b>
          <button data-act="adjAnimal" data-v="${k}" data-d="1">＋</button></span>`));
    }
    rows.push(`<span class="unit">🥺乞討
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
    save();
  }

  // ------------------------------------------------------------ events
  document.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-space],[data-tile],[data-edge],[data-act],[data-view],[data-tab]');
    if (!t || !G) return;

    if (t.dataset.view != null) { UI.view = +t.dataset.view; return render(); }
    if (t.dataset.tab) { UI.tab = t.dataset.tab; return render(); }
    if (t.dataset.space) { placeWorker(G, t.dataset.space); return render(); }
    if (t.dataset.tile != null) {
      const i = +t.dataset.tile, p = G.players[G.current];
      if (G.staging) placeAnimal(G, i);
      else {
        const st = currentStep(G);
        if (st === 'plow') plow(G, i);
        else if (st === 'build') (UI.buildKind === 'room' ? buildRoom : buildStable)(G, i);
        else if (st === 'sow') sow(G, i, UI.sowKind);
      }
      return render();
    }
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
  $('theme').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', cur === 'dark' ? 'light' : 'dark');
  });

  window.AG = { start, render, state: () => G };   // handy from the console

  if (load()) render();
  else start(2);
})();
