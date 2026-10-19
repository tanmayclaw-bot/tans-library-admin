(function () {
'use strict';
var SB = 'https://smwfftltpfvhjvlvquoc.supabase.co';
var KEY = 'sb_publishable__m0kyE7BvpSvDhTRW7S_wQ_mAPKlyZa';
var OWNER = 'mahokartanmay@gmail.com';
var BASE = location.origin + location.pathname;
var app = document.getElementById('app');
var S = { tab: 'books', books: [], recs: [], hits: [], editing: null, q: '' };

/* ---------- helpers ---------- */
function el(tag, props, kids) {
  var e = document.createElement(tag);
  if (props) for (var k in props) {
    if (props[k] == null) continue;
    if (k === 'class') e.className = props[k];
    else if (k === 'text') e.textContent = props[k];
    else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), props[k]);
    else if (k === 'value') e.value = props[k];
    else if (k === 'checked') e.checked = !!props[k];
    else if (k === 'style') e.style.cssText = props[k];
    else e.setAttribute(k, props[k]);
  }
  (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return e;
}
function toast(m) { var t = el('div', { class: 'toast', text: m }); document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2600); }
function safeUrl(u) { return /^https:\/\//i.test(u || '') ? u : ''; }
function cssUrl(u) { u = safeUrl(u); return u ? "url('" + u.replace(/['"\\()\s]/g, encodeURIComponent) + "')" : ''; }
function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rnd(seed, n) { var x = Math.sin(seed * 9301 + n * 49297) * 233280; return x - Math.floor(x); }

/* ---------- session ---------- */
function loadSess() { try { return JSON.parse(localStorage.getItem('lib_sess') || 'null'); } catch (e) { return null; } }
function saveSess(s) { if (s) localStorage.setItem('lib_sess', JSON.stringify(s)); else localStorage.removeItem('lib_sess'); }
function readHash() {
  if (!location.hash || location.hash.length < 2) return null;
  var p = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, '', BASE);
  if (p.get('error_description')) return { error: p.get('error_description').replace(/\+/g, ' ') };
  if (p.get('access_token')) return { access: p.get('access_token'), refresh: p.get('refresh_token'), exp: Date.now() + (+p.get('expires_in') || 3600) * 1000 };
  return null;
}
async function refresh() {
  var s = loadSess(); if (!s || !s.refresh) return false;
  var r = await fetch(SB + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: s.refresh }) });
  if (!r.ok) { saveSess(null); return false; }
  var d = await r.json();
  saveSess({ access: d.access_token, refresh: d.refresh_token, exp: Date.now() + d.expires_in * 1000 });
  return true;
}
async function api(path, opt, retried) {
  var s = loadSess(); if (!s) throw new Error('signed out');
  if (s.exp - Date.now() < 60000 && !retried) { await refresh(); s = loadSess(); if (!s) throw new Error('signed out'); }
  opt = opt || {};
  var h = Object.assign({ apikey: KEY, Authorization: 'Bearer ' + s.access }, opt.headers || {});
  var r = await fetch(SB + path, Object.assign({}, opt, { headers: h }));
  if (r.status === 401 && !retried && await refresh()) return api(path, opt, true);
  if (!r.ok) { var t = await r.text(); throw new Error(r.status + ' ' + t.slice(0, 160)); }
  if (r.status === 204) return null;
  var ct = r.headers.get('content-type') || '';
  return ct.indexOf('json') >= 0 ? r.json() : null;
}
var J = { 'Content-Type': 'application/json', Prefer: 'return=representation' };

