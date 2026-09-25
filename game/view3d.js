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
    board: { x: 0, z: -3.8 },                                   // spans x ±5.7, z -6.7 … -0.9
    majors: { x: 8.5, z: -3.8 },                                // world; 4 rows by kind beside the board
    seat: (pi, n) => ({ x: n === 1 ? 0 : (pi === 0 ? -2.88 : 2.88), z: 0.95, rot: 0 }),
    farm: { x: 0, z: 0 },                                       // seat-local
    plate: { x: -1.5, z: 1.98 },                                // seat-local
    supply: { x: 0, z: 2.95 },                                  // seat-local
    played: { x: -2.12, z: 4.3 },                               // seat-local, first card
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
    // A thick coin in the player's colour, its face printed with the same bust as the HUD.
    const side = mat(pc, { roughness: 0.35 });
    const coin = new T.Mesh(geo('wkCoin', () => new T.CylinderGeometry(0.22, 0.22, 0.07, 32)), side);
    coin.position.y = 0.035;
    coin.castShadow = true; coin.receiveShadow = true;
    g.add(coin);
    const face = new T.Mesh(geo('wkFace', () => new T.CircleGeometry(0.22, 32)),
      printMat(svgTexture('worker2:' + hex, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0.6 0.6 22.8 22.8" width="192" height="192">${ART.workerMarkup(hex)}</svg>`, 192, 192),
        { roughness: 0.35 }));
    face.rotation.x = -Math.PI / 2;
    face.position.y = 0.071;
    g.add(face);
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
      const hide = col('--art-boar').clone().lerp(new T.Color(0xa0643a), 0.7);   // warm brown
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
      // A cream bundle lying down, tied in the middle — the colour of the real reed pieces,
      // so it never vanishes against green art.
      const stalkMat = mat(col('--art-count'), { roughness: 0.5 });
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
    return ink(g);
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
    return svgTexture(cardKey(c, sig), ART.cardFace(c, o), 320, 448);
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
  const SM = { w: CELL_W, h: CELL_H, gap: 8, pad: 14, rows: 6 };
  const BG = { w: CELL_W, h: CELL_H, gap: 8, pad: 14, rows: 6, cols: 7 };
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
  // One action space: the picture fills the whole cell (painted artwork when there is some,
  // else the drawn scene), and the name and what it does sit on a dark fade along the
  // bottom, the way a card's text sits over its art.
  function spaceTexture(G, p, def, w, h) {
    const notes = spaceNotes(G, p, def);
    const img = typeof ACTION_IMAGES !== 'undefined' && ACTION_IMAGES[def.id];
    const band = 26 + notes.length * 13;
    const en = def.zh.length * 16 + def.en.length * 5.6 + 22 < w - 12 ? def.en : '';
    const pic = img
      ? `<image href="${img}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>`
      : ART.scene(def.id, 0, 0, w, h, h - band + 4);
    const R = 3;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * R}" height="${h * R}"
      font-family="-apple-system,BlinkMacSystemFont,'PingFang TC','Noto Sans TC',sans-serif">
      <defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#1c1a17" stop-opacity="0"/>
        <stop offset=".35" stop-color="#1c1a17" stop-opacity=".7"/>
        <stop offset="1" stop-color="#1c1a17" stop-opacity=".9"/></linearGradient></defs>
      <rect width="${w}" height="${h}" fill="var(--art-boardface)"/>
      ${pic}
      <rect y="${h - band - 16}" width="${w}" height="${band + 16}" fill="url(#fade)"/>
      <text x="9" y="${h - band + 17}" font-size="16" font-weight="800" fill="#fff6e0">${def.zh}${en ? `<tspan dx="6" font-size="9.5" font-weight="600" fill-opacity=".7">${en}</tspan>` : ''}</text>
      ${notes.map((t, k) => `<text x="9" y="${h - band + 31 + k * 13}" font-size="11" fill="#efe4c8">${t}</text>`).join('')}
      <rect x="1" y="1" width="${w - 2}" height="${h - 2}" fill="none" stroke="#1c1a17" stroke-width="2.5"/></svg>`;
    return svgTexture(`sp2:${def.id}:${notes.join('|')}:${img ? 1 : 0}`, svg, w * R, h * R);
  }

  const slotSvg = (w, h, round, stage) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"
    width="${w * 2}" height="${h * 2}" font-family="-apple-system,sans-serif">
    <rect width="${w}" height="${h}" fill="var(--art-boardprint)"/>
    <rect width="${w}" height="${h}" fill="#6b4a1e" opacity=".05"/>
    <rect x="5" y="5" width="${w - 10}" height="${h - 10}" rx="9" fill="none" stroke="#5a4526"
      stroke-width="2.4" stroke-dasharray="9 6" opacity=".55"/>
    <text x="${w / 2}" y="${h / 2 - 2}" text-anchor="middle" font-size="19" font-weight="700"
      fill="var(--art-ink)" opacity=".55">Round ${round}</text>
    <text x="${w / 2}" y="${h / 2 + 20}" text-anchor="middle" font-size="13"
      fill="var(--art-ink)" opacity=".4">Stage ${stage}</text></svg>`;

  // Harvest is a marker between rounds, not a place to stand: a small ribbon with notched
  // ends, printed flat, so it never reads as another action space.
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
        const pile = goodsPile(k, sp.goods[k], { spread: 0.52, max: 5, alwaysCount: true, base: true });
        pile.position.set(cx - w / 2 + 0.22 + i * 0.44, BOARD_Y + 0.04, cz - d / 2 + 0.2);
        pile.scale.setScalar(0.56);
        g.add(pile);
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
        const ax = cx + w * 0.18, az = cz - d * 0.2;     // the picture half, clear of the name plate
        const tok = workerToken(pc, true);
        tok.position.set(ax, BOARD_Y + 0.035, az);
        g.add(tok);
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
          const slot = plateMesh(tex, BG.w * PS, BG.h * PS, bx(cellX(c) + BG.w / 2), bz(cellY(r) + BG.h / 2), BOARD_Y + 0.005);
          slot.userData.hover = { kind: 'slot', round: n };
          hoverables.push(slot);
          g.add(slot);
        }
      });
      if (c > 0) {
        const after = rounds[rounds.length - 1];
        const done = G.round > after || (G.round === after && G.phase !== 'work');
        const tex = svgTexture(`harv5:${after}`, harvestSvg(after), HARV_W * 2, HARV_H * 2);
        const rib = new T.Mesh(geo('harvRibbon', () => new T.PlaneGeometry(HARV_W * PS, HARV_H * PS)),
          new T.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.5, opacity: done ? 0.4 : 1 }));
        rib.rotation.x = -Math.PI / 2;
        // tucked against the top of its cell, right under the last round of the stage
        rib.position.set(bx(cellX(c) + BG.w / 2), BOARD_Y + 0.012, bz(cellY(rounds.length) + HARV_H / 2 + 2));
        g.add(rib);
      }
    });

    BOARD_LAYOUT.accum.forEach((id, i) => {
      addSpace(spaceDef(id), cellX(0), cellY(i + 1), BG.w, BG.h);
    });

    // Goods that cards have parked on future round spaces sit on those spaces, each player's
    // on a disc of their colour, exactly where the rules say they wait.
    const roundCell = {};
    BOARD_LAYOUT.roundCols.forEach((rounds, c) => rounds.forEach((n, r) => { roundCell[n] = [c, r]; }));
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
            : goodsPile(k, parked[n][k], { spread: 0.34, max: 3, alwaysCount: parked[n][k] > 1,
              base: col(pi === 0 ? '--p1' : '--p2') });
          const holder = new T.Group();
          holder.add(piece);
          holder.position.set(cx + (j - (kinds.length - 1) / 2) * 0.3, BOARD_Y + 0.04, cz);
          holder.scale.setScalar(0.62);
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
  // The supply mat: one printed card, the same look as the HUD — a cream mat, and for each
  // good its coin, a big count and its name. Empty goods are printed faintly, not hidden,
  // so the row always reads in the same order.
  function supplySvg(p) {
    const kinds = RES.concat(ANIM);
    const W = 660, H = 116, cw = W / kinds.length;
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * 2}" height="${H * 2}"
      font-family="-apple-system,'PingFang TC','Noto Sans TC',sans-serif">
      <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="12" fill="var(--art-plate)" stroke="var(--art-ink)" stroke-width="2"/>`;
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
    return s + '</svg>';
  }

  function buildSupply(G, pi) {
    const p = G.players[pi];
    const g = new T.Group();
    const key = RES.map((k) => p.supply[k]).concat(ANIM.map((k) => animalTotal(p, k))).join(',');
    const tex = svgTexture(`supply:${pi}:${key}`, supplySvg(p), 1320, 232);
    const mat3 = plateMesh(tex, 5.4, 0.95, 0, 0, 0.04);
    mat3.castShadow = true;
    g.add(mat3);
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
      printMat(svgTexture(`name:${pi}:${p.name}:${sub}:${col(colour).getHexString()}`, nameSvg(p.name, sub, `var(${colour})`), 520, 120), { transparent: true }));
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
      const tok = workerToken(col(colour), i < p.workersLeft);
      tok.position.set(LAYOUT.plate.x + 1.4 + i * 0.52, 0.0, LAYOUT.plate.z);
      g.add(tok);
    }
    if (acting) {
      g.add(outline(5.6, 3.6, 0.09, col(colour).getHex(), 0.07).translateX(LAYOUT.farm.x).translateZ(LAYOUT.farm.z));
    }

    const supply = buildSupply(G, pi);
    supply.position.set(LAYOUT.supply.x, 0, LAYOUT.supply.z);
    g.add(supply);

    // Cards already in front of this player, five to a row, on a marked-out patch of felt.
    const playedGroup = new T.Group();
    const at = LAYOUT.played;
    const zone = new T.Mesh(geo('playedZone', () => new T.PlaneGeometry(5.5, 2.9)),
      new T.MeshBasicMaterial({ map: svgTexture('zone', ZONE_SVG, 440, 232), transparent: true, depthWrite: false }));
    zone.rotation.x = -Math.PI / 2;
    zone.position.set(0, 0.002, at.z + 0.62);
    playedGroup.add(zone);
    p.played.forEach((c, i) => {
      const cx = at.x + (i % 5) * (MAJ_W + 0.2);
      const cz = at.z + Math.floor(i / 5) * (MAJ_H + 0.12);
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

    const seat = LAYOUT.seat(pi, G.n);
    g.position.set(seat.x, 0, seat.z);
    g.rotation.y = seat.rot;
    g.userData.parts = { farm, played: playedGroup };
    return g;
  }

  const ZONE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 550 290" width="440" height="232">
    <rect x="6" y="6" width="538" height="278" rx="22" fill="#fff" fill-opacity=".05"
      stroke="#fff" stroke-opacity=".35" stroke-width="4" stroke-dasharray="18 12"/>
    <text x="275" y="160" text-anchor="middle" font-size="34" font-weight="700" fill="#fff" fill-opacity=".22"
      font-family="-apple-system,'PingFang TC',sans-serif" letter-spacing="6">打出嘅卡 · PLAYED</text></svg>`;

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
    // One row per kind, identical cards side by side, a printed label on the felt at the left.
    const rowOf = {};
    MAJOR_ROWS.forEach((r, ri) => r.cards.forEach((en) => { rowOf[en] = ri; }));
    const used = MAJOR_ROWS.map(() => 0);
    const colW = MAJ_W + 0.1, rowH = MAJ_H + 0.12;
    const x0 = -1.5 * colW, z0 = -1.5 * rowH;
    MAJOR_ROWS.forEach((r, ri) => {
      const lbl = new T.Mesh(geo('majLabel', () => new T.PlaneGeometry(0.9, 0.34)),
        new T.MeshBasicMaterial({ map: svgTexture('majrow:' + r.zh, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 34" width="270" height="102">
          <text x="86" y="23" text-anchor="end" font-size="17" font-weight="800" fill="#efe8d8" fill-opacity=".55"
            font-family="-apple-system,'PingFang TC',sans-serif" letter-spacing="1">${r.zh}</text></svg>`, 270, 102), transparent: true, depthWrite: false }));
      lbl.rotation.x = -Math.PI / 2;
      lbl.position.set(x0 - MAJ_W / 2 - 0.5, 0.002, z0 + ri * rowH);
      g.add(lbl);
    });
    G.majors.forEach((c) => {
      const owner = c.taken != null ? G.players[c.taken] : null;
      const cost = cardCost(G, p, c);
      const ri = rowOf[c.en] != null ? rowOf[c.en] : MAJOR_ROWS.length - 1;
      const m = cardMesh(cardTexture(c, { cost, taken: owner ? owner.name : '' }), MAJ_W, MAJ_H);
      const cx = x0 + (used[ri]++) * colW;
      const cz = z0 + ri * rowH;
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
    if (UI.handPinned || UI.main === 'cards') return true;
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
  // Left: only the camera tabs, up in the top band. Right: the resources and log column.
  const SAFE = { l: 0.06, r: 0.42, t: 0.3, b: 0.3 };
  const SAFE_HAND_B = 0.62;
  let safeB = SAFE.b;

  const FOCUS = {
    // pol is the angle from straight down: ~0.6 reads as leaning over the table.
    // The overview is centred: the right column folds to a strip here too, so both sides
    // keep the same margin.
    table: () => ({ az: 0, pol: 0.62, pad: 1.02, boxes: ['board', 'majors', 'farm0', 'farm1'],
      safe: { l: 0.12, r: 0.12, t: 0.26, b: 0.3 } }),
    // The board is wide, so its view gets tighter margins: the top-left only has the camera
    // tabs, and the action bar sits over the empty middle of the board's lower edge.
    board: () => ({ az: 0, pol: 0.3, pad: 0.98, boxes: ['board'], safe: { l: 0.01, r: 0.1, t: 0.24, b: 0.1 } }),
    farm: (UI) => ({ az: 0, pol: 0.56, pad: 1.04, boxes: ['farm' + UI.view] }),
    cards: (UI) => ({ az: 0, pol: 0.5, pad: 1.02, boxes: ['played' + UI.view] }),
    majors: () => ({ az: 0, pol: 0.42, pad: 1.0, boxes: ['majors'], safe: { l: 0.04, r: 0.15, t: 0.34, b: 0.3 } }),
  };

  const focusBoxes = {};
  const fitCam = new T.PerspectiveCamera(42, 1.6, 0.1, 200);

  // Frame a box inside the free middle of the screen: project its corners, then slide the
  // target and pull the camera back until the whole thing clears the HUD on every side.
  function fitGoal(box3, pad, safe) {
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
    fitGoal(box3, f.pad, f.safe);
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

  // The felt follows the layout: measure everything on the table, add a margin, and
  // redraw the mat (its stitched border depends on its proportions) when that changes.
  let playMat = null, matKey = '';
  function fitMat(box3) {
    const M = 0.8;
    const x0 = box3.min.x - M, x1 = box3.max.x + M, z0 = box3.min.z - M, z1 = box3.max.z + M;
    const mw = x1 - x0, mh = z1 - z0;
    const key = [mw, mh, x0, z0].map((v) => v.toFixed(1)).join(',');
    if (key === matKey && playMat) return;
    matKey = key;
    if (playMat) {
      playMat.geometry.dispose();
      playMat.material.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
      envGroup.remove(playMat);
    }
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
    fitMat(boxOf(tableGroup));

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
