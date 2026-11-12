// Hero toy: a heavy gold Ownback coin. Drag/flick to spin, tap the gold corner to drop a piece into the jar.
(function () {
  const T = window.THREE, cv = document.getElementById('coin');
  window.OBCoin = { active: true };
  if (!T || !cv) return;
  let R;
  try { R = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); } catch { return; }
  R.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  R.toneMapping = T.ACESFilmicToneMapping; R.toneMappingExposure = 1.05;
  const scene = new T.Scene(), cam = new T.PerspectiveCamera(28, 1, .1, 50);
  cam.position.set(0, 0, 9.6);

  // studio light baked into an environment map: soft boxes, warm fills, a green bounce from the page
  const pm = new T.PMREMGenerator(R), es = new T.Scene();
  es.background = new T.Color(0x070604);
  [[0xffffff, 5, 0, 5, 3, 7, 1.6], [0xfff0d8, 3.2, -5, 1.5, 2, 1.6, 6], [0xffe2b8, 2.4, 5, -.5, 1.5, 1.6, 5], [0xffffff, 1.4, 0, -4.5, 3, 7, .8], [0x2f9a6a, .9, 0, 0, -6, 9, 9], [0xffffff, 6, 2.2, 2.6, 4, .7, .7]]
    .forEach(([c, k, x, y, z, w, h]) => { const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(c).multiplyScalar(k), side: T.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); es.add(m); });
  scene.environment = pm.fromScene(es, .015).texture;
  const key = new T.DirectionalLight(0xfff1dc, .6); key.position.set(2, 3, 4); scene.add(key);

  // engraving drawn as a height map (white = raised)
  const S = 1024, c = S / 2, r0 = S / 2, bc = document.createElement('canvas'); bc.width = bc.height = S; const x = bc.getContext('2d');
  x.fillStyle = '#7a7a7a'; x.fillRect(0, 0, S, S);
  for (let r = 40; r < r0 * .76; r += 6) { x.strokeStyle = (r / 6) % 2 ? '#6c6c6c' : '#8a8a8a'; x.lineWidth = 2.2; x.beginPath(); x.arc(c, c, r, 0, 7); x.stroke(); }
  for (let i = 0; i < 120; i++) { const a = i / 120 * Math.PI * 2; x.strokeStyle = '#858585'; x.lineWidth = 1.4; x.beginPath(); x.moveTo(c + Math.cos(a) * r0 * .2, c + Math.sin(a) * r0 * .2); x.lineTo(c + Math.cos(a) * r0 * .76, c + Math.sin(a) * r0 * .76); x.stroke(); }
  x.lineWidth = r0 * .06; x.strokeStyle = '#f2f2f2'; x.beginPath(); x.arc(c, c, r0 * .955, 0, 7); x.stroke();
  x.lineWidth = 7; x.strokeStyle = '#e6e6e6'; x.beginPath(); x.arc(c, c, r0 * .785, 0, 7); x.stroke();
  function engrave() {
    x.fillStyle = '#f5f5f5'; x.font = '800 44px "Bricolage Grotesque",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const txt = [...'OWN WHAT YOU BUY · OWNBACK · MMXXVI · '];
    txt.forEach((ch, i) => { const a = -Math.PI / 2 + i * (Math.PI * 2 / txt.length); x.save(); x.translate(c + Math.cos(a) * r0 * .87, c + Math.sin(a) * r0 * .87); x.rotate(a + Math.PI / 2); x.fillText(ch, 0, 0); x.restore(); });
    x.font = '800 120px "Bricolage Grotesque",sans-serif'; x.fillText('5%', c + r0 * .4, c - r0 * .4);
    x.font = '600 40px "JetBrains Mono",monospace'; x.fillText('ONE PIECE', c - r0 * .4, c + r0 * .42);
  }
  const bump = new T.CanvasTexture(bc); bump.repeat.set(.5, .5); bump.offset.set(.5, .5);
  const tc = document.createElement('canvas'); tc.width = tc.height = S; const y = tc.getContext('2d');
  const tint = new T.CanvasTexture(tc); tint.repeat.set(.5, .5); tint.offset.set(.5, .5);
  function paintTint() { y.fillStyle = '#fff'; y.fillRect(0, 0, S, S); y.globalAlpha = .4; y.drawImage(bc, 0, 0); y.globalAlpha = 1; bump.needsUpdate = tint.needsUpdate = true; }
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => { engrave(); paintTint(); });
  paintTint();

  const face = new T.MeshPhysicalMaterial({ color: 0xffc35a, metalness: 1, roughness: .24, clearcoat: .35, clearcoatRoughness: .2, bumpMap: bump, bumpScale: .018, map: tint });
  const edge = new T.MeshPhysicalMaterial({ color: 0xf2b24a, metalness: 1, roughness: .32 });
  const sface = face.clone(); sface.color.set(0xffd06a); sface.roughness = .16;
  const D = .16, ext = { depth: D, bevelEnabled: true, bevelThickness: .035, bevelSize: .03, bevelSegments: 4, curveSegments: 72 };
  const ds = new T.Shape(); ds.moveTo(0, 0); ds.lineTo(0, 1); ds.absarc(0, 0, 1, Math.PI / 2, Math.PI * 2, false); ds.lineTo(0, 0);
  const ss = new T.Shape(); ss.moveTo(0, 0); ss.lineTo(1, 0); ss.absarc(0, 0, 1, 0, Math.PI / 2, false); ss.lineTo(0, 0);
  const dg = new T.ExtrudeGeometry(ds, ext); dg.translate(0, 0, -D / 2);
  const sg = new T.ExtrudeGeometry(ss, ext); sg.translate(0, 0, -D / 2);
  const coin = new T.Group(); scene.add(coin);
  const disc = new T.Mesh(dg, [face, edge]); coin.add(disc);
  const HOME = new T.Vector3(.06, .06, .035);
  const home = new T.Group(); home.position.copy(HOME); coin.add(home);
  const slice = new T.Mesh(sg, [sface, edge]); home.add(slice);
  const flyer = new T.Mesh(sg, [sface, edge]); flyer.visible = false; scene.add(flyer);
  coin.rotation.set(-.15, .35, 0);

  const hint = document.getElementById('coinhint'), fill = document.getElementById('mjfill'), amt = document.getElementById('mjamt'), msg = document.getElementById('mjmsg'), jar = document.getElementById('minijar');
  const av = new T.Vector2(), rc = new T.Raycaster(), ndc = new T.Vector2(), X = new T.Vector3(1, 0, 0), Y = new T.Vector3(0, 1, 0);
  let drag = null, hover = new T.Vector2(), pieces = 0, fly = null, regrow = 1, tapped = false;
  const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch { /* not supported */ } };
  const setNdc = (e) => { const r = cv.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); };
  cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 }; cv.setPointerCapture(e.pointerId); av.set(0, 0); hint.style.opacity = 0; });
  cv.addEventListener('pointermove', (e) => {
    setNdc(e); hover.copy(ndc); if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
    av.set(dy * .012, dx * .012); coin.rotateOnWorldAxis(Y, av.y); coin.rotateOnWorldAxis(X, av.x);
  });
  cv.addEventListener('pointerup', (e) => { if (!drag) return; const tap = drag.moved < 8 && performance.now() - drag.t < 350; drag = null; if (tap) { setNdc(e); tapAt(); } });
  cv.addEventListener('pointercancel', () => (drag = null));
  cv.addEventListener('pointerleave', () => hover.set(0, 0));
  function jarWorld() {
    const r = cv.getBoundingClientRect(), j = jar.getBoundingClientRect();
    const v = new T.Vector3(((j.left + 18) - r.left) / r.width * 2 - 1, -((j.top + j.height / 2) - r.top) / r.height * 2 + 1, .5).unproject(cam);
    const d = v.sub(cam.position).normalize(); return cam.position.clone().add(d.multiplyScalar(-cam.position.z / d.z));
  }
  function tapAt() {
    rc.setFromCamera(ndc, cam); const hit = rc.intersectObjects([slice, disc]); if (!hit.length) return;
    if (hit[0].object === slice && !fly && regrow >= 1) {
      slice.updateMatrixWorld(); flyer.position.setFromMatrixPosition(slice.matrixWorld); flyer.quaternion.copy(coin.quaternion); flyer.scale.setScalar(1); flyer.visible = true;
      const out = new T.Vector3(.35, .35, .5).applyQuaternion(coin.quaternion);
      fly = { t: 0, from: flyer.position.clone(), out: flyer.position.clone().add(out), to: jarWorld() };
      home.visible = false; tapped = true; buzz(8);
    } else { av.x += .42; buzz(5); }
  }
  function landed() {
    pieces++; const full = pieces >= 20, k = Math.min(pieces, 20);
    fill.style.height = (k / 20 * 100) + '%'; amt.textContent = '$' + (k * .25).toFixed(2);
    msg.textContent = full ? 'jar full · time to buy' : '+$0.25 saved'; jar.classList.toggle('full', full); buzz(full ? [10, 40, 10] : 6);
    if (full) setTimeout(() => { pieces = 0; fill.style.height = '0%'; amt.textContent = '$0.00'; msg.textContent = 'your jar'; jar.classList.remove('full'); }, 3200);
    regrow = 0; home.visible = true;
  }
  function size() { const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return; R.setSize(w, h, false); cam.aspect = w / h; cam.fov = w < h * .9 ? 38 : 28; cam.updateProjectionMatrix(); }
  new ResizeObserver(size).observe(cv); size();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; const q = new T.Quaternion(), e3 = new T.Euler(); let last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop); if (!window.OBCoin.active) { last = now; return; }
    const dt = Math.min(.05, (now - last) / 1000); last = now; const t = now / 1000;
    if (!drag) {
      coin.rotateOnWorldAxis(Y, av.y); coin.rotateOnWorldAxis(X, av.x); av.multiplyScalar(Math.pow(.25, dt));
      if (av.length() < .004) { e3.set(-hover.y * .35 - .1 + (reduce ? 0 : Math.sin(t * .7) * .05), hover.x * .5 + .3 + (reduce ? 0 : Math.sin(t * .45) * .2), 0); q.setFromEuler(e3); coin.quaternion.slerp(q, 1 - Math.pow(.02, dt)); }
    }
    if (!fly && regrow >= 1) { const k = (reduce || tapped) ? 0 : Math.max(0, Math.sin(t * 2.2)) * (Math.sin(t * .55) > .6 ? 1 : 0); home.position.set(HOME.x + k * .06, HOME.y + k * .06, HOME.z + k * .08); }
    if (regrow < 1) { regrow = Math.min(1, regrow + dt * 2.2); const s = 1 + 2.7 * Math.pow(regrow - 1, 3) + 1.7 * Math.pow(regrow - 1, 2); home.scale.setScalar(Math.max(.001, s)); }
    if (fly) {
      fly.t += dt; const a = Math.min(1, fly.t / .22), b = Math.max(0, Math.min(1, (fly.t - .22) / .55));
      if (b === 0) flyer.position.lerpVectors(fly.from, fly.out, 1 - Math.pow(1 - a, 3));
      else { const e = b * b * (3 - 2 * b); flyer.position.lerpVectors(fly.out, fly.to, e); flyer.position.y += Math.sin(e * Math.PI) * .6; flyer.scale.setScalar(1 - e * .85); }
      flyer.rotation.z += dt * 6; if (b >= 1) { flyer.visible = false; fly = null; landed(); }
    }
    R.render(scene, cam);
  }
  requestAnimationFrame(loop);
})();
