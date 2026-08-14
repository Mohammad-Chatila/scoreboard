import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const show = id => $$('.screen').forEach(s => s.hidden = s.id !== id);

const EMOJIS = ['🌸','🐰','🍓','🦄','🐱','🐼','🌈','⭐','🧁','🐝','🍒','🐧','🦋','🌻','🍑','🐶','👑','🫧','🍭','🐢','🌙','🍰','🐙','🎀'];
const COLORS = ['#ff4d8d','#ff8fab','#c77dff','#7aa2ff','#4ecdc4','#12b28a','#ffc857','#ff8a5b'];

/* ── setup gate ───────────────────────────────────────────── */
if (!/^https?:\/\//.test(SUPABASE_URL) || SUPABASE_ANON_KEY.startsWith('PASTE')) {
  show('screen-setup');
  throw new Error('config.js is not filled in yet');
}
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ── state ────────────────────────────────────────────────── */
const KEY = 'scoreboard.session';
let me = null;                 // { id, name, password, emoji, color }
let friends = [], standings = [], feed = [];
let draft = { target: null, sign: 1, amt: 1 };
let seen = new Set();          // point ids already rendered, for the "fresh" glow

/* ── helpers ──────────────────────────────────────────────── */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

const nameOf = id => friends.find(f => f.id === id) || { name: 'someone', emoji: '👻', color: '#c9b3c2' };

const sign = n => (n > 0 ? `+${n}` : `${n}`);
const cls  = n => (n > 0 ? 'up' : n < 0 ? 'down' : 'zero');

