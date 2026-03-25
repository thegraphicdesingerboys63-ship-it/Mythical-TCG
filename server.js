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
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role, coins: user.coins, avatar_color: user.avatar_color, bio: user.bio } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/me', auth, async (req, res) => {
  try {
    const result = await query('SELECT id, username, role, coins, avatar_color, bio, created_at, banned FROM users WHERE id = $1', [req.user.id]);
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
    const userRes = await query('SELECT coins FROM users WHERE id = $1', [req.user.id]);
    if (userRes.rows[0].coins < 100) return res.status(400).json({ error: 'Not enough coins (need 100)' });
    await query('UPDATE users SET coins = coins - 100 WHERE id = $1', [req.user.id]);
    const pulled = [];
    for (let i = 0; i < 5; i++) {
      const rarityRoll = Math.random() * 100;
      let rarityFilter = "'Common'";
      if (rarityRoll < 0.5) rarityFilter = "'Mythic','Prism'";
      else if (rarityRoll < 2) rarityFilter = "'Numbered','Full_Art'";
      else if (rarityRoll < 6) rarityFilter = "'Ultra_Rare','Secret_Rare','Parallel'";
      else if (rarityRoll < 20) rarityFilter = "'Rare'";
      else if (rarityRoll < 45) rarityFilter = "'Uncommon'";
      const card = await query(`SELECT * FROM cards WHERE rarity IN (${rarityFilter}) ORDER BY RANDOM() LIMIT 1`);
      if (card.rows.length) {
        const c = card.rows[0];
        await query('INSERT INTO user_cards (user_id, card_id) VALUES ($1,$2) ON CONFLICT (user_id, card_id) DO UPDATE SET quantity = user_cards.quantity + 1', [req.user.id, c.id]);
        pulled.push(c);
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
        u.username, u.avatar_color, u.role,
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
      SELECT u.id, u.username, u.avatar_color, rs.wins, rs.losses, rs.rating, rs.rank_title, rs.top500
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
      `SELECT n.*, u.username as from_username, u.avatar_color as from_avatar
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
    // Pick 5 random cards from user's collection; fall back to random DB cards if < 5
    let colRes = await query(
      'SELECT c.* FROM user_cards uc JOIN cards c ON c.id=uc.card_id WHERE uc.user_id=$1 ORDER BY RANDOM() LIMIT 5',
      [req.user.id]
    );
    let playerPool = colRes.rows;
    if (playerPool.length < 5) {
      const extras = await query(
        "SELECT * FROM cards WHERE rarity IN ('Common','Uncommon') ORDER BY RANDOM() LIMIT $1",
        [5 - playerPool.length]
      );
      playerPool = [...playerPool, ...extras.rows];
    }
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
    // ELO
    const statsRes = await query('SELECT rating FROM ranked_stats WHERE user_id=$1', [userId]);
    const myRating = statsRes.rows[0]?.rating || 1000;
    const K = 32;
    const expected = 1 / (1 + Math.pow(10, (1000 - myRating) / 400));
    const newRating = Math.max(100, Math.round(myRating + K * ((won ? 1 : 0) - expected)));
    const title = rankTitle(newRating);
    await query(
      'UPDATE ranked_stats SET rating=$1, rank_title=$2, wins=wins+$3, losses=losses+$4, season_wins=season_wins+$3, season_losses=season_losses+$4 WHERE user_id=$5',
      [newRating, title, won ? 1 : 0, won ? 0 : 1, userId]
    );
    const pos = await query('SELECT COUNT(*) FROM ranked_stats WHERE rating > $1', [newRating]);
    await query('UPDATE ranked_stats SET top500=$1 WHERE user_id=$2', [parseInt(pos.rows[0].count) < 500, userId]);
    if (won) await query('UPDATE users SET coins = coins + 30 WHERE id=$1', [userId]);
    battle.ratingResult = { newRating, title, coinsEarned: won ? 30 : 0 };
  } catch {}
}

// ─── REPORTS ROUTES ──────────────────────────────────────────────
app.post('/api/reports', auth, async (req, res) => {
  try {
    const { reported_username, category, description } = req.body;
    if (!reported_username || !category || !description) return res.status(400).json({ error: 'All fields required' });
    const target = await query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [reported_username]);
    if (!target.rows.length) return res.status(404).json({ error: 'User not found' });
    await query('INSERT INTO reports (reporter_id, reported_user_id, category, description) VALUES ($1,$2,$3,$4)',
      [req.user.id, target.rows[0].id, category, description]);
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
    let sql = 'SELECT id, username, role, coins, banned, ban_reason, created_at FROM users';
    const params = [];
    if (q) { sql += ' WHERE username ILIKE $1'; params.push('%' + q + '%'); }
    sql += ' ORDER BY created_at DESC LIMIT 100';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/users/:id/ban', auth, requireRole('mod'), async (req, res) => {
  try {
    const { reason } = req.body;
    const target = await query('SELECT username, role FROM users WHERE id=$1', [req.params.id]);
    if (!target.rows.length) return res.status(404).json({ error: 'User not found' });
    const t = target.rows[0];
    if (ROLE_ORDER.indexOf(t.role) >= ROLE_ORDER.indexOf(req.user.role))
      return res.status(403).json({ error: 'Cannot ban a user with equal or higher role' });
    await query('UPDATE users SET banned=true, ban_reason=$1 WHERE id=$2', [reason || 'No reason', req.params.id]);
    await logAction(req.user.id, 'BAN', req.params.id, reason);
    res.json({ message: 'User banned' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/users/:id/unban', auth, requireRole('mod'), async (req, res) => {
  try {
    await query('UPDATE users SET banned=false, ban_reason=NULL WHERE id=$1', [req.params.id]);
    await logAction(req.user.id, 'UNBAN', req.params.id, '');
    res.json({ message: 'User unbanned' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/users/:id/role', auth, requireRole('admin'), async (req, res) => {
  try {
    const { role } = req.body;
    const validRoles = { admin: ['mod'], headofstaff: ['mod','admin'], owner: ['mod','admin','headofstaff'], developer: ['mod','admin','headofstaff','owner','developer'] };
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
    const { amount } = req.body;
    await query('UPDATE users SET coins = coins + $1 WHERE id=$2', [amount, req.params.id]);
    await logAction(req.user.id, 'COINS:' + amount, req.params.id, '');
    res.json({ message: 'Coins updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/users/:id/cards/add', auth, requireRole('owner'), async (req, res) => {
  try {
    const { card_id } = req.body;
    await query('INSERT INTO user_cards (user_id, card_id) VALUES ($1,$2) ON CONFLICT (user_id, card_id) DO UPDATE SET quantity = user_cards.quantity + 1', [req.params.id, card_id]);
    await logAction(req.user.id, 'ADD_CARD:' + card_id, req.params.id, '');
    res.json({ message: 'Card added' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/users/:id', auth, requireRole('owner'), async (req, res) => {
  try {
    const target = await query('SELECT role FROM users WHERE id=$1', [req.params.id]);
    if (!target.rows.length) return res.status(404).json({ error: 'User not found' });
    if (ROLE_ORDER.indexOf(target.rows[0].role) >= ROLE_ORDER.indexOf(req.user.role))
      return res.status(403).json({ error: 'Cannot delete user with equal or higher role' });
    await query('DELETE FROM users WHERE id=$1', [req.params.id]);
    await logAction(req.user.id, 'DELETE_USER', req.params.id, '');
    res.json({ message: 'User deleted' });
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
    const { name, type, hp, atk, def, spd } = req.body;
    const maxId = await query('SELECT MAX(id) FROM cards');
    const newId = (maxId.rows[0].max || 10500) + 1;
    await query('INSERT INTO cards (id,name,type,class,hp,atk,def,spd,ability_name,ability_desc,ability_power,retreat_cost,weakness,resistance,rarity,set_name,flavor_text,art_style,card_number) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)',
      [newId, name, type, 'Titan', hp||200, atk||100, def||80, spd||80, 'Promo Ability', 'A legendary promo card.', 130, 1, 'None', 'None', 'Mythic', 'Promo Series', 'A special promotional creature.', 'ink', `PROMO-${newId}`]);
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
