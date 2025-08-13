const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../database/game.db');
const db = new sqlite3.Database(dbPath);

console.log('Checking template flags...');

db.all('SELECT * FROM template_flags', (err, rows) => {
  if (err) {
    console.error('Error querying template flags:', err);
  } else {
    console.log(`Found ${rows.length} template flags:`);
    rows.forEach(flag => {
      console.log(`- ${flag.title} (${flag.difficulty}, ${flag.points} pts)`);
    });
    
    if (rows.length === 0) {
      console.log('\n⚠️ No template flags found. Creating basic template flags...');
      
      const defaultFlags = [
        {
          title: 'Welcome Challenge',
          clue: 'What is the common greeting in CTF?',
          answer: 'FLAG{HELLO_WORLD}',
          hints: JSON.stringify(['Think about programming', 'First program output', 'FLAG{HELLO_WORLD}']),
          difficulty: 'easy',
          points: 100
        },
        {
          title: 'Base64 Decode',
          clue: 'RkxBR3tCQVNFNjRfSVNfRUFTWX0=',
          answer: 'FLAG{BASE64_IS_EASY}',
          hints: JSON.stringify(['This looks like base64', 'Use base64 decoder', 'FLAG{BASE64_IS_EASY}']),
          difficulty: 'easy',
          points: 150
        },
        {
          title: 'Simple Math',
          clue: 'What is 42 * 2 + 16? Format: FLAG{answer}',
          answer: 'FLAG{100}',
          hints: JSON.stringify(['Calculate step by step', '42 * 2 = 84', '84 + 16 = 100']),
          difficulty: 'easy',
          points: 200
        }
      ];
      
      let added = 0;
      defaultFlags.forEach((flag, index) => {
        const flagId = `template-${Date.now()}-${index}`;
        
        db.run(`INSERT INTO template_flags 
          (id, title, clue, answer, hints, difficulty, points, is_active) 
          VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
          [flagId, flag.title, flag.clue, flag.answer, flag.hints, flag.difficulty, flag.points],
          function(err) {
            if (err) {
              console.error('Error adding template flag:', err);
            } else {
              added++;
              console.log(`✅ Added: ${flag.title}`);
            }
            
            if (added === defaultFlags.length) {
              console.log(`\n✅ Created ${added} template flags. Now you can create test sessions with challenges!`);
              db.close();
            }
          });
      });
    } else {
      db.close();
    }
  }
});
