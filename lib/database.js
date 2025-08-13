const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

class DatabaseManager {
  constructor() {
    const dbPath = path.join(__dirname, '../database/game.db');
    this.db = new sqlite3.Database(dbPath);
  }

  // Session Management
  async getSession(sessionCode) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM game_sessions WHERE session_code = ? AND status IN ("waiting", "active")',
        [sessionCode.toUpperCase()],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  async createSession(sessionName, sessionCode, adminPassword, maxPlayers = 50) {
    return new Promise((resolve, reject) => {
      const sessionId = uuidv4();
      const hashedPassword = bcrypt.hashSync(adminPassword, 10);
      
      this.db.run(
        `INSERT INTO game_sessions 
         (id, session_name, session_code, admin_password, max_players) 
         VALUES (?, ?, ?, ?, ?)`,
        [sessionId, sessionName, sessionCode.toUpperCase(), hashedPassword, maxPlayers],
        function(err) {
          if (err) reject(err);
          else resolve({ sessionId, sessionCode: sessionCode.toUpperCase() });
        }
      );
    });
  }

  async verifyAdminPassword(sessionCode, password) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT admin_password FROM game_sessions WHERE session_code = ?',
        [sessionCode.toUpperCase()],
        (err, row) => {
          if (err) reject(err);
          else if (!row) resolve(false);
          else resolve(bcrypt.compareSync(password, row.admin_password));
        }
      );
    });
  }

  async updateSessionStatus(sessionCode, status) {
    return new Promise((resolve, reject) => {
      const timestamp = status === 'active' ? new Date().toISOString() : null;
      const field = status === 'active' ? 'started_at' : 'ended_at';
      
      this.db.run(
        `UPDATE game_sessions SET status = ?, ${field} = ? WHERE session_code = ?`,
        [status, timestamp, sessionCode.toUpperCase()],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes > 0);
        }
      );
    });
  }

  // Player Management
  async addPlayer(sessionId, username, socketId) {
    return new Promise((resolve, reject) => {
      const playerId = uuidv4();
      
      this.db.run(
        `INSERT INTO players (id, session_id, username, socket_id) 
         VALUES (?, ?, ?, ?)`,
        [playerId, sessionId, username, socketId],
        function(err) {
          if (err) reject(err);
          else resolve(playerId);
        }
      );
    });
  }

  async getPlayer(playerId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM players WHERE id = ?',
        [playerId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  async updatePlayerSocket(playerId, socketId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE players SET socket_id = ?, last_activity = CURRENT_TIMESTAMP WHERE id = ?',
        [socketId, playerId],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes > 0);
        }
      );
    });
  }

  async updatePlayerScore(playerId, scoreChange, coinChange = 0) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE players SET score = score + ?, coins = coins + ?, last_activity = CURRENT_TIMESTAMP WHERE id = ?',
        [scoreChange, coinChange, playerId],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes > 0);
        }
      );
    });
  }

  async getSessionPlayers(sessionId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM players WHERE session_id = ? ORDER BY score DESC, joined_at ASC',
        [sessionId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  // Flag Management
  async addFlag(sessionId, title, clue, answer, hints = [], difficulty = 'medium', points = 100) {
    return new Promise((resolve, reject) => {
      const flagId = uuidv4();
      
      this.db.run(
        `INSERT INTO flags (id, session_id, title, clue, answer, hints, difficulty, points) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [flagId, sessionId, title, clue, answer, JSON.stringify(hints), difficulty, points],
        function(err) {
          if (err) reject(err);
          else resolve(flagId);
        }
      );
    });
  }

  async getSessionFlags(sessionId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM flags WHERE session_id = ? AND is_active = true ORDER BY difficulty, points',
        [sessionId],
        (err, rows) => {
          if (err) reject(err);
          else resolve((rows || []).map(row => ({
            ...row,
            hints: JSON.parse(row.hints || '[]')
          })));
        }
      );
    });
  }

  async updateFlag(flagId, title, clue, answer, hints = [], difficulty = 'medium', points = 100) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE flags SET title = ?, clue = ?, answer = ?, hints = ?, difficulty = ?, points = ? 
         WHERE id = ?`,
        [title, clue, answer, JSON.stringify(hints), difficulty, points, flagId],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes > 0);
        }
      );
    });
  }

  async deleteFlag(flagId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE flags SET is_active = false WHERE id = ?',
        [flagId],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes > 0);
        }
      );
    });
  }

  async getFlag(flagId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM flags WHERE id = ?',
        [flagId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row ? {
            ...row,
            hints: JSON.parse(row.hints || '[]')
          } : null);
        }
      );
    });
  }

  // Template Flags Management (for default flags)
  async getTemplateFlags() {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM template_flags WHERE is_active = true ORDER BY difficulty, points',
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve((rows || []).map(row => ({
            ...row,
            hints: JSON.parse(row.hints || '[]')
          })));
        }
      );
    });
  }

  async addTemplateFlag(title, clue, answer, hints = [], difficulty = 'medium', points = 100) {
    return new Promise((resolve, reject) => {
      const flagId = uuidv4();
      this.db.run(
        `INSERT INTO template_flags (id, title, clue, answer, hints, difficulty, points) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [flagId, title, clue, answer, JSON.stringify(hints), difficulty, points],
        function(err) {
          if (err) reject(err);
          else resolve(flagId);
        }
      );
    });
  }

  async updateTemplateFlag(flagId, title, clue, answer, hints = [], difficulty = 'medium', points = 100) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE template_flags SET title = ?, clue = ?, answer = ?, hints = ?, difficulty = ?, points = ? 
         WHERE id = ?`,
        [title, clue, answer, JSON.stringify(hints), difficulty, points, flagId],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes > 0);
        }
      );
    });
  }

  async deleteTemplateFlag(flagId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE template_flags SET is_active = false WHERE id = ?',
        [flagId],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes > 0);
        }
      );
    });
  }

  async getTemplateFlag(flagId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM template_flags WHERE id = ?',
        [flagId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row ? {
            ...row,
            hints: JSON.parse(row.hints || '[]')
          } : null);
        }
      );
    });
  }

  async checkFlagSolution(playerId, flagId, answer) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT answer, points FROM flags WHERE id = ?',
        [flagId],
        (err, flag) => {
          if (err) {
            reject(err);
            return;
          }
          
          if (!flag) {
            resolve({ correct: false, message: 'Flag not found' });
            return;
          }

          const isCorrect = flag.answer.toUpperCase() === answer.toUpperCase();
          
          if (isCorrect) {
            // Check if already solved
            this.db.get(
              'SELECT id FROM player_solutions WHERE player_id = ? AND flag_id = ?',
              [playerId, flagId],
              (err, existing) => {
                if (err) {
                  reject(err);
                  return;
                }
                
                if (existing) {
                  resolve({ correct: false, message: 'Flag already solved by you' });
                  return;
                }
                
                // Record the solution
                const solutionId = uuidv4();
                this.db.run(
                  'INSERT INTO player_solutions (id, player_id, flag_id) VALUES (?, ?, ?)',
                  [solutionId, playerId, flagId],
                  (err) => {
                    if (err) {
                      reject(err);
                    } else {
                      resolve({ correct: true, points: flag.points });
                    }
                  }
                );
              }
            );
          } else {
            resolve({ correct: false, message: 'Incorrect answer' });
          }
        }
      );
    });
  }

  async getPlayerSolutions(playerId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT flag_id, solved_at FROM player_solutions WHERE player_id = ?',
        [playerId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  // Attack Management
  async recordAttack(sessionId, attackerId, attackType, targetId, cost, duration) {
    return new Promise((resolve, reject) => {
      const attackId = uuidv4();
      
      this.db.run(
        `INSERT INTO attacks 
         (id, session_id, attacker_id, attack_type, target_id, cost, duration) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [attackId, sessionId, attackerId, attackType, targetId, cost, duration],
        function(err) {
          if (err) reject(err);
          else resolve(attackId);
        }
      );
    });
  }

  // Event Logging
  async logEvent(sessionId, playerId, eventType, eventData = {}) {
    return new Promise((resolve, reject) => {
      const eventId = uuidv4();
      
      this.db.run(
        'INSERT INTO game_events (id, session_id, player_id, event_type, event_data) VALUES (?, ?, ?, ?, ?)',
        [eventId, sessionId, playerId, eventType, JSON.stringify(eventData)],
        function(err) {
          if (err) reject(err);
          else resolve(eventId);
        }
      );
    });
  }

  async getRecentEvents(sessionId, limit = 20) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT ge.*, p.username 
         FROM game_events ge 
         LEFT JOIN players p ON ge.player_id = p.id 
         WHERE ge.session_id = ? 
         ORDER BY ge.timestamp DESC 
         LIMIT ?`,
        [sessionId, limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve((rows || []).map(row => ({
            ...row,
            event_data: JSON.parse(row.event_data || '{}')
          })));
        }
      );
    });
  }

  // Cleanup
  async cleanupDisconnectedPlayers() {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE players SET is_active = false WHERE socket_id IS NULL OR last_activity < datetime("now", "-5 minutes")',
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }

  // Get all sessions with player counts
  async getAllSessions() {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT 
          gs.*,
          COUNT(p.id) as player_count
        FROM game_sessions gs
        LEFT JOIN players p ON gs.id = p.session_id
        GROUP BY gs.id
        ORDER BY gs.created_at DESC
      `, (err, rows) => {
        if (err) {
          console.error('Error getting all sessions:', err);
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // End a session
  async endSession(sessionId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE game_sessions SET status = ?, ended_at = datetime("now") WHERE id = ?',
        ['ended', sessionId],
        function(err) {
          if (err) {
            console.error('Error ending session:', err);
            reject(err);
          } else {
            resolve(this.changes > 0);
          }
        }
      );
    });
  }

  // Delete a session and all related data
  async deleteSession(sessionId) {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');
        
        // Delete in correct order to avoid foreign key constraints
        // First delete player solutions by joining with players and flags tables
        this.db.run(`DELETE FROM player_solutions 
                     WHERE player_id IN (SELECT id FROM players WHERE session_id = ?) 
                     OR flag_id IN (SELECT id FROM flags WHERE session_id = ?)`, 
                     [sessionId, sessionId]);
        this.db.run('DELETE FROM game_events WHERE session_id = ?', [sessionId]);
        this.db.run('DELETE FROM attacks WHERE session_id = ?', [sessionId]);
        this.db.run('DELETE FROM flags WHERE session_id = ?', [sessionId]);
        this.db.run('DELETE FROM players WHERE session_id = ?', [sessionId]);
        this.db.run('DELETE FROM game_sessions WHERE id = ?', [sessionId], function(err) {
          if (err) {
            console.error('Error deleting session:', err);
            this.db.run('ROLLBACK');
            reject(err);
          } else {
            this.db.run('COMMIT', (commitErr) => {
              if (commitErr) {
                console.error('Error committing session deletion:', commitErr);
                reject(commitErr);
              } else {
                resolve(this.changes > 0);
              }
            });
          }
        });
      });
    });
  }

  close() {
    this.db.close();
  }
}

module.exports = DatabaseManager;