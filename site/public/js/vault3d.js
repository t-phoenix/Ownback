// Film ending: a vault door in 3D. OBVault.render(phase, t, now)
//   phase 'out'  : the camera pulls back from the brass hub (coming out of the gold flash)
//   phase 'open' : the wheel spins, the bolts pull back, the door swings open, light floods out
//   phase 'in'   : the camera flies through the doorway into the light
(function () {
  const T = window.THREE, cv = document.getElementById('vault');
  window.OBVault = { render() {} };
  if (!T || !cv) return;
  let R;
  try { R = new T.WebGLRenderer({ canvas: cv, antialias: true }); } catch { return; }
  R.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  R.toneMapping = T.ACESFilmicToneMapping; R.toneMappingExposure = 1.1;
  const scene = new T.Scene(); scene.background = new T.Color(0x0b0f0d); scene.fog = new T.Fog(0x0b0f0d, 9, 26);
  const cam = new T.PerspectiveCamera(34, 1, .05, 80);
  const pm = new T.PMREMGenerator(R), es = new T.Scene(); es.background = new T.Color(0x0a0908);
  [[0xffffff, 3, 0, 6, 4, 8, 2], [0xffe2b8, 2.6, -6, 2, 3, 2, 6], [0xffd28a, 4, 4, 0, -4, 3, 6], [0xffffff, 6, 2.5, 3, 6, .7, .7]]
    .forEach(([c, k, x, y, z, w, h]) => { const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(c).multiplyScalar(k), side: T.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); es.add(m); });
  scene.environment = pm.fromScene(es, .03).texture;
  scene.add(new T.HemisphereLight(0xcfe8dc, 0x0b0f0d, .35));
  const key = new T.SpotLight(0xfff0d8, 2.2, 30, .55, .6); key.position.set(-4, 6, 9); scene.add(key); scene.add(key.target);

  const steel = new T.MeshStandardMaterial({ color: 0x2c5a47, metalness: .85, roughness: .34 });
  const steelDark = new T.MeshStandardMaterial({ color: 0x1d3d31, metalness: .8, roughness: .45 });
  const brass = new T.MeshStandardMaterial({ color: 0xd6a94a, metalness: 1, roughness: .26 });
  const pieceMat = new T.MeshStandardMaterial({ color: 0xffc35a, metalness: 1, roughness: .18, emissive: 0x3a2400, emissiveIntensity: .4 });
  const wallMat = new T.MeshStandardMaterial({ color: 0x18201c, metalness: .2, roughness: .85 });
  const goldGlow = new T.MeshBasicMaterial({ color: 0xffd98a, toneMapped: false });

  // wall with a round opening, and a brass frame
  const RAD = 1.62;
  const ws = new T.Shape(); ws.moveTo(-14, -6); ws.lineTo(14, -6); ws.lineTo(14, 9); ws.lineTo(-14, 9); ws.lineTo(-14, -6);
  const hole = new T.Path(); hole.absarc(0, 0, RAD + .02, 0, Math.PI * 2, true); ws.holes.push(hole);
  const wall = new T.Mesh(new T.ExtrudeGeometry(ws, { depth: .6, bevelEnabled: false, curveSegments: 96 }), wallMat); wall.position.z = -.6; scene.add(wall);
  const frame = new T.Mesh(new T.TorusGeometry(RAD + .1, .14, 24, 120), brass); scene.add(frame);
  const frame2 = new T.Mesh(new T.TorusGeometry(RAD + .34, .05, 12, 120), steelDark); frame2.position.z = -.02; scene.add(frame2);
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, b = new T.Mesh(new T.SphereGeometry(.045, 12, 8), brass); b.position.set(Math.cos(a) * (RAD + .34), Math.sin(a) * (RAD + .34), .04); scene.add(b); }

  // inside: a warm room of gold pieces
  const inside = new T.Group(); inside.position.z = -2.2; scene.add(inside);
  const back = new T.Mesh(new T.CircleGeometry(4, 64), goldGlow); back.position.z = -3; inside.add(back);
  const sh = new T.Shape(); sh.moveTo(0, 0); sh.lineTo(1, 0); sh.absarc(0, 0, 1, 0, Math.PI / 2, false); sh.lineTo(0, 0);
  const sg = new T.ExtrudeGeometry(sh, { depth: .05, bevelEnabled: true, bevelThickness: .012, bevelSize: .012, bevelSegments: 2, curveSegments: 20 }); sg.translate(-.42, -.42, 0); sg.scale(.16, .16, 1);
  const NP = 90, pieces = new T.InstancedMesh(sg, pieceMat, NP), d3 = new T.Object3D();
  const ps = Array.from({ length: NP }, () => ({ x: (Math.random() - .5) * 5, y: (Math.random() - .5) * 3.4, z: -Math.random() * 2.6, r: Math.random() * 6, s: .6 + Math.random() * .9, v: .2 + Math.random() * .5 }));
  inside.add(pieces);
  const glow = new T.PointLight(0xffc870, 0, 14, 1.6); glow.position.set(0, 0, .6); scene.add(glow);
  const beams = [0, 1, 2, 3].map((i) => { const b = new T.Mesh(new T.ConeGeometry(1.2 + i * .45, 7, 48, 1, true), new T.MeshBasicMaterial({ color: 0xffd28a, transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false })); b.rotation.x = -Math.PI / 2; b.position.set(.4, 0, 3.3); scene.add(b); return b; });

  // the door: hinged on the left edge
  const pivot = new T.Group(); pivot.position.set(-RAD, 0, .1); scene.add(pivot);
  const door = new T.Group(); door.position.x = RAD; pivot.add(door);
  const slab = new T.Mesh(new T.CylinderGeometry(RAD, RAD, .5, 96), steel); slab.rotation.x = Math.PI / 2; door.add(slab);
  const lip = new T.Mesh(new T.CylinderGeometry(RAD - .18, RAD - .18, .08, 96), steelDark); lip.rotation.x = Math.PI / 2; lip.position.z = .27; door.add(lip);
  [RAD - .1, RAD - .42, .95].forEach((r, i) => { const t = new T.Mesh(new T.TorusGeometry(r, i ? .02 : .035, 10, 120), brass); t.position.z = .31; door.add(t); });
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, b = new T.Mesh(new T.CylinderGeometry(.05, .05, .06, 16), brass); b.rotation.x = Math.PI / 2; b.position.set(Math.cos(a) * (RAD - .26), Math.sin(a) * (RAD - .26), .32); door.add(b); }
  // locking bolts: they sit in the frame, then slide back into the door
  const bolts = []; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + Math.PI / 8, b = new T.Mesh(new T.CylinderGeometry(.09, .09, .55, 20), brass); b.rotation.z = a - Math.PI / 2; b.userData = { a }; door.add(b); bolts.push(b); }
  // hinges
  [-.9, .9].forEach((y) => { const h = new T.Mesh(new T.CylinderGeometry(.13, .13, .6, 24), steelDark); h.position.set(-RAD - .05, y, .1); scene.add(h); });
  // the wheel, with the Ownback mark on its hub
  const wheel = new T.Group(); wheel.position.z = .42; door.add(wheel);
  wheel.add(new T.Mesh(new T.TorusGeometry(.62, .05, 16, 80), brass));
  for (let i = 0; i < 3; i++) { const sp = new T.Mesh(new T.CylinderGeometry(.035, .035, 1.24, 12), brass); sp.rotation.z = i * Math.PI / 3; wheel.add(sp); }
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, k = new T.Mesh(new T.SphereGeometry(.06, 16, 10), brass); k.position.set(Math.cos(a) * .66, Math.sin(a) * .66, 0); wheel.add(k); }
  const hub = new T.Mesh(new T.CylinderGeometry(.2, .22, .14, 48), brass); hub.rotation.x = Math.PI / 2; wheel.add(hub);
  const md = new T.Shape(); md.moveTo(0, 0); md.lineTo(0, .13); md.absarc(0, 0, .13, Math.PI / 2, Math.PI * 2, false); md.lineTo(0, 0);
  const markD = new T.Mesh(new T.ExtrudeGeometry(md, { depth: .02, bevelEnabled: false, curveSegments: 32 }), new T.MeshStandardMaterial({ color: 0x0f7b4f, metalness: .4, roughness: .35 })); markD.position.z = .075; wheel.add(markD);
  const ms = new T.Shape(); ms.moveTo(0, 0); ms.lineTo(.13, 0); ms.absarc(0, 0, .13, 0, Math.PI / 2, false); ms.lineTo(0, 0);
  const markS = new T.Mesh(new T.ExtrudeGeometry(ms, { depth: .03, bevelEnabled: false, curveSegments: 24 }), new T.MeshStandardMaterial({ color: 0xffd06a, metalness: 1, roughness: .2 })); markS.position.set(.025, .025, .075); wheel.add(markS);

  // dust in the light
  const NM = 220, motes = new T.BufferGeometry(), mp = new Float32Array(NM * 3);
  for (let i = 0; i < NM; i++) { mp[i * 3] = (Math.random() - .5) * 6; mp[i * 3 + 1] = (Math.random() - .5) * 4; mp[i * 3 + 2] = Math.random() * 6 - 1; }
  motes.setAttribute('position', new T.BufferAttribute(mp, 3));
  const dust = new T.Points(motes, new T.PointsMaterial({ color: 0xffe2a8, size: .025, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
  scene.add(dust);

  const cl = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v)), seg = (p, a, b) => cl((p - a) / (b - a));
  const ease = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2), lerp = (a, b, k) => a + (b - a) * k;
  let W = 0, H = 0;
  window.OBVault.render = function (phase, t, now) {
    const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
    if (w !== W || h !== H) { W = w; H = h; R.setSize(w, h, false); cam.aspect = w / h; cam.fov = w < h ? 58 : 34; cam.updateProjectionMatrix(); }
    const s = now / 1000, far = W < H ? 8.6 : 6.4;
    let spin = 0, boltK = 0, open = 0, light = 0, camZ = far, camX = .5, camY = .15, look = { x: 0, y: 0, z: 0 }, shake = 0;
    if (phase === 'out') { const e = ease(t); camZ = lerp(.75, far, e); camX = lerp(0, .5, e); camY = lerp(0, .15, e); look = { x: 0, y: 0, z: .4 * (1 - e) }; }
    else if (phase === 'open') {
      spin = ease(seg(t, 0, .28)) * Math.PI * 2.5;
      boltK = ease(seg(t, .24, .42)); shake = Math.sin(seg(t, .38, .44) * Math.PI) * .03;
      open = ease(seg(t, .42, .9)); light = seg(t, .42, .8);
      camZ = far - open * .8; camX = .5 + open * 1.6; camY = .15 + open * .3;
    } else { spin = Math.PI * 2.5; boltK = 1; open = 1; light = 1; const e = ease(t); camZ = lerp(far - .8, -3.5, e); camX = lerp(2.1, .1, e); camY = lerp(.15, 0, e); look = { x: 0, y: 0, z: -4 }; }
    wheel.rotation.z = -spin;
    bolts.forEach((b, i) => { const r = lerp(RAD + .12, RAD - .32, cl(boltK * 1.3 - i * .04)); b.position.set(Math.cos(b.userData.a) * r, Math.sin(b.userData.a) * r, 0); });
    pivot.rotation.y = -open * 1.85;
    glow.intensity = light * 4; beams.forEach((b, i) => { b.material.opacity = light * (.05 - i * .01) * (1 + .15 * Math.sin(s * .7 + i)); });
    back.material.color.setHSL(.1, .85, .32 + .2 * light);
    dust.material.opacity = .25 + light * .55; dust.rotation.y = s * .02;
    pieces.visible = open > .05;
    ps.forEach((q, i) => { d3.position.set(q.x, q.y + Math.sin(s * q.v + i) * .12, q.z); d3.rotation.set(q.r + s * .3 * q.v, q.r * 1.7 + s * .2, 0); d3.scale.setScalar(q.s); d3.updateMatrix(); pieces.setMatrixAt(i, d3.matrix); });
    pieces.instanceMatrix.needsUpdate = true;
    cam.position.set(camX + Math.sin(s * .3) * .04 + shake * Math.sin(s * 60), camY + shake * Math.cos(s * 55), camZ);
    cam.lookAt(look.x, look.y, look.z);
    R.render(scene, cam);
  };
})();