/* ---------- login ---------- */
function loginView(msg) {
  app.replaceChildren(el('div', { class: 'center' }, [
    el('h1', { text: 'Library admin' }),
    el('p', { class: 'muted', text: 'Owner sign-in. A one-time link is emailed to you.' }),
    el('div', { class: 'card' }, [
      el('label', { text: 'Email' }),
      el('input', { id: 'em', type: 'email', value: OWNER, autocomplete: 'email', readonly: 'readonly' }),
      el('div', { class: 'acts' }, [el('button', { class: 'pri', id: 'send', text: 'Email me a sign-in link', onclick: sendLink })]),
      el('p', { class: 'muted', id: 'lmsg', text: msg || '' })
    ])
  ]));
}
async function sendLink() {
  var b = document.getElementById('send'), m = document.getElementById('lmsg');
  b.disabled = true; m.textContent = 'Sending...';
  try {
    var r = await fetch(SB + '/auth/v1/otp?redirect_to=' + encodeURIComponent(BASE), { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: OWNER, create_user: false }) });
    m.textContent = r.ok ? 'Check your inbox and open the link on this device.' : 'Could not send (try again in a minute).';
  } catch (e) { m.textContent = 'Network error.'; }
  setTimeout(function () { b.disabled = false; }, 30000);
}

/* ---------- data ---------- */
async function loadAll() {
  var res = await Promise.all([
    api('/rest/v1/books?select=*&order=sort_order.asc&limit=1000'),
    api('/rest/v1/recommendations?select=*&order=created_at.desc&limit=300'),
    api('/rest/v1/hits?select=kind,created_at,ip_hash&created_at=gte.' + encodeURIComponent(new Date(Date.now() - 35 * 864e5).toISOString()) + '&limit=10000')
  ]);
  S.books = res[0]; S.recs = res[1]; S.hits = res[2];
}

/* ---------- shell ---------- */
function shell(body) {
  var pend = S.recs.filter(function (r) { return r.status === 'pending'; }).length;
  var tabs = [['books', 'Books'], ['recs', 'Suggestions' + (pend ? ' (' + pend + ')' : '')], ['act', 'Activity'], ['set', 'Settings']];
  app.replaceChildren(
    el('h1', { text: 'Library admin' }),
    el('div', { class: 'bar' }, tabs.map(function (t) { return el('button', { class: 'tab' + (S.tab === t[0] ? ' on' : ''), text: t[1], onclick: function () { S.tab = t[0]; S.editing = null; render(); } }); })),
    body
  );
}
function render() {
  if (S.tab === 'books') return S.editing ? shell(editView()) : shell(booksView());
  if (S.tab === 'recs') return shell(recsView());
  if (S.tab === 'act') return shell(actView());
  return shell(setView());
}

