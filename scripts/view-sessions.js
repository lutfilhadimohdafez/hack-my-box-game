const Database = require('sqlite3').Database;
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database', 'game.db');
const db = new Database(dbPath);

console.log('🔍 CTF Game Database - All Sessions\n');
console.log('=' .repeat(80));

// View all sessions
db.all(`
  SELECT 
    id,
    session_code,
    session_name,
    admin_password,
    status,
    created_at,
    started_at,
    ended_at
  FROM game_sessions 
  ORDER BY created_at DESC
`, (err, sessions) => {
  if (err) {
    console.error('Error fetching sessions:', err);
    return;
  }

  if (sessions.length === 0) {
    console.log('❌ No sessions found in database');
    db.close();
    return;
  }

  console.log(`📊 Found ${sessions.length} session(s):\n`);

  sessions.forEach((session, index) => {
    console.log(`🎮 Session ${index + 1}:`);
    console.log(`   ID: ${session.id}`);
    console.log(`   Code: ${session.session_code}`);
    console.log(`   Name: ${session.session_name}`);
    console.log(`   Admin Password: ${session.admin_password}`);
    console.log(`   Status: ${session.status.toUpperCase()}`);
    console.log(`   Created: ${new Date(session.created_at).toLocaleString()}`);
    console.log(`   Started: ${session.started_at ? new Date(session.started_at).toLocaleString() : 'Not started'}`);
    console.log(`   Ended: ${session.ended_at ? new Date(session.ended_at).toLocaleString() : 'Not ended'}`);
    console.log('   ' + '-'.repeat(60));
  });

  // Also get player counts for each session
  console.log('\n📈 Player Statistics:');
  
  const playerQueries = sessions.map(session => {
    return new Promise((resolve) => {
      db.get(`
        SELECT COUNT(*) as player_count 
        FROM players 
        WHERE session_id = ?
      `, [session.id], (err, result) => {
        if (err) {
          resolve({ sessionCode: session.session_code, playerCount: 'Error' });
        } else {
          resolve({ sessionCode: session.session_code, playerCount: result.player_count });
        }
      });
    });
  });

  Promise.all(playerQueries).then(results => {
    results.forEach(result => {
      console.log(`   ${result.sessionCode}: ${result.playerCount} players`);
    });
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ Database query completed');
    db.close();
  });
});
