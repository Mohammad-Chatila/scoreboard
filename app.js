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
  const m = s / 60;  if (m < 60) return `${Math.floor(m)}m ago`;
  const h = m / 60;  if (h < 24) return `${Math.floor(h)}h ago`;
  const d = h / 24;  if (d < 7)  return `${Math.floor(d)}d ago`;
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
  for (let i = 0; i < 40; i++) {
    const s = document.createElement('span');
    s.style.left = Math.random() * 100 + 'vw';
    s.style.background = colors[i % colors.length];
    s.style.animationDuration = 1.6 + Math.random() * 1.4 + 's';
    s.style.animationDelay = Math.random() * 0.35 + 's';
    host.append(s);
    setTimeout(() => s.remove(), 3600);
  }
}

const nice = e => String(e?.message || e) || 'Something went wrong';

/* haptic nudge where the platform allows it */
const buzz = ms => { try { navigator.vibrate?.(ms); } catch {} };

/* reusable emoji + colour picker, used by both join and profile */
function picker(gridEl, rowEl, emoji, color) {
  const state = { emoji, color };
  gridEl.innerHTML = EMOJIS.map(e =>
    `<button type="button" class="${e === emoji ? 'is-on' : ''}" data-e="${e}">${e}</button>`).join('');
  rowEl.innerHTML = COLORS.map(c =>
    `<button type="button" class="swatch ${c === color ? 'is-on' : ''}" data-c="${c}" style="background:${c}"></button>`).join('');

  gridEl.onclick = e => {
    const b = e.target.closest('[data-e]'); if (!b) return;
    $$('button', gridEl).forEach(x => x.classList.toggle('is-on', x === b));
    state.emoji = b.dataset.e; state.onchange?.(state);
  };
  rowEl.onclick = e => {
    const b = e.target.closest('[data-c]'); if (!b) return;
    $$('.swatch', rowEl).forEach(x => x.classList.toggle('is-on', x === b));
    state.color = b.dataset.c; state.onchange?.(state);
  };
  return state;
}

/* ═══════════════════════════════════════════════════════════
   auth
   ═══════════════════════════════════════════════════════════ */
let mode = 'login';
const joinPick = picker($('#emoji-pick'), $('#color-pick'), EMOJIS[0], COLORS[0]);

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
  document.activeElement?.blur();   // drop the mobile keyboard

  const { data, error } = await (mode === 'join'
    ? db.rpc('signup', { p_name: name, p_password: password, p_emoji: joinPick.emoji, p_color: joinPick.color })
    : db.rpc('login',  { p_name: name, p_password: password }));

  btn.disabled = false;
  if (error) { buzz(60); return toast(nice(error), 'bad'); }

  const row = Array.isArray(data) ? data[0] : data;
  me = { ...row, password };
  localStorage.setItem(KEY, JSON.stringify(me));
  await enter();
};

/* ═══════════════════════════════════════════════════════════
   sheets
   ═══════════════════════════════════════════════════════════ */
let openSheet = null;
function sheet(el, on) {
  el.hidden = !on;
  openSheet = on ? el : null;
  document.body.style.overflow = on ? 'hidden' : '';
}
addEventListener('keydown', e => { if (e.key === 'Escape' && openSheet) sheet(openSheet, false); });

/* give points */
$('#fab').onclick = () => { renderTargets(); sheet($('#modal'), true); };
$$('[data-close]').forEach(el => el.onclick = () => sheet($('#modal'), false));

/* profile */
let pfPick = null;
const drawPreview = s => { $('#pf-preview').innerHTML = avatar({ emoji: s.emoji, color: s.color }, 'lg'); };

$('#chip-me').onclick = () => {
  pfPick = picker($('#pf-emoji'), $('#pf-color'), me.emoji, me.color);
  pfPick.onchange = drawPreview;
  drawPreview(pfPick);
  sheet($('#profile'), true);
};
$$('[data-close-profile]').forEach(el => el.onclick = () => sheet($('#profile'), false));

$('#btn-save-profile').onclick = async () => {
  const btn = $('#btn-save-profile'); btn.disabled = true;
  const { data, error } = await db.rpc('update_profile', {
    p_name: me.name, p_password: me.password, p_emoji: pfPick.emoji, p_color: pfPick.color,
  });
  btn.disabled = false;
  if (error) return toast(nice(error), 'bad');

  me = { ...me, ...(Array.isArray(data) ? data[0] : data) };
  localStorage.setItem(KEY, JSON.stringify(me));
  sheet($('#profile'), false);
  renderMe(); await refresh();
  toast('looking good 💅', 'good');
};

$('#btn-out').onclick = () => { localStorage.removeItem(KEY); location.reload(); };

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
  const bad = f.error || s.error || p.error;
  if (bad) return toast(nice(bad), 'bad');

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
    $('#feed').innerHTML = `<div class="empty"><span class="big">🍵</span>no tea spilled yet<br><span class="tiny">tap “give points” to start</span></div>`;
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
            <span>${by ? `${esc(by.emoji)} ${esc(by.name)} · ` : ''}${ago(p.created_at)}</span>
            ${p.given_by === me.id ? `<button class="undo" type="button" data-undo="${p.id}">undo</button>` : ''}
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

function render() { renderPodium(); renderBoard(); renderFeed(); }

/* pane switcher (phones show one at a time) */
$$('.sw').forEach(b => b.onclick = () => {
  $$('.sw').forEach(x => x.classList.toggle('is-on', x === b));
  $$('.pane').forEach(p => p.classList.toggle('off', p.dataset.pane !== b.dataset.pane));
});

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
  buzz(10);
};

$$('.sign-btn').forEach(b => b.onclick = () => {
  draft.sign = Number(b.dataset.sign);
  $$('.sign-btn').forEach(x => x.classList.toggle('is-on', x === b));
  buzz(10);
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

$('#btn-give').onclick = async () => {
  if (!draft.target) { buzz(60); return toast('pick who it’s for 👀', 'bad'); }
  const delta = draft.sign * draft.amt;
  const comment = $('#in-comment').value.trim();
  const btn = $('#btn-give');
  btn.disabled = true;
  document.activeElement?.blur();

  const { error } = await db.rpc('add_points', {
    p_name: me.name, p_password: me.password,
    p_target: draft.target, p_delta: delta, p_comment: comment,
  });
  btn.disabled = false;
  if (error) { buzz(60); return toast(nice(error), 'bad'); }

  const who = nameOf(draft.target);
  buzz(delta > 0 ? [12, 40, 12] : 30);
  toast(`${sign(delta)} for ${who.name} ${delta > 0 ? '🎉' : '💀'}`, delta > 0 ? 'good' : 'bad');
  if (delta > 0) confetti([who.color, '#ff4d8d', '#ffc857', '#c77dff', '#4ecdc4']);

  $('#in-comment').value = '';
  sheet($('#modal'), false);
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

  setInterval(() => { renderBoard(); renderFeed(); }, 60_000);  // keep "2m ago" honest
  // phones suspend sockets in the background — resync when you come back
  addEventListener('visibilitychange', () => { if (!document.hidden) soon(); });
}

(async function boot() {
  const saved = localStorage.getItem(KEY);
  if (!saved) return show('screen-auth');
  try {
    const s = JSON.parse(saved);
    const { data, error } = await db.rpc('login', { p_name: s.name, p_password: s.password });
    if (error) throw error;
    me = { ...(Array.isArray(data) ? data[0] : data), password: s.password };
    localStorage.setItem(KEY, JSON.stringify(me));
    await enter();
  } catch {
    localStorage.removeItem(KEY);
    show('screen-auth');
  }
})();
