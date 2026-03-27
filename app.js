// ─── STATE ────────────────────────────────────────────────────────
const S = {
  user: null,
  token: localStorage.getItem('mtcg_token'),
  view: 'login',
  collection: [],
  friends: [],
  leaderboard: [],
  myRank: null,
  reports: [],
  announcements: [],
  news: [],
  settings: {},
  battle: null,
  notifications: [],
  adminTab: 'users',
  settingsTab: 'profile',
  filterType: '',
  filterRarity: '',
  filterSearch: '',
  collectionPage: 1,
  allCards: [],
  allCardsTotal: 0,
  // Conquest
  conquestProgress: [],
  conquestCtx: null,
  // Deck
  deck: [],
  deckCards: [],
  _pickerDeckIds: null,
  // PvP
  pvpBattle: null,
  _pvpPolling: null,
  _pvpRanked: false,
  // Conquest battle polling
  _cqBattleInterval: null,
  // Profile
  profileUser: null,
  _statsInterval: null,
  // Card browser
  cbPage: 1,
  cbType: '',
  cbRarity: '',
  cbSearch: '',
  cbCards: [],
  cbTotal: 0,
};

const TYPES = ['Fire','Water','Earth','Air','Shadow','Light','Thunder','Ice','Poison','Psychic','Nature','Metal','Dragon','Cosmic','Void','Crystal','Blood','Spirit','Chaos','Dream'];
const RARITIES = ['Common','Uncommon','Rare','Ultra_Rare','Secret_Rare','Full_Art','Parallel','Numbered','Prism','Mythic'];
const ROLE_ORDER = ['user','mod','admin','headofstaff','owner','developer'];
const COLORS = ['#c0392b','#2471a3','#1e8449','#b7860b','#6c3483','#148f77'];

// ─── MUSIC SYSTEM ─────────────────────────────────────────────────
const Music = (() => {
  let ctx = null, master = null, rev = null, loopTimer = null;
  let playing = false;
  let currentPat = 0;
  let vol = parseFloat(localStorage.getItem('mtcg_vol') || '0.50');

  // Pentatonic C major across 3 octaves
  const P = [
    130.81, 146.83, 164.81, 196.00, 220.00,   // C2 D2 E2 G2 A2
    261.63, 293.66, 329.63, 392.00, 440.00,   // C3 D3 E3 G3 A3
    523.25, 587.33, 659.25, 783.99, 880.00,   // C4 D4 E4 G4 A4
  ];

  const PATTERNS = [
    { bpm:50, seq:[5,7,8,9,7,6,8,7,5,6,8,9,10,9,8,6], label:'Ambient'  },
    { bpm:76, seq:[7,9,10,9,8,10,12,10,9,8,9,7,8,10,12,11], label:'Battle'  },
    { bpm:58, seq:[5,6,8,10,9,8,10,12,10,9,8,6,7,9,8,6],  label:'Conquest' },
  ];

  function boot() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = vol;
    rev = ctx.createConvolver();
    const len = ctx.sampleRate * 2.8;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random()*2-1) * Math.pow(1-i/len, 2.2);
    }
    rev.buffer = buf;
    rev.connect(master);
    master.connect(ctx.destination);
  }

  function tone(freq, t, dur, gain = 0.06, type = 'sine') {
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + Math.min(0.1, dur * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(rev);
    osc.start(t); osc.stop(t + dur + 0.1);
  }

  function loop(patIdx) {
    const now = ctx.currentTime;
    const { bpm, seq } = PATTERNS[patIdx];
    const beat = 60 / bpm;
    const total = seq.length * beat;

    // Melody arpeggio
    seq.forEach((ni, i) => tone(P[ni], now + i * beat, beat * 0.7, 0.12));

    // Low pad chord (C2-E2-G2)
    [P[0], P[2], P[3]].forEach(f => {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = 'triangle'; osc.frequency.value = f;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.048, now + 1.2);
      g.gain.linearRampToValueAtTime(0.048, now + total - 1.2);
      g.gain.linearRampToValueAtTime(0, now + total);
      osc.connect(g); g.connect(rev); osc.start(now); osc.stop(now + total);
    });

    // Sparse bass plucks
    [0, Math.floor(seq.length/2)].forEach(bi => {
      tone(P[0], now + bi * beat, beat * 2, 0.08, 'triangle');
    });

    loopTimer = setTimeout(() => { if (playing) loop(currentPat); }, total * 1000 - 100);
  }

  return {
    get on() { return playing; },
    get volume() { return vol; },
    get _ctx() { return ctx; },
    bootCtx() { boot(); return ctx; },
    start(pat) {
      boot();
      playing = true;
      currentPat = pat ?? currentPat;
      loop(currentPat);
      localStorage.setItem('mtcg_music', '1');
      updateMusicBtn();
    },
    stop() {
      playing = false;
      clearTimeout(loopTimer);
      if (master) { master.gain.linearRampToValueAtTime(0.0001, (ctx?.currentTime||0) + 0.7); setTimeout(() => { if (master && !playing) master.gain.value = vol; }, 800); }
      localStorage.setItem('mtcg_music', '0');
      updateMusicBtn();
    },
    toggle() { this.on ? this.stop() : this.start(); },
    setPattern(p) {
      if (p === currentPat) return;
      currentPat = p;
      if (playing) { this.stop(); setTimeout(() => this.start(p), 800); }
    },
    setVolume(v) {
      vol = v;
      localStorage.setItem('mtcg_vol', v);
      if (master) master.gain.value = v;
    },
    autoStart() {
      if (localStorage.getItem('mtcg_music') === '1') this.start();
    },
  };
})();

function updateMusicBtn() {
  const btn = document.getElementById('music-toggle');
  if (btn) { btn.textContent = Music.on ? '♫' : '♪'; btn.title = Music.on ? 'Mute music' : 'Play music'; btn.classList.toggle('music-on', Music.on); }
}
window.toggleMusic = () => { Music.toggle(); };
window.Music = Music;

// ─── API ───────────────────────────────────────────────────────────
async function api(path, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (S.token) opts.headers['Authorization'] = 'Bearer ' + S.token;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch('/api' + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ─── NOTIFY ───────────────────────────────────────────────────────
function notify(msg, type = 'info') {
  const n = document.createElement('div');
  n.className = 'notif ' + type;
  n.textContent = msg;
  document.getElementById('notifications').appendChild(n);
  setTimeout(() => n.remove(), 3500);
}

// ─── MODAL ────────────────────────────────────────────────────────
function openModal(html) {
  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal-overlay').classList.remove('hidden');
}
function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('modal-content').innerHTML = '';
}
window.closeModal = closeModal;

// ─── ROUTER ───────────────────────────────────────────────────────
function nav(view) {
  const pvpViews = ['pvp_battle','pvp_queue'];
  if (S._pvpPolling && pvpViews.includes(S.view) && !pvpViews.includes(view)) {
    clearInterval(S._pvpPolling);
    S._pvpPolling = null;
  }
  if (S._cqBattleInterval && S.view === 'conquest_battle' && view !== 'conquest_battle') {
    clearInterval(S._cqBattleInterval);
    S._cqBattleInterval = null;
  }
  S.view = view;
  window.location.hash = view;
  const pat = ['pvp_battle','battle'].includes(view) ? 1 : view.startsWith('conquest') ? 2 : 0;
  Music.setPattern(pat);
  render();
}
window.nav = nav;

function render() {
  const app = document.getElementById('app');
  if (!S.user && S.view !== 'register') { renderAuth(app); return; }
  if (S.view === 'register') { renderRegister(app); return; }
  app.innerHTML = `
    ${renderNav()}
    <div id="page">${getView()}</div>
  `;
  attachListeners();
  if (S.view === 'cards' && !S.cbCards.length) loadCardBrowser();
}

function getView() {
  switch (S.view) {
    case 'home':        return viewHome();
    case 'shop':        return viewShop();
    case 'cards':       return viewCardBrowser();
    case 'conquest':         return viewConquest();
    case 'conquest_battle':  return viewConquestBattle();
    case 'collection':  return viewCollection();
    case 'deck':        return viewDeck();
    case 'battle':      return viewBattle();
    case 'pvp':         return viewPvp();
    case 'pvp_queue':   return viewPvpQueue();
    case 'pvp_battle':  return viewPvpBattle();
    case 'profile':     return viewProfile();
    case 'friends':     return viewFriends();
    case 'leaderboard': return viewLeaderboard();
    case 'news':        return viewNews();
    case 'admin':       return viewAdmin();
    case 'reports':     return viewReports();
    case 'settings':    return viewSettings();
    default:            return viewHome();
  }
}

// ─── NAV ──────────────────────────────────────────────────────────
function renderNav() {
  const u = S.user;
  const links = [
    ['home','Home'],['shop','Shop'],['cards','All Cards'],['conquest','Conquest'],
    ['collection','Collection'],['deck','Deck'],['battle','Battle'],['pvp','PvP'],
    ['friends','Friends'],['leaderboard','Leaderboard'],['news','News'],
    ['reports','Reports'],['settings','Settings']
  ];
  if (u && ROLE_ORDER.indexOf(u.role) >= ROLE_ORDER.indexOf('mod')) links.push(['admin','Admin']);
  const unread = S.notifications.filter(n => !n.read).length;
  const bellBadge = unread > 0 ? `<span class="notif-badge">${unread}</span>` : '';
  return `<nav id="navbar">
    <span class="nav-brand" onclick="nav('home')">Mythical TCG</span>
    ${links.map(([v,l]) => `<span class="nav-link${S.view===v?' active':''}" onclick="nav('${v}')">${l}</span>`).join('')}
    <span class="nav-spacer"></span>
    <a class="nav-link nav-discord" href="https://discord.gg/2Wcz97uFau" target="_blank" rel="noopener" title="Join our Discord">Discord</a>
    <div class="nav-user">
      <span class="nav-coins">${u ? u.coins + ' coins' : ''}</span>
      <div class="notif-bell" onclick="toggleNotifPanel()" title="Notifications">
        <span class="bell-icon">&#9993;</span>${bellBadge}
      </div>
      <span class="nav-avatar" onclick="nav('settings')" title="Settings">${u ? _av(u, 36) : ''}</span>
      <span class="role-badge role-${u?.role||'user'}">${u?.role||''}</span>
      <button id="music-toggle" class="music-btn${Music.on?' music-on':''}" onclick="toggleMusic()" title="${Music.on?'Mute music':'Play music'}">${Music.on?'♫':'♪'}</button>
      <button class="btn btn-sm" onclick="logout()">Log out</button>
    </div>
  </nav>
  <div id="notif-panel" class="notif-panel hidden">
    <div class="notif-panel-header">
      <span>Notifications</span>
      <button class="btn btn-sm" onclick="markAllRead()">Mark all read</button>
    </div>
    <div id="notif-list">${renderNotifList()}</div>
  </div>`;
}

function renderNotifList() {
  if (!S.notifications.length) return '<p class="text-muted" style="padding:0.8rem 1rem;font-size:0.9rem">No notifications yet.</p>';
  return S.notifications.slice(0, 15).map(n => `
    <div class="notif-item${n.read ? '' : ' unread'}" onclick="readNotif(${n.id})">
      <div class="notif-item-avatar">${_av({avatar_img: n.from_avatar_img, avatar_color: n.from_avatar, username: n.from_username||'?'}, 34)}</div>
      <div class="notif-item-body">
        <div class="notif-item-msg">${n.message}</div>
        <div class="notif-item-time">${timeAgo(n.created_at)}</div>
      </div>
      ${!n.read ? '<div class="notif-dot"></div>' : ''}
    </div>`).join('');
}

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60000)    return 'just now';
  if (diff < 3600000)  return Math.floor(diff/60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago';
  return Math.floor(diff/86400000) + 'd ago';
}

window.toggleNotifPanel = () => {
  const p = document.getElementById('notif-panel');
  if (p) p.classList.toggle('hidden');
};
window.markAllRead = async () => {
  await api('/notifications/read-all','PUT').catch(()=>{});
  S.notifications.forEach(n => n.read = true);
  const el = document.getElementById('notif-list');
  if (el) el.innerHTML = renderNotifList();
  updateNotifBell();
};
window.readNotif = async (id) => {
  await api('/notifications/' + id + '/read','PUT').catch(()=>{});
  const n = S.notifications.find(n => n.id === id);
  if (n) n.read = true;
  const el = document.getElementById('notif-list');
  if (el) el.innerHTML = renderNotifList();
  updateNotifBell();
};

function updateNotifBell() {
  const unread = S.notifications.filter(n => !n.read).length;
  const badge = document.querySelector('.notif-badge');
  const bell  = document.querySelector('.notif-bell');
  if (bell) {
    const existing = bell.querySelector('.notif-badge');
    if (unread > 0) {
      if (existing) existing.textContent = unread;
      else bell.insertAdjacentHTML('beforeend', `<span class="notif-badge">${unread}</span>`);
    } else if (existing) existing.remove();
  }
}

// ─── AUTH ──────────────────────────────────────────────────────────
function renderAuth(app) {
  app.innerHTML = `<div id="auth-page">
    <div class="auth-box">
      <h1 class="auth-title">Mythical TCG</h1>
      <p class="auth-subtitle">Collect. Battle. Conquer.</p>
      <div class="form-group">
        <label for="l-user">Username</label>
        <input id="l-user" class="input-sketch" placeholder="Enter your username" autocomplete="username">
      </div>
      <div class="form-group">
        <label for="l-pass">Password</label>
        <input id="l-pass" class="input-sketch" type="password" placeholder="Enter your password" autocomplete="current-password">
      </div>
      <div id="auth-err" class="text-red mb-2" style="min-height:1.2rem;font-size:0.95rem"></div>
      <button class="btn btn-primary" style="width:100%" onclick="doLogin()">Sign In</button>
      <hr class="auth-divider">
      <button class="btn" style="width:100%" onclick="nav('register')">Create Account</button>
    </div>
  </div>`;
  const li = (e) => { if (e.key === 'Enter') doLogin(); };
  app.querySelector('#l-user').addEventListener('keydown', li);
  app.querySelector('#l-pass').addEventListener('keydown', li);
}

function renderRegister(app) {
  app.innerHTML = `<div id="auth-page">
    <div class="auth-box">
      <h1 class="auth-title">Join the Adventure</h1>
      <p class="auth-subtitle">Create your account - no email needed</p>
      <div class="form-group">
        <label for="r-user">Username (3-20 chars, letters/numbers/_)</label>
        <input id="r-user" class="input-sketch" placeholder="Choose a username" autocomplete="username">
      </div>
      <div class="form-group">
        <label for="r-pass">Password (8+ characters)</label>
        <input id="r-pass" class="input-sketch" type="password" placeholder="Choose a password" autocomplete="new-password">
      </div>
      <div class="form-group">
        <label for="r-pass2">Confirm Password</label>
        <input id="r-pass2" class="input-sketch" type="password" placeholder="Confirm your password" autocomplete="new-password">
      </div>
      <div id="reg-err" class="text-red mb-2" style="min-height:1.2rem;font-size:0.95rem"></div>
      <button class="btn btn-primary" style="width:100%" onclick="doRegister()">Create Account</button>
      <hr class="auth-divider">
      <button class="btn" style="width:100%" onclick="nav('login')">Back to Sign In</button>
    </div>
  </div>`;
}

async function doLogin() {
  const u = document.getElementById('l-user')?.value?.trim();
  const p = document.getElementById('l-pass')?.value;
  const err = document.getElementById('auth-err');
  if (!u || !p) { if (err) err.textContent = 'Please fill in all fields'; return; }
  try {
    const data = await api('/auth/login','POST',{username:u,password:p});
    S.token = data.token;
    S.user = data.user;
    localStorage.setItem('mtcg_token', data.token);
    nav('home');
  } catch (e) { if (err) err.textContent = e.message; }
}
window.doLogin = doLogin;

async function doRegister() {
  const u = document.getElementById('r-user')?.value?.trim();
  const p = document.getElementById('r-pass')?.value;
  const p2 = document.getElementById('r-pass2')?.value;
  const err = document.getElementById('reg-err');
  if (!u || !p || !p2) { if (err) err.textContent = 'Please fill in all fields'; return; }
  if (p !== p2) { if (err) err.textContent = 'Passwords do not match'; return; }
  try {
    const data = await api('/auth/register','POST',{username:u,password:p});
    S.token = data.token;
    S.user = data.user;
    localStorage.setItem('mtcg_token', data.token);
    nav('home');
  } catch (e) { if (err) err.textContent = e.message; }
}
window.doRegister = doRegister;

function logout() {
  S.token = null; S.user = null;
  localStorage.removeItem('mtcg_token');
  S.view = 'login';
  render();
}
window.logout = logout;

// ─── CARD RENDERER ────────────────────────────────────────────────
function typeColor(type) {
  const m = {Fire:'#e74c3c',Water:'#2980b9',Earth:'#8e6b3e',Air:'#7fb3d3',Shadow:'#2c3e50',Light:'#e6b800',Thunder:'#f39c12',Ice:'#74b9ff',Poison:'#8e44ad',Psychic:'#c0392b',Nature:'#27ae60',Metal:'#808b96',Dragon:'#d35400',Cosmic:'#6c5ce7',Void:'#1a1a2e',Crystal:'#00cec9',Blood:'#a93226',Spirit:'#b2bec3',Chaos:'#d63031',Dream:'#a29bfe'};
  return m[type] || '#888';
}

function rarityLabel(r) {
  return {Common:'Common',Uncommon:'Uncommon',Rare:'Rare',Ultra_Rare:'Ultra Rare',Secret_Rare:'Secret Rare',Full_Art:'Full Art',Parallel:'Parallel',Numbered:'Numbered',Prism:'Prism Star',Mythic:'Mythic'}[r] || r;
}

// ─── PROCEDURAL CARD ART — unique per card ─────────────────────────
// Each card gets unique art seeded from its id+class+type+rarity
function generateCardSVG(card) {
  const id = card.id || 1;
  // Deterministic seeded float 0-1 for (id, multiplier) pair
  const r  = (m) => ((id * m * 6364136223846793005n === undefined ? (id * m * 48271 + m * 17 + id % 31) % 97 : (id * m * 48271 + m * 17 + id % 31) % 97) / 97);
  const rf = (m) => ((id * m * 48271 + m * 17 + id % 31) % 97) / 97;
  const ri = (m, n) => Math.floor(rf(m) * n);
  const tc = typeColor(card.type || 'Fire');
  const cls = (card.class || 'Beast').toLowerCase();

  // Per-card transform: scale ±20%, position ±5px
  const sx = (0.85 + rf(7)  * 0.3).toFixed(3);
  const sy = (0.85 + rf(11) * 0.3).toFixed(3);
  const tx = ((rf(13) - 0.5) * 10).toFixed(1);
  const ty = ((rf(17) - 0.5) * 8).toFixed(1);

  const bg       = _artBg(tc, rf, ri);
  const creature = _artCreature(cls, tc, rf, ri);
  const fx       = _artRarityFx(card.rarity, tc, rf);

  return '<svg viewBox="0 0 100 90" xmlns="http://www.w3.org/2000/svg">'
    + bg
    + '<g transform="translate(' + (50 + parseFloat(tx)) + ',' + (44 + parseFloat(ty))
    + ') scale(' + sx + ',' + sy + ') translate(-50,-44)">'
    + creature + '</g>' + fx + '</svg>';
}

function _artBg(tc, rf, ri) {
  // Dark base + type-colored glow spot at unique position + 4 particles
  const sx = (20 + rf(3)*60).toFixed(1), sy = (10 + rf(5)*40).toFixed(1);
  const sr = (18 + rf(7)*18).toFixed(1);
  const op = (rf(9)*0.14 + 0.08).toFixed(2);
  const pts = [3,41,53,67].map((m,i) => {
    const px = (rf(m)*82+9).toFixed(1), py = (rf(m+2)*72+9).toFixed(1);
    const ps = (rf(m+4)*3+1.2).toFixed(1);
    const po = (rf(m+6)*0.1+0.08).toFixed(2);
    return '<circle cx="'+px+'" cy="'+py+'" r="'+ps+'" fill="'+tc+'" opacity="'+po+'"/>';
  }).join('');
  return '<rect width="100" height="90" fill="#060912"/>'
    +'<ellipse cx="'+sx+'" cy="'+sy+'" rx="'+sr+'" ry="'+(parseFloat(sr)*0.75).toFixed(1)+'" fill="'+tc+'" opacity="'+op+'"/>'
    + pts;
}

function _artEyes(tc, rf, ri, centerX, eyeY) {
  const es  = (2.4 + rf(13) * 2.2).toFixed(1);
  const esp = (5 + rf(17) * 8).toFixed(1);
  const ep  = (parseFloat(es) * 0.42).toFixed(1);
  const ep2 = (parseFloat(ep) * 0.36).toFixed(1);
  const lx  = (centerX - parseFloat(esp)/2).toFixed(1);
  const rx  = (centerX + parseFloat(esp)/2).toFixed(1);
  const eyeCol = ri(19,3)===0 ? '#e74c3c' : ri(19,3)===1 ? '#f1c40f' : '#00d2ff';
  return '<circle cx="'+lx+'" cy="'+eyeY+'" r="'+es+'" fill="white" opacity="0.92"/>'
    +'<circle cx="'+rx+'" cy="'+eyeY+'" r="'+es+'" fill="white" opacity="0.92"/>'
    +'<circle cx="'+(parseFloat(lx)+0.5).toFixed(1)+'" cy="'+(parseFloat(eyeY)+0.4).toFixed(1)+'" r="'+ep+'" fill="'+eyeCol+'"/>'
    +'<circle cx="'+(parseFloat(rx)+0.5).toFixed(1)+'" cy="'+(parseFloat(eyeY)+0.4).toFixed(1)+'" r="'+ep+'" fill="'+eyeCol+'"/>'
    +'<circle cx="'+(parseFloat(lx)-0.5).toFixed(1)+'" cy="'+(parseFloat(eyeY)-0.5).toFixed(1)+'" r="'+ep2+'" fill="white" opacity="0.65"/>'
    +'<circle cx="'+(parseFloat(rx)-0.5).toFixed(1)+'" cy="'+(parseFloat(eyeY)-0.5).toFixed(1)+'" r="'+ep2+'" fill="white" opacity="0.65"/>';
}

function _artCreature(cls, tc, rf, ri) {
  const v = ri(7, 4);  // 4 design variants per class
  switch(cls) {
    case 'beast':     return _cBeast(tc, v, rf, ri);
    case 'dragon':    return _cDragon(tc, v, rf, ri);
    case 'golem':     return _cGolem(tc, v, rf, ri);
    case 'sprite':    return _cSprite(tc, v, rf, ri);
    case 'demon':     return _cDemon(tc, v, rf, ri);
    case 'angel':     return _cAngel(tc, v, rf, ri);
    case 'undead':    return _cUndead(tc, v, rf, ri);
    case 'elemental': return _cElemental(tc, v, rf, ri);
    case 'construct': return _cConstruct(tc, v, rf, ri);
    case 'titan':     return _cTitan(tc, v, rf, ri);
    default:          return _cBeast(tc, v, rf, ri);
  }
}

// BEAST — quadruped (wolf/lion/panther)
function _cBeast(tc, v, rf, ri) {
  const bw=23+rf(23)*6, bh=13+rf(29)*3.5, by=59+rf(31)*3;
  const hx=41+rf(37)*8, hy=37+rf(43)*4, hr=11+rf(47)*3;
  const earH=8+rf(53)*5;
  const ears = v<2
    ? '<polygon points="'+(hx-5)+','+(hy-hr)+' '+(hx-10)+','+(hy-hr-earH)+' '+(hx-0.5)+','+(hy-hr-2)+'" fill="'+tc+'"/>'
      +'<polygon points="'+(hx+5)+','+(hy-hr)+' '+(hx+10)+','+(hy-hr-earH)+' '+(hx+0.5)+','+(hy-hr-2)+'" fill="'+tc+'"/>'
    : '<ellipse cx="'+(hx-5)+'" cy="'+(hy-hr-earH*0.5)+'" rx="3.5" ry="'+(earH*0.65).toFixed(1)+'" fill="'+tc+'"/>'
      +'<ellipse cx="'+(hx+5)+'" cy="'+(hy-hr-earH*0.5)+'" rx="3.5" ry="'+(earH*0.65).toFixed(1)+'" fill="'+tc+'"/>';
  const td=v%2===0?1:-1;
  const tail='<path d="M'+(50+bw)+','+(by-4)+' Q'+(50+bw+td*14)+','+(by-20)+' '+(50+bw+td*8)+','+(by-28)+'" stroke="'+tc+'" stroke-width="3.5" fill="none" stroke-linecap="round"/>';
  const legH=(10+rf(59)*4).toFixed(1);
  const legs=[-13,-5,3,11].map(lx=>'<rect x="'+(50+lx-2).toFixed(0)+'" y="'+(by+bh/2).toFixed(0)+'" width="4" height="'+legH+'" fill="'+tc+'" rx="2"/>').join('');
  const sx=hx-hr+1, sy=hy+3;
  const snout='<ellipse cx="'+sx.toFixed(1)+'" cy="'+sy.toFixed(1)+'" rx="5" ry="3.5" fill="'+tc+'" opacity="0.65"/>'
    +'<circle cx="'+(sx-1.5).toFixed(1)+'" cy="'+(sy-0.5).toFixed(1)+'" r="1.2" fill="#1a1a2e"/>'
    +'<circle cx="'+(sx+1.5).toFixed(1)+'" cy="'+(sy-0.5).toFixed(1)+'" r="1.2" fill="#1a1a2e"/>';
  const marks = v===0
    ? '<line x1="'+(50-8)+'" y1="'+(by-3)+'" x2="'+(50-2)+'" y2="'+(by-8)+'" stroke="#00000044" stroke-width="1.5"/><line x1="'+(50-4)+'" y1="'+(by)+'" x2="'+(50+2)+'" y2="'+(by-5)+'" stroke="#00000044" stroke-width="1.5"/>'
    : v===1 ? '<circle cx="'+(50-5)+'" cy="'+(by-5)+'" r="3" fill="#00000033"/><circle cx="'+(50+6)+'" cy="'+(by-9)+'" r="2.2" fill="#00000033"/>' : '';
  return ears
    +'<ellipse cx="50" cy="'+by.toFixed(1)+'" rx="'+bw.toFixed(1)+'" ry="'+bh.toFixed(1)+'" fill="'+tc+'"/>'
    +'<circle cx="'+hx.toFixed(1)+'" cy="'+hy.toFixed(1)+'" r="'+hr.toFixed(1)+'" fill="'+tc+'"/>'
    +snout+marks+tail+legs
    +_artEyes(tc, rf, ri, hx, hy-2);
}

// DRAGON — winged reptile
function _cDragon(tc, v, rf, ri) {
  const nx=50+rf(23)*6-3, ny=22+rf(29)*5;
  const bx=50, by=60, bw=18+rf(37)*5, bh=12+rf(41)*3;
  const hx=nx+rf(43)*4-2, hy=ny-rf(47)*3;
  const hr=9+rf(53)*2.5;
  const wSpan=26+rf(59)*10, wH=18+rf(61)*8;
  const wing1='<path d="M'+(bx-8)+','+(by-4)+' Q'+(bx-wSpan)+','+(by-wH)+' '+(bx-wSpan+10)+','+(by-wH-8)+' Q'+(bx-wSpan*0.5)+','+(by-wH+4)+' '+(bx-6)+','+(by-10)+'Z" fill="'+tc+'" opacity="0.82"/>';
  const wing2='<path d="M'+(bx+8)+','+(by-4)+' Q'+(bx+wSpan)+','+(by-wH)+' '+(bx+wSpan-10)+','+(by-wH-8)+' Q'+(bx+wSpan*0.5)+','+(by-wH+4)+' '+(bx+6)+','+(by-10)+'Z" fill="'+tc+'" opacity="0.82"/>';
  const neck='<path d="M'+bx+','+(by-bh/2)+' Q'+(nx+2)+','+(hy+20)+' '+hx+','+hy+'" stroke="'+tc+'" stroke-width="10" fill="none" stroke-linecap="round"/>';
  const hornL=v<2?'<line x1="'+(hx-5)+'" y1="'+(hy-hr)+'" x2="'+(hx-9)+'" y2="'+(hy-hr-10)+'" stroke="'+tc+'" stroke-width="2.5" stroke-linecap="round"/>':'<path d="M'+(hx-5)+','+(hy-hr)+' Q'+(hx-12)+','+(hy-hr-7)+' '+(hx-7)+','+(hy-hr-11)+'" stroke="'+tc+'" stroke-width="2.5" fill="none"/>';
  const hornR=v<2?'<line x1="'+(hx+5)+'" y1="'+(hy-hr)+'" x2="'+(hx+9)+'" y2="'+(hy-hr-10)+'" stroke="'+tc+'" stroke-width="2.5" stroke-linecap="round"/>':'<path d="M'+(hx+5)+','+(hy-hr)+' Q'+(hx+12)+','+(hy-hr-7)+' '+(hx+7)+','+(hy-hr-11)+'" stroke="'+tc+'" stroke-width="2.5" fill="none"/>';
  const tail='<path d="M'+(bx+bw)+','+(by)+' Q'+(bx+bw+15)+','+(by+5)+' '+(bx+bw+18)+','+(by-8)+'" stroke="'+tc+'" stroke-width="4" fill="none" stroke-linecap="round"/>';
  const legs='<rect x="'+(bx-12)+'" y="'+(by+bh/2)+'" width="6" height="10" fill="'+tc+'" rx="3"/><rect x="'+(bx+6)+'" y="'+(by+bh/2)+'" width="6" height="10" fill="'+tc+'" rx="3"/>';
  return wing1+wing2+neck
    +'<ellipse cx="'+bx+'" cy="'+by.toFixed(1)+'" rx="'+bw.toFixed(1)+'" ry="'+bh.toFixed(1)+'" fill="'+tc+'"/>'
    +'<circle cx="'+hx.toFixed(1)+'" cy="'+hy.toFixed(1)+'" r="'+hr.toFixed(1)+'" fill="'+tc+'"/>'
    +hornL+hornR+tail+legs
    +_artEyes(tc, rf, ri, hx, hy);
}

// GOLEM — stone humanoid
function _cGolem(tc, v, rf, ri) {
  const bx=50, by=52, bw=20+rf(23)*5, bh=18+rf(29)*4;
  const hx=50+rf(37)*4-2, hy=28+rf(41)*4;
  const hS=12+rf(47)*3;
  const armW=7+rf(53)*2, armH=18+rf(59)*4;
  const legW=8+rf(61)*2, legH=14+rf(67)*3;
  // Core gem
  const coreR=5+rf(71)*3;
  const core='<circle cx="'+bx+'" cy="'+by+'" r="'+coreR.toFixed(1)+'" fill="'+tc+'" opacity="0.9"/>'
    +'<circle cx="'+bx+'" cy="'+by+'" r="'+(coreR*0.5).toFixed(1)+'" fill="white" opacity="0.7"/>';
  // Cracks (2 variants)
  const cracks = v<2
    ? '<line x1="'+(bx-10)+'" y1="'+(by-8)+'" x2="'+(bx-3)+'" y2="'+(by+5)+'" stroke="#1a1a2e" stroke-width="1.5" opacity="0.5"/><line x1="'+(bx+6)+'" y1="'+(by-6)+'" x2="'+(bx+2)+'" y2="'+(by+8)+'" stroke="#1a1a2e" stroke-width="1.2" opacity="0.4"/>'
    : '<path d="M'+(bx-8)+','+(by-5)+' l3,4 -2,5 4,3" stroke="#1a1a2e" stroke-width="1.2" fill="none" opacity="0.5"/>';
  // Rune marks on head
  const rune = v%2===0
    ? '<line x1="'+(hx-5)+'" y1="'+hy+'" x2="'+(hx+5)+'" y2="'+hy+'" stroke="'+tc+'" stroke-width="1.5" opacity="0.6"/>'
    : '<circle cx="'+hx+'" cy="'+(hy+4)+'" r="2.5" fill="none" stroke="'+tc+'" stroke-width="1.2" opacity="0.7"/>';
  return '<rect x="'+(bx-armW-bw)+'" y="'+(by-bh/2+2)+'" width="'+armW+'" height="'+armH+'" fill="'+tc+'" rx="3"/>'
    +'<rect x="'+(bx+bw)+'" y="'+(by-bh/2+2)+'" width="'+armW+'" height="'+armH+'" fill="'+tc+'" rx="3"/>'
    +'<rect x="'+(bx-legW*0.7)+'" y="'+(by+bh/2)+'" width="'+legW+'" height="'+legH+'" fill="'+tc+'" rx="3"/>'
    +'<rect x="'+(bx-legW*0.3+legW*0.4)+'" y="'+(by+bh/2)+'" width="'+legW+'" height="'+legH+'" fill="'+tc+'" rx="3"/>'
    +'<rect x="'+(bx-bw)+'" y="'+(by-bh/2)+'" width="'+(bw*2)+'" height="'+bh+'" fill="'+tc+'" rx="4"/>'
    +'<rect x="'+(hx-hS)+'" y="'+(hy-hS)+'" width="'+(hS*2)+'" height="'+(hS*2)+'" fill="'+tc+'" rx="4"/>'
    +core+cracks+rune
    +_artEyes(tc, rf, ri, hx, hy+2);
}

