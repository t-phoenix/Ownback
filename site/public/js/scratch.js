// Scratch cards: real-looking receipts with a gold foil you scratch off to see the piece you'd own.
(function () {
  const wrap = document.getElementById('cards'), tally = document.getElementById('tally');
  if (!wrap) return;
  const RATE = 83.66; // ₹ per $, example
  const POOL = [
    { item: 'iPhone 16 · 128 GB', inr: 79900, tk: 'AAPL', co: 'Apple', px: 231.4, also: 'and pieces of TSMC and Corning' },
    { item: 'Nike running shoes', inr: 7495, tk: 'NKE', co: 'Nike', px: 75, also: '' },
    { item: 'Starbucks cold coffee × 14', inr: 4410, tk: 'SBUX', co: 'Starbucks', px: 95, also: '' },
    { item: 'Echo Dot, ordered on Amazon', inr: 5499, tk: 'AMZN', co: 'Amazon', px: 205, also: '' },
    { item: 'Uber rides, last month', inr: 2340, tk: 'UBER', co: 'Uber', px: 75, also: '' },
  ];
  const usd = (inr) => inr * .05 / RATE;
  const fmt = (n) => (n >= 1 ? n.toFixed(2) : n.toFixed(4));
  const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch { /* unsupported */ } };
  let deck = [], done = 0, saved = 0;

  function foil(cv) {
    const r = cv.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
    cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d);
    const x = cv.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0); const w = r.width, h = r.height;
    const gr = x.createLinearGradient(0, 0, w, h);
    [[0, '#8a6417'], [.18, '#e9b949'], [.32, '#fff1c8'], [.46, '#d9a640'], [.62, '#f6d98a'], [.8, '#b98a2a'], [1, '#e9b949']].forEach(([o, c]) => gr.addColorStop(o, c));
    x.fillStyle = gr; x.fillRect(0, 0, w, h);
    // brushed-metal grain and a faint slice pattern, like printed foil
    for (let i = 0; i < w * h / 30; i++) { x.fillStyle = `rgba(${Math.random() < .5 ? '255,255,255' : '80,50,0'},${Math.random() * .08})`; x.fillRect(Math.random() * w, Math.random() * h, Math.random() * 14, 1); }
    x.globalAlpha = .13; x.fillStyle = '#5c3f05';
    for (let yy = 12; yy < h; yy += 34) for (let xx = (yy / 34) % 2 ? 6 : 23; xx < w; xx += 34) { x.beginPath(); x.moveTo(xx, yy + 10); x.lineTo(xx, yy); x.arc(xx, yy + 10, 10, -Math.PI / 2, 0); x.closePath(); x.fill(); }
    x.globalAlpha = 1; x.fillStyle = 'rgba(60,40,0,.75)'; x.textAlign = 'center';
    x.font = '800 17px "Bricolage Grotesque", sans-serif'; x.fillText('Scratch to see', w / 2, h / 2 - 4);
    x.font = '800 17px "Bricolage Grotesque", sans-serif'; x.fillText('what you’d own', w / 2, h / 2 + 18);
    x.globalCompositeOperation = 'destination-out';
    return { x, w, h };
  }

  function burst(px, py) {
    for (let i = 0; i < 18; i++) {
      const b = document.createElement('span'); b.className = 'burst'; b.style.left = px + 'px'; b.style.top = py + 'px'; document.body.appendChild(b);
      const a = Math.random() * Math.PI * 2, d = 50 + Math.random() * 90;
      b.animate([{ transform: 'translate(0,0) rotate(0) scale(1)', opacity: 1 }, { transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d - 40}px) rotate(${Math.random() * 540}deg) scale(.6)`, opacity: 0 }], { duration: 700 + Math.random() * 400, easing: 'cubic-bezier(.2,.8,.3,1)' }).onfinish = () => b.remove();
    }
  }

  function card(o, idx) {
    const share = usd(o.inr), maker = share * .7, qty = maker / o.px;
    const el = document.createElement('article'); el.className = 'card';
    el.innerHTML = `<div class="top"><i>ORDER · ${['12', '18', '24'][idx]} NOV</i><b>${o.item}</b><span>₹${o.inr.toLocaleString('en-IN')}</span></div>
      <div class="prize"><span class="you">You’d own</span><span class="qty">${fmt(qty)}</span><span class="tk">${o.tk} · ${o.co}</span><span class="also">${o.also}</span>
      <span class="math">5% = $${share.toFixed(2)} · 70% to the maker</span></div><canvas aria-label="Scratch area for ${o.item}"></canvas><span class="sheen"></span>`;
    const prize = el.querySelector('.prize'), cv = el.querySelector('canvas');
    const cols = 16, rows = 12, hit = new Set(); let f = null, down = false, lastP = null, cleared = false, ticks = 0;
    const size = () => { cv.style.height = prize.offsetHeight + 'px'; f = foil(cv); };
    requestAnimationFrame(size);
    const at = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    function scratch(p) {
      if (!f || cleared) return;
      const rad = Math.max(16, f.w * .075);
      f.x.lineCap = 'round'; f.x.lineWidth = rad * 2; f.x.beginPath(); f.x.moveTo((lastP || p).x, (lastP || p).y); f.x.lineTo(p.x, p.y); f.x.stroke();
      f.x.beginPath(); f.x.arc(p.x, p.y, rad, 0, 7); f.x.fill();
      lastP = p;
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) { const cx = (i + .5) * f.w / cols, cy = (j + .5) * f.h / rows; if ((cx - p.x) ** 2 + (cy - p.y) ** 2 < rad * rad) hit.add(i * rows + j); }
      if (++ticks % 6 === 0) buzz(3);
      if (hit.size / (cols * rows) > .55) reveal();
    }
    function reveal() {
      cleared = true; cv.classList.add('gone'); const r = cv.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2); buzz([10, 30, 14]);
      done++; saved += share;
      if (done === deck.length) {
        tally.innerHTML = `<span>${deck.length} orders put aside <b>$${saved.toFixed(2)}</b> in your jars.</span><a class="btn btn-gold pulse" href="#join" id="tallycta">Get this on your real receipts</a>`;
        document.getElementById('tallycta').addEventListener('click', (e) => { e.preventDefault(); document.getElementById('email').focus(); });
      } else tally.innerHTML = `<span><b>$${saved.toFixed(2)}</b> put aside so far.</span><span class="muted">${deck.length - done} to go</span>`;
    }
    cv.addEventListener('pointerdown', (e) => { down = true; lastP = null; cv.setPointerCapture(e.pointerId); scratch(at(e)); });
    cv.addEventListener('pointermove', (e) => { if (down) scratch(at(e)); });
    const up = () => { down = false; lastP = null; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.tabIndex = 0;
    cv.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!cleared) reveal(); } });
    el.addEventListener('pointermove', (e) => { const r = el.getBoundingClientRect(), mx = (e.clientX - r.left) / r.width, my = (e.clientY - r.top) / r.height; el.style.setProperty('--mx', mx * 100 + '%'); el.style.setProperty('--my', my * 100 + '%'); if (!down) { el.style.setProperty('--ry', (mx - .5) * 10 + 'deg'); el.style.setProperty('--rx', (.5 - my) * 8 + 'deg'); } });
    el.addEventListener('pointerleave', () => { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); });
    el._resize = () => { if (!cleared) { size(); hit.clear(); } };
    return el;
  }

  function deal() {
    const pool = [...POOL].sort(() => Math.random() - .5);
    deck = pool.slice(0, 3); done = 0; saved = 0; wrap.innerHTML = '';
    deck.forEach((o, i) => wrap.appendChild(card(o, i)));
    tally.innerHTML = '<span class="muted">Scratch all three. Every card pays.</span>';
  }
  document.getElementById('deal').addEventListener('click', deal);
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => wrap.querySelectorAll('.card').forEach((c) => c._resize && c._resize()), 200); });
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(deal);
})();