/* ---------- books ---------- */
function booksView() {
  var q = S.q.toLowerCase();
  var list = S.books.filter(function (b) { var d = b.data || {}; return !q || ((d.title || '') + ' ' + (d.author || '')).toLowerCase().indexOf(q) >= 0; });
  var box = el('div');
  box.appendChild(el('div', { class: 'row' }, [
    el('input', { class: 'grow', placeholder: 'Search books', value: S.q, oninput: function (e) { S.q = e.target.value; var p = e.target.selectionStart; render(); var i = document.querySelector('input[placeholder="Search books"]'); i.focus(); i.setSelectionRange(p, p); } }),
    el('button', { class: 'pri', text: '+ Add', onclick: function () { S.editing = { isNew: true, row: { id: 'b-' + crypto.randomUUID().slice(0, 8), data: { genres: [], rating: 0, finished: '' }, hidden: false, featured: false } }; render(); } })
  ]));
  box.appendChild(el('p', { class: 'muted', text: S.books.length + ' books, ' + S.books.filter(function (b) { return b.hidden; }).length + ' hidden' }));
  list.forEach(function (b, i) {
    var d = b.data || {};
    box.appendChild(el('div', { class: 'card' }, [
      el('div', { class: 'row' }, [
        el('div', { class: 'cov', style: 'background-image:' + cssUrl(d.cover) }),
        el('div', { class: 'grow' }, [
          el('div', { class: 't', text: d.title || '(untitled)' }),
          el('div', { class: 's', text: (d.author || '') + (d.year ? ' · ' + d.year : '') + (d.pages ? ' · ' + d.pages + 'p' : '') + (+d.rating ? ' · ' + '\u2605'.repeat(Math.floor(+d.rating)) + ((+d.rating % 1) >= 0.5 ? '\u00bd' : '') : '') + (d.finished ? ' · read ' + d.finished : '') }),
          el('div', {}, [(d.genres || []).map(function (g) { return el('span', { class: 'tag', text: g }); }), b.hidden ? el('span', { class: 'tag bad', text: 'hidden' }) : null, b.featured ? el('span', { class: 'tag ok', text: 'featured' }) : null].flat())
        ])
      ]),
      el('div', { class: 'acts' }, [
        el('button', { class: 'sm', text: 'Edit', onclick: function () { S.editing = { isNew: false, row: JSON.parse(JSON.stringify(b)) }; render(); } }),
        el('button', { class: 'sm', text: b.hidden ? 'Show' : 'Hide', onclick: function () { patchBook(b, { hidden: !b.hidden }); } }),
        el('button', { class: 'sm', text: b.featured ? 'Unfeature' : 'Feature', onclick: function () { patchBook(b, { featured: !b.featured }); } }),
        el('button', { class: 'sm', text: 'Up', disabled: S.q ? 'disabled' : null, onclick: function () { move(b, -1); } }),
        el('button', { class: 'sm', text: 'Down', disabled: S.q ? 'disabled' : null, onclick: function () { move(b, 1); } }),
        el('button', { class: 'sm bad', text: 'Delete', onclick: function () { if (confirm('Delete "' + (d.title || 'this book') + '" permanently?')) delBook(b); } })
      ])
    ]));
  });
  return box;
}
async function patchBook(b, fields) {
  try { fields.updated_at = new Date().toISOString(); await api('/rest/v1/books?id=eq.' + encodeURIComponent(b.id), { method: 'PATCH', headers: J, body: JSON.stringify(fields) }); Object.assign(b, fields); render(); }
  catch (e) { toast('Failed: ' + e.message); }
}
async function delBook(b) {
  try { await api('/rest/v1/books?id=eq.' + encodeURIComponent(b.id), { method: 'DELETE' }); S.books = S.books.filter(function (x) { return x.id !== b.id; }); render(); toast('Deleted'); }
  catch (e) { toast('Failed: ' + e.message); }
}
async function move(b, dir) {
  var i = S.books.findIndex(function (x) { return x.id === b.id; }), j = i + dir;
  if (j < 0 || j >= S.books.length) return;
  var arr = S.books.slice(); var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  try {
    for (var k = 0; k < arr.length; k++) if (arr[k].sort_order !== k) {
      await api('/rest/v1/books?id=eq.' + encodeURIComponent(arr[k].id), { method: 'PATCH', headers: J, body: JSON.stringify({ sort_order: k }) }); arr[k].sort_order = k;
    }
    S.books = arr; render();
  } catch (e) { toast('Failed: ' + e.message); }
}

function visuals(d, force) {
  var seed = hash((d.id || '') + (d.title || '') + (d.author || ''));
  var pages = +d.pages > 20 ? +d.pages : 240 + Math.floor(rnd(seed, 1) * 260);
  var binding = pages > 420 ? 'hardcover' : pages < 260 ? 'mass' : 'paperback';
  var height = binding === 'hardcover' ? 236 + Math.round(rnd(seed, 2) * 18) : binding === 'mass' ? 196 + Math.round(rnd(seed, 2) * 14) : 214 + Math.round(rnd(seed, 2) * 16);
  var width = Math.round(Math.max(16, Math.min(58, pages * 0.055 + (rnd(seed, 3) - .5) * 6)));
  var out = { binding: binding, height: height, width: width };
  if (force || !d.spine) {
    var hue = Math.floor(rnd(seed, 4) * 360), sat = 28 + Math.floor(rnd(seed, 5) * 30), lig = 30 + Math.floor(rnd(seed, 6) * 28);
    var faces = ['serif', 'sans', 'mono'];
    Object.assign(out, {
      finish: binding === 'hardcover' ? 'cloth' : (rnd(seed, 7) > .5 ? 'gloss' : 'matte'),
      spine: 'hsl(' + hue + ' ' + sat + '% ' + lig + '%)', band: 'hsl(' + ((hue + 30) % 360) + ' ' + (sat + 25) + '% ' + Math.min(75, lig + 22) + '%)',
      ink: lig > 52 ? '#1a1a1a' : '#faf7f0', face: faces[Math.floor(rnd(seed, 8) * 3)], caps: rnd(seed, 9) > .6,
      lean: +((rnd(seed, 10) - .5) * 4).toFixed(1), depth: +(rnd(seed, 11) * 3).toFixed(1), wear: +(rnd(seed, 12) * .5).toFixed(2)
    });
  }
  return out;
}