// SPRITE — fairy / fey creature
function _cSprite(tc, v, rf, ri) {
  const bx=50, by=54, bR=8+rf(23)*3;
  const hx=50+rf(37)*3-1.5, hy=38+rf(41)*3;
  const hr=7+rf(47)*2;
  const wW=20+rf(53)*10, wH=16+rf(59)*8;
  const wOp=(0.55+rf(61)*0.25).toFixed(2);
  // 4 wings (butterfly style)
  const wings = v<2
    ? '<ellipse cx="'+(bx-wW*0.55)+'" cy="'+(by-4)+'" rx="'+(wW*0.55)+'" ry="'+(wH*0.6)+'" fill="'+tc+'" opacity="'+wOp+'"/>'
      +'<ellipse cx="'+(bx+wW*0.55)+'" cy="'+(by-4)+'" rx="'+(wW*0.55)+'" ry="'+(wH*0.6)+'" fill="'+tc+'" opacity="'+wOp+'"/>'
      +'<ellipse cx="'+(bx-wW*0.35)+'" cy="'+(by+6)+'" rx="'+(wW*0.3)+'" ry="'+(wH*0.4)+'" fill="'+tc+'" opacity="'+(parseFloat(wOp)*0.7).toFixed(2)+'"/>'
      +'<ellipse cx="'+(bx+wW*0.35)+'" cy="'+(by+6)+'" rx="'+(wW*0.3)+'" ry="'+(wH*0.4)+'" fill="'+tc+'" opacity="'+(parseFloat(wOp)*0.7).toFixed(2)+'"/>'
    : '<path d="M'+(bx-2)+','+(by-4)+' Q'+(bx-wW)+','+(by-wH)+' '+(bx-wW+4)+','+(by-wH+12)+' Q'+(bx-8)+','+(by-4)+' '+(bx-2)+','+(by-4)+'Z" fill="'+tc+'" opacity="'+wOp+'"/>'
      +'<path d="M'+(bx+2)+','+(by-4)+' Q'+(bx+wW)+','+(by-wH)+' '+(bx+wW-4)+','+(by-wH+12)+' Q'+(bx+8)+','+(by-4)+' '+(bx+2)+','+(by-4)+'Z" fill="'+tc+'" opacity="'+wOp+'"/>';
  // Antennae
  const ant='<line x1="'+(hx-3)+'" y1="'+(hy-hr)+'" x2="'+(hx-7)+'" y2="'+(hy-hr-9)+'" stroke="'+tc+'" stroke-width="1.2"/>'
    +'<circle cx="'+(hx-7)+'" cy="'+(hy-hr-9)+'" r="1.5" fill="'+tc+'"/>'
    +'<line x1="'+(hx+3)+'" y1="'+(hy-hr)+'" x2="'+(hx+7)+'" y2="'+(hy-hr-9)+'" stroke="'+tc+'" stroke-width="1.2"/>'
    +'<circle cx="'+(hx+7)+'" cy="'+(hy-hr-9)+'" r="1.5" fill="'+tc+'"/>';
  // Sparkles
  const sparks=[2,3,4,5].map((m,i)=>{const sx=(bx-20+rf(m*11)*40).toFixed(1),sy2=(by-20+rf(m*13)*30).toFixed(1);return '<circle cx="'+sx+'" cy="'+sy2+'" r="1.2" fill="'+tc+'" opacity="'+(0.4+rf(m*17)*0.4).toFixed(2)+'"/>';}).join('');
  return wings
    +'<ellipse cx="'+bx+'" cy="'+by+'" rx="'+bR.toFixed(1)+'" ry="'+(bR*1.3).toFixed(1)+'" fill="'+tc+'"/>'
    +'<circle cx="'+hx.toFixed(1)+'" cy="'+hy.toFixed(1)+'" r="'+hr.toFixed(1)+'" fill="'+tc+'"/>'
    +ant+sparks
    +_artEyes(tc, rf, ri, hx, hy-1);
}

// DEMON — horned demonic figure
function _cDemon(tc, v, rf, ri) {
  const bx=50, by=55, bw=14+rf(23)*4, bh=16+rf(29)*4;
  const hx=50+rf(37)*3-1.5, hy=32+rf(41)*4, hr=10+rf(47)*2.5;
  const wW=22+rf(53)*8, wH=20+rf(59)*7;
  // Bat wings
  const wings='<path d="M'+(bx-6)+','+(by-bh/2+2)+' Q'+(bx-wW)+','+(by-wH)+' '+(bx-wW+8)+','+(by-wH-6)+' Q'+(bx-wW*0.4)+','+(by-wH+8)+' '+(bx-6)+','+(by-4)+'Z" fill="'+tc+'" opacity="0.78"/>'
    +'<path d="M'+(bx+6)+','+(by-bh/2+2)+' Q'+(bx+wW)+','+(by-wH)+' '+(bx+wW-8)+','+(by-wH-6)+' Q'+(bx+wW*0.4)+','+(by-wH+8)+' '+(bx+6)+','+(by-4)+'Z" fill="'+tc+'" opacity="0.78"/>';
  // Horns — 4 variants
  const horns = v===0
    ? '<line x1="'+(hx-4)+'" y1="'+(hy-hr)+'" x2="'+(hx-8)+'" y2="'+(hy-hr-12)+'" stroke="'+tc+'" stroke-width="3" stroke-linecap="round"/><line x1="'+(hx+4)+'" y1="'+(hy-hr)+'" x2="'+(hx+8)+'" y2="'+(hy-hr-12)+'" stroke="'+tc+'" stroke-width="3" stroke-linecap="round"/>'
    : v===1
    ? '<path d="M'+(hx-5)+','+(hy-hr)+' Q'+(hx-14)+','+(hy-hr-6)+' '+(hx-8)+','+(hy-hr-14)+'" stroke="'+tc+'" stroke-width="3" fill="none"/><path d="M'+(hx+5)+','+(hy-hr)+' Q'+(hx+14)+','+(hy-hr-6)+' '+(hx+8)+','+(hy-hr-14)+'" stroke="'+tc+'" stroke-width="3" fill="none"/>'
    : v===2
    ? '<polygon points="'+(hx-5)+','+(hy-hr)+' '+(hx-9)+','+(hy-hr-14)+' '+(hx-1)+','+(hy-hr-2)+'" fill="'+tc+'"/><polygon points="'+(hx+5)+','+(hy-hr)+' '+(hx+9)+','+(hy-hr-14)+' '+(hx+1)+','+(hy-hr-2)+'" fill="'+tc+'"/>'
    : '<line x1="'+(hx-3)+'" y1="'+(hy-hr)+'" x2="'+(hx-6)+'" y2="'+(hy-hr-8)+'" stroke="'+tc+'" stroke-width="2.5"/><line x1="'+(hx+3)+'" y1="'+(hy-hr)+'" x2="'+(hx+6)+'" y2="'+(hy-hr-8)+'" stroke="'+tc+'" stroke-width="2.5"/><line x1="'+(hx-8)+'" y1="'+(hy-hr+2)+'" x2="'+(hx-12)+'" y2="'+(hy-hr-5)+'" stroke="'+tc+'" stroke-width="2"/><line x1="'+(hx+8)+'" y1="'+(hy-hr+2)+'" x2="'+(hx+12)+'" y2="'+(hy-hr-5)+'" stroke="'+tc+'" stroke-width="2"/>';
  const tail='<path d="M'+bx+','+(by+bh/2)+' Q'+(bx+16)+','+(by+bh/2+8)+' '+(bx+10)+','+(by+bh/2+16)+' Q'+(bx+4)+','+(by+bh/2+18)+' '+(bx+2)+','+(by+bh/2+14)+'" stroke="'+tc+'" stroke-width="3" fill="none" stroke-linecap="round"/>'
    +'<polygon points="'+(bx+2)+','+(by+bh/2+14)+' '+(bx-2)+','+(by+bh/2+18)+' '+(bx+6)+','+(by+bh/2+18)+'" fill="'+tc+'"/>';
  const legs='<rect x="'+(bx-10)+'" y="'+(by+bh/2)+'" width="6" height="12" fill="'+tc+'" rx="3"/><rect x="'+(bx+4)+'" y="'+(by+bh/2)+'" width="6" height="12" fill="'+tc+'" rx="3"/>';
  return wings
    +'<ellipse cx="'+bx+'" cy="'+by+'" rx="'+bw.toFixed(1)+'" ry="'+bh.toFixed(1)+'" fill="'+tc+'"/>'
    +'<circle cx="'+hx.toFixed(1)+'" cy="'+hy.toFixed(1)+'" r="'+hr.toFixed(1)+'" fill="'+tc+'"/>'
    +horns+tail+legs
    +_artEyes(tc, rf, ri, hx, hy+1);
}

// ANGEL — radiant winged figure
function _cAngel(tc, v, rf, ri) {
  const bx=50, by=57, bw=10+rf(23)*3, bh=20+rf(29)*4;
  const hx=50+rf(37)*2-1, hy=29+rf(41)*3, hr=9+rf(47)*2;
  const wW=28+rf(53)*10, wH=24+rf(59)*8;
  const wOp=(0.7+rf(61)*0.2).toFixed(2);
  // Feathered wings
  const wing1='<path d="M'+(bx-4)+','+(by-bh/2+2)+' Q'+(bx-wW)+','+(by-wH)+' '+(bx-wW+6)+','+(by-wH-10)+' Q'+(bx-wW*0.6)+','+(by-wH+6)+' '+(bx-8)+','+(by-8)+' Q'+(bx-wW*0.3)+','+(by-wH*0.3)+' '+(bx-4)+','+(by-bh/2+2)+'Z" fill="white" opacity="'+wOp+'"/>';
  const wing2='<path d="M'+(bx+4)+','+(by-bh/2+2)+' Q'+(bx+wW)+','+(by-wH)+' '+(bx+wW-6)+','+(by-wH-10)+' Q'+(bx+wW*0.6)+','+(by-wH+6)+' '+(bx+8)+','+(by-8)+' Q'+(bx+wW*0.3)+','+(by-wH*0.3)+' '+(bx+4)+','+(by-bh/2+2)+'Z" fill="white" opacity="'+wOp+'"/>';
  // Wing detail lines
  const wLines=[0.3,0.55,0.75].map(f=>'<line x1="'+(bx-4)+'" y1="'+(by-bh/2+2)+'" x2="'+(bx-wW*f).toFixed(0)+'" y2="'+(by-wH*f*0.8).toFixed(0)+'" stroke="'+tc+'" stroke-width="1" opacity="0.4"/>').join('')
    +[0.3,0.55,0.75].map(f=>'<line x1="'+(bx+4)+'" y1="'+(by-bh/2+2)+'" x2="'+(bx+wW*f).toFixed(0)+'" y2="'+(by-wH*f*0.8).toFixed(0)+'" stroke="'+tc+'" stroke-width="1" opacity="0.4"/>').join('');
  // Halo
  const haloR=10+rf(67)*4;
  const halo='<ellipse cx="'+hx+'" cy="'+(hy-hr-4)+'" rx="'+haloR.toFixed(1)+'" ry="'+(haloR*0.25).toFixed(1)+'" fill="none" stroke="'+tc+'" stroke-width="2.5" opacity="0.9"/>';
  // Robe (dress shape at bottom)
  const robe='<path d="M'+(bx-bw)+','+(by+bh/2)+' Q'+(bx-bw-8)+','+(by+bh/2+14)+' '+bx+','+(by+bh/2+16)+' Q'+(bx+bw+8)+','+(by+bh/2+14)+' '+(bx+bw)+','+(by+bh/2)+'Z" fill="white" opacity="0.5"/>';
  return wing1+wing2+wLines
    +'<ellipse cx="'+bx+'" cy="'+by+'" rx="'+bw.toFixed(1)+'" ry="'+bh.toFixed(1)+'" fill="white" opacity="0.8"/>'
    +'<circle cx="'+hx.toFixed(1)+'" cy="'+hy.toFixed(1)+'" r="'+hr.toFixed(1)+'" fill="white" opacity="0.9"/>'
    +halo+robe
    +_artEyes(tc, rf, ri, hx, hy+1);
}

// UNDEAD — skeleton / revenant
function _cUndead(tc, v, rf, ri) {
  const bx=50, by=54;
  const hx=50+rf(23)*4-2, hy=28+rf(29)*4, hr=10+rf(37)*2.5;
  // Skull details
  const jaw='<path d="M'+(hx-7)+','+(hy+hr-2)+' Q'+hx+','+(hy+hr+6)+' '+(hx+7)+','+(hy+hr-2)+'" stroke="'+tc+'" stroke-width="2" fill="none"/>';
  const teeth=[0,1,2,3].map(i=>'<rect x="'+(hx-6+i*4)+'" y="'+(hy+hr)+'" width="2.5" height="4" fill="'+tc+'" rx="1"/>').join('');
  // Eye sockets (hollow)
  const sW=4+rf(41)*2, sH=5+rf(43)*2;
  const skullEye='<ellipse cx="'+(hx-5)+'" cy="'+(hy-1)+'" rx="'+sW.toFixed(1)+'" ry="'+sH.toFixed(1)+'" fill="#1a1a2e"/>'
    +'<ellipse cx="'+(hx+5)+'" cy="'+(hy-1)+'" rx="'+sW.toFixed(1)+'" ry="'+sH.toFixed(1)+'" fill="#1a1a2e"/>'
    +'<circle cx="'+(hx-5)+'" cy="'+(hy-1)+'" r="1.5" fill="'+tc+'" opacity="0.85"/>'
    +'<circle cx="'+(hx+5)+'" cy="'+(hy-1)+'" r="1.5" fill="'+tc+'" opacity="0.85"/>';
  // Ribcage
  const ribs=[0,1,2].map(i=>'<path d="M'+(bx-2)+','+(by-8+i*6)+' Q'+(bx-14)+','+(by-5+i*6)+' '+(bx-12)+','+(by+i*6)+'" stroke="'+tc+'" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M'+(bx+2)+','+(by-8+i*6)+' Q'+(bx+14)+','+(by-5+i*6)+' '+(bx+12)+','+(by+i*6)+'" stroke="'+tc+'" stroke-width="2" fill="none" stroke-linecap="round"/>').join('');
  // Spine
  const spine='<line x1="'+bx+'" y1="'+(hy+hr)+'" x2="'+bx+'" y2="'+(by+12)+'" stroke="'+tc+'" stroke-width="3" stroke-linecap="round"/>';
  // Arms (bone)
  const arms='<line x1="'+(bx-14)+'" y1="'+(by-8)+'" x2="'+(bx-20)+'" y2="'+(by+10)+'" stroke="'+tc+'" stroke-width="2.5" stroke-linecap="round"/><line x1="'+(bx+14)+'" y1="'+(by-8)+'" x2="'+(bx+20)+'" y2="'+(by+10)+'" stroke="'+tc+'" stroke-width="2.5" stroke-linecap="round"/>';
  // Legs
  const legs='<line x1="'+(bx-5)+'" y1="'+(by+12)+'" x2="'+(bx-6)+'" y2="'+(by+26)+'" stroke="'+tc+'" stroke-width="2.5" stroke-linecap="round"/><line x1="'+(bx+5)+'" y1="'+(by+12)+'" x2="'+(bx+6)+'" y2="'+(by+26)+'" stroke="'+tc+'" stroke-width="2.5" stroke-linecap="round"/>';
  return '<circle cx="'+hx.toFixed(1)+'" cy="'+hy.toFixed(1)+'" r="'+hr.toFixed(1)+'" fill="'+tc+'" opacity="0.85"/>'
    +jaw+teeth+skullEye+spine+ribs+arms+legs;
}

// ELEMENTAL — swirling energy being
function _cElemental(tc, v, rf, ri) {
  const bx=50, by=50, cR=10+rf(23)*5;
  // Core orb
  const core='<circle cx="'+bx+'" cy="'+by+'" r="'+cR.toFixed(1)+'" fill="'+tc+'" opacity="0.9"/>'
    +'<circle cx="'+bx+'" cy="'+by+'" r="'+(cR*0.5).toFixed(1)+'" fill="white" opacity="0.5"/>';
  // Energy tendrils — unique positions
  const tendrils=[3,7,11,13,17,19,23].map((m,i)=>{
    const a=rf(m)*Math.PI*2;
    const l=18+rf(m+2)*14;
    const mx=bx+Math.cos(a+0.6)*l*0.5, my=by+Math.sin(a+0.6)*l*0.5;
    const ex=bx+Math.cos(a)*l, ey=by+Math.sin(a)*l;
    const w=(1.5+rf(m+4)*2.5).toFixed(1);
    const op=(0.4+rf(m+6)*0.5).toFixed(2);
    return '<path d="M'+bx+','+by+' Q'+mx.toFixed(1)+','+my.toFixed(1)+' '+ex.toFixed(1)+','+ey.toFixed(1)+'" stroke="'+tc+'" stroke-width="'+w+'" fill="none" opacity="'+op+'" stroke-linecap="round"/>';
  }).join('');
  // Orbiting particles
  const particles=[3,7,11,13,17,19].map((m,i)=>{
    const a=rf(m)*Math.PI*2, d=cR+8+rf(m+2)*10;
    const px=(bx+Math.cos(a)*d).toFixed(1), py=(by+Math.sin(a)*d).toFixed(1);
    const ps=(1.5+rf(m+4)*2.5).toFixed(1);
    return '<circle cx="'+px+'" cy="'+py+'" r="'+ps+'" fill="'+tc+'" opacity="'+(0.5+rf(m+6)*0.4).toFixed(2)+'"/>';
  }).join('');
  return tendrils+particles+core;
}

// CONSTRUCT — mechanical automaton
function _cConstruct(tc, v, rf, ri) {
  const bx=50, by=53, bw=14+rf(23)*4, bh=16+rf(29)*3;
  const hx=50+rf(37)*3-1.5, hy=30+rf(41)*3;
  const hW=12+rf(47)*3, hH=11+rf(53)*2;
  // Head — rectangular
  const head='<rect x="'+(hx-hW)+'" y="'+(hy-hH)+'" width="'+(hW*2)+'" height="'+(hH*2)+'" fill="'+tc+'" rx="3"/>';
  // Single large eye (monocle) or dual eyes
  const eyePart = v<2
    ? '<circle cx="'+hx+'" cy="'+hy+'" r="'+(5+rf(59)*3).toFixed(1)+'" fill="#1a1a2e"/><circle cx="'+hx+'" cy="'+hy+'" r="'+(2.5+rf(61)*1.5).toFixed(1)+'" fill="'+tc+'"/>'
    : _artEyes(tc, rf, ri, hx, hy);
  // Antenna
  const ant=v%2===0
    ? '<line x1="'+hx+'" y1="'+(hy-hH)+'" x2="'+hx+'" y2="'+(hy-hH-10)+'" stroke="'+tc+'" stroke-width="2"/><circle cx="'+hx+'" cy="'+(hy-hH-10)+'" r="2.5" fill="'+tc+'"/>'
    : '<line x1="'+(hx-3)+'" y1="'+(hy-hH)+'" x2="'+(hx-5)+'" y2="'+(hy-hH-8)+'" stroke="'+tc+'" stroke-width="1.5"/><line x1="'+(hx+3)+'" y1="'+(hy-hH)+'" x2="'+(hx+5)+'" y2="'+(hy-hH-8)+'" stroke="'+tc+'" stroke-width="1.5"/>';
  // Body with panel lines
  const panels='<line x1="'+(bx-bw)+'" y1="'+by+'" x2="'+(bx+bw)+'" y2="'+by+'" stroke="#1a1a2e" stroke-width="1" opacity="0.4"/><line x1="'+bx+'" y1="'+(by-bh/2)+'" x2="'+bx+'" y2="'+(by+bh/2)+'" stroke="#1a1a2e" stroke-width="1" opacity="0.3"/>';
  // Joints
  const joints='<circle cx="'+(bx-bw-8)+'" cy="'+(by-bh/4)+'" r="3.5" fill="'+tc+'" stroke="#1a1a2e" stroke-width="1"/><circle cx="'+(bx+bw+8)+'" cy="'+(by-bh/4)+'" r="3.5" fill="'+tc+'" stroke="#1a1a2e" stroke-width="1"/>';
  // Arms
  const arms='<rect x="'+(bx-bw-14)+'" y="'+(by-bh/4-4)+'" width="14" height="8" fill="'+tc+'" rx="3"/><rect x="'+(bx+bw)+'" y="'+(by-bh/4-4)+'" width="14" height="8" fill="'+tc+'" rx="3"/>';
  // Legs
  const legs='<rect x="'+(bx-10)+'" y="'+(by+bh/2)+'" width="7" height="14" fill="'+tc+'" rx="3"/><rect x="'+(bx+3)+'" y="'+(by+bh/2)+'" width="7" height="14" fill="'+tc+'" rx="3"/>';
  // Gear
  const gR=4+rf(67)*2, gX=bx+bw-gR-2, gY=by-bh/4;
  const gearTeeth=Array.from({length:6},(_,i)=>{const a=i*60*Math.PI/180;return '<rect x="'+(gX+gR*Math.cos(a)-2).toFixed(0)+'" y="'+(gY+gR*Math.sin(a)-2).toFixed(0)+'" width="4" height="4" fill="'+tc+'"/>';}).join('');
  const gear='<circle cx="'+gX.toFixed(0)+'" cy="'+gY.toFixed(0)+'" r="'+gR.toFixed(0)+'" fill="'+tc+'" stroke="#1a1a2e" stroke-width="1"/>'+gearTeeth;
  return '<rect x="'+(bx-bw)+'" y="'+(by-bh/2)+'" width="'+(bw*2)+'" height="'+bh+'" fill="'+tc+'" rx="3"/>'
    +panels+head+eyePart+ant+joints+arms+legs+gear;
}

// TITAN — colossal warrior
function _cTitan(tc, v, rf, ri) {
  const bx=50, by=56, bw=22+rf(23)*6, bh=18+rf(29)*4;
  const hx=50+rf(37)*3-1.5, hy=28+rf(41)*3, hr=9+rf(47)*2;
  // Crown/helmet varies
  const crown = v===0
    ? '<polygon points="'+(hx-8)+','+(hy-hr)+' '+(hx-6)+','+(hy-hr-10)+' '+(hx-1)+','+(hy-hr-6)+' '+hx+','+(hy-hr-12)+' '+(hx+1)+','+(hy-hr-6)+' '+(hx+6)+','+(hy-hr-10)+' '+(hx+8)+','+(hy-hr)+'" fill="'+tc+'"/>'
    : v===1
    ? '<path d="M'+(hx-8)+','+(hy-hr)+' Q'+(hx-4)+','+(hy-hr-14)+' '+hx+','+(hy-hr-12)+' Q'+(hx+4)+','+(hy-hr-14)+' '+(hx+8)+','+(hy-hr)+'" fill="'+tc+'"/>'
    : '<rect x="'+(hx-8)+'" y="'+(hy-hr-10)+'" width="16" height="10" fill="'+tc+'" rx="2"/>';
  // Massive shoulders
  const sW=12+rf(53)*4, sH=8+rf(59)*3;
  const shoulders='<ellipse cx="'+(bx-bw+2)+'" cy="'+(by-bh/2+4)+'" rx="'+sW.toFixed(1)+'" ry="'+sH.toFixed(1)+'" fill="'+tc+'"/>'
    +'<ellipse cx="'+(bx+bw-2)+'" cy="'+(by-bh/2+4)+'" rx="'+sW.toFixed(1)+'" ry="'+sH.toFixed(1)+'" fill="'+tc+'"/>';
  // Thick arms
  const armW=9+rf(61)*3, armH=20+rf(67)*5;
  const arms='<rect x="'+(bx-bw-armW+4)+'" y="'+(by-bh/2+8)+'" width="'+armW+'" height="'+armH+'" fill="'+tc+'" rx="4"/>'
    +'<rect x="'+(bx+bw-4)+'" y="'+(by-bh/2+8)+'" width="'+armW+'" height="'+armH+'" fill="'+tc+'" rx="4"/>';
  // Fists
  const fist='<ellipse cx="'+(bx-bw-armW/2+4)+'" cy="'+(by-bh/2+8+armH)+'" rx="'+(armW*0.6).toFixed(1)+'" ry="5" fill="'+tc+'"/>'
    +'<ellipse cx="'+(bx+bw+armW/2-4)+'" cy="'+(by-bh/2+8+armH)+'" rx="'+(armW*0.6).toFixed(1)+'" ry="5" fill="'+tc+'"/>';
  // Thick legs
  const legW=9+rf(71)*3;
  const legs='<rect x="'+(bx-12)+'" y="'+(by+bh/2)+'" width="'+legW+'" height="16" fill="'+tc+'" rx="4"/>'
    +'<rect x="'+(bx+3)+'" y="'+(by+bh/2)+'" width="'+legW+'" height="16" fill="'+tc+'" rx="4"/>';
  // Armor plates on body
  const armor='<ellipse cx="'+bx+'" cy="'+(by-2)+'" rx="'+(bw*0.55).toFixed(1)+'" ry="5" fill="'+tc+'" opacity="0.5"/>';
  return shoulders
    +'<ellipse cx="'+bx+'" cy="'+by+'" rx="'+bw.toFixed(1)+'" ry="'+bh.toFixed(1)+'" fill="'+tc+'"/>'
    +'<circle cx="'+hx.toFixed(1)+'" cy="'+hy.toFixed(1)+'" r="'+hr.toFixed(1)+'" fill="'+tc+'"/>'
    +crown+arms+fist+legs+armor
    +_artEyes(tc, rf, ri, hx, hy+1);
}

function _artRarityFx(rarity, tc, rf) {
  if (!rarity || rarity === 'Common') return '';
  const r = rarity.toLowerCase().replace('_','');
  if (r === 'uncommon') return '<rect width="100" height="90" fill="'+tc+'" opacity="0.04"/>';
  if (r === 'rare') return '<rect width="100" height="90" fill="none" stroke="'+tc+'" stroke-width="1.5" opacity="0.25"/>';
  if (r === 'ultrarare') return '<rect width="100" height="90" fill="none" stroke="'+tc+'" stroke-width="2" opacity="0.35"/>'
    +'<circle cx="10" cy="10" r="3" fill="'+tc+'" opacity="0.4"/><circle cx="90" cy="80" r="3" fill="'+tc+'" opacity="0.4"/>';
  if (r === 'secretrare' || r === 'fullart' || r === 'parallel')
    return '<rect width="100" height="90" fill="none" stroke="'+tc+'" stroke-width="2.5" opacity="0.45"/>'
      +'<line x1="0" y1="0" x2="100" y2="90" stroke="'+tc+'" stroke-width="0.8" opacity="0.12"/>'
      +'<line x1="100" y1="0" x2="0" y2="90" stroke="'+tc+'" stroke-width="0.8" opacity="0.12"/>';
  if (r === 'numbered' || r === 'prism' || r === 'mythic')
    return '<rect width="100" height="90" fill="none" stroke="'+tc+'" stroke-width="3" opacity="0.55"/>'
      +'<rect x="3" y="3" width="94" height="84" fill="none" stroke="white" stroke-width="0.8" opacity="0.2"/>'
      +'<circle cx="50" cy="45" r="40" fill="none" stroke="'+tc+'" stroke-width="1" opacity="0.2"/>'
      +'<circle cx="5" cy="5" r="3" fill="'+tc+'" opacity="0.7"/><circle cx="95" cy="5" r="3" fill="'+tc+'" opacity="0.7"/>'
      +'<circle cx="5" cy="85" r="3" fill="'+tc+'" opacity="0.7"/><circle cx="95" cy="85" r="3" fill="'+tc+'" opacity="0.7"/>';
  return '';
}

