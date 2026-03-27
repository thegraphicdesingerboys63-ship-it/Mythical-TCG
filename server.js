require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const { query, initDB, seedCards, seedAdmin } = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'mythical_tcg_dev_secret';

// ─── SERVER-SIDE BATTLE STORE ────────────────────────────────────
const activeBattles = new Map(); // userId -> battleState

// ─── PVP STORE ───────────────────────────────────────────────────
const pvpQueue    = new Map(); // userId -> { userId, username, ranked, cards, joinedAt }
const pvpBattles  = new Map(); // battleId -> battleState
const userToBattle = new Map(); // userId -> battleId

const TYPES = ['Fire','Water','Earth','Air','Shadow','Light','Thunder','Ice','Poison','Psychic','Nature','Metal','Dragon','Cosmic','Void','Crystal','Blood','Spirit','Chaos','Dream'];
const WEAKNESS_MAP = {Fire:'Water',Water:'Thunder',Earth:'Nature',Air:'Ice',Shadow:'Light',Light:'Shadow',Thunder:'Earth',Ice:'Fire',Poison:'Psychic',Psychic:'Void',Nature:'Poison',Metal:'Fire',Dragon:'Ice',Cosmic:'Void',Void:'Light',Crystal:'Metal',Blood:'Nature',Spirit:'Chaos',Chaos:'Psychic',Dream:'Shadow'};
const RESISTANCE_MAP = {Fire:'Nature',Water:'Fire',Earth:'Metal',Air:'Earth',Shadow:'Psychic',Light:'Chaos',Thunder:'Air',Ice:'Water',Poison:'Nature',Psychic:'Dream',Nature:'Water',Metal:'Ice',Dragon:'Fire',Cosmic:'Psychic',Void:'Shadow',Crystal:'Water',Blood:'Metal',Spirit:'Shadow',Chaos:'Dream',Dream:'Light'};

function calcDamage(attacker, defender) {
  let mult = 1;
  if (attacker.type === defender.weakness)    mult = 2;
  if (attacker.type === defender.resistance)  mult = 0.5;
  const raw = Math.floor(attacker.atk * (attacker.ability_power / 100) * mult - defender.def * 0.3);
  return Math.max(10, raw);
}

function advanceFainted(battle) {
  if (battle.playerCards[battle.playerActive]?.current_hp <= 0) {
    const next = battle.playerCards.findIndex((c,i) => i !== battle.playerActive && c.current_hp > 0);
    if (next !== -1) { battle.playerActive = next; battle.log.push(`Your ${battle.playerCards[next].name} steps forward!`); }
  }
  if (battle.aiCards[battle.aiActive]?.current_hp <= 0) {
    const next = battle.aiCards.findIndex((c,i) => i !== battle.aiActive && c.current_hp > 0);
    if (next !== -1) { battle.aiActive = next; battle.log.push(`Foe sends out ${battle.aiCards[next].name}!`); }
  }
}

function checkWin(battle) {
  const pAlive = battle.playerCards.some(c => c.current_hp > 0);
  const aAlive = battle.aiCards.some(c => c.current_hp > 0);
  if (!pAlive || !aAlive) {
    battle.finished = true;
    battle.winner = pAlive ? 'player' : 'ai';
    battle.log.push(pAlive ? 'You win! All enemy creatures defeated!' : 'You lost... All your creatures were defeated.');
    return true;
  }
  return false;
}

function runAiTurn(battle) {
  const pa = battle.playerCards[battle.playerActive];
  const aa = battle.aiCards[battle.aiActive];
  // AI switches if current creature is weak to player's active type
  if (aa.weakness === pa.type) {
    const better = battle.aiCards.findIndex((c,i) => i !== battle.aiActive && c.current_hp > 0 && c.weakness !== pa.type);
    if (better !== -1) { battle.aiActive = better; battle.log.push(`Foe switched to ${battle.aiCards[battle.aiActive].name}!`); }
  }
  const aiActive = battle.aiCards[battle.aiActive];
  const dmg = calcDamage(aiActive, pa);
  pa.current_hp = Math.max(0, pa.current_hp - dmg);
  battle.log.push(`Foe's ${aiActive.name} used ${aiActive.ability_name}! Dealt ${dmg} to your ${pa.name}. (${pa.current_hp}/${pa.hp} HP)`);
}

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ─── AUTH MIDDLEWARE ────────────────────────────────────────────
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: 'Invalid token' }); }
}

const ROLE_ORDER = ['user','mod','admin','headofstaff','owner','developer'];
function requireRole(minRole) {
  return (req, res, next) => {
    if (ROLE_ORDER.indexOf(req.user.role) < ROLE_ORDER.indexOf(minRole))
      return res.status(403).json({ error: 'Insufficient permissions' });
    next();
  };
}

async function logAction(adminId, action, targetId, details) {
  try { await query('INSERT INTO admin_logs (admin_id, action, target_user_id, details) VALUES ($1,$2,$3,$4)', [adminId, action, targetId, details]); }
  catch {}
}

function rankTitle(rating) {
  if (rating >= 2200) return 'Grandmaster';
  if (rating >= 2000) return 'Master';
  if (rating >= 1800) return 'Diamond';
  if (rating >= 1600) return 'Platinum';
  if (rating >= 1400) return 'Gold';
  if (rating >= 1200) return 'Silver';
  return 'Bronze';
}

// ─── DECK HELPER ─────────────────────────────────────────────────
async function getPlayerDeck(userId) {
  const deckRes = await query('SELECT card_ids FROM decks WHERE user_id=$1', [userId]);
  const cardIds = deckRes.rows[0]?.card_ids;
  if (cardIds && cardIds.length > 0) {
    const cards = await query(
      'SELECT c.* FROM cards c JOIN user_cards uc ON uc.card_id=c.id WHERE uc.user_id=$1 AND c.id = ANY($2)',
      [userId, cardIds]
    );
    if (cards.rows.length > 0) return cards.rows;
  }
  // Fallback: best cards from collection
  const random = await query(
    'SELECT c.* FROM user_cards uc JOIN cards c ON c.id=uc.card_id WHERE uc.user_id=$1 ORDER BY RANDOM() LIMIT 5',
    [userId]
  );
  let pool = random.rows;
  if (pool.length < 5) {
    const extras = await query(
      "SELECT * FROM cards WHERE rarity IN ('Common','Uncommon') ORDER BY RANDOM() LIMIT $1",
      [5 - pool.length]
    );
    pool = [...pool, ...extras.rows];
  }
  return pool;
}

// ─── PVP HELPERS ─────────────────────────────────────────────────
function getPvpStateForUser(battle, userId) {
  const isP1 = battle.player1Id === userId;
  return {
    isPvp:           true,
    ranked:          battle.ranked,
    id:              battle.id,
    opponentUsername: isP1 ? battle.player2Username : battle.player1Username,
    playerCards:     isP1 ? battle.player1Cards : battle.player2Cards,
    aiCards:         isP1 ? battle.player2Cards : battle.player1Cards,
    playerActive:    isP1 ? battle.player1Active : battle.player2Active,
    aiActive:        isP1 ? battle.player2Active : battle.player1Active,
    playerTurn:      (battle.turn === 'player1') === isP1,
    log:             battle.log,
    finished:        battle.finished,
    winner:          !battle.finished ? null : (battle.winner === (isP1 ? 'player1' : 'player2') ? 'player' : 'ai'),
    ratingResult:    battle.ratingResult ? (isP1 ? battle.ratingResult.p1 : battle.ratingResult.p2) : null,
    turnTimeLeft:    Math.max(0, 30 - Math.floor((Date.now() - battle.lastAction) / 1000)),
  };
}

function executePvpAutoAttack(battle) {
  const isP1 = battle.turn === 'player1';
  const atkCards = isP1 ? battle.player1Cards : battle.player2Cards;
  const defCards = isP1 ? battle.player2Cards : battle.player1Cards;
  const atkIdx   = isP1 ? battle.player1Active : battle.player2Active;
  const defIdx   = isP1 ? battle.player2Active : battle.player1Active;
  const atkUser  = isP1 ? battle.player1Username : battle.player2Username;
  const defUser  = isP1 ? battle.player2Username : battle.player1Username;
  const attacker = atkCards[atkIdx];
  const defender = defCards[defIdx];
  const dmg = calcDamage(attacker, defender);
  defender.current_hp = Math.max(0, defender.current_hp - dmg);
  battle.log.push(`[Auto] ${atkUser}'s ${attacker.name} attacked! Dealt ${dmg} to ${defUser}'s ${defender.name}. (${defender.current_hp}/${defender.max_hp} HP)`);
  battle.lastAction = Date.now();
  if (defender.current_hp <= 0) {
    const next = defCards.findIndex((c,i) => i !== defIdx && c.current_hp > 0);
    if (next !== -1) {
      if (isP1) battle.player2Active = next;
      else battle.player1Active = next;
      battle.log.push(`${defUser}'s ${defCards[next].name} steps forward!`);
    }
  }
  if (!defCards.some(c => c.current_hp > 0)) {
    battle.finished = true;
    battle.winner = isP1 ? 'player1' : 'player2';
    battle.log.push(`${atkUser} wins! All opponent's creatures defeated!`);
    return;
  }
  battle.turn = battle.turn === 'player1' ? 'player2' : 'player1';
}

