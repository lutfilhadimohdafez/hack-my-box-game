const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const dbPath = path.join(__dirname, '../database/game.db');
const db = new sqlite3.Database(dbPath);

console.log('Creating test session with default flags...');

const testSessionId = uuidv4();
const testCode = 'TEST' + Math.floor(Math.random() * 1000);
const adminPassword = bcrypt.hashSync('test123', 10);

// First create the session
db.run(`INSERT INTO game_sessions 
  (id, session_name, session_code, admin_password, status) 
  VALUES (?, ?, ?, ?, ?)`, 
  [testSessionId, 'Test Session for Testing', testCode, adminPassword, 'waiting'], 
  function(err) {
    if (err) {
      console.error('Error creating test session:', err);
      db.close();
      return;
    }
    
    console.log(`✅ Test session created - Code: ${testCode}, ID: ${testSessionId}`);
    console.log(`📋 Admin Password: test123`);
    
    // Now add default flags from template_flags table
    db.all('SELECT * FROM template_flags WHERE is_active = 1', (err, templateFlags) => {
      if (err) {
        console.error('Error getting template flags:', err);
        db.close();
        return;
      }
      
      if (templateFlags.length === 0) {
        console.log('⚠️ No template flags found. Session created without challenges.');
        db.close();
        return;
      }
      
      let flagsAdded = 0;
      templateFlags.forEach((templateFlag, index) => {
        const flagId = `${testSessionId}-flag-${index + 1}`;
        
        db.run(`INSERT INTO flags 
          (id, session_id, title, clue, answer, hints, difficulty, points, is_active) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [flagId, testSessionId, templateFlag.title, templateFlag.clue, 
           templateFlag.answer, templateFlag.hints, templateFlag.difficulty, templateFlag.points],
          function(flagErr) {
            if (flagErr) {
              console.error('Error adding flag:', flagErr);
            } else {
              flagsAdded++;
            }
            
            // Check if all flags are added
            if (flagsAdded === templateFlags.length) {
              console.log(`✅ Added ${flagsAdded} default challenges to the session`);
              console.log('Session is ready for testing with waiting state and challenges!');
              db.close();
            }
          });
      });
    });
  });
