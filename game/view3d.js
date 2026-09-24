// Agricola — the whole game as one 3D table.
//
// Everything that is a physical component in the box lives here: the action board and its
// spaces, both players' farmyards, the goods piled on accumulation spaces, played cards,
// the major improvement strip, and the hand you are holding. The DOM keeps only the HUD
// (status, prompt, log, menus), floating over the canvas.
//
// Board art is reused from art.js: each printed face is rendered to an SVG and baked into
// a CanvasTexture, then laid on real geometry, so text stays crisp while pieces cast shadows.
// Clicks are raycast and routed back through the same engine functions the DOM used.
const View3D = (function () {
  const T = window.THREE;
  const TILE = 1;                  // one farmyard space = one world unit
  const BOARD_Y = 0.06;            // top surface of a board
  const CARD_W = 1.0, CARD_H = 1.4;

  // Where each component sits on the table, packed the way people actually play: the action
  // board in the middle, your farm tucked right under its left half and the major
  // improvements under its right half, your supply and played cards in front of those.
  // The other seat is the same arrangement turned round on the far side.
  const LAYOUT = {
    board: { x: 0, z: -3.6 },                                   // spans z -6.2 … -1.0
    majors: { x: 3.0, z: 1.05 },                                // world; beside your farm
    seat: [{ x: 0, z: 1.0, rot: 0 }, { x: 0, z: -8.2, rot: Math.PI }],
    farm: { x: -3.0, z: 0 },                                    // seat-local
    plate: { x: -4.4, z: 1.98 },                                // seat-local
    supply: { x: -3.0, z: 2.95 },                               // seat-local
    // Seat 0 lays played cards in front of the majors; seat 1 has no majors beside it,
    // so its cards take that spot instead.
    played: [{ x: 0.9, z: 3.2 }, { x: 0.9, z: -0.35 }],        // seat-local, first card
  };
  const MAJ_W = 0.95, MAJ_H = 1.33;

  let renderer, scene, camera, raycaster, host, canvas;
  let root, tableGroup, handGroup, pickables = [], hoverables = [];
  let hooks = null, ready = false, theme = '';
  let lastG = null, lastUI = null;
  const texCache = new Map();
  const geoCache = new Map();

  // ---------------------------------------------------------------- helpers
  const VAR_NAMES = ['--art-ink', '--art-grass', '--art-grass-dk', '--art-pasture', '--art-soil',
    '--art-soil-dk', '--art-wood', '--art-wood-lt', '--art-wood-dk', '--art-clay', '--art-clay-lt',
    '--art-stone', '--art-stone-lt', '--art-reed', '--art-reed-dk', '--art-grain', '--art-veg',
    '--art-food', '--art-sheep', '--art-sheep-face', '--art-boar', '--art-cattle', '--art-cattle-spot',
    '--art-roof', '--art-window', '--art-stable-door', '--art-fence', '--art-fence-dk', '--art-tree',
    '--art-water', '--art-sky', '--art-plate', '--art-token', '--art-count', '--art-frame',
    '--art-boardface', '--art-slot', '--art-seal', '--art-edge', '--art-board', '--art-table', '--art-mat',
    '--occ-frame', '--occ-tint', '--occ-ink', '--min-frame', '--min-tint', '--min-ink',
    '--maj-frame', '--maj-tint', '--maj-ink', '--rnd-frame', '--rnd-tint', '--rnd-ink',
    '--bg', '--panel', '--ink', '--muted', '--accent', '--p1', '--p2'];

  function cssVars() {
    const cs = getComputedStyle(document.documentElement);
    const out = {};
    for (const name of VAR_NAMES) out[name] = cs.getPropertyValue(name).trim() || '#888';
    return out;
  }

  // SVG loaded through <img> has no access to the page's custom properties, so bake them in.
  function resolveVars(svg) {
    const v = cssVars();
    return svg.replace(/var\((--[a-z0-9-]+)\)/gi, (m, name) => v[name] || '#888');
  }

  function col(name) { return new T.Color(cssVars()[name] || '#888'); }

  // The grain filter lives in the page; a texture SVG has to carry its own copy.
  const GRAIN_DEF = `<defs><filter id="grain" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" result="n"/>
    <feColorMatrix in="n" type="saturate" values="0"/>
    <feComponentTransfer><feFuncA type="linear" slope="0.16"/></feComponentTransfer></filter></defs>`;

  function svgTexture(key, svg, w, h) {
    const k = theme + '|' + key;
    if (texCache.has(k)) return texCache.get(k);
    const cv = document.createElement('canvas');
    cv.width = w || 256; cv.height = h || w || 256;
    const tex = new T.CanvasTexture(cv);
    tex.colorSpace = T.SRGBColorSpace;
    tex.anisotropy = 8;
    const img = new Image();
    img.onload = () => {
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      tex.needsUpdate = true;
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(resolveVars(svg));
    texCache.set(k, tex);
    return tex;
  }

  function geo(key, make) {
    if (!geoCache.has(key)) geoCache.set(key, make());
    return geoCache.get(key);
  }

  // Every component gets the finish the cards have: a satin base with a thin clear coat, so
  // pieces, tiles and printed boards all catch the lamp and the room the same way.
  const GLOSS = { roughness: 0.46, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.36 };
  const mat = (color, opts) => new T.MeshPhysicalMaterial(Object.assign({
    color: color instanceof T.Color ? color : new T.Color(color),
  }, GLOSS, opts || {}));
  const printMat = (map, opts) => new T.MeshPhysicalMaterial(Object.assign({ map }, GLOSS, opts || {}));

  function box(w, h, d, color, x, y, z) {
    const m = new T.Mesh(geo(`b${w}_${h}_${d}`, () => new T.BoxGeometry(w, h, d)), mat(color));
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  // ---------------------------------------------------------------- wooden pieces
  function meepleGeometry() {
    return geo('meeple', () => {
      const s = new T.Shape();
      s.moveTo(0, 0.62); s.absarc(0, 0.62, 0.2, 0, Math.PI * 2, false);
      const body = new T.Shape();
      body.moveTo(-0.16, 0.5);
      body.lineTo(-0.52, 0.16); body.lineTo(-0.6, -0.06); body.lineTo(-0.3, 0.04);
      body.lineTo(-0.3, -0.34); body.lineTo(-0.5, -0.62); body.lineTo(-0.14, -0.62);
      body.lineTo(0, -0.36); body.lineTo(0.14, -0.62); body.lineTo(0.5, -0.62);
      body.lineTo(0.3, -0.34); body.lineTo(0.3, 0.04); body.lineTo(0.6, -0.06);
      body.lineTo(0.52, 0.16); body.lineTo(0.16, 0.5); body.closePath();
      const g = new T.ExtrudeGeometry([body, s], { depth: 0.22, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
      g.center();
      return g;
    });
  }

  // Standing upright, feet on the board, so it casts a proper shadow.
  function meeple(colorHex, scale) {
    const m = new T.Mesh(meepleGeometry(), mat(colorHex, { roughness: 0.34, clearcoat: 0.5 }));
    const s = (scale || 1) * 0.4;
    m.scale.set(s, s, s);
    m.position.y = 0.62 * s;
    m.castShadow = true;
    return m;
  }

  function houseMesh(kind) {
    const g = new T.Group();
    const wall = { wood: '--art-wood', clay: '--art-clay', stone: '--art-stone' }[kind] || '--art-wood';
    g.add(box(0.74, 0.42, 0.66, col(wall), 0, 0.21, 0));
    const roof = new T.Mesh(geo('roof', () => new T.ConeGeometry(0.62, 0.34, 4)), mat(col('--art-roof')));
    roof.position.y = 0.59; roof.rotation.y = Math.PI / 4; roof.castShadow = true;
    g.add(roof);
    g.add(box(0.18, 0.26, 0.04, col('--art-stable-door'), 0, 0.13, 0.34));
    g.add(box(0.14, 0.12, 0.03, col('--art-window'), -0.24, 0.3, 0.34));
    g.add(box(0.14, 0.12, 0.03, col('--art-window'), 0.24, 0.3, 0.34));
    return g;
  }

  function stableMesh() {
    const g = new T.Group();
    g.add(box(0.42, 0.24, 0.38, col('--art-wood-dk'), 0, 0.12, 0));
    const roof = new T.Mesh(geo('sroof', () => new T.ConeGeometry(0.36, 0.2, 4)), mat(col('--art-roof')));
    roof.position.y = 0.33; roof.rotation.y = Math.PI / 4; roof.castShadow = true;
    g.add(roof);
    return g;
  }

  function cropMesh(kind) {
    const g = new T.Group();
    if (kind === 'grain') {
      for (let i = 0; i < 3; i++) {
        const stalk = new T.Mesh(geo('stalk', () => new T.CylinderGeometry(0.012, 0.016, 0.26, 5)), mat(col('--art-reed-dk')));
        stalk.position.set((i - 1) * 0.09, 0.13, 0);
        g.add(stalk);
        const ear = new T.Mesh(geo('ear', () => new T.SphereGeometry(0.05, 8, 6)), mat(col('--art-grain')));
        ear.scale.set(0.7, 1.5, 0.7);
        ear.position.set((i - 1) * 0.09, 0.29, 0);
        ear.castShadow = true;
        g.add(ear);
      }
    } else {
      const root = new T.Mesh(geo('carrot', () => new T.ConeGeometry(0.075, 0.24, 8)), mat(col('--art-veg')));
      root.position.y = 0.12; root.rotation.x = Math.PI; root.castShadow = true;
      g.add(root);
      const top = new T.Mesh(geo('carrottop', () => new T.SphereGeometry(0.09, 8, 6)), mat(col('--art-reed')));
      top.scale.set(1, 0.6, 1); top.position.y = 0.27;
      g.add(top);
    }
    return g;
  }

  function animalMesh(kind) {
    const g = new T.Group();
    const legMat = mat(col('--art-ink'));
    const legGeo = geo('leg', () => new T.CylinderGeometry(0.022, 0.022, 0.12, 5));
    const legs = kind === 'cattle' ? 0.13 : 0.1;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      const l = new T.Mesh(legGeo, legMat);
      l.position.set(sx * 0.08, 0.06, sz * legs);
      g.add(l);
    });
    const bodyGeo = geo('animalbody', () => new T.SphereGeometry(0.16, 12, 10));
    if (kind === 'sheep') {
      const b = new T.Mesh(bodyGeo, mat(col('--art-sheep'), { roughness: 0.6 }));
      b.scale.set(1, 0.9, 1.25); b.position.y = 0.2; b.castShadow = true; g.add(b);
      const h = new T.Mesh(geo('head', () => new T.SphereGeometry(0.075, 10, 8)), mat(col('--art-sheep-face')));
      h.position.set(0, 0.25, 0.21); h.castShadow = true; g.add(h);
    } else if (kind === 'boar') {
      const b = new T.Mesh(bodyGeo, mat(col('--art-boar')));
      b.scale.set(0.92, 0.8, 1.4); b.position.y = 0.18; b.castShadow = true; g.add(b);
      const snout = new T.Mesh(geo('snout', () => new T.ConeGeometry(0.06, 0.14, 8)), mat(col('--art-boar')));
      snout.position.set(0, 0.2, 0.27); snout.rotation.x = Math.PI / 2; g.add(snout);
    } else {
      const b = new T.Mesh(bodyGeo, mat(col('--art-cattle')));
      b.scale.set(1.05, 0.95, 1.45); b.position.y = 0.22; b.castShadow = true; g.add(b);
      const h = new T.Mesh(geo('cowhead', () => new T.SphereGeometry(0.085, 10, 8)), mat(col('--art-cattle')));
      h.position.set(0, 0.28, 0.26); h.castShadow = true; g.add(h);
      const patchMat = mat(col('--art-cattle-spot'));
      [[0.11, 0.28, -0.02], [-0.1, 0.24, 0.12], [0.02, 0.3, -0.16]].forEach(([px, py, pz]) => {
        const patch = new T.Mesh(geo('patch', () => new T.SphereGeometry(0.06, 8, 6)), patchMat);
        patch.position.set(px, py, pz);
        patch.scale.set(1, 0.6, 1.1);
        g.add(patch);
      });
      [-1, 1].forEach((s) => {
        const horn = new T.Mesh(geo('horn', () => new T.ConeGeometry(0.022, 0.09, 6)), mat(col('--art-plate')));
        horn.position.set(s * 0.07, 0.36, 0.24); horn.rotation.z = s * 0.5; g.add(horn);
      });
    }
    return g;
  }

  function fencePiece(horizontal) {
    const g = new T.Group();
    const c = col('--art-fence'), cd = col('--art-fence-dk');
    const len = TILE * 0.98;
    const rail = (y) => (horizontal ? box(len, 0.05, 0.05, c, 0, y, 0) : box(0.05, 0.05, len, c, 0, y, 0));
    g.add(rail(0.14)); g.add(rail(0.26));
    [-1, 1].forEach((s) => {
      g.add(box(0.09, 0.34, 0.09, cd, horizontal ? s * len / 2 : 0, 0.17, horizontal ? 0 : s * len / 2));
    });
    return g;
  }

  // A single unit of goods, as the wooden bit it would be in the box.
  function goodsMesh(kind) {
    if (kind === 'sheep' || kind === 'boar' || kind === 'cattle') {
      const a = animalMesh(kind);
      a.scale.setScalar(0.62);
      return a;
    }
    const g = new T.Group();
    if (kind === 'wood') {
      const log = new T.Mesh(geo('log', () => new T.CylinderGeometry(0.07, 0.07, 0.3, 8)), mat(col('--art-wood')));
      log.rotation.z = Math.PI / 2; log.position.y = 0.07; log.castShadow = true;
      g.add(log);
    } else if (kind === 'clay') {
      g.add(box(0.26, 0.12, 0.15, col('--art-clay'), 0, 0.06, 0));
    } else if (kind === 'reed') {
      for (let i = 0; i < 4; i++) {
        const r = new T.Mesh(geo('reedstalk', () => new T.CylinderGeometry(0.018, 0.018, 0.3, 5)), mat(col('--art-reed')));
        r.position.set((i - 1.5) * 0.045, 0.15, (i % 2) * 0.03);
        r.rotation.z = (i - 1.5) * 0.06;
        r.castShadow = true;
        g.add(r);
      }
    } else if (kind === 'stone') {
      const s = new T.Mesh(geo('rock', () => new T.IcosahedronGeometry(0.11, 0)), mat(col('--art-stone'), { flatShading: true }));
      s.position.y = 0.09; s.rotation.set(0.5, 0.8, 0.2); s.castShadow = true;
      g.add(s);
    } else if (kind === 'grain') {
      const d = new T.Mesh(geo('disc', () => new T.CylinderGeometry(0.11, 0.11, 0.06, 12)), mat(col('--art-grain')));
      d.position.y = 0.03; d.castShadow = true;
      g.add(d);
    } else if (kind === 'veg') {
      const v = new T.Mesh(geo('vegcone', () => new T.ConeGeometry(0.09, 0.22, 8)), mat(col('--art-veg')));
      v.position.y = 0.11; v.rotation.x = Math.PI; v.castShadow = true;
      g.add(v);
    } else {                                     // food
      const d = new T.Mesh(geo('fooddisc', () => new T.CylinderGeometry(0.1, 0.1, 0.07, 14)), mat(col('--art-food')));
      d.position.y = 0.035; d.castShadow = true;
      g.add(d);
    }
    return g;
  }

  // Goods piled in a loose cluster, with a count plate once there are more than a few.
  const PILE = [[0, 0], [0.24, 0.1], [-0.22, 0.14], [0.1, -0.2], [-0.12, -0.18], [0.3, -0.08],
    [-0.32, -0.02], [0.02, 0.26], [0.22, 0.3], [-0.24, 0.32]];

  function goodsPile(kind, n, opts) {
    const g = new T.Group();
    const o = opts || {};
    const shown = Math.min(n, o.max || 6);
    for (let i = 0; i < shown; i++) {
      const m = goodsMesh(kind);
      m.position.set(PILE[i][0] * (o.spread || 1), 0, PILE[i][1] * (o.spread || 1));
      m.rotation.y = i * 1.1;
      g.add(m);
    }
    if (n > shown || o.alwaysCount) g.add(countPlate(kind, n, o.spread || 1));
    return g;
  }

  const countSvg = (n) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 62 34" width="124" height="68">
    <rect x="1" y="1" width="60" height="32" rx="16" fill="var(--art-count)" stroke="var(--art-ink)" stroke-width="2"/>
    <text x="31" y="24" text-anchor="middle" font-size="20" font-weight="700"
      font-family="-apple-system,sans-serif" fill="var(--art-ink)">${n}</text></svg>`;

  function countPlate(kind, n, spread) {
    const lbl = new T.Mesh(geo('countplate', () => new T.PlaneGeometry(0.42, 0.23)),
      printMat(svgTexture('cnt:' + n, countSvg(n), 124, 68), { transparent: true, depthWrite: false }));
    lbl.rotation.x = -Math.PI / 2;
    lbl.position.set(0.3 * spread, 0.34, 0.34 * spread);
    return lbl;
  }

  const capSvg = (n, cap) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 62 34" width="124" height="68">
    <rect x="1" y="1" width="60" height="32" rx="16" fill="var(--art-plate)" stroke="var(--art-ink)" stroke-width="2"/>
    <text x="31" y="24" text-anchor="middle" font-size="19" font-weight="700"
      font-family="-apple-system,sans-serif" fill="var(--art-ink)">${n}/${cap}</text></svg>`;

  // A pulsing outline drawn as four thin bars, so it reads as a highlight and not a tint.
  const HILITE = 0xffcf4d;
  function outline(w, d, y, colour, thickness) {
    const g = new T.Group();
    const t = thickness || 0.05;
    const m = new T.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false });
    const bar = (bw, bd, x, z) => {
      const b = new T.Mesh(new T.BoxGeometry(bw, 0.02, bd), m);
      b.position.set(x, y, z);
      return b;
    };
    g.add(bar(w, t, 0, -d / 2), bar(w, t, 0, d / 2), bar(t, d, -w / 2, 0), bar(t, d, w / 2, 0));
    g.userData.pulse = true;
    g.traverse((o) => { if (o.material) o.userData.pulse = true; });
    return g;
  }

  // ---------------------------------------------------------------- cards
  const cardKey = (c, sig) => `card:${c.uid || c.en}:${sig}`;

  function cardTexture(c, opts) {
    const o = opts || {};
    const sig = [costText(o.cost), o.taken || '', o.note || ''].join('|');
    return svgTexture(cardKey(c, sig), ART.cardFace(c, o), 320, 448);
  }

  function backTexture(kind) {
    return svgTexture('back:' + kind, ART.cardBack(kind).replace('</svg>', GRAIN_DEF + '</svg>'), 160, 224);
  }

  // A card as a physical object: a thin slab with the printed face on top.
  function cardMesh(face, w, h, opts) {
    const o = opts || {};
    const edge = mat(col('--art-plate'));
    const top = o.unlit
      ? new T.MeshBasicMaterial({ map: face, toneMapped: false })
      : printMat(face);
    const back = mat(col('--art-frame'));
    const m = new T.Mesh(geo(`card${w}_${h}`, () => new T.BoxGeometry(w, 0.018, h)),
      [edge, edge, top, back, edge, edge]);
    m.castShadow = !o.unlit;
    m.receiveShadow = !o.unlit;
    return m;
  }

  // ---------------------------------------------------------------- action board
  // The printed 1–2 player board, in its own pixel space, then scaled onto the table.
  const SM = { w: 210, h: 108, gap: 8, pad: 14, rows: 6 };
  const BG = { w: 180, h: 130, gap: 8, pad: 14, rows: 5, cols: 7 };
  const BOARD_GAP = 18;
  const SM_W = SM.pad * 2 + SM.w;
  const SM_H = SM.pad * 2 + SM.rows * SM.h + (SM.rows - 1) * SM.gap;
  const BG_W = BG.pad * 2 + BG.cols * BG.w + (BG.cols - 1) * BG.gap;
  const BG_H = BG.pad * 2 + BG.rows * BG.h + (BG.rows - 1) * BG.gap;
  const PX_W = SM_W + BOARD_GAP + BG_W, PX_H = Math.max(SM_H, BG_H);
  const BOARD_WORLD_W = 11.4;
  const PS = BOARD_WORLD_W / PX_W;                 // pixels → world units
  const bx = (px) => (px - PX_W / 2) * PS;
  const bz = (py) => (py - PX_H / 2) * PS;
  const STAGE_OF = {};
  ROUND_SPACES.forEach((d) => { STAGE_OF[d.id] = d.stage; });

  // One action space, printed exactly like the DOM board prints it.
  function spaceTexture(G, p, def, w, h) {
    const notes = spaceNotes(G, p, def);
    const plateH = notes.length ? 56 : 34;
    const en = def.zh.length * 17 + def.en.length * 6.4 + 18 < w - 12 ? def.en : '';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * 2}" height="${h * 2}"
      font-family="-apple-system,BlinkMacSystemFont,'PingFang TC','Noto Sans TC',sans-serif">
      ${GRAIN_DEF}
      <style>.plate-main{font-size:17px;font-weight:700;fill:var(--art-ink)}
        .plate-en{font-size:10px;fill:var(--art-ink);opacity:.6}
        .plate-note{font-size:11.5px;fill:var(--art-ink);opacity:.85}</style>
      <rect width="${w}" height="${h}" fill="var(--art-boardface)"/>
      ${ART.scene(def.id, 0, 0, w, h, h - plateH - 6)}
      ${ART.plate(6, h - plateH - 6, w - 12, plateH, def.zh, en, notes)}
      <rect width="${w}" height="${h}" fill="none" stroke="var(--art-ink)" stroke-width="3"/></svg>`;
    return svgTexture(`sp:${def.id}:${notes.join('|')}:${w}`, svg, w * 2, h * 2);
  }

  const slotSvg = (w, h, round, stage) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"
    width="${w * 2}" height="${h * 2}" font-family="-apple-system,sans-serif">
    <rect width="${w}" height="${h}" fill="var(--art-boardface)"/>
    <rect x="5" y="5" width="${w - 10}" height="${h - 10}" rx="9" fill="none" stroke="var(--art-ink)"
      stroke-width="2.4" stroke-dasharray="9 6" opacity=".7"/>
    <text x="${w / 2}" y="${h / 2 - 2}" text-anchor="middle" font-size="19" font-weight="700"
      fill="var(--art-ink)" opacity=".55">Round ${round}</text>
    <text x="${w / 2}" y="${h / 2 + 20}" text-anchor="middle" font-size="13"
      fill="var(--art-ink)" opacity=".4">Stage ${stage}</text></svg>`;

  const harvestSvg = (w, h, after) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"
    width="${w * 2}" height="${h * 2}" font-family="-apple-system,sans-serif">
    <rect width="${w}" height="${h}" rx="9" fill="var(--rnd-tint)" stroke="var(--art-ink)" stroke-width="2.4"/>
    <g transform="translate(${w / 2 - 54} ${h / 2 - 28}) scale(1.3)">${ART.ICONS.grain}</g>
    <text x="${w / 2 + 14}" y="${h / 2 - 4}" text-anchor="middle" font-size="19" font-weight="700" fill="var(--rnd-ink)">Harvest</text>
    <text x="${w / 2}" y="${h / 2 + 26}" text-anchor="middle" font-size="15" font-weight="600" fill="var(--rnd-ink)">第 ${after} 回合後收成</text></svg>`;

  // A flat printed plate lying on the board face.
  function plateMesh(tex, w, h, x, z, y) {
    const m = new T.Mesh(geo(`plate${w.toFixed(3)}_${h.toFixed(3)}`, () => new T.BoxGeometry(w, 0.02, h)),
      [mat(col('--art-frame')), mat(col('--art-frame')),
        printMat(tex),
        mat(col('--art-frame')), mat(col('--art-frame')), mat(col('--art-frame'))]);
    m.position.set(x, y == null ? BOARD_Y : y, z);
    m.receiveShadow = true;
    return m;
  }

  // The wooden frame a board is printed on.
  function boardSlab(wpx, hpx, cxpx, cypx) {
    const g = new T.Group();
    const w = wpx * PS, d = hpx * PS;
    const frame = box(w, 0.1, d, col('--art-frame'), 0, 0, 0);
    frame.receiveShadow = true;
    g.add(frame);
    const face = box(w - 0.14, 0.02, d - 0.14, col('--art-boardface'), 0, 0.05, 0);
    face.receiveShadow = true;
    g.add(face);
    g.position.set(bx(cxpx), 0, bz(cypx));
    return g;
  }

  function buildActionBoard(G, UI) {
    const g = new T.Group();
    const p = G.players[UI.view] || G.players[0];
    const canPick = !G.choice && !G.staging && !currentStep(G) && !G.feeding && !G.over;

    g.add(boardSlab(SM_W, SM_H, SM_W / 2, SM_H / 2));
    g.add(boardSlab(BG_W, BG_H, SM_W + BOARD_GAP + BG_W / 2, BG_H / 2));

    // Every printed space: the art, then anything sitting on top of it.
    const addSpace = (def, xpx, ypx, wpx, hpx) => {
      const sp = G.spaces[def.id];
      const w = wpx * PS, d = hpx * PS;
      const cx = bx(xpx + wpx / 2), cz = bz(ypx + hpx / 2);
      const tile = plateMesh(spaceTexture(G, p, def, wpx, hpx), w, d, cx, cz, BOARD_Y + 0.02);
      tile.userData.pick = { type: 'space', id: def.id };
      tile.userData.hover = { kind: 'space', id: def.id };
      g.add(tile);
      hoverables.push(tile);

      const free = canPlace(G, def.id);
      if (free && canPick) {
        pickables.push(tile);
        g.add(outline(w * 0.97, d * 0.97, BOARD_Y + 0.05, HILITE, 0.045)
          .translateX(cx).translateZ(cz));
      }

      // Goods that have accumulated, piled in the free corner of the space.
      const kinds = Object.keys(sp.goods).filter((k) => sp.goods[k] > 0);
      kinds.forEach((k, i) => {
        const pile = goodsPile(k, sp.goods[k], { spread: 0.52, max: 5, alwaysCount: sp.goods[k] > 1 });
        pile.position.set(cx - w / 2 + 0.3 + i * 0.6, BOARD_Y + 0.04, cz - d / 2 + 0.28);
        pile.scale.setScalar(0.78);
        g.add(pile);
      });

      // Whoever took the space stands on it.
      if (sp.occupiedBy !== null) {
        const m = meeple(col(sp.occupiedBy === 0 ? '--p1' : '--p2'), 0.95);
        m.position.set(cx + w / 2 - 0.26, BOARD_Y + 0.04, cz - d / 2 + 0.24);
        g.add(m);
        const dim = new T.Mesh(geo(`dim${w.toFixed(3)}_${d.toFixed(3)}`, () => new T.PlaneGeometry(w, d)),
          new T.MeshBasicMaterial({ color: col('--art-ink'), transparent: true, opacity: 0.28, depthWrite: false }));
        dim.rotation.x = -Math.PI / 2;
        dim.position.set(cx, BOARD_Y + 0.035, cz);
        g.add(dim);
      }
    };

    BOARD_LAYOUT.small.forEach((id, i) => {
      addSpace(spaceDef(id), SM.pad, SM.pad + i * (SM.h + SM.gap), SM.w, SM.h);
    });

    const ox = SM_W + BOARD_GAP;
    const cellX = (c) => ox + BG.pad + c * (BG.w + BG.gap);
    const cellY = (r) => BG.pad + r * (BG.h + BG.gap);

    BOARD_LAYOUT.roundCols.forEach((rounds, c) => {
      rounds.forEach((n, r) => {
        const id = G.roundOrder[n - 1];
        if (G.spaces[id].revealed) {
          addSpace(spaceDef(id), cellX(c), cellY(r), BG.w, BG.h);
        } else {
          const tex = svgTexture(`slot:${n}`, slotSvg(BG.w, BG.h, n, STAGE_OF[id]), BG.w * 2, BG.h * 2);
          g.add(plateMesh(tex, BG.w * PS, BG.h * PS, bx(cellX(c) + BG.w / 2), bz(cellY(r) + BG.h / 2), BOARD_Y + 0.005));
        }
      });
      if (c > 0) {
        const after = rounds[rounds.length - 1];
        const done = G.round > after || (G.round === after && G.phase !== 'work');
        const tex = svgTexture(`harv:${after}`, harvestSvg(BG.w, BG.h, after), BG.w * 2, BG.h * 2);
        const m = plateMesh(tex, BG.w * PS, BG.h * PS, bx(cellX(c) + BG.w / 2), bz(cellY(rounds.length) + BG.h / 2), BOARD_Y + 0.02);
        if (done) m.material[2].opacity = 0.45, m.material[2].transparent = true;
        g.add(m);
      }
    });

    BOARD_LAYOUT.accum.forEach((id, i) => {
      addSpace(spaceDef(id), cellX(0), cellY(i + 1), BG.w, BG.h);
    });

    g.position.set(LAYOUT.board.x, 0, LAYOUT.board.z);
    return g;
  }

  // ---------------------------------------------------------------- farmyard
  function tileTexture(p, i, inPasture) {
    const t = p.farm[i];
    let key, svg;
    if (t.kind === 'field') { key = 'field'; svg = ART.fieldTile(i, null); }
    else if (t.kind === 'room') { key = 'grass' + (i % 4); svg = ART.grassTile(i, false); }
    else { key = (inPasture ? 'past' : 'grass') + (i % 4); svg = ART.grassTile(i, inPasture); }
    return svgTexture('tile' + key, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ART.TW} ${ART.TH}" width="128" height="128" preserveAspectRatio="none">${svg}</svg>`, 128, 128);
  }

  function tilePos(i) {
    const r = Math.floor(i / 5), c = i % 5;
    return { x: (c - 2) * TILE, z: (r - 1) * TILE };
  }

  // `live` — this farm accepts clicks (it belongs to the player who is acting).
  function buildFarmBoard(G, UI, pi, live) {
    const p = G.players[pi];
    const regs = regions(p);
    const g = new T.Group();

    const slab = box(5 * TILE + 0.34, 0.12, 3 * TILE + 0.34, col('--art-frame'), 0, 0, 0);
    slab.receiveShadow = true;
    g.add(slab);

    for (let i = 0; i < 15; i++) {
      const { x, z } = tilePos(i);
      const t = p.farm[i];
      const reg = regionOf(p, i, regs);
      const inPasture = !!(reg && reg.enclosed);

      const top = new T.Mesh(geo('tiletop', () => new T.BoxGeometry(TILE * 0.99, 0.03, TILE * 0.99)),
        printMat(tileTexture(p, i, inPasture), { roughness: 0.55, clearcoat: 0.15 }));
      top.position.set(x, BOARD_Y, z);
      top.receiveShadow = true;
      top.userData.pick = { type: 'tile', i, pi };
      g.add(top);
      if (live) pickables.push(top);

      if (t.kind === 'room') {
        const h = houseMesh(p.house);
        h.position.set(x, BOARD_Y + 0.015, z);
        g.add(h);
        const roomOrder = p.farm.reduce((n, q, j) => n + (j < i && q.kind === 'room' ? 1 : 0), 0);
        const pet = p.pets[roomOrder];
        if (pet) {
          const a = animalMesh(pet.kind);
          a.position.set(x + 0.34, BOARD_Y + 0.015, z + 0.34);
          a.scale.setScalar(0.7);
          g.add(a);
        }
      }
      if (t.kind === 'field' && t.crop) {
        for (let k = 0; k < Math.min(t.crop.n, 3); k++) {
          const c = cropMesh(t.crop.kind);
          c.scale.setScalar(1.35);
          c.position.set(x + (k - 1) * 0.28, BOARD_Y + 0.015, z + (k % 2 ? 0.16 : -0.16));
          g.add(c);
        }
      }
      if (t.kind === 'empty' && t.stable) {
        const s = stableMesh();
        s.position.set(x + (t.animals ? 0.28 : 0), BOARD_Y + 0.015, z - 0.22);
        g.add(s);
      }
      if (t.animals && t.animals.n) {
        const spots = [[-0.24, -0.2], [0.22, -0.18], [-0.18, 0.22], [0.24, 0.2], [0, 0]];
        for (let k = 0; k < Math.min(t.animals.n, 5); k++) {
          const a = animalMesh(t.animals.kind);
          a.position.set(x + spots[k][0], BOARD_Y + 0.015, z + spots[k][1]);
          a.rotation.y = (k * 1.3) % (Math.PI * 2);
          g.add(a);
        }
      }
    }

    for (const reg of regs) {
      if (!reg.enclosed) continue;
      const first = Math.min.apply(null, reg.tiles);
      const { x, z } = tilePos(first);
      const lbl = new T.Mesh(geo('caplbl', () => new T.PlaneGeometry(0.8, 0.44)),
        printMat(svgTexture('cap:' + reg.count + '/' + reg.capacity, capSvg(reg.count, reg.capacity), 124, 68), { transparent: true, depthWrite: false }));
      lbl.rotation.x = -Math.PI / 2;
      lbl.position.set(x, BOARD_Y + 0.09, z - 0.28);
      g.add(lbl);
    }

    for (const e of Object.keys(p.fences)) {
      const [k, a, b] = e.split(':');
      const r = +a, c = +b;
      const f = fencePiece(k === 'h');
      if (k === 'h') f.position.set((c - 2) * TILE, BOARD_Y, (r - 1.5) * TILE);
      else f.position.set((c - 2.5) * TILE, BOARD_Y, (r - 1) * TILE);
      g.add(f);
    }

    if (!live) return g;

    const acting = G.players[G.current];
    const step = currentStep(G);
    const canPickTile = (i) => {
      if (G.choice) return false;
      if (G.staging) return p === acting && canPlaceAnimal(G, i);
      if (p !== acting) return false;
      if (step === 'plow') return canPlow(p, i);
      if (step === 'build') return UI.buildKind === 'room' ? canBuildRoom(p, i) : canBuildStable(p, i);
      if (step === 'cottager') return canBuildRoom(p, i);
      if (step === 'freestable') return canBuildStable(p, i);
      if (step === 'minipasture') return p.farm[i].kind === 'empty';
      if (step === 'sow') return canSow(p, i);
      return false;
    };
    for (let i = 0; i < 15; i++) {
      if (!canPickTile(i)) continue;
      const { x, z } = tilePos(i);
      const o = outline(TILE * 0.94, TILE * 0.94, BOARD_Y + 0.05, HILITE, 0.09);
      o.position.set(x, 0, z);
      g.add(o);
    }

    if (step === 'fences' && p === acting) {
      const fresh = (G.pending && G.pending.data.placed) || [];
      for (const e of allEdges()) {
        const on = !!p.fences[e];
        if (on && !fresh.includes(e)) continue;
        if (!on && (fenceCount(p) >= 15 || p.supply.wood < 1)) continue;
        const [k, a, b] = e.split(':');
        const r = +a, c = +b;
        const hit = new T.Mesh(
          k === 'h' ? geo('ehH', () => new T.BoxGeometry(TILE * 0.9, 0.3, 0.22))
            : geo('ehV', () => new T.BoxGeometry(0.22, 0.3, TILE * 0.9)),
          new T.MeshBasicMaterial({ color: on ? col('--maj-frame') : HILITE, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false }));
        if (k === 'h') hit.position.set((c - 2) * TILE, BOARD_Y + 0.16, (r - 1.5) * TILE);
        else hit.position.set((c - 2.5) * TILE, BOARD_Y + 0.16, (r - 1) * TILE);
        hit.userData.pick = { type: 'edge', e };
        hit.userData.pulse = true;
        g.add(hit);
        pickables.push(hit);
      }
    }
    return g;
  }

  // ---------------------------------------------------------------- a player's seat
  const nameSvg = (name, sub, colour) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 60"
    width="520" height="120" font-family="-apple-system,BlinkMacSystemFont,'PingFang TC',sans-serif">
    <rect x="2" y="2" width="256" height="56" rx="12" fill="var(--art-plate)" stroke="${colour}" stroke-width="3.5"/>
    <text x="18" y="30" font-size="22" font-weight="700" fill="var(--art-ink)">${name}</text>
    <text x="18" y="49" font-size="14" fill="var(--art-ink)" opacity=".7">${sub}</text></svg>`;

  // The supply tray: every kind of goods this player owns, as real pieces in a row.
  function buildSupply(G, pi) {
    const p = G.players[pi];
    const g = new T.Group();
    const kinds = RES.concat(ANIM);
    const tray = box(5.4, 0.08, 1.1, col('--art-slot'), 0, 0, 0);
    tray.receiveShadow = true;
    g.add(tray);
    kinds.forEach((k, i) => {
      const n = ANIM.includes(k) ? animalTotal(p, k) : p.supply[k];
      const x = -2.45 + i * 0.545;
      const slot = box(0.48, 0.02, 0.9, col('--art-boardface'), x, 0.05, 0);
      g.add(slot);
      // Each slot is printed with the goods it holds, like the recesses on a player mat.
      const icon = new T.Mesh(geo('slotIcon', () => new T.PlaneGeometry(0.44, 0.44)),
        printMat(null, { transparent: true, depthWrite: false, opacity: n ? 0.95 : 0.55,
          map: svgTexture('slot:' + k, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="160" height="160">
            <g transform="translate(6 0) scale(.84)">${ART.ICONS[k] || ''}</g>
            <text x="16" y="29.5" text-anchor="middle" font-size="8" font-weight="700" fill="var(--art-ink)"
              font-family="-apple-system,'PingFang TC',sans-serif">${ART.NAMES[k]}</text></svg>`, 160, 160) }));
      icon.rotation.x = -Math.PI / 2;
      icon.position.set(x, 0.065, -0.2);
      g.add(icon);
      if (!n) return;
      const pile = goodsPile(k, n, { spread: 0.3, max: 3, alwaysCount: true });
      pile.position.set(x, 0.06, 0.24);
      pile.scale.setScalar(0.62);
      g.add(pile);
    });
    return g;
  }

  function buildSeat(G, UI, pi) {
    const g = new T.Group();
    const p = G.players[pi];
    const acting = G.current === pi && !G.over;
    const live = pi === UI.view && (G.staging ? G.current === pi : true);

    const farm = buildFarmBoard(G, UI, pi, live);
    farm.position.set(LAYOUT.farm.x, 0, LAYOUT.farm.z);
    g.add(farm);

    // Name plate at the near edge of the farm, plus the family still to be placed.
    const colour = pi === 0 ? '--p1' : '--p2';
    const sub = `${HOUSE_ZH[p.house]} ${roomCount(p)} 間 · 田 ${fieldCount(p)} · 家庭 ${p.people} 人`;
    const plate = new T.Mesh(geo('nameplate', () => new T.PlaneGeometry(1.9, 0.44)),
      printMat(svgTexture(`name:${pi}:${p.name}:${sub}`, nameSvg(p.name, sub, `var(${colour})`), 520, 120), { transparent: true }));
    plate.rotation.x = -Math.PI / 2;
    plate.position.set(LAYOUT.plate.x, 0.075, LAYOUT.plate.z);
    plate.userData.hover = { kind: 'seat', pi };
    if (pi !== UI.view) {
      plate.userData.pick = { type: 'seat', pi };
      pickables.push(plate);
    }
    g.add(plate);
    hoverables.push(plate);

    for (let i = 0; i < p.people; i++) {
      const m = meeple(col(colour), i < p.workersLeft ? 1 : 0.85);
      m.position.set(LAYOUT.plate.x + 1.35 + i * 0.42, 0.06, LAYOUT.plate.z);
      if (i >= p.workersLeft) { m.rotation.z = Math.PI / 2; m.position.y = 0.12; }
      g.add(m);
    }
    if (acting) {
      g.add(outline(5.6, 3.6, 0.09, col(colour).getHex(), 0.07).translateX(LAYOUT.farm.x).translateZ(LAYOUT.farm.z));
    }

    const supply = buildSupply(G, pi);
    supply.position.set(LAYOUT.supply.x, 0, LAYOUT.supply.z);
    g.add(supply);

    // Cards already in front of this player, five to a row.
    const playedGroup = new T.Group();
    const at = LAYOUT.played[pi];
    p.played.forEach((c, i) => {
      const cx = at.x + (i % 5) * (MAJ_W + 0.11);
      const cz = at.z + Math.floor(i / 5) * (MAJ_H + 0.12);
      const m = cardMesh(cardTexture(c, { cost: {} }), MAJ_W, MAJ_H);
      m.position.set(cx, BOARD_Y - 0.02, cz);
      m.rotation.y = ((i * 37) % 11 - 5) * 0.004;
      m.userData.hover = { kind: 'card', uid: c.uid, pi };
      playedGroup.add(m);
      hoverables.push(m);
    });
    g.add(playedGroup);

    g.position.set(LAYOUT.seat[pi].x, 0, LAYOUT.seat[pi].z);
    g.rotation.y = LAYOUT.seat[pi].rot;
    g.userData.parts = { farm, played: playedGroup };
    return g;
  }

  // ---------------------------------------------------------------- majors on the table
  function buildMajors(G, UI) {
    const g = new T.Group();
    const p = G.players[G.current];
    const kinds = playableNow(G);
    const mine = UI.view === G.current && !G.choice;
    G.majors.forEach((c, i) => {
      const owner = c.taken != null ? G.players[c.taken] : null;
      const cost = cardCost(G, p, c);
      // A 5 × 2 grid, centred on the majors spot.
      const m = cardMesh(cardTexture(c, { cost, taken: owner ? owner.name : '' }), MAJ_W, MAJ_H);
      const cx = ((i % 5) - 2) * (MAJ_W + 0.11);
      const cz = (Math.floor(i / 5) - 0.5) * (MAJ_H + 0.12);
      m.position.set(cx, BOARD_Y - 0.02, cz);
      m.userData.hover = { kind: 'card', uid: c.uid };
      g.add(m);
      hoverables.push(m);
      if (!owner && mine && kinds.includes('maj') && canPay(p, cost)) {
        m.userData.pick = { type: 'card', uid: c.uid };
        pickables.push(m);
        g.add(outline(MAJ_W + 0.07, MAJ_H + 0.07, BOARD_Y + 0.02, HILITE, 0.045).translateX(cx).translateZ(cz));
      }
    });
    g.position.set(LAYOUT.majors.x, 0, LAYOUT.majors.z);
    return g;
  }

  // ---------------------------------------------------------------- the hand you hold
  // Parented to the camera, so it stays in front of you however the table is framed.
  // It only slides up when you can play a card or asked to see it; otherwise it is gone.
  const CARD_STEPS = ['playOcc', 'playMinor', 'playImprovement', 'playAny'];
  function handShown(G, UI) {
    if (UI.handPinned) return true;
    return !G.choice && !G.over && UI.view === G.current && CARD_STEPS.includes(currentStep(G));
  }

  let handY = -2.4;                      // where the fan is right now, kept across rebuilds
  function buildHand(G, UI) {
    const g = new T.Group();
    const shown = handShown(G, UI);
    g.position.set(0, handY, -3.4);
    g.rotation.x = 0.14;
    g.userData.goalY = shown ? -0.96 : -2.4;
    const p = G.players[UI.view];
    if (!p) return g;
    const cards = p.hand.occ.concat(p.hand.min);
    const kinds = playableNow(G);
    const mine = UI.view === G.current && !G.choice;
    const n = cards.length;
    if (!n) return g;

    // A held fan: the middle card sits highest, the outer ones roll away and drop.
    const spread = Math.min(0.1, 0.78 / n);
    const R = 2.9;
    const w = 0.46, h = 0.645;

    cards.forEach((c, i) => {
      const a = (i - (n - 1) / 2) * spread;
      const cost = cardCost(G, p, c);
      const playable = mine && kinds.includes(c.type) && canPay(p, cost);
      const slot = new T.Group();
      slot.position.set(Math.sin(a) * R, (Math.cos(a) - 1) * R * 0.9, i * 0.004);
      slot.rotation.z = -a;

      const m = cardMesh(cardTexture(c, { cost, note: playable ? '可打出' : '' }), w, h, { unlit: true });
      m.rotation.x = Math.PI / 2;      // stand the card up to face the camera
      slot.add(m);


      m.userData.hover = { kind: 'card', uid: c.uid, hand: true };
      if (playable && shown) {
        m.userData.pick = { type: 'card', uid: c.uid };
        pickables.push(m);
      }
      if (playable) {
        // A gold plate just behind the card, so only a thin rim shows round its edge.
        const glow = new T.Mesh(geo('handGlow', () => new T.PlaneGeometry(w + 0.05, h + 0.05)),
          new T.MeshBasicMaterial({ color: HILITE, toneMapped: false }));
        glow.position.z = -0.012;
        slot.add(glow);
        slot.position.y += 0.05;         // playable cards sit a little proud of the fan
      }
      m.userData.hand = { slot, baseY: slot.position.y, rotZ: slot.rotation.z };
      if (shown) hoverables.push(m);
      g.add(slot);
    });
    return g;
  }

  // ---------------------------------------------------------------- camera rig
  const camState = { az: 0, pol: 0.62, dist: 15, target: new T.Vector3(0, 0, -2) };
  const camGoal = { az: 0, pol: 0.62, dist: 15, target: new T.Vector3(0, 0, -2) };
  let camTween = 1;

  function applyCamera() {
    const { az, pol, dist, target } = camState;
    camera.position.set(
      target.x + dist * Math.sin(pol) * Math.sin(az),
      target.y + dist * Math.cos(pol),
      target.z + dist * Math.sin(pol) * Math.cos(az));
    camera.lookAt(target);
  }

  // The HUD covers these fractions of the screen, in NDC units (the full screen is 2 wide):
  // the dock on the left, the log rail on the right, the bars on top, the hand along the bottom.
  // The bottom margin only matters while the hand is up.
  // The bottom keeps room for the action bar, and more for the bar plus the hand.
  const SAFE = { l: 0.20, r: 0.17, t: 0.2, b: 0.3 };
  const SAFE_HAND_B = 0.62;
  let safeB = SAFE.b;

  const FOCUS = {
    // pol is the angle from straight down: ~0.6 reads as leaning over the table.
    table: () => ({ az: 0, pol: 0.62, pad: 1.02, boxes: ['board', 'seat0', 'majors'] }),
    board: () => ({ az: 0, pol: 0.5, pad: 1.0, boxes: ['board'] }),
    farm: (UI) => ({ az: UI.view === 1 ? Math.PI : 0, pol: 0.56, pad: 1.04, boxes: ['farm' + UI.view] }),
    cards: (UI) => ({ az: UI.view === 1 ? Math.PI : 0, pol: 0.52, pad: 1.03,
      boxes: UI.view === 1 ? ['played1'] : ['majors', 'played0'] }),
    majors: () => ({ az: 0, pol: 0.52, pad: 1.03, boxes: ['majors'] }),
  };

  const focusBoxes = {};
  const fitCam = new T.PerspectiveCamera(42, 1.6, 0.1, 200);

  // Frame a box inside the free middle of the screen: project its corners, then slide the
  // target and pull the camera back until the whole thing clears the HUD on every side.
  function fitGoal(box3, pad) {
    const corners = [];
    for (const x of [box3.min.x, box3.max.x])
      for (const y of [box3.min.y, box3.max.y])
        for (const z of [box3.min.z, box3.max.z]) corners.push(new T.Vector3(x, y, z));

    const availW = 2 - SAFE.l - SAFE.r, availH = 2 - SAFE.t - safeB;
    const safeCx = -1 + SAFE.l + availW / 2;
    const safeCy = -1 + safeB + availH / 2;
    const v = new T.Vector3();

    fitCam.fov = camera.fov;
    fitCam.aspect = camera.aspect || 1.6;
    const half = Math.tan(T.MathUtils.degToRad(fitCam.fov) / 2);

    for (let it = 0; it < 7; it++) {
      const { az, pol, dist, target } = camGoal;
      fitCam.position.set(
        target.x + dist * Math.sin(pol) * Math.sin(az),
        target.y + dist * Math.cos(pol),
        target.z + dist * Math.sin(pol) * Math.cos(az));
      fitCam.lookAt(target);
      fitCam.updateProjectionMatrix();
      fitCam.updateMatrixWorld(true);

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const c of corners) {
        v.copy(c).project(fitCam);
        minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
        minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
      }

      const dx = (minX + maxX) / 2 - safeCx;
      const dy = (minY + maxY) / 2 - safeCy;
      // `right` points right on screen but `fwd` points back at the camera, hence the signs:
      // to move content left on screen the camera goes right, and to move it down it goes back.
      const right = new T.Vector3(Math.cos(az), 0, -Math.sin(az));
      const fwd = new T.Vector3(fitCam.position.x - target.x, 0, fitCam.position.z - target.z).normalize();
      camGoal.target.addScaledVector(right, dx * dist * half * fitCam.aspect);
      camGoal.target.addScaledVector(fwd, -dy * dist * half * 0.95);

      const need = Math.max((maxX - minX) / availW, (maxY - minY) / availH) * pad;
      camGoal.dist = Math.max(4, Math.min(44, dist * need));
    }
  }

  function focus(name, UI, snap) {
    const f = (FOCUS[name] || FOCUS.table)(UI || lastUI || { view: 0 });
    const box3 = new T.Box3();
    let any = false;
    for (const key of f.boxes) {
      const b = focusBoxes[key];
      if (b) { box3.union(b); any = true; }
    }
    if (!any) {
      const fb = focusBoxes['farm' + ((UI || lastUI || {}).view || 0)];
      if (!fb) return;
      box3.union(fb);
    }
    const c = box3.getCenter(new T.Vector3());
    camGoal.az = f.az;
    camGoal.pol = f.pol;
    camGoal.target.set(c.x, 0, c.z);
    camGoal.dist = Math.max(box3.getSize(new T.Vector3()).length(), 6);
    fitGoal(box3, f.pad);
    camTween = snap ? 1 : 0;
    if (snap) {
      camState.az = camGoal.az; camState.pol = camGoal.pol;
      camState.dist = camGoal.dist; camState.target.copy(camGoal.target);
      applyCamera();
    }
  }

  function stepCamera(dt) {
    if (camTween >= 1) return false;
    camTween = Math.min(1, camTween + dt / 620);
    const e = camTween < 0.5 ? 4 * camTween ** 3 : 1 - ((-2 * camTween + 2) ** 3) / 2;
    // Take the short way round when swapping to the other side of the table.
    let d = camGoal.az - camState.az;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    camState.az += d * e * 0.35;
    camState.pol += (camGoal.pol - camState.pol) * e * 0.35;
    camState.dist += (camGoal.dist - camState.dist) * e * 0.35;
    camState.target.lerp(camGoal.target, e * 0.35);
    applyCamera();
    return true;
  }

  // ---------------------------------------------------------------- input
  function installControls() {
    let downX = 0, downY = 0;
    canvas.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY; });
    canvas.addEventListener('pointerup', (e) => {
      if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) < 8) pick(e);
    });
    canvas.addEventListener('pointermove', hover);
    canvas.addEventListener('pointerleave', () => setHover(null));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function ndc(e) {
    const rect = canvas.getBoundingClientRect();
    return new T.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1);
  }

  function pick(e) {
    if (!hooks) return;
    raycaster.setFromCamera(ndc(e), camera);
    const hits = raycaster.intersectObjects(pickables, false);
    if (!hits.length) return;
    const d = hits[0].object.userData.pick;
    if (d) hooks.onPick(d);
  }

  let hovered = null;
  function setHover(obj) {
    if (hovered === obj) return;
    if (hovered && hovered.userData.hand) {
      const h = hovered.userData.hand;
      h.slot.position.y = h.baseY;
      h.slot.rotation.z = h.rotZ;
      h.slot.scale.setScalar(1);
    }
    hovered = obj;
    if (obj && obj.userData.hand) {
      const h = obj.userData.hand;
      h.slot.position.y = h.baseY + 0.3;
      h.slot.rotation.z = 0;             // stand it upright; the big preview carries the text
      h.slot.scale.setScalar(1.12);
    }
    canvas.style.cursor = obj && obj.userData.pick ? 'pointer' : 'default';
    if (hooks && hooks.onHover) hooks.onHover(obj ? obj.userData.hover : null);
  }

  function hover(e) {
    if (!hooks) return;
    raycaster.setFromCamera(ndc(e), camera);
    const hits = raycaster.intersectObjects(hoverables, false);
    setHover(hits.length ? hits[0].object : null);
  }

  // ---------------------------------------------------------------- the room around the game
  // A wooden table with a felt play mat on it, lit from above so the light pools on the mat
  // and falls away into a dark room. All of it is painted procedurally, so it follows the theme.
  let envGroup = null;

  // Small seeded generator, so the grain does not change between rebuilds.
  function rng(seed) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }

  function shade(c, dl) { return c.clone().offsetHSL(0, 0, dl).getStyle(); }

  function woodTexture() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 1024;
    const x = cv.getContext('2d');
    const base = col('--art-table');
    const r = rng(7);
    const plank = 128;
    for (let row = 0; row < 1024 / plank; row++) {
      const y0 = row * plank;
      x.fillStyle = shade(base, (r() - 0.5) * 0.06);
      x.fillRect(0, y0, 1024, plank);
      // Grain: long, gently wavy strokes running along the plank.
      for (let k = 0; k < 46; k++) {
        const y = y0 + r() * plank;
        const amp = 1 + r() * 4, freq = 0.004 + r() * 0.01, ph = r() * 6.28;
        x.strokeStyle = shade(base, (r() - 0.55) * 0.14);
        x.globalAlpha = 0.18 + r() * 0.3;
        x.lineWidth = 0.6 + r() * 1.8;
        x.beginPath();
        for (let px = 0; px <= 1024; px += 16) {
          const py = y + Math.sin(px * freq + ph) * amp;
          if (px === 0) x.moveTo(px, py); else x.lineTo(px, py);
        }
        x.stroke();
      }
      // A knot now and then.
      if (r() < 0.6) {
        const kx = r() * 1024, ky = y0 + 20 + r() * (plank - 40);
        for (let ring = 6; ring > 0; ring--) {
          x.globalAlpha = 0.12;
          x.strokeStyle = shade(base, -0.12);
          x.lineWidth = 1.4;
          x.beginPath();
          x.ellipse(kx, ky, ring * 7, ring * 2.6, 0, 0, Math.PI * 2);
          x.stroke();
        }
      }
      x.globalAlpha = 0.55;
      x.fillStyle = shade(base, -0.16);
      x.fillRect(0, y0, 1024, 2.5);                    // the seam between planks
      x.globalAlpha = 1;
    }
    const tex = new T.CanvasTexture(cv);
    tex.colorSpace = T.SRGBColorSpace;
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.anisotropy = 8;
    return tex;
  }

  // Felt: fine speckle, a slightly lighter centre, and a stitched border.
  function matTexture(w, h) {
    const cv = document.createElement('canvas');
    cv.width = 1024; cv.height = Math.round(1024 * h / w);
    const x = cv.getContext('2d');
    const base = col('--art-mat');
    const W = cv.width, H = cv.height;
    x.fillStyle = base.getStyle();
    x.fillRect(0, 0, W, H);
    const glow = x.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, Math.max(W, H) * 0.7);
    glow.addColorStop(0, shade(base, 0.05));
    glow.addColorStop(1, shade(base, -0.05));
    x.fillStyle = glow;
    x.fillRect(0, 0, W, H);
    const r = rng(11);
    for (let i = 0; i < 26000; i++) {
      x.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)';
      x.fillRect(r() * W, r() * H, 1.4, 1.4);
    }
    const inset = 26;
    x.strokeStyle = shade(base, 0.2);
    x.globalAlpha = 0.55;
    x.lineWidth = 3;
    x.setLineDash([14, 9]);
    x.strokeRect(inset, inset, W - inset * 2, H - inset * 2);
    x.setLineDash([]);
    x.globalAlpha = 0.35;
    x.lineWidth = 1.5;
    x.strokeRect(inset + 12, inset + 12, W - (inset + 12) * 2, H - (inset + 12) * 2);
    x.globalAlpha = 1;
    const tex = new T.CanvasTexture(cv);
    tex.colorSpace = T.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }

  // The room: warm in the middle, near black at the edges. Drawn behind everything.
  function backdropTexture() {
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 512;
    const x = cv.getContext('2d');
    const base = col('--art-table');
    const g = x.createRadialGradient(256, 200, 20, 256, 256, 380);
    g.addColorStop(0, shade(base, -0.08));
    g.addColorStop(0.6, shade(base, -0.2));
    g.addColorStop(1, shade(base, -0.3));
    x.fillStyle = g;
    x.fillRect(0, 0, 512, 512);
    const tex = new T.CanvasTexture(cv);
    tex.colorSpace = T.SRGBColorSpace;
    return tex;
  }

  function buildEnvironment() {
    if (envGroup) {
      envGroup.traverse((o) => {
        if (!o.isMesh) return;
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
      });
      scene.remove(envGroup);
    }
    envGroup = new T.Group();

    // The table: a thick wooden top, big enough that its edges fall into the dark.
    const wood = woodTexture();
    wood.repeat.set(5, 4);
    const woodMat = new T.MeshPhysicalMaterial({ map: wood, roughness: 0.48, metalness: 0,
      clearcoat: 0.55, clearcoatRoughness: 0.32 });              // a varnished top
    const table = new T.Mesh(new T.BoxGeometry(40, 0.8, 32), woodMat);
    table.position.set(0, -0.09 - 0.4, -3.6);
    table.receiveShadow = true;
    envGroup.add(table);

    // The play mat under both seats and the action board.
    const mw = 14.2, mh = 18.4;
    const mat = new T.Mesh(new T.BoxGeometry(mw, 0.03, mh), [
      new T.MeshStandardMaterial({ color: col('--art-mat'), roughness: 1 }),
      new T.MeshStandardMaterial({ color: col('--art-mat'), roughness: 1 }),
      new T.MeshStandardMaterial({ map: matTexture(mw, mh), roughness: 1 }),
      new T.MeshStandardMaterial({ color: col('--art-mat'), roughness: 1 }),
      new T.MeshStandardMaterial({ color: col('--art-mat'), roughness: 1 }),
      new T.MeshStandardMaterial({ color: col('--art-mat'), roughness: 1 }),
    ]);
    mat.position.set(0, -0.075, -3.6);
    mat.receiveShadow = true;
    envGroup.add(mat);

    scene.add(envGroup);
    const bd = backdropTexture();
    if (scene.background && scene.background.isTexture) scene.background.dispose();
    scene.background = bd;
    const fogCol = col('--art-table').clone().offsetHSL(0, 0, -0.3);
    scene.fog = new T.Fog(fogCol, 26, 58);
  }

  // What the glossy surfaces reflect. Three's RoomEnvironment is not in the vendor bundle,
  // so this is the same idea by hand: bright panels in a dark box, prefiltered by PMREM.
  function reflections() {
    const env = new T.Scene();
    const room = new T.Mesh(new T.BoxGeometry(30, 14, 30),
      new T.MeshBasicMaterial({ color: new T.Color(0.07, 0.055, 0.04), side: T.BackSide }));
    room.position.y = 5;
    env.add(room);
    const panel = (w, h, pos, rot, rgb, k) => {
      const m = new T.Mesh(new T.PlaneGeometry(w, h),
        new T.MeshBasicMaterial({ color: new T.Color(rgb[0], rgb[1], rgb[2]).multiplyScalar(k), side: T.DoubleSide }));
      m.position.set(pos[0], pos[1], pos[2]);
      m.rotation.set(rot[0], rot[1], rot[2]);
      env.add(m);
    };
    panel(6, 4, [0, 11.8, 0], [Math.PI / 2, 0, 0], [1, 0.9, 0.74], 3.2);      // the lamp overhead
    panel(6, 7, [-14.8, 5, -3], [0, Math.PI / 2, 0], [0.75, 0.85, 1], 2.4);   // a window to one side
    panel(10, 3, [4, 6, 14.8], [0, Math.PI, 0], [1, 0.85, 0.7], 1.1);         // warm bounce behind you
    const pmrem = new T.PMREMGenerator(renderer);
    const tex = pmrem.fromScene(env, 0.035).texture;
    pmrem.dispose();
    return tex;
  }

  // ---------------------------------------------------------------- lifecycle
  function init(hostEl, handlers) {
    if (ready) return true;
    if (!T) return false;
    host = hostEl; hooks = handlers;
    canvas = document.createElement('canvas');
    canvas.className = 'c3d';
    host.appendChild(canvas);

    try {
      renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false });
    } catch (err) {
      host.removeChild(canvas);
      return false;                    // no WebGL: the caller falls back to the flat views
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;

    scene = new T.Scene();
    camera = new T.PerspectiveCamera(42, 1.6, 0.1, 200);
    scene.add(camera);                  // the hand rides along with it
    raycaster = new T.Raycaster();
    root = new T.Group();
    scene.add(root);

    scene.environment = reflections();
    scene.environmentIntensity = 0.4;

    // A dim room, one warm lamp over the play area, and a key light for the shadows.
    const hemi = new T.HemisphereLight(0xffffff, 0x6d5a3a, 0.3);
    scene.add(hemi);
    const fill = new T.DirectionalLight(0xdce8ff, 0.35);
    fill.position.set(-9, 7, 4);
    scene.add(fill);
    const lamp = new T.SpotLight(0xffe7c2, 2.6, 0, 0.62, 0.75, 0);
    lamp.position.set(0, 22, -2.6);
    lamp.target.position.set(0, 0, -3.6);
    scene.add(lamp, lamp.target);
    const sun = new T.DirectionalLight(0xfff1d6, 1.5);
    sun.position.set(6, 15, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -16; sun.shadow.camera.right = 16;
    sun.shadow.camera.top = 16; sun.shadow.camera.bottom = -16;
    sun.shadow.camera.far = 60;
    sun.shadow.bias = -0.0012;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 3;
    scene.add(sun);
    scene.userData.sun = sun;

    theme = document.documentElement.getAttribute('data-theme') ||
      (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    buildEnvironment();

    installControls();
    applyCamera();
    window.addEventListener('resize', onResize);
    ready = true;
    animate();
    return true;
  }

  function resize() {
    if (!ready || !host.offsetWidth) return;
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
  }

  const onResize = () => { resize(); if (lastUI) focus(lastUI.main, lastUI, true); };

  function disposeGroup(parent, g) {
    if (!g) return;
    g.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
      else o.material.dispose();
    });
    parent.remove(g);
  }

  function boxOf(obj) {
    obj.updateMatrixWorld(true);
    return new T.Box3().setFromObject(obj);
  }

  function sync(G, UI) {
    if (!ready) return;
    const nowTheme = document.documentElement.getAttribute('data-theme') ||
      (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    if (nowTheme !== theme) { theme = nowTheme; texCache.clear(); buildEnvironment(); }
    const sameView = lastUI && lastUI.main === UI.main && lastUI.view === UI.view;
    lastG = G; lastUI = Object.assign({}, UI);

    pickables = []; hoverables = [];
    hovered = null;
    disposeGroup(root, tableGroup);
    disposeGroup(camera, handGroup);

    tableGroup = new T.Group();
    const board = buildActionBoard(G, UI);
    tableGroup.add(board);
    const majors = buildMajors(G, UI);
    tableGroup.add(majors);
    const seats = G.players.map((_, i) => {
      const s = buildSeat(G, UI, i);
      tableGroup.add(s);
      return s;
    });
    root.add(tableGroup);

    handGroup = buildHand(G, UI);
    camera.add(handGroup);
    const handUp = handShown(G, UI);
    const handChanged = handUp !== (safeB === SAFE_HAND_B);
    safeB = handUp ? SAFE_HAND_B : SAFE.b;

    focusBoxes.board = boxOf(board);
    focusBoxes.majors = boxOf(majors);
    seats.forEach((s, i) => {
      focusBoxes['seat' + i] = boxOf(s);
      focusBoxes['farm' + i] = boxOf(s.userData.parts.farm);
      // No cards played yet: fall back to the farm so the view still has something to frame.
      focusBoxes['played' + i] = s.userData.parts.played.children.length
        ? boxOf(s.userData.parts.played) : null;
    });

    resize();
    focus(UI.main, UI, sameView && !handChanged);
  }

  let t0 = null;
  function animate(t) {
    requestAnimationFrame(animate);
    // The first call comes straight from init with no timestamp; wait for a real frame.
    if (!ready || t === undefined) return;
    if (t0 === null) t0 = t;
    const dt = Math.min(t - t0, 100);     // a background tab must not make everything jump
    if (dt < 16) return;
    t0 = t;
    const pulse = 0.62 + 0.33 * Math.sin(t * 0.005);
    if (tableGroup) tableGroup.traverse((o) => { if (o.userData.pulse && o.material) o.material.opacity = pulse; });
    stepCamera(dt);
    if (handGroup) {
      handY += (handGroup.userData.goalY - handY) * Math.min(1, dt / 110);
      handGroup.position.y = handY;
    }
    renderer.render(scene, camera);
  }

  function resetCamera() { if (lastUI) focus(lastUI.main, lastUI, false); }

  function debug() {
    let meshes = 0, pulsing = 0, loaded = 0;
    root.traverse((o) => { if (o.isMesh) meshes++; if (o.userData.pulse) pulsing++; });
    texCache.forEach((tx) => { if (tx.image && tx.image.width) loaded++; });
    return {
      hand: handGroup ? { y: +handY.toFixed(2), goal: handGroup.userData.goalY, n: handGroup.children.length, parent: !!handGroup.parent } : null,
      meshes, pulsing, pickables: pickables.length, hoverables: hoverables.length,
      textures: texCache.size, loaded, dist: +camState.dist.toFixed(2), pol: +camState.pol.toFixed(2),
      az: +camState.az.toFixed(2),
      target: [camState.target.x, camState.target.y, camState.target.z].map((n) => +n.toFixed(2)),
      boxes: Object.keys(focusBoxes).reduce((o, k) => {
        const b = focusBoxes[k];
        o[k] = b ? [b.min.x, b.min.z, b.max.x, b.max.z].map((n) => +n.toFixed(1)) : null;
        return o;
      }, {}),
    };
  }

  // Test hook: client coordinates of a pickable, so automated clicks can target it.
  function locate(match) {
    const hit = pickables.find((o) => {
      const d = o.userData.pick;
      return d && Object.keys(match).every((k) => d[k] === match[k]);
    });
    if (!hit) return null;
    const v3 = new T.Vector3();
    hit.getWorldPosition(v3).project(camera);
    const rect = canvas.getBoundingClientRect();
    return {
      x: rect.left + (v3.x + 1) / 2 * rect.width,
      y: rect.top + (-v3.y + 1) / 2 * rect.height,
    };
  }

  return { init, sync, resize: onResize, resetCamera, focus, debug, locate, isReady: () => ready };
})();