function editView() {
  var row = S.editing.row, d = row.data, box = el('div', { class: 'card' });
  var f = {};
  function field(label, key, type, extra) {
    var inp = type === 'textarea' ? el('textarea', { maxlength: extra || 600 }) : el('input', { type: type || 'text', maxlength: extra || 200 });
    inp.value = key === 'genres' ? (d.genres || []).filter(function (g) { return g !== 'To read'; }).join(', ') : (d[key] == null ? '' : d[key]);
    f[key] = inp; box.appendChild(el('label', { text: label })); box.appendChild(inp); return inp;
  }
  box.appendChild(el('h2', { text: S.editing.isNew ? 'Add book' : 'Edit book' }));
  field('Title', 'title'); field('Author', 'author');
  field('Genres (comma separated)', 'genres');
  var tr = el('input', { type: 'checkbox', style: 'width:auto', checked: (d.genres || []).indexOf('To read') >= 0 });
  box.appendChild(el('label', {}, [tr, ' Still to read']));
  var g2 = el('div', { class: 'grid2' }); box.appendChild(g2);
  var pg = el('input', { type: 'number', min: 1, max: 5000, value: d.pages || '' }), yr = el('input', { type: 'number', min: 1, max: 2100, value: d.year || '' });
  g2.appendChild(el('div', {}, [el('label', { text: 'Pages' }), pg])); g2.appendChild(el('div', {}, [el('label', { text: 'Year' }), yr]));
  field('Publisher', 'publisher', 'text', 80); field('Blurb', 'blurb', 'textarea', 400);
  var g3 = el('div', { class: 'grid2' }); box.appendChild(g3);
  var rd = el('input', { type: 'date', max: '2100-12-31', value: /^\d{4}-\d{2}-\d{2}$/.test(d.finished || '') ? d.finished : '' });
  var rt = el('select', {}, [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map(function (n) { return el('option', { value: String(n), text: n ? n + ' / 5' : 'Unrated' }); }));
  rt.value = String(Math.max(0, Math.min(5, Math.round((+d.rating || 0) * 2) / 2)));
  g3.appendChild(el('div', {}, [el('label', { text: 'Date read (optional)' }), rd]));
  g3.appendChild(el('div', {}, [el('label', { text: 'Rating' }), rt]));
  var cov = field('Cover image URL (https)', 'cover', 'url', 400);
  var prev = el('div', { class: 'cov', style: 'width:70px;height:100px;margin-top:8px;background-image:' + cssUrl(d.cover) }); box.appendChild(prev);
  cov.addEventListener('input', function () { prev.style.backgroundImage = cssUrl(cov.value); });
  var file = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', style: 'margin-top:8px' });
  file.addEventListener('change', async function () {
    if (!file.files[0]) return; toast('Uploading...');
    try { var url = await uploadCover(file.files[0], row.id); cov.value = url; prev.style.backgroundImage = cssUrl(url); toast('Cover uploaded'); } catch (e) { toast('Upload failed: ' + e.message); }
  });
  box.appendChild(el('label', { text: 'Or upload a cover' })); box.appendChild(file);
  var ol = el('div', {});
  box.appendChild(el('div', { class: 'acts' }, [el('button', { class: 'sm', text: 'Find on Open Library', onclick: function () { findOL(f.title.value + ' ' + f.author.value, ol, function (c) {
    f.title.value = c.title || f.title.value; f.author.value = (c.author_name || [])[0] || f.author.value; yr.value = c.first_publish_year || yr.value; pg.value = c.number_of_pages_median || pg.value;
    f.publisher.value = (c.publisher || [])[0] ? String(c.publisher[0]).slice(0, 80) : f.publisher.value;
    if (c.cover_i) { var u = 'https://covers.openlibrary.org/b/id/' + c.cover_i + '-L.jpg'; rehost(u, row.id).then(function (x) { cov.value = x; prev.style.backgroundImage = cssUrl(x); }); }
  }); } })]));
  box.appendChild(ol);
  box.appendChild(el('div', { class: 'acts', style: 'margin-top:16px' }, [
    el('button', { class: 'pri', text: 'Save', onclick: save }),
    el('button', { text: 'Cancel', onclick: function () { S.editing = null; render(); } })
  ]));
  async function save() {
    var title = f.title.value.trim(); if (!title) return toast('Title is required');
    var cover = cov.value.trim(); if (cover && !safeUrl(cover)) return toast('Cover must be an https link');
    var genres = f.genres.value.split(',').map(function (x) { return x.trim().slice(0, 30); }).filter(Boolean);
    if (tr.checked && genres.indexOf('To read') < 0) genres.push('To read');
    var nd = Object.assign({}, d, { id: row.id, title: title.slice(0, 200), author: f.author.value.trim().slice(0, 200), genres: genres.slice(0, 6), year: +yr.value || '', pages: +pg.value || 0, publisher: f.publisher.value.trim().slice(0, 80), finished: /^\d{4}-\d{2}-\d{2}$/.test(rd.value) ? rd.value : '', rating: +rt.value || 0, blurb: f.blurb.value.trim().slice(0, 400), cover: cover });
    var changed = S.editing.isNew || (+nd.pages !== +d.pages);
    Object.assign(nd, visuals(nd, S.editing.isNew), changed ? {} : { binding: d.binding, height: d.height, width: d.width });
    try {
      if (S.editing.isNew) {
        var max = S.books.reduce(function (m, b) { return Math.max(m, b.sort_order); }, -1);
        var r = await api('/rest/v1/books', { method: 'POST', headers: J, body: JSON.stringify({ id: row.id, data: nd, sort_order: max + 1 }) });
        S.books.push(r[0]);
      } else {
        var r2 = await api('/rest/v1/books?id=eq.' + encodeURIComponent(row.id), { method: 'PATCH', headers: J, body: JSON.stringify({ data: nd, updated_at: new Date().toISOString() }) });
        var i = S.books.findIndex(function (b) { return b.id === row.id; }); if (i >= 0) S.books[i] = r2[0];
      }
      S.editing = null; render(); toast('Saved');
    } catch (e) { toast('Failed: ' + e.message); }
  }
  return box;
}
async function findOL(q, box, pick) {
  q = q.trim(); if (!q) return toast('Type a title first');
  box.replaceChildren(el('p', { class: 'muted', text: 'Searching...' }));
  try {
    var r = await fetch('https://openlibrary.org/search.json?limit=6&fields=key,title,author_name,first_publish_year,number_of_pages_median,cover_i,publisher&q=' + encodeURIComponent(q));
    var d = await r.json(); box.replaceChildren();
    (d.docs || []).forEach(function (c) {
      box.appendChild(el('div', { class: 'card row' }, [
        el('div', { class: 'cov', style: 'background-image:' + (c.cover_i ? cssUrl('https://covers.openlibrary.org/b/id/' + c.cover_i + '-S.jpg') : '') }),
        el('div', { class: 'grow' }, [el('div', { class: 't', text: String(c.title || '') }), el('div', { class: 's', text: String((c.author_name || [])[0] || '') + (c.first_publish_year ? ' · ' + c.first_publish_year : '') })]),
        el('button', { class: 'sm', text: 'Use', onclick: function () { pick(c); box.replaceChildren(); } })
      ]));
    });
    if (!(d.docs || []).length) box.appendChild(el('p', { class: 'muted', text: 'No results.' }));
  } catch (e) { box.replaceChildren(el('p', { class: 'muted', text: 'Search failed.' })); }
}
function shrink(blob) {
  return new Promise(function (res, rej) {
    var img = new Image(), u = URL.createObjectURL(blob);
    img.onload = function () {
      var s = Math.min(1, 520 / img.width), c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
      c.toBlob(function (b) { b ? res(b) : rej(new Error('encode')); }, 'image/jpeg', 0.85);
    };
    img.onerror = function () { rej(new Error('not an image')); }; img.src = u;
  });
}
async function uploadCover(blob, id) {
  if (blob.size > 12e6) throw new Error('file too big');
  var small = await shrink(blob);
  var path = 'books/' + id.replace(/[^a-z0-9_-]/gi, '') + '-' + Date.now() + '.jpg';
  await api('/storage/v1/object/covers/' + path, { method: 'POST', headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'true' }, body: small });
  return SB + '/storage/v1/object/public/covers/' + path;
}
async function rehost(url, id) {
  try { var r = await fetch(url); if (!r.ok) throw 0; var b = await r.blob(); if (b.size < 800) throw 0; return await uploadCover(b, id); }
  catch (e) { toast('Using the original link (could not copy it)'); return url; }
}

