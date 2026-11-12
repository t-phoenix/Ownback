// The scroll film: one continuous camera. Each scene is entered by zooming *through* something in the
// previous one. Coded screens are warped onto the exact four corners of the phones in the photos
// (a perspective map), then fade into the real screen, so nothing floats on top of a photo.
(function () {
  const $ = (id) => document.getElementById(id);
  const stage = $('stage'), film = $('film'), fx = $('fx'), g = fx.getContext('2d');
  const capEl = $('cap'), hud = $('hud'), spentEl = $('spent'), endcta = $('endcta'), hint = $('scrollhint'), bar = $('progress');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cl = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v)), seg = (p, a, b) => cl((p - a) / (b - a));
  const ease = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2), lerp = (a, b, k) => a + (b - a) * k;
  const smooth = (t) => t * t * (3 - 2 * t);
  const AR = 1376 / 768, PAPER = '#eeebe3';
  let W = 0, H = 0, portrait = false;

  // ---------- shots ----------
  const shots = {};
  document.querySelectorAll('.shot').forEach((el) => {
    const s = { el, name: el.dataset.shot, src: el.dataset.src, rw: 0, rh: 0, rx: 0, ry: 0, cam: null, on: !el.hidden };
    const f = (el.dataset.focus || '.5,.5').split(',').map(Number);
    s.focus = f; s.focusM = el.dataset.focusM ? el.dataset.focusM.split(',').map(Number) : f;
    if (s.src) {
      const plate = document.createElement('div'); plate.className = 'plate';
      const img = new Image(); img.src = s.src; img.alt = ''; img.decoding = 'async'; img.draggable = false; plate.appendChild(img);
      el.querySelectorAll('.ov').forEach((o) => { const [u, v] = o.dataset.at.split(',').map(Number); o.style.left = u * 100 + '%'; o.style.top = v * 100 + '%'; plate.appendChild(o); });
      el.prepend(plate); s.plate = plate;
    }
    shots[s.name] = s;
  });

  // Phone screens in the photos, measured corner by corner (TL, TR, BR, BL as image fractions).
  const QUAD = {
    salary: [[.5809, .5085], [.6943, .5635], [.5597, .7924], [.4136, .6969]],
    chat: [[.5923, .3516], [.686, .3477], [.6773, .7422], [.5814, .7383]],
  };
  // Other spots the camera dives into (w and h are fractions of the image width).
  const RECT = {
    box02: { u: .76, v: .68, w: .34, h: .24, rot: 0 },
    box06: { u: .487, v: .71, w: .33, h: .23, rot: 0 },
    slice06: { u: .5, v: .245, w: .12, h: .13, rot: 0 },
    jarL: { u: .295, v: .6, w: .14, h: .2, rot: 0 },
    sky: { u: .2, v: .16, w: .1, h: .1, rot: 0 },
    thumb: null, // measured from the order screen
  };
  const phoneT = { x: 0, y: 0, w: 1, h: 1, rad: 0 };

  function layout() {
    W = stage.clientWidth; H = stage.clientHeight; portrait = W < H * .9;
    fx.width = Math.round(W * Math.min(devicePixelRatio, 1.5)); fx.height = Math.round(H * Math.min(devicePixelRatio, 1.5));
    for (const s of Object.values(shots)) {
      s.rw = W; s.rh = H; s.rx = 0; s.ry = 0;
      if (!s.plate) continue;
      const [fx0, fy0] = portrait ? s.focusM : s.focus;
      s.rw = Math.max(W, H * AR); s.rh = s.rw / AR;
      s.rx = cl(W / 2 - fx0 * s.rw, W - s.rw, 0); s.ry = cl(H / 2 - fy0 * s.rh, H - s.rh, 0);
      Object.assign(s.plate.style, { left: s.rx + 'px', top: s.ry + 'px', width: s.rw + 'px', height: s.rh + 'px' });
    }
    // the coded phone: right of the caption on wide screens, above it on tall ones
    const ph = portrait ? Math.min(H * .6, W * .8 * 19.5 / 9) : Math.min(H * .8, W * .92 * 19.5 / 9), pw = ph * 9 / 19.5, pf = $('pframe');
    const cx = W > 900 ? W * .66 : W / 2, cy = portrait ? H * .4 : H / 2;
    pf.style.setProperty('--pw', pw + 'px'); pf.style.setProperty('--ph', ph + 'px'); pf.style.left = cx + 'px'; pf.style.top = cy + 'px';
    Object.assign(phoneT, { x: cx - pw / 2, y: cy - ph / 2, w: pw, h: ph, rad: pw * .13 });
    // where the parcel thumbnail sits on the order screen (with the sheet fully up)
    const s = shots.phone, was = s.el.hidden, tf = s.el.style.transform;
    s.el.hidden = false; s.el.style.transform = 'none';
    const pic = $('orderpic').getBoundingClientRect(), sheet = $('order').getBoundingClientRect(), fr = pf.getBoundingClientRect(), st = stage.getBoundingClientRect();
    const x = fr.left + (pic.left - sheet.left) - st.left + pic.width / 2, y = fr.top + (pic.top - sheet.top) - st.top + pic.height / 2;
    RECT.thumb = { u: x / W, v: y / H, w: pic.width / W, h: pic.height / W, rot: 0 };
    s.el.style.transform = tf; s.el.hidden = was;
  }

  // ---------- camera ----------
  const pt = (s, u, v) => ({ x: s.rx + u * s.rw, y: s.ry + v * s.rh });
  const coverT = (R) => { const ar = R.w / R.h, w = Math.max(W, H * ar), h = w / ar; return { x: (W - w) / 2, y: (H - h) / 2, w, h, rad: 0 }; };
  // e = 0: the shot at rest. e = 1: rect R fills target T, centred where T sits on screen.
  function camOf(s, R, e, T) {
    const c = pt(s, R.u, R.v), Rw = R.w * s.rw;
    const Z = Math.pow(T.w / Rw, e), th = -R.rot * e, a = -th * Math.PI / 180;
    const A = { x: T.x + T.w / 2, y: T.y + T.h / 2 }, S = { x: lerp(c.x, A.x, e) - W / 2, y: lerp(c.y, A.y, e) - H / 2 };
    return { c, Rw, Z, th, L: { x: c.x - (S.x * Math.cos(a) - S.y * Math.sin(a)) / Z, y: c.y - (S.x * Math.sin(a) + S.y * Math.cos(a)) / Z } };
  }
  function toScreen(s, x, y) {
    const k = s.cam; if (!k) return { x, y };
    const a = k.th * Math.PI / 180, dx = (x - k.L.x) * k.Z, dy = (y - k.L.y) * k.Z;
    return { x: W / 2 + dx * Math.cos(a) - dy * Math.sin(a), y: H / 2 + dx * Math.sin(a) + dy * Math.cos(a) };
  }
  const proj = (name, u, v) => { const s = shots[name], p = pt(s, u, v); return toScreen(s, p.x, p.y); };
  const camCss = (k) => `translate(${W / 2}px,${H / 2}px) rotate(${k.th}deg) scale(${k.Z}) translate(${-k.L.x}px,${-k.L.y}px)`;

  // A rect R that matches a measured quad, so the camera can fly into it.
  function quadRect(s, Q) {
    const P = Q.map(([u, v]) => pt(s, u, v)), d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const c = { x: P.reduce((a, p) => a + p.x, 0) / 4, y: P.reduce((a, p) => a + p.y, 0) / 4 };
    const w = (d(P[0], P[1]) + d(P[3], P[2])) / 2, h = (d(P[0], P[3]) + d(P[1], P[2])) / 2;
    return { R: { u: (c.x - s.rx) / s.rw, v: (c.y - s.ry) / s.rh, w: w / s.rw, h: h / s.rw, rot: Math.atan2(P[0].x - P[3].x, P[3].y - P[0].y) * 180 / Math.PI }, P };
  }
  // CSS matrix that maps rect T onto quad q (TL, TR, BR, BL): a true perspective warp.
  function rectToQuad(T, q) {
    const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
    const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2, sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
    let G = 0, Hh = 0;
    if (Math.abs(sx) > 1e-6 || Math.abs(sy) > 1e-6) { const den = dx1 * dy2 - dx2 * dy1; G = (sx * dy2 - dx2 * sy) / den; Hh = (dx1 * sy - sx * dy1) / den; }
    const a = x1 - x0 + G * x1, b = x3 - x0 + Hh * x3, d = y1 - y0 + G * y1, e = y3 - y0 + Hh * y3;
    const A = a / T.w, B = b / T.h, C = x0 - A * T.x - B * T.y, D = d / T.w, E = e / T.h, F = y0 - D * T.x - E * T.y;
    const GG = G / T.w, HH = Hh / T.h, I = 1 - GG * T.x - HH * T.y;
    return `matrix3d(${A},${D},0,${GG},${B},${E},0,${HH},0,0,1,0,${C},${F},0,${I})`;
  }

  let used = new Set();
  function use(name, z = 1) {
    const s = shots[name]; used.add(name);
    if (!s.on) { s.el.hidden = false; s.on = true; }
    const st = s.el.style; st.zIndex = z; st.opacity = 1; st.clipPath = ''; st.boxShadow = ''; st.filter = ''; st.transformOrigin = '0 0';
    return s;
  }
  function rest(name, z = 1, extra = '') { const s = use(name, z); s.cam = null; s.el.style.transform = extra || 'none'; return s; }
  function look(name, R, e, z = 1, jitter = 0) {
    const s = use(name, z), k = camOf(s, R, e, coverT(R)); s.cam = k;
    const j = jitter ? `translate(${Math.sin(performance.now() / 11) * jitter}px,${Math.cos(performance.now() / 13) * jitter}px) ` : '';
    s.el.style.transform = j + camCss(k);
    return s;
  }
  // Fly from photo `outer` into the phone screen Q. The coded `inner` is warped onto the real screen's corners
  // at e = 0 and becomes the full screen at e = 1.
  function screenPortal(outer, Q, e, inner, Tkind, { op = 1, reveal = 0, bg = PAPER } = {}) {
    const so = use(outer, 1), si = use(inner, 2), { R, P } = quadRect(so, Q);
    const T = Tkind === 'phone' ? phoneT : coverT(R), k = camOf(so, R, e, T); so.cam = k; so.el.style.transform = camCss(k);
    const tc = [[T.x, T.y], [T.x + T.w, T.y], [T.x + T.w, T.y + T.h], [T.x, T.y + T.h]], m = smooth(seg(e, .45, 1));
    const q = P.map((p, i) => { const s2 = toScreen(so, p.x, p.y); return [lerp(s2.x, tc[i][0], m), lerp(s2.y, tc[i][1], m)]; });
    const st = si.el.style; si.cam = null;
    st.transform = rectToQuad(T, q);
    const r = 1 - reveal, ins = [T.y, W - T.x - T.w, H - T.y - T.h, T.x].map((v) => (v * r).toFixed(1) + 'px').join(' ');
    st.clipPath = `inset(${ins} round ${(T.rad * r).toFixed(1)}px)`;
    if (Tkind !== 'phone') st.boxShadow = `0 0 0 ${Math.max(W, H) * 2}px ${bg}`;
    st.opacity = op;
  }

  // ---------- effects (screen space, one canvas over the shots) ----------
  const dpr = () => fx.width / W;
  function slice(x, y, r, rot, a = 1) {
    g.save(); g.translate(x, y); g.rotate(rot); g.globalAlpha = a;
    const gr = g.createLinearGradient(-r, -r, r, r); gr.addColorStop(0, '#fff1c8'); gr.addColorStop(.45, '#e9b949'); gr.addColorStop(1, '#8a6417');
    g.fillStyle = gr; g.beginPath(); g.moveTo(-r * .42, r * .42); g.lineTo(r * .58, r * .42); g.arc(-r * .42, r * .42, r, 0, -Math.PI / 2, true); g.closePath(); g.fill(); g.restore();
  }
  function glow(x, y, r, rgb, a) {
    if (a <= 0) return; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.globalCompositeOperation = 'lighter'; g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); g.globalCompositeOperation = 'source-over';
  }
  const motes = Array.from({ length: 50 }, () => ({ x: Math.random(), y: Math.random(), s: .6 + Math.random() * 1.8, v: .01 + Math.random() * .03, p: Math.random() * 6 }));
  function dust(t, a, rgb = '255,222,160') {
    motes.forEach((m) => { const y = ((m.y - t * m.v) % 1 + 1) % 1, x = m.x + Math.sin(t * .5 + m.p) * .01, k = a * (.35 + .35 * Math.sin(t * 2 + m.p)); if (k <= 0) return; g.fillStyle = `rgba(${rgb},${k})`; g.beginPath(); g.arc(x * W, y * H, m.s * Math.max(1, W / 1000), 0, 7); g.fill(); });
  }
  function steam(p, t, scale) {
    for (let i = 0; i < 7; i++) { const k = (t * .18 + i / 7) % 1, x = p.x + Math.sin(t * .8 + i * 2) * 8 * scale * (1 + k * 3), y = p.y - k * 120 * scale, r = (10 + k * 40) * scale; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(255,250,240,${.14 * (1 - k)})`); gr.addColorStop(1, 'rgba(255,250,240,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
  }
  function rain(targets, t, a, size) {
    targets.forEach((p, j) => { for (let i = 0; i < 6; i++) { const k = (t * .6 + i / 6 + j * .21) % 1, x = p.x + Math.sin(i * 3 + j) * size * 1.2, y = lerp(-size * 2, p.y, k); slice(x, y, size, t * 3 + i * 1.7, a * (k < .85 ? 1 : (1 - k) / .15)); } });
  }

  // ---------- small UI state ----------
  const msgs = [...document.querySelectorAll('#thread .msg')], order = $('order'), lock = $('lock');
  const jartags = [...shots.jars.el.querySelectorAll('.jartag')], ripple = $('ripple'), approved = $('approved');
  const set = (el, cls, on) => el.classList.toggle(cls, !!on);
  const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
  let capNow = null, capTimer = 0;
  function caption(html) {
    if (html === capNow) return; capNow = html; capEl.classList.remove('on'); clearTimeout(capTimer);
    capTimer = setTimeout(() => { capEl.innerHTML = html || ''; if (html) capEl.classList.add('on'); }, 220);
  }
  const phoneState = ({ lockOn = false, chat = 0, orderOn = false }) => { set(lock, 'on', lockOn); msgs.forEach((m, i) => set(m, 'on', chat > .06 + i * .16)); set(order, 'on', orderOn); };

  // Captions use the zine style of the intro film: <b> paper block, <em> green block, <i> pink tag.
  const S = [
    ['hero', 5, () => { rest('hero'); }],
    ['heroOut', 9, (t) => { const e = ease(1 - t); screenPortal('salary', QUAD.salary, e, 'hero', 'cover', { op: seg(e, .3, .7), reveal: seg(e, .85, 1) }); }],
    ['salary', 6, (t, s) => { const { R } = quadRect(shots.salary, QUAD.salary); look('salary', R, 0, 1, reduce || t > .5 ? 0 : 2); steam(proj('salary', .86, .34), s, H / 700); const p = proj('salary', .56, .62); glow(p.x, p.y, W * .1, '190,240,215', .08 + .08 * Math.sin(s * 9)); },
      '<b>The 1st.</b><br><em>Salary’s in.</em><i>that feeling lasts about a week</i>'],
    ['salaryIn', 8, (t) => { screenPortal('salary', QUAD.salary, ease(t), 'phone', 'phone', { op: seg(t, .1, .4), reveal: seg(t, .85, 1) }); phoneState({ lockOn: t < .7 }); }],
    ['chat', 10, (t) => { rest('phone'); phoneState({ chat: t }); }, '<b>Everyone’s talking</b><br><em>about stocks.</em><i>nobody tells you where to start</i>'],
    ['chatOut', 8, (t) => { const e = ease(1 - t); screenPortal('bedroom', QUAD.chat, e, 'phone', 'phone', { op: seg(e, .25, .6), reveal: seg(e, .85, 1) }); phoneState({ chat: 1 }); },
      '<b>Everyone’s talking</b><br><em>about stocks.</em><i>nobody tells you where to start</i>'],
    ['bedroom', 6, () => { const { R } = quadRect(shots.bedroom, QUAD.chat); look('bedroom', R, 0); }, '<b>So you do</b><br><em>what you know.</em><i>add to cart</i>'],
    ['orderIn', 7, (t) => { screenPortal('bedroom', QUAD.chat, ease(t), 'phone', 'phone', { op: seg(t, .1, .4), reveal: seg(t, .85, 1) }); phoneState({ chat: 1, orderOn: true }); }, '<b>So you do</b><br><em>what you know.</em><i>add to cart</i>'],
    ['order', 5, () => { rest('phone'); phoneState({ chat: 1, orderOn: true }); }, '<em>Order placed.</em>'],
    ['thumbIn', 7, (t) => { phoneState({ chat: 1, orderOn: true }); look('phone', RECT.thumb, ease(t)); const d = look('doorway', RECT.box02, 1, 2); d.el.style.opacity = seg(t, .78, 1); }, '<em>Order placed.</em>'],
    ['doorwayOut', 8, (t, s) => { look('doorway', RECT.box02, ease(1 - t)); dust(s, t * .5); }, '<em>Order placed.</em><br><b>Again.</b>'],
    ['doorway', 6, (t, s) => { const bump = (t * 6) % 1; look('doorway', RECT.box02, 0); if (!reduce && bump < .1) shots.doorway.el.style.transform = `translateY(${-Math.sin(bump / .1 * Math.PI) * 4}px)`; dust(s, .5); },
      '<em>Order placed.</em><br><b>Again. And again.</b>'],
    ['boxIn', 6, (t) => { look('doorway', RECT.box02, ease(t)); const b = look('box', RECT.box06, 1, 2); b.el.style.opacity = seg(t, .7, 1); }],
    ['boxOut', 7, (t, s) => { look('box', RECT.box06, ease(1 - t)); const p = proj('box', .5, .3); glow(p.x, p.y, W * .3, '255,214,140', .12 + .25 * t); dust(s, t); }],
    ['box', 7, (t, s) => { look('box', RECT.box06, 0); const p = proj('box', .5, .3); glow(p.x, p.y, W * .3, '255,214,140', .3 + .1 * Math.sin(s * 1.5)); dust(s, 1); },
      '<b>What if every order</b><br><b>came with</b> <em>a piece of the company</em><i>inside the box</i>'],
    ['sliceIn', 6, (t, s) => { look('box', RECT.slice06, ease(t)); const sp = rest('split', 2); sp.el.style.opacity = seg(t, .72, 1); window.OBSplit.render(0, s * 1000); }],
    ['split', 16, (t, s) => { rest('split'); window.OBSplit.render(t, s * 1000); },
      (t) => (t < .55 ? '<b>Every product is</b><br><em>many companies.</em><i>Apple makes it · TSMC, Qualcomm and Corning are inside</i>' : '<b>You get</b><br><em>a piece of each.</em><i>your share, split 70 / 20 / 10</i>')],
    ['tilt', 8, (t, s) => { const e = ease(t); rest('split', 2, `translateY(${-e * H}px)`); window.OBSplit.render(1, s * 1000); rest('jars', 1, `translateY(${(1 - e) * H}px)`);
      const off = (1 - e) * H; rain([.295, .5, .705].map((u) => { const p = pt(shots.jars, u, .42); return { x: p.x, y: p.y + off }; }), s, 1, W * .018); },
      '<em>5% of every order,</em><br><b>saved in your own jars.</b>'],
    ['jars', 8, (t, s) => { look('jars', RECT.jarL, 0); const k = ease(seg(t, 0, .8));
      [['Apple', 5], ['Chips & glass', 1.43], ['Gold', .71]].forEach(([n, v], i) => { jartags[i].textContent = `${n} · $${(v * k).toFixed(2)}${i === 0 && k >= 1 ? ' ✓ ready' : ''}`; set(jartags[i], 'full', i === 0 && k >= 1); });
      rain([.295, .5, .705].map((u) => proj('jars', u, .42)), s, 1 - seg(t, .8, 1), W * .018);
      if (k >= 1) { const p = proj('jars', .295, .62); glow(p.x, p.y, W * .14, '255,214,140', .35 + .2 * Math.sin(s * 5)); } },
      '<b>Your jars fill</b><br><em>in digital dollars.</em><i>we’ll tell you when one is ready</i>'],
    ['jarIn', 6, (t) => { const j = look('jars', RECT.jarL, ease(t)); j.el.style.filter = `brightness(${1 + 1.6 * t})`; const p = proj('jars', .295, .62); glow(p.x, p.y, W * (.14 + t), '255,226,170', .5 + .5 * t);
      const su = rest('sunday', 2); su.el.style.opacity = seg(t, .7, 1); su.el.style.filter = 'brightness(2.6)'; }],
    ['sundayIn', 6, (t) => { const su = rest('sunday'); su.el.style.filter = `brightness(${lerp(2.6, 1, ease(t))})`; }, '<em>Sunday, 10 AM.</em>'],
    ['approve', 9, (t, s) => { look('sunday', RECT.sky, 0); const b = proj('sunday', .64, .67);
      if (t < .4) glow(b.x, b.y, W * .06, '111,214,162', .35 + .3 * Math.sin(s * 8));
      const r = seg(t, .35, .6); ripple.style.opacity = r > 0 && r < 1 ? 1 - r : 0; ripple.style.transform = `translate(-50%,-50%) scale(${.4 + r * 2.4})`;
      set(approved, 'on', t > .5);
      const f = ease(seg(t, .58, 1)), to = proj('sunday', RECT.sky.u, RECT.sky.v); if (f > 0) slice(lerp(b.x, to.x, f), lerp(b.y, to.y, f) - Math.sin(f * Math.PI) * H * .12, W * lerp(.012, .03, f), s * 4); },
      '<b>You see the price</b><br><em>and every fee.</em><i>nothing buys until you tap</i>'],
    ['skyIn', 5, (t, s) => { look('sunday', RECT.sky, ease(t)); slice(W / 2, H / 2, Math.min(W, H) * lerp(.03, .5, ease(t)), s * 2); const gd = rest('gold', 2); gd.el.style.opacity = seg(t, .6, 1); }],
    ['vaultOut', 8, (t, s) => { rest('vault'); window.OBVault.render('out', t, s * 1000); const gd = rest('gold', 2); gd.el.style.opacity = 1 - seg(t, 0, .45); }],
    ['vault', 14, (t, s) => { rest('vault'); window.OBVault.render('open', t, s * 1000); },
      (t) => (t < .4 ? '<b>Your pieces are</b><br><em>kept safe.</em><i>in your own wallet, not ours</i>' : '<em>The app is live.</em><i>we’re letting people in a few at a time</i>')],
    ['vaultIn', 9, (t, s) => { rest('vault'); window.OBVault.render('in', t, s * 1000); const p = rest('paper', 2); p.el.style.opacity = seg(t, .5, .95); },
      '<em>The app is live.</em><i>we’re letting people in a few at a time</i>'],
  ];
  const total = S.reduce((a, x) => a + x[1], 0);
  film.style.setProperty('--film-h', (total * 6 + 100) + 'vh');
  const starts = []; S.reduce((a, x) => { starts.push(a / total); return a + x[1]; }, 0);
  const HUD_ON = ['doorwayOut', 'doorway', 'boxIn'];

  // ---------- loop ----------
  let target = 0, cur = 0, last = performance.now();
  function readScroll() {
    const r = film.getBoundingClientRect(), span = film.offsetHeight - H;
    target = span > 0 ? cl(-r.top / span) : 0;
    const doc = document.documentElement; bar.style.transform = `scaleX(${cl(scrollY / (doc.scrollHeight - innerHeight))})`;
  }
  addEventListener('scroll', readScroll, { passive: true });
  new ResizeObserver(() => { layout(); readScroll(); }).observe(stage);
  layout(); readScroll(); cur = target;

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(.1, (now - last) / 1000); last = now;
    cur = reduce ? target : cur + (target - cur) * (1 - Math.exp(-dt * 9));
    const fr = film.getBoundingClientRect(); if (fr.bottom < 0 || fr.top > innerHeight) { if (window.OBCoin) window.OBCoin.active = false; return; }
    let i = S.length - 1; while (i > 0 && starts[i] > cur) i--;
    const [name, w, run, cap] = S[i], t = cl((cur - starts[i]) * total / w), s = reduce ? 0 : now / 1000;
    used = new Set();
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, fx.width, fx.height); g.setTransform(dpr(), 0, 0, dpr(), 0, 0);
    run(t, s);
    for (const sh of Object.values(shots)) if (!used.has(sh.name) && sh.on) { sh.el.hidden = true; sh.on = false; }
    if (window.OBCoin) window.OBCoin.active = used.has('hero');
    caption(typeof cap === 'function' ? cap(t) : cap || null);
    const hi = HUD_ON.indexOf(name); set(hud, 'on', hi >= 0);
    if (hi >= 0) spentEl.textContent = inr(27723 * ease(hi === 0 ? t * .45 : hi === 1 ? .45 + t * .55 : 1));
    set(endcta, 'on', (name === 'vault' && t > .6) || name === 'vaultIn');
    hint.style.opacity = cur < .004 ? 1 : 0;
    stage.dataset.scene = name;
  }
  requestAnimationFrame(frame);
})();
