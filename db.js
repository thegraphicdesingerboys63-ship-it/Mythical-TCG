require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function query(text, params) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

async function initDB() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(20) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role VARCHAR(20) DEFAULT 'user',
      created_at TIMESTAMP DEFAULT NOW(),
      banned BOOLEAN DEFAULT false,
      ban_reason TEXT,
      avatar_color VARCHAR(20) DEFAULT '#c0392b',
      bio TEXT DEFAULT '',
      coins INTEGER DEFAULT 200,
      last_daily TIMESTAMP
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY,
      name VARCHAR(120) UNIQUE NOT NULL,
      type VARCHAR(20),
      class VARCHAR(20),
      hp INTEGER,
      atk INTEGER,
      def INTEGER,
      spd INTEGER,
      ability_name VARCHAR(100),
      ability_desc TEXT,
      ability_power INTEGER,
      retreat_cost INTEGER,
      weakness VARCHAR(20),
      resistance VARCHAR(20),
      rarity VARCHAR(20),
      is_parallel BOOLEAN DEFAULT false,
      is_numbered BOOLEAN DEFAULT false,
      card_number VARCHAR(20),
      print_run INTEGER,
      set_name VARCHAR(50),
      flavor_text TEXT,
      art_style VARCHAR(20)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS user_cards (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      card_id INTEGER REFERENCES cards(id),
      quantity INTEGER DEFAULT 1,
      obtained_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, card_id)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS friends (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      friend_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, friend_id)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS matches (
      id SERIAL PRIMARY KEY,
      player1_id INTEGER REFERENCES users(id),
      player2_id INTEGER,
      winner_id INTEGER,
      p1_hp_left INTEGER DEFAULT 0,
      p2_hp_left INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      match_log JSONB DEFAULT '[]'
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS reports (
      id SERIAL PRIMARY KEY,
      reporter_id INTEGER REFERENCES users(id),
      reported_user_id INTEGER REFERENCES users(id),
      category VARCHAR(30),
      description TEXT,
      status VARCHAR(20) DEFAULT 'open',
      created_at TIMESTAMP DEFAULT NOW(),
      handled_by INTEGER REFERENCES users(id),
      handler_notes TEXT
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      theme VARCHAR(20) DEFAULT 'default',
      show_collection BOOLEAN DEFAULT true,
      show_rank BOOLEAN DEFAULT true,
      notifications BOOLEAN DEFAULT true,
      privacy_level VARCHAR(20) DEFAULT 'public'
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ranked_stats (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      wins INTEGER DEFAULT 0,
      losses INTEGER DEFAULT 0,
      rating INTEGER DEFAULT 1000,
      season_wins INTEGER DEFAULT 0,
      season_losses INTEGER DEFAULT 0,
      rank_title VARCHAR(30) DEFAULT 'Bronze',
      top500 BOOLEAN DEFAULT false
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(40) NOT NULL,
      message TEXT NOT NULL,
      from_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      read BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS admin_logs (
      id SERIAL PRIMARY KEY,
      admin_id INTEGER REFERENCES users(id),
      action VARCHAR(100),
      target_user_id INTEGER,
      details TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS announcements (
      id SERIAL PRIMARY KEY,
      author_id INTEGER REFERENCES users(id),
      title VARCHAR(200),
      body TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS news (
      id SERIAL PRIMARY KEY,
      author_id INTEGER REFERENCES users(id),
      title VARCHAR(200),
      body TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      last_seen TIMESTAMP DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS game_config (
      key VARCHAR(100) PRIMARY KEY,
      value TEXT,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS conquest_progress (
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      chapter_id INTEGER NOT NULL,
      stage_id INTEGER NOT NULL,
      completed_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (user_id, chapter_id, stage_id)
    )
  `);
}

const TYPES = ['Fire','Water','Earth','Air','Shadow','Light','Thunder','Ice','Poison','Psychic','Nature','Metal','Dragon','Cosmic','Void','Crystal','Blood','Spirit','Chaos','Dream'];
const CLASSES = ['Beast','Dragon','Golem','Sprite','Demon','Angel','Undead','Elemental','Construct','Titan'];
const STARTS = ['Vol','Kry','Thex','Mor','Aeg','Bael','Cyr','Drak','Eln','Fyr','Geth','Hav','Ith','Jor','Kael','Lyr','Myx','Nyl','Oryn','Pyx','Qua','Riv','Syl','Tyr','Ux','Vex','Wyr','Xen','Ysh','Zor','Arc','Brim','Cor','Den','Eth','Fin','Gal','Hel','Irk','Jev','Kel','Lom','Mak','Nox','Onk','Par','Ren','Sol','Tan','Uri','Vel','Wen','Xar','Ynd','Zel','Ash','Bel','Ceth','Dor','Elv'];
const ENDS = ['thrax','vore','ryn','keth','mus','lux','dra','gon','rix','tus','nyx','mor','zel','phos','cyn','thul','vax','rak','syl','don','lor','fen','crus','thar','nox','vel','kris','phen','zar','loth','wyn','fur','mar','kin','set','bane','forge','claw','fang','wing','maw','rend','surge','bloom','tide','flare','crush','void','pulse','echo','rift','shade','glow','storm','frost','blaze','quake','dart','spike','coil','wraith','herald','keeper','warden','hunter','seeker','weaver','singer','dancer','walker','runner','leaper','diver','striker','guard','sentinel','champion','titan','colossus','behemoth','wyrm','hydra','golem','revenant','specter','phantom','banshee','demon','seraph','djinn','naga','sphinx','basilisk','chimera','manticore','kraken','leviathan','roc','wyvern','cockatrice','griffon','kirin','tengu','oni','raiju','baku','kitsune','tanuki','inari','orochi','raijin','fujin','susanoo','ebisu','bishamon','daikoku','hotei','jurojin','toshi','hebi','tatsu','hitsuji','ne','usagi','inu','tori','moku','sui','do','tsuchi','kaze','yama','kawa','umi','sora','hoshi','tsuki','yoru','asa','kage','hikari','abyss','ember','glacius','thornback','obsidian','prisma','venom','mirage','thunder','zephyr','terra','lumis','umbra','corona','nexus','fractal','hollow','tempest','cascade','verdant'];
const ABILITIES = [
  ['Ember Strike',40,'A quick burst of flame that scorches the target'],
  ['Inferno Blast',90,'Unleashes a roaring wall of fire'],
  ['Volcanic Surge',120,'Erupts with the fury of a volcano'],
  ['Scorching Fang',70,'Bites down with searing heat'],
  ['Ash Cloud',45,'Blinds the target with choking ash'],
  ['Magma Slam',100,'Crashes into the foe like falling lava'],
  ['Flame Coil',60,'Wraps the foe in burning coils'],
  ['Cinder Burst',80,'Pelts the target with burning cinders'],
  ['Tidal Crash',90,'A crushing wave of oceanic force'],
  ['Deep Surge',110,'Draws power from the darkest ocean depths'],
  ['Whirlpool Fang',65,'Bites while spinning in a vortex of water'],
  ['Frost Tide',75,'A wave that freezes on contact'],
  ['Rain Hammer',85,'Drives down like a thunderstorm'],
  ['Bubble Barrage',50,'Fires rapid-fire bubbles at high pressure'],
  ['Rock Slam',80,'Brings down a massive chunk of earth'],
  ['Seismic Drive',110,'Channels quake energy into a single strike'],
  ['Thorn Crush',55,'Pierces through tough defenses'],
  ['Mudslide',70,'Engulfs the foe in a torrent of earth'],
  ['Gust Slash',45,'Cuts with razor-sharp air'],
  ['Cyclone Fist',95,'Spins and delivers a whirling blow'],
  ['Tempest Wing',75,'Beats wings with hurricane force'],
  ['Vacuum Cut',65,'Slices with a blade of compressed air'],
  ['Shadow Claw',70,'Rakes with claws made of pure darkness'],
  ['Void Drain',80,'Siphons life force into the void'],
  ['Dark Matter',105,'Unleashes condensed darkness'],
  ['Soul Rend',90,'Tears at the target\'s spirit'],
  ['Radiant Burst',85,'Explodes with blinding holy light'],
  ['Solar Beam',115,'Channels concentrated sunlight'],
  ['Flash Strike',60,'A blinding attack at the speed of light'],
  ['Holy Smite',95,'Delivers a righteous blow of light energy'],
  ['Thunder Crack',90,'Releases a deafening thunderclap'],
  ['Lightning Fang',80,'Bites with the speed of lightning'],
  ['Static Pulse',55,'Sends jolts through the air'],
  ['Arc Discharge',110,'Fires a concentrated arc of electricity'],
  ['Blizzard Slash',85,'Cuts with frozen wind'],
  ['Glacial Slam',100,'Brings down a block of ancient ice'],
  ['Frost Bite',70,'Bites deep with freezing cold'],
  ['Ice Shard Volley',75,'Fires a barrage of razor ice shards'],
  ['Poison Fang',65,'Injects venom with a precise bite'],
  ['Venom Spray',80,'Coats the target in toxic liquid'],
  ['Toxic Surge',95,'Releases a wave of concentrated poison'],
  ['Corrosive Spit',70,'Spits acid that eats through armor'],
  ['Mind Crush',85,'Psychic pressure crushes the target\'s thoughts'],
  ['Psi Blast',100,'Fires a bolt of pure psychic energy'],
  ['Telekinetic Slam',110,'Hurls the target with telekinesis'],
  ['Neural Shock',75,'Overloads the target\'s nervous system'],
  ['Vine Whip',50,'Lashes out with thorned vines'],
  ['Nature\'s Wrath',95,'Channels the fury of the wild'],
  ['Spore Cloud',60,'Releases a cloud of toxic spores'],
  ['Root Crush',80,'Constricts with grasping roots'],
  ['Iron Slam',90,'Delivers a crushing blow of solid metal'],
  ['Steel Fang',75,'Bites with teeth like tempered steel'],
  ['Magnetic Pulse',85,'Emits a disruptive magnetic burst'],
  ['Metal Storm',115,'Hurls shards of razor-sharp metal'],
  ['Dragon Claw',95,'Rakes with legendary dragon claws'],
  ['Draconic Fire',120,'Breathes the fire of an ancient dragon'],
  ['Dragon Pulse',100,'Releases a wave of dragon energy'],
  ['Wyrmfang',110,'Bites with the force of a great wyrm'],
  ['Star Crash',120,'Calls down the force of a dying star'],
  ['Cosmic Ray',95,'Fires beams of cosmic radiation'],
  ['Nebula Wave',85,'Sends ripples through the fabric of space'],
  ['Gravity Crush',110,'Intensifies local gravity to crush the target'],
  ['Void Collapse',130,'Implodes space around the target'],
  ['Null Beam',100,'Fires a beam that negates energy'],
  ['Entropy Wave',115,'Accelerates decay in everything it touches'],
  ['Abyss Pull',90,'Drags the target toward the void'],
  ['Crystal Lance',85,'Fires a spear of razor crystal'],
  ['Prism Burst',95,'Refracts energy into a blinding blast'],
  ['Crystalline Edge',75,'Cuts with a blade grown from pure crystal'],
  ['Shard Storm',110,'Creates a blizzard of crystal fragments'],
  ['Blood Surge',90,'Channels vital force into a devastating strike'],
  ['Crimson Fang',80,'Bites and drains the target\'s strength'],
  ['Hemorrhage',100,'Causes internal damage that lingers'],
  ['Life Drain',85,'Absorbs the target\'s life energy'],
  ['Spirit Wave',70,'Sends a wave of spiritual energy'],
  ['Soul Strike',90,'Hits the spirit directly, bypassing armor'],
  ['Ethereal Slash',80,'Cuts with a blade of pure spirit'],
  ['Phantom Rush',85,'Rushes through the target like a ghost'],
  ['Chaos Burst',120,'Releases unstable chaotic energy'],
  ['Entropy Strike',110,'Strikes with the force of disorder'],
  ['Mayhem Wave',100,'Sends out a wave of chaotic destruction'],
  ['Discord Pulse',90,'Disrupts all order in the target\'s body'],
  ['Dream Veil',65,'Wraps the target in a numbing dream'],
  ['Nightmare Surge',100,'Draws power from endless nightmares'],
  ['Somnolent Strike',80,'Puts the target to sleep with the blow'],
  ['Phantasm Wave',90,'A wave that confuses and disorients'],
  ['Feral Bite',60,'A savage, unrestrained bite'],
  ['Reckless Charge',85,'Throws all caution aside to charge'],
  ['Berserker Slash',95,'Attacks in a wild, uncontrolled fury'],
  ['Battle Roar',75,'A roar that channels pure fighting spirit'],
  ['Titan Crush',130,'The legendary crushing force of a titan'],
  ['Colossus Strike',125,'A strike with the power of a colossus'],
  ['Behemoth Slam',120,'The raw force of a primordial behemoth'],
  ['Undead Grasp',70,'Grabs with the cold grip of the undead'],
  ['Revenant Strike',85,'Strikes with the vengeance of the fallen'],
  ['Spectral Claw',75,'Rakes with ghostly claws'],
  ['Wraith Touch',80,'A touch that chills to the bone'],
  ['Golem Fist',100,'A punch with the force of stone'],
  ['Construct Beam',90,'Fires a concentrated energy beam'],
  ['Mechanical Slam',95,'A powerful mechanical strike'],
  ['Sprite Dart',40,'A quick dart of fey energy'],
  ['Fey Blast',70,'A burst of unpredictable fey magic'],
  ['Fairy Ring',60,'Traps the target in a circle of fey power'],
  ['Seraphic Smite',115,'A divine strike from an angelic being'],
  ['Heavenly Beam',110,'Calls down a beam from the heavens'],
  ['Djinn Surge',100,'Releases the bottled power of a djinn'],
  ['Demon Claw',95,'Tears with claws born of hellfire'],
  ['Basilisk Gaze',85,'A gaze that petrifies with fear'],
  ['Chimera Breath',105,'Breathes a mixture of fire, poison, and ice'],
  ['Manticore Sting',90,'Stings with a venom-tipped tail'],
  ['Kraken Grab',115,'Wraps in crushing tentacles'],
  ['Phoenix Flame',110,'Burns with the sacred fire of rebirth'],
  ['Leviathan Wave',125,'Calls down the wrath of the sea serpent'],
  ['Hydra Fang',100,'Bites with one of many heads simultaneously'],
  ['Wyrm Breath',120,'Breathes the ancient power of a great wyrm'],
  ['Sphinx Riddle',75,'Confounds the target with impossible power'],
  ['Griffon Dive',95,'Swoops down at incredible speed'],
  ['Kirin Bolt',100,'Channels the power of the sacred kirin']
];
const WEAKNESS_MAP = {Fire:'Water',Water:'Thunder',Earth:'Nature',Air:'Ice',Shadow:'Light',Light:'Shadow',Thunder:'Earth',Ice:'Fire',Poison:'Psychic',Psychic:'Void',Nature:'Poison',Metal:'Fire',Dragon:'Ice',Cosmic:'Void',Void:'Light',Crystal:'Metal',Blood:'Nature',Spirit:'Chaos',Chaos:'Psychic',Dream:'Shadow'};
const RESISTANCE_MAP = {Fire:'Nature',Water:'Fire',Earth:'Metal',Air:'Earth',Shadow:'Psychic',Light:'Chaos',Thunder:'Air',Ice:'Water',Poison:'Nature',Psychic:'Dream',Nature:'Water',Metal:'Ice',Dragon:'Fire',Cosmic:'Psychic',Void:'Shadow',Crystal:'Water',Blood:'Metal',Spirit:'Shadow',Chaos:'Dream',Dream:'Light'};
const FLAVORS = [
  'Said to have been born in the heart of a dying star.',
  'Ancient texts describe its roar as the sound of creation.',
  'No one who has seen its true form has ever returned.',
  'It wanders the furthest reaches of the known world alone.',
  'Scholars argue whether it is creature or force of nature.',
  'Its footsteps leave marks that last for centuries.',
  'Believed to have existed before the first continent formed.',
  'Its eyes reflect every world it has witnessed.',
  'Those who seek it never find it - it finds them.',
  'Even the mightiest creatures give way when it approaches.',
  'It has slept for a thousand years and is only now stirring.',
  'Its voice can reshape the landscape around it.',
  'Found only where two elemental forces collide.',
  'Its shadow is darker than the deepest cave.',
  'It has no memory of its own origin, and neither does anyone else.',
  'Travelers report hearing its call from impossible distances.',
  'It does not hunt. It simply exists, and things come to it.',
  'Its passage changes the weather for weeks afterward.',
  'It has been known to appear during pivotal moments in history.',
  'What it desires, no one can say. What it is capable of, all know.'
];
const ART_STYLES = ['sketch','ink','watercolor','charcoal','pencil','crosshatch'];
const SET_NAMES = ['Primordial Dawn','Shattered Realms','Void Ascension','Mythic Origins','Celestial Storm','Ancient Reckoning','Chaos Eternal','Twilight Dominion','Abyssal Surge','Crystal Epoch','Spectral Rift','Iron Legacy','Dream Woven','Blood Covenant','Spirit Unleashed','Titan\'s Wrath','Elemental War','Shadow Protocol','Light Absolute','Dragon Heritage'];

function getRarity(i) {
  const v = (i * 7 + 13) % 1000;
  if (v < 400) return 'Common';
  if (v < 650) return 'Uncommon';
  if (v < 800) return 'Rare';
  if (v < 880) return 'Ultra_Rare';
  if (v < 920) return 'Secret_Rare';
  if (v < 950) return 'Full_Art';
  if (v < 970) return 'Parallel';
  if (v < 990) return 'Numbered';
  if (v < 997) return 'Prism';
  return 'Mythic';
}

function getStats(rarity, i) {
  const tier = ['Common','Uncommon','Rare','Ultra_Rare','Secret_Rare','Full_Art','Parallel','Numbered','Prism','Mythic'].indexOf(rarity);
  const base = 40 + tier * 25;
  const spread = 30 + tier * 10;
  const hp = base + ((i * 11) % spread) + (tier * 20);
  const atk = 20 + tier * 8 + ((i * 13) % 25);
  const def = 10 + tier * 6 + ((i * 17) % 20);
  const spd = 10 + tier * 5 + ((i * 19) % 25);
  return { hp: Math.min(hp, 300), atk: Math.min(atk, 130), def: Math.min(def, 100), spd: Math.min(spd, 100) };
}

function generateCard(i) {
  const startIdx = Math.floor(i / ENDS.length);
  const endIdx = i % ENDS.length;
  const name = STARTS[startIdx] + ENDS[endIdx];
  const type = TYPES[i % TYPES.length];
  const cls = CLASSES[i % CLASSES.length];
  const rarity = getRarity(i);
  const stats = getStats(rarity, i);
  const ability = ABILITIES[i % ABILITIES.length];
  const isParallel = rarity === 'Parallel';
  const isNumbered = rarity === 'Numbered';
  const printRun = isNumbered ? 100 : null;
  const cardNumSeq = isNumbered ? String((i % 100) + 1).padStart(4,'0') + '/0100' : String(i+1).padStart(5,'0') + '/10500';
  const setIdx = Math.floor(i / (Math.ceil(10500 / SET_NAMES.length)));
  const setName = SET_NAMES[setIdx % SET_NAMES.length];
  const flavor = FLAVORS[i % FLAVORS.length];
  const artStyle = ART_STYLES[i % ART_STYLES.length];
  const retreat = 1 + (i % 4);
  return [
    i + 1, name, type, cls, stats.hp, stats.atk, stats.def, stats.spd,
    ability[0], ability[2], ability[1], retreat,
    WEAKNESS_MAP[type], RESISTANCE_MAP[type],
    rarity, isParallel, isNumbered, cardNumSeq, printRun, setName, flavor, artStyle
  ];
}

async function seedCards() {
  const existing = await query('SELECT COUNT(*) FROM cards');
  if (parseInt(existing.rows[0].count) > 0) return;
  console.log('Seeding 10,500 cards...');
  const BATCH = 50;
  for (let batch = 0; batch < Math.ceil(10500 / BATCH); batch++) {
    const values = [];
    const params = [];
    let paramIdx = 1;
    for (let j = 0; j < BATCH; j++) {
      const i = batch * BATCH + j;
      if (i >= 10500) break;
      const card = generateCard(i);
      values.push(`($${paramIdx},$${paramIdx+1},$${paramIdx+2},$${paramIdx+3},$${paramIdx+4},$${paramIdx+5},$${paramIdx+6},$${paramIdx+7},$${paramIdx+8},$${paramIdx+9},$${paramIdx+10},$${paramIdx+11},$${paramIdx+12},$${paramIdx+13},$${paramIdx+14},$${paramIdx+15},$${paramIdx+16},$${paramIdx+17},$${paramIdx+18},$${paramIdx+19},$${paramIdx+20},$${paramIdx+21})`);
      params.push(...card);
      paramIdx += 22;
    }
    if (values.length === 0) break;
    await query(`INSERT INTO cards (id,name,type,class,hp,atk,def,spd,ability_name,ability_desc,ability_power,retreat_cost,weakness,resistance,rarity,is_parallel,is_numbered,card_number,print_run,set_name,flavor_text,art_style) VALUES ${values.join(',')} ON CONFLICT DO NOTHING`, params);
    if (batch % 20 === 0) console.log(`  Inserted batch ${batch+1}/${Math.ceil(10500/BATCH)}`);
  }
  console.log('Cards seeded.');
}

async function seedAdmin() {
  const bcrypt = require('bcryptjs');
  // Remove old dev account if it exists
  await query("DELETE FROM users WHERE username = 'AMGProdZ'");
  // Create new dev account only if it doesn't exist
  const existing = await query("SELECT id FROM users WHERE username = 'AMGProdZ27'");
  if (existing.rows.length > 0) return;
  const hash = await bcrypt.hash('20261248', 12);
  const res = await query(
    "INSERT INTO users (username, password_hash, role, coins) VALUES ($1, $2, $3, $4) RETURNING id",
    ['AMGProdZ27', hash, 'developer', 1000]
  );
  const uid = res.rows[0].id;
  await query('INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [uid]);
  await query('INSERT INTO ranked_stats (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [uid]);
  console.log('Developer account AMGProdZ27 created.');
}

module.exports = { pool, query, initDB, seedCards, seedAdmin, TYPES, CLASSES, ABILITIES, STARTS, ENDS };