/* ---------- recommendations ---------- */
function recsView() {
  var box = el('div');
  box.appendChild(el('p', { class: 'muted', text: 'New suggestions go live automatically unless the filter flags them. Hide or delete anything here.' }));
  if (!S.recs.length) box.appendChild(el('p', { text: 'No suggestions yet.' }));
  S.recs.forEach(function (r) {
    var st = r.status;
    box.appendChild(el('div', { class: 'card' }, [
      el('div', { class: 'row' }, [
        el('div', { class: 'cov', style: 'background-image:' + cssUrl(r.cover) }),
        el('div', { class: 'grow' }, [
          el('div', { class: 't', text: r.title }), el('div', { class: 's', text: (r.author || '') + ' · from ' + r.recommender }),
          el('div', { class: 's', text: new Date(r.created_at).toLocaleString() }),
          (r.year || r.pages || (r.extra && (r.extra.genres || []).length)) ? el('div', { class: 's', text: [r.year, r.pages ? r.pages + 'p' : '', r.extra && r.extra.publisher, r.extra && (r.extra.genres || []).join(', ')].filter(Boolean).join(' · ') }) : null,
          (r.extra && r.extra.blurb) ? el('div', { class: 's', text: r.extra.blurb }) : null,
          el('div', {}, [el('span', { class: 'tag ' + (st === 'approved' ? 'ok' : 'bad'), text: st === 'approved' ? 'live' : st === 'pending' ? 'held by filter' : 'hidden' })])
        ])
      ]),
      r.note ? el('p', { text: r.note }) : null,
      el('div', { class: 'acts' }, [
        st !== 'approved' ? el('button', { class: 'sm', text: 'Approve (show)', onclick: function () { setRec(r, 'approved'); } }) : el('button', { class: 'sm', text: 'Hide', onclick: function () { setRec(r, 'hidden'); } }),
        el('button', { class: 'sm', text: 'Add to my shelf', onclick: function () { toShelf(r); } }),
        el('button', { class: 'sm bad', text: 'Delete', onclick: function () { if (confirm('Delete this suggestion?')) delRec(r); } })
      ])
    ]));
  });
  return box;
}
async function setRec(r, status) { try { await api('/rest/v1/recommendations?id=eq.' + r.id, { method: 'PATCH', headers: J, body: JSON.stringify({ status: status }) }); r.status = status; render(); } catch (e) { toast('Failed: ' + e.message); } }
async function delRec(r) { try { await api('/rest/v1/recommendations?id=eq.' + r.id, { method: 'DELETE' }); S.recs = S.recs.filter(function (x) { return x.id !== r.id; }); render(); } catch (e) { toast('Failed: ' + e.message); } }
function toShelf(r) {
  var d = { id: 'b-' + crypto.randomUUID().slice(0, 8), title: r.title, author: r.author || '', genres: ['To read'].concat(((r.extra && r.extra.genres) || []).map(String).slice(0, 3)), cover: safeUrl(r.cover), year: r.year || '', pages: r.pages || 0, blurb: ((r.extra && r.extra.blurb) || r.note || '').slice(0, 400), rating: 0, finished: '', publisher: ((r.extra && r.extra.publisher) || '').slice(0, 80) };
  S.editing = { isNew: true, row: { id: d.id, data: d, hidden: false, featured: false } }; S.tab = 'books'; render();
}

