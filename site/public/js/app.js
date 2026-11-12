// Waitlist form and the Launch-app gate.
(function () {
  const $ = (id) => document.getElementById(id);
  async function post(url, data) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Something went wrong. Try again.');
    return j;
  }

  // waitlist
  const form = $('joinform'), err = $('joinerr'), btn = $('joinbtn'), why = $('why'), count = $('whycount');
  why.addEventListener('input', () => { count.textContent = `${why.value.length} / 500`; });
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); err.textContent = '';
    const email = $('email').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { err.textContent = 'Enter an email like you@example.com.'; $('email').focus(); return; }
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const r = await post('/api/join', { email, why: why.value, newsletter: $('news').checked, company: $('company').value });
      form.innerHTML = `<div class="done"><span class="eyebrow">You’re on the list</span><span class="big">#${r.position || '—'}</span><p class="muted">${r.status === 'approved' ? 'You’re already approved. Tap Launch app and enter' : 'When you’re approved, tap Launch app and enter'} <b style="color:var(--ink)"></b>.</p></div>`;
      form.querySelector('b').textContent = email;
    } catch (x) {
      err.textContent = x.message; btn.disabled = false; btn.textContent = 'Join the waitlist';
    }
  });

  // gate
  const dlg = $('gate'), gform = $('gateform'), gmsg = $('gatemsg'), ginput = $('gateemail'), ggo = $('gatego');
  document.querySelectorAll('[data-gate]').forEach((b) => b.addEventListener('click', () => {
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
