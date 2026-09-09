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

    clay: `<g stroke="${ink}" stroke-width="1.1">
      <ellipse cx="7.8" cy="16.4" rx="5.4" ry="3.6" fill="var(--art-clay)"/>
      <ellipse cx="16.2" cy="16.8" rx="4.6" ry="3.2" fill="var(--art-clay)"/>
      <ellipse cx="12" cy="10.6" rx="5.2" ry="3.5" fill="var(--art-clay-lt)"/></g>`,

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

    begging: `<path d="M5 10h14l-1.6 9.4a2 2 0 0 1-2 1.6H8.6a2 2 0 0 1-2-1.6z" fill="var(--art-clay)" stroke="${ink}" stroke-width="1.2" stroke-linejoin="round"/>
      <path d="M4 10c1.6-3.4 4.4-5 8-5s6.4 1.6 8 5" fill="none" stroke="${ink}" stroke-width="1.2"/>`,

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

  function icon(key, size, extraClass) {
    const body = ICONS[key];
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
  // Scenes bleed well past their nominal 56×42 so any crop still lands on artwork.
  const SKY = (c) => `<rect x="-34" y="-14" width="124" height="76" fill="${c || 'var(--art-sky)'}"/>`;
  const GROUND = (c) => {
    const col = c || 'var(--art-grass)';
    return `<path d="M-34 22c16-9 28-6 40 1s26 5 40-3 30-6 44 3v39H-34z" fill="${col}" opacity=".45"/>
      <path d="M-34 30c15-9 27-9 39-1s27 6 39-2 27-7 46 3v32H-34z" fill="${col}"/>`;
  };
  const put = (key, x, y, s) => `<g transform="translate(${x} ${y}) scale(${s || 1})">${ICONS[key]}</g>`;

  const SCENES = {
    farmland: () => SKY() + `<path d="M-34 26h124v36H-34z" fill="var(--art-soil)"/>` +
      [30, 36, 42].map((y) => `<path d="M-20 ${y}q16 -3 30 0t30 0 30 0" fill="none" stroke="var(--art-soil-dk)" stroke-width="2.6" stroke-linecap="round"/>`).join('') + put('plow', 16, 6, .9),
    grain_seeds: () => SKY() + GROUND() + put('grain', 12, 6, 1.2) + put('grain', 28, 10, .9),
    farm_expansion: () => SKY() + GROUND() +
      `<path d="M2 18L16 5l14 13z" fill="var(--art-roof)" stroke="${ink}" stroke-width="1.6" stroke-linejoin="round"/>
       <rect x="6" y="17" width="20" height="14" fill="var(--art-wood)" stroke="${ink}" stroke-width="1.6"/>
       <path d="M6 22h20M6 26h20" stroke="var(--art-wood-dk)" stroke-width="1.4"/>` + put('hammer', 30, 5, .9),
    meeting_place: () => SKY() + GROUND() + put('start', 8, 10, 1) + put('person', 30, 8, .95),
    lessons: () => SKY() + GROUND() + put('book', 6, 8, 1.1) + put('person', 32, 9, .9),
    day_laborer: () => SKY() + GROUND() + put('person', 6, 8, 1) + put('food', 30, 12, 1),
    forest: () => SKY() + GROUND('var(--art-grass-dk)') + put('tree', 2, 4, 1.1) + put('tree', 20, 8, .95) + put('tree', 36, 5, 1.05),
    clay_pit: () => SKY() + `<path d="M-34 28h124v34H-34z" fill="var(--art-soil-dk)"/>` + put('clay', 8, 10, 1.2) + put('clay', 28, 14, .85),
    reed_bank: () => SKY() + `<path d="M-34 32h124v30H-34z" fill="var(--art-water)"/>` + put('reed', 8, 6, 1.2) + put('reed', 28, 9, 1),
    fishing: () => SKY() + `<path d="M-34 24h124v38H-34z" fill="var(--art-water)"/>` + put('fish', 8, 10, 1.1) + put('fish', 30, 18, .75),
    major: () => SKY() + GROUND() + `<path d="M10 28h30l-4-16H14z" fill="var(--art-clay)" stroke="${ink}" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="M18 24c1-4 3-5 3-8 2 2 4 3 4 6s-2 4-3.4 4z" fill="var(--art-food)" stroke="${ink}" stroke-width="1.2"/>`,
    sheep_market: () => SKY() + GROUND('var(--art-pasture)') + put('sheep', 6, 8, 1.15) + put('sheep', 28, 12, .85),
    pig_market: () => SKY() + GROUND('var(--art-pasture)') + put('boar', 6, 8, 1.15) + put('boar', 28, 12, .85),
    cattle_market: () => SKY() + GROUND('var(--art-pasture)') + put('cattle', 4, 8, 1.15) + put('cattle', 28, 12, .8),
    fencing: () => SKY() + GROUND('var(--art-pasture)') +
      `<g>${[6, 24, 42].map((x) => `<rect x="${x}" y="9" width="5" height="20" rx="2" fill="var(--art-fence-dk)" stroke="${ink}" stroke-width="1.3"/>`).join('')}
      <rect x="4" y="12" width="44" height="5" rx="2.5" fill="var(--art-fence)" stroke="${ink}" stroke-width="1.3"/>
      <rect x="4" y="22" width="44" height="5" rx="2.5" fill="var(--art-fence)" stroke="${ink}" stroke-width="1.3"/></g>`,
    grain_util: () => SKY() + GROUND() + put('grain', 4, 8, 1.1) + put('food', 28, 12, 1.1),
    family_growth: () => SKY() + GROUND() + put('person', 2, 8, 1) + put('person', 22, 10, .85) + put('person', 38, 16, .6),
    renovation: () => SKY() + GROUND() +
      `<path d="M4 20L18 6l14 14z" fill="var(--art-roof)" stroke="${ink}" stroke-width="1.6" stroke-linejoin="round"/>
       <rect x="8" y="19" width="20" height="13" fill="var(--art-clay)" stroke="${ink}" stroke-width="1.6"/>` + put('hammer', 32, 4, .85),
    west_quarry: () => SKY() + `<path d="M-34 28h124v34H-34z" fill="var(--art-stone-lt)"/>` + put('stone', 6, 10, 1.2) + put('stone', 28, 14, .85),
    veg_seeds: () => SKY() + GROUND() + put('veg', 10, 6, 1.2) + put('veg', 28, 12, .85),
    cultivation: () => SKY() + `<path d="M-34 26h124v36H-34z" fill="var(--art-soil)"/>` + put('plow', 4, 8, .95) + put('grain', 30, 8, 1),
    urgent_growth: () => SKY() + GROUND() + put('person', 4, 6, 1.15) + put('person', 30, 16, .7),
    farm_redev: () => SKY() + GROUND() +
      `<path d="M2 20L16 6l14 14z" fill="var(--art-roof)" stroke="${ink}" stroke-width="1.6" stroke-linejoin="round"/>
       <rect x="6" y="19" width="20" height="13" fill="var(--art-stone)" stroke="${ink}" stroke-width="1.6"/>
       <rect x="34" y="10" width="4" height="20" rx="2" fill="var(--art-fence-dk)" stroke="${ink}" stroke-width="1.2"/>
       <rect x="46" y="10" width="4" height="20" rx="2" fill="var(--art-fence-dk)" stroke="${ink}" stroke-width="1.2"/>
       <rect x="32" y="14" width="20" height="4" rx="2" fill="var(--art-fence)" stroke="${ink}" stroke-width="1.2"/>`,
  };
  SCENES.east_quarry = SCENES.west_quarry;

  // A scene scaled into an arbitrary box, cropped rather than letterboxed.
  function scene(id, x, y, w, h) {
    const f = SCENES[id] || (() => SKY() + GROUND());
    return `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="-24 -2 100 56" preserveAspectRatio="xMidYMid slice">${f()}</svg>`;
  }

  // A parchment name plate, the kind printed on a board space.
  function plate(x, y, w, h, main, sub) {
    return `<g transform="translate(${x} ${y})">
      <rect width="${w}" height="${h}" rx="5" fill="var(--art-plate)" stroke="${ink}" stroke-width="1.5" opacity=".95"/>
      <text class="plate-main" x="9" y="${sub ? 16 : h / 2 + 5}">${main}</text>
      ${sub ? `<text class="plate-sub" x="9" y="${h - 7}">${sub}</text>` : ''}</g>`;
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

  function seal(n, x, y, r) {
    return `<g transform="translate(${x} ${y})">
      <circle r="${r}" fill="var(--art-seal)" stroke="${ink}" stroke-width="1.6"/>
      <text class="sealnum" y="${r * 0.36}" font-size="${r * 1.15}">${n}</text></g>`;
  }

  function spaceArt(id) {
    const f = SCENES[id];
    return `<svg class="spaceart" viewBox="0 0 56 42" width="56" height="42" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${f ? f() : SKY() + GROUND()}</svg>`;
  }

  function meeple(colorVar, size) {
    return `<svg class="meeple" viewBox="0 0 24 24" width="${size || 16}" height="${size || 16}" style="color:${colorVar}" aria-hidden="true">${ICONS.person}</svg>`;
  }

  return { ICONS, icon, spaceArt, scene, plate, token, board, slot, seal, meeple,
    grassTile, fieldTile, houseTile, stableArt, animalsArt, fenceArt, edgeHit, TW, TH };
})();