function ago(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso)) / 1000);
  if (s < 60) return 'just now';
  const m = s / 60;      if (m < 60) return `${Math.floor(m)}m ago`;
  const h = m / 60;      if (h < 24) return `${Math.floor(h)}h ago`;
  const d = h / 24;      if (d < 7)  return `${Math.floor(d)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const avatar = (f, size = '') =>
  `<div class="av ${size}" style="background:${esc(f.color)}22;box-shadow:inset 0 0 0 2px ${esc(f.color)}55">${esc(f.emoji)}</div>`;

function toast(msg, kind = '') {
  const el = Object.assign(document.createElement('div'), { className: `toast ${kind}`, textContent: msg });
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 3200);
}

function confetti(colors) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const host = $('#confetti');
  for (let i = 0; i < 44; i++) {
    const s = document.createElement('span');
    s.style.left = Math.random() * 100 + 'vw';
    s.style.background = colors[i % colors.length];
    s.style.animationDuration = 1.6 + Math.random() * 1.4 + 's';
    s.style.animationDelay = Math.random() * 0.35 + 's';
    host.append(s);
    setTimeout(() => s.remove(), 3600);
  }
}

const nice = e => String(e?.message || e)
  .replace(/^.*?(?:ERROR:\s*)?/, '')
  .replace(/^(Wrong|That|Name|Password|Points|Keep|You|No such)/, m => m) || 'Something went wrong';

/* ═══════════════════════════════════════════════════════════
   auth
   ═══════════════════════════════════════════════════════════ */
let mode = 'login';
let pickedEmoji = EMOJIS[0], pickedColor = COLORS[0];

$('#emoji-pick').innerHTML = EMOJIS
  .map((e, i) => `<button type="button" class="${i === 0 ? 'is-on' : ''}" data-e="${e}">${e}</button>`).join('');
$('#color-pick').innerHTML = COLORS
  .map((c, i) => `<button type="button" class="swatch ${i === 0 ? 'is-on' : ''}" data-c="${c}" style="background:${c}"></button>`).join('');

$('#emoji-pick').onclick = e => {
  const b = e.target.closest('[data-e]'); if (!b) return;
  $$('#emoji-pick button').forEach(x => x.classList.toggle('is-on', x === b));
  pickedEmoji = b.dataset.e;
};
$('#color-pick').onclick = e => {
  const b = e.target.closest('[data-c]'); if (!b) return;
  $$('#color-pick .swatch').forEach(x => x.classList.toggle('is-on', x === b));
  pickedColor = b.dataset.c;
};

$$('.tab').forEach(t => t.onclick = () => {
  mode = t.dataset.tab;
  $$('.tab').forEach(x => x.classList.toggle('is-on', x === t));
  $('#join-only').hidden = mode !== 'join';
  $('#btn-auth').textContent = mode === 'join' ? 'join the board 🎀' : 'let me in ✨';
  $('#in-pass').autocomplete = mode === 'join' ? 'new-password' : 'current-password';
});

$('#form-auth').onsubmit = async ev => {
  ev.preventDefault();
  const name = $('#in-name').value.trim();
  const password = $('#in-pass').value;
  const btn = $('#btn-auth');
  btn.disabled = true;

  const call = mode === 'join'
    ? db.rpc('signup', { p_name: name, p_password: password, p_emoji: pickedEmoji, p_color: pickedColor })
    : db.rpc('login',  { p_name: name, p_password: password });

  const { data, error } = await call;
  btn.disabled = false;

  if (error) return toast(nice(error), 'bad');
  const row = Array.isArray(data) ? data[0] : data;
  me = { ...row, password };
  localStorage.setItem(KEY, JSON.stringify(me));
  await enter();
};

$('#btn-out').onclick = () => {
  localStorage.removeItem(KEY);
  me = null;
  location.reload();
};

/* ── change your emoji / colour from the chip ─────────────── */
$('#chip-me').onclick = async () => {
  const emoji = prompt('your emoji:', me.emoji);
  if (emoji === null) return;
  const color = prompt('your colour (hex):', me.color);
  if (color === null) return;
  const { data, error } = await db.rpc('update_profile', {
    p_name: me.name, p_password: me.password, p_emoji: emoji, p_color: color,
  });
  if (error) return toast(nice(error), 'bad');
  const row = Array.isArray(data) ? data[0] : data;
  me = { ...me, ...row };
  localStorage.setItem(KEY, JSON.stringify(me));
  renderMe(); await refresh();
};

/* ═══════════════════════════════════════════════════════════
   data
   ═══════════════════════════════════════════════════════════ */
async function refresh() {
  const [f, s, p] = await Promise.all([
    db.from('friends').select('id,name,emoji,color'),
    db.from('standings').select('*'),
    db.from('points').select('id,friend_id,given_by,delta,comment,created_at')
      .order('created_at', { ascending: false }).limit(100),
  ]);
  if (f.error || s.error || p.error) {
    return toast(nice(f.error || s.error || p.error), 'bad');
  }
  friends   = f.data;
  standings = s.data.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  feed      = p.data;
  render();
}

let timer;
const soon = () => { clearTimeout(timer); timer = setTimeout(refresh, 220); };

/* ═══════════════════════════════════════════════════════════
   render
   ═══════════════════════════════════════════════════════════ */
function renderMe() {
  $('#chip-me').innerHTML = `${avatar(me, 'xs')}<span>${esc(me.name)}</span>`;
}

function renderPodium() {
  const top = standings.filter(s => s.entries > 0).slice(0, 3);
  if (top.length < 3) { $('#podium').innerHTML = ''; return; }
  const [a, b, c] = top;
  const pod = (f, place, medal) => `
    <div class="pod pod-${place}">
      ${place === 1 ? '<div class="crown">👑</div>' : ''}
      ${avatar(f)}
      <div class="name">${esc(f.name)}</div>
      <div class="score" style="color:${esc(f.color)}">${sign(f.score)}</div>
      <div class="medal">${medal}</div>
    </div>`;
  $('#podium').innerHTML = pod(b, 2, '🥈') + pod(a, 1, '🥇') + pod(c, 3, '🥉');
}

function renderBoard() {
  if (!standings.length) {
    $('#board').innerHTML = `<div class="empty"><span class="big">🫧</span>nobody here yet</div>`;
    return;
  }
  $('#board').innerHTML = standings.map((f, i) => `
    <div class="row ${f.id === me.id ? 'is-me' : ''}">
      <div class="rank">${i + 1}</div>
      ${avatar(f, 'sm')}
      <div class="meta">
        <div class="name">${esc(f.name)}${f.id === me.id ? ' <span class="muted tiny">(you)</span>' : ''}</div>
        <div class="sub">${f.entries} ${f.entries === 1 ? 'entry' : 'entries'}${f.last_at ? ' · ' + ago(f.last_at) : ''}</div>
      </div>
      <div class="pill ${cls(f.score)}">${sign(f.score)}</div>
    </div>`).join('');
}

function renderFeed() {
  if (!feed.length) {
    $('#feed').innerHTML = `<div class="empty"><span class="big">🍵</span>no tea spilled yet<br><span class="tiny">hit “give points” to start</span></div>`;
    return;
  }
  $('#feed').innerHTML = feed.map(p => {
    const to = nameOf(p.friend_id);
    const by = p.given_by ? nameOf(p.given_by) : null;
    const fresh = seen.size && !seen.has(p.id);
    return `
      <div class="item ${fresh ? 'fresh' : ''}">
        ${avatar(to, 'sm')}
        <div class="body">
          <div class="line">
            <b>${esc(to.name)}</b>
            <span class="pill sm ${cls(p.delta)}">${sign(p.delta)}</span>
          </div>
          ${p.comment ? `<div class="cmt">${esc(p.comment)}</div>` : ''}
          <div class="when">
            ${by ? `${esc(by.emoji)} ${esc(by.name)} · ` : ''}${ago(p.created_at)}
            ${p.given_by === me.id ? `<button class="undo" data-undo="${p.id}">undo</button>` : ''}
          </div>
        </div>
      </div>`;
  }).join('');
  feed.forEach(p => seen.add(p.id));
}

$('#feed').onclick = async e => {
  const b = e.target.closest('[data-undo]'); if (!b) return;
  if (!confirm('take those points back?')) return;
  const { error } = await db.rpc('delete_point', {
    p_name: me.name, p_password: me.password, p_id: Number(b.dataset.undo),
  });
  if (error) return toast(nice(error), 'bad');
  toast('taken back', 'good');
  await refresh();
};

function render() { renderPodium(); renderBoard(); renderFeed(); renderTargets(); }

/* ═══════════════════════════════════════════════════════════
   give points
   ═══════════════════════════════════════════════════════════ */
function renderTargets() {
  const others = friends.filter(f => f.id !== me.id);
  if (!others.length) {
    $('#target-pick').innerHTML = `<span class="muted tiny">nobody else has joined yet — send them the link!</span>`;
    return;
  }
  if (!others.some(f => f.id === draft.target)) draft.target = null;
  $('#target-pick').innerHTML = others.map(f => `
    <button type="button" class="target ${f.id === draft.target ? 'is-on' : ''}" data-t="${f.id}">
      ${avatar(f, 'xs')}<span>${esc(f.name)}</span>
    </button>`).join('');
}

$('#target-pick').onclick = e => {
  const b = e.target.closest('[data-t]'); if (!b) return;
  draft.target = b.dataset.t;
  $$('#target-pick .target').forEach(x => x.classList.toggle('is-on', x === b));
};

$$('.sign-btn').forEach(b => b.onclick = () => {
  draft.sign = Number(b.dataset.sign);
  $$('.sign-btn').forEach(x => x.classList.toggle('is-on', x === b));
});

$$('.amt').forEach(b => b.onclick = () => {
  draft.amt = Number(b.dataset.amt);
  $('#in-amt').value = draft.amt;
  $$('.amt').forEach(x => x.classList.toggle('is-on', x === b));
});

$('#in-amt').oninput = () => {
  draft.amt = Math.min(1000, Math.max(1, Number($('#in-amt').value) || 1));
  $$('.amt').forEach(x => x.classList.toggle('is-on', Number(x.dataset.amt) === draft.amt));
};

const openModal  = () => { $('#modal').hidden = false; renderTargets(); };
const closeModal = () => { $('#modal').hidden = true; };

$('#fab').onclick = openModal;
$$('[data-close]').forEach(el => el.onclick = closeModal);
addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

$('#btn-give').onclick = async () => {
  if (!draft.target) return toast('pick who it’s for 👀', 'bad');
  const delta = draft.sign * draft.amt;
  const comment = $('#in-comment').value.trim();
  const btn = $('#btn-give');
  btn.disabled = true;

  const { error } = await db.rpc('add_points', {
    p_name: me.name, p_password: me.password,
    p_target: draft.target, p_delta: delta, p_comment: comment,
  });
  btn.disabled = false;
  if (error) return toast(nice(error), 'bad');

  const who = nameOf(draft.target);
  toast(`${sign(delta)} for ${who.name} ${delta > 0 ? '🎉' : '💀'}`, delta > 0 ? 'good' : 'bad');
  if (delta > 0) confetti([who.color, '#ff4d8d', '#ffc857', '#c77dff', '#4ecdc4']);

  $('#in-comment').value = '';
  closeModal();
  await refresh();
};

/* ═══════════════════════════════════════════════════════════
   boot
   ═══════════════════════════════════════════════════════════ */
async function enter() {
  show('screen-app');
  renderMe();
  await refresh();
  db.channel('board')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'points'  }, soon)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'friends' }, soon)
    .subscribe();
  setInterval(() => { renderBoard(); renderFeed(); }, 60_000); // keep "2m ago" honest
}

(async function boot() {
  const saved = localStorage.getItem(KEY);
  if (!saved) return show('screen-auth');
  try {
    const s = JSON.parse(saved);
    const { data, error } = await db.rpc('login', { p_name: s.name, p_password: s.password });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    me = { ...row, password: s.password };
    localStorage.setItem(KEY, JSON.stringify(me));
    await enter();
  } catch {
    localStorage.removeItem(KEY);
    show('screen-auth');
  }
})();