/* ---------- activity ---------- */
function actView() {
  var box = el('div'), days = {}, now = Date.now(), since = {};
  function k(t) { return new Date(t).toISOString().slice(0, 10); }
  S.hits.forEach(function (h) { var d = k(h.created_at); (days[d] = days[d] || { search: 0, recommend: 0 })[h.kind] = ((days[d] || {})[h.kind] || 0) + 1; });
  var kinds = ['search', 'recommend'];
  kinds.forEach(function (kind) {
    var arr = []; for (var i = 29; i >= 0; i--) { var dd = k(now - i * 864e5); arr.push((days[dd] || {})[kind] || 0); }
    var mx = Math.max.apply(null, arr.concat([1]));
    var total = arr.reduce(function (a, b) { return a + b; }, 0);
    var uniq = new Set(S.hits.filter(function (h) { return h.kind === kind && now - new Date(h.created_at) < 30 * 864e5; }).map(function (h) { return h.ip_hash; })).size;
    box.appendChild(el('div', { class: 'card' }, [
      el('h2', { text: kind === 'search' ? 'Searches (last 30 days)' : 'Suggestions sent (last 30 days)' }),
      el('div', { text: total + ' total, ' + uniq + ' different visitors' }),
      el('div', { class: 'bars' }, arr.map(function (n) { return el('i', { style: 'height:' + Math.round(n / mx * 100) + '%' }); }))
    ]));
  });
  box.appendChild(el('p', { class: 'muted', text: 'Visitors are counted by an anonymous hash, and search words are not stored.' }));
  return box;
}