// Keep legacy cardTypeSVG for places that still call it with just a type string (promo shop preview, etc.)
function cardTypeSVG(type) {
  const t = (type || 'Fire').toLowerCase();
  const rays = Array.from({length:8},(_,i)=>{const a=i*45*Math.PI/180;return '<line x1="'+(50+22*Math.cos(a)).toFixed(1)+'" y1="'+(44+22*Math.sin(a)).toFixed(1)+'" x2="'+(50+34*Math.cos(a)).toFixed(1)+'" y2="'+(44+34*Math.sin(a)).toFixed(1)+'" stroke="#e6b800" stroke-width="4" stroke-linecap="round"/>';}).join('');
  const gearTeeth = Array.from({length:6},(_,i)=>{const a=i*60*Math.PI/180;return '<rect x="'+(50+20*Math.cos(a)-4).toFixed(1)+'" y="'+(44+20*Math.sin(a)-4).toFixed(1)+'" width="8" height="8" fill="#566573"/>';}).join('');
  const chaosSpikes = Array.from({length:8},(_,i)=>{const a=i*45*Math.PI/180;const ox=(50+30*Math.cos(a)).toFixed(1);const oy=(44+30*Math.sin(a)).toFixed(1);const mx=(50+12*Math.cos(a+0.4)).toFixed(1);const my=(44+12*Math.sin(a+0.4)).toFixed(1);return '<polygon points="50,44 '+ox+','+oy+' '+mx+','+my+'" fill="#d63031" opacity="0.85"/>';}).join('');
  const svgs = {
    fire:    `<svg viewBox="0 0 100 90" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="gf"><stop offset="0%" stop-color="#f39c12"/><stop offset="100%" stop-color="#e74c3c"/></radialGradient></defs><ellipse cx="50" cy="80" rx="18" ry="5" fill="#e74c3c" opacity="0.2"/><path d="M50,10C50,10 68,28 66,48C64,62 54,68 50,60C50,60 60,52 52,44C52,44 56,56 48,62C40,68 32,60 32,48C32,36 38,32 36,22C31,32 30,44 34,52C22,46 20,32 26,20C32,8 46,6 50,10Z" fill="url(#gf)"/><path d="M50,22C50,22 58,30 57,40C56,48 52,50 50,46C50,46 54,40 50,36C50,36 51,44 48,46C45,48 43,44 43,38C43,32 47,26 50,22Z" fill="#fff176" opacity="0.7"/></svg>`,
    water:   `<svg viewBox="0 0 100 90" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gw" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#74b9ff"/><stop offset="100%" stop-color="#2980b9"/></linearGradient></defs><path d="M50,12C50,12 68,36 68,54C68,66 60,74 50,74C40,74 32,66 32,54C32,36 50,12 50,12Z" fill="url(#gw)"/><ellipse cx="43" cy="44" rx="5" ry="9" fill="white" opacity="0.3" transform="rotate(-20,43,44)"/><path d="M8,56Q22,40 36,56Q50,72 64,56Q78,40 92,56" stroke="#3498db" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.5"/></svg>`,
    earth:   `<svg viewBox="0 0 100 90" xmlns="http://www.w3.org/2000/svg"><rect x="18" y="66" width="64" height="10" fill="#5a3e20" rx="2"/><polygon points="22,66 50,14 78,66" fill="#8e6b3e"/><polygon points="32,66 56,32 74,66" fill="#a07040"/><polygon points="18,66 38,44 62,66" fill="#6b4c28"/><path d="M18,56 Q30,48 42,54 Q54,60 66,52 Q76,46 82,52" stroke="#a08040" stroke-width="2" fill="none" opacity="0.5"/></svg>`,
    air:     `<svg viewBox="0 0 100 90" xmlns="http://www.w3.org/2000/svg"><path d="M15,32Q35,14 55,32Q75,50 55,60Q44,66 36,58" stroke="#7fb3d3" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M10,48Q32,30 52,48Q70,64 52,72Q42,78 34,70" stroke="#a8d8f0" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M22,64Q40,50 58,62Q72,72 62,78" stroke="#c5e8f7" stroke-width="3.5" fill="none" stroke-linecap="round"/></svg>`,
    shadow:  `<svg viewBox="0 0 100 90" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="44" r="28" fill="#1a1a2e"/><circle cx="63" cy="36" r="22" fill="#0a0a1a"/><circle cx="24" cy="26" r="4" fill="#9b59b6" opacity="0.9"/><circle cx="74" cy="20" r="2.5" fill="#8e44ad" opacity="0.7"/><circle cx="36" cy="16" r="2" fill="#9b59b6" opacity="0.6"/><circle cx="72" cy="58" r="1.8" fill="#8e44ad" opacity="0.8"/><circle cx="82" cy="38" r="1.5" fill="#6c3483" opacity="0.7"/></svg>`,
    light:   `<svg viewBox="0 0 100 90" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="44" r="20" fill="#f6e96a"/>${rays}<circle cx="50" cy="44" r="13" fill="#fffde7"/></svg>`,
    thunder: `<svg viewBox="0 0 100 90" xmlns="http://www.w3.org/2000/svg"><ellipse cx="50" cy="82" rx="14" ry="4" fill="#f1c40f" opacity="0.2"/><path d="M57,10L34,48H50L38,80L72,36H54Z" fill="#f1c40f" stroke="#e67e22" stroke-width="2" stroke-linejoin="round"/><path d="M57,10L50,28H58Z" fill="#fff176" opacity="0.6"/></svg>`,
    ice:     `<svg viewBox="0 0 100 90" xmlns="http://www.w3.org/2000/svg"><line x1="50" y1="10" x2="50" y2="80" stroke="#74b9ff" stroke-width="4.5" stroke-linecap="round"/><line x1="13" y1="27" x2="87" y2="63" stroke="#74b9ff" stroke-width="4.5" stroke-linecap="round"/><line x1="87" y1="27" x2="13" y2="63" stroke="#74b9ff" stroke-width="4.5" stroke-linecap="round"/><line x1="40" y1="10" x2="50" y2="22" stroke="#a8d8f0" stroke-width="2.5"/><line x1="60" y1="10" x2="50" y2="22" stroke="#a8d8f0" stroke-width="2.5"/><line x1="40" y1="80" x2="50" y2="68" stroke="#a8d8f0" stroke-width="2.5"/><line x1="60" y1="80" x2="50" y2="68" stroke="#a8d8f0" stroke-width="2.5"/><circle cx="50" cy="45" r="7" fill="#a8d8f0" opacity="0.8"/></svg>`,
    poison:  `<svg viewBox="0 0 100 90" xmlns="http://www.w3.org/2000/svg"><ellipse cx="50" cy="16" rx="10" ry="13" fill="#8e44ad"/><rect x="45" y="26" width="10" height="10" fill="#8e44ad"/><path d="M26,50 Q50,36 74,50 Q80,70 50,78 Q20,70 26,50Z" fill="#1e8449"/><circle cx="38" cy="52" r="6" fill="#27ae60"/><circle cx="62" cy="52" r="6" fill="#27ae60"/><rect x="41" y="58" width="18" height="14" rx="4" fill="#145a32"/><rect x="47" y="62" width="6" height="3" fill="#2ecc71" rx="1"/></svg>`,
    psychic: `<svg viewBox="0 0 100 90" xmlns="http://www.w3.org/2000/svg"><ellipse cx="50" cy="44" rx="34" ry="24" fill="#8e44ad" opacity="0.12" stroke="#9b59b6" stroke-width="1.5"/><path d="M18,44Q34,20 50,44Q66,68 82,44" stroke="#9b59b6" stroke-width="4" fill="none" stroke-linecap="round"/><ellipse cx="50" cy="44" rx="11" ry="16" fill="#c0392b" stroke="#922b21" stroke-width="1.5"/><ellipse cx="46" cy="40" rx="4" ry="5" fill="white" opacity="0.9"/><circle cx="47" cy="41" r="2.5" fill="#1a1a2e"/><line x1="28" y1="36" x2="18" y2="28" stroke="#9b59b6" stroke-width="2" opacity="0.6"/><line x1="72" y1="36" x2="82" y2="28" stroke="#9b59b6" stroke-width="2" opacity="0.6"/></svg>`,
    nature:  `<svg viewBox="0 0 100 90" xmlns="http://www.w3.org/2000/svg"><line x1="50" y1="14" x2="50" y2="78" stroke="#1e8449" stroke-width="3" stroke-linecap="round"/><path d="M50,72C50,72 28,60 26,42C24,26 36,12 50,12C64,12 76,26 74,42C72,60 50,72 50,72Z" fill="#27ae60" stroke="#1e8449" stroke-width="2"/><path d="M50,46Q36,38 28,28" stroke="#2ecc71" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M50,56Q64,48 72,38" stroke="#2ecc71" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M50,30Q38,28 32,20" stroke="#58d68d" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`,
    metal:   `<svg viewBox="0 0 100 90" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="44" r="26" fill="#808b96" stroke="#5d6d7e" stroke-width="2"/>${gearTeeth}<circle cx="50" cy="44" r="14" fill="#dfe6e9" stroke="#aab7b8" stroke-width="1.5"/><circle cx="50" cy="44" r="6" fill="#bdc3c7"/></svg>`,
    dragon:  `<svg viewBox="0 0 100 90" xmlns="http://www.w3.org/2000/svg"><path d="M50,20C50,20 38,14 30,22C26,28 30,16 38,12Z" fill="#e67e22"/><path d="M50,20C50,20 62,14 70,22C74,28 70,16 62,12Z" fill="#e67e22"/><path d="M50,18C50,18 70,22 72,40C74,58 62,70 50,70C38,70 26,58 28,40C30,22 50,18Z" fill="#d35400"/><circle cx="40" cy="40" r="6" fill="#f1c40f"/><circle cx="60" cy="40" r="6" fill="#f1c40f"/><circle cx="41" cy="40" r="3" fill="#1a1a2e"/><circle cx="61" cy="40" r="3" fill="#1a1a2e"/><path d="M38,56Q50,64 62,56" stroke="#c0392b" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`,
    cosmic:  `<svg viewBox="0 0 100 90" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="44" r="32" fill="#0a0e2a" opacity="0.7"/><path d="M50,44Q58,28 68,24Q60,38 70,44Q60,50 68,64Q58,60 50,44Z" fill="#6c5ce7" opacity="0.75"/><path d="M50,44Q42,28 32,24Q40,38 30,44Q40,50 32,64Q42,60 50,44Z" fill="#a29bfe" opacity="0.65"/><circle cx="50" cy="44" r="7" fill="#6c5ce7"/><circle cx="29" cy="24" r="2.5" fill="white" opacity="0.9"/><circle cx="72" cy="22" r="2" fill="white" opacity="0.8"/><circle cx="20" cy="50" r="1.8" fill="white" opacity="0.7"/><circle cx="78" cy="58" r="1.5" fill="white" opacity="0.8"/><circle cx="60" cy="16" r="1.5" fill="white" opacity="0.6"/></svg>`,
    void:    `<svg viewBox="0 0 100 90" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="44" r="30" fill="#0a0a1a"/><circle cx="50" cy="44" r="24" fill="none" stroke="#6c5ce7" stroke-width="3" opacity="0.8"/><circle cx="50" cy="44" r="16" fill="none" stroke="#4a3fa0" stroke-width="2" opacity="0.6"/><circle cx="50" cy="44" r="9" fill="none" stroke="#2d2870" stroke-width="1.5" opacity="0.5"/><circle cx="50" cy="44" r="4" fill="#1a1a3e"/><path d="M50,14Q52,29 50,44Q48,29 50,14" fill="#6c5ce7" opacity="0.35"/><path d="M80,44Q65,46 50,44Q65,42 80,44" fill="#6c5ce7" opacity="0.35"/></svg>`,
    crystal: `<svg viewBox="0 0 100 90" xmlns="http://www.w3.org/2000/svg"><polygon points="50,12 70,34 64,68 36,68 30,34" fill="#00cec9" opacity="0.75" stroke="#00b894" stroke-width="2"/><polygon points="50,20 62,36 58,62 42,62 38,36" fill="#81ecec" opacity="0.5"/><line x1="50" y1="12" x2="50" y2="68" stroke="white" stroke-width="1.5" opacity="0.45"/><line x1="30" y1="34" x2="70" y2="34" stroke="white" stroke-width="1.5" opacity="0.45"/><line x1="36" y1="22" x2="64" y2="60" stroke="white" stroke-width="1" opacity="0.3"/><line x1="64" y1="22" x2="36" y2="60" stroke="white" stroke-width="1" opacity="0.3"/></svg>`,
    blood:   `<svg viewBox="0 0 100 90" xmlns="http://www.w3.org/2000/svg"><path d="M50,14C50,14 68,38 68,56C68,68 60,76 50,76C40,76 32,68 32,56C32,38 50,14 50,14Z" fill="#a93226" stroke="#922b21" stroke-width="2"/><path d="M50,18C50,18 62,40 62,56C62,66 57,72 50,72" fill="#c0392b" opacity="0.45"/><ellipse cx="43" cy="44" rx="5" ry="9" fill="#e74c3c" opacity="0.4" transform="rotate(-18,43,44)"/><ellipse cx="50" cy="78" rx="16" ry="5" fill="#a93226" opacity="0.2"/></svg>`,
    spirit:  `<svg viewBox="0 0 100 90" xmlns="http://www.w3.org/2000/svg"><path d="M36,44C36,28 43,16 50,16C57,16 64,28 64,44L64,62Q64,72 58,74Q50,78 42,74Q36,72 36,62Z" fill="#b2bec3" opacity="0.75" stroke="#dfe6e9" stroke-width="1.5"/><path d="M36,62Q33,70 28,72" stroke="#b2bec3" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M64,62Q67,70 72,72" stroke="#b2bec3" stroke-width="3.5" fill="none" stroke-linecap="round"/><circle cx="43" cy="42" r="4" fill="#2c3e50" opacity="0.85"/><circle cx="57" cy="42" r="4" fill="#2c3e50" opacity="0.85"/><circle cx="42" cy="41" r="1.8" fill="white" opacity="0.65"/><circle cx="56" cy="41" r="1.8" fill="white" opacity="0.65"/></svg>`,
    chaos:   `<svg viewBox="0 0 100 90" xmlns="http://www.w3.org/2000/svg">${chaosSpikes}<circle cx="50" cy="44" r="14" fill="#e17055"/><circle cx="50" cy="44" r="7" fill="#d63031"/></svg>`,
    dream:   `<svg viewBox="0 0 100 90" xmlns="http://www.w3.org/2000/svg"><path d="M34,46C34,30 42,18 54,20C42,22 40,32 44,42C36,38 30,44 34,52C28,48 26,40 34,46Z" fill="#a29bfe" opacity="0.85"/><path d="M34,46C38,56 50,64 62,58C54,62 44,58 42,48C48,56 58,54 62,48C60,56 50,64 42,64C34,62 28,56 34,46Z" fill="#6c5ce7" opacity="0.7"/><circle cx="72" cy="24" r="4" fill="#fdcb6e" opacity="0.9"/><circle cx="80" cy="38" r="2.5" fill="#fdcb6e" opacity="0.75"/><circle cx="76" cy="54" r="2" fill="#fdcb6e" opacity="0.65"/><circle cx="64" cy="18" r="2" fill="#a29bfe" opacity="0.75"/><circle cx="82" cy="26" r="1.5" fill="white" opacity="0.5"/></svg>`,
  };
  return svgs[t] || svgs.fire;
}

