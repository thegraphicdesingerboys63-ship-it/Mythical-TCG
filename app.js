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
  S.view = view;
  window.location.hash = view;
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
    case 'battle':      return viewBattle();
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
    ['home','Home'],['shop','Shop'],['cards','All Cards'],['conquest','Conquest'],['collection','Collection'],['battle','Battle'],
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
      <span class="nav-avatar" style="background:${u?.avatar_color||'#c0392b'};color:#fff" onclick="nav('settings')">${u ? u.username[0].toUpperCase() : ''}</span>
      <span class="role-badge role-${u?.role||'user'}">${u?.role||''}</span>
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
      <div class="notif-item-avatar" style="background:${n.from_avatar||'#888'};color:#fff">${n.from_username ? n.from_username[0].toUpperCase() : '?'}</div>
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

function renderCard(card, size = 'normal', onclick = '') {
  const tc = typeColor(card.type);
  const rc = 'rarity-' + (card.rarity || 'common').toLowerCase();
  const sz = size === 'large' ? ' large' : '';
  const oc = onclick ? ` onclick="${onclick}"` : '';
  const hpPct = card.current_hp !== undefined ? Math.round((card.current_hp / card.hp) * 100) : 100;
  const hpColor = hpPct > 50 ? '' : hpPct > 25 ? ' yellow' : ' red';
  return `<div class="tcg-card ${rc}${sz}"${oc}>
    <div class="card-header">
      <span class="card-name">${card.name}</span>
      <span class="card-hp" style="color:${tc}">${card.current_hp !== undefined ? card.current_hp + '/' : ''}${card.hp} HP</span>
    </div>
    <div class="card-art art-${(card.type||'fire').toLowerCase()}">
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
      <span class="card-number">${card.card_number || ''}</span>
    </div>
  </div>`;
}

