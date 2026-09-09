// Agricola — Three.js table view. Reads engine state, draws the farm and the action
// board as real 3D pieces, and routes clicks back through the same rules functions.
const View3D = (function () {
  const T = window.THREE;
  const TILE = 1;                  // one farmyard space = one world unit
  const SP_W = 1.7, SP_D = 1.15, SP_GAP = 0.09, SP_COLS = 3;
  const BOARD_Y = 0.06;            // top surface of the farm board
  const ACT_GAP = 0.8;             // clearance between the farm board and the action board

  let renderer, scene, camera, raycaster, host, canvas;
  let root, farmGroup, actGroup, pickables = [];
  let hooks = null, ready = false, needsRender = true, theme = '', lastRows = -1;
  const texCache = new Map();
  const geoCache = new Map();

  // ---------------------------------------------------------------- helpers
  function cssVars() {
    const cs = getComputedStyle(document.documentElement);
    const out = {};
    for (const name of VAR_NAMES) out[name] = cs.getPropertyValue(name).trim() || '#888';
    return out;
  }
  const VAR_NAMES = ['--art-ink', '--art-grass', '--art-grass-dk', '--art-pasture', '--art-soil',
    '--art-soil-dk', '--art-wood', '--art-wood-lt', '--art-wood-dk', '--art-clay', '--art-clay-lt',
    '--art-stone', '--art-stone-lt', '--art-reed', '--art-reed-dk', '--art-grain', '--art-veg',
    '--art-food', '--art-sheep', '--art-sheep-face', '--art-boar', '--art-cattle', '--art-cattle-spot',
    '--art-roof', '--art-window', '--art-stable-door', '--art-fence', '--art-fence-dk', '--art-tree',
    '--art-water', '--art-sky', '--art-plate', '--art-token', '--art-count', '--art-frame',
    '--art-boardface', '--art-slot', '--art-seal', '--art-edge', '--art-board',
    '--bg', '--panel', '--ink', '--muted', '--accent', '--p1', '--p2'];

  // SVG loaded through <img> has no access to the page's custom properties, so bake them in.
  function resolveVars(svg) {
    const v = cssVars();
    return svg.replace(/var\((--[a-z0-9-]+)\)/gi, (m, name) => v[name] || '#888');
  }

  function col(name) { return new T.Color(cssVars()[name] || '#888'); }

  function svgTexture(key, svg, size) {
    const k = theme + '|' + key;
    if (texCache.has(k)) return texCache.get(k);
    const cv = document.createElement('canvas');
    cv.width = cv.height = size || 256;
    const tex = new T.CanvasTexture(cv);
    tex.colorSpace = T.SRGBColorSpace;
    tex.anisotropy = 4;
    const img = new Image();
    img.onload = () => {
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      tex.needsUpdate = true;
      needsRender = true;
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(resolveVars(svg));
    texCache.set(k, tex);
    return tex;
  }

  function geo(key, make) {
    if (!geoCache.has(key)) geoCache.set(key, make());
    return geoCache.get(key);
  }

  const mat = (color, opts) => new T.MeshStandardMaterial(Object.assign({
    color: color instanceof T.Color ? color : new T.Color(color), roughness: 0.85, metalness: 0,
  }, opts || {}));

  function box(w, h, d, color, x, y, z) {
    const m = new T.Mesh(geo(`b${w}_${h}_${d}`, () => new T.BoxGeometry(w, h, d)), mat(color));
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  // ---------------------------------------------------------------- pieces
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

  function meeple(colorHex, scale) {
    const m = new T.Mesh(meepleGeometry(), mat(colorHex, { roughness: 0.55 }));
    const s = (scale || 1) * 0.4;
    m.scale.set(s, s, s);
    m.rotation.x = -Math.PI / 2;
    m.castShadow = true;
    return m;
  }

  function houseMesh(kind) {
    const g = new T.Group();
    const wall = { wood: '--art-wood', clay: '--art-clay', stone: '--art-stone' }[kind] || '--art-wood';
    const w = box(0.74, 0.42, 0.66, col(wall), 0, 0.21, 0);
    g.add(w);
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
      const b = new T.Mesh(bodyGeo, mat(col('--art-sheep'), { roughness: 1 }));
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
    const rail = (y) => {
      const r = horizontal ? box(len, 0.05, 0.05, c, 0, y, 0) : box(0.05, 0.05, len, c, 0, y, 0);
      return r;
    };
    g.add(rail(0.14)); g.add(rail(0.26));
    [-1, 1].forEach((s) => {
      const p = box(0.09, 0.34, 0.09, cd, horizontal ? s * len / 2 : 0, 0.17, horizontal ? 0 : s * len / 2);
      g.add(p);
    });
    return g;
  }

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

  // ---------------------------------------------------------------- board build
  function tileTexture(p, i, inPasture) {
    const t = p.farm[i];
    let key, svg;
    if (t.kind === 'field') { key = 'field'; svg = ART.fieldTile(i, null); }
    else if (t.kind === 'room') { key = 'grass' + (i % 4); svg = ART.grassTile(i, false); }
    else { key = (inPasture ? 'past' : 'grass') + (i % 4); svg = ART.grassTile(i, inPasture); }
    return svgTexture('tile' + key, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ART.TW} ${ART.TH}" width="128" height="128" preserveAspectRatio="none">${svg}</svg>`, 128);
  }

  function tilePos(i) {
    const r = Math.floor(i / 5), c = i % 5;
    return { x: (c - 2) * TILE, z: (r - 1) * TILE };
  }

  function buildFarm(G, UI) {
    const p = G.players[UI.view];
    const regs = regions(p);
    const g = new T.Group();

    // Board slab under the tiles.
    const slab = box(5 * TILE + 0.34, 0.12, 3 * TILE + 0.34, col('--art-frame'), 0, 0, 0);
    slab.receiveShadow = true;
    g.add(slab);

    for (let i = 0; i < 15; i++) {
      const { x, z } = tilePos(i);
      const t = p.farm[i];
      const reg = regionOf(p, i, regs);
      const inPasture = !!(reg && reg.enclosed);

      const top = new T.Mesh(geo('tiletop', () => new T.BoxGeometry(TILE * 0.99, 0.03, TILE * 0.99)),
        new T.MeshStandardMaterial({ map: tileTexture(p, i, inPasture), roughness: 0.95 }));
      top.position.set(x, BOARD_Y, z);
      top.receiveShadow = true;
      top.userData.pick = { type: 'tile', i };
      g.add(top);
      pickables.push(top);

      if (t.kind === 'room') {
        const h = houseMesh(p.house);
        h.position.set(x, BOARD_Y + 0.015, z);
        g.add(h);
        if (p.pet && i === p.farm.findIndex((q) => q.kind === 'room')) {
          const a = animalMesh(p.pet.kind);
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
        new T.MeshBasicMaterial({ map: svgTexture('cap:' + reg.count + '/' + reg.capacity, capSvg(reg.count, reg.capacity), 128), transparent: true, depthWrite: false }));
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

    // Highlights and fence hit boxes for whatever the current step allows.
    const acting = G.players[G.current];
    const step = currentStep(G);
    const canPickTile = (i) => {
      if (G.staging) return true;
      if (p !== acting) return false;
      if (step === 'plow') return canPlow(p, i);
      if (step === 'build') return UI.buildKind === 'room' ? canBuildRoom(p, i) : canBuildStable(p, i);
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

  function spaceTileSvg(def, sub) {
    const W = 178, H = 112;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
      <style>text{font-family:-apple-system,"PingFang TC","Microsoft JhengHei",sans-serif}
        .plate-main{font-size:15px;font-weight:700;fill:var(--art-ink)}
        .plate-sub{font-size:10.5px;fill:var(--art-ink);opacity:.78}</style>
      <rect width="${W}" height="${H}" fill="var(--art-boardface)"/>
      <svg x="0" y="0" width="${W}" height="${H}" viewBox="-24 -2 100 56" preserveAspectRatio="xMidYMid slice">${ART.sceneMarkup(def.id)}</svg>
      ${ART.plate(7, H - 47, W - 14, 40, esc3(def.zh), esc3(sub))}</svg>`;
  }
  const esc3 = (s) => String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));

  function buildActionBoard(G) {
    const list = [];
    BASE_SPACES.forEach((d) => list.push(d));
    G.roundOrder.forEach((id) => {
      if (!G.spaces[id].revealed) return;
      const d = ROUND_SPACES.find((x) => x.id === id);
      if (d) list.push(d);
    });

    const rows = Math.ceil(list.length / SP_COLS);
    const g = new T.Group();
    const bw = SP_COLS * SP_W + (SP_COLS - 1) * SP_GAP + 0.3;
    const bd = rows * SP_D + (rows - 1) * SP_GAP + 0.3;
    const slab = box(bw, 0.1, bd, col('--art-frame'), 0, -0.01, 0);
    slab.receiveShadow = true;
    g.add(slab);
    g.userData.depth = bd;
    g.userData.rows = rows;

    list.forEach((def, i) => {
      const c = i % SP_COLS, r = Math.floor(i / SP_COLS);
      const x = (c - (SP_COLS - 1) / 2) * (SP_W + SP_GAP);
      const z = (r - (rows - 1) / 2) * (SP_D + SP_GAP);
      const sp = G.spaces[def.id];
      const acc = (G.n === 1 && def.accumSolo) ? def.accumSolo : def.accum;
      const sub = def.gain ? `取 ${Object.keys(def.gain).map((k) => LABEL[k] + def.gain[k]).join('、')}`
        : acc ? `每回合 +${Object.keys(acc).map((k) => LABEL[k] + acc[k]).join('、')}`
        : (def.steps || []).map((s) => STEP_ZH[s]).join(def.andOr ? ' ／ ' : ' → ');

      const tex = svgTexture('sp:' + def.id + ':' + sub, spaceTileSvg(def, sub.length > 14 ? sub.slice(0, 13) + '…' : sub), 256);
      const side = mat(col('--art-frame'));
      const top = new T.MeshStandardMaterial({ map: tex, roughness: 0.9 });
      const m = new T.Mesh(new T.BoxGeometry(SP_W, 0.07, SP_D), [side, side, top, side, side, side]);
      m.position.set(x, 0.075, z);
      m.receiveShadow = true; m.castShadow = true;
      m.userData.pick = { type: 'space', id: def.id };
      g.add(m);
      pickables.push(m);

      if (canPlace(G, def.id)) {
        const ring = outline(SP_W - 0.02, SP_D - 0.02, 0.125, HILITE, 0.09);
        ring.position.set(x, 0, z);
        g.add(ring);
      }
      if (sp.occupiedBy !== null) {
        const mp = meeple(cssVars()[sp.occupiedBy === 0 ? '--p1' : '--p2'], 1.05);
        mp.position.set(x + SP_W / 2 - 0.3, 0.11, z - SP_D / 2 + 0.28);
        mp.rotation.z = 0.15;
        g.add(mp);
      }
      Object.keys(sp.goods).filter((k) => sp.goods[k] > 0).forEach((k, gi) => {
        const tok = new T.Mesh(geo('token', () => new T.CylinderGeometry(0.17, 0.17, 0.06, 20)),
          new T.MeshStandardMaterial({ map: svgTexture('tok:' + k, tokenSvg(k), 96), roughness: 0.8 }));
        tok.position.set(x - SP_W / 2 + 0.28 + gi * 0.42, 0.14, z + SP_D / 2 - 0.26);
        tok.castShadow = true;
        g.add(tok);
        const n = sp.goods[k];
        const lbl = new T.Mesh(geo('tokenlbl', () => new T.PlaneGeometry(0.3, 0.3)),
          new T.MeshBasicMaterial({ map: svgTexture('cnt:' + n, countSvg(n), 64), transparent: true, depthWrite: false }));
        lbl.rotation.x = -Math.PI / 2;
        lbl.position.set(tok.position.x + 0.11, 0.18, tok.position.z + 0.11);
        g.add(lbl);
      });
    });
    return g;
  }

  const capSvg = (n, cap) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 62 34" width="124" height="68">
    <rect x="1" y="1" width="60" height="32" rx="16" fill="var(--art-plate)" stroke="var(--art-ink)" stroke-width="2"/>
    <text x="31" y="24" text-anchor="middle" font-size="19" font-weight="700"
      font-family="-apple-system,sans-serif" fill="var(--art-ink)">${n}/${cap}</text></svg>`;

  const tokenSvg = (k) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="96" height="96">
    <rect width="24" height="24" fill="var(--art-token)"/>${ART.ICONS[k] || ''}</svg>`;
  const countSvg = (n) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="64" height="64">
    <circle cx="16" cy="16" r="14" fill="var(--art-count)" stroke="var(--art-ink)" stroke-width="2"/>
    <text x="16" y="22" text-anchor="middle" font-size="18" font-weight="700"
      font-family="-apple-system,sans-serif" fill="var(--art-ink)">${n}</text></svg>`;

  // ---------------------------------------------------------------- camera rig
  const camState = { az: 0, pol: 0.82, dist: 11.5, target: new T.Vector3(0, 0, -1.4) };

  function applyCamera() {
    const { az, pol, dist, target } = camState;
    camera.position.set(
      target.x + dist * Math.sin(pol) * Math.sin(az),
      target.y + dist * Math.cos(pol),
      target.z + dist * Math.sin(pol) * Math.cos(az));
    camera.lookAt(target);
    needsRender = true;
  }

  function installControls() {
    let dragging = false, panning = false, lastX = 0, lastY = 0, moved = 0;
    canvas.addEventListener('pointerdown', (e) => {
      dragging = true; panning = e.button === 2 || e.shiftKey;
      lastX = e.clientX; lastY = e.clientY; moved = 0;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      if (panning) {
        const s = camState.dist * 0.0016;
        camState.target.x -= (dx * Math.cos(camState.az) - dy * Math.sin(camState.az) * 0) * s;
        camState.target.z -= (dx * Math.sin(camState.az) + dy * Math.cos(camState.az)) * s;
      } else {
        camState.az -= dx * 0.007;
        camState.pol = Math.min(1.45, Math.max(0.15, camState.pol - dy * 0.006));
      }
      applyCamera();
    });
    const stop = (e) => {
      if (!dragging) return;
      dragging = false;
      try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* already gone */ }
      if (moved < 6 && !panning) pick(e);
    };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', () => { dragging = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      camState.dist = Math.min(24, Math.max(4, camState.dist * (1 + Math.sign(e.deltaY) * 0.1)));
      applyCamera();
    }, { passive: false });
  }

  function pick(e) {
    if (!hooks) return;
    const rect = canvas.getBoundingClientRect();
    const v = new T.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(v, camera);
    const hits = raycaster.intersectObjects(pickables, false);
    if (!hits.length) return;
    const d = hits[0].object.userData.pick;
    if (d) hooks.onPick(d);
  }

  // ---------------------------------------------------------------- lifecycle
  function init(hostEl, handlers) {
    if (ready) return true;
    if (!T) return false;
    host = hostEl; hooks = handlers;
    canvas = document.createElement('canvas');
    canvas.className = 'c3d';
    host.appendChild(canvas);

    renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;

    scene = new T.Scene();
    camera = new T.PerspectiveCamera(42, 1, 0.1, 200);
    raycaster = new T.Raycaster();
    root = new T.Group();
    scene.add(root);

    const hemi = new T.HemisphereLight(0xffffff, 0x7d6a45, 1.5);
    scene.add(hemi);
    const fill = new T.DirectionalLight(0xdce8ff, 0.5);
    fill.position.set(-7, 6, -5);
    scene.add(fill);
    const sun = new T.DirectionalLight(0xfff3dd, 2.1);
    sun.position.set(5, 11, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -9; sun.shadow.camera.right = 9;
    sun.shadow.camera.top = 9; sun.shadow.camera.bottom = -9;
    sun.shadow.camera.far = 40;
    sun.shadow.bias = -0.0012;
    scene.add(sun);

    const tableGeo = new T.PlaneGeometry(60, 60);
    const table = new T.Mesh(tableGeo, new T.MeshStandardMaterial({ color: col('--bg'), roughness: 1 }));
    table.rotation.x = -Math.PI / 2;
    table.position.y = -0.07;
    table.receiveShadow = true;
    scene.add(table);
    scene.userData.table = table;

    installControls();
    applyCamera();
    window.addEventListener('resize', resize);
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
    needsRender = true;
  }

  // Geometries and textures are cached and reused; only the per-build materials are ours to free.
  function disposeGroup(g) {
    if (!g) return;
    g.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
      else o.material.dispose();
    });
    root.remove(g);
  }

  function sync(G, UI) {
    if (!ready) return;
    const nowTheme = document.documentElement.getAttribute('data-theme') ||
      (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    if (nowTheme !== theme) { theme = nowTheme; texCache.clear(); }

    pickables = [];
    disposeGroup(farmGroup);
    disposeGroup(actGroup);

    farmGroup = buildFarm(G, UI);
    farmGroup.position.set(0, 0, 0.9);
    root.add(farmGroup);

    actGroup = buildActionBoard(G);
    const farmBack = farmGroup.position.z - (3 * TILE / 2 + 0.17);
    actGroup.position.set(0, 0, farmBack - ACT_GAP - actGroup.userData.depth / 2);
    root.add(actGroup);

    if (scene.userData.table) scene.userData.table.material.color = col('--bg');
    resize();
    // Refit only when the board actually grows, so the camera stays put between turns.
    if (actGroup.userData.rows !== lastRows) { lastRows = actGroup.userData.rows; frameContent(); }
    needsRender = true;
  }

  let t0 = 0;
  function animate(t) {
    requestAnimationFrame(animate);
    if (!ready) return;
    if (t - t0 < 33) return;            // the highlight pulse needs a steady ~30fps
    t0 = t;
    const pulse = 0.62 + 0.33 * Math.sin(t * 0.005);
    root.traverse((o) => { if (o.userData.pulse && o.material) o.material.opacity = pulse; });
    renderer.render(scene, camera);
    needsRender = false;
  }

  // Fit by projecting the content's corners and iterating, so the tilt is accounted for.
  function frameContent() {
    const box = new T.Box3().setFromObject(root);
    if (box.isEmpty()) return;
    const centre = box.getCenter(new T.Vector3());
    camState.target.set(centre.x, 0, centre.z);

    const corners = [];
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) corners.push(new T.Vector3(x, y, z));

    const half = Math.tan(T.MathUtils.degToRad(camera.fov) / 2);
    const v = new T.Vector3();
    for (let i = 0; i < 8; i++) {
      applyCamera();
      camera.updateMatrixWorld(true);
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of corners) {
        v.copy(p).project(camera);
        minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
        minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
      }
      const fwd = new T.Vector3(camera.position.x - camState.target.x, 0, camera.position.z - camState.target.z).normalize();
      const right = new T.Vector3(fwd.z, 0, -fwd.x);
      const step = camState.dist * half;
      camState.target.addScaledVector(fwd, -((maxY + minY) / 2) * step * 0.9);
      camState.target.addScaledVector(right, ((maxX + minX) / 2) * step * camera.aspect * 0.9);
      const need = Math.max(maxX - minX, maxY - minY) / 2;
      camState.dist = Math.max(4, Math.min(30, camState.dist * (need / 0.9)));
    }
    applyCamera();
  }

  function resetCamera() {
    camState.az = 0; camState.pol = 0.8;
    frameContent();
  }

  function debug() {
    let meshes = 0, pulsing = 0, loaded = 0;
    root.traverse((o) => { if (o.isMesh) meshes++; if (o.userData.pulse) pulsing++; });
    texCache.forEach((t) => { if (t.image && t.image.width) loaded++; });
    return {
      meshes, pulsing, pickables: pickables.length, textures: texCache.size, loaded,
      farmZ: farmGroup ? farmGroup.position.z : null,
      actZ: actGroup ? actGroup.position.z : 0,
      actDepth: actGroup ? actGroup.userData.depth : 0,
      dist: camState.dist,
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

  return { init, sync, resize, resetCamera, debug, locate, isReady: () => ready };
})();
