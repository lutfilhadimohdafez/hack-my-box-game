const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

// Create database directory if it doesn't exist
const dbDir = path.join(__dirname, '../database');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'game.db');
const db = new sqlite3.Database(dbPath);

console.log('Initializing database...');

db.serialize(() => {
  // Game Sessions table
  db.run(`CREATE TABLE IF NOT EXISTS game_sessions (
    id TEXT PRIMARY KEY,
    session_name TEXT NOT NULL,
    session_code TEXT UNIQUE NOT NULL,
    admin_password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    started_at DATETIME,
    ended_at DATETIME,
    status TEXT DEFAULT 'waiting',
    max_players INTEGER DEFAULT 50,
    settings TEXT DEFAULT '{}'
  )`);

  // Players table
  db.run(`CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    username TEXT NOT NULL,
    socket_id TEXT,
    score INTEGER DEFAULT 0,
    coins INTEGER DEFAULT 100,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    FOREIGN KEY (session_id) REFERENCES game_sessions (id),
    UNIQUE(session_id, username)
  )`);

  // Flags/Challenges table
  db.run(`CREATE TABLE IF NOT EXISTS flags (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    title TEXT NOT NULL,
    clue TEXT NOT NULL,
    answer TEXT NOT NULL,
    hints TEXT DEFAULT '[]',
    difficulty TEXT DEFAULT 'medium',
    points INTEGER DEFAULT 100,
    is_active BOOLEAN DEFAULT true,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES game_sessions (id)
  )`);

  // Player Flag Solutions table
  db.run(`CREATE TABLE IF NOT EXISTS player_solutions (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    flag_id TEXT NOT NULL,
    solved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    attempts INTEGER DEFAULT 1,
    FOREIGN KEY (player_id) REFERENCES players (id),
    FOREIGN KEY (flag_id) REFERENCES flags (id),
    UNIQUE(player_id, flag_id)
  )`);

  // Game Events/Activity Log
  db.run(`CREATE TABLE IF NOT EXISTS game_events (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    player_id TEXT,
    event_type TEXT NOT NULL,
    event_data TEXT DEFAULT '{}',
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES game_sessions (id),
    FOREIGN KEY (player_id) REFERENCES players (id)
  )`);

  // Attacks table
  db.run(`CREATE TABLE IF NOT EXISTS attacks (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    attacker_id TEXT NOT NULL,
    attack_type TEXT NOT NULL,
    target_id TEXT,
    cost INTEGER NOT NULL,
    launched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    duration INTEGER DEFAULT 5000,
    status TEXT DEFAULT 'active',
    FOREIGN KEY (session_id) REFERENCES game_sessions (id),
    FOREIGN KEY (attacker_id) REFERENCES players (id),
    FOREIGN KEY (target_id) REFERENCES players (id)
  )`);

  // Create demo session
  const demoSessionId = 'demo-session-2024';
  const demoCode = 'DEMO2024';
  const adminPassword = bcrypt.hashSync('admin123', 10);

  db.run(`INSERT OR IGNORE INTO game_sessions 
    (id, session_name, session_code, admin_password, status) 
    VALUES (?, ?, ?, ?, ?)`, 
    [demoSessionId, 'Demo CTF Session', demoCode, adminPassword, 'active'], 
    function(err) {
      if (err) {
        console.error('Error creating demo session:', err);
      } else {
        console.log('✅ Demo session created - Code: DEMO2024, Admin Pass: admin123');
      }
    });

  // Insert demo flags
  const demoFlags = [
    {
      id: 'flag1-demo',
      title: 'Social Media Ethics',
      clue: 'Kalau jumpa berita sahih nak buat apa?',
      answer: 'TAPAK_TAJUK',
      hints: JSON.stringify([
        'Think about social media responsibility',
        'What do you do when you find real news?',
        'The answer is about sharing - TAPAK TAJUK'
      ]),
      difficulty: 'easy',
      points: 100
    },
    {
      id: 'flag2-demo',
      title: 'Base64 Decoder',
      clue: 'SGFjayBNeSBCb3g=',
      answer: 'HACK_MY_BOX',
      hints: JSON.stringify([
        'This looks like encoded text',
        'Try base64 decoding',
        'The answer is the decoded text with spaces as underscores'
      ]),
      difficulty: 'medium',
      points: 200
    },
    {
      id: 'flag3-demo',
      title: 'Caesar Cipher',
      clue: 'FDHVDU FLSKHU - shift by 3',
      answer: 'CAESAR_CIPHER',
      hints: JSON.stringify([
        'This is a substitution cipher',
        'Each letter is shifted by a fixed number',
        'Try shifting each letter back by 3 positions'
      ]),
      difficulty: 'medium',
      points: 250
    },
    {
      id: 'flag4-demo',
      title: 'Network Security',
      clue: 'Default port for HTTPS secure web traffic',
      answer: '443',
      hints: JSON.stringify([
        'HTTP uses port 80',
        'HTTPS uses a different port',
        'It\'s a 3-digit number starting with 4'
      ]),
      difficulty: 'easy',
      points: 150
    }
  ];

  demoFlags.forEach(flag => {
    db.run(`INSERT OR IGNORE INTO flags 
      (id, session_id, title, clue, answer, hints, difficulty, points) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [flag.id, demoSessionId, flag.title, flag.clue, flag.answer, flag.hints, flag.difficulty, flag.points]);
  });

  console.log('✅ Demo flags inserted');
});

db.close((err) => {
  if (err) {
    console.error('Error closing database:', err);
  } else {
    console.log('✅ Database initialized successfully!');
    console.log('\n🎮 Game Setup Complete!');
    console.log('📝 Session Code: DEMO2024');
    console.log('🔑 Admin Password: admin123');
    console.log('\n🚀 Run "npm run dev" to start the game!');
  }
});

module.exports = db;