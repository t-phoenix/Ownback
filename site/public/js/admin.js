// Waitlist desk: sign in, search, approve or revoke, let someone in directly, remove, export.
(function () {
  const $ = (id) => document.getElementById(id);
  let rows = [];
  const api = async (method, data) => {
    const r = await fetch(method === 'GET' ? `/api/admin?action=${data}` : '/api/admin', method === 'GET' ? {} : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || 'Request failed.'); e.status = r.status; throw e; }
    return j;
  };
  const toast = (m) => { const t = $('toast'); t.textContent = m; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 1800); };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const day = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  async function boot() {
    const me = await api('GET', 'me');
    $('login').hidden = me.authed; $('desk').hidden = !me.authed;
    if (me.authed) load(); else $('pw').focus();
  }
  async function load() {
    try { rows = (await api('GET', 'list')).rows; render(); }
    catch (e) { if (e.status === 401) boot(); else toast(e.message); }
  }
  function render() {
    $('sTotal').textContent = rows.length;
    $('sWait').textContent = rows.filter((r) => r.status === 'waiting').length;
    $('sOk').textContent = rows.filter((r) => r.status === 'approved').length;
    $('sNews').textContent = rows.filter((r) => r.newsletter).length;
    const q = $('q').value.trim().toLowerCase(), fs = $('fs').value, fn = $('fn').value;
    const view = rows.filter((r) => (!fs || r.status === fs) && (!fn || String(+r.newsletter) === fn) && (!q || r.email.includes(q) || (r.why || '').toLowerCase().includes(q)));
    $('empty').hidden = view.length > 0;
    $('rows').innerHTML = view.map((r) => `<tr>
      <td class="n">${r.id}</td><td>${esc(r.email)}${r.source === 'admin' ? ' <span class="muted" style="font-size:12px">· added by you</span>' : ''}</td>
      <td class="why">${r.why ? esc(r.why) : '<span class="muted">—</span>'}</td><td class="n">${day(r.created_at)}</td><td>${r.newsletter ? 'Yes' : 'No'}</td>
      <td><span class="pill ${r.status}">${r.status === 'approved' ? 'Approved' : 'Waiting'}</span></td>
      <td><div class="act">${r.status === 'approved' ? `<button data-id="${r.id}" data-s="waiting">Revoke</button>` : `<button class="ok" data-id="${r.id}" data-s="approved">Approve</button>`}<button class="x" data-del="${r.id}" aria-label="Remove ${esc(r.email)}">Remove</button></div></td></tr>`).join('');
  }
  $('rows').addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    try {
      if (b.dataset.del) {
        if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Tap again to remove'; return; }
        await api('POST', { action: 'remove', id: +b.dataset.del }); toast('Removed'); return load();
      }
      await api('POST', { action: 'status', id: +b.dataset.id, status: b.dataset.s });
      toast(b.dataset.s === 'approved' ? 'Approved. They can launch the app now.' : 'Access revoked'); load();
    } catch (x) { toast(x.message); }
  });
  ['q', 'fs', 'fn'].forEach((id) => $(id).addEventListener('input', render));
  $('login').addEventListener('submit', async (e) => {
    e.preventDefault(); $('lerr').textContent = '';
    try { await api('POST', { action: 'login', password: $('pw').value }); $('pw').value = ''; boot(); }
    catch (x) { $('lerr').textContent = x.message; }
  });
  $('logout').addEventListener('click', async () => { await api('POST', { action: 'logout' }); boot(); });
  $('grant').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('POST', { action: 'grant', email: $('gemail').value }); $('gemail').value = ''; toast('Approved'); load(); }
    catch (x) { toast(x.message); }
  });
  boot().catch((x) => toast(x.message));
})();