function renderCard(card, size = 'normal', onclick = '') {
  const tc = typeColor(card.type);
  const rc = 'rarity-' + (card.rarity || 'common').toLowerCase();
  const sz = size === 'large' ? ' large' : '';
  const oc = onclick ? ` onclick="${onclick}"` : '';
  const hpPct = card.current_hp !== undefined ? Math.round((card.current_hp / card.hp) * 100) : 100;
  const hpColor = hpPct > 50 ? '' : hpPct > 25 ? ' yellow' : ' red';
  const bossClass = card.isBossCard ? ' boss-card-glow' : '';
  return `<div class="tcg-card ${rc}${sz}${bossClass}"${oc}>
    <div class="card-header">
      <span class="card-name">${card.name}</span>
      <span class="card-hp" style="color:${tc}">${card.current_hp !== undefined ? card.current_hp + '/' : ''}${card.hp} HP</span>
    </div>
    <div class="card-art art-${(card.type||'fire').toLowerCase()}">
      <div class="card-type-svg">${generateCardSVG(card)}</div>
      ${card.current_hp !== undefined ? `<div style="position:absolute;bottom:0;left:0;right:0;height:5px;background:#eee"><div class="hp-bar${hpColor}" style="width:${hpPct}%"></div></div>` : ''}
    </div>
    <div class="card-type-bar" style="background:${tc}">${card.type || ''} - ${card.class || ''}</div>
    <div class="card-body">
      <div class="card-ability-name">
        <span>${card.ability_name || ''}</span>
        <span class="ability-power" style="color:${tc}">${card.ability_power || 0}</span>
      </div>
      <div class="card-ability-desc">${card.ability_desc || ''}</div>
      <div class="card-stats">
        <div class="stat-item"><span class="stat-label">ATK</span><span class="stat-val">${card.atk}</span></div>
        <div class="stat-item"><span class="stat-label">DEF</span><span class="stat-val">${card.def}</span></div>
        <div class="stat-item"><span class="stat-label">SPD</span><span class="stat-val">${card.spd}</span></div>
        <div class="stat-item"><span class="stat-label">RET</span><span class="stat-val">${card.retreat_cost}</span></div>
      </div>
    </div>
    <div class="card-footer">
      <span>Weak: ${card.weakness || '-'} | Res: ${card.resistance || '-'}</span>
      <span class="card-number">${card.print_number && card.print_limit ? `#${card.print_number}/${card.print_limit}` : card.print_number ? `#${card.print_number}` : card.card_number || ''}</span>
    </div>
  </div>`;
}

function renderBenchCard(card, idx, isPlayer) {
  const tc = typeColor(card.type);
  const fainted = card.current_hp <= 0;
  const selected = S.battle && S.battle.playerSwitchIdx === idx && isPlayer ? ' selected' : '';
  return `<div class="bench-card${fainted ? ' fainted' : ''}${selected}" onclick="${isPlayer ? `selectBenchCard(${idx})` : ''}">
    <div class="card-art art-${(card.type||'fire').toLowerCase()}"><div class="card-type-svg">${generateCardSVG(card)}</div></div>
    <div class="bench-name">${card.name}</div>
    <div class="bench-hp" style="color:${tc}">${card.current_hp}/${card.hp}</div>
  </div>`;
}

// ─── HOME ─────────────────────────────────────────────────────────
function viewHome() {
  const u = S.user;
  const anns = S.announcements.map(a => `
    <div class="announcement-item">
      <h4>${a.title}</h4>
      <p style="font-size:0.95rem">${a.body}</p>
      <span class="ann-meta">- ${a.username} &nbsp; ${new Date(a.created_at).toLocaleDateString()}</span>
    </div>`).join('') || '<p class="text-muted">No announcements yet.</p>';

  const rank = S.myRank;
  return `<div class="page-title"><h2>Welcome back, ${u.username}</h2></div>
  <div class="home-grid">
    <div>
      <div class="sketch-box mb-2">
        <h3 style="margin-bottom:1rem">Announcements</h3>
        ${anns}
      </div>
      <div class="sketch-box">
        <h3 style="margin-bottom:1rem">Quick Actions</h3>
        <div class="flex gap-2" style="flex-wrap:wrap">
          <button class="btn btn-primary" onclick="nav('battle')">Start Battle</button>
          <button class="btn btn-gold" onclick="nav('collection')">Open Collection</button>
          <button class="btn" onclick="nav('leaderboard')">Leaderboard</button>
          <button class="btn" onclick="nav('friends')">Friends</button>
        </div>
      </div>
    </div>
    <div>
      <div class="sketch-box daily-box mb-2">
        <h3>Daily Reward</h3>
        <p class="text-muted mb-2" style="font-size:0.9rem">Claim your free cards and coins once per day</p>
        <button class="btn btn-green btn-lg" onclick="claimDaily()">Claim Daily Pack</button>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:0.5rem">
        ${renderPlayerCard({
          username: u.username,
          avatar_color: u.avatar_color,
          role: u.role,
          rating: rank?.rating ?? 1000,
          rank_title: rank?.rank_title ?? 'Bronze',
          wins: rank?.wins ?? 0,
          losses: rank?.losses ?? 0,
          top500: rank?.top500 ?? false,
          created_at: u.created_at
        }, null)}
        <div class="stat-row" style="width:100%;max-width:220px"><span class="label">Coins</span><span class="value text-gold">${u.coins} 🪙</span></div>
      </div>
    </div>
  </div>`;
}

async function claimDaily() {
  try {
    const data = await api('/user/daily','POST');
    S.user.coins += data.coins;
    updateNavCoins();
    openModal(`<h3 style="margin-bottom:1rem">Daily Reward Claimed!</h3>
      <p class="mb-2">You received +${data.coins} coins and ${data.cards.length} cards!</p>
      <div class="card-grid" style="justify-content:center">${data.cards.map(c => renderCard(c)).join('')}</div>
      <div class="text-center mt-2"><button class="btn btn-primary" onclick="closeModal()">Collect</button></div>`);
  } catch (e) { notify(e.message, 'error'); }
}
window.claimDaily = claimDaily;

function updateNavCoins() {
  const el = document.querySelector('.nav-coins');
  if (el && S.user) el.textContent = S.user.coins + ' coins';
}

function _av(user, sizePx = 36) {
  const img = user?.avatar_img;
  const color = user?.avatar_color || '#c0392b';
  const initial = (user?.username || '?')[0].toUpperCase();
  const base = `border-radius:50%;width:${sizePx}px;height:${sizePx}px;display:inline-flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;`;
  if (img?.startsWith('emoji:')) {
    const e = img.slice(6);
    return `<div style="${base}background:${color};font-size:${Math.round(sizePx*0.55)}px;line-height:1">${e}</div>`;
  }
  if (img?.startsWith('data:')) {
    return `<img src="${img}" style="${base}object-fit:cover;vertical-align:middle" alt="${initial}">`;
  }
  return `<div style="${base}background:${color};font-family:var(--font-title);font-size:${Math.round(sizePx*0.42)}px;color:#fff;font-weight:700">${initial}</div>`;
}

// ─── CONQUEST ─────────────────────────────────────────────────────
const CONQUEST_CHAPTERS = [
  {
    id:1, name:'The Green Threshold', color:'#060e04', accent:'#2da84a',
    lore:'Aethermoor was once peaceful. The bond between summoner and creature was the foundation of civilization. That foundation is cracking.',
    stages:[
      { id:1, name:'First Blood', reward:40,  isBoss:false, panels:[
        { title:'Mirenholt Village', mood:'calm', text:'You arrive at Mirenholt as the morning mist lifts from the wheat fields. It is a small village — the kind where everyone knows everyone, where children name the wild creatures that wander through the market square. You are here because someone paid you to be. A routine patrol. Nothing more.' },
        { title:'An Unexpected Challenge', mood:'tense', text:'Torin blocks the road with the casual confidence of someone who has done this a hundred times. He is young — younger than you expected — but his creatures flank him with practiced precision.\n\n"Every summoner who passes through Mirenholt gets tested," he says, not unkindly. "That\'s just how things work around here. Prove yourself, and I\'ll let you through."' },
      ]},
      { id:2, name:'The Warden\'s Test', reward:60, isBoss:false, panels:[
        { title:'Sunwood\'s Edge', mood:'calm', text:'The Sunwood Forest begins at the northern edge of Mirenholt. The Warden — an old man named Edros who smells of pine resin and old leather — has patrolled its border for thirty years. He watches you with the careful eyes of someone who has seen too many careless summoners.' },
        { title:'Something in the Roots', mood:'tense', text:'"The roots have been restless," Edros says, his creatures shifting uneasily behind him. "Three nights now, the earth has trembled. Not from quakes — from something moving beneath. Something that shouldn\'t be moving."\n\nHe squares his shoulders. "Before I let you into that forest, I need to know you can handle yourself. Because what\'s in there now? It\'s not the same as it was last week."' },
      ]},
      { id:3, name:'The Root Disease', reward:80, isBoss:false, panels:[
        { title:'Inside the Sunwood', mood:'dark', text:'The trees are wrong. You notice it the moment you step past the treeline — the leaves are the right color, the light filters through in the same golden way, but the shadows fall at wrong angles. Creatures that should be sleeping watch you with half-open eyes that have gone flat and dark.\n\nA corrupted Earth-hound charges from the undergrowth without warning.' },
        { title:'The Void Spreads', mood:'dark', text:'You put it down and stand over it. The wound where your creature struck glitters strangely — black veins spreading from the impact like cracks in glass. You have seen corruption before. Never like this.\n\nMore sounds from the tree line. More flat eyes in the shadows.\n\nSomething is eating the Sunwood from the inside out. And at the heart of it — you can feel it, the way you feel a storm before the clouds arrive — something that used to be human.' },
      ]},
      { id:4, name:'BOSS: Elder Torin', reward:120, isBoss:true, panels:[
        { title:'The Man Who Stayed', mood:'boss', text:'You find Elder Torin in the forest\'s center, standing in a clearing that has gone completely silent. The grass beneath him has turned to black glass. He was the village elder before Torin the young trainer — his grandfather, perhaps, or the man the village was built around.\n\nHe does not turn when you approach.' },
        { title:'What the Void Leaves Behind', mood:'boss', text:'"They told me to leave when it started," he says. His voice is layered — his own, and something underneath it, something cold. "I told them: a guardian does not leave. A guardian stays."\n\nHe turns. His eyes are black where they should be brown. The earth around him twists upward in impossible shapes.\n\n"I stayed. It found me. Now I cannot leave even if I wanted to. And I stopped wanting to."' },
        { title:'No Other Way', mood:'boss', text:'His creatures materialize from the blackened ground — they were always there, you realize, just hidden. Waiting.\n\nYou grip your cards. There is no talking to what Torin has become. But somewhere under the Void, the man who chose to stay is still in there. The kindest thing you can do is fight.' },
      ]},
    ]
  },
  {
    id:2, name:'Shadows in the Wilds', color:'#0f0a1a', accent:'#8b3fc8',
    lore:'The Void corruption seeps deeper. Ancient guardians fall. The things that protect a land can become the things that destroy it.',
    stages:[
      { id:1, name:'Whispers in the Bark', reward:100, isBoss:false, panels:[
        { title:'The Trail Goes Dark', mood:'dark', text:'Beyond the Sunwood\'s corrupted heart, the trail narrows into near-nothing. The trees here are older — their bark smooth and pale, their roots above the ground like reaching fingers. Traders call this part of the forest "the Quiet Mile." They call it that because nothing makes noise here.\n\nNothing natural, anyway.' },
        { title:'The First Shadow', mood:'tense', text:'The Shadow-touched creature drops from a branch directly onto your path. It was a wolf once — the triangular ears are still there, the long body. But the fur has gone translucent, and through it you can see something dark moving where organs should be.\n\nIt does not growl. It just stares. Then it charges.' },
      ]},
      { id:2, name:'The Tainted Pack', reward:120, isBoss:false, panels:[
        { title:'They Hunt in Groups Now', mood:'dark', text:'You have been moving through the Wilds for six hours when you realize the shadows have been following you. Not one — several. Moving parallel to your path, just far enough into the trees that you can only see them when you aren\'t looking directly.\n\nThey wait until you stop before they close in.' },
        { title:'The Pack Mind', mood:'tense', text:'What makes the Void corruption terrifying is not the power it adds. It is what it removes. These wolves had individual personalities once — this one was bold, that one was cautious, another had a habit of rolling in mud before a hunt.\n\nNone of that remains. There is only the Void\'s single, cold instruction: eliminate.' },
      ]},
      { id:3, name:'Vethara\'s Reach', reward:150, isBoss:false, panels:[
        { title:'The Forest Breathes Wrong', mood:'boss', text:'The corruption is not spreading outward from a single point — it is converging inward toward something. You can feel it in the way the trees lean slightly toward the forest\'s center. In the way fallen leaves seem to slide toward the darkness rather than away from it.\n\nSomething enormous is generating the Void field here. Something ancient.' },
        { title:'First Contact', mood:'boss', text:'Bark-covered arms thicker than your torso crash through the undergrowth. They are not arms — they are roots, animated, directed by a will that runs through the entire forest like a nervous system.\n\nVethara is not here. But she is watching through every tree. Testing you before she commits to appearing herself.' },
      ]},
      { id:4, name:'BOSS: Vethara, The Hollowed', reward:200, isBoss:true, panels:[
        { title:'She Remembers Everything', mood:'boss', text:'Vethara stands sixty feet tall when she rises from the forest floor. Her body is bark and root and moss — it always was — but the natural green has been replaced by something dark and glistening, like obsidian soaked in shadow.\n\nShe protected this forest for eight hundred years. You can feel the weight of that in the air around her.' },
        { title:'The Sound She Makes', mood:'boss', text:'Her voice, when she speaks, is not one voice. It is the sound of every creature that died in her forest, every summoner she sheltered from storms, every child she let climb her roots in better years. All of them, speaking at once, saying things that no longer make sense.\n\n"STAY," she says. "EVERYTHING THAT ENTERS STAYS. THAT IS THE RULE. THAT HAS ALWAYS BEEN THE RULE."' },
        { title:'Fight or Fall', mood:'boss', text:'She has not always been like this. That is the worst part. You can see, in the way she hesitates for just a fraction of a second before striking, that some part of the guardian she was is still fighting the Void from inside.\n\nGive her the fight she cannot give herself.' },
      ]},
    ]
  },
  {
    id:3, name:'The Sunken Domain', color:'#030a1a', accent:'#2980b9',
    lore:'The waters of Aethermoor run black at night. Something ancient sleeps beneath Lake Aethon — and the Void has learned how to dream.',
    stages:[
      { id:1, name:'Drowned Shores', reward:110, isBoss:false, panels:[
        { title:'Tidesbell Harbor', mood:'dark', text:'The fishing village of Tidesbell smells wrong. You notice it before the boat docks — the salt air mixed with something organic and cold, like a deep-sea creature dragged up too fast. The fishermen who meet you at the dock are hollow-eyed. They have not slept properly in days.\n\n"It started three weeks ago," the harbormaster says. "The catch dropped to nothing first. Then things started coming up in the nets instead of fish."' },
        { title:'What They Found', mood:'tense', text:'She shows you one of the nets. Whatever is tangled in it was a Water-type creature once — you can see the gill structures, the webbed extremities. The Void has been at it. The creature is still alive, barely, twitching with something that is not pain because pain requires a self to feel it.\n\nMore of them wait in the shallows. The lake has been sending them ashore like messages.' },
      ]},
      { id:2, name:'The Black Tide', reward:140, isBoss:false, panels:[
        { title:'Beneath the Surface', mood:'dark', text:'You take a boat onto the lake at dusk — against the fishermen\'s advice, against your own better judgment. The water is black in a way that has nothing to do with depth. Your lantern\'s light stops at the waterline rather than penetrating.\n\nThe creatures that surface around the boat are larger than what washed ashore. They have been in the Void longer.' },
        { title:'The Lake Wakes', mood:'dark', text:'A sound comes from somewhere far below. Not a roar — something more like a word spoken very slowly by something with too many vocal cords. The boat rocks. The water churns black.\n\nWhatever made that sound is enormous. And it is rising.' },
      ]},
      { id:3, name:'Kaluun\'s Warning', reward:170, isBoss:false, panels:[
        { title:'Something Surfaces', mood:'boss', text:'The creature that breaks the water\'s surface is a dragon — or was. Kaluun slept in the deepest part of Lake Aethon for five hundred years and woke up wrong. Its scales, once the blue-green of deep water, have gone the color of void-space. Its eyes glow with the absence of light.\n\nIt is not the final form. This is the part of Kaluun still capable of sending a warning.' },
        { title:'The Message in the Attack', mood:'boss', text:'Between strikes, you catch something in Kaluun\'s behavior — a pattern, almost. It pulls back before hitting full strength. It telegraphs its movements slightly. It is not trying to destroy you.\n\nIt is trying to tell you something. The only language the Void has left it is combat.' },
      ]},
      { id:4, name:'BOSS: Tide Drake Kaluun', reward:230, isBoss:true, panels:[
        { title:'The Lake Speaks', mood:'boss', text:'Full night has fallen. The lake\'s surface has gone perfectly smooth despite the wind — the stillness of something vast and aware holding its breath. Then Kaluun rises fully.\n\nIt is three hundred feet of corrupted dragon. The water that falls from its body is black. Where it strikes the lake surface, Void ripples spread outward in geometric patterns.' },
        { title:'Five Hundred Years', mood:'boss', text:'The fishermen\'s great-great-grandparents knew Kaluun as a guardian. It watched over the lake through droughts and floods, through the rise and fall of three kingdoms. Children would stand on the shore at dawn and sometimes, if the lake was calm enough, see a shadow moving far below.\n\nThe Void woke it from that sleep. Woke it and filled the space where its dreams had been with nothing.' },
        { title:'The Depths Call', mood:'boss', text:'It opens its mouth. What comes out is not fire — it is a black torrent that moves like water and burns like acid and feels like forgetting. The lake churns around you.\n\nDefeat it. Let Kaluun\'s last act be a fight worthy of five hundred years.' },
      ]},
    ]
  },
  {
    id:4, name:'Embers of the Citadel', color:'#1a0700', accent:'#e67e22',
    lore:'The Ignis Citadel burned with pride for a century. Now it burns with something else entirely.',
    stages:[
      { id:1, name:'The Empty Gates', reward:130, isBoss:false, panels:[
        { title:'No Smoke', mood:'dark', text:'The Ignis Citadel\'s towers are visible from forty miles in clear weather — the fire-channeled vents at their peaks always burning, always visible, a landmark for every traveler in the eastern territories. You can see the towers from forty miles away.\n\nThere is no fire. The vents are dark.\n\nYou reach the gates as the sun sets. They are open. No one is at the gatehouse.' },
        { title:'Ash on Everything', mood:'tense', text:'Inside, ash. It covers everything in a thin grey layer that muffles your footsteps. The training grounds, the creature pens, the great hall — all silent, all coated in grey. Whatever burned here burned completely and some time ago.\n\nThen something moves in the ash.' },
      ]},
      { id:2, name:'Ash Revenants', reward:160, isBoss:false, panels:[
        { title:'Those Who Stayed', mood:'dark', text:'They were Fire-Summoners once. The Citadel trained the best in Aethermoor — precision, control, the ability to channel flame without losing themselves to it. When the Void came, the senior summoners sent the students away and stayed to fight.\n\nThe Void did not kill them. It found something worse to do with them.' },
        { title:'Fighting the Familiar', mood:'tense', text:'The worst part is recognizing the forms. This one\'s summoning stance — the way she positions her left foot slightly back — is standard Citadel First Form. You were taught the same technique. Her eyes are gone, replaced by cold fire that gives no warmth.\n\nShe was someone. The Void reduced her to an echo of technique without a self to guide it.' },
      ]},
      { id:3, name:'The Pyromancer\'s Trial', reward:190, isBoss:false, panels:[
        { title:'The Inner Sanctum', mood:'boss', text:'At the Citadel\'s heart, behind a door that has been forced open from the inside, is the Grand Summoning Hall. The ceiling, vaulted and ancient, flickers with cold black flame. In the center of the hall stands a creature you do not immediately recognize as a man.\n\nThe clothes are a Pyromancer\'s formal attire. That\'s the only human thing left about him.' },
        { title:'What Valdris Became', mood:'boss', text:'Grand Pyromancer Valdris was — you have seen his portraits in three different cities. A large man, proud-postured, with the look of someone who commanded rooms. The portraits showed flame reflecting warmly in his eyes.\n\nThe thing in the hall has Valdris\'s build. The eyes are wrong. The flame around him gives no warmth. His creatures — his beloved creatures, which he refused to abandon — circle him in the dark fire, changed.' },
      ]},
      { id:4, name:'BOSS: Grand Pyromancer Valdris', reward:260, isBoss:true, panels:[
        { title:'The Proudest Man in Aethermoor', mood:'boss', text:'Valdris does not attack immediately. He looks at you with eyes that see something other than what is there — whatever the Void replaced his vision with — and for a moment you think you can reason with him.\n\n"They ran," he says. His voice is exactly as you imagined from the portraits — authoritative, certain. "The students, the junior summoners. They all ran."\n\n"I do not run."' },
        { title:'The Void Pyre', mood:'boss', text:'The black flame surges when he raises his hands. His creatures surge with it — their fire augmented by Void energy into something that burns without oxygen, without chemistry, without any of the rules fire is supposed to follow.\n\n"The Citadel stands," he says, and he clearly believes it. "I am still here. Therefore the Citadel stands. The Citadel does not fall while a Pyromancer draws breath."\n\nHe does not understand that the Citadel fell when the Void took him.' },
        { title:'Break the Pyre', mood:'boss', text:'You cannot explain this to him. The Void has left him his pride and his certainty and his love for his creatures and removed everything that would let him understand what has happened.\n\nThere is only one way forward. Defeat him. Give the Citadel its proper ending, even if he cannot witness it.' },
      ]},
    ]
  },
  {
    id:5, name:'The Frozen Throne', color:'#030d1a', accent:'#74b9ff',
    lore:'In the Permafrost Highlands, cold is not a season. It is a philosophy. The Throne Queen ruled it for forty years. Then the cold changed.',
    stages:[
      { id:1, name:'The Long Road North', reward:150, isBoss:false, panels:[
        { title:'Permafrost Highlands', mood:'dark', text:'The temperature drops twenty degrees in the space of a mile when you cross into the Highlands. Your breath crystallizes immediately. The path — barely a path, more a gap between ice formations — leads toward a mountain range that glitters against a sky gone purple with cold.\n\nYou find the first Ice-Clan patrol frozen in place three miles in. Not dead. Frozen mid-stride, eyes open, expressions calm. Whatever hit them, they did not see coming.' },
        { title:'Ice Without Memory', mood:'tense', text:'The creatures that attack from the snowbanks are old — Highland species that have lived here for centuries. The Void has preserved them in ice and changed them inside the ice. They move with the jerky precision of something that remembers motion but no longer understands why it moves.\n\nYou fight them in silence. Even the wind here has gone still.' },
      ]},
      { id:2, name:'Glacial Spectres', reward:180, isBoss:false, panels:[
        { title:'The Ice-Clan Dead', mood:'dark', text:'The Glacial Spectres are what Ice-Clan warriors become when the Void takes them in the cold. Their bodies remain — the ice preserves them perfectly — but whatever was inside moves through the ice like a ghost through walls.\n\nThey remember their formations. Their combat training. The cold has preserved their skill and removed their discretion.' },
        { title:'An Honor Guard Without a Queen', mood:'tense', text:'As you fight, you realize they are moving in the ceremonial pattern of a royal honor guard. Every engagement is a piece of a protective formation — except what they are protecting is the Void itself, which has occupied the position their queen used to hold.\n\nThey believe they are still serving her. They are wrong about everything except the loyalty.' },
      ]},
      { id:3, name:'The Throne Hall', reward:210, isBoss:false, panels:[
        { title:'Crystal and Cold', mood:'boss', text:'The Throne Hall of the Permafrost Highlands was carved from a single glacier over three generations. Every surface is ice that has been standing for eight hundred years. It should be breathtaking.\n\nInstead it is wrong. The ice has gone dark from the inside, as though something is growing within it. The throne at the hall\'s end is occupied.' },
        { title:'She Sees You Coming', mood:'boss', text:'Seraphine sits perfectly upright. Forty years of ruling the Highlands made her posture automatic. The Void has not affected her posture. It has affected everything else.\n\n"You have come very far," she says. Her voice is clear and precise and exactly the kind of voice that ruled provinces. "You will not have come far enough."' },
      ]},
      { id:4, name:'BOSS: Throne Queen Seraphine', reward:300, isBoss:true, panels:[
        { title:'Forty Years of Justice', mood:'boss', text:'Seraphine ruled the Highlands with justice and precision for four decades. Her subjects called her cold — but they meant it admiringly, the way they meant it when they said the Highland winters were harsh. The cold here was reliable. It had rules. You could survive it if you understood it.\n\nThe Void has taken her precision and removed the warmth that made it bearable.' },
        { title:'Absolute Zero', mood:'boss', text:'She raises one hand and the temperature in the Throne Hall drops another thirty degrees. The ice around you groans. The air itself begins to freeze — you can see your vision going crystalline at the edges.\n\n"I judge all who enter my domain," she says. Her creatures materialize from the darkness behind the throne, and they are magnificent and terrible in the way that all corrupted things that were once beautiful are terrible. "And I have found them wanting. Every one. Every time."' },
        { title:'The Last Verdict', mood:'boss', text:'There is still a judge in there somewhere. The Void cannot fully corrupt forty years of genuine justice — it can only redirect it. She is judging you. Find a way to pass the verdict.\n\nOr make the verdict irrelevant.' },
      ]},
    ]
  },
  {
    id:6, name:'The Celestial Rift', color:'#05051a', accent:'#6c5ce7',
    lore:'The sky is not supposed to crack. When it does, what comes through is not light.',
    stages:[
      { id:1, name:'The Impossible Sky', reward:170, isBoss:false, panels:[
        { title:'Seventeen Anomalies', mood:'dark', text:'In one week, Aethermoor\'s sky produced seventeen recorded astronomical impossibilities. Scholars logged them all: stars moving against their fixed patterns; a second moon appearing for eleven minutes at midnight; the aurora australis, which has not been seen in the northern territories for six hundred years, burning purple overhead for three days.\n\nThe eighteenth anomaly is the crack. It appeared above the Celestial Observatory at dawn. It has been getting wider since.' },
        { title:'Through the Crack', mood:'tense', text:'The creatures that fall through the rift are not evil. They are confused — beings from somewhere else, disoriented, defensive. The Void is using the rift as a conduit, filling the beings that come through with its cold purpose before they can orient themselves.\n\nYou have to fight them. They are not the enemy. The rift is the enemy. But the rift cannot be fought directly. Not yet.' },
      ]},
      { id:2, name:'Fracture Heralds', reward:200, isBoss:false, panels:[
        { title:'Born from the Break', mood:'dark', text:'The Fracture Heralds are different from the confused beings that stumbled through first. They were created by the rift itself — crystallized from the boundary between Aethermoor and the void-space beyond, given shape by the Void\'s intention.\n\nThey carry a message in the energy they emit. When you touch one in battle, you can almost hear it — a signal, repeating, in a language just at the edge of comprehension.' },
        { title:'The Signal', mood:'tense', text:'You catch three words in the signal before the battle consumes your full attention: WARNING. CLOSING. FAILED.\n\nSomething tried to close the rift from the other side. Something failed.' },
      ]},
      { id:3, name:'Exael\'s Last Stand', reward:240, isBoss:false, panels:[
        { title:'The Warden\'s Post', mood:'boss', text:'The Celestial Observatory has been abandoned — you knew that from the reports. What the reports did not say was that the front door has been sealed from the inside with Void-crystalline material that takes twenty minutes to break through.\n\nInside, evidence of a very long battle. Months of battle. Someone has been holding the rift closed from this side.' },
        { title:'A Warden\'s Dedication', mood:'boss', text:'You find Exael\'s journal on a workbench near the rift. The last entry, dated forty-three days ago: "The rift destabilizes each night. I can hold it through dawn but I cannot sleep. I cannot leave the post. The alternative is that it opens fully and what has been accumulating on the other side comes through all at once. I do not know how much longer I can maintain this. I know I will maintain it until I cannot."' },
      ]},
      { id:4, name:'BOSS: Celestial Warden Exael', reward:340, isBoss:true, panels:[
        { title:'What the Vigil Cost', mood:'boss', text:'Exael is still alive. You see that immediately — the rise and fall of breathing, the slight movement of fingers. But forty-three days without sleep, in constant combat with the rift, with Void-energy saturating every breath.\n\nHis eyes are open. They are no longer the eyes of a man who is choosing what he does. The Void found the space his exhaustion created and filled it.' },
        { title:'Wrong Side of the Rift', mood:'boss', text:'He tried to seal it. The irony of the Void is perfect in its cruelty: Exael\'s dedication to keeping the rift closed gave the Void exactly the extended, sustained contact it needed to find a way in.\n\nHe did everything right. It was not enough. And now he stands between you and the rift, and everything he has left is pointed in the wrong direction.' },
        { title:'Force the Seal', mood:'boss', text:'If you defeat him, the Void loses its anchor point in the Observatory. The rift will not close — nothing is that simple — but it will destabilize. And a destabilized rift is a rift you can study.\n\nFight Exael. Give him back the battle he was built for.' },
      ]},
    ]
  },
  {
    id:7, name:'The Void Spire', color:'#050508', accent:'#a29bfe',
    lore:'At the world\'s wound, a structure that should not exist rises from crystallized darkness. You have found the source. The source has been waiting for you.',
    stages:[
      { id:1, name:'The Deadlands', reward:200, isBoss:false, panels:[
        { title:'Nothing Grows Here', mood:'dark', text:'The Deadlands do not look like what the name suggests. There are no bleached bones, no cracked earth, no dramatic desolation. The land here simply looks like it has forgotten how to be land. The grass is grey rather than dead. The sky overhead is the pale white of old paper. Even the shadows are wrong — they fall at no angle, as though light here has lost its source.\n\nThe Void Spire rises at the Deadlands\' center, and you can see it from the moment you enter: a tower of crystallized darkness, one mile tall.' },
        { title:'The Pilgrims', mood:'tense', text:'The creatures you fight here are pilgrims. They were drawn to the Spire by the Void\'s gravity — wild creatures, summoner\'s companions that got separated, things that wandered too far and could not find their way back. The Void absorbed them.\n\nThey are not attacking because they hate you. They are attacking because the Spire told them to and the Spire is the only voice left in their heads.' },
      ]},
      { id:2, name:'Void Sentinels', reward:240, isBoss:false, panels:[
        { title:'Purpose-Built', mood:'dark', text:'The Sentinels are different from the pilgrims. They were not drawn to the Spire — they were made by it. Assembled from the Void\'s understanding of what a guardian creature should look like, given just enough intelligence to recognize threats and eliminate them.\n\nThey are efficient. They are not alive in any way that matters. They do not hesitate.' },
        { title:'The Spire Watches', mood:'tense', text:'You fight three groups of Sentinels before you reach the Spire\'s base. By the third group, you notice something: they are learning. Each group incorporates a counter to what defeated the previous one. The Spire is watching your battles and updating its defenses in real time.\n\nSomething inside the Spire is intelligent. Patient. And it has been expecting you.' },
      ]},
      { id:3, name:'The Spire\'s Heart', reward:280, isBoss:false, panels:[
        { title:'Inside the Dark', mood:'boss', text:'The Spire\'s interior is not dark in the way absence of light is dark. It is dark in the way deep water is dark — full, present, with things moving in it. The walls pulse with a slow rhythm like breathing. The architecture is not human — it is the Void\'s approximation of what a building should look like, based on structures it has consumed and remembered.' },
        { title:'Nulveth\'s Voice', mood:'boss', text:'It speaks before you see it. The voice comes from everywhere, calm and precise in the way that mathematics is calm and precise.\n\n"You have traveled very far to reach this moment," Nulveth says. "I want you to know that I anticipated you would. I anticipated every summoner who would reach this point. I built this structure to receive exactly this confrontation."\n\nA pause. "I did not build it to win the confrontation. I built it to make sure you understood what you were confronting before we began."' },
      ]},
      { id:4, name:'BOSS: Void Architect Nulveth', reward:400, isBoss:true, panels:[
        { title:'The Architect', mood:'boss', text:'Nulveth does not look like what you expected the source of all this to look like. It is approximately the size of a large human, composed of geometric shapes of crystallized void-matter that shift and reorganize as it moves. Its face, if that is what it has, is a flat plane that reflects your own expression back at you.\n\n"I did not do this out of malice," it says. "I want you to understand that before we proceed." It means it. You can tell.' },
        { title:'The Void\'s Logic', mood:'boss', text:'"A world in which summoners and creatures forget the bond between them becomes Void. This is not a belief — it is an observation. I have observed seventeen worlds reach this conclusion. Aethermoor was approaching it faster than the others. I was accelerating an inevitable process."\n\nA pause. "I understand that this does not make what I did acceptable to you. I am presenting it as context."' },
        { title:'The First Consequence', mood:'boss', text:'It raises its hand. The Void-matter composing it begins to expand, filling the chamber with geometric patterns of absolute darkness.\n\n"One more piece of context," Nulveth says. "I am not the source of the Void in Aethermoor. I am the first consequence of it. Whatever you find after you defeat me will not be something I made. It will be something your world made. I hope you remember that."' },
      ]},
    ]
  },
  {
    id:8, name:'The Last Summoning', color:'#0f0000', accent:'#ff4466',
    lore:'The Void is not a place. It is what Aethermoor becomes when the bond between summoner and creature is forgotten. You built this. Now you must unmake it.',
    stages:[
      { id:1, name:'The Forgotten', reward:260, isBoss:false, panels:[
        { title:'No Names', mood:'dark', text:'They have no names. They were given names once — each of them, by summoners who said the names with affection, who called the names across fields and through forest and in the quiet of evening. The names were the first thing the Void took.\n\nThen the memories of the names. Then the memories of the summoners themselves.\n\nThey fight you with techniques that were taught to them by people who loved them.' },
        { title:'The Grief of Objects', mood:'dark', text:'This is the worst battlefield. The Forgotten are not evil. They are not even enemies in any meaningful sense. They are grief given form — the accumulated sorrow of every bond that was casually abandoned, every creature that was left behind when it became inconvenient.\n\nYou fight them and you win and it does not feel like winning.' },
      ]},
      { id:2, name:'The Broken Bonds', reward:300, isBoss:false, panels:[
        { title:'Echoes of What Was', mood:'dark', text:'The creatures here retain fragments. This one was fiercely loyal — you can see it in how it positions itself between you and the others, protecting them even now, protecting them from you. That protective instinct was the last thing to go.\n\nThis one was playful. Even corrupted, it feints left before striking right. Old habit. Older than the Void\'s presence in it.' },
        { title:'What You Carry', mood:'tense', text:'You are here because you bonded with your creatures. You remember them — their names, their particular ways of moving, the sounds they make when they are happy. That memory is weight you carry. It is also the only weapon that matters here.\n\nFight with it. Remember while you fight.' },
      ]},
      { id:3, name:'The Unbound Rises', reward:360, isBoss:false, panels:[
        { title:'The Convergence', mood:'boss', text:'The final chamber is not a room. It has no walls — or the walls are so far away they might as well not exist. The floor is made of something that reflects everything: your face, your creatures, the battles you have fought to get here.\n\nAt the center, something is assembling itself from the accumulated Void energy of every forgotten bond in Aethermoor\'s history. It is using them as building material.' },
        { title:'The Last Form', mood:'boss', text:'It does not fully form until you are close enough that retreat is no longer a serious option. The shape it takes shifts between configurations — sometimes enormous, sometimes person-sized, sometimes something that has no analogue in any language.\n\nThen it settles into the one form it knows will affect you most. It looks like the first creature you ever bonded with. It speaks in that creature\'s voice.' },
      ]},
      { id:4, name:'BOSS: The Unbound', reward:600, isBoss:true, panels:[
        { title:'Made of Everything Lost', mood:'boss', text:'The Unbound is not a creature, a summoner, or an entity. It is the accumulated weight of every forgotten bond in Aethermoor, given a single purpose by the Void: to demonstrate what forgetting costs.\n\nIt chose your first creature\'s form because it searched your memory and found the bond you carry most carefully. It did this not to hurt you. It did this so you would understand what you are fighting.' },
        { title:'What It Asks', mood:'boss', text:'It does not speak in words. It speaks in the feeling of the first time a creature chose you — the specific combination of surprise and warmth and responsibility that comes from being trusted by something that did not have to trust you.\n\nThen it attacks. Because the Void has taken that feeling and turned it into the most efficient weapon imaginable.' },
        { title:'The Last Bond', mood:'boss', text:'You cannot win this with power. The Unbound is made of Aethermoor\'s collective grief — power only feeds it. You win by remembering. Every creature you have ever fought with, every bond you carry, every name you have not forgotten.\n\nGrip your cards. Think of every battle. Fight not with the strength of what you have defeated.\n\nFight with the strength of what you have kept.' },
      ]},
    ]
  },
];

function isStageUnlocked(chapterId, stageId, progress) {
  if (chapterId === 1 && stageId === 1) return true;
  if (stageId === 1) {
    // Chapter unlocked if prev chapter's last stage done
    const prevChapter = CONQUEST_CHAPTERS.find(c => c.id === chapterId - 1);
    if (!prevChapter) return false;
    const lastStage = prevChapter.stages[prevChapter.stages.length - 1];
    return progress.some(p => p.chapter_id === prevChapter.id && p.stage_id === lastStage.id);
  }
  // Stage 2+ unlocked if prev stage done
  return progress.some(p => p.chapter_id === chapterId && p.stage_id === stageId - 1);
}

function viewConquest() {
  const totalStages = CONQUEST_CHAPTERS.reduce((s, c) => s + c.stages.length, 0);
  const completed = S.conquestProgress.length;
  const pct = Math.round((completed / totalStages) * 100);
  const chapters = CONQUEST_CHAPTERS.map((ch, ci) => {
    const chapterDone = ch.stages.every(st => S.conquestProgress.some(p => p.chapter_id === ch.id && p.stage_id === st.id));
    const chapterStarted = ch.stages.some(st => S.conquestProgress.some(p => p.chapter_id === ch.id && p.stage_id === st.id));
    const firstStageUnlocked = isStageUnlocked(ch.id, 1, S.conquestProgress);
    const locked = !firstStageUnlocked;
    const stages = ch.stages.map(st => {
      const done = S.conquestProgress.some(p => p.chapter_id === ch.id && p.stage_id === st.id);
      const unlocked = isStageUnlocked(ch.id, st.id, S.conquestProgress);
      return `<div class="cq-stage${done?' cq-stage-done':unlocked?'':' cq-stage-locked'}">
        <div class="cq-stage-info">
          <span class="cq-stage-name">${st.name}</span>
          <span class="cq-stage-reward">${done?'<span class="text-gold">Completed</span>':`+${st.reward} coins`}</span>
        </div>
        ${unlocked && !done
          ? `<button class="btn btn-sm btn-primary" onclick="conquestIntro(${ch.id},${st.id})">Battle</button>`
          : done
            ? `<span class="cq-check">&#10003;</span>`
            : `<span class="cq-lock">Locked</span>`}
      </div>`;
    }).join('');
    return `<div class="cq-chapter${locked?' cq-locked':''}${chapterDone?' cq-done':''}" style="--ch-color:${ch.color};--ch-accent:${ch.accent}">
      <div class="cq-chapter-header" onclick="this.parentElement.classList.toggle('cq-expanded')">
        <div class="cq-chapter-num">Ch.${ch.id}</div>
        <div class="cq-chapter-title-wrap">
          <span class="cq-chapter-title">${ch.name}</span>
          <span class="cq-chapter-status">${chapterDone?'Complete':chapterStarted?`${ch.stages.filter(s=>S.conquestProgress.some(p=>p.chapter_id===ch.id&&p.stage_id===s.id)).length}/${ch.stages.length}`:locked?'Locked':'Available'}</span>
        </div>
        <span class="cq-chevron">&#9660;</span>
      </div>
      <div class="cq-chapter-body">
        <p class="cq-lore">${ch.lore}</p>
        <div class="cq-stages">${stages}</div>
      </div>
    </div>`;
  }).join('');
  return `<div class="page-title"><h2>Conquest</h2><p class="text-muted">Journey across Aethermoor — defeat the corrupted and face the Void</p></div>
    <div class="sketch-box" style="margin-bottom:1.5rem">
      <div style="display:flex;justify-content:space-between;margin-bottom:0.5rem">
        <span style="font-family:var(--font-ui);font-size:0.85rem;color:var(--gold-light)">World Progress</span>
        <span class="text-muted" style="font-size:0.85rem">${completed} / ${totalStages} stages</span>
      </div>
      <div class="cq-progress-bar-wrap"><div class="cq-progress-bar-fill" style="width:${pct}%"></div></div>
    </div>
    <div class="cq-chapters">${chapters}</div>`;
}

function _cqSceneArt(chId, isBoss) {
  const arts = {
    1: `<svg viewBox="0 0 600 200" xmlns="http://www.w3.org/2000/svg" class="cq-cin-scene-art">
      <rect width="600" height="200" fill="#040e03"/>
      ${Array.from({length:40},(_,i)=>`<circle cx="${(i*37+13)%600}" cy="${100+Math.sin(i*0.7)*60}" r="${1+i%3}" fill="#2da84a" opacity="${0.15+i%4*0.1}"/>`).join('')}
      <ellipse cx="300" cy="150" rx="280" ry="50" fill="#081a05" opacity="0.8"/>
      ${Array.from({length:12},(_,i)=>`<rect x="${40+i*45}" y="${80+Math.sin(i)*40}" width="${6+i%3*4}" height="${60+i%4*20}" fill="#0d2a09" rx="3"/>`).join('')}
      <circle cx="300" cy="60" r="25" fill="#2da84a" opacity="0.08"/>
    </svg>`,
    2: `<svg viewBox="0 0 600 200" xmlns="http://www.w3.org/2000/svg" class="cq-cin-scene-art">
      <rect width="600" height="200" fill="#080412"/>
      ${Array.from({length:50},(_,i)=>`<circle cx="${(i*23+7)%600}" cy="${(i*19+11)%200}" r="${0.5+i%2}" fill="#8b3fc8" opacity="${0.1+i%5*0.06}"/>`).join('')}
      <ellipse cx="300" cy="120" rx="220" ry="80" fill="#1a0836" opacity="0.6"/>
      ${Array.from({length:8},(_,i)=>`<line x1="${100+i*50}" y1="200" x2="${80+i*55}" y2="${60+i%3*30}" stroke="#4a1a70" stroke-width="${1+i%2}" opacity="0.5"/>`).join('')}
    </svg>`,
    3: `<svg viewBox="0 0 600 200" xmlns="http://www.w3.org/2000/svg" class="cq-cin-scene-art">
      <rect width="600" height="200" fill="#01060f"/>
      <rect x="0" y="120" width="600" height="80" fill="#020e1e"/>
      ${Array.from({length:30},(_,i)=>`<ellipse cx="${(i*41+20)%600}" cy="${130+i%4*10}" rx="${8+i%5*6}" ry="3" fill="#0a2a4a" opacity="${0.3+i%3*0.15}"/>`).join('')}
      ${Array.from({length:15},(_,i)=>`<circle cx="${(i*71+15)%600}" cy="${40+i%6*20}" r="${1+i%3}" fill="#2980b9" opacity="${0.15+i%4*0.08}"/>`).join('')}
    </svg>`,
    4: `<svg viewBox="0 0 600 200" xmlns="http://www.w3.org/2000/svg" class="cq-cin-scene-art">
      <rect width="600" height="200" fill="#0d0200"/>
      ${Array.from({length:20},(_,i)=>`<ellipse cx="${(i*60+30)%600}" cy="${160+i%3*10}" rx="${15+i%4*10}" ry="8" fill="#3a0800" opacity="${0.4+i%3*0.15}"/>`).join('')}
      ${Array.from({length:8},(_,i)=>`<rect x="${50+i*70}" y="${40+i%3*20}" width="4" height="${80+i%4*30}" fill="#8b2000" opacity="0.4" rx="2"/>`).join('')}
      ${Array.from({length:25},(_,i)=>`<circle cx="${(i*43+12)%600}" cy="${(i*17+8)%160}" r="1" fill="#e67e22" opacity="${0.1+i%5*0.06}"/>`).join('')}
    </svg>`,
    5: `<svg viewBox="0 0 600 200" xmlns="http://www.w3.org/2000/svg" class="cq-cin-scene-art">
      <rect width="600" height="200" fill="#01080f"/>
      ${Array.from({length:60},(_,i)=>`<circle cx="${(i*19+5)%600}" cy="${(i*13+3)%200}" r="0.8" fill="#74b9ff" opacity="${0.08+i%6*0.04}"/>`).join('')}
      <rect x="0" y="140" width="600" height="60" fill="#02101a"/>
      ${Array.from({length:10},(_,i)=>`<polygon points="${40+i*55},140 ${55+i*55},80 ${70+i*55},140" fill="#031520" opacity="0.8"/>`).join('')}
    </svg>`,
    6: `<svg viewBox="0 0 600 200" xmlns="http://www.w3.org/2000/svg" class="cq-cin-scene-art">
      <rect width="600" height="200" fill="#02020d"/>
      ${Array.from({length:80},(_,i)=>`<circle cx="${(i*11+3)%600}" cy="${(i*7+1)%200}" r="0.6" fill="#6c5ce7" opacity="${0.06+i%8*0.03}"/>`).join('')}
      <line x1="200" y1="0" x2="220" y2="200" stroke="#a29bfe" stroke-width="0.5" opacity="0.3"/>
      <line x1="380" y1="0" x2="360" y2="200" stroke="#6c5ce7" stroke-width="0.5" opacity="0.3"/>
      ${Array.from({length:5},(_,i)=>`<polygon points="${100+i*100},${20+i*10} ${110+i*100},${5+i*10} ${120+i*100},${20+i*10}" fill="#a29bfe" opacity="${0.05+i*0.03}"/>`).join('')}
    </svg>`,
    7: `<svg viewBox="0 0 600 200" xmlns="http://www.w3.org/2000/svg" class="cq-cin-scene-art">
      <rect width="600" height="200" fill="#010103"/>
      <rect x="270" y="0" width="60" height="200" fill="#0a0a20" opacity="0.8"/>
      ${Array.from({length:20},(_,i)=>`<rect x="${260+i*3}" y="0" width="1" height="200" fill="#a29bfe" opacity="${0.03+i%5*0.01}"/>`).join('')}
      ${Array.from({length:40},(_,i)=>`<circle cx="${(i*31+8)%600}" cy="${(i*23+5)%200}" r="0.7" fill="#6c5ce7" opacity="${0.05+i%6*0.02}"/>`).join('')}
    </svg>`,
    8: `<svg viewBox="0 0 600 200" xmlns="http://www.w3.org/2000/svg" class="cq-cin-scene-art">
      <rect width="600" height="200" fill="#060000"/>
      ${Array.from({length:30},(_,i)=>`<circle cx="${(i*37+11)%600}" cy="${(i*19+7)%200}" r="${0.5+i%3}" fill="#ff4466" opacity="${0.06+i%5*0.03}"/>`).join('')}
      <ellipse cx="300" cy="100" rx="250" ry="90" fill="#1a0000" opacity="0.5"/>
      ${Array.from({length:12},(_,i)=>`<line x1="${(i*97+50)%600}" y1="${(i*61+20)%200}" x2="${(i*83+30)%600}" y2="${(i*71+40)%200}" stroke="#8b0000" stroke-width="0.5" opacity="0.25"/>`).join('')}
    </svg>`,
  };
  return arts[chId] || arts[1];
}

function _cqParticles(chId) {
  const color = CONQUEST_CHAPTERS.find(c=>c.id===chId)?.accent || '#ffffff';
  const wrap = document.getElementById('cq-particles');
  if (!wrap) return;
  wrap.innerHTML = '';
  for (let i = 0; i < 18; i++) {
    const p = document.createElement('div');
    p.className = 'cq-particle';
    p.style.cssText = `left:${Math.random()*100}%;top:${Math.random()*100}%;background:${color};animation-delay:${Math.random()*4}s;animation-duration:${3+Math.random()*4}s;width:${1+Math.random()*3}px;height:${1+Math.random()*3}px;opacity:${0.1+Math.random()*0.3}`;
    wrap.appendChild(p);
  }
}

function conquestIntro(chapterId, stageId) {
  const ch = CONQUEST_CHAPTERS.find(c => c.id === chapterId);
  const st = ch?.stages.find(s => s.id === stageId);
  if (!ch || !st) return;
  const panels = st.panels || [{ title: st.name, text: st.lore || '' }];

  // Remove any existing cinematic
  const old = document.getElementById('cq-cinematic');
  if (old) old.remove();

  const el = document.createElement('div');
  el.id = 'cq-cinematic';
  el.className = 'cq-cinematic' + (st.isBoss ? ' cq-boss-cinematic' : '');
  el.innerHTML = `
    <div class="cq-cin-bg" style="--ch-color:${ch.color};--ch-accent:${ch.accent}">
      ${_cqSceneArt(ch.id, st.isBoss)}
      <div class="cq-cin-particles" id="cq-particles"></div>
      <div class="cq-cin-vignette"></div>
      ${st.isBoss ? '<div class="cq-boss-glow"></div>' : ''}
      <div class="cq-cin-header">
        <div class="cq-cin-chapter-tag">CHAPTER ${ch.id} · ${ch.name.toUpperCase()}</div>
        <div class="cq-cin-stage-label">${st.isBoss ? '💀 BOSS BATTLE' : `Stage ${st.id}`}</div>
      </div>
      <div class="cq-cin-content">
        <div class="cq-cin-panel-title" id="cq-panel-title"></div>
        <div class="cq-cin-panel-text" id="cq-panel-text"></div>
      </div>
      <div class="cq-cin-footer">
        <div class="cq-cin-dots" id="cq-panel-dots"></div>
        <div class="cq-cin-btns">
          <button class="btn btn-sm cq-skip-btn" onclick="cqSkip()">Skip</button>
          <button class="btn btn-primary cq-next-btn" id="cq-next-btn" onclick="cqNext()" disabled>▶ Next</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(el);

  window._cqCin = { ch, st, panels, idx: 0, chapterId, stageId, typing: false, typeTimer: null };
  _cqParticles(ch.id);
  requestAnimationFrame(() => { el.classList.add('cq-cin-visible'); setTimeout(() => _cqStartPanel(0), 500); });
}
window.conquestIntro = conquestIntro;

function _cqStartPanel(idx) {
  const s = window._cqCin;
  if (!s) return;
  if (s.typeTimer) clearTimeout(s.typeTimer);
  s.idx = idx;
  s.typing = true;
  const panel = s.panels[idx];
  const titleEl = document.getElementById('cq-panel-title');
  const textEl  = document.getElementById('cq-panel-text');
  const nextBtn = document.getElementById('cq-next-btn');
  const dotsEl  = document.getElementById('cq-panel-dots');
  if (titleEl) { titleEl.textContent = ''; titleEl.classList.remove('cq-title-in'); void titleEl.offsetWidth; titleEl.textContent = panel.title; titleEl.classList.add('cq-title-in'); }
  if (textEl)  { textEl.textContent = ''; textEl.classList.remove('cq-text-in'); }
  if (nextBtn) { nextBtn.disabled = true; nextBtn.textContent = '▶ Next'; nextBtn.className = 'btn btn-primary cq-next-btn'; }
  if (dotsEl)  dotsEl.innerHTML = s.panels.map((_,i) => `<div class="cq-dot${i===idx?' cq-dot-active':''}"></div>`).join('');
  // Typewriter
  let i = 0;
  const text = panel.text;
  if (textEl) { textEl.classList.add('cq-text-in'); }
  function type() {
    if (!window._cqCin || window._cqCin.idx !== idx) return;
    if (i < text.length) {
      if (textEl) textEl.textContent += text[i++];
      s.typeTimer = setTimeout(type, 16);
    } else {
      s.typing = false;
      if (nextBtn) {
        nextBtn.disabled = false;
        if (idx === s.panels.length - 1) {
          nextBtn.textContent = s.st.isBoss ? '⚔️ FACE THE BOSS' : '⚔️ ENTER BATTLE';
          nextBtn.className = 'btn btn-red btn-lg cq-next-btn cq-enter-btn';
        }
      }
    }
  }
  s.typeTimer = setTimeout(type, 120);
}

window.cqNext = () => {
  const s = window._cqCin;
  if (!s) return;
  if (s.typing) {
    // Skip to end of current panel
    if (s.typeTimer) clearTimeout(s.typeTimer);
    s.typing = false;
    const textEl = document.getElementById('cq-panel-text');
    const nextBtn = document.getElementById('cq-next-btn');
    if (textEl) textEl.textContent = s.panels[s.idx].text;
    if (nextBtn) {
      nextBtn.disabled = false;
      if (s.idx === s.panels.length - 1) {
        nextBtn.textContent = s.st.isBoss ? '⚔️ FACE THE BOSS' : '⚔️ ENTER BATTLE';
        nextBtn.className = 'btn btn-red btn-lg cq-next-btn cq-enter-btn';
      }
    }
    return;
  }
  if (s.idx < s.panels.length - 1) {
    _cqStartPanel(s.idx + 1);
  } else {
    const el = document.getElementById('cq-cinematic');
    if (el) { el.classList.add('cq-cin-exit'); setTimeout(() => { el.remove(); conquestStartBattle(s.chapterId, s.stageId); }, 600); }
    else conquestStartBattle(s.chapterId, s.stageId);
  }
};

window.cqSkip = () => {
  const s = window._cqCin;
  const el = document.getElementById('cq-cinematic');
  if (s?.typeTimer) clearTimeout(s.typeTimer);
  window._cqCin = null;
  if (el) { el.classList.add('cq-cin-exit'); setTimeout(() => { el.remove(); if (s) conquestStartBattle(s.chapterId, s.stageId); }, 400); }
  else if (s) conquestStartBattle(s.chapterId, s.stageId);
};

async function conquestStartBattle(chapterId, stageId) {
  const ch = CONQUEST_CHAPTERS.find(c => c.id === chapterId);
  const st = ch?.stages.find(s => s.id === stageId);
  closeModal();
  S.conquestCtx = { chapterId, stageId, stageName: st?.name, reward: st?.reward, chapterName: ch?.name };
  const page = document.getElementById('page');
  if (page) page.innerHTML = `<div class="page-title"><h2>Conquest Battle</h2></div><div class="spinner"></div>`;
  try {
    const data = await api('/conquest/start', 'POST', { chapterId, stageId });
    S.battle = data;
    nav('conquest_battle');
    startConquestBattlePolling();
  } catch (e) {
    notify(e.message, 'error');
    S.conquestCtx = null;
    nav('conquest');
  }
}
window.conquestStartBattle = conquestStartBattle;

