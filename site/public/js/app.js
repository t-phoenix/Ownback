// Launch-app links, the updates form, and (only when OB.gated is on) the approved-email gate.
(function () {
  const $ = (id) => document.getElementById(id);
  const OB = window.OB || { appUrl: 'https://app.ownback.tech', gated: false };
  async function post(url, data) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Something went wrong. Try again.');
    return j;
  }

  // every "Launch app" is a plain link to the app, so it works even before this script runs
  document.querySelectorAll('[data-launch]').forEach((a) => { a.href = OB.appUrl; });

  // updates form (stored with the waitlist, so /admin keeps one list of everyone)
  const form = $('joinform'), err = $('joinerr'), btn = $('joinbtn'), why = $('why'), count = $('whycount');
  const idle = btn.textContent;
  why.addEventListener('input', () => { count.textContent = `${why.value.length} / 500`; });
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); err.textContent = '';
    const email = $('email').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { err.textContent = 'Enter an email like you@example.com.'; $('email').focus(); return; }
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const r = await post('/api/join', { email, why: why.value, newsletter: true, company: $('company').value });
      form.innerHTML = OB.gated
        ? `<div class="done"><span class="eyebrow">You’re on the list</span><span class="big">#${r.position || '—'}</span><p class="muted">${r.status === 'approved' ? 'You’re already approved. Tap Launch app and enter' : 'When you’re approved, tap Launch app and enter'} <b style="color:var(--ink)"></b>.</p></div>`
        : `<div class="done"><span class="eyebrow">You’re in the loop</span><span class="big">Thanks.</span><p class="muted">We’ll write to <b style="color:var(--ink)"></b> when there’s something worth knowing. Spots are free for the first 1,000 people, so why wait?</p><a class="btn btn-green" href="${OB.appUrl}">Launch the app</a></div>`;
      form.querySelector('b').textContent = email;
    } catch (x) {
      err.textContent = x.message; btn.disabled = false; btn.textContent = idle;
    }
  });

  // the gate: dormant unless OB.gated is true
  const dlg = $('gate');
  if (!OB.gated || !dlg) return;
  const gform = $('gateform'), gmsg = $('gatemsg'), ginput = $('gateemail'), ggo = $('gatego');
  document.querySelectorAll('[data-launch]').forEach((b) => b.addEventListener('click', (e) => {
    e.preventDefault();
    gmsg.textContent = ''; ggo.textContent = 'Continue'; ggo.disabled = false;
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    ginput.focus();
  }));
  $('gateclose').addEventListener('click', () => dlg.close());
  gform.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = ginput.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { gmsg.textContent = 'Enter the email you joined with.'; return; }
    ggo.disabled = true; ggo.textContent = 'Checking…';
    try {
      const r = await post('/api/access', { email });
      if (r.status === 'approved') { gmsg.textContent = 'You’re in. Opening the app…'; location.href = r.url; return; }
      if (r.status === 'waiting') gmsg.textContent = `You’re on the list at #${r.position}. You’re not approved yet. Check back soon.`;
      else {
        gmsg.innerHTML = 'That email isn’t on the list yet. <a href="#join" id="gatejoin">Join the waitlist</a>.';
        $('gatejoin').addEventListener('click', () => { dlg.close(); $('email').value = email; setTimeout(() => $('email').focus(), 300); });
      }
    } catch (x) { gmsg.textContent = x.message; }
    ggo.disabled = false; ggo.textContent = 'Continue';
  });
})();