/* ---------- settings ---------- */
function setView() {
  var box = el('div');
  box.appendChild(el('div', { class: 'card' }, [
    el('h2', { text: 'Backup' }), el('p', { class: 'muted', text: 'Download all books and suggestions as a JSON file.' }),
    el('button', { text: 'Export JSON', onclick: function () {
      var blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), books: S.books, recommendations: S.recs }, null, 2)], { type: 'application/json' });
      var a = el('a', { href: URL.createObjectURL(blob), download: 'library-backup-' + new Date().toISOString().slice(0, 10) + '.json' }); document.body.appendChild(a); a.click(); a.remove();
    } })
  ]));
  box.appendChild(el('div', { class: 'card' }, [
    el('h2', { text: 'Session' }), el('p', { class: 'muted', text: 'Signed in as ' + OWNER }),
    el('button', { class: 'bad', text: 'Sign out', onclick: async function () { try { await api('/auth/v1/logout', { method: 'POST' }); } catch (e) {} saveSess(null); loginView('Signed out.'); } })
  ]));
  return box;
}

/* ---------- boot ---------- */
async function boot() {
  var h = readHash();
  if (h && h.error) return loginView(h.error);
  if (h && h.access) saveSess(h);
  if (!loadSess()) return loginView();
  app.replaceChildren(el('p', { class: 'center muted', text: 'Loading...' }));
  try {
    var u = await api('/auth/v1/user');
    if (!u || u.email !== OWNER) { saveSess(null); return loginView('This account is not the owner.'); }
    await loadAll(); render();
  } catch (e) { saveSess(null); loginView('Please sign in again.'); }
}
boot();
})();