async function finishPvpBattle(battle) {
  try {
    const p1Won = battle.winner === 'player1';
    const coinsWin = battle.ranked ? 50 : 20;
    const winnerId = p1Won ? battle.player1Id : battle.player2Id;
    await query('UPDATE users SET coins = coins + $1 WHERE id=$2', [coinsWin, winnerId]);
    if (battle.ranked) {
      const r1s = await query('SELECT rating FROM ranked_stats WHERE user_id=$1', [battle.player1Id]);
      const r2s = await query('SELECT rating FROM ranked_stats WHERE user_id=$1', [battle.player2Id]);
      const r1 = r1s.rows[0]?.rating || 1000, r2 = r2s.rows[0]?.rating || 1000;
      const K = 32, exp1 = 1 / (1 + Math.pow(10, (r2 - r1) / 400));
      const new1 = Math.max(100, Math.round(r1 + K * ((p1Won?1:0) - exp1)));
      const new2 = Math.max(100, Math.round(r2 + K * ((p1Won?0:1) - (1-exp1))));
      const t1 = rankTitle(new1), t2 = rankTitle(new2);
      await query(
        'UPDATE ranked_stats SET rating=$1,rank_title=$2,wins=wins+$3,losses=losses+$4,season_wins=season_wins+$3,season_losses=season_losses+$4 WHERE user_id=$5',
        [new1, t1, p1Won?1:0, p1Won?0:1, battle.player1Id]
      );
      await query(
        'UPDATE ranked_stats SET rating=$1,rank_title=$2,wins=wins+$3,losses=losses+$4,season_wins=season_wins+$3,season_losses=season_losses+$4 WHERE user_id=$5',
        [new2, t2, p1Won?0:1, p1Won?1:0, battle.player2Id]
      );
      battle.ratingResult = {
        p1: { win: p1Won,  newRating: new1, title: t1, coinsEarned: p1Won ? coinsWin : 0 },
        p2: { win: !p1Won, newRating: new2, title: t2, coinsEarned: p1Won ? 0 : coinsWin },
      };
    } else {
      battle.ratingResult = {
        p1: { win: p1Won,  coinsEarned: p1Won ? coinsWin : 0 },
        p2: { win: !p1Won, coinsEarned: p1Won ? 0 : coinsWin },
      };
    }
    await query(
      'INSERT INTO matches (player1_id,player2_id,winner_id,p1_hp_left,p2_hp_left,match_log) VALUES ($1,$2,$3,$4,$5,$6)',
      [battle.player1Id, battle.player2Id, winnerId,
       battle.player1Cards.reduce((s,c)=>s+c.current_hp,0),
       battle.player2Cards.reduce((s,c)=>s+c.current_hp,0),
       JSON.stringify(battle.log)]
    );
  } catch(e) { console.error('finishPvpBattle:', e); }
}

function tryMatchPlayers() {
  const queue = [...pvpQueue.values()];
  for (let i = 0; i < queue.length; i++) {
    for (let j = i + 1; j < queue.length; j++) {
      if (queue[i].ranked === queue[j].ranked) {
        const p1 = queue[i], p2 = queue[j];
        pvpQueue.delete(p1.userId); pvpQueue.delete(p2.userId);
        const battleId = `pvp_${p1.userId}_${p2.userId}_${Date.now()}`;
        const toSlot = cards => cards.map(c => ({ ...c, current_hp: c.hp, max_hp: c.hp }));
        const battle = {
          id: battleId,
          player1Id: p1.userId, player2Id: p2.userId,
          player1Username: p1.username, player2Username: p2.username,
          player1Cards: toSlot(p1.cards), player2Cards: toSlot(p2.cards),
          player1Active: 0, player2Active: 0,
          turn: 'player1',
          log: [`⚔️ Match found: ${p1.username} vs ${p2.username}!`, 'Your turn first!' ],
          finished: false, winner: null,
          ranked: p1.ranked, createdAt: Date.now(), lastAction: Date.now(), ratingResult: null,
        };
        pvpBattles.set(battleId, battle);
        userToBattle.set(p1.userId, battleId);
        userToBattle.set(p2.userId, battleId);
        return;
      }
    }
  }
}

// Auto-timeout inactive turns (30s)
setInterval(() => {
  for (const [battleId, battle] of pvpBattles.entries()) {
    if (battle.finished) continue;
    if (Date.now() - battle.lastAction > 30000) {
      executePvpAutoAttack(battle);
      if (battle.finished) {
        finishPvpBattle(battle).catch(console.error);
        setTimeout(() => { pvpBattles.delete(battleId); userToBattle.delete(battle.player1Id); userToBattle.delete(battle.player2Id); }, 120000);
      }
    }
  }
}, 5000);