function renderBenchCard(card, idx, isPlayer) {
  const tc = typeColor(card.type);
  const fainted = card.current_hp <= 0;
  const selected = S.battle && S.battle.playerSwitchIdx === idx && isPlayer ? ' selected' : '';
  return `<div class="bench-card${fainted ? ' fainted' : ''}${selected}" onclick="${isPlayer ? `selectBenchCard(${idx})` : ''}">
    <div class="card-art art-${(card.type||'fire').toLowerCase()}"></div>
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

// ─── CONQUEST ─────────────────────────────────────────────────────
const CONQUEST_CHAPTERS = [
  {
    id:1, name:'The First Calling', color:'#0a1a0a', accent:'#2da84a',
    lore:'You awoke in the village of Mirenholt to find the elder speaking of shadows in the Sunwood Forest. Something ancient has stirred beneath the roots. Your first creature answered your call — the bond was forged. Now you must prove yourself worthy as a Summoner.',
    stages:[
      {id:1, name:'Aspiring Trainer Torin', reward:50,  lore:'Torin has been training his creatures for three seasons. He challenges every traveler who passes through Mirenholt, seeking strength to protect his home. He does not know what is coming.'},
      {id:2, name:'Sunwood Warden',         reward:100, lore:'The warden has patrolled these woods for decades. The strange energy moving through the roots has made his creatures restless and aggressive. He means to test if you are strong enough to venture deeper.'},
    ]
  },
  {
    id:2, name:'Shadows in the Wilds', color:'#0f0a1a', accent:'#8b3fc8',
    lore:'The Sunwood Forest has been touched by Void energy. Ancient creatures roam without purpose, corrupted by darkness seeping through the roots. The Forest Guardian, once a protector, now strikes at all who enter.',
    stages:[
      {id:1, name:'Corrupted Wolf-Spirit',      reward:120, lore:'Once a loyal guardian of travelers, this creature has been warped by Void tendrils. Its howl no longer warns of danger — it is the danger. Its eyes are black where they were once silver.'},
      {id:2, name:'Forest Guardian Vethara',    reward:180, lore:'Vethara protected the Sunwood since before memory. Now she stands twisted, her bark-like armor cracked with dark veins, her voice a chorus of screams instead of the wind through leaves she once embodied.'},
    ]
  },
  {
    id:3, name:'The Sunken Domain', color:'#030a1a', accent:'#2980b9',
    lore:'Beneath the waters of Lake Aethon, something ancient stirs. The fishermen of Tidesbell whisper of a dragon that once guarded their shores, now twisted by the Void. The water grows black each night.',
    stages:[
      {id:1, name:'Drowned Sentinel',   reward:130, lore:'The lake\'s guardian creature, once peaceful, has drowned in Void water. It drifts without thought, striking at all it senses. The fishermen say it would once approach their boats and watch them work.'},
      {id:2, name:'Tide Drake Kaluun',  reward:200, lore:'Kaluun slept in the deepest part of Lake Aethon for five hundred years. The Void woke it — but not as itself. The waters remember who it was. They weep black tears in its presence.'},
    ]
  },
  {
    id:4, name:'Embers of the Citadel', color:'#1a0700', accent:'#e67e22',
    lore:'The Ignis Citadel, once home to the proudest Fire-Summoners in Aethermoor, has gone silent. Its towers burn with a cold, black flame. The Grand Pyromancer has not been seen for weeks.',
    stages:[
      {id:1, name:'Ash Revenant',                 reward:150, lore:'A Fire-Summoner who stayed behind when the others fled. The Void did not take his life — it took everything else. He fights with the fury of someone who has nothing left to lose.'},
      {id:2, name:'Grand Pyromancer Valdris',     reward:220, lore:'Valdris was the greatest Summoner in the Citadel\'s history. He refused to abandon his creatures when the Void came. The creatures are gone now. What remains burns with fire that does not give warmth — only consumes.'},
    ]
  },
  {
    id:5, name:'The Frozen Throne', color:'#030d1a', accent:'#74b9ff',
    lore:'Far to the north, the Permafrost Highlands stretch into eternity. A message arrived in frost-rune: "The Throne Queen has fallen to silence. The cold grows wrong." You venture where warmth cannot follow.',
    stages:[
      {id:1, name:'Glacial Specter',          reward:160, lore:'The ghosts of Ice-Clan warriors who died defending the Throne. They remember their duty but not who they served. The cold has preserved their loyalty — and twisted its purpose.'},
      {id:2, name:'Throne Queen Seraphine',   reward:250, lore:'Seraphine ruled the Permafrost Highlands with justice for forty years. The Void did not break her — it turned her precision and discipline into something colder than ice. She judges all who approach and finds them wanting.'},
    ]
  },
  {
    id:6, name:'The Celestial Rift', color:'#05051a', accent:'#6c5ce7',
    lore:'The sky itself has begun to crack. Scholars recorded seventeen impossible astronomical events in a single week. Something is tearing at the boundary between Aethermoor and the Void. The Celestial Warden\'s post has been abandoned.',
    stages:[
      {id:1, name:'Fracture Herald',          reward:175, lore:'A being born from a tear in the sky\'s fabric. It arrived through the rift carrying a message it cannot read in a language that no longer exists. It attacks because attacking is the only thing it knows how to do.'},
      {id:2, name:'Celestial Warden Exael',   reward:280, lore:'Exael guarded the boundary between worlds for centuries. When the rift opened, something came through before he could seal it. He sealed the rift with himself on the wrong side.'},
    ]
  },
  {
    id:7, name:'The Void Spire', color:'#050508', accent:'#a29bfe',
    lore:'You have found the origin point. The Void Spire rises from a rift in the earth south of the Deadlands, its surface made of crystallized darkness. Creatures bound to its base are beyond recognition. At its summit, something waits.',
    stages:[
      {id:1, name:'Void Harbinger',           reward:200, lore:'The first thing the Spire created. It has no memories, no name beyond what it does — it announces the end. It has stood at the foot of the Spire for forty days, letting any who approach see what awaits inside.'},
      {id:2, name:'The Void Architect Nulveth',reward:350, lore:'Nulveth did not corrupt Aethermoor out of malice. It acted out of logic: a world where bonds between creature and summoner are forgotten becomes Void. It was simply accelerating the inevitable. As it fell, it whispered: "I am not the source. I am the first consequence."'},
    ]
  },
  {
    id:8, name:'The Last Summoning', color:'#0f0000', accent:'#ff4466',
    lore:'Nulveth spoke true. The Void is not a place or a creature — it is what Aethermoor becomes when the bond between Summoner and creature is forgotten. One final trial awaits: the manifestation of every bond ever broken, every creature ever abandoned.',
    stages:[
      {id:1, name:'The Forgotten Legion',  reward:250, lore:'They have no names. They were given names once — by Summoners who forgot them. They fight with the grief of creatures who were loved and then were not. Defeating them is not a victory. It is a mercy.'},
      {id:2, name:'The Unbound',           reward:500, lore:'The final form of the Void in Aethermoor. Made of every forgotten bond, every abandoned creature. It looks different to everyone who faces it. It speaks in the voice of the first creature you ever bonded with. Win not with power — but with the strength of the bond you carry.'},
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

function conquestIntro(chapterId, stageId) {
  const ch = CONQUEST_CHAPTERS.find(c => c.id === chapterId);
  const st = ch?.stages.find(s => s.id === stageId);
  if (!ch || !st) return;
  // Build intro overlay in modal
  openModal(`<div class="cq-intro-modal" id="cq-intro">
    <div class="cq-intro-chapter">Chapter ${ch.id}: ${ch.name}</div>
    <div class="cq-intro-stage">${st.name}</div>
    <div class="cq-intro-lore" id="cq-intro-lore"></div>
    <div class="cq-intro-actions hidden" id="cq-intro-actions">
      <button class="btn btn-primary btn-lg" onclick="conquestStartBattle(${chapterId},${stageId})">Enter Battle</button>
      <button class="btn" onclick="closeModal()">Retreat</button>
    </div>
  </div>`);
  // Typewriter effect
  const loreEl = document.getElementById('cq-intro-lore');
  const actionsEl = document.getElementById('cq-intro-actions');
  let i = 0;
  const text = st.lore;
  const speed = 22;
  function typeChar() {
    if (!loreEl) return;
    if (i < text.length) {
      loreEl.textContent += text[i++];
      setTimeout(typeChar, speed);
    } else {
      if (actionsEl) actionsEl.classList.remove('hidden');
    }
  }
  setTimeout(typeChar, 400);
}
window.conquestIntro = conquestIntro;

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
      <div class="battle-active-slot">
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
  return `<div class="page-title"><h2>Shop</h2><p class="text-muted">Spend your coins to open packs and grow your collection</p></div>
    <div class="shop-coins-bar sketch-box mb-3">
      <span>Your coins: <strong class="text-gold">${coins}</strong></span>
      <span class="text-muted" style="font-size:0.88rem">Earn more by winning battles and claiming your daily reward</span>
    </div>
    <div class="shop-grid">${packs}</div>`;
}

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
function viewBattle() {
  if (!S.battle || S.battle.finished) {
    const result = S.battle?.ratingResult;
    return `<div class="page-title"><h2>Battle Arena</h2></div>
      <div class="sketch-box text-center" style="max-width:500px;margin:0 auto">
        <h3 style="margin-bottom:1rem">Challenge an AI Opponent</h3>
        <p class="text-muted mb-2">Your collected cards are used to battle. Defeat all 5 opponent creatures to win!</p>
        <button class="btn btn-primary btn-lg" onclick="startBattle()">Start Battle</button>
      </div>
      ${S.battle?.finished ? `<div class="sketch-box text-center mt-2" style="max-width:500px;margin:1rem auto 0">
        <h3 style="margin-bottom:0.5rem">${S.battle.winner === 'player' ? 'Victory!' : 'Defeat'}</h3>
        ${result ? `<p class="text-muted">Rating: ${result.newRating} (${result.title})${result.coinsEarned ? ' &bull; +' + result.coinsEarned + ' coins' : ''}</p>` : ''}
        <button class="btn btn-primary mt-2" onclick="startBattle()">Play Again</button>
      </div>` : ''}`;
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
  return `<div class="page-title"><h2>Battle Arena</h2>
    <span class="text-muted" style="font-size:0.9rem">Server-validated &bull; All moves checked server-side</span>
  </div>
  <div class="battle-arena">
    <div style="display:flex;justify-content:space-between;align-items:center;padding:0.3rem 0">
      <span style="font-family:var(--font-brush);font-size:1.2rem">AI Trainer</span>
      <span class="text-muted" style="font-size:0.9rem">${b.aiCards.filter(c=>c.current_hp>0).length} creatures remaining</span>
    </div>
    <div class="battle-field">
      <div class="battle-active-slot">
        <div class="battle-label">AI Active</div>
        ${renderCard(aa)}
      </div>
      <div class="vs-divider">VS</div>
      <div class="battle-active-slot">
        <div class="battle-label">Your Active</div>
        ${renderCard(pa)}
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:1rem">
      <div>
        <div class="battle-label text-muted" style="font-size:0.85rem">AI Bench</div>
        <div class="battle-bench">${aBench.map(({c,i}) => renderBenchCard(c, i, false)).join('') || '<span class="text-muted" style="font-size:0.82rem">None</span>'}</div>
      </div>
      <div>
        <div class="battle-label text-muted" style="font-size:0.85rem">Your Bench (click to switch)</div>
        <div class="battle-bench">${pBench.map(({c,i}) => renderBenchCard(c, i, true)).join('') || '<span class="text-muted" style="font-size:0.82rem">None</span>'}</div>
      </div>
    </div>
    <div class="battle-controls">
      ${b.playerTurn && !b.finished ? `
        <button class="btn btn-primary" id="btn-attack" onclick="battleAttack()">Attack: ${pa.ability_name} (${pa.ability_power} pwr)</button>
        ${canSwitch ? '' : ''}
        <button class="btn btn-red" onclick="battleForfeit()">Forfeit</button>
      ` : b.finished
        ? `<button class="btn btn-primary btn-lg" onclick="startBattle()">Play Again</button>`
        : `<span class="text-muted">Processing...</span>`}
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

async function battleAction(action, extra = {}) {
  const btn = document.getElementById('btn-attack');
  if (btn) btn.disabled = true;
  const isConquest = S.view === 'conquest_battle';
  try {
    const data = await api('/battle/action','POST', { action, ...extra });
    S.battle = data;
    if (data.finished && data.ratingResult) {
      const r = data.ratingResult;
      if (r.conquestWin !== undefined) {
        // Conquest battle finished
        if (r.conquestWin) {
          S.user.coins += r.coinsEarned || 0;
          updateNavCoins();
          notify(`Victory! +${r.coinsEarned} coins`, 'success');
          // Refresh conquest progress
          try { S.conquestProgress = await api('/conquest/progress'); } catch {}
        } else {
          notify('Defeated! Your forces were overwhelmed.', 'info');
        }
        document.getElementById('page').innerHTML = viewConquestBattle();
        attachListeners();
      } else {
        // Ranked battle finished
        if (data.winner === 'player') {
          S.user.coins += r.coinsEarned || 0;
          updateNavCoins();
          notify(`Victory! +${r.coinsEarned} coins. New rating: ${r.newRating} (${r.title})`, 'success');
        } else {
          notify(`Defeated. New rating: ${r.newRating} (${r.title})`, 'info');
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
  if (!S.battle || S.battle.finished || !S.battle.playerTurn) return;
  battleAction('switch', { switchTo: realIdx });
};

// ─── FRIENDS ──────────────────────────────────────────────────────
function viewFriends() {
  const accepted = S.friends.filter(f => f.status === 'accepted');
  const pending  = S.friends.filter(f => f.status === 'pending');
  const friendList = accepted.length
    ? accepted.map(f => `<div class="friend-item">
        <div class="friend-avatar" style="background:${f.avatar_color||'#888'};color:#fff">${f.username[0].toUpperCase()}</div>
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
        <div class="friend-avatar" style="background:${f.avatar_color||'#888'};color:#fff">${f.username[0].toUpperCase()}</div>
        <div class="friend-info"><div class="friend-name">${f.username}</div><div class="friend-meta">Pending request</div></div>
        ${f.other_user_id !== S.user.id
          ? `<button class="btn btn-green btn-sm" onclick="acceptFriend(${f.id})">Accept</button>
             <button class="btn btn-sm" onclick="removeFriend(${f.id})">Decline</button>`
          : `<span class="text-muted" style="font-size:0.85rem">Awaiting response</span>`}
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
      <div class="player-card-avatar" style="background:${color};box-shadow:0 0 18px ${color}88">${initial}</div>
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
    <button class="btn" onclick="closeModal()">Close</button>
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
  const myReports = S.reports.map(r => `
    <div class="report-item">
      <div class="report-header">
        <div>
          <strong>Reported: ${r.reported_username}</strong>
          <span class="text-muted" style="margin-left:0.5rem;font-size:0.85rem">${r.category}</span>
        </div>
        <span class="report-status status-${r.status}">${r.status.charAt(0).toUpperCase() + r.status.slice(1)}</span>
      </div>
      <p style="font-size:0.9rem">${r.description}</p>
      ${r.handler_notes ? `<p class="text-muted" style="font-size:0.82rem;margin-top:0.4rem">Staff note: ${r.handler_notes}</p>` : ''}
      <p class="text-muted" style="font-size:0.78rem;margin-top:0.3rem">${new Date(r.created_at).toLocaleString()}</p>
    </div>`).join('') || '<p class="text-muted">You have not submitted any reports.</p>';
  return `<div class="page-title"><h2>Reports</h2></div>
    <div class="sketch-box mb-3">
      <h3 style="margin-bottom:1rem">Submit a Report</h3>
      <div class="form-group">
        <label>Reported Username</label>
        <input id="rep-user" class="input-box" placeholder="Username to report">
      </div>
      <div class="form-group">
        <label>Category</label>
        <select id="rep-cat" class="input-box">
          <option value="cheating">Cheating</option>
          <option value="harassment">Harassment</option>
          <option value="bug">Bug Report</option>
          <option value="inappropriate">Inappropriate Behavior</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div class="form-group">
        <label>Description (be specific)</label>
        <textarea id="rep-desc" class="input-box" placeholder="Describe the issue in detail..."></textarea>
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
  if (!u || !d) { notify('Please fill in all fields', 'error'); return; }
  try {
    await api('/reports','POST',{reported_username:u, category:c, description:d});
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
    ['users','Users',1],['reports','Reports',1],['logs','Logs',2],
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
    case 'logs':      return adminLogs();
    case 'stats':     return adminStats();
    case 'cards':     return adminCards();
    case 'economy':   return adminEconomy();
    case 'developer': return adminDeveloper();
    default:          return adminUsers();
  }
}

window.setAdminTab = async (t) => {
  S.adminTab = t;
  document.getElementById('admin-content').innerHTML = '<div class="spinner"></div>';
  await loadAdminTabData(t);
  document.getElementById('admin-content').innerHTML = renderAdminTab();
  attachListeners();
};

async function loadAdminTabData(t) {
  try {
    if (t === 'users')   S._adminUsers   = await api('/admin/users');
    if (t === 'reports') S._adminReports = await api('/admin/reports');
    if (t === 'logs')    S._adminLogs    = await api('/admin/logs');
    if (t === 'stats')   S._adminStats   = await api('/admin/stats');
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
  const rows = reports.map(r => `<tr>
    <td>${r.id}</td>
    <td>${r.reporter_name}</td>
    <td>${r.reported_name}</td>
    <td>${r.category}</td>
    <td>${r.description.slice(0,60)}${r.description.length>60?'...':''}</td>
    <td><span class="report-status status-${r.status}">${r.status}</span></td>
    <td>
      <button class="btn btn-sm" onclick="adminUpdateReport(${r.id})">Update</button>
      ${ROLE_ORDER.indexOf(S.user?.role)>=2 ? `<button class="btn btn-sm btn-red" onclick="adminDeleteReport(${r.id})">Delete</button>` : ''}
    </td>
  </tr>`).join('') || '<tr><td colspan="7" class="text-muted text-center">No reports</td></tr>';
  return `<div class="flex gap-2 mb-2">
    <select class="input-box" id="rep-filter" style="max-width:180px" onchange="adminFilterReports(this.value)">
      <option value="">All</option><option value="open">Open</option><option value="reviewing">Reviewing</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option>
    </select>
    <button class="btn" onclick="adminLoadReports()">Refresh</button>
  </div>
  <div style="overflow-x:auto"><table class="admin-table">
    <thead><tr><th>ID</th><th>Reporter</th><th>Reported</th><th>Category</th><th>Description</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

window.adminLoadReports = async () => { S._adminReports = await api('/admin/reports').catch(()=>[]); document.getElementById('admin-content').innerHTML = renderAdminTab(); attachListeners(); };
window.adminFilterReports = async (status) => { S._adminReports = await api('/admin/reports' + (status ? '?status=' + status : '')).catch(()=>[]); document.getElementById('admin-content').innerHTML = renderAdminTab(); attachListeners(); };
window.adminUpdateReport = (id) => {
  const status = prompt('New status (open, reviewing, resolved, dismissed):');
  const notes = prompt('Handler notes:');
  if (!status) return;
  api('/admin/reports/' + id,'PUT',{status, handler_notes: notes}).then(() => { notify('Report updated', 'success'); adminLoadReports(); }).catch(e => notify(e.message,'error'));
};
window.adminDeleteReport = (id) => {
  if (!confirm('Delete this report?')) return;
  api('/admin/reports/' + id,'DELETE').then(() => { notify('Report deleted', 'success'); adminLoadReports(); }).catch(e => notify(e.message,'error'));
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
      <div class="form-group"><label>HP</label><input id="promo-hp" class="input-box" type="number" placeholder="200"></div>
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
  const name = document.getElementById('promo-name')?.value?.trim();
  const type = document.getElementById('promo-type')?.value;
  const hp   = document.getElementById('promo-hp')?.value;
  if (!name) { notify('Name required', 'error'); return; }
  try { const r = await api('/dev/cards/promo','POST',{name,type,hp:parseInt(hp)||200}); notify('Promo card created: ID ' + r.id, 'success'); } catch(e) { notify(e.message,'error'); }
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
    if (S.settings.theme) applyTheme(S.settings.theme);

    if (ROLE_ORDER.indexOf(S.user.role) >= 1) {
      const [adminUsers, adminReports] = await Promise.allSettled([
        api('/admin/users'),
        api('/admin/reports'),
      ]);
      S._adminUsers   = adminUsers.value   || [];
      S._adminReports = adminReports.value || [];
    }

    // Poll notifications every 30 seconds
    setInterval(pollNotifications, 30000);
    // Refresh friends list every 60 seconds (picks up new requests)
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
    }, 60000);
  }

  render();
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
