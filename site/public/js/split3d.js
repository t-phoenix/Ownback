// Film beat: a gold slice cuts a phone, which explodes into its parts. Each part is labelled with the
// company (or raw material) behind it, using the same graph the app uses (database/registry/product-graph.json).
// Driven by OBSplit.render(t, now) with t in 0..1.
(function () {
  const T = window.THREE, cv = document.getElementById('split'), labelsEl = document.getElementById('pins'), svg = document.getElementById('leaders'), bar = document.getElementById('splitbar');
  window.OBSplit = { render() {} };
  if (!T || !cv) return;
  let R;
  try { R = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); } catch { return; }
  R.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  R.toneMapping = T.ACESFilmicToneMapping; R.toneMappingExposure = 1.05;
  const scene = new T.Scene(), cam = new T.PerspectiveCamera(30, 1, .05, 80);

  // studio: soft boxes and a warm bounce, neutral so the paper background stays clean
  const pm = new T.PMREMGenerator(R), es = new T.Scene(); es.background = new T.Color(0x1a1916);
  [[0xffffff, 5, 0, 6, 3, 8, 2], [0xfff3e2, 3, -6, 2, 2, 2, 7], [0xffffff, 2.5, 6, 0, 2, 2, 6], [0xeeebe3, 1.6, 0, -5, 2, 10, 3], [0xffffff, 7, 2.5, 3, 5, .8, .8]]
    .forEach(([c, k, x, y, z, w, h]) => { const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(c).multiplyScalar(k), side: T.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); es.add(m); });
  scene.environment = pm.fromScene(es, .02).texture;
  scene.add(new T.HemisphereLight(0xfffaf0, 0x8a8170, .55));
  const key = new T.DirectionalLight(0xfff3dc, 1.2); key.position.set(3, 5, 6); scene.add(key);

  // ---------- geometry helpers ----------
  function rr(w, h, r) { const s = new T.Shape(), x = -w / 2, y = -h / 2; s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s; }
  function slab(w, h, d, r, mat, bev = .3) { const b = Math.min(d * bev, r * .4); const g = new T.ExtrudeGeometry(rr(w - 2 * b, h - 2 * b, Math.max(r - b, .01)), { depth: d - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 4, curveSegments: 14 }); g.center(); return new T.Mesh(g, mat); }
  function ring(w, h, r, t, d, mat) { const s = rr(w, h, r); s.holes.push(rr(w - 2 * t, h - 2 * t, r - t)); const g = new T.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelThickness: .01, bevelSize: .01, bevelSegments: 2, curveSegments: 16 }); g.center(); return new T.Mesh(g, mat); }
  const box = (w, h, d, mat) => new T.Mesh(new T.BoxGeometry(w, h, d), mat);

  // ---------- materials ----------
  const gold = new T.MeshStandardMaterial({ color: 0xffc35a, metalness: 1, roughness: .22 });
  const silver = new T.MeshStandardMaterial({ color: 0xdfe3e6, metalness: 1, roughness: .28 });
  const M = {
    titanium: new T.MeshStandardMaterial({ color: 0x4a4744, metalness: .95, roughness: .3 }),
    backglass: new T.MeshPhysicalMaterial({ color: 0x3b3936, metalness: .2, roughness: .45, clearcoat: 1, clearcoatRoughness: .25 }),
    lens: new T.MeshPhysicalMaterial({ color: 0x0b0c0d, metalness: .3, roughness: .05, clearcoat: 1 }),
    pcb: new T.MeshStandardMaterial({ color: 0x0d5c3c, roughness: .55, metalness: .15 }),
    chip: new T.MeshStandardMaterial({ color: 0x1a1b1c, metalness: .6, roughness: .32 }),
    batt: new T.MeshStandardMaterial({ color: 0x23262a, metalness: .4, roughness: .5 }),
    glass: new T.MeshPhysicalMaterial({ color: 0xffffff, roughness: .02, metalness: 0, transparent: true, opacity: .16, clearcoat: 1, depthWrite: false }),
  };

  // ---------- the screen: an Ownback holdings screen for this very phone ----------
  const sc = document.createElement('canvas'); sc.width = 720; sc.height = 1488;
  const screenTex = new T.CanvasTexture(sc); screenTex.anisotropy = 8;
  function drawScreen() {
    const x = sc.getContext('2d'), W = sc.width, H = sc.height, F = (w, s, f = 'Source Sans 3') => `${w} ${s}px "${f}", system-ui, sans-serif`;
    x.fillStyle = '#eeebe3'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#121212'; x.font = F(700, 30); x.fillText('9:41', 56, 70);
    x.fillRect(W - 120, 50, 54, 24); x.fillRect(W - 62, 56, 5, 12);
    x.fillStyle = '#0f7b4f'; x.beginPath(); x.moveTo(78, 168); x.lineTo(78, 132); x.arc(78, 168, 36, -Math.PI / 2, 0, true); x.closePath(); x.fill();
    x.fillStyle = '#e9b949'; x.beginPath(); x.moveTo(84, 162); x.lineTo(84, 126); x.arc(84, 162, 36, -Math.PI / 2, 0, false); x.closePath(); x.fill();
    x.fillStyle = '#121212'; x.font = F(800, 40, 'Bricolage Grotesque'); x.fillText('Ownback', 136, 180);
    x.font = F(700, 22, 'JetBrains Mono'); x.fillStyle = '#6b6b66'; x.fillText('FROM YOUR IPHONE 16 · ₹79,900', 56, 270);
    x.fillStyle = '#121212'; x.font = F(800, 112, 'Bricolage Grotesque'); x.fillText('$47.75', 50, 390);
    x.save(); x.translate(56, 420); x.rotate(-.03); x.fillStyle = '#ff2e88'; x.fillRect(0, 0, 300, 46); x.fillStyle = '#fff'; x.font = F(700, 26); x.fillText('5% set aside for you', 14, 32); x.restore();
    const bx = 56, bw = W - 112; [[.7, '#0f7b4f'], [.2, '#e9b949'], [.1, '#ff2e88']].reduce((o, [k, c]) => { x.fillStyle = c; x.fillRect(bx + o * bw, 520, k * bw - 6, 34); return o + k; }, 0);
    const rows = [['Apple', 'maker · AAPL', '0.1445', '$33.43', '#0f7b4f'], ['TSMC', 'the chip', '', '$3.18', '#e9b949'], ['Qualcomm', 'the modem', '', '$3.18', '#e9b949'], ['Corning', 'the glass', '', '$3.19', '#e9b949'], ['Gold', 'connectors', '', '$2.39', '#ff2e88'], ['Silver', 'conductive paste', '', '$2.38', '#ff2e88']];
    rows.forEach(([n, s, q, v, c], i) => {
      const y = 620 + i * 112; x.fillStyle = '#fffdf8'; x.fillRect(48, y, W - 96, 96); x.fillStyle = c; x.fillRect(48, y, 10, 96);
      x.fillStyle = '#121212'; x.font = F(800, 34, 'Bricolage Grotesque'); x.fillText(n, 80, y + 44); x.fillStyle = '#6b6b66'; x.font = F(600, 24); x.fillText(s, 80, y + 78);
      x.textAlign = 'right'; x.fillStyle = '#121212'; x.font = F(700, 32, 'JetBrains Mono'); x.fillText(v, W - 76, y + 46);
      if (q) { x.fillStyle = '#6b6b66'; x.font = F(600, 22, 'JetBrains Mono'); x.fillText(q + ' shares', W - 76, y + 78); }
      x.textAlign = 'left';
    });
    const by = H - 190; x.fillStyle = '#0f7b4f'; x.beginPath(); if (x.roundRect) x.roundRect(56, by, W - 112, 100, 50); else x.rect(56, by, W - 112, 100); x.fill();
    x.fillStyle = '#fff'; x.font = F(800, 38, 'Bricolage Grotesque'); x.textAlign = 'center'; x.fillText('Approve buy', W / 2, by + 64); x.textAlign = 'left';
    x.fillStyle = '#121212'; x.fillRect(W / 2 - 110, H - 40, 220, 10);
    screenTex.needsUpdate = true;
  }
  drawScreen(); (document.fonts ? document.fonts.ready : Promise.resolve()).then(drawScreen);
  const screenMat = new T.MeshStandardMaterial({ color: 0x000000, roughness: .3, metalness: 0, emissive: 0xffffff, emissiveMap: screenTex, emissiveIntensity: .92 });

  // ---------- the phone, as parts (front to back) ----------
  const PW = 1.5, PH = 3.1, phone = new T.Group(); scene.add(phone);
  const parts = [];
  function part(name, obj, zOpen, xOpen = 0, yOpen = 0) { const g = new T.Group(); g.add(obj); phone.add(g); const p = { name, g, zOpen, xOpen, yOpen, z0: 0 }; parts.push(p); return p; }
  const glass = part('glass', slab(PW, PH, .025, .24, M.glass), 2.5, -.15, .1);
  const disp = new T.Group(); disp.add(slab(PW - .04, PH - .04, .03, .22, M.chip));
  const face = new T.Mesh(new T.ShapeGeometry(rr(PW - .1, PH - .1, .19), 12), screenMat); face.position.z = .017;
  { const uv = face.geometry.attributes.uv, pos = face.geometry.attributes.position; for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / (PW - .1) + .5, pos.getY(i) / (PH - .1) + .5); }
  disp.add(face); part('display', disp, 1.65, -.08, .05);
  const board = new T.Group(); board.add(slab(.62, 1.25, .045, .05, M.pcb, .2));
  const aChip = box(.3, .3, .05, M.chip); aChip.position.set(0, .3, .045); board.add(aChip);
  const aCap = box(.2, .2, .012, silver); aCap.position.set(0, .3, .073); board.add(aCap);
  const modem = box(.2, .16, .04, M.chip); modem.position.set(-.1, -.12, .04); board.add(modem);
  const mem = box(.14, .22, .035, M.chip); mem.position.set(.15, -.1, .038); board.add(mem);
  for (let i = 0; i < 8; i++) { const c = box(.045, .02, .012, gold); c.position.set(-.16 + i * .045, -.5, .03); board.add(c); }
  for (let i = 0; i < 6; i++) { const tr = box(.5, .008, .006, gold); tr.position.set(0, -.34 + i * .055, .026); board.add(tr); }
  board.position.set(.36, .78, 0);
  part('board', board, .75, .55, .25);
  part('frame', ring(PW, PH, .24, .09, .26, M.titanium), 0, 0, 0);
  const batt = new T.Group(); batt.add(slab(1.1, 1.62, .07, .08, M.batt, .2));
  const pad = box(.22, .08, .01, silver); pad.position.set(.32, .78, .04); batt.add(pad);
  batt.position.set(-.08, -.6, 0); part('battery', batt, -.85, -.3, -.2);
  const back = new T.Group(); back.add(slab(PW, PH, .04, .24, M.backglass));
  const bump = slab(.64, .64, .06, .16, M.titanium); bump.position.set(-.38, 1.08, -.04); back.add(bump);
  [[-.5, 1.2], [-.26, .96], [-.5, .96]].forEach(([x, y], i) => { const l = new T.Mesh(new T.CylinderGeometry(.1, .1, .06, 32), i === 2 ? silver : M.lens); l.rotation.x = Math.PI / 2; l.position.set(x, y, -.08); back.add(l); const rg = new T.Mesh(new T.TorusGeometry(.105, .012, 8, 32), M.titanium); rg.position.set(x, y, -.11); back.add(rg); });
  part('back', back, -1.75, .1, -.1);
  const Z0 = { glass: .16, display: .12, board: .03, frame: 0, battery: -.06, back: -.15 };
  parts.forEach((p) => { p.z0 = Z0[p.name]; p.g.position.z = p.z0; });

  // ---------- the cutting slice and the pieces that fall to the jars ----------
  const sh = new T.Shape(); sh.moveTo(0, 0); sh.lineTo(1, 0); sh.absarc(0, 0, 1, 0, Math.PI / 2, false); sh.lineTo(0, 0);
  const sliceGeo = (r, d) => { const g = new T.ExtrudeGeometry(sh, { depth: d, bevelEnabled: true, bevelThickness: d * .2, bevelSize: d * .2, bevelSegments: 3, curveSegments: 32 }); g.translate(-.42, -.42, -d / 2); g.scale(r, r, 1); return g; };
  const blade = new T.Mesh(sliceGeo(1.1, .22), gold); scene.add(blade);
  const N = 70, bits = new T.InstancedMesh(sliceGeo(.11, .035), gold, N), d3 = new T.Object3D();
  const seeds = Array.from({ length: N }, (_, i) => ({ x: (Math.random() - .5) * 2, y: (Math.random() - .5) * 2.6, z: (Math.random() - .5) * 2, vx: (Math.random() - .5) * 1.4, vy: Math.random() * 1.2, r: Math.random() * 6, d: i / N * .3 }));
  bits.count = 0; scene.add(bits);

  // ---------- callouts: a dot on the part, a line, a label ----------
  const KIND = { maker: '#0f7b4f', behind: '#121212', mat: '#c9962c' };
  const anchor = (parent, x, y, z) => { const o = new T.Object3D(); o.position.set(x, y, z); parent.add(o); return o; };
  const CALL = [
    { co: 'Apple', part: 'designs and makes the iPhone', kind: 'maker', a: anchor(back, -.38, 1.08, -.12), side: 'L', k: .5 },
    { co: 'Corning', part: 'Ceramic Shield cover glass', kind: 'behind', a: anchor(glass.g, .5, 1.2, .02), side: 'R', k: .56 },
    { co: 'TSMC', part: 'makes the A-series chip', kind: 'behind', a: anchor(board, 0, .3, .08), side: 'R', k: .62 },
    { co: 'Qualcomm', part: '5G modem and radio', kind: 'behind', a: anchor(board, -.1, -.12, .07), side: 'L', k: .68 },
    { co: 'Gold', part: 'bond wires and connectors', kind: 'mat', a: anchor(board, 0, -.5, .04), side: 'R', k: .74 },
    { co: 'Silver', part: 'conductive paste', kind: 'mat', a: anchor(batt, .32, .78, .05), side: 'L', k: .8 },
  ].map((c) => {
    const el = document.createElement('div'); el.className = 'callout'; el.style.setProperty('--c', KIND[c.kind]);
    el.innerHTML = `<b>${c.co}</b><span>${c.part}</span>`; labelsEl.appendChild(el);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path'); line.setAttribute('class', 'lead'); svg.appendChild(line);
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); dot.setAttribute('r', '5'); dot.setAttribute('class', 'dot'); svg.appendChild(dot);
    return { ...c, el, line, dot, w: 0, h: 0 };
  });

  const cl = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v)), seg = (p, a, b) => cl((p - a) / (b - a));
  const ease = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const outBack = (t) => { const c = 1.4; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  const v = new T.Vector3();
  let W = 0, H = 0, portrait = false;

  window.OBSplit.render = function (t, now) {
    const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
    if (w !== W || h !== H) { W = w; H = h; portrait = w < h; R.setSize(w, h, false); cam.aspect = w / h; cam.fov = portrait ? 52 : 30; cam.updateProjectionMatrix(); svg.setAttribute('viewBox', `0 0 ${w} ${h}`); }
    CALL.forEach((c) => { if (!c.w) { c.w = c.el.offsetWidth; c.h = c.el.offsetHeight; } });
    const s = now / 1000;
    // camera: pull back from the blade's gold face, then a slow orbit
    const back2 = ease(seg(t, 0, .2)), dist = portrait ? 12 : 10.5, orb = ease(seg(t, .3, .8));
    cam.position.set(Math.sin(s * .2) * .25 + orb * .6, .2 + orb * .4, .35 + back2 * (dist - .35));
    cam.lookAt(portrait ? -1.15 : .35, portrait ? -.3 : .1, 0);
    // the cut: the blade swings across the phone, which flinches
    const wind = ease(seg(t, .1, .2)), cut = ease(seg(t, .18, .36));
    blade.position.set(2 * wind - 4.6 * cut, .3 * wind + 1.2 * cut, 1.3 - .9 * wind);
    blade.rotation.set(-.2, s * .4 * (1 - back2) + cut * 1.4, -.6 + cut * 1.1);
    blade.scale.setScalar(Math.max(.001, 1 - seg(t, .32, .4)));
    blade.visible = t < .4;
    const hit = Math.sin(seg(t, .26, .34) * Math.PI);
    // the explosion: each part flies out in turn, overshoots a little, then floats
    phone.rotation.set(-.26 + hit * .05, -.5 - orb * .32, .06 + hit * .04);
    parts.forEach((p, i) => {
      const k = outBack(seg(t, .3 + i * .035, .58 + i * .035)), f = Math.sin(s * 1.1 + i) * .03 * k;
      p.g.position.set(p.xOpen * k, p.yOpen * k + f, p.z0 + (p.zOpen - p.z0) * k);
      p.g.rotation.set(0, 0, p.xOpen * .08 * k);
    });
    phone.position.y = -ease(seg(t, .86, 1)) * 2;
    phone.updateMatrixWorld();
    // callouts: two columns beside the phone, pushed apart so labels never overlap
    const gut = Math.max(12, W * .03), placed = { L: [], R: [] };
    CALL.forEach((c) => {
      c.a.getWorldPosition(v); v.project(cam); c.ax = (v.x * .5 + .5) * W; c.ay = (-v.y * .5 + .5) * H;
      c.op = Math.min(seg(t, c.k, c.k + .05), 1 - seg(t, .86, .9));
      c.side = c.ax < W * (portrait ? .5 : .47) ? 'L' : 'R';
      placed[c.side].push(c);
    });
    for (const side of ['L', 'R']) {
      let lastBottom = -1e9;
      // labels sit in a column outside the phone; lines run from each part to its label
      const top = portrait ? H * .17 : 90, bottom = side === 'L' && !portrait ? H * .6 : H * (portrait ? .66 : .86);
      const list = placed[side].sort((a, b) => a.ay - b.ay), need = list.reduce((a, c) => a + c.h + 10, 0);
      lastBottom = Math.min(top - 10, bottom - need);
      list.forEach((c) => {
        c.lx = side === 'L' ? gut : W - gut - c.w;
        c.ly = Math.max(c.ay - c.h / 2, lastBottom + 10, top); lastBottom = c.ly + c.h;
      });
    }
    CALL.forEach((c) => {
      c.el.style.transform = `translate(${c.lx.toFixed(1)}px,${c.ly.toFixed(1)}px)`; c.el.style.opacity = c.op;
      const ex = c.side === 'L' ? c.lx + c.w : c.lx, ey = c.ly + c.h / 2, mx = c.side === 'L' ? ex + 16 : ex - 16;
      c.line.setAttribute('d', `M${c.ax.toFixed(1)},${c.ay.toFixed(1)} L${mx.toFixed(1)},${ey.toFixed(1)} L${ex.toFixed(1)},${ey.toFixed(1)}`);
      const len = Math.hypot(mx - c.ax, ey - c.ay) + 16; c.line.style.strokeDasharray = len; c.line.style.strokeDashoffset = len * (1 - seg(t, c.k, c.k + .06));
      c.line.style.opacity = c.op; c.dot.setAttribute('cx', c.ax.toFixed(1)); c.dot.setAttribute('cy', c.ay.toFixed(1)); c.dot.style.opacity = c.op; c.dot.style.stroke = KIND[c.kind];
    });
    bar.style.setProperty('--k', ease(seg(t, .6, .82)).toFixed(3));
    const fall = seg(t, .8, 1); bits.count = fall > 0 ? N : 0;
    if (fall > 0) {
      seeds.forEach((q, i) => { const k = cl((fall - q.d) / (1 - q.d)); d3.position.set(q.x + q.vx * k, q.y * .5 + q.vy * k - k * k * 7, q.z); d3.rotation.set(q.r + k * 6, q.r * 2 + k * 4, 0); d3.scale.setScalar(k > 0 ? 1 : .001); d3.updateMatrix(); bits.setMatrixAt(i, d3.matrix); });
      bits.instanceMatrix.needsUpdate = true;
    }
    R.render(scene, cam);
  };
})();
