const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const dbPath = path.join(__dirname, '../database/game.db');
const db = new sqlite3.Database(dbPath);

console.log('Creating test session for deletion testing...');

const testSessionId = uuidv4();
const testCode = 'TEST' + Math.floor(Math.random() * 1000);
const adminPassword = bcrypt.hashSync('test123', 10);

db.run(`INSERT INTO game_sessions 
  (id, session_name, session_code, admin_password, status) 
  VALUES (?, ?, ?, ?, ?)`, 
  [testSessionId, 'Test Session for Deletion', testCode, adminPassword, 'waiting'], 
  function(err) {
    if (err) {
      console.error('Error creating test session:', err);
    } else {
      console.log(`✅ Test session created - Code: ${testCode}, ID: ${testSessionId}`);
      console.log('You can now test deleting this session to verify auto-refresh works');
    }
    db.close();
  });