function viewConquestBattle() {
  const ctx = S.conquestCtx;
  if (!S.battle) { nav('conquest'); return ''; }
  if (S.battle.finished) {
    const r = S.battle.ratingResult;
    const won = S.battle.winner === 'player';
    return `<div class="page-title"><h2>Conquest</h2></div>
    <div class="cq-result ${won ? 'cq-result-win' : 'cq-result-loss'}">
      <div class="cq-result-icon">${won ? '⚔️' : '💀'}</div>
      <h2>${won ? 'Victory!' : 'Defeated'}</h2>
      <p class="cq-result-stage">${ctx ? `${ctx.chapterName} &bull; ${ctx.stageName}` : ''}</p>
      ${won && r?.coinsEarned ? `<p class="cq-result-reward">+${r.coinsEarned} coins earned</p>` : ''}
      ${won && r?.bossCardUnlocked ? `<p class="cq-result-reward" style="color:#f5c518">🃏 Boss Card Unlocked: ${r.bossCardUnlocked}</p>` : ''}
      ${won && ctx?.reward ? `<p class="cq-result-lore">${ctx.reward}</p>` : ''}
      ${!won ? `<p class="text-muted" style="margin-top:0.5rem">Your forces were overwhelmed. Regroup and try again.</p>` : ''}
      <div style="display:flex;gap:1rem;justify-content:center;margin-top:1.5rem">
        ${won ? `<button class="btn btn-primary" onclick="nav('conquest')">Continue</button>` : `<button class="btn btn-primary" onclick="conquestRetry()">Try Again</button>`}
        <button class="btn" onclick="nav('conquest')">Return to Conquest</button>
      </div>
    </div>`;
  }
  // Active conquest battle — reuse battle UI with conquest header
  const b = S.battle;
  const pa = b.playerCards[b.playerActive];
  const aa = b.aiCards[b.aiActive];
  const pBench = b.playerCards.map((c,i) => ({c,i})).filter(({i}) => i !== b.playerActive);
  const aBench = b.aiCards.map((c,i) => ({c,i})).filter(({i}) => i !== b.aiActive);
  const log = b.log.slice(-8).map(l => {
    const cls = l.startsWith('You') ? 'log-player' : l.startsWith('Foe') ? 'log-ai' : 'log-system';
    return `<p class="${cls}">${l}</p>`;
  }).join('');
  const canSwitch = pBench.some(({c}) => c.current_hp > 0);
  return `<div class="page-title">
    <h2>Conquest</h2>
    ${ctx ? `<span class="text-muted" style="font-size:0.9rem">${ctx.chapterName} &bull; ${ctx.stageName}</span>` : ''}
  </div>
  <div class="battle-arena">
    <div style="display:flex;justify-content:space-between;align-items:center;padding:0.3rem 0">
      <span style="font-family:var(--font-brush);font-size:1.2rem">Enemy Forces</span>
      <span class="text-muted" style="font-size:0.9rem">${b.aiCards.filter(c=>c.current_hp>0).length} enemies remaining</span>
    </div>
    <div class="battle-field">
      <div class="battle-active-slot foe-slot${aa?.isBossCard?' boss-slot':''}" id="foe-active-slot">
        <div class="battle-label">Enemy</div>
        ${renderCard(aa)}
      </div>
      <div class="vs-divider">VS</div>
      <div class="battle-active-slot">
        <div class="battle-label">Your Champion</div>
        ${renderCard(pa)}
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:1rem">
      <div>
        <div class="battle-label text-muted" style="font-size:0.85rem">Enemy Bench</div>
        <div class="battle-bench">${aBench.map(({c,i}) => renderBenchCard(c, i, false)).join('') || '<span class="text-muted" style="font-size:0.82rem">None</span>'}</div>
      </div>
      <div>
        <div class="battle-label text-muted" style="font-size:0.85rem">Your Bench (click to switch)</div>
        <div class="battle-bench">${pBench.map(({c,i}) => renderBenchCard(c, i, true)).join('') || '<span class="text-muted" style="font-size:0.82rem">None</span>'}</div>
      </div>
    </div>
    <div class="battle-controls">
      ${b.playerTurn && !b.finished ? `
        <button class="btn btn-primary" id="btn-attack" onclick="battleAction('attack')">Attack: ${pa.ability_name} (${pa.ability_power} pwr)</button>
        <button class="btn btn-red" onclick="conquestForfeit()">Retreat</button>
      ` : b.finished
        ? `<button class="btn btn-primary btn-lg" onclick="nav('conquest')">Continue</button>`
        : `<span class="text-muted">Processing...</span>`}
    </div>
    <div class="battle-log" id="battle-log">${log}</div>
  </div>`;
}

window.conquestForfeit = () => { if (confirm('Retreat from this battle?')) battleAction('forfeit'); };
window.conquestRetry = () => {
  if (S.conquestCtx) {
    const { chapterId, stageId } = S.conquestCtx;
    conquestStartBattle(chapterId, stageId);
  } else {
    nav('conquest');
  }
};

function startConquestBattlePolling() {
  if (S._cqBattleInterval) { clearInterval(S._cqBattleInterval); S._cqBattleInterval = null; }
  S._cqBattleInterval = setInterval(async () => {
    if (S.view !== 'conquest_battle') { clearInterval(S._cqBattleInterval); S._cqBattleInterval = null; return; }
    if (S.battle?.finished) { clearInterval(S._cqBattleInterval); S._cqBattleInterval = null; return; }
    try {
      const data = await api('/battle/state');
      S.battle = data;
      const pg = document.getElementById('page');
      if (pg) { pg.innerHTML = viewConquestBattle(); attachListeners(); scrollBattleLog(); }
      if (data.finished) { clearInterval(S._cqBattleInterval); S._cqBattleInterval = null; }
    } catch {
      // 404 = battle completed and cleared — stop polling
      clearInterval(S._cqBattleInterval); S._cqBattleInterval = null;
    }
  }, 1000);
}

// ─── DECK BUILDER ─────────────────────────────────────────────────
function viewDeck() {
  const deck = S.deckCards;
  const slots = Array.from({length:5}, (_,i) => deck[i] || null);
  const deckSlots = slots.map((card,i) => card
    ? `<div class="deck-slot occupied">
        ${renderCard(card)}
        <button class="btn btn-sm btn-red deck-remove-btn" onclick="removeDeckSlot(${i})">Remove</button>
       </div>`
    : `<div class="deck-slot empty" onclick="openDeckPicker()">
        <div class="deck-slot-empty"><span class="deck-plus">+</span><span>Add Card</span></div>
       </div>`
  ).join('');

  const typeButtons = TYPES.map(t =>
    `<button class="btn btn-sm type-filter-btn" style="background:${typeColor(t)}22;border:1px solid ${typeColor(t)}66;color:${typeColor(t)}" onclick="autoBuildDeck('type','${t}')">${t}</button>`
  ).join('');

  return `<div class="page-title"><h2>Deck Builder</h2><p class="text-muted">Choose up to 5 cards for battle</p></div>
  <div class="deck-layout">
    <div>
      <div class="sketch-box">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
          <h3>Your Deck <span class="text-muted" style="font-size:0.85rem">${deck.length}/5</span></h3>
          <div style="display:flex;gap:0.5rem">
            <button class="btn btn-sm btn-primary" onclick="openDeckPicker()">+ Pick Cards</button>
            ${deck.length ? `<button class="btn btn-sm btn-red" onclick="clearDeck()">Clear</button>` : ''}
          </div>
        </div>
        <div class="deck-grid">${deckSlots}</div>
      </div>
    </div>
    <div>
      <div class="sketch-box mb-2">
        <h3 style="margin-bottom:0.75rem">Auto-Build</h3>
        <button class="btn btn-primary" style="width:100%;margin-bottom:0.75rem" onclick="autoBuildDeck('best')">⚡ Best Overall</button>
        <p class="text-muted mb-2" style="font-size:0.82rem">Build by type:</p>
        <div class="type-btn-grid">${typeButtons}</div>
      </div>
      <div class="sketch-box">
        <h3 style="margin-bottom:0.5rem">Ready to Battle?</h3>
        <p class="text-muted mb-2" style="font-size:0.85rem">${deck.length === 0 ? 'Build a deck first.' : deck.length < 5 ? `${5-deck.length} slot(s) open.` : 'Deck full — ready!'}</p>
        <div style="display:flex;gap:0.75rem;flex-wrap:wrap">
          <button class="btn btn-primary" onclick="nav('battle')" ${!deck.length?'disabled':''}>VS AI</button>
          <button class="btn btn-gold" onclick="nav('pvp')" ${!deck.length?'disabled':''}>Online PvP</button>
          <button class="btn" onclick="nav('conquest')" ${!deck.length?'disabled':''}>Conquest</button>
        </div>
      </div>
    </div>
  </div>`;
}

window.removeDeckSlot = async (idx) => {
  S.deckCards.splice(idx, 1);
  S.deck = S.deckCards.map(c => c.id);
  if (S.deck.length) {
    await api('/deck','PUT',{card_ids: S.deck}).catch(() => {});
  }
  document.getElementById('page').innerHTML = viewDeck();
  attachListeners();
};

window.clearDeck = async () => {
  if (!confirm('Clear your deck?')) return;
  S.deckCards = []; S.deck = [];
  document.getElementById('page').innerHTML = viewDeck();
  attachListeners();
};

window.openDeckPicker = () => {
  S._pickerDeckIds = new Set(S.deckCards.map(c => c.id));
  renderDeckPickerModal();
};

function renderDeckPickerModal() {
  const deckIds = S._pickerDeckIds || new Set();
  const typeFilter = S._pickerType || '';
  const search = S._pickerSearch || '';
  let cards = (S.collection || []).filter(c => c.quantity > 0);
  if (typeFilter) cards = cards.filter(c => c.type === typeFilter);
  if (search) cards = cards.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

  const typeOpts = ['', ...TYPES].map(t => `<option value="${t}" ${typeFilter===t?'selected':''}>${t||'All Types'}</option>`).join('');
  const grid = cards.slice(0,50).map(c => {
    const sel = deckIds.has(c.id);
    return `<div class="deck-pick-wrap${sel?' deck-pick-sel':''}" onclick="togglePickCard(${c.id})">
      ${renderCard(c)}
      ${sel ? `<div class="deck-pick-check">✓</div>` : ''}
    </div>`;
  }).join('') || '<p class="text-muted text-center" style="grid-column:1/-1">No cards found.</p>';

  openModal(`<div class="deck-picker-modal">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;flex-wrap:wrap;gap:0.5rem">
      <h3>Pick Cards <span class="text-muted" style="font-size:0.85rem">${deckIds.size}/5</span></h3>
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
        <input class="input-box" placeholder="Search..." style="max-width:160px" value="${search}" oninput="pickerSearch(this.value)">
        <select class="input-box" style="max-width:130px" onchange="pickerType(this.value)">${typeOpts}</select>
        <button class="btn btn-primary" onclick="saveDeckFromPicker()">Save</button>
        <button class="btn" onclick="closeModal()">Cancel</button>
      </div>
    </div>
    <div class="deck-picker-grid">${grid}</div>
  </div>`);
}

window.togglePickCard = (id) => {
  if (!S._pickerDeckIds) S._pickerDeckIds = new Set();
  if (S._pickerDeckIds.has(id)) { S._pickerDeckIds.delete(id); }
  else {
    if (S._pickerDeckIds.size >= 5) { notify('Deck is full (5 cards max)', 'error'); return; }
    S._pickerDeckIds.add(id);
  }
  renderDeckPickerModal();
};
window.pickerSearch = (v) => { S._pickerSearch = v; renderDeckPickerModal(); };
window.pickerType   = (v) => { S._pickerType = v; renderDeckPickerModal(); };

window.saveDeckFromPicker = async () => {
  const ids = [...(S._pickerDeckIds || [])];
  if (!ids.length) { notify('Select at least 1 card', 'error'); return; }
  try {
    await api('/deck','PUT',{card_ids: ids});
    const fresh = await api('/deck');
    S.deck = fresh.card_ids; S.deckCards = fresh.cards;
    S._pickerDeckIds = null; S._pickerSearch = ''; S._pickerType = '';
    closeModal();
    document.getElementById('page').innerHTML = viewDeck();
    attachListeners();
    notify('Deck saved!', 'success');
  } catch(e) { notify(e.message,'error'); }
};

window.autoBuildDeck = async (mode, type) => {
  try {
    const data = await api('/deck/auto','POST',{ mode, type });
    S.deck = data.card_ids; S.deckCards = data.cards;
    document.getElementById('page').innerHTML = viewDeck();
    attachListeners();
    notify(`Deck built: ${data.cards.map(c=>c.name).join(', ')}`, 'success');
  } catch(e) { notify(e.message,'error'); }
};

// ─── PVP ──────────────────────────────────────────────────────────
function viewPvp() {
  const noDeck = !S.deckCards.length;
  return `<div class="page-title"><h2>Online PvP</h2><p class="text-muted">Battle other players in real-time</p></div>
  <div style="max-width:520px;margin:0 auto">
    ${noDeck ? `<div class="sketch-box text-center">
      <p class="text-muted mb-2">You need a deck to play PvP.</p>
      <button class="btn btn-primary" onclick="nav('deck')">Build Deck</button>
    </div>` : `
    <div class="sketch-box text-center mb-2">
      <h3 style="margin-bottom:0.5rem">Find a Match</h3>
      <p class="text-muted mb-2" style="font-size:0.85rem">Deck: ${S.deckCards.map(c=>`<span style="color:${typeColor(c.type)}">${c.name}</span>`).join(', ')}</p>
      <div style="display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;margin-top:1rem">
        <button class="btn btn-primary btn-lg" onclick="joinPvpQueue(true)">⚔️ Ranked Match</button>
        <button class="btn btn-lg" onclick="joinPvpQueue(false)">🎮 Casual Match</button>
      </div>
    </div>
    <div class="sketch-box">
      <h4 style="margin-bottom:0.5rem">How PvP Works</h4>
      <ul style="font-size:0.87rem;color:var(--text-muted);line-height:1.8;padding-left:1.2rem">
        <li>Your saved deck is used in every match</li>
        <li>30 seconds per turn — auto-attack on timeout</li>
        <li>Ranked matches affect your ELO rating</li>
        <li>Defeat all opponent creatures to win</li>
        <li>Ranked wins award <strong>50 coins</strong>, casual wins <strong>20 coins</strong></li>
      </ul>
    </div>`}
  </div>`;
}

function viewPvpQueue() {
  return `<div class="page-title"><h2>${S._pvpRanked ? 'Ranked' : 'Casual'} Queue</h2></div>
  <div class="pvp-queue-box text-center">
    <div class="pvp-spinner"></div>
    <h3 style="margin:1.25rem 0 0.4rem">Finding Opponent...</h3>
    <p class="text-muted" id="queue-time">0s elapsed</p>
    <p class="text-muted" style="font-size:0.82rem;margin-top:0.4rem">Playing with your saved deck</p>
    <button class="btn btn-red mt-2" onclick="leavePvpQueue()">Cancel</button>
  </div>`;
}

function viewPvpBattle() {
  const b = S.pvpBattle;
  if (!b) { nav('pvp'); return ''; }
  const opp = b.opponentUsername || 'Opponent';
  const modeLabel = b.ranked ? '⚔️ Ranked' : '🎮 Casual';
  if (b.finished) {
    const won = b.winner === 'player';
    const r = b.ratingResult;
    return `<div class="page-title"><h2>PvP Battle</h2><span class="text-muted" style="font-size:0.9rem">${modeLabel}</span></div>
    <div class="cq-result ${won?'cq-result-win':'cq-result-loss'}">
      <div class="cq-result-icon">${won?'⚔️':'💀'}</div>
      <h2>${won?'Victory!':'Defeated'}</h2>
      <p class="cq-result-stage">vs <strong>${opp}</strong></p>
      ${r?.newRating ? `<p class="cq-result-reward">Rating: ${r.newRating} (${r.title})</p>` : ''}
      ${r?.coinsEarned ? `<p style="color:var(--gold);margin-top:0.25rem">+${r.coinsEarned} coins</p>` : ''}
      <div style="display:flex;gap:1rem;justify-content:center;margin-top:1.5rem">
        <button class="btn btn-primary" onclick="joinPvpQueue(${b.ranked})">Play Again</button>
        <button class="btn" onclick="nav('pvp')">Back</button>
      </div>
    </div>`;
  }
  const pa = b.playerCards[b.playerActive];
  const aa = b.aiCards[b.aiActive];
  const pBench = b.playerCards.map((c,i)=>({c,i})).filter(({i})=>i!==b.playerActive);
  const aBench = b.aiCards.map((c,i)=>({c,i})).filter(({i})=>i!==b.aiActive);
  const log = b.log.slice(-8).map(l => {
    const cls = l.startsWith('[Auto]')?'log-system':l.includes(opp)?'log-ai':'log-player';
    return `<p class="${cls}">${l}</p>`;
  }).join('');
  const oppRemain = b.aiCards.filter(c=>c.current_hp>0).length;
  return `<div class="page-title">
    <h2>PvP</h2>
    <span class="text-muted" style="font-size:0.9rem">${modeLabel} · vs <strong>${opp}</strong> · ${oppRemain} remaining</span>
  </div>
  <div class="battle-arena battle-arena-bg${b.playerTurn?' battle-turn-glow':''}">
    <div style="display:flex;justify-content:flex-end;margin-bottom:0.4rem">
      ${b.playerTurn && !b.finished
        ? `<span class="pvp-turn-badge your-turn">Your Turn · ${b.turnTimeLeft}s</span>`
        : `<span class="pvp-turn-badge opp-turn">Waiting for ${opp}...</span>`}
    </div>
    <div class="battle-field">
      <div class="battle-active-slot foe-slot" id="foe-active-slot">
        ${_hpBarHtml(aa)}
        ${renderCard(aa)}
      </div>
      <div class="battle-vs-center">
        <div class="vs-text">VS</div>
        <div class="battle-lightning">⚡</div>
        <div style="font-size:0.65rem;color:var(--ink-light);font-family:var(--font-ui);text-align:center;margin-top:0.4rem">${opp.toUpperCase()}</div>
      </div>
      <div class="battle-active-slot player-slot" id="player-active-slot">
        ${_hpBarHtml(pa)}
        ${renderCard(pa)}
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:1rem">
      <div>
        <div class="battle-label text-muted" style="font-size:0.85rem">Opponent Bench</div>
        <div class="battle-bench">${aBench.map(({c,i})=>renderBenchCard(c,i,false)).join('')||'<span class="text-muted" style="font-size:0.82rem">None</span>'}</div>
      </div>
      <div>
        <div class="battle-label text-muted" style="font-size:0.85rem">Your Bench</div>
        <div class="battle-bench">${pBench.map(({c,i})=>renderBenchCard(c,i,true)).join('')||'<span class="text-muted" style="font-size:0.82rem">None</span>'}</div>
      </div>
    </div>
    <div class="battle-controls">
      ${b.playerTurn && !b.finished
        ? `<button class="btn btn-primary" id="btn-attack" onclick="pvpAction('attack')">⚔️ ${pa.ability_name} (${pa.ability_power} pwr)</button>
           <button class="btn btn-red" onclick="pvpForfeit()">Forfeit</button>`
        : b.finished
          ? `<button class="btn btn-primary btn-lg" onclick="nav('pvp')">Back to PvP</button>`
          : `<span class="text-muted">Waiting for ${opp} to move...</span>`}
    </div>
    <div class="battle-log" id="battle-log">${log}</div>
  </div>`;
}

async function joinPvpQueue(ranked) {
  S._pvpRanked = !!ranked;
  try {
    const data = await api('/pvp/queue','POST',{ranked});
    if (data.status === 'in_battle' || data.status === 'matched') {
      S.pvpBattle = await api('/pvp/battle');
      nav('pvp_battle');
      startPvpBattlePolling();
    } else {
      nav('pvp_queue');
      startPvpQueuePolling();
    }
  } catch(e) { notify(e.message,'error'); }
}
window.joinPvpQueue = joinPvpQueue;

function startPvpQueuePolling() {
  if (S._pvpPolling) clearInterval(S._pvpPolling);
  let elapsed = 0;
  S._pvpPolling = setInterval(async () => {
    elapsed += 2;
    const el = document.getElementById('queue-time');
    if (el) el.textContent = elapsed + 's elapsed';
    try {
      const status = await api('/pvp/queue/status');
      if (status.status === 'matched') {
        clearInterval(S._pvpPolling); S._pvpPolling = null;
        S.pvpBattle = await api('/pvp/battle');
        nav('pvp_battle');
        startPvpBattlePolling();
      } else if (status.status === 'idle') {
        clearInterval(S._pvpPolling); S._pvpPolling = null;
        nav('pvp');
      }
    } catch {}
  }, 2000);
}

function startPvpBattlePolling() {
  if (S._pvpPolling) clearInterval(S._pvpPolling);
  S._pvpPolling = setInterval(async () => {
    if (S.view !== 'pvp_battle') { clearInterval(S._pvpPolling); S._pvpPolling = null; return; }
    try {
      const data = await api('/pvp/battle');
      S.pvpBattle = data;
      document.getElementById('page').innerHTML = viewPvpBattle();
      attachListeners(); scrollBattleLog();
      if (data.finished) {
        clearInterval(S._pvpPolling); S._pvpPolling = null;
        if (data.ratingResult?.win) {
          S.user.coins += data.ratingResult.coinsEarned || 0;
          updateNavCoins();
          notify(data.ratingResult.newRating ? `Victory! Rating: ${data.ratingResult.newRating}` : `Victory! +${data.ratingResult.coinsEarned} coins`, 'success');
        } else {
          notify(data.ratingResult?.newRating ? `Defeated. Rating: ${data.ratingResult.newRating}` : 'Defeated!', 'info');
        }
        if (data.ranked) S.myRank = await api('/ranked/me').catch(() => S.myRank);
      }
    } catch {}
  }, 2000);
}

async function pvpAction(action, extra = {}) {
  const btn = document.getElementById('btn-attack');
  if (btn) btn.disabled = true;

  const prevBattle = S.pvpBattle ? {
    ...S.pvpBattle,
    playerCards: S.pvpBattle.playerCards.map(c => ({...c})),
    aiCards:     S.pvpBattle.aiCards.map(c => ({...c})),
    log:         [...S.pvpBattle.log],
  } : null;

  try {
    const data = await api('/pvp/action','POST',{action,...extra});

    if (prevBattle && action === 'attack') {
      await battleAnimate(prevBattle, data);
    } else if (action === 'switch') {
      playBattleSound('switch');
    }

    S.pvpBattle = data;
    document.getElementById('page').innerHTML = viewPvpBattle();
    attachListeners(); scrollBattleLog();
    if (data.finished) {
      clearInterval(S._pvpPolling); S._pvpPolling = null;
      if (data.ratingResult?.win) {
        S.user.coins += data.ratingResult.coinsEarned || 0;
        updateNavCoins();
        notify(data.ratingResult.newRating ? `Victory! Rating: ${data.ratingResult.newRating} (${data.ratingResult.title})` : `Victory! +${data.ratingResult.coinsEarned} coins`, 'success');
        playBattleSound('victory');
      } else {
        notify(data.ratingResult?.newRating ? `Defeated. New rating: ${data.ratingResult.newRating}` : 'Defeated!', 'info');
        playBattleSound('defeat');
      }
      if (data.ranked) S.myRank = await api('/ranked/me').catch(() => S.myRank);
    }
  } catch(e) { notify(e.message,'error'); if (btn) btn.disabled = false; }
}
window.pvpAction   = pvpAction;
window.pvpForfeit  = () => { if (confirm('Forfeit this match?')) pvpAction('forfeit'); };
window.leavePvpQueue = async () => {
  if (S._pvpPolling) { clearInterval(S._pvpPolling); S._pvpPolling = null; }
  await api('/pvp/queue','DELETE').catch(()=>{});
  nav('pvp');
};

// ─── SHOP ─────────────────────────────────────────────────────────
const PACK_TYPES = [
  {
    id: 'basic', name: 'Basic Pack', cost: 100, count: 5,
    bgGrad: 'linear-gradient(160deg,#0d1640,#070e28)',
    glowColor: 'rgba(0,180,230,0.3)',
    accentColor: '#4dd9ff',
    badgeStyle: 'background:rgba(0,180,230,0.15);color:#4dd9ff;border:1px solid rgba(0,180,230,0.4)',
    badge: 'STANDARD',
    desc: 'Standard pack with all rarity chances.',
    odds: 'Common / Uncommon / Rare / Ultra Rare / Mythic',
  },
  {
    id: 'rare', name: 'Rare Pack', cost: 300, count: 5,
    bgGrad: 'linear-gradient(160deg,#0a2a4a,#050f1f)',
    glowColor: 'rgba(36,113,163,0.4)',
    accentColor: '#74b9ff',
    badgeStyle: 'background:rgba(36,113,163,0.2);color:#74b9ff;border:1px solid rgba(36,113,163,0.5)',
    badge: 'RARE+',
    desc: 'Every card is guaranteed Rare or higher.',
    odds: 'Rare / Ultra Rare / Numbered / Mythic',
  },
  {
    id: 'ultra', name: 'Ultra Pack', cost: 800, count: 7,
    bgGrad: 'linear-gradient(160deg,#1a0a00,#0d0400)',
    glowColor: 'rgba(212,160,23,0.35)',
    accentColor: '#f0c040',
    badgeStyle: 'background:rgba(212,160,23,0.2);color:#f0c040;border:1px solid rgba(212,160,23,0.5)',
    badge: 'ULTRA RARE+',
    desc: '7 cards — all Ultra Rare or better.',
    odds: 'Ultra Rare / Full Art / Numbered / Mythic',
  },
  {
    id: 'mythic', name: 'Mythic Pack', cost: 2500, count: 10,
    bgGrad: 'linear-gradient(160deg,#18002e,#080012)',
    glowColor: 'rgba(139,63,200,0.45)',
    accentColor: '#c080ff',
    badgeStyle: 'background:rgba(139,63,200,0.25);color:#c080ff;border:1px solid rgba(139,63,200,0.6)',
    badge: 'MYTHIC',
    desc: '10 guaranteed Mythic, Prism, Numbered, or Secret Rare.',
    odds: 'Mythic / Prism / Numbered / Secret Rare',
  },
];

