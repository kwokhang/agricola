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

  // Where each component sits on the table. Everything faces the one camera, so nothing needs
  // turning round: the action board across the top, the major improvements stacked at its
  // right hand, and the two farms side by side underneath it, each with its name, family,
  // supply tray and played cards in a column below.
  const LAYOUT = {
    board: { x: 0, z: -2.45 },                                  // 8 × 3 spaces, across the top
    majors: { x: 0, z: -0.1 },                                   // world; one row between the board and the farms
    seat: (pi, n) => ({ x: n === 1 ? 0 : (pi === 0 ? -2.95 : 2.95), z: 2.25, rot: 0 }),
    // seat-local, top to bottom: the player board (name, family, goods), the farm, played cards
    // all three the farm's width (SEAT_W) and stacked edge to edge, so they read as one column
    supply: { x: 0, z: -0.68 },
    farm: { x: 0, z: 1.62 },
    played: { x: -2.12, z: 4.15 },                               // first card
  };
  const MAJ_W = 0.86, MAJ_H = 1.2;

  let renderer, scene, camera, raycaster, host, canvas;
  let root, tableGroup, handGroup, pickables = [], hoverables = [];
  let hooks = null, ready = false;
  const theme = 'dark';                  // one palette only; kept as a texture-cache key
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
    '--art-boardface', '--art-slot', '--art-seal', '--art-edge', '--art-board', '--art-table', '--art-mat', '--art-boardprint',
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
  // Matte, like gouache on wood: the artwork is watercolour and ink, so nothing should shine.
  const GLOSS = { roughness: 0.66, metalness: 0, clearcoat: 0.06, clearcoatRoughness: 0.7 };

  // Ink outlines for the wooden pieces, to match the linework in the illustrations: a copy
  // of each mesh pushed out along its normals, drawn back-faces only in 墨.
  const INK_MAT = new T.ShaderMaterial({
    uniforms: { c: { value: new T.Color('#1b130b') }, w: { value: 0.016 } },
    vertexShader: 'uniform float w; void main(){ vec3 p = position + normalize(normal) * w;' +
      ' gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }',
    fragmentShader: 'uniform vec3 c; void main(){ gl_FragColor = vec4(c, 1.0); }',
    side: T.BackSide,
  });
  function ink(root) {
    const meshes = [];
    root.traverse((o) => { if (o.isMesh && !o.userData.inkline && !o.userData.noInk) meshes.push(o); });
    for (const o of meshes) {
      const line = new T.Mesh(o.geometry, INK_MAT);
      line.userData.inkline = true;
      line.raycast = () => {};
      o.add(line);
    }
    return root;
  }
  // Cel shading for the wooden pieces, to sit with the anime-style artwork: light falls in
  // three flat tones — lit, mid, shadow — with hard steps between them, like cel paint.
  const TOON_STEPS = (() => {
    const tones = new Uint8Array([120, 200, 255]);
    const t = new T.DataTexture(tones, tones.length, 1, T.RedFormat);
    t.minFilter = t.magFilter = T.NearestFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    return t;
  })();
  // The table and the felt are big and mostly outside the lamp, so they get softer steps:
  // with the pieces' steps the shadow tone would turn the whole floor black.
  const TOON_ROOM = (() => {
    const tones = new Uint8Array([185, 225, 255]);
    const t = new T.DataTexture(tones, tones.length, 1, T.RedFormat);
    t.minFilter = t.magFilter = T.NearestFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    return t;
  })();
  const roomMat = (color, map) => new T.MeshToonMaterial({ color: new T.Color(color), map, gradientMap: TOON_ROOM });
  const TOON_KEYS = ['map', 'transparent', 'opacity', 'emissive', 'emissiveIntensity', 'side', 'depthWrite'];
  const mat = (color, opts) => {
    const o = { color: color instanceof T.Color ? color : new T.Color(color), gradientMap: TOON_STEPS };
    for (const k of TOON_KEYS) if (opts && opts[k] !== undefined) o[k] = opts[k];
    return new T.MeshToonMaterial(o);
  };
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

  // The one shape a worker has, at home and out on the board: a cream disc with the
  // meeple lying on its back on it, so from above the whole silhouette shows. At home a
  // worker who has gone out leaves its disc behind, empty and faded.
  function workerToken(pc, present) {
    const g = new T.Group();
    const hex = '#' + pc.getHexString();
    if (!present) {
      const ring = new T.Mesh(geo('wkRing', () => new T.RingGeometry(0.17, 0.215, 32)),
        new T.MeshBasicMaterial({ color: pc, transparent: true, opacity: 0.5, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.004;
      g.add(ring);
      return g;
    }
    // A little farmer in the player's colour: straw hat, shirt and dungarees, a pitchfork at
    // their side, standing on a disc of the colour so a crowd of them still reads by player.
    const shirt = mat(pc), dark = mat(pc.clone().lerp(new T.Color('#1c1a17'), 0.45));
    const skin = mat('#efc49a'), straw = mat('#dcb655'), wood = mat('#7a5534'), iron = mat('#8a8d92');
    const add = (m, x, y, z) => { m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
    add(new T.Mesh(geo('fmBase', () => new T.CylinderGeometry(0.17, 0.18, 0.035, 24)), shirt), 0, 0.018, 0);
    [-1, 1].forEach((sd) => add(new T.Mesh(geo('fmLeg', () => new T.CylinderGeometry(0.032, 0.036, 0.16, 8)), dark), sd * 0.04, 0.115, 0));
    add(new T.Mesh(geo('fmHip', () => new T.CylinderGeometry(0.075, 0.08, 0.07, 10)), dark), 0, 0.215, 0);
    add(new T.Mesh(geo('fmBody', () => new T.CylinderGeometry(0.068, 0.078, 0.15, 10)), shirt), 0, 0.3, 0);
    add(new T.Mesh(geo('fmBib', () => new T.BoxGeometry(0.07, 0.07, 0.012)), dark), 0, 0.285, 0.072);
    [-1, 1].forEach((sd) => {
      const arm = add(new T.Mesh(geo('fmArm', () => new T.CylinderGeometry(0.022, 0.026, 0.14, 6)), shirt), sd * 0.095, 0.3, 0);
      arm.rotation.z = sd * 0.25;
      add(new T.Mesh(geo('fmHand', () => new T.SphereGeometry(0.024, 8, 6)), skin), sd * 0.113, 0.23, 0);
    });
    add(new T.Mesh(geo('fmHead', () => new T.SphereGeometry(0.058, 14, 10)), skin), 0, 0.42, 0);
    add(new T.Mesh(geo('fmBrim', () => new T.CylinderGeometry(0.11, 0.11, 0.012, 18)), straw), 0, 0.458, 0);
    add(new T.Mesh(geo('fmCrown', () => new T.CylinderGeometry(0.052, 0.06, 0.055, 14)), straw), 0, 0.49, 0);
    add(new T.Mesh(geo('fmBand', () => new T.CylinderGeometry(0.061, 0.061, 0.016, 14)), dark), 0, 0.472, 0);
    // pitchfork held upright at the right hand
    add(new T.Mesh(geo('fmHandle', () => new T.CylinderGeometry(0.01, 0.01, 0.5, 5)), wood), 0.135, 0.3, 0.02);
    add(new T.Mesh(geo('fmHead2', () => new T.BoxGeometry(0.07, 0.012, 0.012)), iron), 0.135, 0.55, 0.02);
    [-1, 0, 1].forEach((k) => add(new T.Mesh(geo('fmTine', () => new T.BoxGeometry(0.008, 0.06, 0.008)), iron), 0.135 + k * 0.03, 0.585, 0.02));
    g.rotation.y = -0.25;
    return ink(g);
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

  // ---------------------------------------------------------------- farm materials
  // Painted surfaces for the farmyard: every tile gets light from the upper left, a darker
  // rim so neighbouring tiles read as separate pieces, and its own scatter of detail.
  function seeded(seed) {
    let s = (seed * 2654435761) >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }

  const TILE_LIGHT = `<defs>
    <linearGradient id="lt" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity=".14"/></linearGradient>
    <radialGradient id="vg" cx=".5" cy=".5" r=".72">
      <stop offset=".62" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".26"/></radialGradient></defs>`;
  const TILE_FINISH = `<rect width="100" height="100" fill="url(#lt)"/><rect width="100" height="100" fill="url(#vg)"/>`;

  function grassSvg(seed, rich) {
    const r = seeded(seed + (rich ? 101 : 0));
    const base = rich ? 'var(--art-pasture)' : 'var(--art-grass)';
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="256" height="256">${TILE_LIGHT}
      <rect width="100" height="100" fill="${base}"/>`;
    for (let i = 0; i < 7; i++) {             // soft patches of darker and lighter growth
      s += `<ellipse cx="${r() * 100}" cy="${r() * 100}" rx="${10 + r() * 16}" ry="${6 + r() * 10}"
        fill="${r() < 0.5 ? 'var(--art-grass-dk)' : '#fff'}" opacity="${0.06 + r() * 0.08}"/>`;
    }
    const shades = ['var(--art-grass-dk)', 'var(--art-grass-dk)', 'var(--art-reed-dk)', '#fff'];
    for (let i = 0; i < 70; i++) {            // tufts
      const x = r() * 100, y = r() * 100, h = 2.4 + r() * 2.6;
      s += `<path d="M${x} ${y}l-1.4 -${h}M${x} ${y}l.1 -${h * 1.15}M${x} ${y}l1.5 -${h * .9}" stroke="${shades[i % 4]}"
        stroke-width=".7" stroke-linecap="round" opacity="${i % 4 === 3 ? .35 : .75}"/>`;
    }
    const flowers = rich ? 9 : 4;
    for (let i = 0; i < flowers; i++) {
      const x = 8 + r() * 84, y = 8 + r() * 84;
      const petal = r() < 0.5 ? '#fff' : 'var(--art-grain)';
      s += `<g transform="translate(${x} ${y})">${[0, 72, 144, 216, 288].map((a) =>
        `<circle cx="${(Math.cos(a * Math.PI / 180) * 1.3).toFixed(2)}" cy="${(Math.sin(a * Math.PI / 180) * 1.3).toFixed(2)}" r="1" fill="${petal}"/>`).join('')}
        <circle r=".8" fill="${petal === '#fff' ? 'var(--art-grain)' : 'var(--art-veg)'}"/></g>`;
    }
    for (let i = 0; i < 3; i++) {             // pebbles
      s += `<ellipse cx="${r() * 100}" cy="${r() * 100}" rx="1.4" ry="1" fill="var(--art-stone-lt)" opacity=".8"/>`;
    }
    return s + TILE_FINISH + '</svg>';
  }

  // A ploughed field: ridges running across, each lit on top and shaded underneath.
  function fieldSvg(seed, sown) {
    const r = seeded(seed + 7);
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="256" height="256">${TILE_LIGHT}
      <rect width="100" height="100" fill="var(--art-soil)"/>`;
    for (let i = 0; i < 6; i++) {
      const y = 6 + i * 17.5;
      const w = (k) => (Math.sin(k * 0.09 + i) * 1.2).toFixed(2);
      s += `<path d="M0 ${y + 6 + +w(0)}${[25, 50, 75, 100].map((x) => ` L${x} ${y + 6 + +w(x)}`).join('')} V${y + 11} H0z" fill="#000" opacity=".2"/>
        <path d="M0 ${y + +w(0)}${[25, 50, 75, 100].map((x) => ` L${x} ${y + +w(x)}`).join('')} V${y + 6} H0z" fill="#fff" opacity=".16"/>
        <path d="M0 ${y + 11}H100" stroke="var(--art-soil-dk)" stroke-width="1.6" opacity=".7"/>`;
      if (sown) {
        for (let k = 0; k < 9; k++) {
          const x = 5 + k * 11 + r() * 3;
          s += `<path d="M${x} ${y + 4}l-1.2 -2.6M${x} ${y + 4}l1.2 -2.6" stroke="var(--art-reed)" stroke-width=".9" stroke-linecap="round"/>`;
        }
      }
    }
    for (let i = 0; i < 26; i++) {
      s += `<ellipse cx="${r() * 100}" cy="${r() * 100}" rx="${0.8 + r() * 1.2}" ry="${0.6 + r() * 0.8}" fill="var(--art-soil-dk)" opacity=".8"/>`;
    }
    return s + TILE_FINISH + '</svg>';
  }

  // Under a room: a trodden yard with stepping stones up to the door.
  function yardSvg(seed) {
    const r = seeded(seed + 31);
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="256" height="256">${TILE_LIGHT}
      <rect width="100" height="100" fill="var(--art-grass)"/>
      <ellipse cx="50" cy="56" rx="44" ry="38" fill="var(--art-soil)" opacity=".55"/>`;
    [[50, 84], [46, 94], [54, 74]].forEach(([x, y]) => {
      s += `<ellipse cx="${x}" cy="${y}" rx="5" ry="3.2" fill="var(--art-stone-lt)" stroke="var(--art-ink)" stroke-width=".4" opacity=".9"/>`;
    });
    for (let i = 0; i < 26; i++) {
      const x = r() * 100, y = r() * 100;
      if (Math.hypot(x - 50, (y - 56) * 1.15) < 40) continue;
      s += `<path d="M${x} ${y}l-1.3 -3M${x} ${y}l0 -3.4M${x} ${y}l1.3 -2.8" stroke="var(--art-grass-dk)" stroke-width=".7" stroke-linecap="round" opacity=".7"/>`;
    }
    return s + TILE_FINISH + '</svg>';
  }

  // Wall and roof finishes, repeated across the house faces.
  const WALL_SVG = {
    wood: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="128" height="128">
      <rect width="64" height="64" fill="var(--art-wood)"/>
      ${[0, 16, 32, 48].map((y) => `<rect y="${y}" width="64" height="16" fill="${y % 32 ? '#000' : '#fff'}" opacity=".06"/>
        <path d="M0 ${y + 15}H64" stroke="var(--art-wood-dk)" stroke-width="2"/>
        <path d="M0 ${y + 2}H64" stroke="#fff" stroke-width="1" opacity=".25"/>
        <ellipse cx="${(y * 7) % 60 + 4}" cy="${y + 8}" rx="3" ry="1.4" fill="none" stroke="var(--art-wood-dk)" stroke-width=".8" opacity=".5"/>`).join('')}</svg>`,
    clay: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="128" height="128">
      <rect width="64" height="64" fill="var(--art-clay-lt)"/>
      ${[[4, 6], [30, 18], [46, 40], [12, 44], [52, 8]].map(([x, y]) =>
        `<g opacity=".75"><rect x="${x}" y="${y}" width="10" height="5" fill="var(--art-clay)" stroke="var(--art-ink)" stroke-width=".4"/>
         <rect x="${x + 5}" y="${y + 5}" width="10" height="5" fill="var(--art-clay)" stroke="var(--art-ink)" stroke-width=".4"/></g>`).join('')}
      ${Array.from({ length: 40 }, (_, i) => `<circle cx="${(i * 37) % 64}" cy="${(i * 23) % 64}" r=".7" fill="#000" opacity=".12"/>`).join('')}</svg>`,
    stone: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="128" height="128">
      <rect width="64" height="64" fill="var(--art-ink)" opacity=".55"/>
      ${[0, 1, 2, 3].map((row) => [0, 1, 2].map((c) => {
        const x = c * 22 - (row % 2) * 11 + 1, y = row * 16 + 1;
        return `<rect x="${x}" y="${y}" width="20" height="14" rx="3" fill="var(--art-stone)"/>
          <rect x="${x + 1}" y="${y + 1}" width="18" height="4" rx="2" fill="#fff" opacity=".22"/>`;
      }).join('')).join('')}</svg>`,
  };
  const ROOF_SVG = {
    // Thatch on the wooden hut, clay tiles, then slate on the stone house.
    wood: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="128" height="128">
      <rect width="64" height="64" fill="var(--art-grain)"/><rect width="64" height="64" fill="var(--art-wood-dk)" opacity=".35"/>
      ${Array.from({ length: 48 }, (_, i) => `<path d="M${(i * 11) % 64} ${(i * 17) % 64}l${2 - (i % 3)} 9"
        stroke="${i % 3 ? 'var(--art-wood-dk)' : '#fff'}" stroke-width=".9" opacity="${i % 3 ? .45 : .3}"/>`).join('')}
      ${[16, 32, 48].map((y) => `<path d="M0 ${y}H64" stroke="var(--art-wood-dk)" stroke-width="1.6" opacity=".5"/>`).join('')}</svg>`,
    clay: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="128" height="128">
      <rect width="64" height="64" fill="var(--art-roof)"/>
      ${[0, 16, 32, 48].map((y, row) => Array.from({ length: 5 }, (_, i) => {
        const x = i * 16 - (row % 2) * 8;
        return `<path d="M${x} ${y}v12a8 4 0 0 0 16 0V${y}" fill="var(--art-roof)" stroke="#000" stroke-width=".8" stroke-opacity=".35"/>
          <path d="M${x + 3} ${y + 2}v8" stroke="#fff" stroke-width="1.4" opacity=".22"/>`;
      }).join('')).join('')}</svg>`,
    stone: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="128" height="128">
      <rect width="64" height="64" fill="var(--art-stone)"/><rect width="64" height="64" fill="var(--art-ink)" opacity=".45"/>
      ${[0, 1, 2, 3, 4, 5, 6, 7].map((row) => Array.from({ length: 5 }, (_, i) => {
        const x = i * 14 - (row % 2) * 7, y = row * 8;
        return `<rect x="${x + .5}" y="${y + .5}" width="13" height="7.5" rx="1.2" fill="#fff" opacity="${0.05 + ((i + row) % 3) * 0.04}"/>`;
      }).join('')).join('')}</svg>`,
  };

  function finishTex(kind, table, key) {
    const tex = svgTexture(`${key}:${kind}`, (table[kind] || table.wood)(), 128, 128);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    return tex;
  }

  // A gabled building: a pentagon profile extruded along x, a two-slab roof that overhangs
  // it, and a front (+z) that faces whoever is sitting at this farm.
  function gabled(o) {
    const g = new T.Group();
    const { W, D, Hw, Hr } = o;
    const k = `gab${W}_${D}_${Hw}_${Hr}`;
    const body = geo(k, () => {
      const s = new T.Shape();
      s.moveTo(D / 2, 0); s.lineTo(-D / 2, 0); s.lineTo(-D / 2, Hw); s.lineTo(0, Hw + Hr); s.lineTo(D / 2, Hw);
      s.closePath();
      const e = new T.ExtrudeGeometry(s, { depth: W, bevelEnabled: false });
      e.rotateY(Math.PI / 2);
      e.translate(-W / 2, 0, 0);
      return e;
    });
    const wallTex = o.wallTex;
    const wallMat = mat('#ffffff', { map: wallTex });
    wallTex.repeat.set(1 / 0.26, 1 / 0.26);   // extrude UVs are in world units
    const walls = new T.Mesh(body, wallMat);
    walls.castShadow = true; walls.receiveShadow = true;
    g.add(walls);

    const pitch = Math.atan2(Hr, D / 2);
    const slope = Math.hypot(D / 2, Hr) + o.over;
    const roofTex = o.roofTex;
    roofTex.repeat.set(2.2, 1.2);
    const roofMat = mat('#ffffff', { map: roofTex, roughness: 0.6 });
    [-1, 1].forEach((side) => {
      const slab = new T.Mesh(geo(`rf${W}_${slope.toFixed(3)}`, () => new T.BoxGeometry(W + o.over * 2, 0.035, slope)), roofMat);
      slab.rotation.x = side * pitch;
      slab.position.set(0, Hw + Hr / 2 + 0.02, side * (D / 4 + o.over * 0.35) * 1);
      // the slab tilts about its own centre, so push it out along its own slope
      slab.position.z = side * (Math.cos(pitch) * slope / 2 - o.over * 0.5);
      slab.position.y = Hw + Hr - Math.sin(pitch) * slope / 2 + 0.03;
      slab.castShadow = true; slab.receiveShadow = true;
      g.add(slab);
    });
    // ridge cap
    const ridge = new T.Mesh(geo(`ridge${W}`, () => new T.CylinderGeometry(0.022, 0.022, W + o.over * 2, 6)), roofMat);
    ridge.rotation.z = Math.PI / 2;
    ridge.position.y = Hw + Hr + 0.045;
    g.add(ridge);
    return g;
  }

  function houseMesh(kind) {
    const k = kind === 'clay' || kind === 'stone' ? kind : 'wood';
    const W = 0.72, D = 0.5, Hw = 0.3, Hr = 0.32;
    const g = gabled({ W, D, Hw, Hr, over: 0.06, wallTex: finishTex(k, WALL_SVG, 'wall'), roofTex: finishTex(k, ROOF_SVG, 'roof') });
    const front = D / 2 + 0.006;
    g.add(box(0.14, 0.2, 0.02, col('--art-stable-door'), 0.02, 0.1, front));
    const glow = { color: col('--art-grain'), emissive: col('--art-grain'), emissiveIntensity: 0.55 };
    [-0.22, 0.24].forEach((x) => {
      const w = new T.Mesh(geo('win', () => new T.BoxGeometry(0.11, 0.09, 0.02)), mat(glow.color, glow));
      w.position.set(x, 0.18, front);
      g.add(w);
      g.add(box(0.13, 0.015, 0.03, col('--art-wood-dk'), x, 0.13, front + 0.004));   // sill
    });
    g.add(box(0.2, 0.03, 0.06, col('--art-stone-lt'), 0.02, 0.015, front + 0.03));    // doorstep
    const chim = box(0.08, 0.2, 0.08, col(k === 'wood' ? '--art-clay' : '--art-stone'), -0.2, Hw + Hr - 0.02, -0.08);
    g.add(chim);
    return ink(g);
  }

  function stableMesh() {
    const W = 0.44, D = 0.34, Hw = 0.18, Hr = 0.15;
    const g = gabled({ W, D, Hw, Hr, over: 0.04, wallTex: finishTex('wood', WALL_SVG, 'wall'), roofTex: finishTex('wood', ROOF_SVG, 'roof') });
    const front = D / 2 + 0.006;
    g.add(box(0.16, 0.15, 0.02, col('--art-stable-door'), 0, 0.075, front));
    [-1, 1].forEach((s) => {                  // the X brace on a barn door
      const b = box(0.2, 0.018, 0.012, col('--art-wood-lt'), 0, 0.075, front + 0.012);
      b.rotation.z = s * 0.72;
      g.add(b);
    });
    return ink(g);
  }

  function cropMesh(kind) {
    const g = new T.Group();
    if (kind === 'grain') {
      // A clump of five stalks, leaning out a little, each topped with a plump ear.
      [[-0.05, 0, -0.18], [0.05, 0.01, 0.16], [0, -0.05, 0.04], [-0.02, 0.05, -0.06], [0.07, -0.04, 0.24]].forEach(([dx, dz, lean]) => {
        const stalk = new T.Mesh(geo('stalk', () => new T.CylinderGeometry(0.01, 0.014, 0.26, 5)), mat(col('--art-reed-dk')));
        stalk.position.set(dx, 0.13, dz); stalk.rotation.z = lean;
        g.add(stalk);
        const ear = new T.Mesh(geo('ear', () => new T.SphereGeometry(0.045, 8, 6)), mat(col('--art-grain'), { roughness: 0.35 }));
        ear.scale.set(0.7, 1.7, 0.7);
        ear.position.set(dx - Math.sin(lean) * 0.27, 0.28, dz);
        ear.rotation.z = lean;
        ear.castShadow = true;
        g.add(ear);
      });
    } else {
      // A pumpkin: a squashed, ribbed sphere with a stalk and a leaf.
      const body = new T.Mesh(geo('pumpkin', () => new T.SphereGeometry(0.1, 10, 8)),
        mat(col('--art-veg'), { flatShading: true, roughness: 0.4 }));
      body.scale.set(1, 0.68, 1); body.position.y = 0.068; body.castShadow = true;
      g.add(body);
      const stalk = new T.Mesh(geo('pstalk', () => new T.CylinderGeometry(0.012, 0.018, 0.05, 5)), mat(col('--art-wood-dk')));
      stalk.position.y = 0.15; stalk.rotation.z = 0.3;
      g.add(stalk);
      const leaf = new T.Mesh(geo('pleaf', () => new T.SphereGeometry(0.05, 6, 4)), mat(col('--art-reed')));
      leaf.scale.set(1.3, 0.25, 0.8); leaf.position.set(0.07, 0.13, 0.02); leaf.rotation.z = -0.4;
      g.add(leaf);
    }
    return ink(g);
  }

  // The three animals follow the colours of the wooden pieces in the box — white sheep,
  // dark boar, brown cattle — and differ in build, so they read apart even at a glance:
  // a small round woolly sheep, a low long boar, a tall boxy cow with horns.
  function animalMesh(kind) {
    const g = new T.Group();
    const leg = (x, z, h, r, colour) => {
      const l = new T.Mesh(geo(`leg${h}_${r}`, () => new T.CylinderGeometry(r, r * 0.85, h, 6)), mat(colour));
      l.position.set(x, h / 2, z);
      l.castShadow = true;
      g.add(l);
    };
    const blob = (key, r, colour, x, y, z, sx, sy, sz, o) => {
      const m = new T.Mesh(geo(key + r, () => new T.SphereGeometry(r, 12, 10)), mat(colour, o));
      m.position.set(x, y, z);
      m.scale.set(sx || 1, sy || 1, sz || 1);
      m.castShadow = true;
      g.add(m);
      return m;
    };

    if (kind === 'sheep') {
      const wool = col('--art-sheep'), dark = new T.Color(0x2b2622);
      [[-0.06, -0.08], [0.06, -0.08], [-0.06, 0.07], [0.06, 0.07]].forEach(([x, z]) => leg(x, z, 0.09, 0.018, dark));
      // a cloud of wool: overlapping puffs rather than one smooth ball
      [[0, 0.17, 0, 0.1], [-0.06, 0.16, -0.06, 0.08], [0.06, 0.16, -0.05, 0.08], [-0.06, 0.16, 0.06, 0.08],
        [0.06, 0.16, 0.06, 0.08], [0, 0.22, 0.02, 0.08], [0, 0.2, -0.08, 0.075], [0, 0.15, 0.1, 0.07]]
        .forEach(([x, y, z, r]) => blob('wool', r, wool, x, y, z, 1, 1, 1, { roughness: 0.95, clearcoat: 0 }));
      blob('sface', 0.055, dark, 0, 0.19, 0.15, 0.9, 1.1, 1.2);                // black face
      [-1, 1].forEach((s) => {
        const ear = blob('sear', 0.022, dark, s * 0.055, 0.2, 0.13, 1.6, 0.6, 1);
        ear.rotation.z = s * 0.5;
      });
      blob('stop', 0.04, wool, 0, 0.24, 0.12, 1.2, 0.8, 1, { roughness: 0.95, clearcoat: 0 });   // tuft on the head
    } else if (kind === 'boar') {
      const hide = new T.Color(0x3a322d), snoutC = new T.Color(0x8a6a60);
      [[-0.07, -0.1], [0.07, -0.1], [-0.07, 0.1], [0.07, 0.1]].forEach(([x, z]) => leg(x, z, 0.08, 0.022, hide));
      blob('bbody', 0.15, hide, 0, 0.16, 0, 0.9, 0.78, 1.45);                  // low and long
      blob('bhead', 0.08, hide, 0, 0.17, 0.2, 1, 0.95, 1.1);
      const snout = new T.Mesh(geo('bsnout', () => new T.CylinderGeometry(0.035, 0.04, 0.06, 10)), mat(snoutC));
      snout.rotation.x = Math.PI / 2; snout.position.set(0, 0.15, 0.29); g.add(snout);
      [-1, 1].forEach((s) => {
        const tusk = new T.Mesh(geo('tusk', () => new T.ConeGeometry(0.01, 0.05, 5)), mat(col('--art-count')));
        tusk.position.set(s * 0.035, 0.14, 0.27); tusk.rotation.x = -0.6; g.add(tusk);
        const ear = new T.Mesh(geo('bear', () => new T.ConeGeometry(0.025, 0.06, 4)), mat(hide));
        ear.position.set(s * 0.05, 0.25, 0.18); ear.rotation.z = -s * 0.3; g.add(ear);
      });
      const crest = blob('bcrest', 0.05, new T.Color(0x201b18), 0, 0.26, -0.02, 0.5, 0.5, 2.6);   // bristly ridge
      crest.castShadow = false;
    } else {
      const hide = new T.Color(ART.tokenColor('cattle'));             // same brown as its coin
      const white = col('--art-cattle'), horn = col('--art-plate'), muzzle = new T.Color(0xd9a38f);
      [[-0.08, -0.13], [0.08, -0.13], [-0.08, 0.12], [0.08, 0.12]].forEach(([x, z]) => leg(x, z, 0.15, 0.025, hide));
      const body = new T.Mesh(geo('cbody', () => new T.BoxGeometry(0.22, 0.15, 0.36, 2, 2, 2)), mat(hide));
      body.position.set(0, 0.22, 0); body.castShadow = true; g.add(body);
      blob('cback', 0.11, hide, 0, 0.27, -0.02, 1, 0.5, 1.6);                  // rounded back over the box
      blob('chead', 0.075, hide, 0, 0.28, 0.23, 1, 1, 1.25);
      blob('cblaze', 0.05, white, 0, 0.3, 0.29, 0.9, 1.1, 0.6);                // white face blaze
      blob('cmuzzle', 0.045, muzzle, 0, 0.25, 0.31, 1.2, 0.8, 0.8);
      [-1, 1].forEach((s) => {
        const h = new T.Mesh(geo('chorn', () => new T.ConeGeometry(0.015, 0.08, 6)), mat(horn));
        h.position.set(s * 0.075, 0.36, 0.22); h.rotation.z = -s * 1.0; g.add(h);
        const ear = blob('cear', 0.025, hide, s * 0.085, 0.31, 0.21, 1.6, 0.6, 1);
        ear.rotation.z = s * 0.3;
      });
      const tail = new T.Mesh(geo('ctail', () => new T.CylinderGeometry(0.008, 0.008, 0.16, 4)), mat(hide));
      tail.position.set(0, 0.19, -0.19); tail.rotation.x = 0.35; g.add(tail);
    }
    return ink(g);
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
    return ink(g);
  }

  // A single unit of goods, as the wooden bit it would be in the box.
  // One colour per good, shared with its HUD coin, so a piece and its icon always match.
  const goodsColor = (kind) => new T.Color(ART.tokenColor(kind));
  function goodsMesh(kind) {
    if (kind === 'sheep' || kind === 'boar' || kind === 'cattle') {
      const a = animalMesh(kind);
      a.scale.setScalar(0.62);
      return a;
    }
    const g = new T.Group();
    if (kind === 'wood') {
      const log = new T.Mesh(geo('log', () => new T.CylinderGeometry(0.07, 0.07, 0.3, 8)), mat(goodsColor(kind)));
      log.rotation.z = Math.PI / 2; log.position.y = 0.07; log.castShadow = true;
      g.add(log);
    } else if (kind === 'clay') {
      g.add(box(0.26, 0.12, 0.15, goodsColor(kind), 0, 0.06, 0));
    } else if (kind === 'reed') {
      // A cream bundle lying down, tied in the middle — the colour of the real reed pieces,
      // so it never vanishes against green art.
      const stalkMat = mat(goodsColor('reed'));
      for (let i = 0; i < 5; i++) {
        const r = new T.Mesh(geo('reedstalk', () => new T.CylinderGeometry(0.026, 0.026, 0.32, 6)), stalkMat);
        r.rotation.z = Math.PI / 2;
        r.position.set(0, 0.03 + (i % 2) * 0.04, (i - 2) * 0.03);
        r.castShadow = true;
        g.add(r);
      }
      const tie = new T.Mesh(geo('reedtie', () => new T.CylinderGeometry(0.075, 0.075, 0.04, 10)), mat(col('--art-wood-dk')));
      tie.rotation.z = Math.PI / 2;
      tie.position.y = 0.05;
      g.add(tie);
    } else if (kind === 'stone') {
      const s = new T.Mesh(geo('rock', () => new T.IcosahedronGeometry(0.11, 0)), mat(goodsColor(kind), { flatShading: true }));
      s.position.y = 0.09; s.rotation.set(0.5, 0.8, 0.2); s.castShadow = true;
      g.add(s);
    } else if (kind === 'grain') {
      const d = new T.Mesh(geo('disc', () => new T.CylinderGeometry(0.11, 0.11, 0.06, 12)), mat(goodsColor(kind)));
      d.position.y = 0.03; d.castShadow = true;
      g.add(d);
    } else if (kind === 'veg') {
      const v = new T.Mesh(geo('vegcone', () => new T.ConeGeometry(0.09, 0.22, 8)), mat(goodsColor(kind)));
      v.position.y = 0.11; v.rotation.x = Math.PI; v.castShadow = true;
      g.add(v);
    } else {                                     // food
      const d = new T.Mesh(geo('fooddisc', () => new T.CylinderGeometry(0.1, 0.1, 0.07, 14)), mat(goodsColor(kind)));
      d.position.y = 0.035; d.castShadow = true;
      g.add(d);
    }
    return ink(g);
  }

  // Goods waiting on a space: the actual wooden pieces (the same cel-shaded bits as on the
  // farm) sitting in a small parchment tray, with the count inked on the tray like a note
  // written on the board. `rim` is a player's colour for goods a card has parked.
  const TRAY_W = 1.0, TRAY_D = 0.6;
  const TRAY_SPOTS = [[-0.24, 0.0], [-0.06, -0.12], [-0.08, 0.13], [-0.27, -0.14]];
  function trayFace(n, rim) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60" width="300" height="180"
      font-family="'Hiragino Mincho ProN','Songti TC',serif">
      <rect x="1.5" y="1.5" width="97" height="57" rx="9" fill="#efe3c3" stroke="${rim}" stroke-width="3"/>
      <rect x="5" y="5" width="90" height="50" rx="6" fill="none" stroke="#5a4526" stroke-width=".8" opacity=".45"/>
      <path d="M62 10V50" stroke="#5a4526" stroke-width=".8" opacity=".35"/>
      <text x="80" y="41" text-anchor="middle" font-size="${n > 9 ? 26 : 30}" font-weight="700" fill="#2a1d10">${n}</text></svg>`;
  }
  // Goods waiting on an action space: one coin of the kind, standing a little proud of the
  // board, with the count on a small dark badge at its lower right.
  function goodsChip(kind, n) {
    const g = new T.Group();
    const r = 0.13, t = 0.05;
    const side = mat(new T.Color(ART.tokenColor(kind)), { roughness: 0.4 });
    const iconTex = svgTexture('tokenFace2:' + kind, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0.6 0.6 22.8 22.8" width="192" height="192">${ART.tokenMarkup(kind)}</svg>`, 192, 192);
    const coin = new T.Mesh(geo('chipCoin', () => new T.CylinderGeometry(r, r, t, 32)), side);
    coin.position.y = t / 2;
    coin.castShadow = true;
    g.add(coin);
    // the icon on a flat disc laid on top, so it reads upright from the player's side
    // (a cylinder's cap UVs would turn it sideways)
    const face = new T.Mesh(geo('chipFace', () => new T.CircleGeometry(r, 32)), printMat(iconTex, { roughness: 0.4 }));
    face.rotation.x = -Math.PI / 2;
    face.position.y = t + 0.001;
    face.userData.noInk = true;
    g.add(face);
    const badge = new T.Mesh(geo('chipBadge', () => new T.PlaneGeometry(0.17, 0.17)),
      new T.MeshBasicMaterial({ transparent: true, depthWrite: false, map: svgTexture('chipN:' + n,
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 34" width="136" height="136">
          <circle cx="17" cy="17" r="15" fill="#1c1a17" stroke="#f3ead2" stroke-width="2.4"/>
          <text x="17" y="${n > 9 ? 22 : 23.5}" text-anchor="middle" font-size="${n > 9 ? 15 : 19}" font-weight="800" fill="#fff6e0"
            font-family="-apple-system,'PingFang TC',sans-serif">${n}</text></svg>`, 136, 136) }));
    badge.rotation.x = -Math.PI / 2;
    badge.position.set(r * 0.78, t + 0.012, r * 0.62);
    badge.userData.noInk = true;
    g.add(badge);
    ink(g);
    return g;
  }

  function goodsTray(kind, n, rim) {
    const g = new T.Group();
    const rimHex = rim ? '#' + rim.getHexString() : '#8a6a3c';
    const tex = svgTexture(`tray:${n}:${rimHex}`, trayFace(n, rimHex), 300, 180);
    const edge = mat(col('--art-wood-dk'));
    const plate = new T.Mesh(geo('goodsTray', () => new T.BoxGeometry(TRAY_W, 0.04, TRAY_D)),
      [edge, edge, printMat(tex, { roughness: 0.7 }), edge, edge, edge]);
    plate.position.y = 0.02;
    plate.receiveShadow = true;
    g.add(plate);
    const shown = Math.min(n, TRAY_SPOTS.length);
    for (let i = 0; i < shown; i++) {
      const m = goodsMesh(kind);
      m.position.set(TRAY_SPOTS[i][0], 0.04, TRAY_SPOTS[i][1]);
      m.rotation.y = i * 1.3 + 0.4;
      m.scale.multiplyScalar(ANIM.includes(kind) ? 0.8 : 0.82);
      g.add(m);
    }
    return g;
  }

  // Goods piled in a loose cluster, with a count plate once there are more than a few.
  const PILE = [[0, 0], [0.24, 0.1], [-0.22, 0.14], [0.1, -0.2], [-0.12, -0.18], [0.3, -0.08],
    [-0.32, -0.02], [0.02, 0.26], [0.22, 0.3], [-0.24, 0.32]];

  function goodsPile(kind, n, opts) {
    const g = new T.Group();
    const o = opts || {};
    if (o.base) {
      // Real coins: one per good, in stacks of five standing side by side, so the pile itself
      // is the count. The goods' colour on the sides, the top coin of each stack printed with
      // its icon. The number is a small dark marker lying on the board in front — printed
      // matter, not something floating in the air.
      const r = 0.36 * (o.spread || 1) + 0.12;
      const t = 0.07, per = 5;
      const stacks = Math.ceil(Math.max(1, n) / per);
      const gap = r * 2 + 0.04;
      let y = 0;
      if (o.base !== true) {                     // goods parked for a player sit on their colour
        const pw = gap * (stacks - 1) + r * 2 + 0.12;
        const pad = new T.Mesh(geo(`pilePad${pw.toFixed(2)}_${r.toFixed(2)}`, () => new T.BoxGeometry(pw, 0.025, r * 2 + 0.12)),
          mat(o.base, { roughness: 0.35 }));
        pad.position.set(gap * (stacks - 1) / 2, 0.0125, 0);
        pad.receiveShadow = true;
        g.add(pad);
        y = 0.025;
      }
      const side = mat(new T.Color(ART.tokenColor(kind)), { roughness: 0.4 });
      const iconTex = svgTexture('tokenFace2:' + kind, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0.6 0.6 22.8 22.8" width="192" height="192">${ART.tokenMarkup(kind)}</svg>`, 192, 192);
      const faceMat = printMat(iconTex, { roughness: 0.4 });
      for (let st = 0; st < stacks; st++) {
        const count = Math.min(per, Math.max(1, n) - st * per);
        const sx = st * gap;
        for (let k = 0; k < count; k++) {
          const c = new T.Mesh(geo(`pileCoin${r.toFixed(2)}`, () => new T.CylinderGeometry(r, r, t * 0.92, 32)), side);
          c.position.set(sx + (k % 2) * 0.012, y + t * k + t / 2, ((k * 7) % 3 - 1) * 0.01);
          c.castShadow = true; c.receiveShadow = true;
          g.add(c);
        }
        const face = new T.Mesh(geo(`pileIcon${r.toFixed(2)}`, () => new T.CircleGeometry(r, 32)), faceMat);
        face.rotation.x = -Math.PI / 2;
        face.position.set(sx + ((count - 1) % 2) * 0.012, y + t * count + 0.001, (((count - 1) * 7) % 3 - 1) * 0.01);
        g.add(face);
      }
      ink(g);
      if (n > 1) {
        const tag = new T.Mesh(geo('pileTag', () => new T.CircleGeometry(0.16, 28)),
          new T.MeshBasicMaterial({ map: svgTexture('ptag:' + n, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="96" height="96">
            <circle cx="20" cy="20" r="19" fill="#1c1a17" stroke="#efe8d8" stroke-width="2"/>
            <text x="20" y="27.5" text-anchor="middle" font-size="${n > 9 ? 19 : 22}" font-weight="900" fill="#efe8d8"
              font-family="-apple-system,sans-serif">${n}</text></svg>`, 96, 96), transparent: true }));
        tag.rotation.x = -Math.PI / 2;
        tag.position.set(gap * (stacks - 1) + r + 0.1, y + 0.004, r * 0.75);
        g.add(tag);
      }
      return g;
    }
    const lift = 0;
    const shown = Math.min(n, o.max || 6);
    for (let i = 0; i < shown; i++) {
      const m = goodsMesh(kind);
      m.position.set(PILE[i][0] * (o.spread || 1), lift, PILE[i][1] * (o.spread || 1));
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
  const HILITE = 0xe8b64a;                  // 山吹, a touch brighter so it glows
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
    return svgTexture(cardKey(c, sig), ART.cardFace(c, o), 540, 756);   // 1.8× the card's own size
  }

  function backTexture(kind) {
    return svgTexture('back:' + kind, ART.cardBack(kind).replace('</svg>', GRAIN_DEF + '</svg>'), 160, 224);
  }

  // A card as a physical object: a thin slab with the printed face on top.
  // A rounded card blank: a rounded rectangle extruded to card thickness, lying flat, with
  // its caps' UVs remapped to 0–1 so the printed face lands exactly on it. The corner
  // radius matches the printed border, so no square corner ever shows.
  function cardGeometry(w, h) {
    return geo(`rcard${w}_${h}`, () => {
      const r = w * 0.053, x = -w / 2, y = -h / 2;
      const sh = new T.Shape();
      sh.moveTo(x + r, y); sh.lineTo(x + w - r, y); sh.quadraticCurveTo(x + w, y, x + w, y + r);
      sh.lineTo(x + w, y + h - r); sh.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      sh.lineTo(x + r, y + h); sh.quadraticCurveTo(x, y + h, x, y + h - r);
      sh.lineTo(x, y + r); sh.quadraticCurveTo(x, y, x + r, y);
      const g = new T.ExtrudeGeometry(sh, { depth: 0.018, bevelEnabled: false, curveSegments: 6 });
      const pos = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - x) / w, (pos.getY(i) - y) / h);
      g.rotateX(-Math.PI / 2);        // shape's +y becomes the card's far edge (-z), face up
      g.translate(0, -0.009, 0);
      return g;
    });
  }

  function cardMesh(face, w, h, opts) {
    const o = opts || {};
    const top = o.unlit
      ? new T.MeshBasicMaterial({ map: face, toneMapped: false })
      : printMat(face);
    const edge = mat(new T.Color('#2a221a'), { roughness: 0.6 });
    const m = new T.Mesh(cardGeometry(w, h), [top, edge]);
    m.castShadow = !o.unlit;
    m.receiveShadow = !o.unlit;
    return m;
  }

  // ---------------------------------------------------------------- action board
  // The printed 1–2 player board, in its own pixel space, then scaled onto the table.
  // Every action space is the same 3:2 cell, the shape of the artwork. The small board is
  // one column of six; the big board is seven columns, six rows tall so both boards match.
  const CELL_W = 186, CELL_H = 124;
  // Wide, to match a landscape screen: the small board 2 × 3, the big board 6 × 3.
  const SM = { w: CELL_W, h: CELL_H, gap: 8, pad: 14, rows: 3, cols: 2 };
  const BG = { w: CELL_W, h: CELL_H, gap: 8, pad: 14, rows: 3, cols: 6 };
  const BOARD_GAP = 18;
  const SM_W = SM.pad * 2 + SM.cols * SM.w + (SM.cols - 1) * SM.gap;
  // a deeper bottom margin, so the harvest tabs under the last row hang onto the board too
  const FOOT = 20;
  const SM_H = SM.pad * 2 + FOOT + SM.rows * SM.h + (SM.rows - 1) * SM.gap;
  const BG_W = BG.pad * 2 + BG.cols * BG.w + (BG.cols - 1) * BG.gap;
  const BG_H = BG.pad * 2 + FOOT + BG.rows * BG.h + (BG.rows - 1) * BG.gap;
  const PX_W = SM_W + BOARD_GAP + BG_W, PX_H = Math.max(SM_H, BG_H);
  const PS = 0.00708;                              // pixels → world units (a cell is ~1.3 wide)
  // The big board, packed: the four accumulation spaces then rounds 1–14, filled top to
  // bottom, column by column — 18 spaces in 6 × 3, no gaps. Harvests are a seal on the
  // round they follow.
  const BIG_ORDER = BOARD_LAYOUT.accum.map((id) => ({ id })).concat(
    Array.from({ length: 14 }, (_, k) => ({ round: k + 1 })));
  const bigCell = (i) => [Math.floor(i / BG.rows), i % BG.rows];
  const bx = (px) => (px - PX_W / 2) * PS;
  const bz = (py) => (py - PX_H / 2) * PS;
  const STAGE_OF = {};
  ROUND_SPACES.forEach((d) => { STAGE_OF[d.id] = d.stage; });

  // One action space, printed exactly like the DOM board prints it.
  // One action space: the picture fills the whole cell (painted artwork when there is some,
  // else the drawn scene), and the name and what it does sit on a dark fade along the
  // bottom, the way a card's text sits over its art.
  // The picture is the point: it fills the space and stays mostly clear. The name sits
  // top-left on a light shade, the rules small at the bottom-left, and the top-right corner
  // is left free for goods that pile up there.
  function spaceTexture(G, p, def, w, h) {
    const notes = spaceNotes(G, p, def);
    const img = typeof ACTION_IMAGES !== 'undefined' && ACTION_IMAGES[def.id];
    const accum = !!def.accum;
    const room = w - 14 - (accum ? 58 : 0);                    // leave the goods corner free
    const en = def.zh.length * 15 + def.en.length * 5.2 + 8 < room ? def.en : '';
    const nb = notes.length ? 10 + notes.length * 11.5 : 0;
    const pic = img
      ? `<image href="${img}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>`
      : ART.scene(def.id, 0, 0, w, h, h - 4);
    const R = 3;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * R}" height="${h * R}"
      font-family="-apple-system,BlinkMacSystemFont,'PingFang TC','Noto Sans TC',sans-serif">
      <defs>
        <linearGradient id="ft" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#1c1a17" stop-opacity=".78"/>
          <stop offset=".55" stop-color="#1c1a17" stop-opacity=".45"/>
          <stop offset="1" stop-color="#1c1a17" stop-opacity="0"/></linearGradient>
        <linearGradient id="fb" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#1c1a17" stop-opacity="0"/>
          <stop offset=".45" stop-color="#1c1a17" stop-opacity=".6"/>
          <stop offset="1" stop-color="#1c1a17" stop-opacity=".82"/></linearGradient>
        <filter id="sh" x="-10%" y="-30%" width="120%" height="160%">
          <feDropShadow dx="0" dy="0.8" stdDeviation="0.9" flood-color="#000" flood-opacity=".75"/></filter></defs>
      <rect width="${w}" height="${h}" fill="var(--art-boardface)"/>
      ${pic}
      <rect width="${w}" height="34" fill="url(#ft)"/>
      ${nb ? `<rect y="${h - nb - 14}" width="${w}" height="${nb + 14}" fill="url(#fb)"/>` : ''}
      <g filter="url(#sh)">
        <text x="8" y="19" font-size="15" font-weight="800" fill="#fff6e0">${def.zh}${en ? `<tspan dx="5" font-size="8.5" font-weight="600" fill-opacity=".75">${en}</tspan>` : ''}</text>
        ${notes.map((t, k) => `<text x="8" y="${h - nb + 12 + k * 11.5}" font-size="9.5" font-weight="600" fill="#f3ead2">${t}</text>`).join('')}
      </g>
      <rect x="1" y="1" width="${w - 2}" height="${h - 2}" fill="none" stroke="#1c1a17" stroke-width="2.5"/></svg>`;
    return svgTexture(`sp3:${def.id}:${notes.join('|')}:${img ? 1 : 0}`, svg, w * R, h * R);
  }

  const slotSvg = (w, h, round, stage) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"
    width="${w * 2}" height="${h * 2}" font-family="-apple-system,sans-serif">
    <rect width="${w}" height="${h}" fill="var(--art-boardprint)"/>
    <rect width="${w}" height="${h}" fill="#6b4a1e" opacity=".05"/>
    <rect x="5" y="5" width="${w - 10}" height="${h - 10}" rx="9" fill="none" stroke="#5a4526"
      stroke-width="2.4" stroke-dasharray="9 6" opacity=".55"/>
    <text x="${w / 2}" y="${h / 2 + 2}" text-anchor="middle" font-size="22" font-weight="800"
      fill="var(--art-ink)" opacity=".55" font-family="'Hiragino Mincho ProN','Songti TC',serif">第 ${round} 回合</text>
    <text x="${w / 2}" y="${h / 2 + 22}" text-anchor="middle" font-size="12.5" letter-spacing="2"
      fill="var(--art-ink)" opacity=".42" font-family="'Hiragino Mincho ProN','Songti TC',serif">第 ${stage} 階段</text></svg>`;

  // Harvest is a marker between rounds, not a place to stand: a small ribbon with notched
  // ends, printed flat, so it never reads as another action space.
  // A tab hanging from the bottom edge of the round it follows: "harvest after this round".
  const HTAB_W = 112, HTAB_H = 30;
  const harvestSealSvg = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${HTAB_W} ${HTAB_H}" width="${HTAB_W * 3}" height="${HTAB_H * 3}"
    font-family="-apple-system,'PingFang TC',sans-serif">
    <path d="M1 1H${HTAB_W - 1}V${HTAB_H - 8}L${HTAB_W / 2} ${HTAB_H - 1}L1 ${HTAB_H - 8}z" fill="#efe3c3" stroke="#5a4526" stroke-width="1.4" stroke-linejoin="round"/>
    <g transform="translate(6 3) scale(.72)">${ART.ICONS.grain}</g>
    <text x="${HTAB_W / 2 + 9}" y="16" text-anchor="middle" font-size="11.5" font-weight="800" fill="#3a2a14"
      font-family="'Hiragino Mincho ProN','Songti TC',serif">此回合後收成</text></svg>`;
  const HARV_W = 156, HARV_H = 52;
  const harvestSvg = (after) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${HARV_W} ${HARV_H}"
    width="${HARV_W * 2}" height="${HARV_H * 2}" font-family="-apple-system,'PingFang TC','Noto Sans TC',sans-serif">
    <path d="M2 5H154L144 26L154 47H2L12 26z" fill="#26402b" stroke="#b8912f" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M13 9.5H143" stroke="#b8912f" stroke-width="1" opacity=".55"/>
    <g transform="translate(16 14)">${ART.ICONS.grain}</g>
    <text x="88" y="24" text-anchor="middle" font-size="14" font-weight="800" fill="#fff8e6">收成
      <tspan font-size="10" font-weight="700" dx="3" opacity=".85">HARVEST</tspan></text>
    <text x="88" y="39" text-anchor="middle" font-size="11.5" font-weight="600" fill="#fff8e6" opacity=".92">第 ${after} 回合之後</text></svg>`;

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
  // The board is a printed object, so it has its own parchment colour, not a UI colour:
  // linen weave, a darker edge, a gilt double rule and wheat in the corners.
  function boardPrintSvg(w, h) {
    // Cel-style paper: a flat sheet, a flat darker margin band, a crisp highlight along the
    // top edge, gold rules and wheat in the corners. No texture or gradients.
    const corner = (x, y, r) => `<g transform="translate(${x} ${y}) rotate(${r}) scale(1.1)" opacity=".6">${ART.ICONS.grain}</g>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${Math.round(w * 1.2)}" height="${Math.round(h * 1.2)}">
      <rect width="${w}" height="${h}" fill="#8f7f5c"/>
      <rect x="12" y="12" width="${w - 24}" height="${h - 24}" rx="6" fill="var(--art-boardprint)"/>
      <path d="M18 14H${w - 18}" stroke="#d9cba4" stroke-width="2" stroke-linecap="round"/>
      <rect x="5" y="5" width="${w - 10}" height="${h - 10}" rx="7" fill="none" stroke="var(--art-seal)" stroke-width="2.2"/>
      <rect x="12" y="12" width="${w - 24}" height="${h - 24}" rx="6" fill="none" stroke="#5a4526" stroke-width="1.2"/>
      ${corner(2, 2, 0)}${corner(w - 2, 2, 90)}${corner(w - 2, h - 2, 180)}${corner(2, h - 2, 270)}</svg>`;
  }


  function boardSlab(wpx, hpx, cxpx, cypx) {
    const g = new T.Group();
    const w = wpx * PS, d = hpx * PS;
    const frame = new T.Mesh(geo(`bframe${w.toFixed(2)}`, () => new T.BoxGeometry(w, 0.1, d)), mat('#ffffff', { map: frameWood() }));
    frame.castShadow = true; frame.receiveShadow = true;
    g.add(frame);
    const print = svgTexture(`bprint2:${wpx}x${hpx}`, boardPrintSvg(wpx, hpx), Math.round(wpx * 1.2), Math.round(hpx * 1.2));
    const face = plateMesh(print, w - 0.1, d - 0.1, 0, 0, 0.05);
    face.receiveShadow = true;
    g.add(face);
    g.position.set(bx(cxpx), 0, bz(cypx));
    return g;
  }

  function buildActionBoard(G, UI) {
    const g = new T.Group();
    const p = G.players[UI.view] || G.players[0];
    const canPick = !G.choice && !G.staging && !currentStep(G) && !G.feeding && !G.over;

    // The two slabs frame the camera: they never change, unlike the workers and goods on top.
    g.userData.slabs = [boardSlab(SM_W, SM_H, SM_W / 2, SM_H / 2),
      boardSlab(BG_W, BG_H, SM_W + BOARD_GAP + BG_W / 2, BG_H / 2)];
    g.userData.slabs.forEach((sl) => g.add(sl));

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
        const chip = goodsChip(k, sp.goods[k]);
        chip.position.set(cx + w / 2 - 0.24 - i * 0.34, BOARD_Y + 0.03, cz - d / 2 + 0.19);
        g.add(chip);
      });

      // Whoever took the space stands on it.
      // Whoever took the space stands on it: a big worker on a disc of their colour, in the
      // middle of the picture, and the whole space framed in that colour.
      if (sp.occupiedBy !== null) {
        const pc = col(sp.occupiedBy === 0 ? '--p1' : '--p2');
        const dim = new T.Mesh(geo(`dim${w.toFixed(3)}_${d.toFixed(3)}`, () => new T.PlaneGeometry(w, d)),
          new T.MeshBasicMaterial({ color: col('--art-ink'), transparent: true, opacity: 0.16, depthWrite: false }));
        dim.rotation.x = -Math.PI / 2;
        dim.position.set(cx, BOARD_Y + 0.035, cz);
        g.add(dim);
        const fm = mat(pc, { roughness: 0.35 });
        const t = 0.05;
        [[w, t, 0, -d / 2 + t / 2], [w, t, 0, d / 2 - t / 2], [t, d, -w / 2 + t / 2, 0], [t, d, w / 2 - t / 2, 0]].forEach(([bw, bd, ox, oz]) => {
          const bar = new T.Mesh(geo(`occ${bw.toFixed(3)}_${bd.toFixed(3)}`, () => new T.BoxGeometry(bw, 0.025, bd)), fm);
          bar.position.set(cx + ox, BOARD_Y + 0.045, cz + oz);
          g.add(bar);
        });
        const ax = cx + w * 0.12, az = cz + d * 0.02;    // the middle of the picture, clear of name, rules and goods
        const tok = workerToken(pc, true);
        tok.scale.setScalar(1.3);
        tok.position.set(ax, BOARD_Y + 0.035, az);
        g.add(tok);
      }
    };

    BOARD_LAYOUT.small.forEach((id, i) => {
      const c = Math.floor(i / SM.rows), r = i % SM.rows;
      addSpace(spaceDef(id), SM.pad + c * (SM.w + SM.gap), SM.pad + r * (SM.h + SM.gap), SM.w, SM.h);
    });

    const ox = SM_W + BOARD_GAP;
    const cellX = (c) => ox + BG.pad + c * (BG.w + BG.gap);
    const cellY = (r) => BG.pad + r * (BG.h + BG.gap);

    BIG_ORDER.forEach((cell, i) => {
      const [c, r] = bigCell(i);
      if (cell.id) { addSpace(spaceDef(cell.id), cellX(c), cellY(r), BG.w, BG.h); return; }
      const n = cell.round, id = G.roundOrder[n - 1];
      if (G.spaces[id].revealed) {
        addSpace(spaceDef(id), cellX(c), cellY(r), BG.w, BG.h);
      } else {
        const tex = svgTexture(`slot2:${n}`, slotSvg(BG.w, BG.h, n, STAGE_OF[id]), BG.w * 2, BG.h * 2);
        const slot = plateMesh(tex, BG.w * PS, BG.h * PS, bx(cellX(c) + BG.w / 2), bz(cellY(r) + BG.h / 2), BOARD_Y + 0.005);
        slot.userData.hover = { kind: 'slot', round: n };
        hoverables.push(slot);
        g.add(slot);
      }
      if (HARVEST_ROUNDS.includes(n)) {
        // a harvest seal on the round's top-right corner: "harvest after this round"
        const done = G.round > n || (G.round === n && G.phase !== 'work');
        const seal = new T.Mesh(geo('harvTab', () => new T.PlaneGeometry(HTAB_W * PS, HTAB_H * PS)),
          new T.MeshBasicMaterial({ map: svgTexture('htab2', harvestSealSvg(), HTAB_W * 3, HTAB_H * 3), transparent: true, opacity: done ? 0.45 : 1 }));
        seal.rotation.x = -Math.PI / 2;
        // hanging from the cell's bottom edge, over the gap and the top of the next cell's picture
        seal.position.set(bx(cellX(c) + BG.w / 2), BOARD_Y + 0.06, bz(cellY(r) + BG.h + HTAB_H / 2 - 5));
        g.add(seal);
      }
    });

    // Goods that cards have parked on future round spaces sit on those spaces, each player's
    // on a disc of their colour, exactly where the rules say they wait.
    const roundCell = {};
    BIG_ORDER.forEach((cell, i) => { if (cell.round) roundCell[cell.round] = bigCell(i); });
    G.players.forEach((q, pi) => {
      const parked = Object.assign({}, q.futures);
      if (q.handplow && q.handplow > G.round && q.handplow <= 14) {
        parked[q.handplow] = Object.assign({ field: 1 }, parked[q.handplow] || {});
      }
      Object.keys(parked).forEach((rs) => {
        const n = +rs;
        if (!roundCell[n] || n <= G.round) return;
        const [c, r] = roundCell[n];
        const w = BG.w * PS, d = BG.h * PS;
        const cx = bx(cellX(c) + BG.w / 2) + (pi === 0 ? -w / 4 : w / 4);
        const cz = bz(cellY(r) + BG.h / 2) + d * 0.2;
        const kinds = Object.keys(parked[n]).filter((k) => parked[n][k] > 0);
        kinds.forEach((k, j) => {
          const piece = k === 'field'
            ? box(0.3, 0.05, 0.3, col('--art-soil'), 0, 0.05, 0)
            : goodsTray(k, parked[n][k], col(pi === 0 ? '--p1' : '--p2'));
          const holder = new T.Group();
          holder.add(piece);
          holder.position.set(cx + (j - (kinds.length - 1) / 2) * 0.3, BOARD_Y + 0.03, cz + j * 0.02);
          holder.scale.setScalar(0.46);
          g.add(holder);
        });
      });
    });

    g.position.set(LAYOUT.board.x, 0, LAYOUT.board.z);
    return g;
  }

  // ---------------------------------------------------------------- farmyard
  function tileTexture(p, i, inPasture) {
    const t = p.farm[i];
    const v = i % 4;                                         // four variants of each surface
    if (t.kind === 'field') return svgTexture(`f3:${v}:${!!t.crop}`, fieldSvg(v, !!t.crop), 256, 256);
    if (t.kind === 'room') return svgTexture(`y3:${v}`, yardSvg(v), 256, 256);
    return svgTexture(`g3:${v}:${inPasture}`, grassSvg(v, inPasture), 256, 256);
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

    // A wooden tray: a base, a dark bed that shows as grooves between tiles, a raised rim.
    const BW = 5 * TILE + 0.34, BD = 3 * TILE + 0.34;
    const trayWood = frameWood();
    const slab = new T.Mesh(geo(`tray${BW}`, () => new T.BoxGeometry(BW, 0.12, BD)), mat('#ffffff', { map: trayWood }));
    slab.castShadow = true; slab.receiveShadow = true;
    g.add(slab);
    const bed = box(5 * TILE + 0.02, 0.01, 3 * TILE + 0.02, col('--art-soil-dk'), 0, 0.062, 0);
    g.add(bed);
    const rimMat = mat('#ffffff', { map: trayWood });
    [[BW, 0.16, 0, -(BD / 2 - 0.08)], [BW, 0.16, 0, BD / 2 - 0.08], [0.16, BD - 0.32, -(BW / 2 - 0.08), 0], [0.16, BD - 0.32, BW / 2 - 0.08, 0]]
      .forEach(([w, d, x, z]) => {
        const rim = new T.Mesh(geo(`rim${w.toFixed(2)}_${d.toFixed(2)}`, () => new T.BoxGeometry(w, 0.07, d)), rimMat);
        rim.position.set(x, 0.095, z);
        rim.castShadow = true; rim.receiveShadow = true;
        g.add(rim);
        // a painted stripe along the rim in the owner's colour
        const stripe = box(w - 0.04, 0.012, d - 0.04, col(pi === 0 ? '--p1' : '--p2'), x, 0.135, z);
        g.add(stripe);
      });

    // The engine keeps a pasture's animals on one of its tiles. On the table they should
    // spread over the whole pasture, so share each pasture's herd out tile by tile.
    const shown = p.farm.map((t) => (t.animals && t.animals.n ? { kind: t.animals.kind, n: t.animals.n } : null));
    for (const reg of regs) {
      if (!reg.enclosed || reg.tiles.length < 2) continue;
      let kind = null, total = 0;
      for (const ti of reg.tiles) {
        const a = p.farm[ti].animals;
        if (a && a.n) { kind = a.kind; total += a.n; }
        shown[ti] = null;
      }
      if (!total) continue;
      const tiles = reg.tiles.slice().sort((a, b) => a - b);
      tiles.forEach((ti, k) => {
        const n = Math.floor(total / tiles.length) + (k < total % tiles.length ? 1 : 0);
        if (n) shown[ti] = { kind, n };
      });
    }

    for (let i = 0; i < 15; i++) {
      const { x, z } = tilePos(i);
      const t = p.farm[i];
      const reg = regionOf(p, i, regs);
      const inPasture = !!(reg && reg.enclosed);

      const top = new T.Mesh(geo('tiletop', () => new T.BoxGeometry(TILE * 0.955, 0.03, TILE * 0.955)),
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
      const herd = shown[i];
      if (herd) {
        const spots = [[-0.24, -0.2], [0.22, -0.18], [-0.18, 0.22], [0.24, 0.2], [0, 0], [0.02, -0.34]];
        for (let k = 0; k < Math.min(herd.n, spots.length); k++) {
          const a = animalMesh(herd.kind);
          a.position.set(x + spots[k][0], BOARD_Y + 0.015, z + spots[k][1]);
          a.rotation.y = (k * 1.3) % (Math.PI * 2);
          g.add(a);
        }
        if (herd.n > spots.length) {            // a crowded stable: say how many
          const tag = countPlate(herd.kind, herd.n, 1);
          tag.position.set(x + 0.3, BOARD_Y + 0.45, z + 0.3);
          g.add(tag);
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
      lbl.position.set(x - 0.26, BOARD_Y + 0.4, z - 0.34);      // a tag above the corner, clear of the animals
      lbl.scale.setScalar(0.8);
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
        // payable with wood, or clay (Rammed Clay), or a free fence (Hedge Keeper)
        if (!on && (fenceCount(p) >= 15 || !fencePayable(G, p, G.pending.data))) continue;
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
  // The supply tray: every kind of goods this player owns, as real pieces in a row.
  // The supply mat: one printed card, the same look as the HUD — a cream mat, and for each
  // good its coin, a big count and its name. Empty goods are printed faintly, not hidden,
  // so the row always reads in the same order.
  // The player's own board: a band in their colour with name and household, the family
  // standing on its right, and the goods they hold printed underneath.
  const PB_W = 660, PB_HEAD = 50, PB_H = PB_HEAD + 112;
  function supplySvg(p, pc, sub) {
    const kinds = RES.concat(ANIM);
    const W = PB_W, H = PB_H, cw = W / kinds.length, top = PB_HEAD - 4;
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * 2}" height="${H * 2}"
      font-family="-apple-system,'PingFang TC','Noto Sans TC',sans-serif">
      <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="12" fill="var(--art-plate)"/>
      <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="12" fill="${pc}" fill-opacity=".12"/>
      <path d="M1 13a12 12 0 0 1 12-12H${W - 13}a12 12 0 0 1 12 12V${PB_HEAD}H1z" fill="${pc}"/>
      <text x="64" y="33" font-size="25" font-weight="800" fill="#fff" font-family="'Hiragino Mincho ProN','Songti TC',serif">${p.name}</text>
      <text x="${64 + [...p.name].length * 25 + 14}" y="32" font-size="15" font-weight="600" fill="#fff" opacity=".9">${sub}</text>
      <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="12" fill="none" stroke="${pc}" stroke-width="5"/>
      <g transform="translate(0 ${top})">`;
    kinds.forEach((k, i) => {
      const n = ANIM.includes(k) ? animalTotal(p, k) : p.supply[k];
      const x = i * cw;
      if (i) s += `<path d="M${x} 12V${H - 12}" stroke="var(--art-ink)" stroke-width="1" opacity=".18"/>`;
      if (i === RES.length) s += `<path d="M${x} 8V${H - 8}" stroke="var(--art-ink)" stroke-width="2.4" opacity=".35"/>`;
      s += `<g opacity="${n ? 1 : 0.32}">
        <g transform="translate(${x + cw / 2 - 17} 10) scale(${34 / 24})">${ART.tokenMarkup(k)}</g>
        <text x="${x + cw / 2}" y="78" text-anchor="middle" font-size="30" font-weight="800" fill="var(--art-ink)">${n}</text>
        <text x="${x + cw / 2}" y="101" text-anchor="middle" font-size="15" font-weight="600" fill="var(--art-ink)" opacity=".75">${ART.NAMES[k]}</text></g>`;
    });
    return s + '</g></svg>';
  }

  const PB_WORLD_W = 5.3, PB_WORLD_D = PB_WORLD_W * PB_H / PB_W;
  function buildSupply(G, pi) {
    const p = G.players[pi];
    const g = new T.Group();
    const colour = col(pi === 0 ? '--p1' : '--p2');
    const pc = '#' + colour.getHexString();
    const sub = `${HOUSE_ZH[p.house]} ${roomCount(p)} 間 · 田 ${fieldCount(p)} · 家庭 ${p.people} 人`;
    const key = RES.map((k) => p.supply[k]).concat(ANIM.map((k) => animalTotal(p, k))).join(',');
    const tex = svgTexture(`pboard:${pi}:${pc}:${p.name}:${sub}:${key}`, supplySvg(p, pc, sub), PB_W * 2, PB_H * 2);
    const plate = plateMesh(tex, PB_WORLD_W, PB_WORLD_D, 0, 0, 0.04);
    plate.castShadow = true;
    g.add(plate);
    g.userData.plate = plate;
    // the family stands on the right of the name band, used workers laid down
    const headZ = -PB_WORLD_D / 2 + (PB_HEAD / PB_H) * PB_WORLD_D / 2;
    // the family's scarecrow stands in the top-left corner of the band, in their colours
    const sc = scarecrow(colour);
    sc.position.set(-PB_WORLD_W / 2 + 0.28, 0.05, headZ + 0.04);
    sc.rotation.y = 0.25;
    g.add(sc);
    for (let i = 0; i < p.people; i++) {
      const tok = workerToken(colour, i < p.workersLeft);
      tok.scale.setScalar(1.15);
      tok.position.set(PB_WORLD_W / 2 - 0.3 - (p.people - 1 - i) * 0.46, 0.05, headZ);
      g.add(tok);
    }
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

    const colour = pi === 0 ? '--p1' : '--p2';

    // name, family and goods: one board
    const supply = buildSupply(G, pi);
    supply.position.set(LAYOUT.supply.x, 0, LAYOUT.supply.z);
    const plate = supply.userData.plate;
    plate.userData.hover = { kind: 'seat', pi };
    if (pi !== UI.view) {
      plate.userData.pick = { type: 'seat', pi };
      pickables.push(plate);
    }
    hoverables.push(plate);
    g.add(supply);

    // Cards already in front of this player, five to a row, on a marked-out patch of felt.
    const playedGroup = new T.Group();
    const at = LAYOUT.played;
    // five cards to a row inside the mat's double rule; the mat grows a row at a time
    const PER = 5, IN = 0.26, STEP_X = (5.3 - IN * 2 - MAJ_W) / (PER - 1), STEP_Z = MAJ_H + 0.14;
    const rows = Math.max(2, Math.ceil(p.played.length / PER));
    const matD = rows * STEP_Z - 0.14 + IN * 2;
    const zone = playedMat(5.3, +matD.toFixed(2), col(colour));
    const matTop = at.z - 0.88;
    zone.position.set(0, 0, matTop + matD / 2);
    playedGroup.add(zone);
    p.played.forEach((c, i) => {
      const cx = -5.3 / 2 + IN + MAJ_W / 2 + (i % PER) * STEP_X;
      const cz = matTop + IN + MAJ_H / 2 + Math.floor(i / PER) * STEP_Z;
      const m = cardMesh(cardTexture(c, { cost: {} }), MAJ_W, MAJ_H);
      m.position.set(cx, BOARD_Y - 0.02, cz);
      m.rotation.y = ((i * 37) % 11 - 5) * 0.004;
      m.userData.hover = { kind: 'card', uid: c.uid, pi };
      playedGroup.add(m);
      hoverables.push(m);

      // Whatever the card holds sits on it: the Grocer's pile, the Moldboard Plow's fields.
      const on = new T.Group();
      on.position.set(cx, BOARD_Y, cz + 0.12);
      if (c.en === 'Grocer' && p.grocer < GROCER_PILE.length) {
        const left = GROCER_PILE.length - p.grocer;
        for (let k = 0; k < Math.min(left, 4); k++) {    // the stack, top good on top
          const layer = box(0.4, 0.035, 0.4, col('--art-wood-lt'), 0, 0.02 + k * 0.04, 0);
          on.add(layer);
        }
        const top = goodsMesh(GROCER_PILE[p.grocer]);
        top.position.y = 0.04 * Math.min(left, 4) + 0.02;
        top.scale.setScalar(0.9);
        on.add(top);
        on.add(countPlate(GROCER_PILE[p.grocer], left, 0.9));
      }
      if (c.en === 'Moldboard Plow' && p.moldboard > 0) {
        for (let k = 0; k < p.moldboard; k++) on.add(box(0.36, 0.05, 0.36, col('--art-soil'), k * 0.12 - 0.06, 0.03 + k * 0.05, 0));
      }
      if (on.children.length) playedGroup.add(on);
    });
    g.add(playedGroup);
    if (acting) {                 // round the whole column: board, farm and played cards
      const top = LAYOUT.supply.z - PB_WORLD_D / 2, bottom = matTop + matD;
      g.add(outline(5.3 + 0.16, bottom - top + 0.16, 0.09, col(colour).getHex(), 0.07).translateZ((top + bottom) / 2));
    }

    const seat = LAYOUT.seat(pi, G.n);
    g.position.set(seat.x, 0, seat.z);
    g.rotation.y = seat.rot;
    g.userData.parts = { farm, played: playedGroup };
    return g;
  }

  // Where played cards go: a cloth in a deep shade of the player's colour with a faint wave
  // pattern and a double rule, on a lacquered rim of the colour itself; its name faint in the middle.
  function playedMat(w, d, colour) {
    const g = new T.Group();
    const hex = '#' + colour.getHexString();
    const deep = '#' + colour.clone().lerp(new T.Color('#2a2018'), 0.62).getHexString();
    const light = '#' + colour.clone().lerp(new T.Color('#f3e6c8'), 0.4).getHexString();
    const wpx = Math.round(w / PS / 2), hpx = Math.round(d / PS / 2);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${wpx} ${hpx}" width="${wpx * 2}" height="${hpx * 2}">
      <defs><pattern id="wave" width="28" height="14" patternUnits="userSpaceOnUse">
        <path d="M0 14a14 14 0 0 1 28 0M-14 14a14 14 0 0 1 28 0M14 14a14 14 0 0 1 28 0" fill="none" stroke="${light}" stroke-opacity=".12" stroke-width="1.4"/>
        <path d="M4 14a10 10 0 0 1 20 0" fill="none" stroke="${light}" stroke-opacity=".08" stroke-width="1.2"/></pattern></defs>
      <rect width="${wpx}" height="${hpx}" fill="${deep}"/>
      <rect width="${wpx}" height="${hpx}" fill="url(#wave)"/>
      <rect x="7" y="7" width="${wpx - 14}" height="${hpx - 14}" rx="8" fill="none" stroke="${light}" stroke-opacity=".75" stroke-width="2.2"/>
      <rect x="12" y="12" width="${wpx - 24}" height="${hpx - 24}" rx="6" fill="none" stroke="#d8b25a" stroke-opacity=".55" stroke-width="1"/>
      <text x="${wpx / 2}" y="${hpx / 2 + 8}" text-anchor="middle" font-size="22" font-weight="800" fill="${light}" fill-opacity=".35"
        font-family="'Hiragino Mincho ProN','Songti TC',serif" letter-spacing="6">已打出的卡</text></svg>`;
    const rim = new T.Mesh(geo(`pmRim${w}_${d}`, () => new T.BoxGeometry(w, 0.05, d)), mat(colour));
    rim.position.y = -0.01;
    rim.receiveShadow = true;
    g.add(rim);
    const cloth = new T.Mesh(geo(`pmCloth${w}_${d}`, () => new T.PlaneGeometry(w - 0.1, d - 0.1)),
      new T.MeshToonMaterial({ map: svgTexture(`pmCloth:${hex}:${wpx}x${hpx}`, svg, wpx * 2, hpx * 2), gradientMap: TOON_ROOM }));
    cloth.rotation.x = -Math.PI / 2;
    cloth.position.y = 0.016;
    cloth.receiveShadow = true;
    g.add(cloth);
    return g;
  }

  // A scarecrow in the player's colours: a post and crossbar, a burlap head under a straw
  // hat, a shirt in the player's colour and straw poking out of the sleeves.
  function scarecrow(colour) {
    const g = new T.Group();
    const wood = mat('#7a5534'), straw = mat('#d9b451'), burlap = mat('#cdb58a');
    const shirt = mat(colour), dark = mat(colour.clone().lerp(new T.Color('#1c1a17'), 0.35));
    const post = new T.Mesh(geo('scPost', () => new T.CylinderGeometry(0.025, 0.03, 0.7, 6)), wood);
    post.position.y = 0.35; g.add(post);
    const bar = new T.Mesh(geo('scBar', () => new T.CylinderGeometry(0.02, 0.02, 0.5, 6)), wood);
    bar.rotation.z = Math.PI / 2; bar.position.y = 0.5; g.add(bar);
    const body = new T.Mesh(geo('scBody', () => new T.CylinderGeometry(0.075, 0.1, 0.24, 8)), shirt);
    body.position.y = 0.44; g.add(body);
    [-1, 1].forEach((sd) => {
      const sleeve = new T.Mesh(geo('scSleeve', () => new T.CylinderGeometry(0.035, 0.045, 0.16, 6)), shirt);
      sleeve.rotation.z = Math.PI / 2; sleeve.position.set(sd * 0.15, 0.5, 0); g.add(sleeve);
      const tuft = new T.Mesh(geo('scTuft', () => new T.ConeGeometry(0.04, 0.08, 6)), straw);
      tuft.rotation.z = -sd * Math.PI / 2; tuft.position.set(sd * 0.255, 0.5, 0); g.add(tuft);
    });
    const patch = new T.Mesh(geo('scPatch', () => new T.BoxGeometry(0.05, 0.05, 0.01)), dark);
    patch.position.set(0.03, 0.42, 0.095); g.add(patch);
    const head = new T.Mesh(geo('scHead', () => new T.SphereGeometry(0.07, 12, 10)), burlap);
    head.position.y = 0.62; g.add(head);
    const brim = new T.Mesh(geo('scBrim', () => new T.CylinderGeometry(0.13, 0.13, 0.012, 16)), straw);
    brim.position.y = 0.665; g.add(brim);
    const crown = new T.Mesh(geo('scCrown', () => new T.ConeGeometry(0.07, 0.1, 12)), straw);
    crown.position.y = 0.72; g.add(crown);
    const band = new T.Mesh(geo('scBand', () => new T.CylinderGeometry(0.062, 0.066, 0.02, 12)), shirt);
    band.position.y = 0.68; g.add(band);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.raycast = () => {}; } });
    return ink(g);
  }

  // ---------------------------------------------------------------- majors on the table
  const rowZh = (k, d) => (typeof ZH !== 'undefined' && ZH.majorRows && ZH.majorRows[k]) || d;
  const MAJOR_ROWS = [
    { zh: rowZh('cooking', '煮食'), cards: ['Fireplace', 'Cooking Hearth'] },
    { zh: rowZh('baking', '烤麵包'), cards: ['Clay Oven', 'Stone Oven'] },
    { zh: rowZh('workshops', '工坊'), cards: ['Joinery', 'Pottery', "Basketmaker's Workshop"] },
    { zh: rowZh('well', '水井'), cards: ['Well'] },
  ];
  function buildMajors(G, UI) {
    const g = new T.Group();
    const p = G.players[G.current];
    const kinds = playableNow(G);
    const mine = UI.view === G.current && !G.choice;
    // One row across the table, grouped by kind (cooking, baking, workshops, well) with a
    // wider gap between the groups.
    const rowOf = {};
    MAJOR_ROWS.forEach((r, ri) => r.cards.forEach((en) => { rowOf[en] = ri; }));
    const kindOf = (c) => (rowOf[c.en] != null ? rowOf[c.en] : MAJOR_ROWS.length - 1);
    const cards = G.majors.slice().sort((a, b) => kindOf(a) - kindOf(b));
    const GAP = 0.12, KIND_GAP = 0.34;
    const xs = [];
    let x = 0;
    cards.forEach((c, i) => {
      if (i) x += MAJ_W + (kindOf(c) !== kindOf(cards[i - 1]) ? KIND_GAP : GAP);
      xs.push(x);
    });
    const shift = x / 2;
    cards.forEach((c, i) => {
      const owner = c.taken != null ? G.players[c.taken] : null;
      const cost = cardCost(G, p, c);
      const m = cardMesh(cardTexture(c, { cost, taken: owner ? owner.name : '' }), MAJ_W, MAJ_H);
      const cx = xs[i] - shift;
      const cz = 0;
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
    if (UI.main === 'cards') return true;
    if (UI.handHidden) return false;
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
      const playable = mine && kinds.includes(c.type) && canPay(p, cost) && meetsReq(G, p, c);
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
  // The top holds the status bar, the camera tabs and the action bar under them; the bottom
  // only the turn tag, or the hand when it is up.
  // Left: only the camera tabs, up in the top band. Right: the resources and log column.
  const SAFE = { l: 0.06, r: 0.42, t: 0.5, b: 0.1 };
  const SAFE_HAND_B = 0.62;
  let safeB = SAFE.b;

  const FOCUS = {
    // pol is the angle from straight down: ~0.6 reads as leaning over the table.
    // The overview is centred: the right column folds to a strip here too, so both sides
    // keep the same margin.
    table: () => ({ az: 0, pol: 0.62, pad: 1.02, boxes: ['board', 'majors', 'farm0', 'farm1'],
      safe: { l: 0.12, r: 0.12, t: 0.48, b: 0.08 } }),
    // The board fills the width, from the left edge of the screen to the folded right column
    // (84px wide plus its 12px inset), and sits in the vertical middle.
    board: () => ({ az: 0, pol: 0.3, pad: 1, boxes: ['board'], widthOnly: true,
      safe: { l: 0, r: 2 * 96 / Math.max(host.clientWidth, 1), t: 0, b: 0 } }),
    farm: (UI) => ({ az: 0, pol: 0.56, pad: 1.04, boxes: ['farm' + UI.view] }),
    cards: (UI) => ({ az: 0, pol: 0.5, pad: 1.02, boxes: ['played' + UI.view] }),
    majors: () => ({ az: 0, pol: 0.36, pad: 1.03, boxes: ['majors'], safe: { l: 0.05, r: 0.1, t: 0.5, b: 0.08 } }),
  };

  const focusBoxes = {};
  const fitCam = new T.PerspectiveCamera(42, 1.6, 0.1, 200);

  // Frame a box inside the free middle of the screen: project its corners, then slide the
  // target and pull the camera back until the whole thing clears the HUD on every side.
  function fitGoal(box3, pad, safe, widthOnly) {
    const corners = [];
    for (const x of [box3.min.x, box3.max.x])
      for (const y of [box3.min.y, box3.max.y])
        for (const z of [box3.min.z, box3.max.z]) corners.push(new T.Vector3(x, y, z));

    const m = Object.assign({}, SAFE, { b: safeB }, safe || {});
    if (safeB > m.b) m.b = safeB;                 // the hand always wins the bottom
    const availW = 2 - m.l - m.r, availH = 2 - m.t - m.b;
    const safeCx = -1 + m.l + availW / 2;
    const safeCy = -1 + m.b + availH / 2;
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

      const need = (widthOnly ? (maxX - minX) / availW
        : Math.max((maxX - minX) / availW, (maxY - minY) / availH)) * pad;
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
    fitGoal(box3, f.pad, f.safe, f.widthOnly);
    camTween = snap ? 1 : 0;
    if (snap) {
      camState.az = camGoal.az; camState.pol = camGoal.pol;
      camState.dist = camGoal.dist; camState.target.copy(camGoal.target);
      applyCamera();
    }
  }

  function stepCamera(dt) {
    if (camTween >= 1) return false;
    camTween = Math.min(1, camTween + dt / 950);
    const e = camTween < 0.5 ? 4 * camTween ** 3 : 1 - ((-2 * camTween + 2) ** 3) / 2;
    // Take the short way round when swapping to the other side of the table.
    let d = camGoal.az - camState.az;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    camState.az += d * e * 0.35;
    camState.pol += (camGoal.pol - camState.pol) * e * 0.35;
    camState.dist += (camGoal.dist - camState.dist) * e * 0.35;
    camState.target.lerp(camGoal.target, e * 0.35);
    // Land exactly on the goal, or the next refit would carry on from wherever it stopped.
    if (camTween >= 1) {
      camState.az = camGoal.az; camState.pol = camGoal.pol;
      camState.dist = camGoal.dist; camState.target.copy(camGoal.target);
    }
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

    // The wheel steps between the camera views: one notch, one view. A trackpad sends a
    // stream of small deltas, so they are summed and the step waits for a short cooldown.
    let wheelSum = 0, wheelAt = 0;
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const now = performance.now();
      if (now - wheelAt < 450) return;
      wheelSum += e.deltaY;
      if (Math.abs(wheelSum) < 40) return;
      const dir = Math.sign(wheelSum);
      wheelSum = 0; wheelAt = now;
      if (hooks && hooks.onStep) hooks.onStep(dir);
    }, { passive: false });
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
  // and falls away into a dark room. All of it is painted procedurally from the palette.
  let envGroup = null;

  // Small seeded generator, so the grain does not change between rebuilds.
  function rng(seed) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }

  function shade(c, dl) { return c.clone().offsetHSL(0, 0, dl).getStyle(); }

  let frameWoodTex = null, frameWoodTheme = '';
  function frameWood() {
    if (frameWoodTex && frameWoodTheme === theme) return frameWoodTex;
    if (frameWoodTex) frameWoodTex.dispose();
    frameWoodTex = woodTexture('--art-wood', 512);
    frameWoodTex.repeat.set(1, 1);
    frameWoodTheme = theme;
    return frameWoodTex;
  }

  function woodTexture(baseVar, size) {
    // Cel-style planks: two flat tones per plank, a few smooth grain lines in a flat darker
    // tone, a crisp highlight along each plank's top edge and a dark seam. No noise.
    const cv = document.createElement('canvas');
    cv.width = cv.height = size || 1024;
    const x = cv.getContext('2d');
    x.scale(cv.width / 1024, cv.height / 1024);
    const base = col(baseVar || '--art-table');
    const r = rng(7);
    const plank = 128;
    for (let row = 0; row < 1024 / plank; row++) {
      const y0 = row * plank;
      x.fillStyle = shade(base, row % 2 ? 0.02 : -0.01);
      x.fillRect(0, y0, 1024, plank);
      x.fillStyle = shade(base, -0.06);                   // the plank's shadow half
      x.fillRect(0, y0 + plank * 0.62, 1024, plank * 0.38);
      x.strokeStyle = shade(base, -0.12);
      x.lineWidth = 3;
      x.lineCap = 'round';
      for (let k = 0; k < 3; k++) {                       // long, calm grain curves
        const yy = y0 + 22 + r() * (plank - 44), x0 = r() * 700, len = 180 + r() * 260;
        x.beginPath();
        x.moveTo(x0, yy);
        x.bezierCurveTo(x0 + len * 0.3, yy - 8, x0 + len * 0.7, yy + 8, x0 + len, yy);
        x.stroke();
      }
      if (r() < 0.5) {                                    // a knot: two flat ovals
        const kx = 80 + r() * 860, ky = y0 + 40 + r() * 40;
        x.fillStyle = shade(base, -0.14);
        x.beginPath(); x.ellipse(kx, ky, 18, 7, 0, 0, Math.PI * 2); x.fill();
        x.fillStyle = shade(base, -0.05);
        x.beginPath(); x.ellipse(kx, ky, 9, 3.5, 0, 0, Math.PI * 2); x.fill();
      }
      x.fillStyle = shade(base, 0.1);                     // highlight on the top edge
      x.fillRect(0, y0 + 4, 1024, 3);
      x.fillStyle = shade(base, -0.22);                   // seam
      x.fillRect(0, y0, 1024, 4);
      for (let k = 0; k < 2; k++) {                       // plank ends
        const ex = ((row * 397 + k * 512) % 1024);
        x.fillRect(ex, y0, 4, plank);
      }
    }
    const tex = new T.CanvasTexture(cv);
    tex.colorSpace = T.SRGBColorSpace;
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.anisotropy = 8;
    return tex;
  }


  // Felt in cel style: a flat base, a flat lighter field inside, a stitched border.
  function matTexture(w, h) {
    const cv = document.createElement('canvas');
    cv.width = 1024; cv.height = Math.round(1024 * h / w);
    const x = cv.getContext('2d');
    const base = col('--art-mat');
    const W = cv.width, H = cv.height;
    x.fillStyle = shade(base, -0.03);
    x.fillRect(0, 0, W, H);
    const inset = 26;
    x.fillStyle = shade(base, 0.02);
    x.beginPath();
    x.roundRect(inset + 14, inset + 14, W - (inset + 14) * 2, H - (inset + 14) * 2, 18);
    x.fill();
    x.strokeStyle = shade(base, 0.22);
    x.lineWidth = 4;
    x.setLineDash([16, 10]);
    x.strokeRect(inset, inset, W - inset * 2, H - inset * 2);
    x.setLineDash([]);
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


  // ---------------------------------------------------------------- the forest clearing
  // The other setting: no table at all. The game lies on a sunny meadow in the middle of a
  // wood — forest floor all round, a ring of cel-shaded trees just outside the play area,
  // and sky above. Chosen in the menu (scene: 'forest' or 'table').
  let sceneStyle = 'forest';
  function setScene(s) {
    const next = s === 'table' ? 'table' : 'forest';
    if (next === sceneStyle) return;
    sceneStyle = next;
    if (ready) { buildEnvironment(); matKey = ''; if (tableGroup) fitMat(boxOf(tableGroup)); }
  }

  function forestFloorTexture() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 512;
    const x = cv.getContext('2d');
    x.fillStyle = '#3f5a33'; x.fillRect(0, 0, 512, 512);
    const r = rng(23);
    const tones = ['#36502c', '#4a6838', '#56733d', '#5d4a2e'];
    for (let i = 0; i < 90; i++) {                        // flat patches of moss, grass, soil
      x.fillStyle = tones[i % tones.length];
      x.beginPath();
      x.ellipse(r() * 512, r() * 512, 14 + r() * 34, 8 + r() * 20, r() * 3, 0, Math.PI * 2);
      x.fill();
    }
    for (let i = 0; i < 160; i++) {                       // fallen leaves
      x.fillStyle = r() < 0.5 ? '#b8862f' : '#8a5a2a';
      x.beginPath(); x.ellipse(r() * 512, r() * 512, 3.5, 1.8, r() * 3, 0, Math.PI * 2); x.fill();
    }
    const tex = new T.CanvasTexture(cv);
    tex.colorSpace = T.SRGBColorSpace;
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    return tex;
  }

  // The meadow: a rounded, slightly wobbly patch of light grass with a darker fringe of
  // tufts and a few flowers, transparent outside so the forest floor shows round it.
  function meadowTexture(w, h, pad) {
    const S = 1024 / Math.max(w, h);
    const cv = document.createElement('canvas');
    cv.width = Math.round(w * S); cv.height = Math.round(h * S);
    const x = cv.getContext('2d');
    const W = cv.width, H = cv.height, P = pad * S;
    const r = rng(41);
    const shape = (inset, wobble) => {
      x.beginPath();
      const n = 64;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const cx = W / 2 + Math.cos(a) * (W / 2 - inset), cy = H / 2 + Math.sin(a) * (H / 2 - inset);
        // squash the ellipse towards a rounded rectangle, then wobble the edge
        const sx = Math.sign(Math.cos(a)) * Math.pow(Math.abs(Math.cos(a)), 0.35) * (W / 2 - inset);
        const sy = Math.sign(Math.sin(a)) * Math.pow(Math.abs(Math.sin(a)), 0.35) * (H / 2 - inset);
        const wob = 1 + Math.sin(i * 2.7) * wobble + Math.sin(i * 1.3 + 1) * wobble * 0.6;
        const px = W / 2 + sx * wob, py = H / 2 + sy * wob;
        if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
        void cx; void cy;
      }
      x.closePath();
    };
    // A village green rather than a flower meadow: a deep, even grass kept quiet so the
    // boards read clearly, with broad mown strips, a few worn earth patches and dry tufts.
    x.fillStyle = '#44592f'; shape(P * 0.1, 0.012); x.fill();       // longer grass at the edge
    x.fillStyle = '#5b7340'; shape(P * 0.45, 0.01); x.fill();       // the green
    x.save(); shape(P * 0.45, 0.01); x.clip();
    for (let i = 0; i < 120; i++) {                                 // soft tone changes, no drawn blades
      x.fillStyle = r() < 0.5 ? 'rgba(98,122,68,.18)' : 'rgba(72,94,50,.16)';
      x.beginPath(); x.ellipse(r() * W, r() * H, 40 + r() * 90, 20 + r() * 50, r() * 3, 0, Math.PI * 2); x.fill();
    }
    for (let i = 0; i < 9; i++) {                                   // worn earth, near the edge
      const ex = r() < 0.5 ? P * (0.5 + r() * 0.5) : W - P * (0.5 + r() * 0.5);
      const ey = P + r() * (H - 2 * P);
      const [ax, ay] = r() < 0.5 ? [ex, ey] : [P + r() * (W - 2 * P), r() < 0.5 ? P * (0.5 + r() * 0.5) : H - P * (0.5 + r() * 0.5)];
      x.fillStyle = 'rgba(122,98,62,.5)';
      x.beginPath(); x.ellipse(ax, ay, 26 + r() * 40, 12 + r() * 16, r() * 3, 0, Math.PI * 2); x.fill();
      x.fillStyle = 'rgba(122,98,62,.28)';
      x.beginPath(); x.ellipse(ax + 8, ay - 4, 40 + r() * 40, 18 + r() * 18, r() * 3, 0, Math.PI * 2); x.fill();
    }
    x.restore();
    const tex = new T.CanvasTexture(cv);
    tex.colorSpace = T.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }

  let skyCanvas = null;
  function paintSky(cols) {
    const x = skyCanvas.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, '#' + cols[0].getHexString()); g.addColorStop(0.55, '#' + cols[1].getHexString());
    g.addColorStop(1, '#' + cols[2].getHexString());
    x.fillStyle = g; x.fillRect(0, 0, 16, 512);
  }
  function skyTexture() {
    skyCanvas = document.createElement('canvas');
    skyCanvas.width = 16; skyCanvas.height = 512;
    paintSky(season.sky);
    const tex = new T.CanvasTexture(skyCanvas);
    tex.colorSpace = T.SRGBColorSpace;
    return tex;
  }

  // Cel-shaded trees: a round broadleaf and a tiered pine, each in a couple of greens.
  function forestTree(kind, h, tone) {
    const g = new T.Group();
    const trunk = new T.Mesh(geo('ftrunk', () => new T.CylinderGeometry(0.09, 0.14, 1, 7)), mat(new T.Color('#6b4a2c')));
    trunk.scale.set(1, h * 0.38, 1); trunk.position.y = h * 0.19; trunk.castShadow = true;
    g.add(trunk);
    const greens = [['#3f6b35', '#557f3f'], ['#4b7a3a', '#6a9446'], ['#35603a', '#4a7a48']][tone % 3];
    if (kind === 'pine') {
      for (let k = 0; k < 3; k++) {
        const c = new T.Mesh(geo('fcone', () => new T.ConeGeometry(1, 1, 8)), mat(new T.Color(greens[k % 2])));
        c.userData.leaf = { base: new T.Color(greens[k % 2]), round: false, pine: true, i: k + tone };
        const sc = (1 - k * 0.25) * h * 0.32;
        c.scale.set(sc, h * 0.34, sc); c.position.y = h * (0.42 + k * 0.2); c.castShadow = true;
        g.add(c);
      }
    } else {
      [[0, 0.62, 0, 0.36], [-0.18, 0.52, 0.08, 0.26], [0.2, 0.55, -0.06, 0.27], [0.02, 0.8, 0.02, 0.24]].forEach(([dx, dy, dz, rr], k) => {
        const b = new T.Mesh(geo('fball', () => new T.SphereGeometry(1, 12, 10)), mat(new T.Color(greens[k % 2])));
        b.userData.leaf = { base: new T.Color(greens[k % 2]), round: true, i: k + tone };
        b.scale.setScalar(rr * h); b.position.set(dx * h, dy * h, dz * h); b.castShadow = true;
        g.add(b);
      });
    }
    return ink(g);
  }

  function forestBush(s) {
    const g = new T.Group();
    [[0, 0.22, 0, 0.3], [0.26, 0.16, 0.06, 0.22], [-0.24, 0.16, -0.04, 0.22]].forEach(([dx, dy, dz, rr], k) => {
      const b = new T.Mesh(geo('fball', () => new T.SphereGeometry(1, 12, 10)), mat(new T.Color(k ? '#4f7a3a' : '#5f8c44')));
      b.userData.leaf = { base: new T.Color(k ? '#4f7a3a' : '#5f8c44'), round: true, i: k };
      b.scale.setScalar(rr * s); b.position.set(dx * s, dy * s, dz * s); b.castShadow = true;
      g.add(b);
    });
    return ink(g);
  }

  // Real grass: tufts of thin blades, cel-shaded, dark at the root and lighter at the tip,
  // scattered over the meadow round the play area (never under or between the boards).
  function grassTuftGeometry() {
    const pos = [], colr = [];
    const root = new T.Color('#3b5327'), tip = new T.Color('#8fae5c');
    const blades = 7;
    for (let b = 0; b < blades; b++) {
      const a = (b / blades) * Math.PI * 2 + b * 0.7;
      const lean = 0.18 + (b % 3) * 0.1, h = 0.75 + ((b * 37) % 10) / 22, wdt = 0.07;
      const bx = Math.cos(a) * 0.05, bz = Math.sin(a) * 0.05;
      const px = -Math.sin(a) * wdt, pz = Math.cos(a) * wdt;
      pos.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, bx + Math.cos(a) * lean, h, bz + Math.sin(a) * lean);
      colr.push(root.r, root.g, root.b, root.r, root.g, root.b, tip.r, tip.g, tip.b);
    }
    const gg = new T.BufferGeometry();
    gg.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    gg.setAttribute('color', new T.Float32BufferAttribute(colr, 3));
    gg.computeVertexNormals();
    return gg;
  }
  function grassField(mx0, mx1, mz0, mz1, holes) {
    const r = rng(303);
    const spots = [];
    const area = (mx1 - mx0) * (mz1 - mz0);
    for (let i = 0; i < area * 7 && spots.length < 2500; i++) {
      const x = mx0 + r() * (mx1 - mx0), z = mz0 + r() * (mz1 - mz0);
      if (holes.some((h) => x > h.min.x && x < h.max.x && z > h.min.z && z < h.max.z)) continue;
      spots.push([x, z]);
      if (r() < 0.25) spots.push([x + (r() - 0.5) * 0.25, z + (r() - 0.5) * 0.25]);   // clumps
    }
    const m = new T.MeshToonMaterial({ vertexColors: true, gradientMap: TOON_ROOM, side: T.DoubleSide });
    const inst = new T.InstancedMesh(geo('grassTuft', grassTuftGeometry), m, spots.length);
    const o = new T.Object3D(), c = new T.Color();
    spots.forEach(([x, z], k) => {
      o.position.set(x, -0.07, z);
      o.rotation.set(0, r() * 6.28, 0);
      const sc = 0.13 + r() * 0.11;
      o.scale.set(sc, sc * (0.8 + r() * 0.6), sc);
      o.updateMatrix();
      inst.setMatrixAt(k, o.matrix);
      c.setHSL(0.24 + r() * 0.05, 0.3 + r() * 0.15, 0.62 + r() * 0.3);
      inst.setColorAt(k, c);
    });
    inst.receiveShadow = true;
    inst.userData.sharedGeo = true;             // the tuft geometry is cached; keep it on refit
    inst.userData.surface = true;
    return inst;
  }

  // Grey field stones, low and chunky, a few together.
  function fieldRock(s, tone) {
    const g = new T.Group();
    const cols = ['#8c8a80', '#7a786f', '#9a978b'];
    [[0, 0, 0, 1], [0.7, 0, 0.25, 0.55], [-0.55, 0, 0.35, 0.4]].slice(0, 1 + (tone % 3)).forEach(([dx, , dz, k], i) => {
      const m = new T.Mesh(geo('rock', () => new T.DodecahedronGeometry(1, 0)), mat(new T.Color(cols[(tone + i) % 3])));
      m.scale.set(s * k, s * k * 0.55, s * k * 0.85);
      m.position.set(dx * s, s * k * 0.2, dz * s);
      m.rotation.set(i * 0.7, tone + i * 1.3, i * 0.4);
      m.castShadow = true;
      g.add(m);
    });
    return ink(g);
  }

  // Paper lanterns hung in a tree for the harvest festival; hidden the rest of the year.
  function lanterns(tree, h, r) {
    const n = 1 + (r() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const g = new T.Group();
      g.userData.festival = true;
      g.visible = false;
      const a = r() * 6.28, rad = h * 0.3;
      const body = new T.Mesh(geo('lantern', () => new T.SphereGeometry(1, 12, 10)),
        new T.MeshBasicMaterial({ color: new T.Color(['#ff6a3a', '#ffb347', '#ff8a4c'][i % 3]) }));
      body.scale.set(0.24, 0.32, 0.24);
      g.add(body);
      const cord = new T.Mesh(geo('lanternCord', () => new T.CylinderGeometry(0.008, 0.008, 1, 4)), new T.MeshBasicMaterial({ color: '#2a1a10' }));
      cord.scale.y = 0.3; cord.position.y = 0.3;
      g.add(cord);
      g.position.set(Math.cos(a) * rad * 1.5, h * (0.26 + r() * 0.1), Math.sin(a) * rad * 1.5);
      tree.add(g);
    }
  }

  // ---------------------------------------------------------------- scenery in the woods
  // A pond fed by a stream with a rope bridge, a log cabin, a garden pavilion and hills on
  // the horizon. Each carries its seasonal details: pieces tagged `only` show in just those
  // seasons (0 sunny, 1 rain, 2 autumn, 3 snow, 4 blossom, 5 festival); `water` and `lit`
  // materials change colour with the season in seasonTargets().
  const WATER = ['#5fa3c4', '#557a88', '#6a93a0', '#dcebf2', '#6ab0cc', '#2c4466'];
  const only = (o, seasons) => { o.userData.only = seasons; o.visible = seasons.includes(seasonIdx); return o; };
  const natural = (m, base, round) => { m.userData.leaf = { base: new T.Color(base), round: !!round, i: 0 }; return m; };
  const waterMat = () => new T.MeshToonMaterial({ color: new T.Color(WATER[0]), gradientMap: TOON_ROOM });
  const glowMat = (c) => new T.MeshBasicMaterial({ color: new T.Color(c) });
  const flat = (geoKey, make, material, x, y, z, sx, sz) => {
    const m = new T.Mesh(geo(geoKey, make), material);
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.scale.set(sx || 1, sz || 1, 1);
    m.receiveShadow = true;
    return m;
  };

  function pond(rx, rz, r) {
    const g = new T.Group();
    const shoreC = '#8b7b52';
    g.add(natural(flat('disc', () => new T.CircleGeometry(1, 40), mat(shoreC), 0, -0.064, 0, rx + 0.2, rz + 0.2), shoreC));
    const water = flat('disc', () => new T.CircleGeometry(1, 40), waterMat(), 0, -0.058, 0, rx, rz);
    water.userData.water = true;
    g.add(water);
    for (let i = 0; i < 6; i++) {                           // lily pads, gone under the ice
      const a = r() * 6.28, d = 0.3 + r() * 0.5;
      g.add(only(natural(flat('lily', () => new T.CircleGeometry(0.09, 12, 0.3, 5.9), mat('#4f8a3c'),
        Math.cos(a) * rx * d, -0.05, Math.sin(a) * rz * d), '#4f8a3c'), [0, 1, 2, 4, 5]));
    }
    const floaters = (n, colours, seasons, size, glow) => {
      for (let i = 0; i < n; i++) {
        const a = r() * 6.28, d = r() * 0.8;
        const m = glow
          ? new T.Mesh(geo('pondLantern', () => new T.SphereGeometry(0.07, 10, 8)), glowMat(colours[i % colours.length]))
          : flat('floatLeaf', () => new T.CircleGeometry(1, 6), mat(colours[i % colours.length]), 0, 0, 0, size, size * 0.6);
        m.position.set(Math.cos(a) * rx * d, glow ? -0.02 : -0.048, Math.sin(a) * rz * d);
        if (!glow) m.rotation.z = r() * 6.28;
        g.add(only(m, seasons));
      }
    };
    floaters(10, ['#c8612c', '#e0a034', '#a8432a'], [2], 0.06);
    floaters(14, ['#f7c6d3', '#f2a9bf'], [4], 0.04);
    floaters(5, ['#ffb347', '#ff7a3c'], [5], 0, true);
    for (let i = 0; i < 7; i++) {                           // reeds at the edge
      const a = 2.2 + r() * 1.8;
      const clump = new T.Group();
      for (let k = 0; k < 4; k++) {
        const reed = natural(new T.Mesh(geo('reed', () => new T.ConeGeometry(0.018, 0.4, 4)), mat('#6f8a3a')), '#6f8a3a');
        reed.position.set((k - 1.5) * 0.04, 0.15 + (k % 2) * 0.04, (k % 2) * 0.03);
        reed.rotation.z = (k - 1.5) * 0.12;
        clump.add(reed);
      }
      clump.position.set(Math.cos(a) * (rx + 0.05), -0.06, Math.sin(a) * (rz + 0.05));
      g.add(clump);
    }
    for (let i = 0; i < 5; i++) {
      const a = r() * 6.28;
      const rock = fieldRock(0.1 + r() * 0.08, i);
      rock.position.set(Math.cos(a) * (rx + 0.15), -0.07, Math.sin(a) * (rz + 0.15));
      g.add(rock);
    }
    return ink(g);
  }

  // A winding stream: a flat ribbon of water along a curve.
  function stream(points, width) {
    const curve = new T.CatmullRomCurve3(points.map(([x, z]) => new T.Vector3(x, -0.058, z)));
    const n = 40, pos = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, p = curve.getPoint(t), d = curve.getTangent(t);
      const nx = -d.z, nz = d.x, w = width * (0.8 + 0.2 * Math.sin(t * 9));
      pos.push(p.x + nx * w / 2, p.y, p.z + nz * w / 2, p.x - nx * w / 2, p.y, p.z - nz * w / 2);
      if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const gg = new T.BufferGeometry();
    gg.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    gg.setIndex(idx);
    gg.computeVertexNormals();
    const m = waterMat(); m.side = T.DoubleSide;
    const water = new T.Mesh(gg, m);
    water.userData.water = true;
    water.receiveShadow = true;
    water.userData.curve = curve;
    return water;
  }

  // A little rope bridge: arched planks, four posts, a sagging rope each side.
  function ropeBridge(len) {
    const g = new T.Group();
    const wood = mat('#8a6040'), rope = mat('#c9b27a');
    const n = 9;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), x = (t - 0.5) * len;
      const plank = new T.Mesh(geo('plank', () => new T.BoxGeometry(0.11, 0.03, 0.5)), wood);
      plank.position.set(x, 0.02 + Math.sin(t * Math.PI) * 0.14, 0);
      plank.rotation.z = Math.cos(t * Math.PI) * -0.25;
      plank.castShadow = true;
      g.add(plank);
      g.add(only(new T.Mesh(geo('plankSnow', () => new T.BoxGeometry(0.11, 0.015, 0.46)), mat('#f3f6f9'))
        .translateX(x).translateY(0.045 + Math.sin(t * Math.PI) * 0.14), [3]));
    }
    [-1, 1].forEach((ex) => [-1, 1].forEach((ez) => {
      const post = new T.Mesh(geo('bPost', () => new T.CylinderGeometry(0.03, 0.035, 0.42, 6)), wood);
      post.position.set(ex * len / 2, 0.16, ez * 0.27); post.castShadow = true;
      g.add(post);
    }));
    [-1, 1].forEach((ez) => {
      for (let k = 0; k < 2; k++) {                          // each rope in two sagging halves
        const seg = new T.Mesh(geo('bRope', () => new T.CylinderGeometry(0.008, 0.008, 1, 4)), rope);
        seg.scale.y = len / 2 * 1.02;
        seg.rotation.z = Math.PI / 2 + (k ? 0.12 : -0.12);
        seg.position.set((k ? 1 : -1) * len / 4, 0.3, ez * 0.27);
        g.add(seg);
      }
    });
    return ink(g);
  }

  const prism = () => {
    const sh = new T.Shape();
    sh.moveTo(-0.78, 0); sh.lineTo(0.78, 0); sh.lineTo(0, 0.55); sh.closePath();
    const gg = new T.ExtrudeGeometry(sh, { depth: 1.14, bevelEnabled: false });
    gg.translate(0, 0, -0.57);
    return gg;
  };
  function cabin() {
    const g = new T.Group();
    const logs = mat('#9a6a40'), roofM = mat('#7a3b2a'), stone = mat('#7c786e'), dark = mat('#3a2616');
    const walls = new T.Mesh(geo('cabWalls', () => new T.BoxGeometry(1.3, 0.72, 0.95)), logs);
    walls.position.y = 0.36; walls.castShadow = true; g.add(walls);
    for (let k = 1; k < 5; k++) {                            // log courses
      const line = new T.Mesh(geo('cabLog', () => new T.BoxGeometry(1.32, 0.02, 0.97)), mat('#7c5230'));
      line.position.y = k * 0.145; g.add(line);
    }
    const roof = new T.Mesh(geo('cabRoof', prism), roofM);
    roof.position.y = 0.72; roof.castShadow = true; g.add(roof);
    const snow = new T.Mesh(geo('cabRoof', prism), mat('#f3f6f9'));
    snow.position.y = 0.76; snow.scale.set(1.02, 0.9, 1.02);
    g.add(only(snow, [3]));
    const door = new T.Mesh(geo('cabDoor', () => new T.BoxGeometry(0.26, 0.44, 0.02)), dark);
    door.position.set(-0.28, 0.22, 0.48); g.add(door);
    [0.18, 0.46].forEach((x) => {
      const win = new T.Mesh(geo('cabWin', () => new T.BoxGeometry(0.2, 0.18, 0.02)), new T.MeshToonMaterial({ color: '#3a2a1a', gradientMap: TOON_STEPS }));
      win.position.set(x, 0.42, 0.48);
      win.userData.lit = true;
      g.add(win);
    });
    const chim = new T.Mesh(geo('cabChim', () => new T.BoxGeometry(0.18, 0.5, 0.18)), stone);
    chim.position.set(0.42, 1.0, -0.15); chim.castShadow = true; g.add(chim);
    const smoke = new T.Group();
    [[0, 1.34, 0.1], [0.08, 1.52, 0.13], [0.2, 1.72, 0.16]].forEach(([x, y, rr]) => {
      const puff = new T.Mesh(geo('puff', () => new T.SphereGeometry(1, 10, 8)),
        new T.MeshToonMaterial({ color: '#d8d6d0', gradientMap: TOON_ROOM, transparent: true, opacity: 0.8 }));
      puff.scale.setScalar(rr); puff.position.set(0.42 + x, y, -0.15);
      puff.userData.noInk = true;
      smoke.add(puff);
    });
    g.add(only(smoke, [1, 2, 3, 5]));
    const pile = new T.Group();                              // a woodpile against the side wall
    for (let k = 0; k < 6; k++) {
      const log = new T.Mesh(geo('pileLog', () => new T.CylinderGeometry(0.05, 0.05, 0.4, 7)), mat('#8a5a34'));
      log.rotation.x = Math.PI / 2; log.position.set(0.72, 0.05 + Math.floor(k / 3) * 0.09, (k % 3 - 1) * 0.1 + (k > 2 ? 0.05 : 0));
      pile.add(log);
    }
    g.add(pile);
    return ink(g);
  }

  function pavilion() {
    const g = new T.Group();
    const white = mat('#efe6d6'), slate = mat('#58707e'), stone = mat('#a39d8f');
    const floor = new T.Mesh(geo('pavFloor', () => new T.CylinderGeometry(0.78, 0.84, 0.12, 6)), stone);
    floor.position.y = 0.0; floor.receiveShadow = true; g.add(floor);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      const post = new T.Mesh(geo('pavPost', () => new T.CylinderGeometry(0.035, 0.04, 0.78, 6)), white);
      post.position.set(Math.cos(a) * 0.66, 0.45, Math.sin(a) * 0.66); post.castShadow = true;
      g.add(post);
      if (i % 2 === 0) {
        const lan = new T.Mesh(geo('pavLantern', () => new T.SphereGeometry(0.075, 10, 8)), glowMat(['#ff6a3a', '#ffb347', '#ff8a4c'][i / 2]));
        lan.position.set(Math.cos(a + 0.52) * 0.7, 0.68, Math.sin(a + 0.52) * 0.7);
        g.add(only(lan, [5]));
      }
      if (i % 2 === 1) {                                      // flowers garland in blossom time
        const fl = new T.Mesh(geo('pavFlower', () => new T.SphereGeometry(0.08, 8, 6)), mat('#f2b3c6'));
        fl.position.set(Math.cos(a) * 0.66, 0.8, Math.sin(a) * 0.66);
        g.add(only(fl, [4]));
      }
    }
    const rail = new T.Mesh(geo('pavRail', () => new T.TorusGeometry(0.66, 0.02, 4, 6)), white);
    rail.rotation.x = Math.PI / 2; rail.rotation.z = Math.PI / 6; rail.position.y = 0.3; g.add(rail);
    const roof = new T.Mesh(geo('pavRoof', () => new T.ConeGeometry(1.0, 0.55, 6)), slate);
    roof.position.y = 1.1; roof.rotation.y = Math.PI / 6; roof.castShadow = true; g.add(roof);
    const snow = new T.Mesh(geo('pavRoof', () => new T.ConeGeometry(1.0, 0.55, 6)), mat('#f3f6f9'));
    snow.position.y = 1.14; snow.rotation.y = Math.PI / 6; snow.scale.set(0.96, 0.9, 0.96);
    g.add(only(snow, [3]));
    const fin = new T.Mesh(geo('pavFin', () => new T.SphereGeometry(0.06, 8, 6)), mat('#d8b25a'));
    fin.position.y = 1.42; g.add(fin);
    return ink(g);
  }

  function hills(cx, zFar) {
    const g = new T.Group();
    [[-18, 0, 11, 3.6, 7, '#6f9a52'], [-4, -3, 13, 4.4, 8, '#628c49'], [12, 1, 12, 3.8, 7, '#6f9a52'], [26, -2, 10, 3.2, 6, '#5d8646']]
      .forEach(([x, dz, sx, sy, sz, c]) => {
        const h = natural(new T.Mesh(geo('hill', () => new T.SphereGeometry(1, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2)), mat(c)), c);
        h.scale.set(sx, sy, sz); h.position.set(cx + x, -0.1, zFar + dz);
        g.add(h);
      });
    return g;
  }

  // Everything that depends on the size of the play area: the meadow, and the trees round it.
  // Footprints of everything lying on the meadow (each board, card, farm and tray), a
  // little enlarged, so grass grows round and between them but never through them.
  function grassHoles() {
    const out = [];
    if (!tableGroup) return out;
    tableGroup.children.forEach((top) => top.children.forEach((c) => {
      if (c.userData.inkline) return;
      const b = boxOf(c);
      if (!b.isEmpty()) out.push(b.expandByScalar(0.12));
    }));
    return out;
  }
  function buildClearing(x0, x1, z0, z1) {
    const g = new T.Group();
    const pad = 0.8;
    const mw = x1 - x0 + pad * 2, mh = z1 - z0 + pad * 2;
    const meadow = new T.Mesh(new T.PlaneGeometry(mw, mh),
      new T.MeshToonMaterial({ map: meadowTexture(mw, mh, pad), transparent: true, gradientMap: TOON_ROOM, depthWrite: false }));
    meadow.rotation.x = -Math.PI / 2;
    meadow.position.set((x0 + x1) / 2, -0.07, (z0 + z1) / 2);
    meadow.receiveShadow = true;
    meadow.userData.surface = true;
    g.add(meadow);
    // tufts over the meadow, kept a little off the edge and clear of the boards
    g.add(grassField(x0 - pad * 0.85, x1 + pad * 0.85, z0 - pad * 0.85, z1 + pad * 0.85, grassHoles()));

    // A ring of trees just outside the meadow. The near side (towards the camera) only gets
    // low bushes, far out, so nothing ever stands between you and the table.
    const r = rng(77);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const hx = (x1 - x0) / 2 + pad - 0.1, hz = (z1 - z0) / 2 + pad - 0.1;
    // Scenery first, so the trees can keep clear of it.
    const keep = [];
    const pc = { x: x0 - pad - 1.3, z: z0 + (z1 - z0) * 0.38 };
    const pnd = pond(0.95, 1.4, r);
    pnd.position.set(pc.x, 0, pc.z);
    g.add(pnd);
    keep.push({ x: pc.x, z: pc.z, r: 1.9 }, { x: pc.x, z: pc.z + 1, r: 1.5 }, { x: pc.x, z: pc.z - 1, r: 1.5 });
    const brook = stream([[pc.x - 0.5, pc.z + 1.1], [pc.x - 1.8, pc.z + 2.2], [pc.x - 2.6, pc.z + 1.4], [pc.x - 4.5, pc.z + 2.4], [pc.x - 7, pc.z + 1.6]], 0.5);
    g.add(brook);
    for (let t = 0; t <= 1; t += 0.06) { const q = brook.userData.curve.getPoint(t); keep.push({ x: q.x, z: q.z, r: 1.0 }); }
    const bq = brook.userData.curve.getPoint(0.2), bt = brook.userData.curve.getTangent(0.2);
    const bridge = ropeBridge(1.3);
    bridge.position.set(bq.x, -0.06, bq.z);
    bridge.rotation.y = -Math.atan2(-bt.x, -bt.z) + Math.PI / 2 + Math.PI / 2;
    g.add(bridge);
    const cab = cabin();
    const cc = { x: x1 + pad + 0.9, z: z0 + (z1 - z0) * 0.62 };
    cab.position.set(cc.x, -0.07, cc.z); cab.rotation.y = -0.9;
    g.add(cab);
    keep.push({ x: cc.x, z: cc.z, r: 2.1 });
    const pav = pavilion();
    const pv = { x: x1 + pad + 0.8, z: z0 + (z1 - z0) * 0.3 };
    pav.position.set(pv.x, -0.02, pv.z);
    g.add(pav);
    keep.push({ x: pv.x, z: pv.z, r: 2.0 });
    g.add(hills(cx, z0 - 18));
    // festival garlands: poles along both sides and the far edge, lanterns on a sagging line
    const garland = (ax, az, bx, bz) => {
      const gg = new T.Group();
      gg.userData.festival = true; gg.visible = seasonIdx === 5;
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(3, Math.round(len / 0.55));
      [[ax, az], [bx, bz]].forEach(([px, pz]) => {
        const pole = new T.Mesh(geo('gPole', () => new T.CylinderGeometry(0.035, 0.04, 1.3, 6)), mat('#6b4a2c'));
        pole.position.set(px, 0.58, pz); pole.castShadow = true; gg.add(pole);
      });
      for (let i = 0; i <= n; i++) {
        const t = i / n, y = 1.18 - Math.sin(t * Math.PI) * 0.35;
        const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
        if (i && i < n) {
          const lan = new T.Mesh(geo('gLantern', () => new T.SphereGeometry(1, 12, 10)), glowMat(['#ff5a3a', '#ffb347', '#ff8a4c', '#ffd46a'][i % 4]));
          lan.scale.set(0.12, 0.16, 0.12); lan.position.set(px, y - 0.16, pz);
          gg.add(lan);
        }
        if (i) {
          const qx = ax + (bx - ax) * (i - 1) / n, qz = az + (bz - az) * (i - 1) / n, qy = 1.18 - Math.sin((i - 1) / n * Math.PI) * 0.35;
          const seg = new T.Mesh(geo('gLine', () => new T.CylinderGeometry(0.008, 0.008, 1, 4)), mat('#2a1a10'));
          const dx = px - qx, dy = y - qy, dz = pz - qz, L = Math.hypot(dx, dy, dz);
          seg.scale.y = L; seg.position.set((px + qx) / 2, (y + qy) / 2, (pz + qz) / 2);
          seg.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(dx / L, dy / L, dz / L));
          gg.add(seg);
        }
      }
      g.add(ink(gg));
    };
    const ex0 = x0 - pad * 0.55, ex1 = x1 + pad * 0.55, ez0 = z0 - pad * 0.55, ez1 = z1 + pad * 0.3;
    for (let k = 0; k < 3; k++) {
      const za = ez0 + (ez1 - ez0) * k / 3, zb = ez0 + (ez1 - ez0) * (k + 1) / 3;
      garland(ex0, za, ex0, zb); garland(ex1, za, ex1, zb);
    }
    for (let k = 0; k < 4; k++) garland(ex0 + (ex1 - ex0) * k / 4, ez0, ex0 + (ex1 - ex0) * (k + 1) / 4, ez0);
    const clear = (px, pz) => !keep.some((k) => Math.hypot(px - k.x, pz - k.z) < k.r);

    const place = (px, pz, kind, h) => {
      if (!clear(px, pz)) return;
      const t = kind === 'bush' ? forestBush(h) : forestTree(kind, h, Math.floor(r() * 3));
      t.position.set(px, -0.08, pz);
      t.rotation.y = r() * 6.28;
      if (kind !== 'bush' && r() < 0.7) lanterns(t, h, r);
      g.add(t);
    };
    for (let row = 0; row < 3; row++) {
      const off = row * 1.7;
      // far edge and the two sides
      for (let xx = x0 - pad - 3 - off; xx <= x1 + pad + 3 + off; xx += 1.7 + r() * 0.9) {
        place(xx + r() * 0.6, cz - hz - off - r() * 0.8, r() < 0.5 ? 'pine' : 'round', 2.2 + r() * 1.6 + row * 0.5);
      }
      for (let zz = cz - hz - off; zz <= cz + hz + 1.5; zz += 1.7 + r() * 0.9) {
        place(cx - hx - off - r() * 0.8, zz + r() * 0.6, r() < 0.5 ? 'pine' : 'round', 2.0 + r() * 1.6 + row * 0.5);
        place(cx + hx + off + r() * 0.8, zz + r() * 0.6, r() < 0.5 ? 'pine' : 'round', 2.0 + r() * 1.6 + row * 0.5);
      }
    }
    for (let xx = x0 - pad; xx <= x1 + pad; xx += 2.4 + r()) place(xx, cz + hz + 1.5 + r(), 'bush', 0.9 + r() * 0.5);
    // a few grey stones in the grass round the edge
    for (let i = 0; i < 12; i++) {
      const edge = i % 4;
      const px = edge < 2 ? cx + (r() - 0.5) * (hx * 2 - 1) : cx + (edge === 2 ? -1 : 1) * (hx - 0.9 - r() * 0.4);
      const pz = edge < 2 ? cz + (edge === 0 ? -1 : 1) * (hz - 0.9 - r() * 0.4) : cz + (r() - 0.5) * (hz * 2 - 1);
      const rock = fieldRock(0.1 + r() * 0.12, i);
      rock.position.set(px, -0.07, pz);
      g.add(rock);
    }
    return g;
  }

  // The felt follows the layout: measure everything on the table, add a margin, and
  // redraw the mat (its stitched border depends on its proportions) when that changes.
  let playMat = null, matKey = '';
  function fitMat(box3) {
    const M = sceneStyle === 'forest' ? 0.45 : 0.8;
    const x0 = box3.min.x - M, x1 = box3.max.x + M, z0 = box3.min.z - M, z1 = box3.max.z + M;
    const mw = x1 - x0, mh = z1 - z0;
    const key = [mw, mh, x0, z0].map((v) => v.toFixed(1)).join(',');
    if (key === matKey && playMat) return;
    matKey = key;
    if (playMat) {
      playMat.traverse((o) => {
        if (!o.isMesh || o.userData.inkline) return;
        if ((!o.geometry.parameters && !o.userData.sharedGeo) || o.geometry === playMat.geometry) o.geometry.dispose();
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
      });
      envGroup.remove(playMat);
    }
    if (sceneStyle === 'forest') {
      playMat = buildClearing(x0, x1, z0, z1);
      envGroup.add(playMat);
      seasonTargets(playMat, true);
      placeWeather(x0, x1, z0, z1);
      if (scene.userData.lamp) scene.userData.lamp.intensity = 0.6;
      return;
    }
    if (scene.userData.lamp) scene.userData.lamp.intensity = 2.6;
    const plain = () => roomMat(col('--art-mat'));
    playMat = new T.Mesh(new T.BoxGeometry(mw, 0.03, mh), [plain(), plain(),
      roomMat('#ffffff', matTexture(mw, mh)), plain(), plain(), plain()]);
    playMat.position.set((x0 + x1) / 2, -0.075, (z0 + z1) / 2);
    playMat.receiveShadow = true;
    envGroup.add(playMat);
    // keep the lamp over the middle of the mat
    if (scene.userData.lamp) {
      scene.userData.lamp.position.set((x0 + x1) / 2, 22, (z0 + z1) / 2 + 1.5);
      scene.userData.lamp.target.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    }
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

    if (sceneStyle === 'forest') {
      const floor = forestFloorTexture();
      floor.repeat.set(14, 14);
      const ground = new T.Mesh(new T.PlaneGeometry(140, 140), roomMat('#ffffff', floor));
      ground.userData.surface = true;
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(0, -0.09, 0);
      ground.receiveShadow = true;
      envGroup.add(ground);
      playMat = null; matKey = '';
      scene.add(envGroup);
      if (scene.background && scene.background.isTexture) scene.background.dispose();
      scene.background = skyTexture();
      scene.fog = new T.Fog(season.fog.clone(), 30, 70);
      if (scene.userData.hemi) { scene.userData.hemi.color.copy(season.hemiSky); scene.userData.hemi.groundColor.copy(season.hemiGround); scene.userData.hemi.intensity = season.hemi; }
      seasonTargets(envGroup, true);
      seasonLeft = Math.max(seasonLeft, 1);   // one pass to set the sun and sky for this look
      return;
    }
    if (scene.userData.hemi) { scene.userData.hemi.color.set('#ffffff'); scene.userData.hemi.groundColor.set('#6d5a3a'); scene.userData.hemi.intensity = 0.3; }

    // The table: a thick wooden top, big enough that its edges fall into the dark.
    const wood = woodTexture();
    wood.repeat.set(5, 4);
    const woodMat = roomMat('#ffffff', wood);                     // cel-lit, in softer steps
    const table = new T.Mesh(new T.BoxGeometry(40, 0.8, 32), woodMat);
    table.position.set(0, -0.09 - 0.4, -3.6);
    table.receiveShadow = true;
    envGroup.add(table);

    // The play mat is sized to whatever is on the table; see fitMat().
    playMat = null; matKey = '';

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

  // ---------------------------------------------------------------- seasons & weather
  // The meadow turns with the harvests: sunny → rain → autumn → snow → blossom → sunny.
  // Each look is a set of colours (sky, fog, light, leaves, ground) and something falling
  // from the sky. A change eases over a couple of seconds rather than cutting.
  const C = (h) => new T.Color(h);
  const SEASONS = [
    { sky: ['#8fbfd9', '#cfe3dc', '#f1e2bd'], fog: '#c9dccf', hemiSky: '#dfefff', hemiGround: '#4a6a36', hemi: 0.9, sun: 1.5,
      tint: '#ffffff', snow: 0, fall: null },
    { sky: ['#5c6b78', '#94a0a6', '#aeb3ab'], fog: '#98a2a3', hemiSky: '#b8c4d0', hemiGround: '#3c5030', hemi: 0.8, sun: 0.5,
      tint: '#bcc6b8', snow: 0, fall: 'rain' },
    { sky: ['#8fb3cf', '#ead3b0', '#f0c089'], fog: '#dac9aa', hemiSky: '#fff0dc', hemiGround: '#6a5530', hemi: 0.9, sun: 1.35,
      tint: '#e2c27c', glow: '#3c2a0c', snow: 0, round: ['#c8612c', '#e0a034', '#a8432a', '#d88a3a'], pine: ['#b8892e', '#9c7a30', '#c79a3a'], fall: 'leaf' },
    { sky: ['#a9bacb', '#dde5ed', '#f1f3f5'], fog: '#dce3e9', hemiSky: '#eef4ff', hemiGround: '#8a9098', hemi: 1.0, sun: 1.0,
      tint: '#ffffff', glow: '#6c7074', snow: 0.62, round: ['#e6ecf1', '#d3dce5'], pine: ['#dfe7ee', '#9fb3a8', '#e9eef2'], fall: 'snow' },
    { sky: ['#a3cbe4', '#f1dfe6', '#f7e8da'], fog: '#e6d9de', hemiSky: '#fff0f6', hemiGround: '#4a6a36', hemi: 0.95, sun: 1.5,
      tint: '#ffffff', glow: '#1a0e14', snow: 0, round: ['#f2b3c6', '#e896b0', '#f7cfda', '#ea9fb8'], pine: ['#7cb45a', '#8cc466', '#6aa84e'], fall: 'petal' },
  ];
  // The last round is the harvest festival: a warm dusk, the woods lit gold, fireflies rising.
  SEASONS.push({ sky: ['#3b4a78', '#d98f6a', '#f5c27a'], fog: '#d9a07c', hemiSky: '#ffd6a8', hemiGround: '#3a2c24', hemi: 0.6,
    sun: 0.95, sunCol: '#ffb36b', tint: '#e6bf8c', glow: '#1e0e06', snow: 0, fall: 'glow' });
  const seasonLook = (k) => {
    const d = SEASONS[k];
    return { sky: d.sky.map(C), fog: C(d.fog), hemiSky: C(d.hemiSky), hemiGround: C(d.hemiGround), hemi: d.hemi,
      sun: d.sun, sunCol: C(d.sunCol || '#fff1d6'), pine: d.pine, tint: C(d.tint), glow: C(d.glow || '#000000'), snow: d.snow, round: d.round, fall: d.fall };
  };
  let seasonIdx = 0, seasonGoal = seasonLook(0), seasonLeft = 0;   // ms of easing still to do
  const season = seasonLook(0);             // what is on screen now, eased towards seasonGoal
  const WHITE = C('#f3f6f9');

  // Work out each tagged material's colour for the goal season; snap = set it straight away.
  function seasonTargets(group, snap) {
    const S = seasonGoal;
    group.traverse((o) => {
      if (!o.material || o.userData.inkline) return;
      if (o.userData.leaf) {
        const L = o.userData.leaf;
        const pal = L.round ? S.round : L.pine ? S.pine : null;
        let c = pal ? C(pal[L.i % pal.length]) : L.base.clone();
        if (!pal) c.multiply(S.tint);
        if (S.snow && !pal) c.lerp(WHITE, S.snow * 0.6);
        o.userData.goal = { color: c, emissive: C('#000000') };
      } else if (o.userData.water) {
        o.userData.goal = { color: new T.Color(WATER[seasonIdx]), emissive: new T.Color(seasonIdx === 3 ? '#3a4046' : '#000000') };
      } else if (o.userData.lit) {
        o.userData.goal = { color: new T.Color('#3a2a1a'), emissive: new T.Color([1, 3, 5].includes(seasonIdx) ? '#ffc25a' : '#000000') };
      } else if (o.userData.surface) {
        o.userData.goal = { color: S.tint.clone(), emissive: S.glow.clone() };
      } else return;
      if (snap) { o.material.color.copy(o.userData.goal.color); o.material.emissive.copy(o.userData.goal.emissive); }
    });
    group.traverse((o) => {
      if (o.userData.festival) o.visible = seasonIdx === 5;
      if (o.userData.only) o.visible = o.userData.only.includes(seasonIdx);
    });
  }

  function setSeason(k) {
    k = Math.max(0, Math.min(SEASONS.length - 1, k | 0));
    if (k === seasonIdx) return;
    seasonIdx = k;
    seasonGoal = seasonLook(k);
    seasonLeft = 6000;
    season.fall = seasonGoal.fall;
    if (envGroup) seasonTargets(envGroup, false);
    if (weatherBox) placeWeather(...weatherBox);
  }

  // Once the look has arrived there is nothing to ease: repainting the sky canvas and walking
  // every tree each frame was most of the per-frame cost, so it stops.
  function easeSeason(dt) {
    if (seasonLeft <= 0) return;
    seasonLeft -= dt;
    const a = seasonLeft <= 0 ? 1 : Math.min(1, dt / 1400);
    const S = season, G2 = seasonGoal;
    S.sky.forEach((c, i) => c.lerp(G2.sky[i], a));
    S.fog.lerp(G2.fog, a); S.hemiSky.lerp(G2.hemiSky, a); S.hemiGround.lerp(G2.hemiGround, a);
    S.hemi += (G2.hemi - S.hemi) * a; S.sun += (G2.sun - S.sun) * a; S.sunCol.lerp(G2.sunCol, a);
    if (sceneStyle !== 'forest') return;
    if (skyCanvas && scene.background && scene.background.isTexture) { paintSky(S.sky); scene.background.needsUpdate = true; }
    if (scene.fog) scene.fog.color.copy(S.fog);
    const h = scene.userData.hemi;
    if (h) { h.color.copy(S.hemiSky); h.groundColor.copy(S.hemiGround); h.intensity = S.hemi; }
    if (scene.userData.sun) { scene.userData.sun.intensity = S.sun; scene.userData.sun.color.copy(S.sunCol); }
    if (envGroup) envGroup.traverse((o) => {
      const g = o.userData.goal;
      if (!g || !o.material) return;
      o.material.color.lerp(g.color, a); o.material.emissive.lerp(g.emissive, a);
    });
  }

  // Fireworks for the harvest festival: bursts of glowing sparks over the far woods.
  const fireworks = [];
  let fwTimer = 0;
  const FW_N = 150;
  function burst() {
    if (!weatherBox) return;
    const [x0, x1, z0, z1] = weatherBox;
    const r = Math.random;
    // over the woods on either side, where the HUD does not cover them
    const cx = r() < 0.5 ? x0 - 0.3 - r() * 1.6 : x1 + r() * 1.2;
    const cy = 2.8 + r() * 1.2, cz = z0 + (z1 - z0) * (0.25 + r() * 0.6);
    const pos = new Float32Array(FW_N * 3), vel = new Float32Array(FW_N * 3), colr = new Float32Array(FW_N * 3);
    const pal = [['#ffd166', '#fff1b8'], ['#ff6b6b', '#ffb4a2'], ['#7bdff2', '#e0fbfc'], ['#c77dff', '#f1c0ff'], ['#9bf6a0', '#f0fff0']][Math.floor(r() * 5)];
    for (let i = 0; i < FW_N; i++) {
      const u = r() * 2 - 1, a = r() * 6.28, sp = 1.3 + r() * 0.25, q = Math.sqrt(1 - u * u);
      pos[i * 3] = cx; pos[i * 3 + 1] = cy; pos[i * 3 + 2] = cz;
      vel[i * 3] = q * Math.cos(a) * sp; vel[i * 3 + 1] = u * sp; vel[i * 3 + 2] = q * Math.sin(a) * sp;
      const c = C(pal[i % 2]);
      colr[i * 3] = c.r; colr[i * 3 + 1] = c.g; colr[i * 3 + 2] = c.b;
    }
    const gg = new T.BufferGeometry();
    gg.setAttribute('position', new T.BufferAttribute(pos, 3));
    gg.setAttribute('color', new T.BufferAttribute(colr, 3));
    const m = new T.PointsMaterial({ size: 0.45, map: fallSprite('glow'), vertexColors: true, transparent: true,
      depthWrite: false, depthTest: false, blending: T.AdditiveBlending, sizeAttenuation: true });
    const pts = new T.Points(gg, m);
    pts.frustumCulled = false;
    pts.renderOrder = 10;
    pts.userData = { vel, age: 0 };
    scene.add(pts);
    fireworks.push(pts);
  }
  function stepFireworks(dt) {
    const s = dt / 1000;
    if (seasonIdx === 5 && sceneStyle === 'forest') {
      fwTimer -= dt;
      if (fwTimer <= 0) { burst(); fwTimer = 1100 + Math.random() * 1300; }
    }
    for (let k = fireworks.length - 1; k >= 0; k--) {
      const f = fireworks[k], u = f.userData;
      u.age += s;
      const pos = f.geometry.attributes.position.array, v = u.vel;
      for (let i = 0; i < v.length; i += 3) {
        const drag = Math.pow(0.4, s);    // the same slowing whatever the frame rate
        v[i] *= drag; v[i + 2] *= drag; v[i + 1] = v[i + 1] * drag - 0.7 * s;
        pos[i] += v[i] * s; pos[i + 1] += v[i + 1] * s; pos[i + 2] += v[i + 2] * s;
      }
      f.geometry.attributes.position.needsUpdate = true;
      f.material.opacity = Math.max(0, 1 - u.age / 2.6);
      if (u.age > 2.6) { scene.remove(f); f.geometry.dispose(); f.material.dispose(); fireworks.splice(k, 1); }
    }
  }

  // Falling rain, leaves, snow or petals over the play area.
  let weather = null, weatherBox = null;
  const FALL = {
    rain: { n: 1200, size: 0.28, speed: 5.5, sway: 0.03, cols: ['#c8d6e4'] },
    leaf: { n: 280, size: 0.24, speed: 0.32, sway: 0.45, cols: ['#c8612c', '#e0a034', '#a8432a'] },
    snow: { n: 900, size: 0.12, speed: 0.32, sway: 0.22, cols: ['#ffffff'] },
    glow: { n: 260, size: 0.34, speed: -0.2, sway: 0.3, cols: ['#ffe28a', '#fff2b8', '#ffd060'] },
    petal: { n: 340, size: 0.16, speed: 0.26, sway: 0.38, cols: ['#f7c6d3', '#f2a9bf', '#fde3ea'] },
  };
  function fallSprite(kind) {
    return svgTexture('fall:' + kind, kind === 'rain'
      ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="64" height="64"><path d="M17 1L15 31" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".85"/></svg>'
      : kind === 'glow'
        ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="64" height="64"><defs><radialGradient id="g"><stop offset="0" stop-color="#fff"/><stop offset=".25" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><circle cx="16" cy="16" r="16" fill="url(#g)"/></svg>'
      : kind === 'snow'
        ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="64" height="64"><circle cx="16" cy="16" r="9" fill="#fff"/><circle cx="16" cy="16" r="14" fill="#fff" opacity=".25"/></svg>'
        : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="64" height="64"><path d="M16 3C24 9 25 20 16 29C7 20 8 9 16 3z" fill="#fff"/><path d="M16 6V26" stroke="#000" stroke-opacity=".18" stroke-width="1.2"/></svg>',
      64, 64);
  }
  function placeWeather(x0, x1, z0, z1) {
    weatherBox = [x0, x1, z0, z1];
    if (weather) { scene.remove(weather); weather.geometry.dispose(); weather.material.dispose(); weather = null; }
    const kind = season.fall;
    if (!kind || sceneStyle !== 'forest') return;
    const F = FALL[kind], r = rng(911);
    const pos = new Float32Array(F.n * 3), colr = new Float32Array(F.n * 3), ph = new Float32Array(F.n);
    const mx = 1.5;
    for (let i = 0; i < F.n; i++) {
      pos[i * 3] = x0 - mx + r() * (x1 - x0 + mx * 2);
      pos[i * 3 + 1] = kind === 'glow' ? r() * 4 : r() * 7;
      pos[i * 3 + 2] = z0 - mx + r() * (z1 - z0 + mx * 2);
      const c = C(F.cols[i % F.cols.length]);
      colr[i * 3] = c.r; colr[i * 3 + 1] = c.g; colr[i * 3 + 2] = c.b;
      ph[i] = r() * 6.28;
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('color', new T.BufferAttribute(colr, 3));
    const m = new T.PointsMaterial({ size: F.size, map: fallSprite(kind), vertexColors: true, transparent: true,
      depthWrite: false, sizeAttenuation: true, alphaTest: 0.02,
      blending: kind === 'glow' ? T.AdditiveBlending : T.NormalBlending });
    weather = new T.Points(g, m);
    weather.userData = { kind, F, ph, x0: x0 - mx, x1: x1 + mx, z0: z0 - mx, z1: z1 + mx };
    weather.frustumCulled = false;
    scene.add(weather);
  }
  // Each particle falls at its own steady speed and sways on its own slow sine. It used to
  // wrap every particle above 4 back down to the ground, meant only for rising fireflies: rain,
  // leaves and snow above that height blinked out and popped up at the bottom. Now falling ones
  // go back to the top and rising ones to the bottom, and all of them wrap sideways too, so none
  // drift off the table.
  function stepWeather(dt, t) {
    if (!weather) return;
    const { F, ph, x0, x1, z0, z1, kind } = weather.userData;
    const pos = weather.geometry.attributes.position.array;
    const s = dt / 1000, top = kind === 'glow' ? 4 : 7, w = x1 - x0, d = z1 - z0;
    for (let i = 0; i < ph.length; i++) {
      const k = i * 3;
      pos[k + 1] -= F.speed * s * (0.8 + (i % 5) * 0.08);
      pos[k] += Math.sin(t * 0.0006 + ph[i]) * F.sway * s;
      pos[k + 2] += Math.cos(t * 0.00045 + ph[i]) * F.sway * s * 0.6;
      if (pos[k + 1] < -0.05) pos[k + 1] += top + 0.05;
      else if (pos[k + 1] > top) pos[k + 1] -= top;
      if (pos[k] < x0) pos[k] += w; else if (pos[k] > x1) pos[k] -= w;
      if (pos[k + 2] < z0) pos[k + 2] += d; else if (pos[k + 2] > z1) pos[k + 2] -= d;
    }
    weather.geometry.attributes.position.needsUpdate = true;
    if (kind === 'glow') weather.material.opacity = 0.65 + 0.35 * Math.sin(t * 0.002);
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
    scene.environmentIntensity = 0.28;

    // A dim room, one warm lamp over the play area, and a key light for the shadows.
    const hemi = new T.HemisphereLight(0xffffff, 0x6d5a3a, 0.3);
    scene.userData.hemi = hemi;
    scene.add(hemi);
    const fill = new T.DirectionalLight(0xdce8ff, 0.35);
    fill.position.set(-9, 7, 4);
    scene.add(fill);
    const lamp = new T.SpotLight(0xffe7c2, 2.6, 0, 0.62, 0.75, 0);
    lamp.position.set(1, 22, 1);
    lamp.target.position.set(1, 0, -0.8);
    scene.add(lamp, lamp.target);
    scene.userData.lamp = lamp;
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
      if (!o.isMesh || !o.material || o.userData.inkline) return;
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
    lastG = G; lastUI = Object.assign({}, UI);
    if (UI.season != null) setSeason(UI.season);

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
    pulsers = [];
    tableGroup.traverse((o) => { if (o.userData.pulse && o.material) pulsers.push(o); });
    fitMat(boxOf(tableGroup));

    handGroup = buildHand(G, UI);
    camera.add(handGroup);
    const handUp = handShown(G, UI);
    safeB = handUp ? SAFE_HAND_B : SAFE.b;

    focusBoxes.board = board.userData.slabs.reduce((b, sl) => b.union(boxOf(sl)), new T.Box3());
    focusBoxes.majors = boxOf(majors);
    seats.forEach((s, i) => {
      focusBoxes['seat' + i] = boxOf(s);
      focusBoxes['farm' + i] = boxOf(s.userData.parts.farm);
      // No cards played yet: fall back to the farm so the view still has something to frame.
      focusBoxes['played' + i] = s.userData.parts.played.children.length
        ? boxOf(s.userData.parts.played) : null;
    });

    resize();
    // Never snap here: when only the pieces changed, a snap shows as a jump. A new view, or a
    // box that grew, glides; an unchanged goal just stays put. Window resizes still snap.
    focus(UI.main, UI, false);
  }

  let t0 = null;
  let pulsers = [];                        // the highlight outlines, gathered once per sync
  function animate(t) {
    requestAnimationFrame(animate);
    // The first call comes straight from init with no timestamp; wait for a real frame.
    if (!ready || t === undefined) return;
    if (t0 === null) t0 = t;
    const dt = Math.min(t - t0, 100);     // a background tab must not make everything jump
    // Cap at about 60 fps. The old cut-off of 16 ms dropped every frame that came a fraction
    // early on a 60 Hz screen, so the picture ran at an uneven 30-60 fps.
    if (dt < 12) return;
    t0 = t;
    const pulse = 0.62 + 0.33 * Math.sin(t * 0.0028);
    for (const o of pulsers) o.material.opacity = pulse;
    stepCamera(dt);
    easeSeason(dt);
    stepWeather(dt, t);
    stepFireworks(dt);
    if (handGroup) {
      handY += (handGroup.userData.goalY - handY) * Math.min(1, dt / 180);
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
      meshes, pulsing, fireworks: fireworks.length, season: seasonIdx, pickables: pickables.length, hoverables: hoverables.length,
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

  return { init, sync, setScene, setSeason, resize: onResize, resetCamera, focus, debug, locate, isReady: () => ready };
})();
