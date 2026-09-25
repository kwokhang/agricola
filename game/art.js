// Agricola — drawn SVG art. Every shape uses CSS custom properties so it follows the theme.
const ART = (function () {
  const ink = 'var(--art-ink)';

  // ---------------------------------------------------------------- 24×24 icons
  const ICONS = {
    food: `<path d="M3.6 14.4c0-3.4 3.7-6.2 8.4-6.2s8.4 2.8 8.4 6.2c0 2.2-1.5 3.6-3.3 3.6H6.9c-1.8 0-3.3-1.4-3.3-3.6z" fill="var(--art-food)" stroke="${ink}" stroke-width="1.2"/>
      <path d="M7.4 11.9c.9-1 2.4-1.2 3.4-.3M12.8 11.6c.9-1 2.4-1.2 3.4-.3" fill="none" stroke="${ink}" stroke-width="1" opacity=".5"/>`,

    wood: `<g stroke="${ink}" stroke-width="1.1" stroke-linejoin="round">
      <rect x="2.5" y="12.4" width="14.5" height="6.6" rx="3.3" fill="var(--art-wood)"/>
      <ellipse cx="17" cy="15.7" rx="2.6" ry="3.3" fill="var(--art-wood-lt)"/>
      <ellipse cx="17" cy="15.7" rx="1" ry="1.3" fill="none" opacity=".6"/>
      <rect x="5.5" y="5" width="12.5" height="6.2" rx="3.1" fill="var(--art-wood)"/>
      <ellipse cx="18" cy="8.1" rx="2.4" ry="3.1" fill="var(--art-wood-lt)"/>
      <ellipse cx="18" cy="8.1" rx=".9" ry="1.2" fill="none" opacity=".6"/></g>`,

    // Clay as a stack of fired bricks, so it never reads as a pile of stones.
    clay: `<g stroke="${ink}" stroke-width="1.1" stroke-linejoin="round">
      <rect x="2.4" y="15" width="9.4" height="5.4" rx="1" fill="var(--art-clay)"/>
      <rect x="12.2" y="15" width="9.4" height="5.4" rx="1" fill="var(--art-clay)"/>
      <rect x="7.3" y="9.2" width="9.4" height="5.4" rx="1" fill="var(--art-clay-lt)"/>
      <path d="M4.6 17.7h5M14.4 17.7h5M9.5 11.9h5" stroke-width=".8" opacity=".45"/></g>`,

    reed: `<g fill="none" stroke="var(--art-reed-dk)" stroke-width="1.5" stroke-linecap="round">
        <path d="M7.5 21c-.4-6 .3-9.6 1.6-12.6"/><path d="M12.4 21c0-6.6.3-10.4 1-13.6"/><path d="M17 21c.3-5.4-.2-8.6-1.2-11.2"/></g>
      <g stroke="${ink}" stroke-width="1">
        <ellipse cx="9.4" cy="6.6" rx="1.7" ry="3.2" fill="var(--art-reed)"/>
        <ellipse cx="13.6" cy="5.2" rx="1.7" ry="3.4" fill="var(--art-reed)"/>
        <ellipse cx="15.6" cy="8" rx="1.6" ry="3" fill="var(--art-reed)"/></g>`,

    stone: `<g stroke="${ink}" stroke-width="1.1" stroke-linejoin="round">
      <path d="M2.6 18.6l2.8-6.4 6-1.8 4.2 2.6 5.8 1.2-1.2 4.4z" fill="var(--art-stone)"/>
      <path d="M5.4 12.2l6-1.8 1 4.6-6.6 3.4z" fill="var(--art-stone-lt)"/>
      <path d="M10 6.4l4.6-1.6 2.4 3.6-3.6 2.4z" fill="var(--art-stone)"/></g>`,

    grain: `<path d="M12 21.5V9.5" stroke="var(--art-reed-dk)" stroke-width="1.5" stroke-linecap="round"/>
      <g fill="var(--art-grain)" stroke="${ink}" stroke-width=".9">
        <ellipse cx="12" cy="4.4" rx="1.7" ry="2.7"/>
        <ellipse cx="9.2" cy="7.4" rx="1.6" ry="2.6" transform="rotate(-28 9.2 7.4)"/>
        <ellipse cx="14.8" cy="7.4" rx="1.6" ry="2.6" transform="rotate(28 14.8 7.4)"/>
        <ellipse cx="9" cy="11.4" rx="1.6" ry="2.6" transform="rotate(-32 9 11.4)"/>
        <ellipse cx="15" cy="11.4" rx="1.6" ry="2.6" transform="rotate(32 15 11.4)"/></g>`,

    veg: `<path d="M12 21.4c-2.6-2.6-4.4-6-4.4-8.6 0-2.4 2-4 4.4-4s4.4 1.6 4.4 4c0 2.6-1.8 6-4.4 8.6z" fill="var(--art-veg)" stroke="${ink}" stroke-width="1.2" stroke-linejoin="round"/>
      <g fill="none" stroke="${ink}" stroke-width=".9" opacity=".45"><path d="M9.6 13.4h4.8M10.2 16.4h3.6"/></g>
      <g fill="var(--art-reed)" stroke="${ink}" stroke-width="1"><path d="M12 8.8c-.6-2.4-2.4-3.6-4.2-3.8 0 2.2 1.4 3.8 3 4.4z"/><path d="M12.4 8.8c.6-2.6 2.2-4 4.2-4.2-.2 2.4-1.6 3.8-3.2 4.4z"/></g>`,

    sheep: `<g stroke="${ink}" stroke-width="1.1" stroke-linejoin="round">
      <path d="M8 18.4v2.2M12.6 18.8v2M16 18v2.2" stroke-linecap="round"/>
      <path d="M6.4 12.6a2.6 2.6 0 0 1 2-3.4 3 3 0 0 1 4.4-1.6 2.8 2.8 0 0 1 4.2 1.6 2.6 2.6 0 0 1 1.6 3.8 2.9 2.9 0 0 1-2.6 4H9.2a2.9 2.9 0 0 1-2.8-4.4z" fill="var(--art-sheep)"/>
      <ellipse cx="17.6" cy="10.4" rx="2.6" ry="2.2" fill="var(--art-sheep-face)"/>
      <path d="M19.6 8.8c1-.4 1.8 0 1.8 1s-.9 1.4-1.7 1.2" fill="var(--art-sheep-face)"/></g>`,

    boar: `<g stroke="${ink}" stroke-width="1.1" stroke-linejoin="round">
      <path d="M7.4 18.6v2.2M11.6 19v2M15.4 18.4v2.2" stroke-linecap="round"/>
      <path d="M4.6 13.6c0-3 3-5 7-5 3 0 4.6 1 5.6 2.2l3.4 1.2-1.4 1.8c.2 3-2.4 5.4-6.6 5.4-4.4 0-8-2-8-5.6z" fill="var(--art-boar)"/>
      <path d="M19 12.6l1.8-.6-.6 2z" fill="var(--art-sheep)"/>
      <path d="M9.6 9.2l1.6-3 2.2 2.6" fill="var(--art-boar)"/>
      <circle cx="15.6" cy="12.6" r=".9" fill="${ink}" stroke="none"/></g>`,

    cattle: `<g stroke="${ink}" stroke-width="1.1" stroke-linejoin="round">
      <path d="M7 18.6v2.4M11.4 19v2M15.4 18.4v2.4" stroke-linecap="round"/>
      <rect x="4.4" y="8.6" width="12.6" height="10" rx="4.2" fill="var(--art-cattle)"/>
      <path d="M8 10.4c1.8-.6 3 .6 2.6 2-.4 1.6-3 1.8-3.6.4-.4-1 0-2 1-2.4z" fill="var(--art-cattle-spot)" stroke="none"/>
      <ellipse cx="18.4" cy="12.6" rx="3" ry="3.4" fill="var(--art-cattle)"/>
      <path d="M16.6 9.6c-.8-1.4-.4-2.6.8-2.8M20.4 9.6c.8-1.4.6-2.6-.6-2.9" fill="none"/>
      <circle cx="19.4" cy="12" r=".8" fill="${ink}" stroke="none"/></g>`,

    // The begging card: a card marked −3, which is what it costs at the end.
    begging: `<rect x="5" y="2.6" width="14" height="18.8" rx="2" fill="var(--art-plate)" stroke="${ink}" stroke-width="1.2" transform="rotate(-8 12 12)"/>
      <text x="12" y="16" text-anchor="middle" font-size="9.5" font-weight="800" fill="var(--maj-frame)"
        font-family="-apple-system,sans-serif" transform="rotate(-8 12 12)">−3</text>`,

    person: `<path d="M12 2.6c1.8 0 3 1.4 3 3 0 1-.4 1.9-1.1 2.5l4.9 3.2c1 .7 1.3 2 .7 3-.6 1-1.9 1.3-2.9.7l-2.2-1.4v3.8l2.5 3.2c.7.9.5 2.1-.4 2.8-.9.6-2.1.4-2.7-.4L12 20.6l-1.8 2.4c-.6.8-1.8 1-2.7.4-.9-.7-1.1-1.9-.4-2.8l2.5-3.2v-3.8l-2.2 1.4c-1 .6-2.3.3-2.9-.7-.6-1-.3-2.3.7-3l4.9-3.2A3.2 3.2 0 0 1 9 5.6c0-1.6 1.3-3 3-3z" fill="currentColor" stroke="${ink}" stroke-width="1"/>`,

    tree: `<path d="M11 21v-4.4h2V21z" fill="var(--art-wood-dk)" stroke="${ink}" stroke-width="1"/>
      <path d="M12 2.4l5.6 6.2h-2.8l4.4 5.2h-3l3.2 3.8H4.6l3.2-3.8h-3l4.4-5.2H6.4z" fill="var(--art-tree)" stroke="${ink}" stroke-width="1.1" stroke-linejoin="round"/>`,

    fish: `<path d="M3.6 12c3-3.6 6.4-5.4 10-5.4 2.6 0 4.6 1 6 2.2l3.4-2.2-1 5.4 1 5.4-3.4-2.2c-1.4 1.2-3.4 2.2-6 2.2-3.6 0-7-1.8-10-5.4z" fill="var(--art-water)" stroke="${ink}" stroke-width="1.2" stroke-linejoin="round"/>
      <circle cx="16.4" cy="10.6" r="1" fill="${ink}"/>`,

    book: `<path d="M3.4 5.4c2.6-1.4 5.4-1.4 8.6.4v14c-3.2-1.8-6-1.8-8.6-.4z" fill="var(--art-clay)" stroke="${ink}" stroke-width="1.2" stroke-linejoin="round"/>
      <path d="M20.6 5.4c-2.6-1.4-5.4-1.4-8.6.4v14c2.6-1.4 5.4-1.4 8.6-.4z" fill="var(--art-clay-lt)" stroke="${ink}" stroke-width="1.2" stroke-linejoin="round"/>`,

    plow: `<path d="M3 18h7l6-11h4" fill="none" stroke="var(--art-wood-dk)" stroke-width="2" stroke-linecap="round"/>
      <path d="M3.4 15.4l5 1.2-1.6 4.2-4.4-1.6z" fill="var(--art-stone)" stroke="${ink}" stroke-width="1.1" stroke-linejoin="round"/>`,

    hammer: `<path d="M9 12.6l-5.4 5.4a1.8 1.8 0 0 0 2.6 2.6L11.6 15" fill="none" stroke="var(--art-wood-dk)" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M11 6l7 7-2.4 2.4-7-7z" fill="var(--art-stone)" stroke="${ink}" stroke-width="1.1"/>
      <path d="M15.4 3.6l5 5-2.4 2.4-5-5z" fill="var(--art-stone-lt)" stroke="${ink}" stroke-width="1.1"/>`,

    start: `<circle cx="12" cy="12" r="9" fill="var(--art-grain)" stroke="${ink}" stroke-width="1.3"/>
      <path d="M12 6.4l1.7 3.6 3.9.5-2.9 2.7.8 3.9-3.5-2-3.5 2 .8-3.9-2.9-2.7 3.9-.5z" fill="${ink}" opacity=".75"/>`,
  };

  // ---------------------------------------------------------------- resource tokens
  // Small icons live or die by colour and silhouette, so each good gets its own coin colour,
  // spread round the colour wheel, with a bold light silhouette on it. Used everywhere a
  // good is named at small size: the HUD, costs, tokens on the board, the supply tray.
  const TOKEN = {
    wood:   { bg: '#8c5a33', fg: '#f4e4c6', g: `<rect x="5" y="7.6" width="12" height="4.2" rx="2.1"/><rect x="7" y="12.8" width="12" height="4.2" rx="2.1"/>
              <circle cx="17" cy="9.7" r="1.2" fill="#8c5a33"/><circle cx="19" cy="14.9" r="1.2" fill="#8c5a33"/>` },
    clay:   { bg: '#a23f2a', fg: '#fbe0d2', g: `<rect x="4.6" y="13" width="6.8" height="4.2" rx=".6"/><rect x="12.6" y="13" width="6.8" height="4.2" rx=".6"/>
              <rect x="8.6" y="7.8" width="6.8" height="4.2" rx=".6"/>` },
    reed:   { bg: '#6a8a36', fg: '#f1efd4', g: `<path d="M8.6 19.5L8 9M12 19.5V6.5M15.4 19.5L16 9" stroke="#f3f0d6" stroke-width="1.5" stroke-linecap="round" fill="none"/>
              <rect x="6.9" y="5.6" width="2.2" height="4.4" rx="1.1"/><rect x="10.9" y="3.6" width="2.2" height="4.4" rx="1.1"/><rect x="14.9" y="5.6" width="2.2" height="4.4" rx="1.1"/>` },
    stone:  { bg: '#5a6068', fg: '#e6e8ea', g: `<path d="M4.8 16.8L6.6 10.6L10.8 7.2L15.8 8.2L19.4 12.6L17.8 17.4z"/>
              <path d="M10.8 7.2L12 12.4L6.6 10.6M12 12.4L17.8 17.4" stroke="#5a6068" stroke-width=".9" fill="none"/>` },
    grain:  { bg: '#d3a02c', fg: '#4a2f06', g: `<path d="M12 20V7" stroke="#4a2f06" stroke-width="1.4" stroke-linecap="round"/>
              ${[[8.4, 0], [11.6, 1], [14.8, 0]].map(([y, s]) => `<ellipse cx="9.8" cy="${y}" rx="1.6" ry="2.6" transform="rotate(-35 9.8 ${y})"/>
                <ellipse cx="14.2" cy="${y}" rx="1.6" ry="2.6" transform="rotate(35 14.2 ${y})"/>`).join('')}
              <ellipse cx="12" cy="5.6" rx="1.5" ry="2.4"/>` },
    veg:    { bg: '#d4692c', fg: '#fff1e0', g: `<path d="M12 20.4L8.4 10.4Q12 8.6 15.6 10.4z"/>
              <path d="M12 10L9.6 5.2M12 10V4.6M12 10L14.4 5.2" stroke="#3f6b2a" stroke-width="1.8" stroke-linecap="round" fill="none"/>
              <path d="M10.4 13.4h2.2M11 16.2h1.8" stroke="#d4692c" stroke-width=".9"/>` },
    // a steaming bowl of stew: reads as "a meal" rather than as any one crop
    food:   { bg: '#9c3f58', fg: '#ffe7b8', g: `<path d="M4.6 12.4H19.4Q19 18.4 12 18.6T4.6 12.4z"/>
              <ellipse cx="12" cy="12.4" rx="7.4" ry="1.7" fill="#8a4a1e"/>
              <circle cx="9.6" cy="12.1" r=".9" fill="#d4692c"/><circle cx="13.6" cy="12.3" r=".8" fill="#6a8a36"/>
              <path d="M9 9.6q-1-1.4 0-2.8t0-2.6M12 9.4q-1-1.4 0-2.8t0-2.8M15 9.6q-1-1.4 0-2.8t0-2.6" stroke="#ffe7b8" stroke-width="1.1" stroke-linecap="round" fill="none" opacity=".85"/>` },
    sheep:  { bg: '#ebe4d4', fg: '#ffffff', g: `<g stroke="#3b332d" stroke-width=".8"><circle cx="10" cy="11.4" r="3.2"/><circle cx="13.6" cy="10.6" r="3.4"/>
              <circle cx="15.4" cy="13.4" r="2.8"/><circle cx="11.4" cy="14.2" r="3"/></g>
              <ellipse cx="6.8" cy="11.8" rx="2.2" ry="2.6" fill="#2b2622"/><path d="M10 17v3M14.4 17v3" stroke="#2b2622" stroke-width="1.4"/>` },
    boar:   { bg: '#36302b', fg: '#dda09a', g: `<path d="M5.2 13.4Q5.4 8.4 12 8.4T18.8 12.6L20.4 13.2L19.8 15.8L18 15.6Q16.8 17.4 12 17.4T5.2 13.4z"/>
              <path d="M8 8.8L7.4 6.2L10 8.2" /><path d="M8.6 17v2.6M14.8 17v2.6" stroke="#dda09a" stroke-width="1.5"/>
              <circle cx="16.6" cy="11.8" r=".8" fill="#36302b"/>` },
    cattle: { bg: '#2f5f86', fg: '#ffffff', g: `<path d="M7.4 9.6Q12 7.4 16.6 9.6L15.8 16.4Q12 19.6 8.2 16.4z"/>
              <path d="M7.6 9.8Q4.6 9 4.4 5.8M16.4 9.8Q19.4 9 19.6 5.8" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" fill="none"/>
              <ellipse cx="12" cy="15.8" rx="3" ry="1.9" fill="#f2b8a8"/><circle cx="10" cy="11.8" r=".9" fill="#2f5f86"/><circle cx="14" cy="11.8" r=".9" fill="#2f5f86"/>` },
  };

  const tokenColor = (k) => (TOKEN[k] ? TOKEN[k].bg : '#6a583a');

  // The coin itself, in a 24 × 24 box.
  // Painted like the artwork: a flat colour, a soft light wash from the upper left, a darker
  // pool at the lower right, and an ink rim.
  const WASH = `<defs><radialGradient id="cwash" cx=".34" cy=".3" r=".8">
      <stop offset="0" stop-color="#fff" stop-opacity=".34"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity=".22"/></radialGradient></defs>`;
  function coinBase(fill) {
    return `${WASH}<circle cx="12" cy="12" r="11.2" fill="${fill}"/>
      <circle cx="12" cy="12" r="11.2" fill="url(#cwash)"/>
      <circle cx="12" cy="12" r="11.2" fill="none" stroke="#1b130b" stroke-width="1.1"/>
      <circle cx="12" cy="12" r="9.7" fill="none" stroke="#fff" stroke-width=".6" opacity=".3" stroke-dasharray="1.4 .8"/>`;
  }
  function tokenMarkup(k) {
    const t = TOKEN[k];
    if (!t) return ICONS[k] || '';
    return `${coinBase(t.bg)}<g fill="${t.fg}">${t.g}</g>`;
  }


  function icon(key, size, extraClass) {
    const body = TOKEN[key] ? tokenMarkup(key) : ICONS[key];
    if (!body) return '';
    const s = size || 18;
    return `<svg class="ic ${extraClass || ''}" viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true">${body}</svg>`;
  }

  // ---------------------------------------------------------------- farmyard pieces
  const TW = 100, TH = 90;

  // A repeatable scatter that depends only on the tile index, so the farm never jitters between renders.
  function scatter(seed, n, w, h, pad) {
    const out = [];
    let s = (seed + 1) * 9301;
    for (let i = 0; i < n; i++) {
      s = (s * 9301 + 49297) % 233280;
      const x = pad + (s / 233280) * (w - 2 * pad);
      s = (s * 9301 + 49297) % 233280;
      const y = pad + (s / 233280) * (h - 2 * pad);
      out.push([x, y]);
    }
    return out;
  }

  const tuft = (x, y, c) =>
    `<path d="M${x} ${y}c-.5-4-2-6-3.5-7.5 2 .5 3.2 1.8 4 3.2.6-2 1.8-3.6 3.6-4.6-1.4 2-2.2 5-2.1 8.9z" fill="${c}" opacity=".55"/>`;

  function grassTile(seed, rich) {
    const c = rich ? 'var(--art-grass-dk)' : 'var(--art-grass-dk)';
    const base = rich ? 'var(--art-pasture)' : 'var(--art-grass)';
    const tufts = scatter(seed, rich ? 7 : 4, TW, TH, 16)
      .map(([x, y]) => tuft(x, y, c)).join('');
    return `<rect width="${TW}" height="${TH}" fill="${base}"/>${tufts}`;
  }

  function fieldTile(seed, crop) {
    let s = `<rect width="${TW}" height="${TH}" fill="var(--art-soil)"/>`;
    for (let i = 0; i < 4; i++) {
      const y = 18 + i * 18;
      s += `<path d="M8 ${y}q25 -5 42 0t42 0" fill="none" stroke="var(--art-soil-dk)" stroke-width="3" stroke-linecap="round" opacity=".65"/>`;
    }
    if (crop) {
      const spots = [[26, 34], [58, 30], [40, 58], [72, 56], [22, 68], [80, 30]];
      for (let i = 0; i < Math.min(crop.n, 6); i++) {
        const [x, y] = spots[i];
        s += `<g transform="translate(${x - 12} ${y - 14}) scale(1.15)">${ICONS[crop.kind === 'grain' ? 'grain' : 'veg']}</g>`;
      }
    }
    return s;
  }

  const WALLS = {
    wood: { fill: 'var(--art-wood)', line: 'var(--art-wood-dk)', rows: [26, 38, 50, 62] },
    clay: { fill: 'var(--art-clay)', line: 'var(--art-clay-lt)', rows: [28, 42, 56] },
    stone: { fill: 'var(--art-stone)', line: 'var(--art-stone-lt)', rows: [28, 44, 60] },
  };

  function houseTile(seed, houseType, pet) {
    const w = WALLS[houseType] || WALLS.wood;
    let s = grassTile(seed, false);
    s += `<path d="M14 34L50 12l36 22z" fill="var(--art-roof)" stroke="${ink}" stroke-width="2" stroke-linejoin="round"/>`;
    s += `<rect x="20" y="32" width="60" height="42" fill="${w.fill}" stroke="${ink}" stroke-width="2"/>`;
    if (houseType === 'wood') {
      s += w.rows.map((y) => `<path d="M20 ${y + 8}h60" stroke="${w.line}" stroke-width="2" opacity=".8"/>`).join('');
    } else {
      s += w.rows.map((y, i) => {
        const off = i % 2 ? 15 : 0;
        let r = `<path d="M20 ${y + 8}h60" stroke="${w.line}" stroke-width="1.8" opacity=".8"/>`;
        for (let x = 20 + off; x < 80; x += 30) r += `<path d="M${x} ${y + 8}v14" stroke="${w.line}" stroke-width="1.8" opacity=".8"/>`;
        return r;
      }).join('');
    }
    s += `<rect x="42" y="50" width="16" height="24" rx="1.5" fill="var(--art-wood-dk)" stroke="${ink}" stroke-width="1.6"/>`;
    s += `<circle cx="54.5" cy="62" r="1.6" fill="var(--art-grain)"/>`;
    s += `<rect x="25" y="42" width="12" height="11" fill="var(--art-window)" stroke="${ink}" stroke-width="1.5"/>`;
    s += `<rect x="63" y="42" width="12" height="11" fill="var(--art-window)" stroke="${ink}" stroke-width="1.5"/>`;
    if (pet) s += `<g transform="translate(74 60) scale(1.05)">${ICONS[pet.kind]}</g>`;
    return s;
  }

  function stableArt(x, y, scale) {
    return `<g transform="translate(${x} ${y}) scale(${scale || 1})">
      <path d="M0 14L15 2l15 12z" fill="var(--art-roof)" stroke="${ink}" stroke-width="1.8" stroke-linejoin="round"/>
      <rect x="3" y="13" width="24" height="16" fill="var(--art-wood-dk)" stroke="${ink}" stroke-width="1.8"/>
      <path d="M9 29V19h12v10" fill="var(--art-stable-door)" stroke="${ink}" stroke-width="1.6"/></g>`;
  }

  const ANIMAL_SPOTS = [[24, 40], [62, 38], [40, 66], [74, 66], [16, 66]];

  function animalsArt(kind, n) {
    let s = '';
    for (let i = 0; i < Math.min(n, 5); i++) {
      const [x, y] = ANIMAL_SPOTS[i];
      s += `<g transform="translate(${x - 14} ${y - 14}) scale(1.25)">${ICONS[kind]}</g>`;
    }
    if (n > 5) s += `<g transform="translate(70 6)"><rect width="26" height="18" rx="9" fill="var(--panel)" stroke="${ink}" stroke-width="1.4"/>
      <text x="13" y="13" text-anchor="middle" font-size="12" font-weight="700" fill="var(--ink)">${n}</text></g>`;
    return s;
  }

  function fenceArt(edge) {
    const [k, a, b] = edge.split(':');
    const r = +a, c = +b;
    if (k === 'h') {
      const x = c * TW, y = r * TH;
      return `<g class="fenceart"><rect x="${x + 3}" y="${y - 3.5}" width="${TW - 6}" height="7" rx="3" fill="var(--art-fence)" stroke="${ink}" stroke-width="1.4"/>
        <rect x="${x + 6}" y="${y - 9}" width="7" height="18" rx="2" fill="var(--art-fence-dk)" stroke="${ink}" stroke-width="1.4"/>
        <rect x="${x + TW - 13}" y="${y - 9}" width="7" height="18" rx="2" fill="var(--art-fence-dk)" stroke="${ink}" stroke-width="1.4"/></g>`;
    }
    const x = c * TW, y = r * TH;
    return `<g class="fenceart"><rect x="${x - 3.5}" y="${y + 3}" width="7" height="${TH - 6}" rx="3" fill="var(--art-fence)" stroke="${ink}" stroke-width="1.4"/>
      <rect x="${x - 9}" y="${y + 6}" width="18" height="7" rx="2" fill="var(--art-fence-dk)" stroke="${ink}" stroke-width="1.4"/>
      <rect x="${x - 9}" y="${y + TH - 13}" width="18" height="7" rx="2" fill="var(--art-fence-dk)" stroke="${ink}" stroke-width="1.4"/></g>`;
  }

  function edgeHit(edge) {
    const [k, a, b] = edge.split(':');
    const r = +a, c = +b;
    return k === 'h'
      ? { x: c * TW + 4, y: r * TH - 9, w: TW - 8, h: 18 }
      : { x: c * TW - 9, y: r * TH + 4, w: 18, h: TH - 8 };
  }

  // ---------------------------------------------------------------- action-space vignettes
  // Little storybook landscapes, one light source (the sun, upper right), every prop with a
  // highlight, a shade side and a contact shadow. Coordinates are in a 100 × 56 box, but the
  // name plate covers the lower half of each space, so the subject lives in y 0–23 and
  // x −12…64 — the strip that shows on both the small and the big board.
  const H = 13;                                             // horizon
  const INK = 'stroke="var(--art-ink)" stroke-width=".7" stroke-linejoin="round"';
  const HI = (d) => `<path d="${d}" fill="#fff" opacity=".28"/>`;
  const SH = (d) => `<path d="${d}" fill="#000" opacity=".16"/>`;
  const shadow = (x, y, w) => `<ellipse cx="${x}" cy="${y}" rx="${w}" ry="${(w * 0.24).toFixed(2)}" fill="#000" opacity=".22"/>`;
  const at = (x, y, s, body) => `<g transform="translate(${x} ${y}) scale(${s || 1})">${body}</g>`;

  const cloud = (x, y, s) => at(x, y, s, `<g fill="#fff" opacity=".78">
    <ellipse cx="0" cy="0" rx="5" ry="2.2"/><ellipse cx="3.6" cy="-1.3" rx="3.4" ry="2.4"/>
    <ellipse cx="-3" cy="-.6" rx="2.6" ry="1.8"/></g>`);

  function land(id, o) {
    o = o || {};
    const ground = o.ground || 'var(--art-grass)';
    const far = o.far || 'var(--art-grass-dk)';
    let s = `<defs>
      <linearGradient id="sky-${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".6"/></linearGradient>
      <radialGradient id="sun-${id}">
        <stop offset="0" stop-color="#fffbe6" stop-opacity="1"/><stop offset=".3" stop-color="#ffefb8" stop-opacity=".6"/>
        <stop offset="1" stop-color="#ffefb8" stop-opacity="0"/></radialGradient>
      <linearGradient id="gnd-${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity=".25"/><stop offset=".3" stop-color="#000" stop-opacity="0"/>
        <stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient></defs>
      <rect x="-34" y="-14" width="124" height="${H + 18}" fill="${o.sky || 'var(--art-sky)'}"/>
      <rect x="-34" y="-14" width="124" height="${H + 18}" fill="url(#sky-${id})"/>
      <circle cx="${o.sunX == null ? 54 : o.sunX}" cy="0" r="13" fill="url(#sun-${id})"/>`;
    if (!o.noClouds) s += cloud(o.cloudX == null ? -4 : o.cloudX, 3, 0.8) + cloud(36, 5.5, 0.55);
    s += `<path d="M-34 ${H + 1}C-20 ${H - 6} -8 ${H - 5} 4 ${H - 1}S26 ${H - 8} 40 ${H - 3}S66 ${H - 7} 90 ${H}V${H + 6}H-34z" fill="${far}" opacity=".4"/>
      <path d="M-34 ${H + 3}C-18 ${H - 2} -2 ${H} 12 ${H + 2}S40 ${H - 3} 58 ${H + 1}S80 ${H} 90 ${H + 2}V${H + 8}H-34z" fill="${far}" opacity=".78"/>
      <rect x="-34" y="${H + 2}" width="124" height="${60 - H}" fill="${ground}"/>
      <rect x="-34" y="${H + 2}" width="124" height="${60 - H}" fill="url(#gnd-${id})"/>`;
    if (!o.bare) s += tufts(id.length * 7 + 3);
    return s;
  }

  function tufts(seed) {
    let s = '', r = seed;
    const next = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 9; i++) {
      const x = -10 + next() * 72, y = H + 4 + next() * 18;
      s += `<path d="M${x} ${y}l-.8-1.8M${x} ${y}l.1-2.2M${x} ${y}l.9-1.7" stroke="var(--art-grass-dk)" stroke-width=".55" stroke-linecap="round" opacity=".8"/>`;
    }
    return s;
  }

  // Water: the ground swapped for a pond with a bright near-shore and ripples.
  const water = (id) => `<rect x="-34" y="${H + 3}" width="124" height="60" fill="var(--art-water)"/>
    <rect x="-34" y="${H + 3}" width="124" height="60" fill="url(#gnd-${id})"/>
    ${[[-6, 17, 7], [20, 20, 9], [44, 16.5, 6], [8, 22.5, 6]].map(([x, y, w]) =>
      `<path d="M${x} ${y}q${w / 2} -.9 ${w} 0" fill="none" stroke="#fff" stroke-width=".6" opacity=".55"/>`).join('')}`;

  // Plough furrows running away to the horizon.
  const furrows = (col) => {
    let s = `<path d="M-34 ${H + 2}H90V60H-34z" fill="${col || 'var(--art-soil)'}"/>`;
    for (let k = -6; k <= 6; k++) {
      s += `<path d="M${26 + k * 2.4} ${H + 2}L${26 + k * 16} 40" stroke="var(--art-soil-dk)" stroke-width="${(1.1 - Math.abs(k) * 0.05).toFixed(2)}" opacity=".75"/>`;
    }
    return s;
  };

  // ---- props, all standing on their own origin
  const tree = (x, y, s) => at(x, y, s, `${shadow(0.6, 0, 5)}
    <rect x="-.9" y="-6.5" width="1.8" height="6.5" fill="var(--art-wood-dk)" ${INK}/>
    <g ${INK}><circle cx="0" cy="-11" r="5" fill="var(--art-tree)"/>
      <circle cx="-3.4" cy="-8.4" r="3.6" fill="var(--art-tree)"/><circle cx="3.4" cy="-8.2" r="3.8" fill="var(--art-tree)"/></g>
    <circle cx="2.6" cy="-8" r="3" fill="#000" opacity=".14"/>
    <circle cx="-1.6" cy="-12.6" r="2.3" fill="#fff" opacity=".25"/>`);

  const pine = (x, y, s) => at(x, y, s, `${shadow(0.5, 0, 4)}
    <rect x="-.7" y="-3" width="1.4" height="3" fill="var(--art-wood-dk)"/>
    <path d="M0 -17L6 -7H3.5L7 -2.5H-7L-3.5 -7H-6z" fill="var(--art-tree)" ${INK}/>
    ${SH('M0 -17L6 -7H3.5L7 -2.5H0z')}${HI('M0 -17L-3 -9.5H-1.5L-4.4 -5H-1z')}`);

  function house(x, y, s, wall, o) {
    o = o || {};
    const w = `var(--art-${wall || 'wood'})`;
    const courses = wall === 'wood' || !wall
      ? [-7, -4.6, -2.2].map((yy) => `<path d="M-7 ${yy}H5" stroke="var(--art-wood-dk)" stroke-width=".5" opacity=".7"/>`).join('')
      : [-7.2, -4.8, -2.4].map((yy, i) => `<path d="M-7 ${yy}H5" stroke="#000" stroke-width=".35" opacity=".3"/>` +
        [-5, -1, 3].map((xx) => `<path d="M${xx + (i % 2) * 2} ${yy}v2.4" stroke="#000" stroke-width=".3" opacity=".25"/>`).join('')).join('');
    return at(x, y, s, `${shadow(1.5, 0, 10)}
      <path d="M5 0V-9.4L9 -12V-2.6z" fill="${w}" ${INK}/>${SH('M5 0V-9.4L9 -12V-2.6z')}
      <rect x="-7" y="-9.4" width="12" height="9.4" fill="${w}" ${INK}/>${courses}
      <path d="M-8.4 -9L-1 -16.4L5.8 -9.6z" fill="var(--art-roof)" ${INK}/>
      <path d="M-1 -16.4L3 -19L10 -12.2L5.8 -9.6z" fill="var(--art-roof)" ${INK}/>${SH('M-1 -16.4L3 -19L10 -12.2L5.8 -9.6z')}
      ${HI('M-8.4 -9L-1 -16.4L-.2 -15.2L-6.6 -9z')}
      <rect x="-2.6" y="-5" width="3" height="5" fill="var(--art-stable-door)" ${INK}/>
      <rect x="1.4" y="-7.4" width="2.6" height="2.4" fill="var(--art-grain)" ${INK}/>
      <rect x="-6" y="-7.4" width="2.6" height="2.4" fill="var(--art-grain)" ${INK}/>
      ${o.scaffold ? `<g stroke="var(--art-wood-dk)" stroke-width=".7"><path d="M-9.4 0V-12M7 1V-14M-9.4 -6H10.6M-9.4 -11H9"/></g>` : ''}`);
  }

  const person = (x, y, s, col) => at(x, y, s, `${shadow(0, 0, 3)}
    <path d="M-2.6 0V-5.4Q-2.6 -8.4 0 -8.4T2.6 -5.4V0z" fill="${col || 'var(--p1)'}" ${INK}/>
    ${SH('M.6 0V-8.3Q2.6 -8 2.6 -5.4V0z')}
    <circle cx="0" cy="-10.4" r="2.2" fill="var(--art-sheep-face)" ${INK}/>
    <circle cx="-.7" cy="-11.1" r=".8" fill="#fff" opacity=".5"/>`);

  const sheep = (x, y, s) => at(x, y, s, `${shadow(0, 0, 4.4)}
    <path d="M-2.4 -.2V-3M2 -.2V-3" stroke="var(--art-ink)" stroke-width=".9"/>
    <g fill="var(--art-sheep)" ${INK}><circle cx="-2.2" cy="-4.6" r="2.4"/><circle cx="1" cy="-5.4" r="2.6"/>
      <circle cx="2.6" cy="-3.8" r="2.1"/><circle cx="-1" cy="-3.2" r="2.2"/></g>
    <circle cx="1.4" cy="-3" r="2.2" fill="#000" opacity=".1"/><circle cx="-.4" cy="-6.4" r="1.4" fill="#fff" opacity=".6"/>
    <ellipse cx="-4.6" cy="-5" rx="1.5" ry="1.9" fill="var(--art-ink)"/>`);

  const boar = (x, y, s) => at(x, y, s, `${shadow(0, 0, 4.6)}
    <path d="M-2.6 -.2V-2.6M2.4 -.2V-2.6" stroke="var(--art-ink)" stroke-width=".9"/>
    <ellipse cx="0" cy="-3.8" rx="4.6" ry="2.9" fill="var(--art-boar)" ${INK}/>
    ${SH('M-4 -2.2Q0 -.6 4.4 -2.8Q3 -1 0 -.9T-4 -2.2z')}<ellipse cx="-.8" cy="-5.4" rx="2.4" ry=".9" fill="#fff" opacity=".22"/>
    <path d="M-4.4 -5.4L-7 -4.6L-6.8 -2.6L-4.4 -2.8z" fill="var(--art-boar)" ${INK}/>
    <path d="M-3.8 -6.2l-.6 -1.8 1.6 1z" fill="var(--art-boar)" ${INK}/>
    <path d="M-6.4 -2.8l-.4 1.1" stroke="#fff" stroke-width=".5"/>`);

  const cow = (x, y, s) => at(x, y, s, `${shadow(0, 0, 5.4)}
    <path d="M-3.4 -.2V-3.4M3 -.2V-3.4" stroke="var(--art-ink)" stroke-width="1"/>
    <rect x="-5" y="-7.4" width="10" height="5" rx="2.3" fill="var(--art-cattle)" ${INK}/>
    <circle cx="-1.2" cy="-5.8" r="1.5" fill="var(--art-cattle-spot)"/><circle cx="2.6" cy="-4.2" r="1.1" fill="var(--art-cattle-spot)"/>
    ${SH('M-5 -3.8Q0 -2 5 -3.8V-3Q5 -2.4 3 -2.4H-3Q-5 -2.4 -5 -3z')}<rect x="-3.8" y="-7.1" width="6" height="1" rx=".5" fill="#fff" opacity=".35"/>
    <rect x="-7.6" y="-8" width="3.4" height="3.6" rx="1.4" fill="var(--art-cattle)" ${INK}/>
    <path d="M-7.4 -8.2l-.8 -1.3M-4.6 -8.2l.8 -1.3" stroke="var(--art-plate)" stroke-width=".7" stroke-linecap="round"/>`);

  const rock = (x, y, s) => at(x, y, s, `${shadow(0, 0, 5)}
    <path d="M-5 0L-4.2 -3.6L-1.4 -6L2.6 -5.4L5 -2.4L4.6 0z" fill="var(--art-stone)" ${INK}/>
    <path d="M-4.2 -3.6L-1.4 -6L.6 -3.2L-2 -1.6z" fill="var(--art-stone-lt)"/>
    ${SH('M2.6 -5.4L5 -2.4L4.6 0H1L.6 -3.2z')}`);

  const bricks = (x, y, s) => at(x, y, s, `${shadow(0, 0, 6)}
    <g ${INK}>${[[-5.4, -2.4], [-.2, -2.4], [-2.8, -4.8], [2.4, -4.8], [-.2, -7.2]].map(([bx, by]) =>
      `<rect x="${bx}" y="${by}" width="5" height="2.4" fill="var(--art-clay)"/>`).join('')}</g>
    ${[[-5.4, -2.4], [-.2, -2.4], [-2.8, -4.8], [2.4, -4.8], [-.2, -7.2]].map(([bx, by]) =>
      `<rect x="${bx + .3}" y="${by + .3}" width="4.4" height=".6" fill="#fff" opacity=".3"/>`).join('')}`);

  const logs = (x, y, s) => at(x, y, s, `${shadow(0, 0, 6)}
    ${[[-3, -1.6], [1.6, -1.6], [-.7, -4.4]].map(([lx, ly]) => `
      <rect x="${lx - 4}" y="${ly - 1.5}" width="8" height="3" rx="1.5" fill="var(--art-wood)" ${INK}/>
      <ellipse cx="${lx + 4}" cy="${ly}" rx="1.2" ry="1.5" fill="var(--art-wood-lt)" ${INK}/>
      <rect x="${lx - 3.4}" y="${ly - 1.1}" width="6" height=".6" fill="#fff" opacity=".3"/>`).join('')}`);

  const reeds = (x, y, s) => at(x, y, s, `
    ${[[-3, 12, -.4], [-1, 15, .1], [1.4, 13.5, .35], [3.4, 10.5, .6]].map(([rx, h, lean]) => `
      <path d="M${rx} 0Q${rx + lean * 2} ${-h / 2} ${rx + lean * 4} ${-h}" fill="none" stroke="var(--art-reed-dk)" stroke-width=".7"/>
      <rect x="${rx + lean * 4 - .7}" y="${-h}" width="1.4" height="3.6" rx=".7" fill="var(--art-wood-dk)" ${INK}/>`).join('')}
    <path d="M-5 0Q-6 -4 -8 -6M5 0Q6.4 -3.4 8.6 -5" fill="none" stroke="var(--art-reed)" stroke-width=".9"/>`);

  const fish = (x, y, s, flip) => at(x, y, s, `<g transform="scale(${flip ? -1 : 1} 1) rotate(-24)">
    <path d="M-5 0Q-1 -3.6 3.4 -1.2L6 -3V3L3.4 1.2Q-1 3.6 -5 0z" fill="var(--art-water)" ${INK}/>
    <path d="M-5 0Q-1 -3.6 3.4 -1.2Q-1 -1.6 -4.4 .2z" fill="#fff" opacity=".45"/>
    <circle cx="-2.8" cy="-.6" r=".55" fill="var(--art-ink)"/></g>
    <path d="M-4 5q2 -1.4 4 0t4 0" fill="none" stroke="#fff" stroke-width=".6" opacity=".7"/>`);

  const boat = (x, y, s) => at(x, y, s, `<path d="M-8 -2H8L5.6 1.4H-5.6z" fill="var(--art-wood)" ${INK}/>
    ${SH('M-8 -2H8L7 -.8H-7z')}<path d="M2 -2L7 -14" stroke="var(--art-wood-dk)" stroke-width=".7"/>
    <path d="M7 -14Q9.6 -8 9.2 -1" fill="none" stroke="var(--art-ink)" stroke-width=".3"/>`);

  const plough = (x, y, s) => at(x, y, s, `${shadow(0, 0, 7)}
    <path d="M-7 -1L4 -6.6L9 -11" fill="none" stroke="var(--art-wood-dk)" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M-8.4 0L-3.6 -3.4L-2 -.2z" fill="var(--art-stone-lt)" ${INK}/>
    <circle cx="3.4" cy="-2.4" r="2.4" fill="none" stroke="var(--art-wood-dk)" stroke-width="1"/>`);

  const sheaf = (x, y, s) => at(x, y, s, `${shadow(0, 0, 4.6)}
    ${[-2.6, -1.2, 0, 1.2, 2.6].map((dx) => `<path d="M${dx * .4} 0L${dx} -9" stroke="var(--art-grain)" stroke-width=".8"/>
      <ellipse cx="${dx}" cy="-10.6" rx=".9" ry="2" fill="var(--art-grain)" transform="rotate(${dx * 6} ${dx} -10.6)" ${INK}/>`).join('')}
    <rect x="-2" y="-5" width="4" height="1.4" rx=".5" fill="var(--art-wood-dk)"/>`);

  const sack = (x, y, s) => at(x, y, s, `${shadow(0, 0, 4.4)}
    <path d="M-3.8 0Q-4.6 -4.6 -2 -7.4H2Q4.6 -4.6 3.8 0z" fill="var(--art-plate)" ${INK}/>
    ${SH('M1 -7.4H2Q4.6 -4.6 3.8 0H1.4Q2.6 -3.6 1 -7.4z')}<path d="M-2.2 -7.4Q0 -9.2 2.2 -7.4" fill="none" stroke="var(--art-wood-dk)" stroke-width=".7"/>
    ${[[5, -.6], [6.2, -.3], [5.6, -1.4]].map(([gx, gy]) => `<ellipse cx="${gx}" cy="${gy}" rx=".7" ry=".45" fill="var(--art-grain)"/>`).join('')}`);

  const bread = (x, y, s) => at(x, y, s, `${shadow(0, 0, 4.4)}
    <path d="M-4.4 0Q-4.6 -4 0 -4.4T4.4 0z" fill="var(--art-food)" ${INK}/>
    <path d="M-2.4 -3l1 1.2M0 -3.4l1 1.2M2.2 -3l.9 1.1" stroke="var(--art-wood-dk)" stroke-width=".5"/>
    ${HI('M-3.8 -1.4Q-3.6 -3.8 0 -4.1Q-2.4 -3 -2.8 -1.2z')}`);

  const oven = (x, y, s) => at(x, y, s, `${shadow(0, 0, 8)}
    <defs><radialGradient id="fire"><stop offset="0" stop-color="#fff4c2"/><stop offset=".5" stop-color="var(--art-veg)"/>
      <stop offset="1" stop-color="var(--art-clay)" stop-opacity="0"/></radialGradient></defs>
    <path d="M-7.4 0Q-7.8 -10.4 0 -10.8T7.4 0z" fill="var(--art-clay)" ${INK}/>
    ${SH('M2.4 -10.4Q7.8 -8 7.4 0H3.4Q5 -6 2.4 -10.4z')}${HI('M-6.4 -2Q-6.8 -9 -1 -10.2Q-4.6 -7 -4.6 -2z')}
    <circle cx="0" cy="-2.6" r="6" fill="url(#fire)" opacity=".9"/>
    <path d="M-2.8 0V-2.6Q-2.8 -5.4 0 -5.4T2.8 -2.6V0z" fill="#2a1406"/>
    <path d="M-1.4 0Q-1.8 -2 -.2 -3.6Q0 -2.2 1.2 -1.6Q1.6 -.6 1.2 0z" fill="var(--art-veg)"/>
    <path d="M1.6 -10.4v-3.4h2.4v4.2" fill="var(--art-clay-lt)" ${INK}/>`);

  const lectern = (x, y, s) => at(x, y, s, `${shadow(0, 0, 4.4)}
    <path d="M-.6 0V-6.4H.6V0zM-3 0H3" stroke="var(--art-wood-dk)" stroke-width=".9"/>
    <path d="M-5.2 -6.2L0 -8.4L5.2 -6.2L0 -4.6z" fill="var(--art-plate)" ${INK}/>
    <path d="M0 -8.4V-4.6" stroke="var(--art-ink)" stroke-width=".4"/>
    ${[-6.9, -6.3, -5.7].map((ly) => `<path d="M-3.4 ${ly + .4}L-.8 ${ly - .6}M.8 ${ly - .6}L3.4 ${ly + .4}" stroke="var(--art-ink)" stroke-width=".3" opacity=".6"/>`).join('')}`);

  const fence = (x1, x2, y, s, back) => {
    let out = '';
    const n = Math.max(2, Math.round((x2 - x1) / 5));
    for (let i = 0; i <= n; i++) {
      const px = x1 + (x2 - x1) * i / n;
      out += `<rect x="${px - .6}" y="${y - 6 * s}" width="${1.2 * s}" height="${6.2 * s}" rx=".3" fill="var(--art-fence-dk)" ${INK}/>`;
    }
    const rail = (ry) => `<rect x="${x1 - .5}" y="${ry}" width="${x2 - x1 + 1}" height="${1 * s}" rx=".4" fill="var(--art-fence)" ${INK}/>
      <rect x="${x1}" y="${ry + .15}" width="${x2 - x1}" height=".3" fill="#fff" opacity=".35"/>`;
    return (back ? '' : shadow((x1 + x2) / 2, y + .2, (x2 - x1) / 2)) + out + rail(y - 4.6 * s) + rail(y - 2.4 * s);
  };

  const carrots = (x, y, s) => at(x, y, s, `${[-4, 0, 4].map((cx) => `
    <path d="M${cx - 1.1} -1.6Q${cx} 2.4 ${cx + 1.1} -1.6z" fill="var(--art-veg)" ${INK}/>
    <path d="M${cx} -1.6l-1.4 -3.4M${cx} -1.6l0 -4M${cx} -1.6l1.4 -3.4" stroke="var(--art-reed)" stroke-width=".8" stroke-linecap="round"/>`).join('')}
    <ellipse cx="0" cy="-1.5" rx="7" ry=".9" fill="var(--art-soil-dk)" opacity=".6"/>`);

  const cradle = (x, y, s) => at(x, y, s, `${shadow(0, 0, 5)}
    <path d="M-5.4 -1Q0 2 5.4 -1" fill="none" stroke="var(--art-wood-dk)" stroke-width=".9"/>
    <path d="M-5 -2L-4.6 -6.4H4.6L5 -2Q0 -.4 -5 -2z" fill="var(--art-wood)" ${INK}/>
    <path d="M-4 -6.4Q0 -8.6 4 -6.4" fill="var(--art-plate)" ${INK}/>
    <circle cx="-2" cy="-7" r="1.6" fill="var(--art-sheep-face)" ${INK}/>${SH('M1 -6.4H4.6L5 -2Q3 -1.2 1.4 -1.4z')}`);

  const startDisc = (x, y, s) => at(x, y, s, `${shadow(0, 0, 3.4)}
    <ellipse cx="0" cy="-1.4" rx="3.4" ry="1.5" fill="var(--art-seal)" ${INK}/>
    <ellipse cx="0" cy="-2.2" rx="3.4" ry="1.5" fill="var(--art-seal)" ${INK}/>
    <ellipse cx="-.8" cy="-2.6" rx="1.6" ry=".5" fill="#fff" opacity=".5"/>`);

  const well = (x, y, s) => at(x, y, s, `${shadow(0, 0, 5.4)}
    <rect x="-4.4" y="-4" width="8.8" height="4" rx="1" fill="var(--art-stone)" ${INK}/>
    <path d="M-4.4 -2.4H4.4" stroke="#000" stroke-width=".3" opacity=".3"/>
    <path d="M-3.8 -4V-10M3.8 -4V-10" stroke="var(--art-wood-dk)" stroke-width=".9"/>
    <path d="M-5.4 -9.6L0 -12.6L5.4 -9.6z" fill="var(--art-roof)" ${INK}/>`);

  const SCENES = {
    farmland: () => land('farmland', { bare: true }) + furrows() + tree(56, 14, .6) + plough(22, 21, 1.15),
    grain_seeds: () => land('grain_seeds') + sheaf(14, 21, 1.15) + sack(30, 21.5, 1.05) + sheaf(44, 17, .75),
    farm_expansion: () => land('farm_expansion') + house(14, 21, .95, 'wood') + logs(38, 21, .9) + tree(56, 16, .55),
    meeting_place: () => land('meeting_place') + well(4, 20, .9) + person(22, 21.5, 1, 'var(--p1)') +
      person(30, 21, .95, 'var(--p2)') + startDisc(42, 21.5, 1),
    lessons: () => land('lessons') + tree(-4, 18, .8) + lectern(16, 21, 1.1) + person(28, 21.5, .95, 'var(--occ-frame)') +
      person(38, 21, .8, 'var(--p1)') + person(46, 20.5, .7, 'var(--p2)'),
    day_laborer: () => land('day_laborer') + tree(-2, 17, .8) + person(18, 21.5, 1.1, 'var(--p1)') + bread(30, 21.5, 1) +
      bread(37, 21, .8) + sack(48, 20, .8),
    forest: () => land('forest', { far: 'var(--art-tree)' }) + pine(-6, 16, .9) + pine(42, 15.5, .85) + tree(54, 18, .8) +
      pine(8, 19, 1.15) + pine(28, 21.5, 1.25) + logs(16, 22, .6),
    clay_pit: () => land('clay_pit', { ground: 'var(--art-soil)', bare: true }) +
      `<ellipse cx="18" cy="21" rx="16" ry="3.6" fill="var(--art-soil-dk)"/><ellipse cx="18" cy="20.4" rx="13" ry="2.4" fill="var(--art-clay)" opacity=".85"/>` +
      bricks(38, 21.5, 1.05) + tree(56, 15, .55),
    reed_bank: () => land('reed_bank', { bare: true }) + water('reed_bank') + reeds(2, 21, 1) + reeds(24, 22, 1.15) + reeds(44, 19.5, .8),
    fishing: () => land('fishing', { bare: true }) + water('fishing') + boat(8, 19, .9) + fish(30, 18, 1.05) + fish(44, 21, .8, true),
    major: () => land('major') + oven(22, 21.5, 1.15) + bread(38, 21.5, .9) + logs(4, 21, .7),
    sheep_market: () => land('sheep_market', { ground: 'var(--art-pasture)' }) + fence(-12, 64, 16.5, .8, true) +
      sheep(10, 21, 1.1) + sheep(26, 21.5, 1.2) + sheep(42, 20, .9),
    pig_market: () => land('pig_market', { ground: 'var(--art-pasture)' }) + fence(-12, 64, 16.5, .8, true) +
      boar(12, 21.5, 1.15) + boar(32, 20.5, 1) + tree(54, 16, .6),
    cattle_market: () => land('cattle_market', { ground: 'var(--art-pasture)' }) + fence(-12, 64, 16.5, .8, true) +
      cow(14, 21.5, 1.15) + cow(36, 20.5, .95),
    fencing: () => land('fencing', { ground: 'var(--art-pasture)' }) + fence(-8, 58, 18, 1.1) + fence(-2, 40, 22.5, 1.3) +
      logs(50, 22, .6),
    grain_util: () => land('grain_util') + sheaf(4, 21, 1) + oven(24, 21.5, 1) + bread(38, 21.5, .9) + bread(45, 21, .75),
    family_growth: () => land('family_growth') + house(8, 21, .95, 'wood') + person(26, 21.5, 1, 'var(--p1)') +
      person(33, 21.5, .95, 'var(--p2)') + person(29.5, 21.8, .6, 'var(--occ-frame)'),
    renovation: () => land('renovation') + house(14, 21, 1, 'clay', { scaffold: true }) + bricks(36, 21.5, .85) + rock(48, 21, .7),
    west_quarry: () => land('west_quarry', { ground: 'var(--art-stone-lt)', far: 'var(--art-stone)', bare: true }) +
      `<path d="M-34 ${H + 3}L-8 -2L10 6L22 ${H + 3}z" fill="var(--art-stone)" stroke="var(--art-ink)" stroke-width=".7"/>
       <path d="M-8 -2L10 6L4 9L-6 4z" fill="#fff" opacity=".2"/>` +
      rock(18, 21, 1.1) + rock(32, 22, .85) + rock(44, 19.5, .7),
    veg_seeds: () => land('veg_seeds') + `<path d="M-12 18H64V24H-12z" fill="var(--art-soil)" opacity=".85"/>` +
      carrots(8, 21.5, 1.25) + carrots(28, 22, 1.35) + carrots(47, 21, 1.05),
    cultivation: () => land('cultivation', { bare: true }) + furrows() + plough(8, 21, .95) + sheaf(36, 21.5, 1) + sack(48, 21, .8),
    urgent_growth: () => land('urgent_growth') + house(4, 20, .8, 'wood') + person(24, 21.5, 1, 'var(--p1)') + cradle(36, 21.5, 1.05),
    farm_redev: () => land('farm_redev', { ground: 'var(--art-pasture)' }) + house(10, 21, .95, 'stone') +
      fence(26, 60, 21.5, .95) + sheep(44, 19.4, .7),
  };
  SCENES.east_quarry = () => SCENES.west_quarry().replace(/west_quarry/g, 'east_quarry');
  const SKY = () => `<rect x="-34" y="-14" width="124" height="76" fill="var(--art-sky)"/>`;
  const GROUND = () => '';

  // ---------------------------------------------------------------- card illustrations
  // Every card gets a little scene built from the same props as the board. Majors are drawn
  // one by one; occupations show a person with the tools of their trade; minor improvements
  // show the object. Which props appear is read off the card: its name first, then the
  // earliest things its rules text mentions.
  const pot = (x, y, s) => at(x, y, s, `${shadow(0, 0, 3.6)}
    <path d="M-2.4 0Q-4.2 -2.6 -3 -5.4H3Q4.2 -2.6 2.4 0z" fill="var(--art-clay)" ${INK}/>
    <rect x="-3.4" y="-6.4" width="6.8" height="1.2" rx=".5" fill="var(--art-clay-lt)" ${INK}/>
    ${HI('M-2.6 -1Q-3.6 -3 -2.6 -5.2H-1.4Q-2.4 -3 -1.6 -1z')}`);

  const basket = (x, y, s) => at(x, y, s, `${shadow(0, 0, 4.2)}
    <path d="M-4.2 -4.2H4.2L3.2 0H-3.2z" fill="var(--art-grain)" ${INK}/>
    ${[-3, -1.6, 0, 1.6, 3].map((bx) => `<path d="M${bx} -4.2L${bx * .78} 0" stroke="var(--art-wood-dk)" stroke-width=".45"/>`).join('')}
    <path d="M-4 -2.6H4M-3.6 -1.2H3.6" stroke="var(--art-wood-dk)" stroke-width=".45"/>
    <path d="M-3.4 -4.2Q0 -9 3.4 -4.2" fill="none" stroke="var(--art-wood-dk)" stroke-width=".8"/>`);

  const barn = (x, y, s) => at(x, y, s, `${shadow(1, 0, 6)}
    <path d="M-5 0V-5.4L0 -9.4L5 -5.4V0z" fill="var(--art-wood-dk)" ${INK}/>
    ${SH('M0 -9.4L5 -5.4V0H0z')}<rect x="-2.2" y="-4.4" width="4.4" height="4.4" fill="var(--art-stable-door)" ${INK}/>
    <path d="M-2.2 -4.4L2.2 0M2.2 -4.4L-2.2 0" stroke="var(--art-wood-lt)" stroke-width=".6"/>
    <path d="M-5.8 -5L0 -10.2L5.8 -5" fill="none" stroke="var(--art-roof)" stroke-width="1.4" stroke-linejoin="round"/>`);

  const pumpkin = (x, y, s) => at(x, y, s, `${shadow(0, 0, 4)}
    <ellipse cx="0" cy="-2.6" rx="4" ry="2.8" fill="var(--art-veg)" ${INK}/>
    <path d="M-1.4 -5.2Q-2 -2.6 -1.4 -.1M1.4 -5.2Q2 -2.6 1.4 -.1" fill="none" stroke="#000" stroke-width=".4" opacity=".3"/>
    ${HI('M-3.4 -3.2Q-3 -4.8 -1.2 -5.2Q-2.6 -4 -2.6 -2.6z')}
    <path d="M0 -5.2l.6 -1.6" stroke="var(--art-wood-dk)" stroke-width=".8"/>
    <ellipse cx="1.8" cy="-5.8" rx="1.6" ry=".6" fill="var(--art-reed)" transform="rotate(-20 1.8 -5.8)"/>`);

  const coin = (x, y, s) => at(x, y, s, `${shadow(0, 0, 3.6)}
    <circle cx="0" cy="-4" r="3.6" fill="var(--art-seal)" ${INK}/>
    <circle cx="0" cy="-4" r="2.5" fill="none" stroke="var(--art-ink)" stroke-width=".4" opacity=".5"/>
    <path d="M0 -5.6l.5 1 1.1.2-.8.8.2 1.1-1-.5-1 .5.2-1.1-.8-.8 1.1-.2z" fill="#fff" opacity=".85"/>`);

  // Keyword → how to draw it, and what ground it needs.
  const ART_KEYS = [
    [/魚/, 'fish'], [/綿羊|羊/, 'sheep'], [/野豬|豬/, 'boar'], [/牛/, 'cow'],
    [/馬廄/, 'barn'], [/柵欄|牧場/, 'fence'], [/房間|房屋|木屋|黏土屋|石屋|屋/, 'house'],
    [/麵包|烤/, 'bread'], [/爐|灶/, 'oven'], [/井/, 'well'], [/籃/, 'basket'],
    [/蘆葦/, 'reeds'], [/陶|罐|瓶/, 'pot'], [/黏土|磚/, 'bricks'], [/石/, 'rock'],
    [/木材|木匠|木/, 'logs'], [/犁|耕|田/, 'plough'], [/穀物|穀|麥/, 'sheaf'],
    [/蔬菜|南瓜|菜/, 'pumpkin'], [/食物|餐|煮/, 'bread'], [/書|學|授課|教|師/, 'lectern'],
    [/分|獎勵/, 'coin'],
  ];
  const PROP = {
    fish: (x, y, s) => fish(x, y - 3, s), sheep, boar, cow, barn, house: (x, y, s) => house(x, y, s * .8, 'wood'),
    bread, oven, well, basket, reeds, pot, bricks, rock, logs, plough, sheaf, pumpkin, lectern, coin, sack,
    fence: (x, y, s) => fence(x - 7 * s, x + 7 * s, y, s),
  };
  const GROUND_FOR = { fish: 'water', reeds: 'water', plough: 'field', rock: 'stone', sheep: 'pasture', boar: 'pasture', cow: 'pasture', fence: 'pasture' };

  function cardProps(c) {
    const found = [];
    const scan = (text) => {
      const hits = [];
      for (const [re, key] of ART_KEYS) {
        const m = text.match(re);
        if (m) hits.push([m.index, key]);
      }
      hits.sort((a, b) => a[0] - b[0]).forEach(([, k]) => { if (!found.includes(k)) found.push(k); });
    };
    scan(c.zh || '');
    scan(c.txz || '');
    if (!found.length) found.push('sack');
    return found;
  }

  function cardBackdrop(id, kind) {
    if (kind === 'water') return land(id, { bare: true }) + water(id);
    if (kind === 'field') return land(id, { bare: true }) + furrows();
    if (kind === 'stone') return land(id, { ground: 'var(--art-stone-lt)', far: 'var(--art-stone)', bare: true });
    if (kind === 'pasture') return land(id, { ground: 'var(--art-pasture)' });
    return land(id);
  }

  const MAJOR_ART = {
    'Fireplace': (id) => land(id) + logs(8, 21, .9) + oven(26, 21.5, 1.15) + tree(48, 17, .7),
    'Cooking Hearth': (id) => land(id) + pumpkin(6, 21.5, 1) + oven(24, 21.5, 1.2) + pot(38, 21.5, 1.1) + sheep(50, 20, .75),
    'Well': (id) => land(id) + tree(-2, 17, .8) + well(20, 21.5, 1.35) + person(36, 21.5, 1, 'var(--p2)') + pot(45, 21.5, .9),
    'Clay Oven': (id) => land(id) + sheaf(6, 21.5, 1) + oven(26, 21.5, 1.25) + bread(42, 21.5, 1) + bread(49, 21, .8),
    'Stone Oven': (id) => land(id, { ground: 'var(--art-stone-lt)' }) + rock(4, 21, .9) + oven(24, 21.5, 1.3) + bread(40, 21.5, 1) + bread(47, 21, .85),
    'Joinery': (id) => land(id) + house(12, 21.5, .9, 'wood', { scaffold: true }) + logs(32, 21.5, 1) + logs(45, 21, .75),
    'Pottery': (id) => land(id) + bricks(6, 21.5, .9) + pot(22, 21.5, 1.3) + pot(32, 21.5, 1) + pot(40, 21, .8) + oven(51, 20, .6),
    "Basketmaker's Workshop": (id) => land(id, { bare: true }) + water(id) + reeds(4, 21, 1) + basket(24, 21.5, 1.3) + basket(36, 21.5, 1) + reeds(48, 20, .8),
  };

  function cardScene(c) {
    const id = 'c' + String(c.en || c.zh).replace(/[^A-Za-z0-9]/g, '');
    if (c.type === 'maj' && MAJOR_ART[c.en]) return MAJOR_ART[c.en](id);
    const props = cardProps(c);
    const [a, b] = props;
    let s = cardBackdrop(id, GROUND_FOR[a]);
    if (c.type === 'occ') {
      // The worker in front, the tools of the trade beside them.
      s += tree(-2, 17, .7);
      s += person(16, 22, 1.25, 'var(--occ-frame)');
      s += PROP[a](32, 22, 1.2);
      if (b) s += PROP[b](47, 21, .85);
    } else {
      s += b ? PROP[b](6, 21, .9) : tree(4, 18, .8);
      s += PROP[a](26, 22, 1.45);
      s += tree(50, 17, .65);
    }
    return s;
  }

  // Fit the subject strip into a box that nothing covers.
  function fitMarkup(markup, x, y, w, h, open) {
    const vis = open || h;
    const s = Math.min(w / 58, vis / 22);
    const vw = w / s, vh = h / s;
    const vx = 26 - vw / 2, vy = 23 - vis / s;
    return `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${vx.toFixed(2)} ${vy.toFixed(2)} ${vw.toFixed(2)} ${vh.toFixed(2)}" preserveAspectRatio="none">${markup}</svg>`;
  }

  // A card's picture as a standalone SVG, for the HTML preview.
  function cardArt(c, w, h) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${fitMarkup(cardScene(c), 0, 0, w, h)}</svg>`;
  }

  // A scene scaled into an arbitrary box. `open` is how much of the box stays uncovered
  // above the name plate: the subject strip (x −3…55, y 1…23) is fitted into exactly that,
  // and the landscape simply continues underneath the plate.
  function scene(id, x, y, w, h, open) {
    const f = SCENES[id] || (() => SKY() + GROUND());
    const vis = open || h * 0.5;
    const s = Math.min(w / 58, vis / 22);
    const vw = w / s, vh = h / s;
    const vx = 26 - vw / 2, vy = 23 - vis / s;
    return `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${vx.toFixed(2)} ${vy.toFixed(2)} ${vw.toFixed(2)} ${vh.toFixed(2)}" preserveAspectRatio="none">${f()}</svg>`;
  }

  // A parchment name plate, the kind printed on a board space: the name, its English
  // name beside it, then one or two lines spelling out what the space actually does.
  function plate(x, y, w, h, main, en, notes) {
    const lines = notes || [];
    let s = `<g transform="translate(${x} ${y})">
      <rect width="${w}" height="${h}" rx="5" fill="var(--art-plate)" stroke="${ink}" stroke-width="1.5" opacity=".95"/>
      <text class="plate-main" x="9" y="${lines.length ? 19 : h / 2 + 6}">${main}`;
    if (en) s += `<tspan class="plate-en" dx="6">${en}</tspan>`;
    s += '</text>';
    lines.forEach((t, i) => { s += `<text class="plate-note" x="9" y="${36 + i * 14}">${t}</text>`; });
    return s + '</g>';
  }

  // A goods token: the drawn resource on a wooden disc, with its count.
  function token(key, n, x, y, size) {
    const s = size || 34;
    return `<g transform="translate(${x} ${y})">
      <circle cx="${s / 2}" cy="${s / 2}" r="${s / 2}" fill="var(--art-token)" stroke="${ink}" stroke-width="1.6"/>
      <g transform="translate(${s * 0.14} ${s * 0.14}) scale(${s * 0.72 / 24})">${ICONS[key] || ''}</g>
      <g transform="translate(${s - 13} ${s - 15})">
        <rect width="${n > 9 ? 24 : 18}" height="16" rx="8" fill="var(--art-count)" stroke="${ink}" stroke-width="1.4"/>
        <text class="count" x="${(n > 9 ? 24 : 18) / 2}" y="12">${n}</text></g></g>`;
  }

  // Wooden board frame with an inner panel.
  function board(w, h, pad) {
    const p = pad == null ? 9 : pad;
    return `<rect width="${w}" height="${h}" rx="14" fill="var(--art-frame)" stroke="${ink}" stroke-width="2"/>
      <rect x="${p}" y="${p}" width="${w - 2 * p}" height="${h - 2 * p}" rx="8" fill="var(--art-boardface)" stroke="${ink}" stroke-width="1.2" opacity=".9"/>
      <rect width="${w}" height="${h}" rx="14" fill="url(#grain)" opacity=".5" style="pointer-events:none"/>`;
  }

  // A shallow recess, used for the player mat's storage slots.
  function slot(x, y, w, h) {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="7"
      fill="var(--art-slot)" stroke="${ink}" stroke-width="1.3" opacity=".92"/>`;
  }

  // Victory points, everywhere they appear: a swallow-tailed pennant in 山吹 gold with the
  // number in dark ink. (x, y) is the top centre; s scales it
  // from its natural 32 × 42.
  function vpBadge(n, x, y, s) {
    return `<g transform="translate(${x} ${y}) scale(${s || 1})">
      <path d="M-16 0H16V40L0 32L-16 40z" fill="#000" opacity=".3" transform="translate(1.5 2)"/>
      <path d="M-16 0H16V40L0 32L-16 40z" fill="var(--art-seal)" stroke="${ink}" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="M-12.5 3.5H12.5V34L0 28L-12.5 34z" fill="none" stroke="#fff" stroke-width="1" opacity=".35"/>
      <text x="0" y="23" text-anchor="middle" font-size="20" font-weight="900" fill="${ink}"
        font-family="-apple-system,'PingFang TC',sans-serif">${n}</text></g>`;
  }
  // A tiny inline one for text lines (a 14 px pennant with no number).
  function vpIcon(size) {
    const h = size || 14;
    return `<svg class="vpi" viewBox="-17 -1 34 44" width="${h * 0.78}" height="${h}" aria-hidden="true">
      <path d="M-16 0H16V40L0 32L-16 40z" fill="var(--art-seal)" stroke="${ink}" stroke-width="2.4" stroke-linejoin="round"/></svg>`;
  }
  // Kept for older callers: the badge centred on (x, y).
  function seal(n, x, y, r) { return vpBadge(n, x, y - r, r / 16); }

  // Raw scene markup, for callers that build their own SVG document (the 3D view).
  function sceneMarkup(id) {
    const f = SCENES[id] || (() => SKY() + GROUND());
    return f();
  }

  function spaceArt(id) {
    const f = SCENES[id];
    return `<svg class="spaceart" viewBox="0 0 56 42" width="56" height="42" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${f ? f() : SKY() + GROUND()}</svg>`;
  }

  // A worker, in the same coin style as the goods: the player's colour with a cream farmer
  // — straw hat, dungarees, a pitchfork over the shoulder — so it reads as a farmhand.
  function workerMarkup(fill) {
    const c = '#f4ecd8';
    return `${coinBase(fill)}
      <g stroke="${c}" stroke-width="1.1" stroke-linecap="round" fill="none">
        <path d="M17.2 20.2L19.1 8.4"/><path d="M18.1 8.1L18.5 5.6M19.1 8.4L19.5 5.8M20.1 8.6L20.5 6.1M18.1 8.1Q19.1 7.6 20.1 8.6"/></g>
      <path d="M6.4 20.6Q6.6 14.3 12 13.8Q17.4 14.3 17.6 20.6Q14.9 21.7 12 21.7Q9.1 21.7 6.4 20.6z" fill="${c}"/>
      <path d="M9.7 14.4V18.4H14.3V14.4" fill="none" stroke="${fill}" stroke-width="1.1"/>
      <circle cx="12" cy="10.3" r="2.6" fill="${c}"/>
      <path d="M8.8 7.9Q9 4.2 12 4.2T15.2 7.9z" fill="${c}"/>
      <ellipse cx="12" cy="8" rx="6.2" ry="1.4" fill="${c}"/>
      <path d="M8.9 7.1H15.1" stroke="${fill}" stroke-width=".9"/>`;
  }

  function meeple(colorVar, size) {
    const s = size || 16;
    return `<svg class="meeple" viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true">${workerMarkup(colorVar)}</svg>`;
  }


  // ---------------------------------------------------------------- card faces
  // A printed card, drawn big enough to stay readable as a 3D texture. SVG has no text
  // wrapping, so lines are measured by hand: a CJK glyph is one unit, latin about half.
  const CARD_W = 300, CARD_H = 420;
  const TYPE_BAND = {
    // deep: the frame, the type's colour sunk towards 墨 so the border is quiet
    occ: { frame: 'var(--occ-frame)', deep: '#4a3b1f', tint: 'var(--occ-tint)', ink: 'var(--occ-ink)', zh: '職業', en: 'OCCUPATION' },
    min: { frame: 'var(--min-frame)', deep: '#4c2d19', tint: 'var(--min-tint)', ink: 'var(--min-ink)', zh: '次要發展', en: 'MINOR IMPROVEMENT' },
    maj: { frame: 'var(--maj-frame)', deep: '#452017', tint: 'var(--maj-tint)', ink: 'var(--maj-ink)', zh: '主要發展', en: 'MAJOR IMPROVEMENT' },
  };

  const wide = (ch) => (ch.charCodeAt(0) > 0x2e7f ? 1 : 0.55);

  function wrap(text, perLine, maxLines) {
    const lines = [];
    let cur = '', w = 0;
    for (const ch of String(text || '')) {
      if (ch === '\n') { lines.push(cur); cur = ''; w = 0; continue; }
      const cw = wide(ch);
      if (w + cw > perLine) { lines.push(cur); cur = ''; w = 0; }
      cur += ch; w += cw;
    }
    if (cur) lines.push(cur);
    if (maxLines && lines.length > maxLines) {
      const cut = lines.slice(0, maxLines);
      cut[maxLines - 1] = cut[maxLines - 1].slice(0, -1) + '…';
      return cut;
    }
    return lines;
  }

  // Cost spelled as icon + number chips, laid out left to right.
  const NAMES = { food: '食物', wood: '木材', clay: '黏土', reed: '蘆葦', stone: '石頭',
    grain: '穀物', veg: '蔬菜', sheep: '綿羊', boar: '野豬', cattle: '牛', begging: '乞討' };

  function costRow(cost, x, y) {
    const keys = Object.keys(cost || {});
    if (!keys.length) {
      return `<text x="${x}" y="${y + 17}" font-size="16" fill="var(--art-ink)" opacity=".75">免費</text>`;
    }
    // Icon, count, then the name, so a cost never has to be decoded from the picture alone.
    let s = '', cx = x;
    for (const k of keys) {
      s += `<g transform="translate(${cx} ${y})">
        <rect width="80" height="26" rx="13" fill="var(--art-token)" stroke="${ink}" stroke-width="1.4"/>
        <g transform="translate(4 3) scale(${20 / 24})">${ICONS[k] || ''}</g>
        <text x="27" y="19" font-size="16" font-weight="800" fill="var(--art-ink)">${cost[k]}</text>
        <text x="${cost[k] > 9 ? 47 : 40}" y="18.5" font-size="12.5" fill="var(--art-ink)">${NAMES[k] || ''}</text></g>`;
      cx += 86;
    }
    return s;
  }

  // opts: { cost, taken, note } — `taken` prints an owner ribbon across the art.
  //
  // One fixed layout for every card, the way trading cards do it, so the eye always finds
  // things in the same place:
  //   name bar ........ 14–50   name (shrinks to fit), cost gems at the right
  //   picture ......... 56–240  about 44% of the card
  //   type line ....... 246–270 kind of card, victory points badge
  //   rules box ....... 276–386 about 26%; the type size steps down until the text fits
  //   footer .......... 392–410 English name, travelling card, play hint
  const FACE = { name: [14, 36], art: [56, 184], type: [246, 24], rules: [276, 110], foot: [392, 18] };

  function fitCard(markup, x, y, w, h) {
    const s = Math.min(w / 46, h / 28);
    const vw = w / s, vh = h / s;
    return `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${(26 - vw / 2).toFixed(2)} ${(24 - vh).toFixed(2)} ${vw.toFixed(2)} ${vh.toFixed(2)}" preserveAspectRatio="none">${markup}</svg>`;
  }

  // Painted card art is square, with the figure's head in the upper part. The window is
  // wider than tall, so the picture is scaled to a little over the window's width and
  // anchored high, which keeps the face and shoulders in frame.
  function artwork(c, x, y, w, h) {
    const src = typeof CARD_IMAGES !== 'undefined' && CARD_IMAGES[c.en];
    if (!src) return '';
    // Pictures come square or 3:4. Occupations are portraits, so keep the top (the head);
    // improvements are objects, so keep the middle.
    const align = c.type === 'occ' ? 'xMidYMin' : 'xMidYMid';
    return `<image href="${src}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="${align} slice"/>`;
  }


  // A cost gem: the good's icon in a coin, with the count on a small badge.
  function gem(k, n, cx, cy) {
    return `<g transform="translate(${cx} ${cy})">
      <circle r="15" fill="var(--art-count)" stroke="${ink}" stroke-width="1.6"/>
      <circle r="12.5" fill="none" stroke="${ink}" stroke-width=".6" opacity=".35"/>
      <g transform="translate(-11 -11) scale(${22 / 24})">${tokenMarkup(k)}</g>
      <circle cx="10" cy="10" r="8" fill="${ink}"/>
      <text x="10" y="14" text-anchor="middle" font-size="11.5" font-weight="800" fill="var(--art-count)">${n}</text></g>`;
  }

  // Wrap at the largest type size that still fits the box.
  function fitRules(text, w, h) {
    for (const [size, lh] of [[15.5, 21], [14.5, 19.5], [13.5, 18], [12.5, 16.5], [11.5, 15]]) {
      const per = (w - 4) / size;
      const lines = wrap(text, per, 99);
      if (lines.length * lh <= h) return { size, lh, lines };
    }
    const size = 11.5, lh = 15;
    return { size, lh, lines: wrap(text, (w - 4) / size, Math.floor(h / lh)) };
  }

  // ---------------------------------------------------------------- full-art occupation cards
  // The trading-card "full art" treatment: the painting runs edge to edge and the text floats
  // over it — name and cost across the top, the rules in a smoked-glass panel at the bottom.
  // Used for occupations that have artwork when the full-art style is switched on.
  let cardStyle = 'full';
  function setCardStyle(s) { cardStyle = s === 'standard' ? 'standard' : 'full'; }

  function cardFaceFull(c, o) {
    const t = TYPE_BAND[c.type] || TYPE_BAND.occ;
    const W = CARD_W, Hh = CARD_H;
    const cost = o.cost || {};
    const kinds = Object.keys(cost);
    const src = CARD_IMAGES[c.en];
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Hh}" width="${W}" height="${Hh}"
      font-family="-apple-system,BlinkMacSystemFont,'PingFang TC','Noto Sans TC',sans-serif">
      <defs>
        <clipPath id="fc"><rect x="1" y="1" width="${W - 2}" height="${Hh - 2}" rx="15"/></clipPath>
        <linearGradient id="ftop" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#0e0b08" stop-opacity=".78"/><stop offset="1" stop-color="#0e0b08" stop-opacity="0"/></linearGradient>
        <linearGradient id="fbot" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#0e0b08" stop-opacity="0"/><stop offset=".3" stop-color="#0e0b08" stop-opacity=".72"/>
          <stop offset="1" stop-color="#0e0b08" stop-opacity=".94"/></linearGradient>
        <linearGradient id="rule" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#d8b25a" stop-opacity="0"/><stop offset=".5" stop-color="#d8b25a"/>
          <stop offset="1" stop-color="#d8b25a" stop-opacity="0"/></linearGradient>
        <linearGradient id="foil" x1="0" y1="0" x2="1" y2="1">
          <stop offset=".2" stop-color="#fff" stop-opacity="0"/><stop offset=".32" stop-color="#fff6d8" stop-opacity=".16"/>
          <stop offset=".4" stop-color="#fff" stop-opacity="0"/><stop offset=".62" stop-color="#d8f0ff" stop-opacity=".1"/>
          <stop offset=".7" stop-color="#fff" stop-opacity="0"/></linearGradient>
        <filter id="tsh" x="-10%" y="-30%" width="120%" height="160%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.6" flood-color="#000" flood-opacity=".85"/></filter></defs>
      <rect width="${W}" height="${Hh}" fill="#15110d"/>
      <g clip-path="url(#fc)">
        <image href="${src}" x="0" y="0" width="${W}" height="${Hh}" preserveAspectRatio="xMidYMin slice"/>
        <rect width="${W}" height="96" fill="url(#ftop)"/>
        <rect y="${Hh * 0.52}" width="${W}" height="${Hh * 0.48}" fill="url(#fbot)"/>
        <rect width="${W}" height="${Hh}" fill="url(#foil)"/>
      </g>
      <rect x="1" y="1" width="${W - 2}" height="${Hh - 2}" rx="15" fill="none" stroke="#15110d" stroke-width="2"/>
      <rect x="6" y="6" width="${W - 12}" height="${Hh - 12}" rx="11" fill="none" stroke="#d8b25a" stroke-width="1.6" opacity=".85"/>`;

    // name, type pill, cost
    const gemsW = kinds.length ? kinds.length * 32 : 0;
    const name = c.zh || c.en;
    const nameSize = Math.min(26, Math.floor((W - 44 - gemsW) / Math.max(1, [...name].reduce((n, ch) => n + wide(ch), 0))));
    s += `<text x="20" y="${22 + nameSize}" font-size="${nameSize}" font-weight="900" fill="#fffaf0" filter="url(#tsh)">${name}</text>
      <g transform="translate(20 ${34 + nameSize})"><rect width="64" height="18" rx="9" fill="${t.frame}" opacity=".92"/>
        <text x="32" y="13" text-anchor="middle" font-size="11.5" font-weight="800" fill="#fffaf0">${t.zh}</text></g>`;
    if (kinds.length) kinds.forEach((k, i) => { s += gem(k, cost[k], W - 30 - (kinds.length - 1 - i) * 32, 32); });
    else s += `<text x="${W - 20}" y="37" text-anchor="end" font-size="13" font-weight="800" fill="#fffaf0" filter="url(#tsh)">免費</text>`;
    if (c.vp) s += vpBadge(c.vp, W - 30, 54, 1.05);

    // rules in a smoked-glass panel
    const box = { x: 16, y: 268, w: W - 32, h: 112 };
    s += `<path d="M24 ${box.y - 4}H${W - 24}" stroke="url(#rule)" stroke-width="1.2"/>
      <path d="M${W / 2} ${box.y - 8.5}l4.5 4.5-4.5 4.5-4.5-4.5z" fill="#d8b25a"/>`;
    const fit = fitRules(c.txz || c.tx || '', box.w - 22, box.h - 16);
    const top = box.y + 8 + (box.h - 16 - fit.lines.length * fit.lh) / 2 + fit.size * 0.95;
    fit.lines.forEach((ln, i) => {
      s += `<text x="${box.x + 11}" y="${(top + i * fit.lh).toFixed(1)}" font-size="${fit.size}" fill="#f7f0de">${ln}</text>`;
    });
    s += `<text x="20" y="${Hh - 18}" font-size="11" font-style="italic" fill="#f7f0de" opacity=".8">${c.en || ''}</text>`;
    const tags = [c.trav ? '旅行卡' : '', o.note || ''].filter(Boolean).join(' · ');
    if (tags) s += `<text x="${W - 20}" y="${Hh - 18}" text-anchor="end" font-size="11.5" font-weight="800" fill="#f2cf7a">${tags}</text>`;
    if (o.taken) {
      s += `<g transform="translate(${W / 2} ${Hh * 0.42}) rotate(-12)">
        <rect x="-128" y="-22" width="256" height="44" rx="9" fill="#15110d" opacity=".85"/>
        <text y="7" text-anchor="middle" font-size="20" font-weight="800" fill="#fffaf0">已被 ${o.taken} 取得</text></g>`;
    }
    return s + '</svg>';
  }

  function cardFace(c, opts) {
    const o = opts || {};
    if (cardStyle === 'full' && c.type === 'occ' && typeof CARD_IMAGES !== 'undefined' && CARD_IMAGES[c.en]) return cardFaceFull(c, o);
    const t = TYPE_BAND[c.type] || TYPE_BAND.min;
    const W = CARD_W, Hh = CARD_H, IN = 12;           // inner margin
    const cost = o.cost || {};
    const kinds = Object.keys(cost);
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Hh}" width="${W}" height="${Hh}"
      font-family="-apple-system,BlinkMacSystemFont,'PingFang TC','Noto Sans TC',sans-serif">
      <defs>
        <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/></linearGradient>
        <clipPath id="art"><rect x="${IN}" y="${FACE.art[0]}" width="${W - IN * 2}" height="${FACE.art[1]}" rx="6"/></clipPath></defs>
      <rect width="${W}" height="${Hh}" fill="${t.deep}"/>
      <rect x="1" y="1" width="${W - 2}" height="${Hh - 2}" rx="15" fill="${t.deep}" stroke="#15110d" stroke-width="2"/>
      <rect x="1" y="1" width="${W - 2}" height="${Hh - 2}" rx="15" fill="url(#sheen)"/>
      <rect x="6" y="6" width="${W - 12}" height="${Hh - 12}" rx="11" fill="${t.tint}" stroke="${t.frame}" stroke-width="1.6"/>`;

    // name bar, with cost gems on the right
    const gemsW = kinds.length ? kinds.length * 32 + 4 : 0;
    const nameW = W - IN * 2 - 14 - gemsW;
    const name = c.zh || c.en;
    const nameSize = Math.min(21, Math.floor(nameW / Math.max(1, [...name].reduce((n, ch) => n + wide(ch), 0))));
    s += `<rect x="${IN}" y="${FACE.name[0]}" width="${W - IN * 2}" height="${FACE.name[1]}" rx="8" fill="var(--art-plate)" stroke="${ink}" stroke-width="1.2"/>
      <rect x="${IN + 2}" y="${FACE.name[0] + 2}" width="${W - IN * 2 - 4}" height="10" rx="5" fill="#fff" opacity=".3"/>
      <text x="${IN + 10}" y="${FACE.name[0] + FACE.name[1] / 2 + nameSize * 0.36}" font-size="${nameSize}" font-weight="800" fill="var(--art-ink)">${name}</text>`;
    if (kinds.length) {
      kinds.forEach((k, i) => { s += gem(k, cost[k], W - IN - 18 - (kinds.length - 1 - i) * 32, FACE.name[0] + FACE.name[1] / 2); });
    } else {
      s += `<text x="${W - IN - 10}" y="${FACE.name[0] + FACE.name[1] / 2 + 5}" text-anchor="end" font-size="13" font-weight="700" fill="var(--art-ink)" opacity=".7">免費</text>`;
    }

    // picture: painted artwork when there is some (cardimages.js), else the drawn scene
    s += `<g clip-path="url(#art)">${artwork(c, IN, FACE.art[0], W - IN * 2, FACE.art[1]) || fitCard(cardScene(c), IN, FACE.art[0], W - IN * 2, FACE.art[1])}</g>
      <rect x="${IN}" y="${FACE.art[0]}" width="${W - IN * 2}" height="${FACE.art[1]}" rx="6" fill="none" stroke="${ink}" stroke-width="2"/>
      <rect x="${IN + 2}" y="${FACE.art[0] + 2}" width="${W - IN * 2 - 4}" height="${FACE.art[1] - 4}" rx="5" fill="none" stroke="#fff" stroke-width="1" opacity=".35"/>`;

    // type line and victory points
    s += `<rect x="${IN}" y="${FACE.type[0]}" width="${W - IN * 2}" height="${FACE.type[1]}" rx="6" fill="${t.frame}" stroke="${ink}" stroke-width="1.1"/>
      <text x="${IN + 10}" y="${FACE.type[0] + 16.5}" font-size="13" font-weight="800" fill="var(--art-count)">${t.zh}
        <tspan dx="6" font-size="10" font-weight="700" opacity=".85" letter-spacing="1">${t.en}</tspan></text>`;
    // points hang like a pennant from under the name bar, over the picture's top-right corner
    if (c.vp) s += vpBadge(c.vp, W - IN - 26, FACE.art[0] - 2, 1.05);

    // rules text, fitted
    const box = { x: IN, y: FACE.rules[0], w: W - IN * 2, h: FACE.rules[1] };
    s += `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="8" fill="var(--art-plate)" stroke="${ink}" stroke-width="1.1"/>`;
    const fit = fitRules(c.txz || c.tx || '', box.w - 20, box.h - 14);
    const top = box.y + 8 + (box.h - 14 - fit.lines.length * fit.lh) / 2 + fit.size * 0.95;
    fit.lines.forEach((ln, i) => {
      s += `<text x="${box.x + 10}" y="${(top + i * fit.lh).toFixed(1)}" font-size="${fit.size}" fill="var(--art-ink)">${ln}</text>`;
    });

    // footer
    const fy = FACE.foot[0] + 12;
    s += `<text x="${IN + 4}" y="${fy}" font-size="11" font-style="italic" fill="${t.ink}" opacity=".8">${c.en || ''}</text>`;
    const tags = [c.trav ? '旅行卡' : '', o.note || ''].filter(Boolean).join(' · ');
    if (tags) s += `<text x="${W - IN - 4}" y="${fy}" text-anchor="end" font-size="11.5" font-weight="800" fill="${t.ink}">${tags}</text>`;

    if (o.taken) {
      s += `<g transform="translate(${W / 2} ${FACE.art[0] + FACE.art[1] / 2}) rotate(-12)">
        <rect x="-128" y="-22" width="256" height="44" rx="9" fill="var(--art-ink)" opacity=".85"/>
        <text y="7" text-anchor="middle" font-size="20" font-weight="800" fill="var(--art-count)">已被 ${o.taken} 取得</text></g>`;
    }
    return s + '</svg>';
  }

  // The reverse side, for an opponent's hand.
  function cardBack(kind) {
    const t = TYPE_BAND[kind] || TYPE_BAND.min;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD_W} ${CARD_H}" width="${CARD_W}" height="${CARD_H}">
      <rect width="${CARD_W}" height="${CARD_H}" rx="18" fill="${t.frame}" stroke="${ink}" stroke-width="5"/>
      <rect x="26" y="26" width="${CARD_W - 52}" height="${CARD_H - 52}" rx="12" fill="none"
        stroke="var(--art-count)" stroke-width="2.5" opacity=".55"/>
      <g transform="translate(${CARD_W / 2} ${CARD_H / 2})" opacity=".75">
        <circle r="62" fill="none" stroke="var(--art-count)" stroke-width="3"/>
        <g transform="translate(-34 -34) scale(2.9)">${ICONS.grain || ''}</g></g>
      <rect width="${CARD_W}" height="${CARD_H}" rx="18" fill="url(#grain)" opacity=".4"/></svg>`;
  }

  return { ICONS, icon, spaceArt, sceneMarkup, scene, plate, token, board, slot, seal, meeple,
    grassTile, fieldTile, houseTile, stableArt, animalsArt, fenceArt, edgeHit, TW, TH,
    cardFace, cardBack, cardArt, CARD_W, CARD_H, NAMES, tokenMarkup, tokenColor, vpBadge, vpIcon, workerMarkup, TYPE_BAND, setCardStyle, getCardStyle: () => cardStyle };
})();