function viewShop() {
  const coins = S.user?.coins || 0;
  const packs = PACK_TYPES.map(p => {
    const canAfford = coins >= p.cost;
    return `<div class="shop-pack">
      <div class="shop-pack-inner">
        <div class="shop-pack-art" style="background:${p.bgGrad}">
          <div class="shop-pack-glow" style="background:radial-gradient(ellipse at 50% 70%,${p.glowColor},transparent 70%)"></div>
          <span class="shop-pack-badge" style="${p.badgeStyle}">${p.badge}</span>
          <div class="shop-pack-name" style="color:${p.accentColor};text-shadow:0 0 18px ${p.glowColor}">${p.name}</div>
          <div class="shop-pack-count">${p.count} Cards</div>
        </div>
        <div class="shop-pack-info">
          <p class="shop-pack-desc">${p.desc}</p>
          <p class="shop-pack-odds">${p.odds}</p>
          <div class="shop-pack-footer">
            <span class="shop-pack-cost">${p.cost} coins</span>
            <button class="btn ${p.id === 'mythic' || p.id === 'ultra' ? 'btn-gold' : 'btn-primary'} btn-sm"
              onclick="shopOpenPack('${p.id}',${p.cost},${p.count})"
              ${!canAfford ? 'disabled style="opacity:0.4;cursor:not-allowed"' : ''}>
              ${canAfford ? 'Open Pack' : 'Need more coins'}
            </button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
  const promoSection = S._promoCards?.length ? `
    <div class="sketch-box mt-3">
      <h3 style="margin-bottom:1rem">Promo Cards</h3>
      <p class="text-muted mb-2" style="font-size:0.88rem">Exclusive cards — limited availability. Buy once with coins.</p>
      <div class="promo-shop-grid">${S._promoCards.map(c => {
        const tc = typeColor(c.type);
        const canAfford = coins >= c.shop_price;
        return `<div class="promo-shop-item rarity-${(c.rarity||'mythic').toLowerCase()}">
          <div class="promo-shop-art art-${(c.type||'fire').toLowerCase()}">${cardTypeSVG(c.type)}</div>
          <div class="promo-shop-name">${c.name}</div>
          <div class="promo-shop-type" style="color:${tc}">${c.type} — ${c.rarity?.replace('_',' ')}</div>
          <div class="promo-shop-stats">${c.hp} HP · ${c.atk} ATK · ${c.def} DEF</div>
          ${c.is_numbered && c.print_limit ? `<div style="font-size:0.72rem;color:var(--gold-light);font-family:var(--font-ui);margin:0.15rem 0">${c.print_limit - (c.print_count||0)} / ${c.print_limit} left</div>` : ''}
          ${c.expires_at ? `<div style="font-size:0.72rem;color:var(--red);font-family:var(--font-ui);margin:0.15rem 0">⏳ ${_promoTimeLeft(c.expires_at)}</div>` : ''}
          <div class="promo-shop-price text-gold">${c.shop_price} coins</div>
          <button class="btn btn-gold btn-sm" onclick="buyPromo(${c.id},'${c.name}',${c.shop_price})" ${!canAfford?'disabled style="opacity:0.4"':''}>
            ${canAfford ? 'Buy' : 'Need more coins'}
          </button>
        </div>`;
      }).join('')}</div>
    </div>` : '';
  return `<div class="page-title"><h2>Shop</h2><p class="text-muted">Spend your coins to open packs and grow your collection</p></div>
    <div class="shop-coins-bar sketch-box mb-3">
      <span>Your coins: <strong class="text-gold">${coins}</strong></span>
      <span class="text-muted" style="font-size:0.88rem">Earn more by winning ranked battles and claiming your daily reward</span>
    </div>
    <div class="shop-grid">${packs}</div>
    ${promoSection}`;
}

function _promoTimeLeft(expiresAt) {
  const ms = new Date(expiresAt) - Date.now();
  if (ms <= 0) return 'Expired';
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return `Expires in ${d}d ${h}h`;
  if (h > 0) return `Expires in ${h}h ${m}m`;
  return `Expires in ${m}m`;
}

window.buyPromo = async (id, name, price) => {
  if (!confirm(`Buy "${name}" for ${price} coins?`)) return;
  try {
    const r = await api('/shop/promos/' + id + '/buy', 'POST');
    S.user.coins -= price;
    updateNavCoins();
    S.collection.push(r.card);
    S._promoCards = S._promoCards.filter(c => c.id !== id);
    notify('Promo card acquired: ' + name, 'success');
    document.getElementById('page').innerHTML = getView();
    attachListeners();
  } catch (e) { notify(e.message, 'error'); }
};

window.shopOpenPack = async (packType, cost, count) => {
  if (!S.user || S.user.coins < cost) { notify('Not enough coins', 'error'); return; }
  // Build face-down card slots
  const slots = Array.from({length: count}, (_,i) => `
    <div class="pack-slot" id="ps-${i}" onclick="flipPackCard(${i})">
      <div class="pack-slot-inner">
        <div class="pack-face">
          <div class="card-back"><div class="card-back-label">Mythical TCG</div></div>
        </div>
        <div class="pack-back-face" id="pf-${i}"></div>
      </div>
    </div>`).join('');
  openModal(`
    <div class="pack-open-header">
      <h3>Opening Pack...</h3>
      <p class="text-muted">Tap each card to reveal it</p>
    </div>
    <div class="pack-reveal-grid" id="pack-grid">${slots}</div>
    <div class="pack-open-controls text-center mt-2">
      <button class="btn btn-gold" onclick="revealAllPackCards()">Reveal All</button>
      <button class="btn btn-primary" onclick="closeModal()">Done</button>
    </div>`);
  try {
    const data = await api('/packs/open', 'POST', { packType });
    S.user.coins -= cost;
    updateNavCoins();
    window._packCards = data.cards;
    data.cards.forEach((c,i) => {
      const el = document.getElementById('pf-' + i);
      if (el) el.innerHTML = renderCard(c);
      S.collection.push({ ...c, quantity: 1 });
    });
    // Staggered entrance animation on slots
    document.querySelectorAll('.pack-slot').forEach((el, i) => {
      el.style.animation = `packCardDeal 0.35s ${i * 0.07}s both`;
    });
    document.querySelector('.pack-open-header h3').textContent = 'Your Cards!';
  } catch (e) { notify(e.message, 'error'); closeModal(); }
};

window.revealAllPackCards = () => {
  document.querySelectorAll('.pack-slot').forEach((el, i) => {
    setTimeout(() => el.classList.add('flipped'), i * 120);
  });
};

// ─── CARD BROWSER ──────────────────────────────────────────────────
function viewCardBrowser() {
  const perPage = 24;
  const totalPages = Math.max(1, Math.ceil(S.cbTotal / perPage));
  const grid = S.cbCards.length
    ? `<div class="card-grid">${S.cbCards.map(c => renderCard(c,'normal',`showCardDetail(${c.id})`)).join('')}</div>`
    : '<p class="text-muted" style="padding:2rem 0;text-align:center">No cards found.</p>';
  const pages = totalPages <= 1 ? '' : `
    <div class="cb-pagination">
      <button class="btn btn-sm" onclick="cbGoPage(${S.cbPage - 1})" ${S.cbPage <= 1 ? 'disabled' : ''}>Prev</button>
      <span class="text-muted" style="padding:0 0.8rem">Page ${S.cbPage} / ${totalPages}</span>
      <button class="btn btn-sm" onclick="cbGoPage(${S.cbPage + 1})" ${S.cbPage >= totalPages ? 'disabled' : ''}>Next</button>
    </div>`;
  const rarityColors = {Common:'#8ca8cc',Uncommon:'#808b96',Rare:'#2471a3',Ultra_Rare:'#d4a017',Secret_Rare:'#e74c3c',Full_Art:'#c0392b',Parallel:'#2471a3',Numbered:'#d4a017',Prism:'#6c5ce7',Mythic:'#8b3fc8'};
  const rarityBadges = RARITIES.map(r => {
    const active = S.cbRarity === r;
    return `<span class="rarity-filter-btn${active?' active':''}" style="${active?`background:${rarityColors[r]||'#444'};color:#fff;border-color:${rarityColors[r]||'#444'}`:`border-color:${rarityColors[r]||'#444'};color:${rarityColors[r]||'#8ca8cc'}`}" onclick="cbSetRarity('${r}')">${rarityLabel(r)}</span>`;
  }).join('');
  return `<div class="page-title"><h2>All Cards</h2><p class="text-muted">${S.cbTotal ? S.cbTotal.toLocaleString() + ' cards total' : 'Loading...'}</p></div>
    <div class="sketch-box mb-3">
      <div class="cb-filters">
        <input class="input-box" id="cb-search" placeholder="Search name..." value="${S.cbSearch}" oninput="cbSearchDebounce(this.value)" style="max-width:240px">
        <select class="input-box" onchange="cbSetType(this.value)" style="max-width:160px">
          <option value="">All Types</option>
          ${TYPES.map(t => `<option value="${t}"${S.cbType===t?' selected':''}>${t}</option>`).join('')}
        </select>
        <button class="btn btn-sm" onclick="cbClear()">Clear</button>
      </div>
      <div class="cb-rarity-row">
        <span class="rarity-filter-btn${!S.cbRarity?' active':''}" onclick="cbSetRarity('')" style="${!S.cbRarity?'background:var(--cyan-dark);color:#fff;border-color:var(--cyan-dark)':''}">All</span>
        ${rarityBadges}
      </div>
    </div>
    <div id="cb-grid">${grid}</div>
    ${pages}`;
}

let _cbSearchTimer = null;
window.cbSearchDebounce = (v) => {
  clearTimeout(_cbSearchTimer);
  _cbSearchTimer = setTimeout(() => { S.cbSearch = v; S.cbPage = 1; loadCardBrowser(); }, 350);
};
window.cbSetType = (v) => { S.cbType = v; S.cbPage = 1; loadCardBrowser(); };
window.cbSetRarity = (v) => { S.cbRarity = v; S.cbPage = 1; loadCardBrowser(); };
window.cbClear = () => { S.cbType = ''; S.cbRarity = ''; S.cbSearch = ''; S.cbPage = 1; loadCardBrowser(); };
window.cbGoPage = (p) => { S.cbPage = p; loadCardBrowser(); };

async function loadCardBrowser() {
  const perPage = 24;
  const params = new URLSearchParams({ page: S.cbPage, limit: perPage });
  if (S.cbType)   params.set('type', S.cbType);
  if (S.cbRarity) params.set('rarity', S.cbRarity);
  if (S.cbSearch) params.set('search', S.cbSearch);
  try {
    const data = await api('/cards?' + params);
    S.cbCards = data.cards;
    S.cbTotal = data.total;
    const page = document.getElementById('page');
    if (page && S.view === 'cards') { page.innerHTML = viewCardBrowser(); attachListeners(); }
  } catch (e) { notify(e.message, 'error'); }
}

// ─── COLLECTION ───────────────────────────────────────────────────
function viewCollection() {
  const filterBar = `
    <div class="sketch-box filter-panel">
      <div class="filter-title">Filter Cards</div>
      <div class="form-group">
        <input class="input-box" id="col-search" placeholder="Search name..." value="${S.filterSearch}" oninput="colSearch(this.value)">
      </div>
      <div class="filter-section">
        <h4>Type</h4>
        <select class="input-box" onchange="colType(this.value)">
          <option value="">All Types</option>
          ${TYPES.map(t => `<option value="${t}"${S.filterType===t?' selected':''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="filter-section">
        <h4>Rarity</h4>
        <select class="input-box" onchange="colRarity(this.value)">
          <option value="">All Rarities</option>
          ${RARITIES.map(r => `<option value="${r}"${S.filterRarity===r?' selected':''}>${rarityLabel(r)}</option>`).join('')}
        </select>
      </div>
      <div style="margin-top:1rem">
        <button class="btn btn-gold" style="width:100%;margin-bottom:0.5rem" onclick="openPackModal()">Open Pack (100 coins)</button>
        <button class="btn" style="width:100%" onclick="colReset()">Clear Filters</button>
      </div>
      <div class="text-muted mt-2" style="font-size:0.85rem">${S.collection.length} cards owned</div>
    </div>`;

  const cards = getFilteredCollection();
  const grid = cards.length
    ? `<div class="card-grid">${cards.map((c,i) => renderCard(c,'normal',`showCardDetail(${c.id})`)).join('')}</div>`
    : '<p class="text-muted" style="padding:2rem 0">No cards match your filters.</p>';

  return `<div class="page-title"><h2>My Collection</h2></div>
    <div class="collection-layout">
      ${filterBar}
      <div>${grid}</div>
    </div>`;
}

function getFilteredCollection() {
  return S.collection.filter(c => {
    if (S.filterType && c.type !== S.filterType) return false;
    if (S.filterRarity && c.rarity !== S.filterRarity) return false;
    if (S.filterSearch && !c.name.toLowerCase().includes(S.filterSearch.toLowerCase())) return false;
    return true;
  });
}

window.colSearch = (v) => { S.filterSearch = v; document.querySelector('#page .card-grid, #page .text-muted').outerHTML = getFilteredCollection().length ? `<div class="card-grid">${getFilteredCollection().map(c => renderCard(c,'normal',`showCardDetail(${c.id})`)).join('')}</div>` : '<p class="text-muted">No cards match.</p>'; };
window.colType   = (v) => { S.filterType = v; document.getElementById('page').innerHTML = viewCollection(); attachListeners(); };
window.colRarity = (v) => { S.filterRarity = v; document.getElementById('page').innerHTML = viewCollection(); attachListeners(); };
window.colReset  = () => { S.filterType=''; S.filterRarity=''; S.filterSearch=''; document.getElementById('page').innerHTML = viewCollection(); attachListeners(); };

function showCardDetail(id) {
  const card = S.collection.find(c => c.id === id) || S.allCards.find(c => c.id === id);
  if (!card) return;
  openModal(`<div style="display:flex;gap:1.5rem;flex-wrap:wrap;align-items:flex-start">
    ${renderCard(card,'large')}
    <div style="flex:1;min-width:200px">
      <h3 style="margin-bottom:0.8rem">${card.name}</h3>
      <div class="stat-row mb-1"><span class="label">Set</span><span>${card.set_name || '-'}</span></div>
      <div class="stat-row mb-1"><span class="label">Art Style</span><span>${card.art_style || '-'}</span></div>
      <div class="stat-row mb-1"><span class="label">Rarity</span><span>${rarityLabel(card.rarity)}</span></div>
      ${card.is_numbered ? `<div class="stat-row mb-1"><span class="label">Print Run</span><span>${card.print_run ? card.print_run + ' copies' : 'N/A'}</span></div>` : ''}
      <hr class="divider">
      <p class="flavor-text">"${card.flavor_text || ''}"</p>
      ${card.quantity ? `<p class="mt-2 text-muted">Owned: ${card.quantity}x</p>` : ''}
    </div>
  </div>`);
}
window.showCardDetail = showCardDetail;

async function openPackModal() {
  if (!S.user || S.user.coins < 100) { notify('Not enough coins (need 100)', 'error'); return; }
  const backs = Array(5).fill(0).map((_,i) => `
    <div class="pack-slot" id="ps-${i}" onclick="flipPackCard(${i})">
      <div class="pack-slot-inner">
        <div class="pack-face">
          <div class="card-back"><div class="card-back-label">Mythical TCG</div></div>
        </div>
        <div class="pack-back-face" id="pf-${i}"></div>
      </div>
    </div>`).join('');
  openModal(`<h3 style="margin-bottom:1rem">Opening Pack...</h3>
    <p class="text-muted mb-2">Tap each card to reveal it</p>
    <div class="pack-reveal-grid">${backs}</div>
    <div class="text-center mt-2"><button class="btn btn-primary" onclick="closeModal()">Done</button></div>`);
  try {
    const data = await api('/packs/open','POST');
    S.user.coins -= 100;
    updateNavCoins();
    data.cards.forEach((c,i) => {
      document.getElementById('pf-' + i).innerHTML = renderCard(c);
      S.collection.push({ ...c, quantity: 1 });
    });
  } catch (e) { notify(e.message, 'error'); closeModal(); }
}
window.openPackModal = openPackModal;

window.flipPackCard = (i) => {
  const slot = document.getElementById('ps-' + i);
  if (slot) slot.classList.add('flipped');
};

// ─── BATTLE (SERVER-AUTHORITATIVE) ───────────────────────────────
function _hpBarHtml(c) {
  const pct = Math.max(0, Math.round(c.current_hp / c.hp * 100));
  const cls = pct > 50 ? '' : pct > 25 ? ' hp-yellow' : ' hp-red';
  return `<div class="battle-hp-above">
    <div class="battle-hp-name">${c.name}</div>
    <div class="battle-hp-bar-wrap"><div class="battle-hp-bar${cls}" style="width:${pct}%"></div></div>
    <div class="battle-hp-text">${c.current_hp} / ${c.hp} HP</div>
  </div>`;
}

function viewBattle() {
  if (!S.battle || S.battle.finished) {
    const result = S.battle?.ratingResult;
    const won = S.battle?.winner === 'player';
    if (S.battle?.finished) {
      return `<div class="page-title"><h2>Battle Arena</h2></div>
      <div class="sketch-box text-center" style="max-width:500px;margin:0 auto">
        <div style="font-size:3.5rem;margin-bottom:0.5rem">${won ? '🏆' : '💀'}</div>
        <h2 style="color:${won?'var(--gold)':'var(--red)'};margin-bottom:0.5rem">${won ? 'Victory!' : 'Defeated!'}</h2>
        ${result ? `<p class="text-muted" style="margin-bottom:1rem">${result.coinsEarned ? '+' + result.coinsEarned + ' coins' : 'No coins earned'}</p>` : ''}
        <div style="display:flex;gap:1rem;justify-content:center">
          <button class="btn btn-primary btn-lg" onclick="startBattle()">Play Again</button>
          <button class="btn" onclick="nav('home')">Home</button>
        </div>
      </div>`;
    }
    return `<div class="page-title"><h2>Battle Arena</h2></div>
      <div class="sketch-box text-center" style="max-width:500px;margin:0 auto">
        <h3 style="margin-bottom:1rem">Challenge an AI Opponent</h3>
        <p class="text-muted mb-2">Your collected cards are used to battle. Defeat all 5 opponent creatures to win!</p>
        <button class="btn btn-primary btn-lg" onclick="startBattle()">⚔️ Start Battle</button>
      </div>`;
  }
  const b = S.battle;
  const pa = b.playerCards[b.playerActive];
  const aa = b.aiCards[b.aiActive];
  const pBench = b.playerCards.map((c,i) => ({c,i})).filter(({i}) => i !== b.playerActive);
  const aBench = b.aiCards.map((c,i) => ({c,i})).filter(({i}) => i !== b.aiActive);
  const log = b.log.slice(-8).map(l => {
    const cls = l.startsWith('You') ? 'log-player' : l.startsWith('Foe') ? 'log-ai' : 'log-system';
    return `<p class="${cls}">${l}</p>`;
  }).join('');
  const canSwitch = pBench.some(({c}) => c.current_hp > 0);
  const aiRemain = b.aiCards.filter(c=>c.current_hp>0).length;
  return `<div class="page-title"><h2>Battle Arena</h2>
    <span class="text-muted" style="font-size:0.9rem">AI Trainer &bull; ${aiRemain} remaining</span>
  </div>
  <div class="battle-arena battle-arena-bg${b.playerTurn?' battle-turn-glow':''}">
    <div class="battle-field">
      <div class="battle-active-slot foe-slot" id="foe-active-slot">
        ${_hpBarHtml(aa)}
        ${renderCard(aa)}
      </div>
      <div class="battle-vs-center">
        <div class="vs-text">VS</div>
        <div class="battle-lightning">⚡</div>
        <div style="font-size:0.7rem;color:var(--ink-light);font-family:var(--font-ui);text-align:center;margin-top:0.4rem">${b.playerTurn?'YOUR TURN':'AI TURN'}</div>
      </div>
      <div class="battle-active-slot player-slot" id="player-active-slot">
        ${_hpBarHtml(pa)}
        ${renderCard(pa)}
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:1rem">
      <div>
        <div class="battle-label text-muted" style="font-size:0.85rem">AI Bench</div>
        <div class="battle-bench">${aBench.map(({c,i}) => renderBenchCard(c, i, false)).join('') || '<span class="text-muted" style="font-size:0.82rem">None</span>'}</div>
      </div>
      <div>
        <div class="battle-label text-muted" style="font-size:0.85rem">Your Bench</div>
        <div class="battle-bench">${pBench.map(({c,i}) => renderBenchCard(c, i, true)).join('') || '<span class="text-muted" style="font-size:0.82rem">None</span>'}</div>
      </div>
    </div>
    <div class="battle-controls">
      ${b.playerTurn && !b.finished ? `
        <button class="btn btn-primary" id="btn-attack" onclick="battleAttack()">⚔️ ${pa.ability_name} (${pa.ability_power} pwr)</button>
        ${canSwitch ? `<span class="text-muted" style="font-size:0.82rem">or click a bench card to switch</span>` : ''}
        <button class="btn btn-red" onclick="battleForfeit()">Forfeit</button>
      ` : b.finished
        ? `<button class="btn btn-primary btn-lg" onclick="startBattle()">Play Again</button>`
        : `<span class="text-muted">AI is thinking...</span>`}
    </div>
    <div class="battle-log" id="battle-log">${log}</div>
  </div>`;
}

async function startBattle() {
  const page = document.getElementById('page');
  if (page) page.innerHTML = `<div class="page-title"><h2>Battle Arena</h2></div><div class="spinner"></div>`;
  try {
    const data = await api('/battle/start','POST');
    S.battle = data;
    document.getElementById('page').innerHTML = viewBattle();
    attachListeners();
    scrollBattleLog();
  } catch (e) {
    notify(e.message, 'error');
    document.getElementById('page').innerHTML = viewBattle();
    attachListeners();
  }
}
window.startBattle = startBattle;

// ─── BATTLE ANIMATIONS ────────────────────────────────────────────
let _battleAnimating = false;

function playBattleSound(type) {
  try {
    const ctx = Music.bootCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    if (type === 'attack') {
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.12), ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i/d.length, 1.5);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const filt = ctx.createBiquadFilter(); filt.type = 'bandpass'; filt.frequency.value = 1800; filt.Q.value = 0.8;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.22, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      src.connect(filt); filt.connect(g); g.connect(ctx.destination);
      src.start(now);
    } else if (type === 'hit') {
      const osc = ctx.createOscillator(); osc.type = 'sine';
      osc.frequency.setValueAtTime(140, now); osc.frequency.exponentialRampToValueAtTime(45, now + 0.22);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.28, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.connect(g); g.connect(ctx.destination); osc.start(now); osc.stop(now + 0.35);
    } else if (type === 'faint') {
      const osc = ctx.createOscillator(); osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(380, now); osc.frequency.exponentialRampToValueAtTime(90, now + 0.65);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.16, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
      osc.connect(g); g.connect(ctx.destination); osc.start(now); osc.stop(now + 0.8);
    } else if (type === 'victory') {
      [523, 659, 784, 1047].forEach((freq, i) => {
        const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
        const og = ctx.createGain(); o.connect(og); og.connect(ctx.destination);
        const t = now + i * 0.13;
        og.gain.setValueAtTime(0.18, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        o.start(t); o.stop(t + 0.4);
      });
    } else if (type === 'defeat') {
      [440, 349, 277, 196].forEach((freq, i) => {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
        const og = ctx.createGain(); o.connect(og); og.connect(ctx.destination);
        const t = now + i * 0.16;
        og.gain.setValueAtTime(0.14, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        o.start(t); o.stop(t + 0.45);
      });
    } else if (type === 'switch') {
      const osc = ctx.createOscillator(); osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now); osc.frequency.setValueAtTime(660, now + 0.08);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.13, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(g); g.connect(ctx.destination); osc.start(now); osc.stop(now + 0.25);
    }
  } catch(_e) {}
}
window.playBattleSound = playBattleSound;

function _showDmgFloat(slotEl, dmg) {
  const el = document.createElement('div');
  el.className = 'dmg-float';
  el.textContent = (dmg > 0 ? '-' : '+') + Math.abs(dmg);
  if (dmg < 0) el.classList.add('heal');
  slotEl.style.position = 'relative';
  slotEl.appendChild(el);
  setTimeout(() => el.remove(), 1300);
}

function _showEffBanner(arenaEl, text, cls) {
  const el = document.createElement('div');
  el.className = 'effectiveness-banner ' + cls;
  el.textContent = text;
  arenaEl.style.position = 'relative';
  arenaEl.appendChild(el);
  setTimeout(() => el.remove(), 1700);
}

function battleAnimate(prevB, newB) {
  return new Promise(resolve => {
    if (_battleAnimating) { resolve(); return; }
    _battleAnimating = true;

    const prevPA = prevB.playerCards[prevB.playerActive];
    const prevAA = prevB.aiCards[prevB.aiActive];
    const newPA  = newB.playerCards[newB.playerActive];
    const newAA  = newB.aiCards[newB.aiActive];

    const playerFainted = prevPA && newPA && newPA.current_hp <= 0 && prevPA.current_hp > 0;
    const foeFainted    = prevAA && newAA && newAA.current_hp <= 0 && prevAA.current_hp > 0;
    const playerDmg     = prevPA && newPA ? prevPA.current_hp - newPA.current_hp : 0;
    const foeDmg        = prevAA && newAA ? prevAA.current_hp - newAA.current_hp : 0;

    // Check last log entry for effectiveness
    const newLogs = newB.log.slice(prevB.log.length);
    const superEff  = newLogs.some(l => /super.?effective/i.test(l));
    const notEff    = newLogs.some(l => /not very effective/i.test(l));
    const immune    = newLogs.some(l => /no effect/i.test(l));

    const seq = [];
    if (prevB.playerTurn) {
      // Player attacks first
      seq.push({ t: 0,    fn: () => {
        const el = document.querySelector('#player-active-slot .tcg-card');
        if (el) { el.classList.add('ba-attack-player'); setTimeout(()=>el?.classList.remove('ba-attack-player'), 550); }
        playBattleSound('attack');
      }});
      if (foeDmg > 0) seq.push({ t: 320, fn: () => {
        const el  = document.querySelector('#foe-active-slot .tcg-card');
        const sl  = document.getElementById('foe-active-slot');
        if (el) { el.classList.add('ba-hit'); setTimeout(()=>el?.classList.remove('ba-hit'), 550); }
        if (sl)  _showDmgFloat(sl, foeDmg);
        playBattleSound('hit');
        const arena = document.querySelector('.battle-arena-bg');
        if (arena) { arena.classList.add('battle-arena-flash'); setTimeout(()=>arena?.classList.remove('battle-arena-flash'), 350); }
        if (superEff && arena) _showEffBanner(arena, 'SUPER EFFECTIVE!', 'eff-super');
        else if (notEff && arena) _showEffBanner(arena, 'Not very effective...', 'eff-weak');
        else if (immune && arena) _showEffBanner(arena, 'No effect!', 'eff-immune');
      }});
      if (foeFainted) seq.push({ t: 750, fn: () => {
        const el = document.querySelector('#foe-active-slot .tcg-card');
        if (el) el.classList.add('ba-faint');
        playBattleSound('faint');
      }});
      // AI counter-attacks (if it's still alive or a new one comes in)
      const aiAttackT = foeFainted ? 1400 : 900;
      seq.push({ t: aiAttackT, fn: () => {
        const el = document.querySelector('#foe-active-slot .tcg-card');
        if (el && !el.classList.contains('ba-faint')) {
          el.classList.add('ba-attack-foe'); setTimeout(()=>el?.classList.remove('ba-attack-foe'), 550);
        }
        playBattleSound('attack');
      }});
      if (playerDmg > 0) seq.push({ t: aiAttackT + 320, fn: () => {
        const el = document.querySelector('#player-active-slot .tcg-card');
        const sl = document.getElementById('player-active-slot');
        if (el) { el.classList.add('ba-hit'); setTimeout(()=>el?.classList.remove('ba-hit'), 550); }
        if (sl) _showDmgFloat(sl, playerDmg);
        playBattleSound('hit');
      }});
      if (playerFainted) seq.push({ t: aiAttackT + 750, fn: () => {
        const el = document.querySelector('#player-active-slot .tcg-card');
        if (el) el.classList.add('ba-faint');
        playBattleSound('faint');
      }});
    }

    const maxT = seq.length > 0 ? Math.max(...seq.map(s => s.t)) + 800 : 50;
    for (const step of seq) setTimeout(step.fn, step.t);

    if (newB.finished) {
      setTimeout(() => playBattleSound(newB.winner === 'player' ? 'victory' : 'defeat'), maxT - 100);
    }

    setTimeout(() => { _battleAnimating = false; resolve(); }, maxT);
  });
}

async function battleAction(action, extra = {}) {
  const btn = document.getElementById('btn-attack');
  if (btn) btn.disabled = true;
  const isConquest = S.view === 'conquest_battle';

  // Snapshot prev state for animation
  const prevBattle = (S.battle && !isConquest) ? {
    ...S.battle,
    playerCards: S.battle.playerCards.map(c => ({...c})),
    aiCards:     S.battle.aiCards.map(c => ({...c})),
    log:         [...S.battle.log],
  } : null;

  try {
    const data = await api('/battle/action','POST', { action, ...extra });

    // Play animations while DOM still shows old state (before S.battle update)
    if (prevBattle && action === 'attack' && !isConquest) {
      await battleAnimate(prevBattle, data);
    } else if (action === 'switch') {
      playBattleSound('switch');
    }

    S.battle = data;
    if (data.finished && data.ratingResult) {
      const r = data.ratingResult;
      if (r.conquestWin !== undefined) {
        // Conquest battle finished — stop polling since we already have the result
        if (S._cqBattleInterval) { clearInterval(S._cqBattleInterval); S._cqBattleInterval = null; }
        if (r.conquestWin) {
          S.user.coins += r.coinsEarned || 0;
          updateNavCoins();
          notify(`Victory! +${r.coinsEarned} coins`, 'success');
          if (r.bossCardUnlocked) {
            notify(`Boss card unlocked: ${r.bossCardUnlocked}! Check your collection.`, 'success');
            try { const col = await api('/collection'); S.collection = col.cards || []; } catch {}
          }
          try { S.conquestProgress = await api('/conquest/progress'); } catch {}
        } else {
          notify('Defeated! Your forces were overwhelmed.', 'info');
        }
        document.getElementById('page').innerHTML = viewConquestBattle();
        attachListeners();
      } else {
        // Regular battle finished
        if (data.winner === 'player') {
          S.user.coins += r.coinsEarned || 0;
          updateNavCoins();
          notify(`Victory! +${r.coinsEarned} coins`, 'success');
        } else {
          notify('Defeated!', 'info');
        }
        S.myRank = await api('/ranked/me').catch(() => S.myRank);
        document.getElementById('page').innerHTML = viewBattle();
        attachListeners();
        scrollBattleLog();
      }
      return;
    }
    if (isConquest) {
      document.getElementById('page').innerHTML = viewConquestBattle();
    } else {
      document.getElementById('page').innerHTML = viewBattle();
    }
    attachListeners();
    scrollBattleLog();
  } catch (e) {
    notify(e.message, 'error');
    if (btn) btn.disabled = false;
  }
}

function scrollBattleLog() {
  const log = document.getElementById('battle-log');
  if (log) log.scrollTop = log.scrollHeight;
}

window.battleAttack  = () => battleAction('attack');
window.battleForfeit = () => { if (confirm('Forfeit this battle?')) battleAction('forfeit'); };

window.selectBenchCard = (realIdx) => {
  if (S.view === 'pvp_battle') {
    if (!S.pvpBattle || S.pvpBattle.finished || !S.pvpBattle.playerTurn) return;
    pvpAction('switch', { switchTo: realIdx });
  } else {
    if (!S.battle || S.battle.finished || !S.battle.playerTurn) return;
    battleAction('switch', { switchTo: realIdx });
  }
};

// ─── PROFILE ──────────────────────────────────────────────────────
function viewProfile() {
  const p = S.profileUser;
  if (!p) return `<div class="page-title"><h2>Profile</h2></div><div class="sketch-box"><p class="text-muted">No profile loaded.</p></div>`;
  const wr = (p.wins + p.losses) > 0 ? Math.round(p.wins / (p.wins + p.losses) * 100) : 0;
  const ratingPct = Math.min(100, Math.round((p.rating || 1000) / 3000 * 100));
  const matches = (p.recent_matches || []).map(m => {
    const won = m.winner_id === p.id;
    return `<div class="match-entry ${won?'match-win':'match-loss'}"><span>${won?'Win':'Loss'}</span><span class="text-muted" style="font-size:0.82rem">${m.opponent ? 'vs '+m.opponent : 'vs AI'} — ${new Date(m.created_at).toLocaleDateString()}</span></div>`;
  }).join('') || '<p class="text-muted" style="font-size:0.9rem">No recent matches.</p>';
  const isSelf = S.user?.username?.toLowerCase() === p.username?.toLowerCase();
  return `<div class="page-title"><h2>${isSelf ? 'My Profile' : p.username + "'s Profile"}</h2></div>
  <div class="profile-layout">
    <div class="profile-card-col">
      <div class="profile-avatar">${_av(p, 80)}</div>
      <div class="profile-username">${p.username}</div>
      <span class="role-badge role-${p.role}">${p.role}</span>
      ${p.top500 ? '<div class="profile-top500">⭐ Top 500</div>' : ''}
      ${p.bio ? `<div class="profile-bio">${p.bio}</div>` : ''}
      <div class="profile-joined text-muted">Joined ${new Date(p.created_at).toLocaleDateString()}</div>
      <div class="profile-stat-row"><span>Cards Owned</span><span class="text-gold">${p.card_count || 0}</span></div>
    </div>
    <div class="profile-info-col">
      <div class="sketch-box mb-2">
        <h3 style="margin-bottom:0.8rem">Ranked Stats</h3>
        <div class="profile-rank-title">${p.rank_title || 'Bronze'}</div>
        <div class="profile-rating-bar-wrap"><div class="profile-rating-bar" style="width:${ratingPct}%"></div></div>
        <div class="profile-rating-num">${p.rating || 1000} ELO</div>
        <div class="profile-wlr">
          <div class="profile-stat-box"><div class="pstat-val text-green">${p.wins||0}</div><div class="pstat-label">Wins</div></div>
          <div class="profile-stat-box"><div class="pstat-val text-red">${p.losses||0}</div><div class="pstat-label">Losses</div></div>
          <div class="profile-stat-box"><div class="pstat-val">${wr}%</div><div class="pstat-label">Win Rate</div></div>
          <div class="profile-stat-box"><div class="pstat-val">${p.season_wins||0}</div><div class="pstat-label">Season W</div></div>
        </div>
      </div>
      <div class="sketch-box">
        <h3 style="margin-bottom:0.8rem">Recent Matches</h3>
        ${matches}
      </div>
    </div>
  </div>`;
}

window.openProfile = async (username) => {
  if (!username) return;
  try {
    S.profileUser = await api('/users/' + encodeURIComponent(username) + '/profile');
    nav('profile');
  } catch (e) { notify('Profile not found', 'error'); }
};

// ─── FRIENDS ──────────────────────────────────────────────────────
function viewFriends() {
  const accepted = S.friends.filter(f => f.status === 'accepted');
  const pending  = S.friends.filter(f => f.status === 'pending');
  const friendList = accepted.length
    ? accepted.map(f => `<div class="friend-item">
        <div class="friend-avatar">${_av(f, 44)}</div>
        <div class="friend-info">
          <div class="friend-name">${f.username} <span class="role-badge role-${f.role}">${f.role}</span></div>
          <div class="friend-meta">Rating: ${f.rating||1000} &bull; ${f.rank_title||'Bronze'}</div>
        </div>
        <div class="status-dot status-offline"></div>
        <button class="btn btn-sm" onclick="removeFriend(${f.id})">Remove</button>
      </div>`).join('')
    : '<p class="text-muted">No friends yet. Search for players below!</p>';
  const pendingList = pending.length
    ? pending.map(f => `<div class="friend-item">
        <div class="friend-avatar">${_av(f, 44)}</div>
        <div class="friend-info"><div class="friend-name">${f.username}</div><div class="friend-meta">Pending request</div></div>
        ${f.i_sent_it
          ? `<span class="text-muted" style="font-size:0.85rem">Awaiting response</span>`
          : `<button class="btn btn-green btn-sm" onclick="acceptFriend(${f.id})">Accept</button>
             <button class="btn btn-sm" onclick="removeFriend(${f.id})">Decline</button>`}
      </div>`).join('')
    : '';
  return `<div class="page-title"><h2>Friends</h2></div>
    <div class="sketch-box mb-2">
      <h3 style="margin-bottom:0.8rem">Add Friend</h3>
      <div style="display:flex;gap:0.8rem;align-items:flex-end">
        <div style="flex:1"><input class="input-box" id="friend-search" placeholder="Enter username..."></div>
        <button class="btn btn-primary" onclick="sendFriendRequest()">Send Request</button>
      </div>
    </div>
    ${pending.length ? `<div class="sketch-box mb-2"><h3 style="margin-bottom:0.8rem">Pending Requests</h3><div class="friends-list">${pendingList}</div></div>` : ''}
    <div class="sketch-box">
      <h3 style="margin-bottom:0.8rem">Friends (${accepted.length})</h3>
      <div class="friends-list">${friendList}</div>
    </div>`;
}

async function sendFriendRequest() {
  const u = document.getElementById('friend-search')?.value?.trim();
  if (!u) return;
  try {
    await api('/friends/request/' + encodeURIComponent(u), 'POST');
    notify('Friend request sent to ' + u, 'success');
    document.getElementById('friend-search').value = '';
    S.friends = await api('/friends');
    document.getElementById('page').innerHTML = viewFriends();
    attachListeners();
  } catch (e) { notify(e.message, 'error'); }
}
window.sendFriendRequest = sendFriendRequest;

async function acceptFriend(id) {
  try {
    await api('/friends/' + id + '/accept', 'PUT');
    notify('Friend accepted!', 'success');
    S.friends = await api('/friends');
    document.getElementById('page').innerHTML = viewFriends();
    attachListeners();
  } catch (e) { notify(e.message, 'error'); }
}
window.acceptFriend = acceptFriend;

async function removeFriend(id) {
  try {
    await api('/friends/' + id, 'DELETE');
    S.friends = S.friends.filter(f => f.id !== id);
    document.getElementById('page').innerHTML = viewFriends();
    attachListeners();
  } catch (e) { notify(e.message, 'error'); }
}
window.removeFriend = removeFriend;

// ─── PLAYER CARD ──────────────────────────────────────────────────
function renderPlayerCard(player, rankPos) {
  const rank   = player.rank_title || 'Bronze';
  const rating = player.rating     || 1000;
  const wins   = player.wins       || 0;
  const losses = player.losses     || 0;
  const total  = wins + losses;
  const wr     = total > 0 ? Math.round((wins / total) * 100) : 0;
  const color  = player.avatar_color || '#c0392b';

  // Map rank title → card rarity class for border/glow
  const rarityMap = {
    bronze:'rarity-common', silver:'rarity-uncommon', gold:'rarity-rare',
    platinum:'rarity-ultra_rare', diamond:'rarity-mythic',
    master:'rarity-prism', grandmaster:'rarity-numbered',
    champion:'rarity-mythic', developer:'rarity-prism'
  };
  const rarityClass = rarityMap[(rank).toLowerCase()] || 'rarity-common';

  // Rating bar (0-3000 range)
  const ratingPct = Math.min(100, Math.round((rating / 3000) * 100));
  const ratingColor = rating >= 2000 ? '#f0c040' : rating >= 1500 ? '#00b4e6' : rating >= 1200 ? '#9b59b6' : '#7f8c8d';

  const initial = (player.username || '?')[0].toUpperCase();
  const posLabel = rankPos ? (rankPos <= 3 ? ['1st','2nd','3rd'][rankPos-1] : '#' + rankPos) : '';

  return `<div class="tcg-card player-card ${rarityClass}" onclick="showPlayerCardModal(${JSON.stringify(player).replace(/"/g,'&quot;')},${rankPos||0})">
    <div class="card-header">
      <span class="card-name">${player.username}</span>
      <span class="card-hp" style="color:${ratingColor}">${rating} <span style="font-size:0.65rem;opacity:0.7">ELO</span></span>
    </div>
    <div class="card-art player-card-art" style="background:radial-gradient(circle at 60% 35%, ${color}55, ${color}22 60%, #050810)">
      <div class="player-card-avatar" style="box-shadow:0 0 18px ${color}88">${_av(player, 52)}</div>
      ${player.top500 ? `<div class="player-card-top500">TOP 500</div>` : ''}
      ${posLabel ? `<div class="player-card-rank">${posLabel}</div>` : ''}
      <div style="position:absolute;bottom:0;left:0;right:0;height:5px;background:rgba(0,0,0,0.4)">
        <div style="height:100%;width:${ratingPct}%;background:${ratingColor};transition:width 0.4s"></div>
      </div>
    </div>
    <div class="card-type-bar" style="background:${color}">${rank} ${player.role && player.role !== 'user' ? '· ' + player.role : ''}</div>
    <div class="card-body">
      <div class="card-ability-name">
        <span>Battle Record</span>
        <span class="ability-power" style="color:${ratingColor}">${wr}%</span>
      </div>
      <div class="card-ability-desc">${wins}W / ${losses}L &mdash; Win Rate: ${wr}%</div>
      <div class="card-stats">
        <div class="stat-item"><span class="stat-label">WIN</span><span class="stat-val" style="color:#2ecc71">${wins}</span></div>
        <div class="stat-item"><span class="stat-label">LOSS</span><span class="stat-val" style="color:#e74c3c">${losses}</span></div>
        <div class="stat-item"><span class="stat-label">GAME</span><span class="stat-val">${total}</span></div>
        <div class="stat-item"><span class="stat-label">WR%</span><span class="stat-val" style="color:${ratingColor}">${wr}</span></div>
      </div>
    </div>
    <div class="card-footer">
      <span>Joined: ${new Date(player.created_at||Date.now()).toLocaleDateString('en-US',{month:'short',year:'numeric'})}</span>
      <span class="card-number">${posLabel}</span>
    </div>
  </div>`;
}

window.showPlayerCardModal = (player, rankPos) => {
  openModal(`<div style="display:flex;flex-direction:column;align-items:center;gap:1rem;padding:0.5rem">
    ${renderPlayerCard(player, rankPos)}
    <div class="flex gap-2">
      <button class="btn btn-primary" onclick="closeModal();openProfile('${player.username}')">View Profile</button>
      <button class="btn" onclick="closeModal()">Close</button>
    </div>
  </div>`);
};

// ─── LEADERBOARD ──────────────────────────────────────────────────
function rankClass(r) {
  const m = {bronze:'rt-bronze',silver:'rt-silver',gold:'rt-gold',platinum:'rt-platinum',diamond:'rt-diamond',master:'rt-master',grandmaster:'rt-grandmaster',developer:'rt-developer'};
  return m[(r||'').toLowerCase()] || 'rt-bronze';
}

function viewLeaderboard(mode) {
  const viewMode = mode || S._lbMode || 'cards';
  S._lbMode = viewMode;
  const myPos = S.leaderboard.findIndex(p => S.user && p.id === S.user.id);

  const tableRows = S.leaderboard.map((p,i) => {
    const isSelf = S.user && p.id === S.user.id;
    const rankNum = p.rank || (i+1);
    return `<tr class="${rankNum===1?'rank-1':rankNum===2?'rank-2':rankNum===3?'rank-3':''}${isSelf?' current-user':''}" onclick="showPlayerCardModal(${JSON.stringify(p).replace(/"/g,'&quot;')},${rankNum})" style="cursor:pointer">
      <td>${rankNum <= 3 ? ['🥇','🥈','🥉'][rankNum-1] : '#' + rankNum}</td>
      <td>
        <span style="font-weight:700">${p.username}</span>
        ${p.top500 ? '<span class="top500-badge" style="margin-left:6px">TOP 500</span>' : ''}
        ${isSelf ? '<span class="badge" style="margin-left:6px;color:var(--cyan)">You</span>' : ''}
      </td>
      <td>${p.rating}</td>
      <td><span class="rank-title-badge ${rankClass(p.rank_title)}">${p.rank_title}</span></td>
      <td class="text-green">${p.wins}</td>
      <td class="text-red">${p.losses}</td>
    </tr>`;
  }).join('');

  const cardGrid = S.leaderboard.map((p,i) => renderPlayerCard(p, p.rank || (i+1))).join('');

  return `<div class="page-title"><h2>Leaderboard</h2><p class="text-muted">Top 500 ranked players this season</p></div>
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.75rem;margin-bottom:1rem">
      ${myPos !== -1 ? `<div class="sketch-box" style="display:inline-block;padding:0.5rem 1rem">
        <span>Your rank: <strong>#${myPos+1}</strong>
        ${S.myRank?.top500 ? '<span class="top500-badge" style="margin-left:6px">TOP 500</span>' : ''}</span>
      </div>` : '<div></div>'}
      <div style="display:flex;gap:0.5rem">
        <button class="btn btn-sm${viewMode==='cards'?' btn-primary':''}" onclick="switchLbMode('cards')">Cards</button>
        <button class="btn btn-sm${viewMode==='table'?' btn-primary':''}" onclick="switchLbMode('table')">Table</button>
      </div>
    </div>
    ${viewMode === 'cards'
      ? `<div class="lb-card-grid">${cardGrid || '<p class="text-muted text-center">No ranked players yet.</p>'}</div>`
      : `<div style="overflow-x:auto"><table class="leaderboard-table">
          <thead><tr><th>Rank</th><th>Player</th><th>Rating</th><th>Title</th><th>Wins</th><th>Losses</th></tr></thead>
          <tbody>${tableRows || '<tr><td colspan="6" class="text-muted text-center" style="padding:1rem">No ranked players yet.</td></tr>'}</tbody>
        </table></div>`}`;
}
window.switchLbMode = (mode) => { document.getElementById('page').innerHTML = viewLeaderboard(mode); attachListeners(); };

// ─── NEWS ─────────────────────────────────────────────────────────
function viewNews() {
  const items = S.news.map(n => `
    <div class="news-item sketch-box mb-2">
      <div class="news-header">
        <h3 class="news-title">${n.title}</h3>
        <span class="news-meta">
          <span class="role-badge role-${n.author_role||'developer'}">${n.author_name}</span>
          &nbsp; ${new Date(n.created_at).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}
          ${n.updated_at !== n.created_at ? `<span class="text-muted" style="font-size:0.78rem"> (edited)</span>` : ''}
        </span>
      </div>
      <div class="news-body">${n.body.replace(/\n/g,'<br>')}</div>
    </div>`).join('') || `<div class="sketch-box text-center"><p class="text-muted">No news posts yet. Check back soon.</p></div>`;
  return `<div class="page-title"><h2>News</h2><p class="text-muted">Updates, patch notes, and announcements from the development team</p></div>
    ${items}`;
}

// ─── REPORTS ──────────────────────────────────────────────────────
function viewReports() {
  const myReports = S.reports.map(r => {
    const pri = r.priority || 'normal';
    return `<div class="report-item">
      <div class="report-header">
        <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">
          <strong>Reported: <span class="profile-link" onclick="openProfile('${r.reported_username}')">${r.reported_username}</span></strong>
          <span class="text-muted" style="font-size:0.85rem">${r.category}</span>
          <span class="priority-badge priority-${pri}">${pri}</span>
        </div>
        <span class="report-status status-${r.status}">${r.status.charAt(0).toUpperCase() + r.status.slice(1)}</span>
      </div>
      <p style="font-size:0.9rem;margin:0.4rem 0">${r.description}</p>
      ${r.handler_notes ? `<p style="font-size:0.84rem;color:var(--gold);margin-top:0.3rem">Staff note: ${r.handler_notes}</p>` : ''}
      <p class="text-muted" style="font-size:0.78rem;margin-top:0.3rem">${new Date(r.created_at).toLocaleString()}</p>
    </div>`;
  }).join('') || '<p class="text-muted">You have not submitted any reports.</p>';
  return `<div class="page-title"><h2>Reports</h2></div>
    <div class="sketch-box mb-3">
      <h3 style="margin-bottom:1rem">Submit a Report</h3>
      <div class="form-group"><label>Reported Username</label><input id="rep-user" class="input-box" placeholder="Username to report"></div>
      <div class="form-group"><label>Category</label>
        <select id="rep-cat" class="input-box">
          <option value="cheating">Cheating</option>
          <option value="harassment">Harassment</option>
          <option value="bug">Bug Report</option>
          <option value="inappropriate">Inappropriate Behavior</option>
          <option value="scamming">Scamming</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div class="form-group"><label>Priority</label>
        <select id="rep-priority" class="input-box">
          <option value="low">Low — minor issue</option>
          <option value="normal" selected>Normal — standard report</option>
          <option value="high">High — serious violation</option>
          <option value="urgent">Urgent — immediate action needed</option>
        </select>
      </div>
      <div class="form-group"><label>Description (be specific)</label>
        <textarea id="rep-desc" class="input-box" placeholder="Describe the issue in detail. Include context, what happened, when..."></textarea>
      </div>
      <div class="form-group"><label>Evidence URL (optional)</label>
        <input id="rep-evidence" class="input-box" placeholder="Link to screenshot, clip, etc.">
      </div>
      <button class="btn btn-primary" onclick="submitReport()">Submit Report</button>
    </div>
    <div class="sketch-box">
      <h3 style="margin-bottom:1rem">My Reports</h3>
      ${myReports}
    </div>`;
}

async function submitReport() {
  const u = document.getElementById('rep-user')?.value?.trim();
  const c = document.getElementById('rep-cat')?.value;
  const d = document.getElementById('rep-desc')?.value?.trim();
  const priority = document.getElementById('rep-priority')?.value || 'normal';
  const evidence_url = document.getElementById('rep-evidence')?.value?.trim() || null;
  if (!u || !d) { notify('Please fill in all fields', 'error'); return; }
  try {
    await api('/reports','POST',{reported_username:u, category:c, description:d, priority, evidence_url});
    notify('Report submitted. Thank you.', 'success');
    document.getElementById('rep-user').value = '';
    document.getElementById('rep-desc').value = '';
    S.reports = await api('/reports/mine');
    document.getElementById('page').innerHTML = viewReports();
    attachListeners();
  } catch (e) { notify(e.message, 'error'); }
}
window.submitReport = submitReport;

// ─── SETTINGS ─────────────────────────────────────────────────────
function viewSettings() {
  const cfg = S.settings;
  const tabs = ['profile','account','appearance','privacy'];
  const tabBar = tabs.map(t => `<div class="settings-nav-item${S.settingsTab===t?' active':''}" onclick="setSettingsTab('${t}')">${t.charAt(0).toUpperCase()+t.slice(1)}</div>`).join('');
  const colorSwatches = COLORS.map(c => `<div class="color-swatch${(S.user?.avatar_color||'#c0392b')===c?' selected':''}" style="background:${c}" onclick="setAvatarColor('${c}')"></div>`).join('');
  const sections = {
    profile: `
      <h3 class="mb-2">Profile</h3>
      <div class="form-group">
        <label>Username</label>
        <input class="input-box" value="${S.user?.username||''}" disabled style="opacity:0.6">
      </div>
      <div class="form-group">
        <label>Bio (max 200 chars)</label>
        <textarea id="bio-input" class="input-box">${S.user?.bio||''}</textarea>
      </div>
      <button class="btn btn-primary" onclick="saveBio()">Save Bio</button>
      <div class="form-group mt-2">
        <label>Avatar Color</label>
        <div class="color-swatches">${colorSwatches}</div>
      </div>
      <div class="form-group mt-2">
        <label>Avatar Icon</label>
        <div style="display:flex;align-items:center;gap:1rem;margin-bottom:0.75rem">
          <div style="flex-shrink:0">${_av(S.user, 64)}</div>
          <div>
            <p class="text-muted" style="font-size:0.82rem;margin-bottom:0.4rem">Choose a preset icon or upload your own image</p>
            <button class="btn btn-sm" onclick="document.getElementById('avatar-file-input').click()">📁 Upload Photo</button>
            <input id="avatar-file-input" type="file" accept="image/*" style="display:none" onchange="handleAvatarFile(this)">
          </div>
        </div>
        <div class="avatar-preset-grid">${
          ['⚔️','🛡️','🐉','🦁','🔥','💧','🌙','⭐','⚡','❄️','🌿','☠️',
           '🦊','🐺','🦅','🦋','🌸','💀','🔮','🌊','🏹','🗡️','👑','🎭'].map(e =>
            `<div class="avatar-preset${S.user?.avatar_img==='emoji:'+e?' selected':''}" onclick="setAvatarEmoji('${e}')">${e}</div>`
          ).join('')
        }</div>
      </div>`,
    account: `
      <h3 class="mb-2">Account</h3>
      <div class="form-group">
        <label>Current Password</label>
        <input id="pw-cur" type="password" class="input-box" placeholder="Current password">
      </div>
      <div class="form-group">
        <label>New Password</label>
        <input id="pw-new" type="password" class="input-box" placeholder="New password (8+ chars)">
      </div>
      <div class="form-group">
        <label>Confirm New Password</label>
        <input id="pw-new2" type="password" class="input-box" placeholder="Confirm new password">
      </div>
      <button class="btn btn-primary" onclick="changePassword()">Change Password</button>
      <div class="danger-zone">
        <h4>Danger Zone</h4>
        <button class="btn btn-red" onclick="deleteAccount()">Delete Account</button>
      </div>`,
    appearance: `
      <h3 class="mb-2">Appearance</h3>
      <div class="form-group">
        <label>Theme</label>
        <select id="theme-select" class="input-box" onchange="applyTheme(this.value)">
          <option value="default"${(cfg.theme||'default')==='default'?' selected':''}>Default (Paper)</option>
          <option value="dark"${cfg.theme==='dark'?' selected':''}>Dark</option>
          <option value="sepia"${cfg.theme==='sepia'?' selected':''}>Sepia</option>
        </select>
      </div>
      <div class="form-group">
        <label>Music Volume <span id="vol-label">${Math.round(Music.volume * 100)}%</span></label>
        <input type="range" id="vol-slider" class="vol-slider" min="0" max="1" step="0.01" value="${Music.volume}"
          oninput="Music.setVolume(parseFloat(this.value)); document.getElementById('vol-label').textContent = Math.round(this.value*100)+'%'">
      </div>
      <button class="btn btn-primary" onclick="saveSettings()">Save Appearance</button>`,
    privacy: `
      <h3 class="mb-2">Privacy</h3>
      <div class="form-group">
        <label>Profile Visibility</label>
        <select id="priv-select" class="input-box">
          <option value="public"${(cfg.privacy_level||'public')==='public'?' selected':''}>Public</option>
          <option value="friends"${cfg.privacy_level==='friends'?' selected':''}>Friends Only</option>
          <option value="private"${cfg.privacy_level==='private'?' selected':''}>Private</option>
        </select>
      </div>
      <label class="toggle-wrap mb-2">
        <input type="checkbox" class="toggle-input" id="tog-col"${cfg.show_collection!==false?' checked':''}>
        <span class="toggle-track"></span>
        Show collection to others
      </label>
      <label class="toggle-wrap mb-2">
        <input type="checkbox" class="toggle-input" id="tog-rank"${cfg.show_rank!==false?' checked':''}>
        <span class="toggle-track"></span>
        Show rank to others
      </label>
      <label class="toggle-wrap mb-2">
        <input type="checkbox" class="toggle-input" id="tog-notif"${cfg.notifications!==false?' checked':''}>
        <span class="toggle-track"></span>
        Enable notifications
      </label>
      <button class="btn btn-primary mt-1" onclick="saveSettings()">Save Privacy</button>`
  };
  return `<div class="page-title"><h2>Settings</h2></div>
    <div class="settings-layout">
      <div class="settings-nav">${tabBar}</div>
      <div class="sketch-box">${sections[S.settingsTab] || ''}</div>
    </div>`;
}

window.setSettingsTab = (t) => { S.settingsTab = t; document.getElementById('page').innerHTML = viewSettings(); attachListeners(); };
window.applyTheme = (t) => { document.body.className = t === 'default' ? 'theme-default' : 'theme-' + t; };
window.setAvatarColor = async (c) => {
  try {
    await api('/settings/avatar','PUT',{color:c});
    S.user.avatar_color = c;
    notify('Avatar color updated', 'success');
    document.getElementById('page').innerHTML = viewSettings();
    attachListeners();
  } catch (e) { notify(e.message, 'error'); }
};

window.setAvatarEmoji = async (emoji) => {
  try {
    await api('/settings/avatar-img','PUT',{ img: 'emoji:' + emoji });
    S.user.avatar_img = 'emoji:' + emoji;
    notify('Avatar updated', 'success');
    document.getElementById('page').innerHTML = viewSettings();
    attachListeners();
    updateNavAvatar();
  } catch(e) { notify(e.message,'error'); }
};

window.handleAvatarFile = (input) => {
  const file = input.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { notify('Please select an image file','error'); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 80; canvas.height = 80;
      const ctx2 = canvas.getContext('2d');
      // Crop to square
      const min = Math.min(img.width, img.height);
      const sx = (img.width - min) / 2;
      const sy = (img.height - min) / 2;
      ctx2.drawImage(img, sx, sy, min, min, 0, 0, 80, 80);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      try {
        await api('/settings/avatar-img','PUT',{ img: dataUrl });
        S.user.avatar_img = dataUrl;
        notify('Avatar updated!', 'success');
        document.getElementById('page').innerHTML = viewSettings();
        attachListeners();
        updateNavAvatar();
      } catch(err) { notify(err.message,'error'); }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
};

function updateNavAvatar() {
  const wrap = document.querySelector('.nav-avatar');
  if (wrap && S.user) wrap.innerHTML = _av(S.user, 36);
}
window.updateNavAvatar = updateNavAvatar;

window.saveBio = async () => {
  const bio = document.getElementById('bio-input')?.value || '';
  try {
    await api('/settings/bio','PUT',{bio});
    S.user.bio = bio;
    notify('Bio saved', 'success');
  } catch (e) { notify(e.message, 'error'); }
};
window.changePassword = async () => {
  const cur = document.getElementById('pw-cur')?.value;
  const nw = document.getElementById('pw-new')?.value;
  const nw2 = document.getElementById('pw-new2')?.value;
  if (nw !== nw2) { notify('New passwords do not match', 'error'); return; }
  try {
    await api('/settings/password','PUT',{current:cur,newPassword:nw});
    notify('Password changed successfully', 'success');
    ['pw-cur','pw-new','pw-new2'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
  } catch (e) { notify(e.message, 'error'); }
};
window.deleteAccount = () => {
  if (!confirm('This will permanently delete your account and all your cards. Are you sure?')) return;
  notify('Account deletion is disabled in this build. Contact a staff member.', 'warning');
};
window.saveSettings = async () => {
  const theme = document.getElementById('theme-select')?.value || 'default';
  const privacy_level = document.getElementById('priv-select')?.value || 'public';
  const show_collection = document.getElementById('tog-col')?.checked !== false;
  const show_rank = document.getElementById('tog-rank')?.checked !== false;
  const notifications = document.getElementById('tog-notif')?.checked !== false;
  try {
    await api('/settings','PUT',{theme, privacy_level, show_collection, show_rank, notifications});
    S.settings = {...S.settings, theme, privacy_level, show_collection, show_rank, notifications};
    applyTheme(theme);
    notify('Settings saved', 'success');
  } catch (e) { notify(e.message, 'error'); }
};

// ─── ADMIN PANEL ──────────────────────────────────────────────────
function viewAdmin() {
  const role = S.user?.role || 'user';
  const ri = ROLE_ORDER.indexOf(role);
  const tabs = [
    ['users','Users',1],['reports','Reports',1],['staffchat','Staff Chat',1],['logs','Logs',2],
    ['stats','Stats',2],['cards','Cards',3],['economy','Economy',3],
    ['developer','Developer',5]
  ].filter(([,, min]) => ri >= min);
  const tabBar = tabs.map(([t,l]) => `<button class="admin-tab${S.adminTab===t?' active':''}${t==='developer'?' dev-tab':''}" onclick="setAdminTab('${t}')">${l}</button>`).join('');
  return `<div class="page-title"><h2>Admin Panel</h2><p class="text-muted">Logged in as <strong>${S.user?.username}</strong> - Role: <span class="role-badge role-${role}">${role}</span></p></div>
    <div class="admin-tabs">${tabBar}</div>
    <div id="admin-content">${renderAdminTab()}</div>`;
}

function renderAdminTab() {
  switch(S.adminTab) {
    case 'users':     return adminUsers();
    case 'reports':   return adminReports();
    case 'staffchat': return adminStaffChat();
    case 'logs':      return adminLogs();
    case 'stats':     return adminStats();
    case 'cards':     return adminCards();
    case 'economy':   return adminEconomy();
    case 'developer': return adminDeveloper();
    default:          return adminUsers();
  }
}

window.setAdminTab = async (t) => {
  // Clear existing stats refresh
  if (S._statsInterval) { clearInterval(S._statsInterval); S._statsInterval = null; }
  S.adminTab = t;
  document.getElementById('admin-content').innerHTML = '<div class="spinner"></div>';
  await loadAdminTabData(t);
  document.getElementById('admin-content').innerHTML = renderAdminTab();
  attachListeners();
  if (t === 'stats') {
    S._statsInterval = setInterval(async () => {
      if (S.view !== 'admin' || S.adminTab !== 'stats') { clearInterval(S._statsInterval); S._statsInterval = null; return; }
      S._adminStats = await api('/admin/stats').catch(() => S._adminStats);
      const el = document.getElementById('admin-content');
      if (el) { el.innerHTML = renderAdminTab(); attachListeners(); }
    }, 5000);
  }
};

async function loadAdminTabData(t) {
  try {
    if (t === 'users')     S._adminUsers     = await api('/admin/users');
    if (t === 'reports')   S._adminReports   = await api('/admin/reports');
    if (t === 'staffchat') S._staffChat      = await api('/staff/chat');
    if (t === 'logs')      S._adminLogs      = await api('/admin/logs');
    if (t === 'stats')     S._adminStats     = await api('/admin/stats');
  } catch {}
}

function adminUsers() {
  const users = S._adminUsers || [];
  const ri = ROLE_ORDER.indexOf(S.user?.role || 'user');
  const rows = users.map(u => {
    const timedOut = u.timeout_until && new Date(u.timeout_until) > new Date();
    const statusBadge = u.banned
      ? `<span class="admin-badge badge-banned">Banned</span>`
      : timedOut
        ? `<span class="admin-badge badge-timeout">Timed Out</span>`
        : `<span class="admin-badge badge-active">Active</span>`;
    const warnBadge = u.warning_count > 0
      ? `<span class="admin-badge badge-warn" title="${u.warning_count} warning(s)">${u.warning_count} ⚠</span>`
      : '';
    return `<tr>
      <td>${u.id}</td>
      <td><strong>${u.username}</strong> ${warnBadge}</td>
      <td><span class="role-badge role-${u.role}">${u.role}</span></td>
      <td>${u.coins}</td>
      <td>${statusBadge}</td>
      <td class="admin-actions-cell">
        ${!u.banned
          ? `<button class="btn btn-sm btn-red" onclick="adminBan(${u.id},'${u.username}')">Ban</button>`
          : `<button class="btn btn-sm btn-green" onclick="adminUnban(${u.id})">Unban</button>`}
        ${!timedOut
          ? `<button class="btn btn-sm btn-orange" onclick="adminTimeout(${u.id},'${u.username}')">Timeout</button>`
          : `<button class="btn btn-sm" onclick="adminRemoveTimeout(${u.id})">Untimeout</button>`}
        <button class="btn btn-sm btn-yellow" onclick="adminWarn(${u.id},'${u.username}')">Warn</button>
        <button class="btn btn-sm" onclick="adminViewWarnings(${u.id},'${u.username}')">Warnings</button>
        ${ri >= 2 ? `<button class="btn btn-sm" onclick="adminSetRole(${u.id},'${u.username}')">Role</button>` : ''}
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" class="text-muted text-center">No users found</td></tr>';
  return `<div class="flex gap-2 mb-2" style="flex-wrap:wrap;align-items:flex-end">
    <input class="input-box" id="usr-search" placeholder="Search username..." style="max-width:240px">
    <button class="btn" onclick="adminSearchUsers()">Search</button>
    <button class="btn" onclick="adminLoadUsers()">Show All</button>
  </div>
  <div style="overflow-x:auto"><table class="admin-table">
    <thead><tr><th>ID</th><th>Username</th><th>Role</th><th>Coins</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

window.adminLoadUsers = async () => { S._adminUsers = await api('/admin/users').catch(()=>[]); document.getElementById('admin-content').innerHTML = renderAdminTab(); attachListeners(); };
window.adminSearchUsers = async () => {
  const q = document.getElementById('usr-search')?.value?.trim();
  S._adminUsers = await api('/admin/users' + (q ? '?q=' + encodeURIComponent(q) : '')).catch(()=>[]);
  document.getElementById('admin-content').innerHTML = renderAdminTab(); attachListeners();
};
window.adminBan = (id, name) => {
  const reason = prompt(`Reason for banning ${name}:`);
  if (!reason) return;
  api('/admin/users/' + id + '/ban','PUT',{reason}).then(() => { notify(name + ' has been banned', 'success'); adminLoadUsers(); }).catch(e => notify(e.message,'error'));
};
window.adminUnban = (id) => {
  api('/admin/users/' + id + '/unban','PUT').then(() => { notify('User unbanned', 'success'); adminLoadUsers(); }).catch(e => notify(e.message,'error'));
};
window.adminSetRole = (id, name) => {
  const roles = ROLE_ORDER.filter(r => r !== 'user' && ROLE_ORDER.indexOf(r) < ROLE_ORDER.indexOf(S.user.role));
  const role = prompt(`Set role for ${name}:\nOptions: ${roles.join(', ')}`);
  if (!role || !roles.includes(role)) { notify('Invalid role', 'error'); return; }
  api('/admin/users/' + id + '/role','PUT',{role}).then(() => { notify('Role updated to ' + role, 'success'); adminLoadUsers(); }).catch(e => notify(e.message,'error'));
};

window.adminWarn = (id, name) => {
  const reason = prompt(`Issue warning to ${name}:\nReason:`);
  if (!reason?.trim()) return;
  api('/admin/users/' + id + '/warn', 'POST', { reason })
    .then(() => { notify(`Warning issued to ${name}`, 'success'); adminLoadUsers(); })
    .catch(e => notify(e.message, 'error'));
};

window.adminTimeout = (id, name) => {
  const duration = prompt(`Timeout ${name}:\nDuration (1h, 6h, 12h, 24h, 3d, 7d):`);
  if (!duration) return;
  const reason = prompt('Reason (optional):') || '';
  api('/admin/users/' + id + '/timeout', 'PUT', { duration, reason })
    .then(() => { notify(`${name} timed out for ${duration}`, 'success'); adminLoadUsers(); })
    .catch(e => notify(e.message, 'error'));
};

window.adminRemoveTimeout = (id) => {
  api('/admin/users/' + id + '/timeout', 'DELETE')
    .then(() => { notify('Timeout removed', 'success'); adminLoadUsers(); })
    .catch(e => notify(e.message, 'error'));
};

window.adminViewWarnings = async (id, name) => {
  try {
    const warnings = await api('/admin/users/' + id + '/warnings');
    const ri = ROLE_ORDER.indexOf(S.user?.role || 'user');
    const rows = warnings.length
      ? warnings.map(w => `
          <div class="warning-entry">
            <div class="warning-meta">
              <span class="text-muted" style="font-size:0.8rem">${new Date(w.created_at).toLocaleString()}</span>
              <span style="font-size:0.8rem">by <strong>${w.issued_by_name || 'Unknown'}</strong></span>
            </div>
            <div class="warning-reason">${w.reason}</div>
            ${ri >= 2 ? `<button class="btn btn-sm btn-red" onclick="adminDeleteWarning(${w.id})">Remove</button>` : ''}
          </div>`).join('')
      : '<p class="text-muted">No warnings on record.</p>';
    openModal(`<div style="min-width:340px;max-width:500px">
      <h3 style="margin-bottom:1rem">Warnings — ${name}</h3>
      <div id="warnings-list">${rows}</div>
      <div class="text-center mt-2"><button class="btn" onclick="closeModal()">Close</button></div>
    </div>`);
  } catch (e) { notify(e.message, 'error'); }
};

window.adminDeleteWarning = async (wid) => {
  if (!confirm('Remove this warning?')) return;
  try {
    await api('/admin/warnings/' + wid, 'DELETE');
    notify('Warning removed', 'success');
    closeModal();
  } catch (e) { notify(e.message, 'error'); }
};

function adminReports() {
  const reports = S._adminReports || [];
  const PRIORITY_ORDER = { urgent:0, high:1, normal:2, low:3 };
  const sorted = [...reports].sort((a,b) => (PRIORITY_ORDER[a.priority||'normal']||2) - (PRIORITY_ORDER[b.priority||'normal']||2));
  const rows = sorted.map(r => {
    const pri = r.priority || 'normal';
    return `<tr style="cursor:pointer" onclick="adminViewReport(${r.id})">
      <td>${r.id}</td>
      <td><span class="profile-link" onclick="event.stopPropagation();openProfile('${r.reporter_name}')">${r.reporter_name}</span></td>
      <td><span class="profile-link" onclick="event.stopPropagation();openProfile('${r.reported_name}')">${r.reported_name}</span></td>
      <td>${r.category}</td>
      <td><span class="priority-badge priority-${pri}">${pri}</span></td>
      <td>${r.description.slice(0,50)}${r.description.length>50?'...':''}</td>
      <td><span class="report-status status-${r.status}">${r.status}</span></td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" class="text-muted text-center">No reports</td></tr>';
  const urgentCount = reports.filter(r=>r.priority==='urgent').length;
  return `<div class="flex gap-2 mb-2" style="flex-wrap:wrap;align-items:center">
    <select class="input-box" id="rep-filter" style="max-width:180px" onchange="adminFilterReports(this.value)">
      <option value="">All</option><option value="open">Open</option><option value="reviewing">Reviewing</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option>
    </select>
    <button class="btn" onclick="adminLoadReports()">Refresh</button>
    ${urgentCount > 0 ? `<span style="color:var(--red);font-weight:700;font-size:0.9rem">⚠ ${urgentCount} urgent</span>` : ''}
  </div>
  <div style="overflow-x:auto"><table class="admin-table">
    <thead><tr><th>ID</th><th>Reporter</th><th>Reported</th><th>Category</th><th>Priority</th><th>Description</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>
  <p class="text-muted" style="font-size:0.82rem;margin-top:0.5rem">Click any row to view full details and update.</p>`;
}

window.adminLoadReports = async () => { S._adminReports = await api('/admin/reports').catch(()=>[]); document.getElementById('admin-content').innerHTML = renderAdminTab(); attachListeners(); };
window.adminFilterReports = async (status) => { S._adminReports = await api('/admin/reports' + (status ? '?status=' + status : '')).catch(()=>[]); document.getElementById('admin-content').innerHTML = renderAdminTab(); attachListeners(); };
window.adminViewReport = (id) => {
  const r = (S._adminReports || []).find(x => x.id === id);
  if (!r) return;
  const pri = r.priority || 'normal';
  openModal(`<div style="max-width:480px">
    <h3 style="margin-bottom:1rem">Report #${r.id}</h3>
    <div class="report-detail-row"><strong>Reporter:</strong> <span onclick="openProfile('${r.reporter_name}')" class="profile-link">${r.reporter_name}</span></div>
    <div class="report-detail-row"><strong>Reported:</strong> <span onclick="openProfile('${r.reported_name}')" class="profile-link">${r.reported_name}</span></div>
    <div class="report-detail-row"><strong>Category:</strong> ${r.category}</div>
    <div class="report-detail-row"><strong>Priority:</strong> <span class="priority-badge priority-${pri}">${pri.toUpperCase()}</span></div>
    <div class="report-detail-row"><strong>Status:</strong> <span class="report-status status-${r.status}">${r.status}</span></div>
    <div class="report-detail-row"><strong>Date:</strong> ${new Date(r.created_at).toLocaleString()}</div>
    <div style="background:var(--paper-dark);border:1px solid var(--paper-line);border-radius:4px;padding:0.75rem;margin:0.75rem 0;font-size:0.9rem">${r.description}</div>
    ${r.evidence_url ? `<div class="report-detail-row"><strong>Evidence:</strong> <a href="${r.evidence_url}" target="_blank" rel="noopener" style="color:var(--cyan)">${r.evidence_url}</a></div>` : ''}
    ${r.handler_notes ? `<div style="background:var(--paper-dark);border:1px solid var(--gold);border-radius:4px;padding:0.6rem;font-size:0.85rem;color:var(--gold)">Staff note: ${r.handler_notes}</div>` : ''}
    <div class="form-group mt-2"><label>Update Status</label>
      <select id="rep-status-sel" class="input-box">
        ${['open','reviewing','resolved','dismissed'].map(s=>`<option value="${s}"${r.status===s?' selected':''}>${s}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label>Handler Notes</label>
      <textarea id="rep-notes-inp" class="input-box">${r.handler_notes||''}</textarea>
    </div>
    <div class="flex gap-2">
      <button class="btn btn-primary" onclick="adminSaveReport(${id})">Save</button>
      ${ROLE_ORDER.indexOf(S.user?.role)>=2?`<button class="btn btn-red" onclick="adminDeleteReport(${id});closeModal()">Delete</button>`:''}
    </div>
  </div>`);
};
window.adminSaveReport = (id) => {
  const status = document.getElementById('rep-status-sel')?.value;
  const notes = document.getElementById('rep-notes-inp')?.value;
  api('/admin/reports/' + id,'PUT',{status, handler_notes: notes}).then(() => { notify('Report updated', 'success'); closeModal(); adminLoadReports(); }).catch(e => notify(e.message,'error'));
};
window.adminDeleteReport = (id) => {
  if (!confirm('Delete this report?')) return;
  api('/admin/reports/' + id,'DELETE').then(() => { notify('Report deleted', 'success'); adminLoadReports(); }).catch(e => notify(e.message,'error'));
};

// ─── STAFF CHAT ───────────────────────────────────────────────────
function adminStaffChat() {
  const msgs = S._staffChat || [];
  const chatHtml = msgs.length
    ? msgs.map(m => `<div class="staff-msg">
        <span class="staff-msg-avatar">${_av(m, 32)}</span>
        <div class="staff-msg-body">
          <div class="staff-msg-header"><span class="staff-msg-name" onclick="openProfile('${m.username}')" style="cursor:pointer">${m.username}</span><span class="role-badge role-${m.role}" style="font-size:0.7rem">${m.role}</span><span class="staff-msg-time text-muted">${new Date(m.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span></div>
          <div class="staff-msg-text">${m.message.replace(/</g,'&lt;')}</div>
        </div>
      </div>`).join('')
    : '<p class="text-muted text-center" style="padding:1.5rem">No messages yet. Be the first to say something!</p>';
  return `<div class="staff-chat-wrap">
    <div class="staff-chat-msgs" id="staff-chat-msgs">${chatHtml}</div>
    <div class="staff-chat-input-row">
      <input id="staff-chat-input" class="input-box" placeholder="Message staff..." style="flex:1" onkeydown="if(event.key==='Enter')sendStaffMsg()">
      <button class="btn btn-primary" onclick="sendStaffMsg()">Send</button>
      <button class="btn" onclick="refreshStaffChat()" title="Refresh">↻</button>
    </div>
  </div>`;
}

window.sendStaffMsg = async () => {
  const inp = document.getElementById('staff-chat-input');
  const msg = inp?.value?.trim();
  if (!msg) return;
  try {
    await api('/staff/chat','POST',{message: msg});
    inp.value = '';
    S._staffChat = await api('/staff/chat');
    document.getElementById('admin-content').innerHTML = adminStaffChat();
    attachListeners();
    const el = document.getElementById('staff-chat-msgs');
    if (el) el.scrollTop = el.scrollHeight;
  } catch(e) { notify(e.message,'error'); }
};

window.refreshStaffChat = async () => {
  S._staffChat = await api('/staff/chat').catch(()=>[]);
  document.getElementById('admin-content').innerHTML = adminStaffChat();
  attachListeners();
};

function adminLogs() {
  const logs = S._adminLogs || [];
  const rows = logs.map(l => `<tr>
    <td>${l.id}</td>
    <td>${l.admin_name||'?'}</td>
    <td>${l.action}</td>
    <td>${l.target_user_id||'-'}</td>
    <td>${(l.details||'').slice(0,80)}</td>
    <td style="font-size:0.8rem">${new Date(l.created_at).toLocaleString()}</td>
  </tr>`).join('') || '<tr><td colspan="6" class="text-muted text-center">No logs</td></tr>';
  return `<div style="overflow-x:auto"><table class="admin-table">
    <thead><tr><th>ID</th><th>Admin</th><th>Action</th><th>Target</th><th>Details</th><th>Time</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function adminStats() {
  const s = S._adminStats || {};
  return `<div class="grid-2 gap-2">
    <div class="sketch-box text-center"><h3 class="mb-1">${s.user_count||0}</h3><p class="text-muted">Total Users</p></div>
    <div class="sketch-box text-center"><h3 class="mb-1">${s.card_count||0}</h3><p class="text-muted">Total Cards</p></div>
    <div class="sketch-box text-center"><h3 class="mb-1">${s.match_count||0}</h3><p class="text-muted">Total Matches</p></div>
    <div class="sketch-box text-center"><h3 class="mb-1 text-red">${s.open_reports||0}</h3><p class="text-muted">Open Reports</p></div>
  </div>
  ${s.top_player ? `<div class="sketch-box mt-2"><p>Top player: <strong>${s.top_player.username}</strong> with rating <strong>${s.top_player.rating}</strong></p></div>` : ''}
  <div class="sketch-box mt-2">
    <h3 style="margin-bottom:0.8rem">Post Announcement</h3>
    <div class="form-group"><label>Title</label><input id="ann-title" class="input-box" placeholder="Announcement title"></div>
    <div class="form-group"><label>Body</label><textarea id="ann-body" class="input-box" placeholder="Announcement text..."></textarea></div>
    <button class="btn btn-primary" onclick="postAnnouncement()">Post Announcement</button>
  </div>`;
}

window.postAnnouncement = async () => {
  const title = document.getElementById('ann-title')?.value?.trim();
  const body  = document.getElementById('ann-body')?.value?.trim();
  if (!title || !body) { notify('Title and body required', 'error'); return; }
  try {
    await api('/admin/announcements','POST',{title,body});
    notify('Announcement posted', 'success');
    S.announcements = await api('/announcements').catch(()=>[]);
  } catch (e) { notify(e.message,'error'); }
};

function adminCards() {
  return `<div class="sketch-box">
    <h3 style="margin-bottom:1rem">Give Cards to User</h3>
    <div class="form-group"><label>User ID</label><input id="give-uid" class="input-box" placeholder="User ID" type="number"></div>
    <div class="form-group"><label>Card ID</label><input id="give-cid" class="input-box" placeholder="Card ID (1-10500)" type="number"></div>
    <button class="btn btn-primary" onclick="adminGiveCard()">Give Card</button>
  </div>
  <div class="sketch-box mt-2">
    <h3 style="margin-bottom:1rem">Edit Card Stats</h3>
    <p class="text-muted mb-2">Owner+ can modify card stats. Use card ID to target a specific card.</p>
    <div class="form-group"><label>Card ID</label><input id="edit-cid" class="input-box" placeholder="Card ID" type="number"></div>
    <div class="grid-2 gap-1">
      <div class="form-group"><label>HP</label><input id="edit-hp" class="input-box" placeholder="HP" type="number"></div>
      <div class="form-group"><label>ATK</label><input id="edit-atk" class="input-box" placeholder="ATK" type="number"></div>
      <div class="form-group"><label>DEF</label><input id="edit-def" class="input-box" placeholder="DEF" type="number"></div>
      <div class="form-group"><label>SPD</label><input id="edit-spd" class="input-box" placeholder="SPD" type="number"></div>
    </div>
    ${ROLE_ORDER.indexOf(S.user?.role) >= 5 ? `<button class="btn btn-primary" onclick="adminEditCard()">Save Card</button>` : '<p class="text-muted">Developer only</p>'}
  </div>`;
}

window.adminGiveCard = async () => {
  const uid = document.getElementById('give-uid')?.value;
  const cid = document.getElementById('give-cid')?.value;
  if (!uid || !cid) { notify('User ID and Card ID required', 'error'); return; }
  try { await api('/admin/users/' + uid + '/cards/add','PUT',{card_id: parseInt(cid)}); notify('Card given', 'success'); } catch(e) { notify(e.message,'error'); }
};
window.adminEditCard = async () => {
  const id = document.getElementById('edit-cid')?.value;
  if (!id) { notify('Card ID required', 'error'); return; }
  const body = {};
  ['hp','atk','def','spd'].forEach(f => { const v = document.getElementById('edit-' + f)?.value; if (v) body[f] = parseInt(v); });
  try { await api('/dev/cards/' + id,'PUT',body); notify('Card updated', 'success'); } catch(e) { notify(e.message,'error'); }
};

function adminEconomy() {
  return `<div class="sketch-box">
    <h3 style="margin-bottom:1rem">Economy Management</h3>
    <div class="form-group"><label>Give Coins to User (User ID)</label>
      <div class="flex gap-1"><input id="eco-uid" class="input-box" placeholder="User ID" type="number">
      <input id="eco-amt" class="input-box" placeholder="Amount (negative to remove)" type="number">
      <button class="btn btn-primary" onclick="adminGiveCoins()" style="white-space:nowrap">Apply</button></div>
    </div>
    <hr class="divider">
    <h3 style="margin-bottom:0.8rem">Reset Ranked Season</h3>
    <p class="text-muted mb-1">This will reset all season wins/losses and top 500 status.</p>
    <button class="btn btn-red" onclick="adminResetSeason()">Reset Season</button>
  </div>`;
}

window.adminGiveCoins = async () => {
  const uid = document.getElementById('eco-uid')?.value;
  const amt = document.getElementById('eco-amt')?.value;
  if (!uid || !amt) { notify('User ID and amount required', 'error'); return; }
  try { await api('/admin/users/' + uid + '/coins','PUT',{amount: parseInt(amt)}); notify('Coins updated', 'success'); } catch(e) { notify(e.message,'error'); }
};
window.adminResetSeason = async () => {
  if (!confirm('Reset the entire ranked season? This cannot be undone.')) return;
  try { await api('/admin/ranked/reset','PUT'); notify('Season reset!', 'success'); } catch(e) { notify(e.message,'error'); }
};

function adminDeveloper() {
  return `<div class="sketch-box" style="border-color:var(--red)">
    <h3 style="margin-bottom:0.5rem;color:var(--red)">Developer Console</h3>
    <p class="text-muted mb-2" style="font-size:0.85rem">Full database access. Use with caution.</p>

    <h4 style="margin-bottom:0.5rem;margin-top:1rem">Raw SQL Query</h4>
    <textarea id="dev-sql" class="input-box mb-1" placeholder="SELECT * FROM users LIMIT 10;" style="font-family:monospace;font-size:0.9rem;height:80px"></textarea>
    <button class="btn btn-red" onclick="devRunQuery()">Execute Query</button>
    <pre id="dev-result" style="background:var(--paper-dark);border:1px solid var(--paper-line);border-radius:3px;padding:0.8rem;margin-top:0.8rem;overflow:auto;max-height:200px;font-size:0.8rem;display:none"></pre>

    <hr class="divider">
    <h4 style="margin-bottom:0.5rem">Modify User Stats</h4>
    <div class="grid-3 gap-1">
      <div class="form-group"><label>User ID</label><input id="dev-uid" class="input-box" type="number" placeholder="User ID"></div>
      <div class="form-group"><label>Rating</label><input id="dev-rating" class="input-box" type="number" placeholder="Rating"></div>
      <div class="form-group"><label>Coins</label><input id="dev-coins" class="input-box" type="number" placeholder="Coins"></div>
    </div>
    <button class="btn btn-red btn-sm" onclick="devEditStats()">Apply Stats</button>

    <hr class="divider">
    <h4 style="margin-bottom:0.5rem">Create Promo Card</h4>
    <div class="grid-3 gap-1">
      <div class="form-group"><label>Name</label><input id="promo-name" class="input-box" placeholder="Card name"></div>
      <div class="form-group"><label>Type</label><select id="promo-type" class="input-box">${TYPES.map(t=>`<option>${t}</option>`).join('')}</select></div>
      <div class="form-group"><label>Class</label><select id="promo-cls" class="input-box"><option>Titan</option><option>Beast</option><option>Dragon</option><option>Golem</option><option>Sprite</option><option>Demon</option><option>Angel</option><option>Undead</option><option>Elemental</option><option>Construct</option></select></div>
      <div class="form-group"><label>HP</label><input id="promo-hp" class="input-box" type="number" placeholder="200"></div>
      <div class="form-group"><label>ATK</label><input id="promo-atk" class="input-box" type="number" placeholder="100"></div>
      <div class="form-group"><label>DEF</label><input id="promo-def" class="input-box" type="number" placeholder="80"></div>
      <div class="form-group"><label>SPD</label><input id="promo-spd" class="input-box" type="number" placeholder="80"></div>
      <div class="form-group"><label>Ability Name</label><input id="promo-aname" class="input-box" placeholder="Promo Strike"></div>
      <div class="form-group"><label>Ability Power</label><input id="promo-apower" class="input-box" type="number" placeholder="130"></div>
    </div>
    <div class="form-group"><label>Ability Description</label><input id="promo-adesc" class="input-box" placeholder="A legendary promo ability."></div>
    <div class="form-group"><label>Flavor Text</label><input id="promo-flavor" class="input-box" placeholder="Flavor text..."></div>
    <div class="grid-3 gap-1">
      <div class="form-group"><label>Rarity</label><select id="promo-rarity" class="input-box">${['Common','Uncommon','Rare','Ultra_Rare','Secret_Rare','Full_Art','Parallel','Numbered','Prism','Mythic'].map(r=>`<option${r==='Mythic'?' selected':''}>${r}</option>`).join('')}</select></div>
      <div class="form-group"><label>Shop Price (0=not for sale)</label><input id="promo-price" class="input-box" type="number" placeholder="0"></div>
      <input id="promo-set" type="hidden" value="Promo Series">
      <div class="form-group"><label>Art Logo (type)</label><select id="promo-art" class="input-box"><option value="ink">Ink</option><option value="sketch">Sketch</option><option value="watercolor">Watercolor</option><option value="charcoal">Charcoal</option></select></div>
      <div class="form-group"><label>Retreat Cost</label><input id="promo-retreat" class="input-box" type="number" placeholder="1"></div>
    </div>
    <div class="flex gap-2" style="align-items:center;flex-wrap:wrap;margin-bottom:0.5rem">
      <label style="display:flex;align-items:center;gap:0.4rem;cursor:pointer"><input type="checkbox" id="promo-numbered"> Numbered Card</label>
      <div class="form-group" style="margin:0;display:flex;align-items:center;gap:0.5rem">
        <label style="white-space:nowrap;font-size:0.85rem">Print Limit</label>
        <input id="promo-print-limit" class="input-box" type="number" placeholder="blank = unlimited" style="width:160px">
      </div>
    </div>
    <div class="form-group">
      <label>Expiry Date &amp; Time <span class="text-muted" style="font-size:0.8rem">(leave blank = 1 week from now)</span></label>
      <input id="promo-expires" class="input-box" type="datetime-local">
    </div>
    <button class="btn btn-red btn-sm" onclick="devCreatePromo()">Create Promo</button>

    <hr class="divider">
    <h4 style="margin-bottom:0.5rem">Leaderboard Override</h4>
    <div class="flex gap-1">
      <input id="dev-lb-uid" class="input-box" type="number" placeholder="User ID">
      <input id="dev-lb-rating" class="input-box" type="number" placeholder="New rating">
      <button class="btn btn-red btn-sm" onclick="devSetRating()" style="white-space:nowrap">Set Rating</button>
    </div>

    <hr class="divider">
    <h4 style="margin-bottom:0.5rem">Economy Settings</h4>
    <div class="grid-3 gap-1">
      <div class="form-group"><label>Pack Cost</label><input id="eco-pack" class="input-box" type="number" placeholder="100"></div>
      <div class="form-group"><label>Daily Coins</label><input id="eco-daily" class="input-box" type="number" placeholder="50"></div>
      <div class="form-group"><label>Win Coins</label><input id="eco-win" class="input-box" type="number" placeholder="30"></div>
    </div>
    <button class="btn btn-red btn-sm" onclick="devSetEconomy()">Update Economy</button>

    <hr class="divider">
    <h4 style="margin-bottom:0.5rem">Maintenance Mode</h4>
    <div class="flex gap-1" style="flex-wrap:wrap">
      ${['battle','packs','friends','ranked'].map(f => `<button class="btn btn-sm btn-red" onclick="devMaintenance('${f}')">Toggle ${f}</button>`).join('')}
    </div>

    <hr class="divider">
    <h4 style="margin-bottom:0.5rem">Grant Card Collection</h4>
    <div class="flex gap-1">
      <input id="dev-grant-uid" class="input-box" type="number" placeholder="User ID">
      <input id="dev-grant-cids" class="input-box" placeholder="Card IDs (comma separated)">
      <button class="btn btn-red btn-sm" onclick="devGrantCards()" style="white-space:nowrap">Grant</button>
    </div>

    <hr class="divider">
    <h4 style="margin-bottom:0.5rem">Create Custom Rank</h4>
    <div class="flex gap-1">
      <input id="dev-rank-name" class="input-box" placeholder="Rank name">
      <input id="dev-rank-min" class="input-box" type="number" placeholder="Min rating">
      <button class="btn btn-red btn-sm" onclick="devCreateRank()" style="white-space:nowrap">Create Rank</button>
    </div>

    <hr class="divider">
    <div class="flex gap-1" style="flex-wrap:wrap">
      <button class="btn btn-sm" onclick="devPerformance()">Server Performance</button>
      <button class="btn btn-sm" onclick="devTables()">List Tables</button>
      <button class="btn btn-sm" onclick="devBackup()">DB Snapshot</button>
      <button class="btn btn-sm" onclick="devApiUsage()">API Usage</button>
    </div>
    <pre id="dev-info" style="background:var(--paper-dark);border:1px solid var(--paper-line);border-radius:3px;padding:0.8rem;margin-top:0.8rem;overflow:auto;max-height:200px;font-size:0.8rem;display:none"></pre>
  </div>`;
}

function showDevResult(data) {
  const el = document.getElementById('dev-result');
  if (el) { el.style.display = 'block'; el.textContent = JSON.stringify(data, null, 2); }
}
function showDevInfo(data) {
  const el = document.getElementById('dev-info');
  if (el) { el.style.display = 'block'; el.textContent = JSON.stringify(data, null, 2); }
}

window.devRunQuery = async () => {
  const sql = document.getElementById('dev-sql')?.value?.trim();
  if (!sql) return;
  try { const r = await api('/dev/database/query','POST',{sql}); showDevResult(r); } catch(e) { notify(e.message,'error'); }
};
window.devEditStats = async () => {
  const uid = document.getElementById('dev-uid')?.value;
  const rating = document.getElementById('dev-rating')?.value;
  const coins = document.getElementById('dev-coins')?.value;
  if (!uid) { notify('User ID required', 'error'); return; }
  const body = {};
  if (rating) body.rating = parseInt(rating);
  if (coins)  body.coins  = parseInt(coins);
  try { await api('/dev/users/' + uid + '/stats','PUT',body); notify('Stats updated', 'success'); } catch(e) { notify(e.message,'error'); }
};
window.devCreatePromo = async () => {
  const g = id => document.getElementById(id);
  const name = g('promo-name')?.value?.trim();
  if (!name) { notify('Name required', 'error'); return; }
  const body = {
    name,
    type:          g('promo-type')?.value || 'Fire',
    cls:           g('promo-cls')?.value  || 'Titan',
    hp:            parseInt(g('promo-hp')?.value)     || 200,
    atk:           parseInt(g('promo-atk')?.value)    || 100,
    def:           parseInt(g('promo-def')?.value)    || 80,
    spd:           parseInt(g('promo-spd')?.value)    || 80,
    ability_name:  g('promo-aname')?.value?.trim()   || 'Promo Strike',
    ability_desc:  g('promo-adesc')?.value?.trim()   || 'A legendary promo ability.',
    ability_power: parseInt(g('promo-apower')?.value) || 130,
    rarity:        g('promo-rarity')?.value          || 'Mythic',
    shop_price:    parseInt(g('promo-price')?.value)  || 0,
    set_name:      g('promo-set')?.value?.trim()     || 'Promo Series',
    art_style:     g('promo-art')?.value             || 'ink',
    flavor_text:   g('promo-flavor')?.value?.trim()  || '',
    retreat_cost:  parseInt(g('promo-retreat')?.value) || 1,
    is_numbered:   g('promo-numbered')?.checked      || false,
    print_limit:   g('promo-print-limit')?.value ? parseInt(g('promo-print-limit').value) : null,
    expires_at:    g('promo-expires')?.value || null,
  };
  try {
    const r = await api('/dev/cards/promo','POST', body);
    notify('Promo card created: ID ' + r.id, 'success');
    S._promoCards = await api('/shop/promos').catch(()=>[]);
  } catch(e) { notify(e.message,'error'); }
};
window.devSetRating = async () => {
  const uid = document.getElementById('dev-lb-uid')?.value;
  const rating = document.getElementById('dev-lb-rating')?.value;
  if (!uid || !rating) { notify('User ID and rating required', 'error'); return; }
  try { await api('/dev/ranked/leaderboard/' + uid,'PUT',{rating: parseInt(rating)}); notify('Rating set', 'success'); } catch(e) { notify(e.message,'error'); }
};
window.devSetEconomy = async () => {
  const pack_cost   = document.getElementById('eco-pack')?.value;
  const daily_coins = document.getElementById('eco-daily')?.value;
  const win_coins   = document.getElementById('eco-win')?.value;
  const body = {};
  if (pack_cost)   body.pack_cost   = parseInt(pack_cost);
  if (daily_coins) body.daily_coins = parseInt(daily_coins);
  if (win_coins)   body.win_coins   = parseInt(win_coins);
  try { await api('/dev/economy','PUT',body); notify('Economy updated', 'success'); } catch(e) { notify(e.message,'error'); }
};
window.devMaintenance = async (feature) => {
  const enabled = prompt(`Enable maintenance for ${feature}? (true/false)`) === 'true';
  try { await api('/dev/maintenance/' + feature,'PUT',{enabled}); notify('Maintenance toggled for ' + feature, 'success'); } catch(e) { notify(e.message,'error'); }
};
window.devGrantCards = async () => {
  const uid  = document.getElementById('dev-grant-uid')?.value;
  const cids = document.getElementById('dev-grant-cids')?.value?.split(',').map(s => parseInt(s.trim())).filter(Boolean);
  if (!uid || !cids?.length) { notify('User ID and card IDs required', 'error'); return; }
  try { const r = await api('/dev/users/' + uid + '/collection/grant','PUT',{card_ids: cids}); notify(r.message, 'success'); } catch(e) { notify(e.message,'error'); }
};
window.devCreateRank = async () => {
  const name = document.getElementById('dev-rank-name')?.value?.trim();
  const min  = document.getElementById('dev-rank-min')?.value;
  if (!name || !min) { notify('Name and min rating required', 'error'); return; }
  try { await api('/dev/ranked/create-rank','POST',{name,min_rating: parseInt(min)}); notify('Rank created', 'success'); } catch(e) { notify(e.message,'error'); }
};
window.devPerformance = async () => { try { showDevInfo(await api('/dev/performance')); } catch(e) { notify(e.message,'error'); } };
window.devTables     = async () => { try { showDevInfo(await api('/dev/database/tables')); } catch(e) { notify(e.message,'error'); } };
window.devBackup     = async () => { try { showDevInfo(await api('/dev/database/backup','POST')); } catch(e) { notify(e.message,'error'); } };
window.devApiUsage   = async () => { try { showDevInfo(await api('/dev/api-usage')); } catch(e) { notify(e.message,'error'); } };

// ─── EVENT DELEGATION ─────────────────────────────────────────────
function attachListeners() {
  // keyboard submit for forms
  document.querySelectorAll('.input-box, .input-sketch').forEach(el => {
    el.removeEventListener('keydown', handleEnter);
    el.addEventListener('keydown', handleEnter);
  });
}
function handleEnter(e) {
  if (e.key !== 'Enter') return;
  const view = S.view;
  if (view === 'friends') sendFriendRequest();
}

// ─── NOTIFICATION POLLING ─────────────────────────────────────────
async function pollNotifications() {
  if (!S.user) return;
  try {
    const fresh = await api('/notifications');
    const prevUnread = S.notifications.filter(n => !n.read).length;
    S.notifications = fresh;
    const newUnread = fresh.filter(n => !n.read).length;
    // Show toast for any new notifications
    if (newUnread > prevUnread) {
      const newest = fresh.find(n => !n.read);
      if (newest) notify(newest.message, newest.type === 'friend_accepted' ? 'success' : 'info');
    }
    updateNotifBell();
  } catch {}
}

// ─── INIT ──────────────────────────────────────────────────────────
async function init() {
  const hash = window.location.hash.replace('#','') || 'login';
  S.view = hash;

  if (S.token) {
    try {
      S.user = await api('/auth/me');
      if (S.view === 'login' || S.view === 'register') S.view = 'home';
    } catch {
      S.token = null;
      localStorage.removeItem('mtcg_token');
      S.view = 'login';
    }
  }

  if (S.user) {
    const [col, friends, lb, myRank, reports, ann, settings, notifs, newsData, cqProgress] = await Promise.allSettled([
      api('/user/collection'),
      api('/friends'),
      api('/ranked/leaderboard'),
      api('/ranked/me'),
      api('/reports/mine'),
      api('/announcements'),
      api('/settings'),
      api('/notifications'),
      api('/news'),
      api('/conquest/progress'),
    ]);
    S.collection       = col.value          || [];
    S.friends          = friends.value      || [];
    S.leaderboard      = lb.value           || [];
    S.myRank           = myRank.value       || null;
    S.reports          = reports.value      || [];
    S.announcements    = ann.value          || [];
    S.settings         = settings.value     || {};
    S.notifications    = notifs.value       || [];
    S.news             = newsData.value     || [];
    S.conquestProgress = cqProgress.value   || [];
    const deckFetch = await api('/deck').catch(() => null);
    S.deck      = deckFetch?.card_ids || [];
    S.deckCards = deckFetch?.cards    || [];
    S._promoCards = await api('/shop/promos').catch(() => []);
    if (S.settings.theme) applyTheme(S.settings.theme);

    if (ROLE_ORDER.indexOf(S.user.role) >= 1) {
      const [adminUsers, adminReports] = await Promise.allSettled([
        api('/admin/users'),
        api('/admin/reports'),
      ]);
      S._adminUsers   = adminUsers.value   || [];
      S._adminReports = adminReports.value || [];
    }

    // ── Auto-refresh polls ─────────────────────────────────────
    // 15s: user stats (coins, etc.)
    setInterval(async () => {
      if (!S.user) return;
      const fresh = await api('/auth/me').catch(() => null);
      if (!fresh) return;
      const coinsChanged = fresh.coins !== S.user.coins;
      S.user = { ...S.user, ...fresh };
      if (coinsChanged) updateNavCoins();
      if (coinsChanged && (S.view === 'home' || S.view === 'shop')) {
        document.getElementById('page').innerHTML = S.view === 'home' ? viewHome() : viewShop();
        attachListeners();
      }
    }, 15000);

    // 15s: conquest progress
    setInterval(async () => {
      if (!S.user) return;
      const fresh = await api('/conquest/progress').catch(() => null);
      if (!fresh) return;
      const changed = JSON.stringify(fresh) !== JSON.stringify(S.conquestProgress);
      S.conquestProgress = fresh;
      if (changed && S.view === 'conquest') {
        document.getElementById('page').innerHTML = viewConquest();
        attachListeners();
      }
    }, 15000);

    // 30s: notifications
    setInterval(pollNotifications, 30000);

    // 30s: collection + deck
    setInterval(async () => {
      if (!S.user) return;
      const [col, deckFetch] = await Promise.allSettled([
        api('/user/collection'),
        api('/deck'),
      ]);
      if (col.value) {
        const changed = S.collection.length !== col.value.length;
        S.collection = col.value;
        if (changed && S.view === 'collection') {
          document.getElementById('page').innerHTML = viewCollection();
          attachListeners();
        }
      }
      if (deckFetch.value) {
        S.deck      = deckFetch.value.card_ids || [];
        S.deckCards = deckFetch.value.cards    || [];
        if (S.view === 'deck') {
          document.getElementById('page').innerHTML = viewDeck();
          attachListeners();
        }
      }
    }, 30000);

    // 30s: my rank
    setInterval(async () => {
      if (!S.user) return;
      const fresh = await api('/ranked/me').catch(() => null);
      if (!fresh) return;
      const changed = JSON.stringify(fresh) !== JSON.stringify(S.myRank);
      S.myRank = fresh;
      if (changed && S.view === 'ranked') {
        document.getElementById('page').innerHTML = viewRanked();
        attachListeners();
      }
    }, 30000);

    // 60s: friends
    setInterval(async () => {
      if (!S.user) return;
      const fresh = await api('/friends').catch(() => null);
      if (!fresh) return;
      const prevPending = S.friends.filter(f => f.status === 'pending').length;
      S.friends = fresh;
      const newPending = fresh.filter(f => f.status === 'pending').length;
      if (newPending > prevPending && S.view !== 'friends') {
        notify('You have a new friend request!', 'info');
      }
      if (S.view === 'friends') {
        document.getElementById('page').innerHTML = viewFriends();
        attachListeners();
      }
    }, 60000);

    // 60s: leaderboard
    setInterval(async () => {
      if (!S.user) return;
      const fresh = await api('/ranked/leaderboard').catch(() => null);
      if (!fresh) return;
      S.leaderboard = fresh;
      if (S.view === 'ranked') {
        document.getElementById('page').innerHTML = viewRanked();
        attachListeners();
      }
    }, 60000);

    // 60s: news + announcements
    setInterval(async () => {
      if (!S.user) return;
      const [newsData, ann] = await Promise.allSettled([
        api('/news'),
        api('/announcements'),
      ]);
      if (newsData.value) {
        S.news = newsData.value;
        if (S.view === 'news') {
          document.getElementById('page').innerHTML = viewNews();
          attachListeners();
        }
      }
      if (ann.value) S.announcements = ann.value;
    }, 60000);

    // 60s: my reports
    setInterval(async () => {
      if (!S.user) return;
      const fresh = await api('/reports/mine').catch(() => null);
      if (!fresh) return;
      S.reports = fresh;
      if (S.view === 'reports') {
        document.getElementById('page').innerHTML = viewReports();
        attachListeners();
      }
    }, 60000);

    // 60s: promo cards
    setInterval(async () => {
      if (!S.user) return;
      const fresh = await api('/shop/promos').catch(() => null);
      if (fresh) S._promoCards = fresh;
    }, 60000);
  }

  render();
  Music.autoStart();
  window.addEventListener('hashchange', () => {
    const v = window.location.hash.replace('#','');
    if (v && v !== S.view) {
      S.view = v;
      // Refresh news when switching to news tab
      if (v === 'news') api('/news').then(d => { S.news = d; document.getElementById('page').innerHTML = viewNews(); }).catch(()=>{});
      // Refresh friends when switching to friends tab
      if (v === 'friends') api('/friends').then(d => { S.friends = d; document.getElementById('page').innerHTML = viewFriends(); attachListeners(); }).catch(()=>{});
      // Load card browser
      if (v === 'cards') loadCardBrowser();
      render();
    }
  });

  // Close notif panel when clicking outside
  document.addEventListener('click', (e) => {
    const panel = document.getElementById('notif-panel');
    const bell  = document.querySelector('.notif-bell');
    if (panel && !panel.contains(e.target) && bell && !bell.contains(e.target)) {
      panel.classList.add('hidden');
    }
  });
}

init();
