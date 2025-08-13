const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../database/game.db');
const db = new sqlite3.Database(dbPath);

console.log('Cleaning up test sessions...');

db.serialize(() => {
  // Delete all sessions except the demo session
  db.run(`DELETE FROM player_solutions 
           WHERE player_id IN (SELECT id FROM players WHERE session_id != 'demo-session-2024') 
           OR flag_id IN (SELECT id FROM flags WHERE session_id != 'demo-session-2024')`);
  
  db.run(`DELETE FROM game_events WHERE session_id != 'demo-session-2024'`);
  db.run(`DELETE FROM attacks WHERE session_id != 'demo-session-2024'`);
  db.run(`DELETE FROM flags WHERE session_id != 'demo-session-2024'`);
  db.run(`DELETE FROM players WHERE session_id != 'demo-session-2024'`);
  
  db.run(`DELETE FROM game_sessions WHERE id != 'demo-session-2024'`, function(err) {
    if (err) {
      console.error('Error cleaning sessions:', err);
    } else {
      console.log(`✅ Cleaned up ${this.changes} test sessions`);
      console.log('Only demo session remains');
    }
    
    // Verify remaining sessions
    db.all('SELECT id, session_code, session_name FROM game_sessions', (err, rows) => {
      if (err) {
        console.error('Error querying sessions:', err);
      } else {
        console.log('Remaining sessions:');
        rows.forEach(row => {
          console.log(`- ${row.session_code}: ${row.session_name} (${row.id})`);
        });
      }
      db.close();
    });
  });
});
