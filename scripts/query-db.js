const Database = require('sqlite3').Database;
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database', 'game.db');
const db = new Database(dbPath);

console.log('🔍 Database Tables Overview\n');

// Show all tables
db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
  if (err) {
    console.error('Error:', err);
    return;
  }
  
  console.log('📋 Available Tables:');
  tables.forEach(table => {
    console.log(`   - ${table.name}`);
  });
  
  console.log('\n📊 Quick Stats:');
  
  // Count records in each table
  const promises = tables.map(table => {
    return new Promise((resolve) => {
      db.get(`SELECT COUNT(*) as count FROM ${table.name}`, (err, result) => {
        resolve({ table: table.name, count: err ? 'Error' : result.count });
      });
    });
  });
  
  Promise.all(promises).then(results => {
    results.forEach(result => {
      console.log(`   ${result.table}: ${result.count} records`);
    });
    
    console.log('\n🔧 Usage Examples:');
    console.log('   node scripts/view-sessions.js    - View all sessions');
    console.log('   node scripts/query-db.js         - Interactive database queries');
    console.log('   node scripts/view-players.js     - View all players (create this next)');
    
    db.close();
  });
});