// ─── AUTH ROUTES ────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return res.status(400).json({ error: 'Username must be 3-20 alphanumeric characters or underscores' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    const exists = await query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username]);
    if (exists.rows.length > 0) return res.status(400).json({ error: 'Username already taken' });
    const hash = await bcrypt.hash(password, 10);
    const userRes = await query('INSERT INTO users (username, password_hash) VALUES ($1,$2) RETURNING id, username, role, coins, avatar_color, bio, created_at', [username, hash]);
    const user = userRes.rows[0];
    await query('INSERT INTO user_settings (user_id) VALUES ($1)', [user.id]);
    await query('INSERT INTO ranked_stats (user_id) VALUES ($1)', [user.id]);
    // Give 5 starter cards
    const starters = await query("SELECT id FROM cards WHERE rarity IN ('Common','Uncommon') ORDER BY RANDOM() LIMIT 5");
    for (const c of starters.rows) {
      await query('INSERT INTO user_cards (user_id, card_id) VALUES ($1,$2) ON CONFLICT (user_id, card_id) DO UPDATE SET quantity = user_cards.quantity + 1', [user.id, c.id]);
    }
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role, coins: user.coins, avatar_color: user.avatar_color, bio: user.bio } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    const result = await query('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [username]);
    if (!result.rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    const user = result.rows[0];
    if (user.banned) return res.status(403).json({ error: `Account banned: ${user.ban_reason || 'No reason given'}` });
    if (user.timeout_until && new Date(user.timeout_until) > new Date()) {
      const remaining = Math.ceil((new Date(user.timeout_until) - new Date()) / 60000);
      const hrs = Math.floor(remaining / 60), mins = remaining % 60;
      return res.status(403).json({ error: `Account timed out. Expires in ${hrs > 0 ? hrs + 'h ' : ''}${mins}m` });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role, coins: user.coins, avatar_color: user.avatar_color, bio: user.bio } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/me', auth, async (req, res) => {
  try {
    const result = await query('SELECT id, username, role, coins, avatar_color, avatar_img, bio, created_at, banned FROM users WHERE id = $1', [req.user.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── CARDS ROUTES ────────────────────────────────────────────────
app.get('/api/cards', async (req, res) => {
  try {
    const { page = 1, limit = 20, type, rarity, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = [];
    let params = [];
    let idx = 1;
    if (type) { where.push(`type = $${idx++}`); params.push(type); }
    if (rarity) { where.push(`rarity = $${idx++}`); params.push(rarity); }
    if (search) { where.push(`name ILIKE $${idx++}`); params.push('%' + search + '%'); }
    const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const total = await query(`SELECT COUNT(*) FROM cards ${whereStr}`, params);
    const cards = await query(`SELECT * FROM cards ${whereStr} ORDER BY id LIMIT $${idx} OFFSET $${idx+1}`, [...params, parseInt(limit), offset]);
    res.json({ cards: cards.rows, total: parseInt(total.rows[0].count), page: parseInt(page), limit: parseInt(limit) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/cards/:id', async (req, res) => {
  try {
    const result = await query('SELECT * FROM cards WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Card not found' });
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/user/collection', auth, async (req, res) => {
  try {
    const result = await query(`
      SELECT c.*, uc.quantity, uc.obtained_at
      FROM user_cards uc JOIN cards c ON c.id = uc.card_id
      WHERE uc.user_id = $1
      ORDER BY c.id
    `, [req.user.id]);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/packs/open', auth, async (req, res) => {
  try {
    const { packType = 'basic' } = req.body;
    const PACK_CONFIG = {
      basic:  { cost: 100,  count: 5  },
      rare:   { cost: 300,  count: 5  },
      ultra:  { cost: 800,  count: 7  },
      mythic: { cost: 2500, count: 10 },
    };
    const cfg = PACK_CONFIG[packType] || PACK_CONFIG.basic;
    const userRes = await query('SELECT coins FROM users WHERE id = $1', [req.user.id]);
    if (userRes.rows[0].coins < cfg.cost) return res.status(400).json({ error: `Not enough coins (need ${cfg.cost})` });
    await query('UPDATE users SET coins = coins - $1 WHERE id = $2', [cfg.cost, req.user.id]);
    const pulled = [];
    for (let i = 0; i < cfg.count; i++) {
      const roll = Math.random() * 100;
      let rarityFilter;
      let printNumber = null;
      if (packType === 'mythic') {
        // Mythic pack — still very high-end but small chance of lower pulls
        if (roll < 49.5)    rarityFilter = "'Mythic','Prism'";
        else if (roll < 77) rarityFilter = "'Numbered','Secret_Rare'";
        else if (roll < 91) rarityFilter = "'Full_Art','Ultra_Rare'";
        else if (roll < 96.5) rarityFilter = "'Parallel'";
        else if (roll < 99) rarityFilter = "'Rare'";
        else if (roll < 99.7) rarityFilter = "'Uncommon'";
        else                rarityFilter = "'Common'";
      } else if (packType === 'ultra') {
        // Ultra pack — strong odds but ~8% chance of Rare or lower
        if (roll < 6)       rarityFilter = "'Mythic','Prism'";
        else if (roll < 21) rarityFilter = "'Numbered','Full_Art'";
        else if (roll < 70) rarityFilter = "'Ultra_Rare','Secret_Rare','Parallel'";
        else if (roll < 92) rarityFilter = "'Rare'";
        else if (roll < 97.5) rarityFilter = "'Uncommon'";
        else                rarityFilter = "'Common'";
      } else if (packType === 'rare') {
        // Rare pack — mostly Rare+ but ~5% chance of Common/Uncommon
        if (roll < 2)       rarityFilter = "'Mythic','Prism'";
        else if (roll < 8)  rarityFilter = "'Numbered','Full_Art'";
        else if (roll < 34) rarityFilter = "'Ultra_Rare','Secret_Rare','Parallel'";
        else if (roll < 81) rarityFilter = "'Rare'";
        else if (roll < 97) rarityFilter = "'Uncommon'";
        else                rarityFilter = "'Common'";
      } else {
        // Basic pack — unchanged
        if (roll < 0.5)     rarityFilter = "'Mythic','Prism'";
        else if (roll < 2)  rarityFilter = "'Numbered','Full_Art'";
        else if (roll < 6)  rarityFilter = "'Ultra_Rare','Secret_Rare','Parallel'";
        else if (roll < 20) rarityFilter = "'Rare'";
        else if (roll < 45) rarityFilter = "'Uncommon'";
        else                rarityFilter = "'Common'";
      }
      // Exclude sold-out limited numbered cards
      const card = await query(
        `SELECT * FROM cards WHERE rarity IN (${rarityFilter}) AND (print_limit IS NULL OR print_count < print_limit) ORDER BY RANDOM() LIMIT 1`
      );
      if (card.rows.length) {
        const c = card.rows[0];
        // If this is a limited numbered card, claim a print number atomically
        if (c.is_numbered && c.print_limit !== null) {
          const claim = await query(
            'UPDATE cards SET print_count = print_count + 1 WHERE id = $1 AND print_count < print_limit RETURNING print_count',
            [c.id]
          );
          if (!claim.rows.length) { i--; continue; } // race condition fallback — retry
          printNumber = claim.rows[0].print_count;
        }
        await query(
          'INSERT INTO user_cards (user_id, card_id, print_number) VALUES ($1,$2,$3) ON CONFLICT (user_id, card_id) DO UPDATE SET quantity = user_cards.quantity + 1',
          [req.user.id, c.id, printNumber]
        );
        pulled.push({ ...c, print_number: printNumber });
      }
    }
    res.json({ cards: pulled });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/user/daily', auth, async (req, res) => {
  try {
    const userRes = await query('SELECT last_daily FROM users WHERE id = $1', [req.user.id]);
    const last = userRes.rows[0].last_daily;
    const now = new Date();
    if (last) {
      const diff = now - new Date(last);
      if (diff < 86400000) return res.status(400).json({ error: 'Daily pack already claimed', nextIn: 86400000 - diff });
    }
    await query('UPDATE users SET last_daily = NOW() WHERE id = $1', [req.user.id]);
    const card = await query("SELECT * FROM cards WHERE rarity IN ('Common','Uncommon','Rare') ORDER BY RANDOM() LIMIT 5");
    for (const c of card.rows) {
      await query('INSERT INTO user_cards (user_id, card_id) VALUES ($1,$2) ON CONFLICT (user_id, card_id) DO UPDATE SET quantity = user_cards.quantity + 1', [req.user.id, c.id]);
    }
    await query('UPDATE users SET coins = coins + 50 WHERE id = $1', [req.user.id]);
    res.json({ cards: card.rows, coins: 50 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── FRIENDS ROUTES ─────────────────────────────────────────────
app.get('/api/friends', auth, async (req, res) => {
  try {
    const result = await query(`
      SELECT f.id, f.status, f.created_at,
        CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END AS other_user_id,
        u.username, u.avatar_color, u.avatar_img, u.role,
        rs.rating, rs.rank_title
      FROM friends f
      JOIN users u ON u.id = (CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END)
      LEFT JOIN ranked_stats rs ON rs.user_id = u.id
      WHERE (f.user_id = $1 OR f.friend_id = $1)
      ORDER BY f.status, u.username
    `, [req.user.id]);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/friends/request/:username', auth, async (req, res) => {
  try {
    const target = await query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [req.params.username]);
    if (!target.rows.length) return res.status(404).json({ error: 'User not found' });
    const tid = target.rows[0].id;
    if (tid === req.user.id) return res.status(400).json({ error: 'Cannot friend yourself' });
    const exists = await query('SELECT id FROM friends WHERE (user_id=$1 AND friend_id=$2) OR (user_id=$2 AND friend_id=$1)', [req.user.id, tid]);
    if (exists.rows.length) return res.status(400).json({ error: 'Friend request already exists' });
    await query('INSERT INTO friends (user_id, friend_id, status) VALUES ($1,$2,$3)', [req.user.id, tid, 'pending']);
    // Create notification for the recipient
    await query(
      "INSERT INTO notifications (user_id, type, message, from_user_id) VALUES ($1,'friend_request',$2,$3)",
      [tid, `${req.user.username} sent you a friend request`, req.user.id]
    ).catch(() => {});
    res.json({ message: 'Friend request sent' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/friends/:id/accept', auth, async (req, res) => {
  try {
    const result = await query('UPDATE friends SET status = $1 WHERE id = $2 AND friend_id = $3 RETURNING *', ['accepted', req.params.id, req.user.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Request not found' });
    // Notify original requester
    const fr = result.rows[0];
    await query(
      "INSERT INTO notifications (user_id, type, message, from_user_id) VALUES ($1,'friend_accepted',$2,$3)",
      [fr.user_id, `${req.user.username} accepted your friend request`, req.user.id]
    ).catch(() => {});
    // Mark the incoming friend_request notification as read
    await query("UPDATE notifications SET read=true WHERE user_id=$1 AND from_user_id=$2 AND type='friend_request'", [req.user.id, fr.user_id]).catch(() => {});
    res.json({ message: 'Friend accepted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/friends/:id', auth, async (req, res) => {
  try {
    await query('DELETE FROM friends WHERE id = $1 AND (user_id = $2 OR friend_id = $2)', [req.params.id, req.user.id]);
    res.json({ message: 'Removed' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── RANKED ROUTES ───────────────────────────────────────────────
app.get('/api/ranked/leaderboard', async (req, res) => {
  try {
    const result = await query(`
      SELECT u.id, u.username, u.avatar_color, u.avatar_img, rs.wins, rs.losses, rs.rating, rs.rank_title, rs.top500
      FROM ranked_stats rs JOIN users u ON u.id = rs.user_id
      WHERE u.banned = false
      ORDER BY rs.rating DESC
      LIMIT 500
    `);
    res.json(result.rows.map((r, i) => ({ ...r, rank: i + 1 })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/ranked/me', auth, async (req, res) => {
  try {
    const result = await query('SELECT * FROM ranked_stats WHERE user_id = $1', [req.user.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Stats not found' });
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ranked/match', auth, async (req, res) => {
  try {
    const { opponent_id, won, p1_hp_left, p2_hp_left, match_log } = req.body;
    const loser_id = won ? (opponent_id || 0) : req.user.id;
    const winner_id = won ? req.user.id : (opponent_id || 0);
    await query('INSERT INTO matches (player1_id, player2_id, winner_id, p1_hp_left, p2_hp_left, match_log) VALUES ($1,$2,$3,$4,$5,$6)',
      [req.user.id, opponent_id || null, winner_id, p1_hp_left || 0, p2_hp_left || 0, JSON.stringify(match_log || [])]);
    // ELO update
    const myStats = await query('SELECT rating FROM ranked_stats WHERE user_id = $1', [req.user.id]);
    const myRating = myStats.rows[0]?.rating || 1000;
    const K = 32;
    const expected = 1 / (1 + Math.pow(10, (1000 - myRating) / 400));
    const score = won ? 1 : 0;
    const newRating = Math.max(100, Math.round(myRating + K * (score - expected)));
    const title = rankTitle(newRating);
    await query('UPDATE ranked_stats SET rating=$1, rank_title=$2, wins=wins+$3, losses=losses+$4, season_wins=season_wins+$3, season_losses=season_losses+$4 WHERE user_id=$5',
      [newRating, title, won ? 1 : 0, won ? 0 : 1, req.user.id]);
    // Update top500
    const pos = await query('SELECT COUNT(*) FROM ranked_stats WHERE rating > $1', [newRating]);
    const isTop500 = parseInt(pos.rows[0].count) < 500;
    await query('UPDATE ranked_stats SET top500=$1 WHERE user_id=$2', [isTop500, req.user.id]);
    // Give coins for win
    if (won) await query('UPDATE users SET coins = coins + 30 WHERE id = $1', [req.user.id]);
    res.json({ newRating, title, isTop500, coinsEarned: won ? 30 : 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── NOTIFICATION ROUTES ─────────────────────────────────────────
app.get('/api/notifications', auth, async (req, res) => {
  try {
    const result = await query(
      `SELECT n.*, u.username as from_username, u.avatar_color as from_avatar, u.avatar_img as from_avatar_img
       FROM notifications n
       LEFT JOIN users u ON u.id = n.from_user_id
       WHERE n.user_id = $1
       ORDER BY n.created_at DESC LIMIT 30`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/notifications/read-all', auth, async (req, res) => {
  try {
    await query('UPDATE notifications SET read=true WHERE user_id=$1', [req.user.id]);
    res.json({ message: 'All marked read' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/notifications/:id/read', auth, async (req, res) => {
  try {
    await query('UPDATE notifications SET read=true WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ message: 'Marked read' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── NEWS ROUTES ──────────────────────────────────────────────────
app.get('/api/news', async (req, res) => {
  try {
    const result = await query(
      'SELECT n.*, u.username as author_name FROM news n JOIN users u ON u.id=n.author_id ORDER BY n.created_at DESC LIMIT 20'
    );
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── BATTLE ROUTES (SERVER-AUTHORITATIVE) ────────────────────────
app.post('/api/battle/start', auth, async (req, res) => {
  try {
    // Use saved deck, or fall back to random collection
    let playerPool = await getPlayerDeck(req.user.id);
    // AI gets 5 random cards of similar tier
    const aiRes = await query("SELECT * FROM cards ORDER BY RANDOM() LIMIT 5");
    const aiPool = aiRes.rows;

    const toSlot = cards => cards.map(c => ({ ...c, current_hp: c.hp }));

    const battle = {
      id: `${req.user.id}_${Date.now()}`,
      userId: req.user.id,
      playerCards: toSlot(playerPool),
      aiCards:     toSlot(aiPool),
      playerActive: 0,
      aiActive:     0,
      playerTurn:   true,
      log:          ['The battle begins! Your turn.'],
      finished:     false,
      winner:       null,
      createdAt:    Date.now(),
    };

    activeBattles.set(req.user.id, battle);
    res.json(battleView(battle));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/battle/state', auth, (req, res) => {
  const battle = activeBattles.get(req.user.id);
  if (!battle) return res.status(404).json({ error: 'No active battle' });
  res.json(battleView(battle));
});

app.post('/api/battle/action', auth, async (req, res) => {
  try {
    const battle = activeBattles.get(req.user.id);
    if (!battle)           return res.status(404).json({ error: 'No active battle. Start one first.' });
    if (battle.finished)   return res.status(400).json({ error: 'Battle already finished' });
    if (!battle.playerTurn) return res.status(400).json({ error: 'Not your turn' });

    const { action, switchTo } = req.body; // action: 'attack' | 'switch' | 'forfeit'

    if (action === 'forfeit') {
      battle.finished = true;
      battle.winner   = 'ai';
      battle.log.push('You forfeited the battle.');
      await finishBattle(battle, req.user.id, false);
      activeBattles.delete(req.user.id);
      return res.json(battleView(battle));
    }

    if (action === 'switch') {
      const idx = parseInt(switchTo);
      if (isNaN(idx) || idx < 0 || idx >= battle.playerCards.length)
        return res.status(400).json({ error: 'Invalid switch target' });
      if (idx === battle.playerActive)
        return res.status(400).json({ error: 'That creature is already active' });
      if (battle.playerCards[idx].current_hp <= 0)
        return res.status(400).json({ error: 'That creature is fainted' });
      battle.log.push(`You switched to ${battle.playerCards[idx].name}!`);
      battle.playerActive = idx;
      battle.playerTurn   = false;
      runAiTurn(battle);
      advanceFainted(battle);
      if (!checkWin(battle)) battle.playerTurn = true;
      if (battle.finished) {
        await finishBattle(battle, req.user.id, battle.winner === 'player');
        activeBattles.delete(req.user.id);
      }
      return res.json(battleView(battle));
    }

    if (action === 'attack') {
      const pa = battle.playerCards[battle.playerActive];
      const aa = battle.aiCards[battle.aiActive];
      const dmg = calcDamage(pa, aa);
      aa.current_hp = Math.max(0, aa.current_hp - dmg);
      battle.log.push(`You used ${pa.ability_name}! Dealt ${dmg} to ${aa.name}. (${aa.current_hp}/${aa.hp} HP)`);
      advanceFainted(battle);
      if (checkWin(battle)) {
        await finishBattle(battle, req.user.id, battle.winner === 'player');
        activeBattles.delete(req.user.id);
        return res.json(battleView(battle));
      }
      battle.playerTurn = false;
      runAiTurn(battle);
      advanceFainted(battle);
      if (!checkWin(battle)) battle.playerTurn = true;
      if (battle.finished) {
        await finishBattle(battle, req.user.id, battle.winner === 'player');
        activeBattles.delete(req.user.id);
      }
      return res.json(battleView(battle));
    }

    res.status(400).json({ error: 'Unknown action' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function battleView(b) {
  // Strip full card data to only what client needs, keep current_hp
  return {
    id:           b.id,
    playerCards:  b.playerCards,
    aiCards:      b.aiCards,
    playerActive: b.playerActive,
    aiActive:     b.aiActive,
    playerTurn:   b.playerTurn,
    log:          b.log,
    finished:     b.finished,
    winner:       b.winner,
  };
}

async function finishBattle(battle, userId, won) {
  try {
    const p1hp = battle.playerCards.reduce((s,c) => s + c.current_hp, 0);
    const p2hp = battle.aiCards.reduce((s,c)    => s + c.current_hp, 0);
    await query(
      'INSERT INTO matches (player1_id, winner_id, p1_hp_left, p2_hp_left, match_log) VALUES ($1,$2,$3,$4,$5)',
      [userId, won ? userId : null, p1hp, p2hp, JSON.stringify(battle.log)]
    );
    // Conquest mode: award coins, record progress, skip ELO
    if (battle.isConquest) {
      if (won) {
        const reward = battle.conquestReward || 0;
        await query('UPDATE users SET coins = coins + $1 WHERE id=$2', [reward, userId]);
        await query(
          'INSERT INTO conquest_progress (user_id, chapter_id, stage_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
          [userId, battle.conquestChapterId, battle.conquestStageId]
        );
        battle.ratingResult = { conquestWin: true, coinsEarned: reward };
      } else {
        battle.ratingResult = { conquestWin: false, coinsEarned: 0 };
      }
      return;
    }
    // Regular AI battle: coins only, NO ELO (ELO is ranked PvP only)
    if (won) await query('UPDATE users SET coins = coins + 30 WHERE id=$1', [userId]);
    battle.ratingResult = { coinsEarned: won ? 30 : 0 };
  } catch {}
}

// ─── CONQUEST ROUTES ─────────────────────────────────────────────
const CONQUEST_STAGES = {
  // Chapter 1
  '1_1': { types: ['Earth','Nature','Air'],          difficulty: 0.55, reward: 40  },
  '1_2': { types: ['Earth','Nature','Spirit'],        difficulty: 0.70, reward: 60  },
  '1_3': { types: ['Earth','Shadow','Nature'],        difficulty: 0.85, reward: 80  },
  '1_4': { types: ['Earth','Shadow','Nature'],        difficulty: 1.00, reward: 120, isBoss: true },
  // Chapter 2
  '2_1': { types: ['Shadow','Nature','Poison'],       difficulty: 1.00, reward: 100 },
  '2_2': { types: ['Shadow','Poison','Spirit'],       difficulty: 1.15, reward: 120 },
  '2_3': { types: ['Shadow','Blood','Nature'],        difficulty: 1.30, reward: 150 },
  '2_4': { types: ['Shadow','Blood','Void'],          difficulty: 1.45, reward: 200, isBoss: true },
  // Chapter 3
  '3_1': { types: ['Water','Spirit','Air'],           difficulty: 1.05, reward: 110 },
  '3_2': { types: ['Water','Shadow','Ice'],           difficulty: 1.25, reward: 140 },
  '3_3': { types: ['Water','Dragon','Shadow'],        difficulty: 1.45, reward: 170 },
  '3_4': { types: ['Water','Dragon','Void'],          difficulty: 1.60, reward: 230, isBoss: true },
  // Chapter 4
  '4_1': { types: ['Fire','Shadow','Chaos'],          difficulty: 1.20, reward: 130 },
  '4_2': { types: ['Fire','Shadow','Blood'],          difficulty: 1.40, reward: 160 },
  '4_3': { types: ['Fire','Chaos','Dragon'],          difficulty: 1.60, reward: 190 },
  '4_4': { types: ['Fire','Dragon','Chaos'],          difficulty: 1.80, reward: 260, isBoss: true },
  // Chapter 5
  '5_1': { types: ['Ice','Spirit','Air'],             difficulty: 1.30, reward: 150 },
  '5_2': { types: ['Ice','Shadow','Crystal'],         difficulty: 1.55, reward: 180 },
  '5_3': { types: ['Ice','Light','Void'],             difficulty: 1.75, reward: 210 },
  '5_4': { types: ['Ice','Light','Crystal'],          difficulty: 2.00, reward: 300, isBoss: true },
  // Chapter 6
  '6_1': { types: ['Cosmic','Air','Light'],           difficulty: 1.50, reward: 170 },
  '6_2': { types: ['Cosmic','Chaos','Air'],           difficulty: 1.75, reward: 200 },
  '6_3': { types: ['Cosmic','Void','Light'],          difficulty: 2.00, reward: 240 },
  '6_4': { types: ['Cosmic','Light','Void'],          difficulty: 2.20, reward: 340, isBoss: true },
  // Chapter 7
  '7_1': { types: ['Void','Shadow','Chaos'],          difficulty: 1.80, reward: 200 },
  '7_2': { types: ['Void','Chaos','Blood'],           difficulty: 2.05, reward: 240 },
  '7_3': { types: ['Void','Shadow','Cosmic'],         difficulty: 2.30, reward: 280 },
  '7_4': { types: ['Void','Cosmic','Shadow'],         difficulty: 2.50, reward: 400, isBoss: true },
  // Chapter 8
  '8_1': { types: ['Shadow','Spirit','Void'],         difficulty: 2.20, reward: 260 },
  '8_2': { types: ['Void','Blood','Chaos'],           difficulty: 2.50, reward: 300 },
  '8_3': { types: ['Void','Chaos','Blood','Shadow'],  difficulty: 2.80, reward: 360 },
  '8_4': { types: ['Void','Chaos','Blood','Shadow'],  difficulty: 3.20, reward: 600, isBoss: true },
};

const BOSS_CARDS = {
  '1_4': { id:99001, name:'Elder Torin, Corrupted', type:'Earth', class:'Titan', hp:480, atk:190, def:150, spd:70, ability_name:'Root Prison', ability_desc:'Corrupted earth vines constrict and drain life from the enemy.', ability_power:170, rarity:'Mythic', weakness:'Fire', resistance:'Water', retreat_cost:3, card_number:'BOSS-001', is_numbered:true, set_name:'Conquest' },
  '2_4': { id:99002, name:'Vethara, The Hollowed', type:'Shadow', class:'Titan', hp:560, atk:210, def:170, spd:85, ability_name:'Void Bramble', ability_desc:'Ancient corrupted bark tears reality, ignoring all defenses.', ability_power:195, rarity:'Mythic', weakness:'Light', resistance:'Nature', retreat_cost:3, card_number:'BOSS-002', is_numbered:true, set_name:'Conquest' },
  '3_4': { id:99003, name:'Tide Drake Kaluun', type:'Water', class:'Dragon', hp:620, atk:230, def:160, spd:110, ability_name:'Black Tide', ability_desc:'A torrent of Void-corrupted water crashes over all enemies at once.', ability_power:210, rarity:'Mythic', weakness:'Thunder', resistance:'Fire', retreat_cost:3, card_number:'BOSS-003', is_numbered:true, set_name:'Conquest' },
  '4_4': { id:99004, name:'Grand Pyromancer Valdris', type:'Fire', class:'Titan', hp:650, atk:260, def:140, spd:100, ability_name:'Void Pyre', ability_desc:'Black flame that does not warm — it only consumes. Deals devastating fire damage.', ability_power:230, rarity:'Mythic', weakness:'Water', resistance:'Ice', retreat_cost:3, card_number:'BOSS-004', is_numbered:true, set_name:'Conquest' },
  '5_4': { id:99005, name:'Throne Queen Seraphine', type:'Ice', class:'Titan', hp:700, atk:240, def:210, spd:90, ability_name:'Absolute Zero', ability_desc:'Flash-freezes the enemy to near absolute zero. Unbreakable cold.', ability_power:220, rarity:'Mythic', weakness:'Fire', resistance:'Water', retreat_cost:3, card_number:'BOSS-005', is_numbered:true, set_name:'Conquest' },
  '6_4': { id:99006, name:'Celestial Warden Exael', type:'Cosmic', class:'Angel', hp:740, atk:270, def:200, spd:130, ability_name:'Rift Collapse', ability_desc:'Collapses the dimensional rift onto the enemy, dealing cosmic damage.', ability_power:245, rarity:'Mythic', weakness:'Void', resistance:'Shadow', retreat_cost:3, card_number:'BOSS-006', is_numbered:true, set_name:'Conquest' },
  '7_4': { id:99007, name:'Void Architect Nulveth', type:'Void', class:'Construct', hp:820, atk:300, def:230, spd:120, ability_name:'Entropy Engine', ability_desc:'Accelerates the decay of all bonds. Pure Void energy annihilates everything.', ability_power:275, rarity:'Mythic', weakness:'Light', resistance:'Cosmic', retreat_cost:3, card_number:'BOSS-007', is_numbered:true, set_name:'Conquest' },
  '8_4': { id:99008, name:'The Unbound', type:'Void', class:'Titan', hp:1000, atk:340, def:260, spd:140, ability_name:'Forgotten Bond', ability_desc:'Strikes with the grief of every abandoned creature. Deals damage equal to every bond ever broken.', ability_power:320, rarity:'Mythic', weakness:'Light', resistance:'Void', retreat_cost:3, card_number:'BOSS-008', is_numbered:true, set_name:'Conquest' },
};

app.post('/api/conquest/start', auth, async (req, res) => {
  try {
    const { chapterId, stageId } = req.body;
    const key = `${chapterId}_${stageId}`;
    const stage = CONQUEST_STAGES[key];
    if (!stage) return res.status(400).json({ error: 'Invalid stage' });
    let playerPool = await getPlayerDeck(req.user.id);
    const typeList = stage.types.map(t => `'${t}'`).join(',');
    let aiRes = await query(`SELECT * FROM cards WHERE type IN (${typeList}) AND (print_limit IS NULL OR print_count < print_limit) ORDER BY RANDOM() LIMIT 5`);
    let aiPool = aiRes.rows;
    if (aiPool.length < 5) {
      const extras = await query('SELECT * FROM cards ORDER BY RANDOM() LIMIT $1', [5 - aiPool.length]);
      aiPool = [...aiPool, ...extras.rows];
    }
    const d = stage.difficulty;
    const toSlot = (cards, scale) => cards.map(c => ({
      ...c,
      hp:         Math.round(c.hp * scale),
      current_hp: Math.round(c.hp * scale),
      atk:        Math.round(c.atk * scale),
      def:        Math.round(c.def * scale),
    }));
    // Boss stages: replace AI lead card with boss card
    const bossCard = BOSS_CARDS[key];
    let finalAiCards = toSlot(aiPool, d);
    if (bossCard && stage.isBoss) {
      const bc = { ...bossCard, current_hp: bossCard.hp, isBossCard: true };
      finalAiCards = [bc, ...finalAiCards.slice(0, 4)];
    }
    const battle = {
      id:                `conquest_${req.user.id}_${Date.now()}`,
      userId:            req.user.id,
      playerCards:       toSlot(playerPool, 1),
      aiCards:           finalAiCards,
      playerActive:      0,
      aiActive:          0,
      playerTurn:        true,
      log:               [stage.isBoss ? '⚔️ BOSS BATTLE BEGINS! Face your destiny!' : 'The battle begins! Your turn.'],
      finished:          false,
      winner:            null,
      createdAt:         Date.now(),
      isConquest:        true,
      isBoss:            !!stage.isBoss,
      conquestChapterId: chapterId,
      conquestStageId:   stageId,
      conquestReward:    stage.reward,
    };
    activeBattles.set(req.user.id, battle);
    res.json(battleView(battle));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/conquest/progress', auth, async (req, res) => {
  try {
    const result = await query(
      'SELECT chapter_id, stage_id FROM conquest_progress WHERE user_id=$1',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── DECK ROUTES ─────────────────────────────────────────────────
app.get('/api/deck', auth, async (req, res) => {
  try {
    const deckRes = await query('SELECT card_ids FROM decks WHERE user_id=$1', [req.user.id]);
    const cardIds = deckRes.rows[0]?.card_ids || [];
    if (!cardIds.length) return res.json({ cards: [], card_ids: [] });
    const cards = await query(
      'SELECT c.* FROM cards c JOIN user_cards uc ON uc.card_id=c.id WHERE uc.user_id=$1 AND c.id = ANY($2)',
      [req.user.id, cardIds]
    );
    res.json({ cards: cards.rows, card_ids: cardIds });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/deck', auth, async (req, res) => {
  try {
    const { card_ids } = req.body;
    if (!Array.isArray(card_ids) || card_ids.length < 1) return res.status(400).json({ error: 'Select 1–5 cards' });
    if (card_ids.length > 5) return res.status(400).json({ error: 'Deck cannot exceed 5 cards' });
    const owned = await query('SELECT card_id FROM user_cards WHERE user_id=$1 AND card_id = ANY($2)', [req.user.id, card_ids]);
    const ownedIds = owned.rows.map(r => r.card_id);
    if (!card_ids.every(id => ownedIds.includes(id))) return res.status(400).json({ error: 'You do not own all selected cards' });
    await query(
      'INSERT INTO decks (user_id,card_ids) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET card_ids=$2',
      [req.user.id, JSON.stringify(card_ids)]
    );
    res.json({ message: 'Deck saved' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/deck/auto', auth, async (req, res) => {
  try {
    const { mode, type } = req.body;
    let sql, params;
    if (mode === 'type' && type) {
      sql = 'SELECT c.* FROM cards c JOIN user_cards uc ON uc.card_id=c.id WHERE uc.user_id=$1 AND c.type=$2 ORDER BY (c.atk+c.def+c.hp+c.spd) DESC LIMIT 5';
      params = [req.user.id, type];
    } else {
      sql = 'SELECT c.* FROM cards c JOIN user_cards uc ON uc.card_id=c.id WHERE uc.user_id=$1 ORDER BY (c.atk+c.def+c.hp+c.spd) DESC LIMIT 5';
      params = [req.user.id];
    }
    const cards = await query(sql, params);
    if (!cards.rows.length) return res.status(400).json({ error: 'No cards in collection' + (type ? ' for that type' : '') });
    const cardIds = cards.rows.map(c => c.id);
    await query(
      'INSERT INTO decks (user_id,card_ids) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET card_ids=$2',
      [req.user.id, JSON.stringify(cardIds)]
    );
    res.json({ cards: cards.rows, card_ids: cardIds });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PVP ROUTES ──────────────────────────────────────────────────
app.post('/api/pvp/queue', auth, async (req, res) => {
  try {
    // Already in a live battle?
    const existingBid = userToBattle.get(req.user.id);
    if (existingBid) {
      const b = pvpBattles.get(existingBid);
      if (b && !b.finished) return res.json({ status: 'in_battle' });
      userToBattle.delete(req.user.id);
    }
    const { ranked } = req.body;
    const cards = await getPlayerDeck(req.user.id);
    pvpQueue.set(req.user.id, { userId: req.user.id, username: req.user.username, ranked: !!ranked, cards, joinedAt: Date.now() });
    tryMatchPlayers();
    if (userToBattle.has(req.user.id)) return res.json({ status: 'matched' });
    res.json({ status: 'queued' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/pvp/queue', auth, (req, res) => {
  pvpQueue.delete(req.user.id);
  res.json({ message: 'Left queue' });
});

app.get('/api/pvp/queue/status', auth, (req, res) => {
  if (userToBattle.has(req.user.id)) {
    const b = pvpBattles.get(userToBattle.get(req.user.id));
    if (b && !b.finished) return res.json({ status: 'matched' });
    userToBattle.delete(req.user.id);
  }
  if (pvpQueue.has(req.user.id)) {
    const e = pvpQueue.get(req.user.id);
    return res.json({ status: 'queued', waitTime: Math.floor((Date.now() - e.joinedAt) / 1000) });
  }
  res.json({ status: 'idle' });
});

app.get('/api/pvp/battle', auth, (req, res) => {
  const bid = userToBattle.get(req.user.id);
  if (!bid) return res.status(404).json({ error: 'No active PvP battle' });
  const battle = pvpBattles.get(bid);
  if (!battle) return res.status(404).json({ error: 'Battle not found' });
  if (!battle.finished && Date.now() - battle.lastAction > 30000) {
    executePvpAutoAttack(battle);
    if (battle.finished) finishPvpBattle(battle).catch(console.error);
  }
  res.json(getPvpStateForUser(battle, req.user.id));
});

app.post('/api/pvp/action', auth, async (req, res) => {
  try {
    const bid = userToBattle.get(req.user.id);
    if (!bid) return res.status(404).json({ error: 'No active PvP battle' });
    const battle = pvpBattles.get(bid);
    if (!battle) return res.status(404).json({ error: 'Battle not found' });
    if (battle.finished) return res.status(400).json({ error: 'Battle already finished' });
    const isP1 = battle.player1Id === req.user.id;
    if ((battle.turn === 'player1') !== isP1) return res.status(400).json({ error: 'Not your turn' });
    const { action, switchTo } = req.body;
    const myCards   = isP1 ? battle.player1Cards : battle.player2Cards;
    const theirCards = isP1 ? battle.player2Cards : battle.player1Cards;
    const myActive  = isP1 ? battle.player1Active : battle.player2Active;
    const theirActive = isP1 ? battle.player2Active : battle.player1Active;
    const myUser    = isP1 ? battle.player1Username : battle.player2Username;
    const theirUser = isP1 ? battle.player2Username : battle.player1Username;

    if (action === 'forfeit') {
      battle.finished = true;
      battle.winner = isP1 ? 'player2' : 'player1';
      battle.log.push(`${myUser} forfeited.`);
    } else if (action === 'switch') {
      if (switchTo === undefined || myCards[switchTo]?.current_hp <= 0) return res.status(400).json({ error: 'Invalid switch' });
      if (isP1) battle.player1Active = switchTo; else battle.player2Active = switchTo;
      battle.log.push(`${myUser} switched to ${myCards[switchTo].name}!`);
    } else if (action === 'attack') {
      const attacker = myCards[myActive], defender = theirCards[theirActive];
      const dmg = calcDamage(attacker, defender);
      defender.current_hp = Math.max(0, defender.current_hp - dmg);
      battle.log.push(`${myUser}'s ${attacker.name} used ${attacker.ability_name}! Dealt ${dmg} to ${theirUser}'s ${defender.name}. (${defender.current_hp}/${defender.max_hp} HP)`);
      if (defender.current_hp <= 0) {
        const next = theirCards.findIndex((c,i) => i !== theirActive && c.current_hp > 0);
        if (next !== -1) {
          if (isP1) battle.player2Active = next; else battle.player1Active = next;
          battle.log.push(`${theirUser}'s ${theirCards[next].name} steps forward!`);
        }
      }
      if (!theirCards.some(c => c.current_hp > 0)) {
        battle.finished = true;
        battle.winner = isP1 ? 'player1' : 'player2';
        battle.log.push(`${myUser} wins! All opponent's creatures defeated!`);
      }
    }

    if (!battle.finished) {
      battle.turn = battle.turn === 'player1' ? 'player2' : 'player1';
      battle.lastAction = Date.now();
      // Advance fainted active
      const nowMyCards = isP1 ? battle.player1Cards : battle.player2Cards;
      const nowMyActive = isP1 ? battle.player1Active : battle.player2Active;
      if (nowMyCards[nowMyActive]?.current_hp <= 0) {
        const next = nowMyCards.findIndex((c,i) => i !== nowMyActive && c.current_hp > 0);
        if (next !== -1) { if (isP1) battle.player1Active = next; else battle.player2Active = next; }
      }
    } else {
      await finishPvpBattle(battle);
      setTimeout(() => { pvpBattles.delete(bid); userToBattle.delete(battle.player1Id); userToBattle.delete(battle.player2Id); }, 120000);
    }
    res.json(getPvpStateForUser(battle, req.user.id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── REPORTS ROUTES ──────────────────────────────────────────────
app.post('/api/reports', auth, async (req, res) => {
  try {
    const { reported_username, category, description, evidence_url, priority } = req.body;
    if (!reported_username || !category || !description) return res.status(400).json({ error: 'All fields required' });
    const target = await query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [reported_username]);
    if (!target.rows.length) return res.status(404).json({ error: 'User not found' });
    const pri = ['low','normal','high','urgent'].includes(priority) ? priority : 'normal';
    await query('INSERT INTO reports (reporter_id, reported_user_id, category, description, evidence_url, priority) VALUES ($1,$2,$3,$4,$5,$6)',
      [req.user.id, target.rows[0].id, category, description, evidence_url || null, pri]);
    res.json({ message: 'Report submitted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/reports/mine', auth, async (req, res) => {
  try {
    const result = await query(`
      SELECT r.*, u.username as reported_username
      FROM reports r JOIN users u ON u.id = r.reported_user_id
      WHERE r.reporter_id = $1 ORDER BY r.created_at DESC
    `, [req.user.id]);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── SETTINGS ROUTES ─────────────────────────────────────────────
app.get('/api/settings', auth, async (req, res) => {
  try {
    const s = await query('SELECT * FROM user_settings WHERE user_id = $1', [req.user.id]);
    const u = await query('SELECT username, avatar_color, bio, coins FROM users WHERE id = $1', [req.user.id]);
    res.json({ ...s.rows[0], ...u.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/settings', auth, async (req, res) => {
  try {
    const { theme, show_collection, show_rank, notifications, privacy_level } = req.body;
    await query('UPDATE user_settings SET theme=$1, show_collection=$2, show_rank=$3, notifications=$4, privacy_level=$5 WHERE user_id=$6',
      [theme || 'default', show_collection !== false, show_rank !== false, notifications !== false, privacy_level || 'public', req.user.id]);
    res.json({ message: 'Settings saved' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/settings/avatar', auth, async (req, res) => {
  try {
    const { color } = req.body;
    await query('UPDATE users SET avatar_color=$1 WHERE id=$2', [color, req.user.id]);
    res.json({ message: 'Avatar updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/settings/avatar-img', auth, async (req, res) => {
  try {
    let { img } = req.body;
    // Allow emoji prefix (e.g. "emoji:🐉") or base64 data URL
    if (!img) return res.status(400).json({ error: 'No image provided' });
    if (img.startsWith('data:') && img.length > 200000) return res.status(400).json({ error: 'Image too large (max ~150KB)' });
    await query('UPDATE users SET avatar_img=$1 WHERE id=$2', [img, req.user.id]);
    res.json({ message: 'Avatar updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/settings/bio', auth, async (req, res) => {
  try {
    const { bio } = req.body;
    await query('UPDATE users SET bio=$1 WHERE id=$2', [bio?.slice(0, 200), req.user.id]);
    res.json({ message: 'Bio updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/settings/password', auth, async (req, res) => {
  try {
    const { current, newPassword } = req.body;
    const userRes = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const valid = await bcrypt.compare(current, userRes.rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password incorrect' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'New password must be 8+ characters' });
    const hash = await bcrypt.hash(newPassword, 10);
    await query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, req.user.id]);
    res.json({ message: 'Password changed' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── ANNOUNCEMENTS (public read) ─────────────────────────────────
app.get('/api/announcements', async (req, res) => {
  try {
    const result = await query('SELECT a.*, u.username FROM announcements a JOIN users u ON u.id = a.author_id ORDER BY a.created_at DESC LIMIT 10');
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── ADMIN ROUTES ─────────────────────────────────────────────────
app.get('/api/admin/users', auth, requireRole('mod'), async (req, res) => {
  try {
    const { q } = req.query;
    let sql = `SELECT u.id, u.username, u.role, u.coins, u.banned, u.ban_reason, u.timeout_until, u.created_at,
               COUNT(w.id)::int AS warning_count
               FROM users u LEFT JOIN warnings w ON w.user_id = u.id`;
    const params = [];
    if (q) { sql += ' WHERE u.username ILIKE $1'; params.push('%' + q + '%'); }
    sql += ' GROUP BY u.id ORDER BY u.created_at DESC LIMIT 100';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

async function guardDeveloper(id, res) {
  const t = await query('SELECT role FROM users WHERE id=$1', [id]);
  if (!t.rows.length) { res.status(404).json({ error: 'User not found' }); return true; }
  if (t.rows[0].role === 'developer') { res.status(403).json({ error: 'Developer accounts cannot be modified' }); return true; }
  return false;
}

app.put('/api/admin/users/:id/ban', auth, requireRole('mod'), async (req, res) => {
  try {
    if (await guardDeveloper(req.params.id, res)) return;
    const { reason } = req.body;
    const target = await query('SELECT role FROM users WHERE id=$1', [req.params.id]);
    if (ROLE_ORDER.indexOf(target.rows[0].role) >= ROLE_ORDER.indexOf(req.user.role))
      return res.status(403).json({ error: 'Cannot ban a user with equal or higher role' });
    await query('UPDATE users SET banned=true, ban_reason=$1 WHERE id=$2', [reason || 'No reason', req.params.id]);
    await logAction(req.user.id, 'BAN', req.params.id, reason);
    res.json({ message: 'User banned' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/users/:id/unban', auth, requireRole('mod'), async (req, res) => {
  try {
    if (await guardDeveloper(req.params.id, res)) return;
    await query('UPDATE users SET banned=false, ban_reason=NULL WHERE id=$1', [req.params.id]);
    await logAction(req.user.id, 'UNBAN', req.params.id, '');
    res.json({ message: 'User unbanned' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/users/:id/role', auth, requireRole('admin'), async (req, res) => {
  try {
    if (await guardDeveloper(req.params.id, res)) return;
    const { role } = req.body;
    const validRoles = { admin: ['mod'], headofstaff: ['mod','admin'], owner: ['mod','admin','headofstaff'], developer: ['mod','admin','headofstaff','owner'] };
    const allowed = validRoles[req.user.role] || [];
    if (!allowed.includes(role)) return res.status(403).json({ error: 'Cannot assign that role' });
    await query('UPDATE users SET role=$1 WHERE id=$2', [role, req.params.id]);
    await logAction(req.user.id, 'SET_ROLE:' + role, req.params.id, '');
    res.json({ message: 'Role updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/reports', auth, requireRole('mod'), async (req, res) => {
  try {
    const { status } = req.query;
    let sql = `SELECT r.*, u1.username as reporter_name, u2.username as reported_name FROM reports r
               JOIN users u1 ON u1.id = r.reporter_id JOIN users u2 ON u2.id = r.reported_user_id`;
    const params = [];
    if (status) { sql += ' WHERE r.status = $1'; params.push(status); }
    sql += ' ORDER BY r.created_at DESC';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/reports/:id', auth, requireRole('mod'), async (req, res) => {
  try {
    const { status, handler_notes } = req.body;
    await query('UPDATE reports SET status=$1, handler_notes=$2, handled_by=$3 WHERE id=$4',
      [status, handler_notes, req.user.id, req.params.id]);
    await logAction(req.user.id, 'REPORT_UPDATE:' + status, null, 'report #' + req.params.id);
    res.json({ message: 'Report updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/reports/:id', auth, requireRole('admin'), async (req, res) => {
  try {
    await query('DELETE FROM reports WHERE id=$1', [req.params.id]);
    await logAction(req.user.id, 'DELETE_REPORT', null, 'report #' + req.params.id);
    res.json({ message: 'Report deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/logs', auth, requireRole('admin'), async (req, res) => {
  try {
    const result = await query(`SELECT al.*, u.username as admin_name FROM admin_logs al
      LEFT JOIN users u ON u.id = al.admin_id ORDER BY al.created_at DESC LIMIT 200`);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/stats', auth, requireRole('admin'), async (req, res) => {
  try {
    const users = await query('SELECT COUNT(*) FROM users');
    const cards = await query('SELECT COUNT(*) FROM cards');
    const matches = await query('SELECT COUNT(*) FROM matches');
    const reports = await query("SELECT COUNT(*) FROM reports WHERE status='open'");
    const topUser = await query('SELECT u.username, rs.rating FROM ranked_stats rs JOIN users u ON u.id=rs.user_id ORDER BY rs.rating DESC LIMIT 1');
    res.json({
      user_count: parseInt(users.rows[0].count),
      card_count: parseInt(cards.rows[0].count),
      match_count: parseInt(matches.rows[0].count),
      open_reports: parseInt(reports.rows[0].count),
      top_player: topUser.rows[0] || null
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/announcements', auth, requireRole('admin'), async (req, res) => {
  try {
    const { title, body } = req.body;
    await query('INSERT INTO announcements (author_id, title, body) VALUES ($1,$2,$3)', [req.user.id, title, body]);
    await logAction(req.user.id, 'ANNOUNCEMENT', null, title);
    res.json({ message: 'Announcement posted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/users/:id/coins', auth, requireRole('owner'), async (req, res) => {
  try {
    if (await guardDeveloper(req.params.id, res)) return;
    const { amount } = req.body;
    await query('UPDATE users SET coins = coins + $1 WHERE id=$2', [amount, req.params.id]);
    await logAction(req.user.id, 'COINS:' + amount, req.params.id, '');
    res.json({ message: 'Coins updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/users/:id/cards/add', auth, requireRole('owner'), async (req, res) => {
  try {
    if (await guardDeveloper(req.params.id, res)) return;
    const { card_id } = req.body;
    await query('INSERT INTO user_cards (user_id, card_id) VALUES ($1,$2) ON CONFLICT (user_id, card_id) DO UPDATE SET quantity = user_cards.quantity + 1', [req.params.id, card_id]);
    await logAction(req.user.id, 'ADD_CARD:' + card_id, req.params.id, '');
    res.json({ message: 'Card added' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/users/:id', auth, requireRole('owner'), async (req, res) => {
  try {
    if (await guardDeveloper(req.params.id, res)) return;
    const target = await query('SELECT role FROM users WHERE id=$1', [req.params.id]);
    if (ROLE_ORDER.indexOf(target.rows[0].role) >= ROLE_ORDER.indexOf(req.user.role))
      return res.status(403).json({ error: 'Cannot delete user with equal or higher role' });
    await query('DELETE FROM users WHERE id=$1', [req.params.id]);
    await logAction(req.user.id, 'DELETE_USER', req.params.id, '');
    res.json({ message: 'User deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Warnings ──────────────────────────────────────────────────────
app.post('/api/admin/users/:id/warn', auth, requireRole('mod'), async (req, res) => {
  try {
    if (await guardDeveloper(req.params.id, res)) return;
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: 'Reason required' });
    await query('INSERT INTO warnings (user_id, issued_by, reason) VALUES ($1,$2,$3)', [req.params.id, req.user.id, reason]);
    await query(
      "INSERT INTO notifications (user_id, type, message) VALUES ($1,'warning',$2)",
      [req.params.id, `You received a warning: ${reason}`]
    );
    await logAction(req.user.id, 'WARN', req.params.id, reason);
    res.json({ message: 'Warning issued' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/users/:id/warnings', auth, requireRole('mod'), async (req, res) => {
  try {
    const result = await query(
      'SELECT w.*, u.username as issued_by_name FROM warnings w LEFT JOIN users u ON u.id = w.issued_by WHERE w.user_id=$1 ORDER BY w.created_at DESC',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/warnings/:id', auth, requireRole('admin'), async (req, res) => {
  try {
    await query('DELETE FROM warnings WHERE id=$1', [req.params.id]);
    await logAction(req.user.id, 'DELETE_WARNING', null, 'warning #' + req.params.id);
    res.json({ message: 'Warning removed' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Timeouts ───────────────────────────────────────────────────────
const TIMEOUT_DURATIONS = { '1h': 60, '6h': 360, '12h': 720, '24h': 1440, '3d': 4320, '7d': 10080 };
app.put('/api/admin/users/:id/timeout', auth, requireRole('mod'), async (req, res) => {
  try {
    if (await guardDeveloper(req.params.id, res)) return;
    const { duration, reason } = req.body;
    const mins = TIMEOUT_DURATIONS[duration];
    if (!mins) return res.status(400).json({ error: 'Invalid duration. Use: ' + Object.keys(TIMEOUT_DURATIONS).join(', ') });
    const until = new Date(Date.now() + mins * 60000);
    await query('UPDATE users SET timeout_until=$1 WHERE id=$2', [until, req.params.id]);
    await query(
      "INSERT INTO notifications (user_id, type, message) VALUES ($1,'warning',$2)",
      [req.params.id, `You have been timed out for ${duration}${reason ? ': ' + reason : ''}`]
    );
    await logAction(req.user.id, 'TIMEOUT:' + duration, req.params.id, reason || '');
    res.json({ message: `User timed out for ${duration}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/users/:id/timeout', auth, requireRole('mod'), async (req, res) => {
  try {
    if (await guardDeveloper(req.params.id, res)) return;
    await query('UPDATE users SET timeout_until=NULL WHERE id=$1', [req.params.id]);
    await logAction(req.user.id, 'REMOVE_TIMEOUT', req.params.id, '');
    res.json({ message: 'Timeout removed' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Admin user detail (includes warning count + timeout) ──────────
app.get('/api/admin/users/:id/detail', auth, requireRole('mod'), async (req, res) => {
  try {
    const u = await query('SELECT id, username, role, coins, banned, ban_reason, timeout_until, created_at FROM users WHERE id=$1', [req.params.id]);
    if (!u.rows.length) return res.status(404).json({ error: 'Not found' });
    const wc = await query('SELECT COUNT(*) FROM warnings WHERE user_id=$1', [req.params.id]);
    res.json({ ...u.rows[0], warning_count: parseInt(wc.rows[0].count) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/ranked/reset', auth, requireRole('owner'), async (req, res) => {
  try {
    await query('UPDATE ranked_stats SET season_wins=0, season_losses=0, top500=false');
    await logAction(req.user.id, 'RESET_SEASON', null, '');
    res.json({ message: 'Season reset' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── DEVELOPER ROUTES ────────────────────────────────────────────
const devAuth = [auth, requireRole('developer')];

app.get('/api/dev/database/tables', ...devAuth, async (req, res) => {
  try {
    const result = await query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
    res.json(result.rows.map(r => r.table_name));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/dev/database/query', ...devAuth, async (req, res) => {
  try {
    const { sql, params } = req.body;
    const result = await query(sql, params || []);
    await logAction(req.user.id, 'RAW_QUERY', null, sql.slice(0, 100));
    res.json({ rows: result.rows, rowCount: result.rowCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/dev/cards/:id', ...devAuth, async (req, res) => {
  try {
    const fields = ['hp','atk','def','spd','ability_name','ability_desc','ability_power','rarity','type'];
    const updates = [];
    const params = [];
    let idx = 1;
    for (const f of fields) {
      if (req.body[f] !== undefined) { updates.push(`${f}=$${idx++}`); params.push(req.body[f]); }
    }
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    params.push(req.params.id);
    await query(`UPDATE cards SET ${updates.join(',')} WHERE id=$${idx}`, params);
    await logAction(req.user.id, 'DEV_EDIT_CARD:' + req.params.id, null, JSON.stringify(req.body));
    res.json({ message: 'Card updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/dev/cards', ...devAuth, async (req, res) => {
  try {
    const { name, type, cls, hp, atk, def, spd, ability_name, ability_desc, ability_power, retreat_cost, weakness, resistance, rarity, set_name, flavor_text, art_style } = req.body;
    const maxId = await query('SELECT MAX(id) FROM cards');
    const newId = (maxId.rows[0].max || 10500) + 1;
    await query('INSERT INTO cards (id,name,type,class,hp,atk,def,spd,ability_name,ability_desc,ability_power,retreat_cost,weakness,resistance,rarity,set_name,flavor_text,art_style,card_number) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)',
      [newId, name, type, cls, hp, atk, def, spd, ability_name, ability_desc, ability_power, retreat_cost, weakness, resistance, rarity, set_name, flavor_text, art_style, `${String(newId).padStart(5,'0')}/PROMO`]);
    await logAction(req.user.id, 'DEV_CREATE_CARD', null, name);
    res.json({ message: 'Card created', id: newId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/dev/cards/:id', ...devAuth, async (req, res) => {
  try {
    await query('DELETE FROM user_cards WHERE card_id=$1', [req.params.id]);
    await query('DELETE FROM cards WHERE id=$1', [req.params.id]);
    await logAction(req.user.id, 'DEV_DELETE_CARD:' + req.params.id, null, '');
    res.json({ message: 'Card deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/dev/performance', ...devAuth, async (req, res) => {
  try {
    const mem = process.memoryUsage();
    res.json({
      uptime: process.uptime(),
      memory: { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal },
      nodeVersion: process.version,
      platform: process.platform
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/dev/users/:id/stats', ...devAuth, async (req, res) => {
  try {
    const { rating, wins, losses, coins } = req.body;
    if (rating !== undefined || wins !== undefined || losses !== undefined) {
      const r = rating !== undefined ? rating : undefined;
      const title = r !== undefined ? rankTitle(r) : undefined;
      const fields = [];
      const params = [];
      let idx = 1;
      if (rating !== undefined) { fields.push(`rating=$${idx++}`); params.push(rating); fields.push(`rank_title=$${idx++}`); params.push(rankTitle(rating)); }
      if (wins !== undefined) { fields.push(`wins=$${idx++}`); params.push(wins); }
      if (losses !== undefined) { fields.push(`losses=$${idx++}`); params.push(losses); }
      params.push(req.params.id);
      if (fields.length) await query(`UPDATE ranked_stats SET ${fields.join(',')} WHERE user_id=$${idx}`, params);
    }
    if (coins !== undefined) await query('UPDATE users SET coins=$1 WHERE id=$2', [coins, req.params.id]);
    await logAction(req.user.id, 'DEV_EDIT_STATS', req.params.id, JSON.stringify(req.body));
    res.json({ message: 'Stats updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/dev/news', ...devAuth, async (req, res) => {
  try {
    const { title, body } = req.body;
    await query('INSERT INTO news (author_id, title, body) VALUES ($1,$2,$3)', [req.user.id, title, body]);
    res.json({ message: 'News posted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/dev/news/:id', ...devAuth, async (req, res) => {
  try {
    const { title, body } = req.body;
    await query('UPDATE news SET title=$1, body=$2, updated_at=NOW() WHERE id=$3', [title, body, req.params.id]);
    res.json({ message: 'News updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/dev/news/:id', ...devAuth, async (req, res) => {
  try {
    await query('DELETE FROM news WHERE id=$1', [req.params.id]);
    res.json({ message: 'News deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/dev/sessions', ...devAuth, async (req, res) => {
  try {
    const result = await query('SELECT s.*, u.username FROM sessions s JOIN users u ON u.id=s.user_id ORDER BY s.last_seen DESC');
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/dev/sessions/:id', ...devAuth, async (req, res) => {
  try {
    await query('DELETE FROM sessions WHERE id=$1', [req.params.id]);
    await logAction(req.user.id, 'KILL_SESSION:' + req.params.id, null, '');
    res.json({ message: 'Session terminated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/dev/ranked/leaderboard/:id', ...devAuth, async (req, res) => {
  try {
    const { rating } = req.body;
    await query('UPDATE ranked_stats SET rating=$1, rank_title=$2 WHERE user_id=$3', [rating, rankTitle(rating), req.params.id]);
    await logAction(req.user.id, 'DEV_EDIT_RATING', req.params.id, '' + rating);
    res.json({ message: 'Leaderboard entry updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/dev/config', ...devAuth, async (req, res) => {
  try {
    const result = await query('SELECT * FROM game_config');
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/dev/config', ...devAuth, async (req, res) => {
  try {
    const { key, value } = req.body;
    await query('INSERT INTO game_config (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()', [key, value]);
    res.json({ message: 'Config updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/dev/users/:id/logout', ...devAuth, async (req, res) => {
  try {
    await query('DELETE FROM sessions WHERE user_id=$1', [req.params.id]);
    await logAction(req.user.id, 'FORCE_LOGOUT', req.params.id, '');
    res.json({ message: 'User logged out' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/dev/users/:id/verify', ...devAuth, async (req, res) => {
  try {
    const { verified } = req.body;
    await logAction(req.user.id, verified ? 'VERIFY_USER' : 'FLAG_USER', req.params.id, '');
    res.json({ message: verified ? 'User verified' : 'User flagged' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/dev/maintenance/:feature', ...devAuth, async (req, res) => {
  try {
    const { enabled } = req.body;
    await query('INSERT INTO game_config (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()',
      ['maintenance_' + req.params.feature, String(enabled)]);
    res.json({ message: `Maintenance for ${req.params.feature} set to ${enabled}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/dev/cards/promo', ...devAuth, async (req, res) => {
  try {
    const { name, type, cls, hp, atk, def, spd, ability_name, ability_desc, ability_power,
            rarity, shop_price, is_numbered, print_limit, expires_at, flavor_text, retreat_cost, weakness, resistance,
            set_name, art_style } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const maxId = await query('SELECT MAX(id) FROM cards');
    const newId = (maxId.rows[0].max || 10500) + 1;
    const wk = weakness || (WEAKNESS_MAP[type||'Fire'] || 'Water');
    const rs = resistance || (RESISTANCE_MAP[type||'Fire'] || 'Nature');
    await query(
      'INSERT INTO cards (id,name,type,class,hp,atk,def,spd,ability_name,ability_desc,ability_power,retreat_cost,weakness,resistance,rarity,is_numbered,set_name,flavor_text,art_style,card_number,shop_price,print_limit,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)',
      [newId, name, type||'Fire', cls||'Titan', hp||200, atk||100, def||80, spd||80,
       ability_name||'Promo Strike', ability_desc||'A legendary promo ability.', ability_power||130,
       retreat_cost||1, wk, rs,
       rarity||'Mythic', is_numbered||false,
       set_name||'Promo Series', flavor_text||'A special promotional creature.',
       art_style||'ink', `PROMO-${newId}`, shop_price||0, print_limit||null,
       expires_at ? new Date(expires_at) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)]
    );
    await logAction(req.user.id, 'DEV_PROMO_CARD', null, name);
    res.json({ message: 'Promo card created', id: newId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/dev/economy', ...devAuth, async (req, res) => {
  try {
    const { pack_cost, daily_coins, win_coins } = req.body;
    const updates = [];
    if (pack_cost !== undefined) updates.push(['economy_pack_cost', String(pack_cost)]);
    if (daily_coins !== undefined) updates.push(['economy_daily_coins', String(daily_coins)]);
    if (win_coins !== undefined) updates.push(['economy_win_coins', String(win_coins)]);
    for (const [k, v] of updates) await query('INSERT INTO game_config (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()', [k, v]);
    await logAction(req.user.id, 'DEV_ECONOMY', null, JSON.stringify(req.body));
    res.json({ message: 'Economy updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/dev/ranked/create-rank', ...devAuth, async (req, res) => {
  try {
    const { name, min_rating } = req.body;
    await query('INSERT INTO game_config (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()',
      ['custom_rank_' + name.toLowerCase().replace(/\s+/g,'_'), JSON.stringify({ name, min_rating })]);
    await logAction(req.user.id, 'DEV_CREATE_RANK', null, name);
    res.json({ message: 'Custom rank created' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/dev/users/:id/collection/grant', ...devAuth, async (req, res) => {
  try {
    const { card_ids } = req.body;
    for (const cid of card_ids) {
      await query('INSERT INTO user_cards (user_id, card_id) VALUES ($1,$2) ON CONFLICT (user_id, card_id) DO UPDATE SET quantity = user_cards.quantity + 1', [req.params.id, cid]);
    }
    await logAction(req.user.id, 'DEV_GRANT_CARDS', req.params.id, card_ids.length + ' cards');
    res.json({ message: `${card_ids.length} cards granted` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/dev/api-usage', ...devAuth, async (req, res) => {
  try {
    const stats = await query('SELECT action, COUNT(*) as count FROM admin_logs GROUP BY action ORDER BY count DESC LIMIT 50');
    res.json(stats.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/dev/database/backup', ...devAuth, async (req, res) => {
  try {
    const tables = await query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
    const backup = {};
    for (const row of tables.rows) {
      const data = await query(`SELECT * FROM ${row.table_name} LIMIT 1000`);
      backup[row.table_name] = { count: data.rowCount, sample: data.rows.slice(0, 5) };
    }
    await logAction(req.user.id, 'DB_BACKUP', null, '');
    res.json({ message: 'Backup snapshot created', backup, timestamp: new Date().toISOString() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/dev/matches/:id/end', ...devAuth, async (req, res) => {
  try {
    const { winner_id } = req.body;
    await query('UPDATE matches SET winner_id=$1 WHERE id=$2', [winner_id, req.params.id]);
    await logAction(req.user.id, 'FORCE_END_MATCH:' + req.params.id, winner_id, '');
    res.json({ message: 'Match ended' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PROFILE ROUTES ──────────────────────────────────────────────
app.get('/api/users/:username/profile', auth, async (req, res) => {
  try {
    const userRes = await query(`
      SELECT u.id, u.username, u.role, u.avatar_color, u.avatar_img, u.bio, u.created_at,
             rs.rating, rs.rank_title, rs.wins, rs.losses, rs.top500, rs.season_wins, rs.season_losses,
             COUNT(uc.id)::int AS card_count
      FROM users u
      LEFT JOIN ranked_stats rs ON rs.user_id = u.id
      LEFT JOIN user_cards uc ON uc.user_id = u.id
      WHERE LOWER(u.username) = LOWER($1) AND u.banned = false
      GROUP BY u.id, rs.rating, rs.rank_title, rs.wins, rs.losses, rs.top500, rs.season_wins, rs.season_losses
    `, [req.params.username]);
    if (!userRes.rows.length) return res.status(404).json({ error: 'User not found' });
    const user = userRes.rows[0];
    const matchRes = await query(`
      SELECT m.id, m.winner_id, m.created_at, u2.username AS opponent
      FROM matches m LEFT JOIN users u2 ON u2.id = m.player2_id
      WHERE m.player1_id = $1 ORDER BY m.created_at DESC LIMIT 5
    `, [user.id]);
    res.json({ ...user, recent_matches: matchRes.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PROMO SHOP ROUTES ────────────────────────────────────────────
app.get('/api/shop/promos', auth, async (req, res) => {
  try {
    const result = await query("SELECT * FROM cards WHERE shop_price > 0 AND (print_limit IS NULL OR print_count < print_limit) AND (expires_at IS NULL OR expires_at > NOW()) ORDER BY id DESC");
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/shop/promos/:id/buy', auth, async (req, res) => {
  try {
    const cardId = parseInt(req.params.id);
    const cardRes = await query("SELECT * FROM cards WHERE id = $1 AND shop_price > 0", [cardId]);
    if (!cardRes.rows.length) return res.status(404).json({ error: 'Promo not found' });
    const card = cardRes.rows[0];
    // Check if expired
    if (card.expires_at && new Date(card.expires_at) <= new Date()) {
      return res.status(400).json({ error: 'This promo has expired!' });
    }
    // Check if sold out
    if (card.is_numbered && card.print_limit !== null && card.print_count >= card.print_limit) {
      return res.status(400).json({ error: 'This card is sold out!' });
    }
    const price = card.shop_price;
    const userRes = await query("SELECT coins FROM users WHERE id = $1", [req.user.id]);
    if (userRes.rows[0].coins < price) return res.status(400).json({ error: 'Not enough coins' });
    await query("UPDATE users SET coins = coins - $1 WHERE id = $2", [price, req.user.id]);
    // Claim print number if limited numbered card
    let printNumber = null;
    if (card.is_numbered && card.print_limit !== null) {
      const claim = await query(
        'UPDATE cards SET print_count = print_count + 1 WHERE id = $1 AND print_count < print_limit RETURNING print_count',
        [cardId]
      );
      if (!claim.rows.length) return res.status(400).json({ error: 'This card just sold out!' });
      printNumber = claim.rows[0].print_count;
    }
    await query("INSERT INTO user_cards (user_id, card_id, print_number) VALUES ($1,$2,$3) ON CONFLICT (user_id,card_id) DO UPDATE SET quantity = user_cards.quantity + 1", [req.user.id, cardId, printNumber]);
    res.json({ message: 'Promo card purchased!', card: cardRes.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── STAFF CHAT ROUTES ────────────────────────────────────────────
const isStaff = (role) => ['mod','admin','headofstaff','owner','developer'].includes(role);

app.get('/api/staff/chat', auth, async (req, res) => {
  if (!isStaff(req.user.role)) return res.status(403).json({ error: 'Staff only' });
  try {
    const result = await query(`
      SELECT sm.id, sm.message, sm.created_at, u.username, u.role, u.avatar_color, u.avatar_img
      FROM staff_messages sm JOIN users u ON u.id = sm.user_id
      ORDER BY sm.created_at DESC LIMIT 100
    `);
    res.json(result.rows.reverse());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/staff/chat', auth, async (req, res) => {
  if (!isStaff(req.user.role)) return res.status(403).json({ error: 'Staff only' });
  try {
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'Message required' });
    await query("INSERT INTO staff_messages (user_id, message) VALUES ($1,$2)", [req.user.id, message.trim().slice(0,500)]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Fallback to index.html for SPA
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

async function start() {
  try {
    await initDB();
    await seedCards();
    await seedAdmin();
    app.listen(PORT, () => console.log(`Mythical TCG running on http://localhost:${PORT}`));
  } catch (e) {
    console.error('Failed to start:', e);
    process.exit(1);
  }
}

start();
