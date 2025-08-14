const { createServer } = require('http');
const { Server } = require('socket.io');
const next = require('next');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const DatabaseManager = require('./lib/database');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

// Initialize database
const db = new DatabaseManager();

// Session configuration
const sessionMiddleware = session({
  store: new SQLiteStore({ db: './database/sessions.db' }),
  secret: process.env.SESSION_SECRET || 'hack-my-box-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // Set to true in production with HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
});

// In-memory game state for real-time operations
const gameSessions = new Map();
const playerSockets = new Map(); // playerId -> socketId mapping

// Function to add default flags to new sessions from templates
async function addDefaultFlags(sessionId) {
  try {
    const templateFlags = await db.getTemplateFlags();
    
    for (const template of templateFlags) {
      await db.addFlag(
        sessionId, 
        template.title, 
        template.clue, 
        template.answer, 
        template.hints, 
        template.difficulty, 
        template.points
      );
    }
    
    console.log(`Added ${templateFlags.length} default flags to session`);
  } catch (error) {
    console.error('Error adding default flags:', error);
    // Fallback to hardcoded flags if template system fails
    const fallbackFlags = [
      {
        title: 'Welcome Challenge',
        clue: 'What is the answer to life, the universe, and everything?',
        answer: '42',
        hints: ['Think Douglas Adams', 'Hitchhiker\'s Guide to the Galaxy', 'The ultimate answer'],
        difficulty: 'easy',
        points: 100
      }
    ];
    
    for (const flag of fallbackFlags) {
      await db.addFlag(sessionId, flag.title, flag.clue, flag.answer, flag.hints, flag.difficulty, flag.points);
    }
  }
}

class GameSession {
  constructor(sessionData) {
    this.id = sessionData.id;
    this.sessionCode = sessionData.session_code;
    this.sessionName = sessionData.session_name;
    this.status = sessionData.status;
    this.players = new Map();
    this.flags = new Map();
    this.attacks = [];
    this.recentActivity = [];
  }

  addPlayer(playerData) {
    this.players.set(playerData.id, {
      ...playerData,
      isAttacking: false,
      lastAttack: null
    });
  }

  updatePlayer(playerId, updates) {
    const player = this.players.get(playerId);
    if (player) {
      Object.assign(player, updates);
    }
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
  }

  addActivity(activity) {
    this.recentActivity.unshift(activity);
    this.recentActivity = this.recentActivity.slice(0, 10); // Keep only recent 10
  }

  getLeaderboard() {
    return Array.from(this.players.values())
      .sort((a, b) => b.score - a.score)
      .map((player, index) => ({
        rank: index + 1,
        name: player.username,
        score: player.score,
        solvedFlags: player.solvedFlags?.length || 0,
        isAttacking: player.isAttacking || false
      }));
  }
}

app.prepare().then(() => {
  const server = createServer((req, res) => {
    // Apply session middleware to HTTP requests
    sessionMiddleware(req, res, () => {
      handle(req, res);
    });
  });

  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  // Apply session middleware to Socket.IO
  io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
  });

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Join session with authentication
    socket.on('join-session', async (data) => {
      console.log('Received join-session event:', data);
      try {
        const { sessionCode, username, adminPassword } = data;
        
        // Validate session
        let sessionData = await db.getSession(sessionCode);

        // Handle admin actions (create session if not exists)
        if (adminPassword) {
          if (!sessionData) {
            // Create new session if not exists
            try {
              const sessionName = data.sessionName || 'New Session';
              const maxPlayers = data.maxPlayers || 50;
              const created = await db.createSession(sessionName, sessionCode, adminPassword, maxPlayers);
              // Session starts in 'waiting' status - admin must start it manually
              console.log(`Created session ${sessionCode} with status: waiting`);
              
              // Add default flags for new sessions
              await addDefaultFlags(created.sessionId);
              
              sessionData = await db.getSession(sessionCode);
              console.log(`Session data after creation:`, { id: sessionData.id, status: sessionData.status });
            } catch (err) {
              socket.emit('session-error', { message: 'Failed to create session: ' + err.message });
              return;
            }
          }
          const isValidAdmin = await db.verifyAdminPassword(sessionCode, adminPassword);
          if (!isValidAdmin) {
            socket.emit('session-error', { message: 'Invalid admin password' });
            return;
          }
          socket.emit('admin-authenticated', { 
            sessionId: sessionData.id,
            sessionName: sessionData.session_name,
            adminPassword: adminPassword
          });
          return;
        }

        if (!sessionData) {
          socket.emit('session-error', { message: 'Invalid session code' });
          return;
        }

        // Check if session is full
        const currentPlayers = await db.getSessionPlayers(sessionData.id);
        if (currentPlayers.length >= sessionData.max_players) {
          socket.emit('session-error', { message: 'Session is full' });
          return;
        }

        // Check if username is already taken
        const existingPlayer = currentPlayers.find(p => 
          p.username.toLowerCase() === username.toLowerCase()
        );
        
        let playerId;
        if (existingPlayer) {
          // Reconnecting player
          playerId = existingPlayer.id;
          await db.updatePlayerSocket(playerId, socket.id);
        } else {
          // New player
          try {
            playerId = await db.addPlayer(sessionData.id, username, socket.id);
          } catch (err) {
            if (err.message.includes('UNIQUE')) {
              socket.emit('session-error', { message: 'Username already taken' });
              return;
            }
            throw err;
          }
        }

        // Store player session data
        socket.request.session.playerId = playerId;
        socket.request.session.sessionId = sessionData.id;
        socket.request.session.sessionCode = sessionCode;
        socket.request.session.save();

        // Add to socket mapping
        playerSockets.set(playerId, socket.id);

        // Get or create game session
        let gameSession = gameSessions.get(sessionData.id);
        if (!gameSession) {
          gameSession = new GameSession(sessionData);
          gameSessions.set(sessionData.id, gameSession);
          
          // Load flags
          const flags = await db.getSessionFlags(sessionData.id);
          flags.forEach(flag => {
            gameSession.flags.set(flag.id, flag);
          });
        }

        // Get player data and solutions
        const playerData = await db.getPlayer(playerId);
        const solutions = await db.getPlayerSolutions(playerId);
        playerData.solvedFlags = solutions.map(s => s.flag_id);

        // Add player to game session
        gameSession.addPlayer(playerData);
        socket.join(sessionData.id);

        // Send game state to player
        console.log('About to emit game-joined event for player:', playerData.username);
        console.log('Session status:', sessionData.status);
        console.log('Game session status:', gameSession.status);
        console.log('Flags count:', gameSession.flags.size);
        
        socket.emit('game-joined', {
          sessionName: sessionData.session_name,
          sessionStatus: gameSession.status, // Use gameSession status which should match sessionData.status
          player: {
            id: playerData.id,
            name: playerData.username,
            score: playerData.score,
            coins: playerData.coins,
            solvedFlags: playerData.solvedFlags
          },
          flags: Array.from(gameSession.flags.values()).map(flag => ({
            id: flag.id,
            title: flag.title,
            clue: flag.clue,
            difficulty: flag.difficulty,
            points: flag.points
          })),
          players: Array.from(gameSession.players.values())
            .filter(p => p.id !== playerId) // Exclude current player
            .map(p => ({
              id: p.id,
              name: p.username,
              score: p.score
            }))
        });
        
        console.log('game-joined event emitted successfully');

        // Log join event
        await db.logEvent(sessionData.id, playerId, 'player_joined', { username });
        
        // Broadcast updated leaderboard
        broadcastLeaderboard(gameSession);

        console.log(`Player ${username} joined session ${sessionCode}`);

      } catch (error) {
        console.error('Error joining session:', error);
        socket.emit('session-error', { message: 'Server error' });
      }
    });

    // Admin: Start/Stop session
    socket.on('admin-control-session', async (data) => {
      console.log('Received admin-control-session:', data);
      try {
        const { action, sessionCode } = data;
        console.log(`Admin trying to ${action} session: ${sessionCode}`);
        
        const success = await db.updateSessionStatus(sessionCode, action === 'start' ? 'active' : 'ended');
        console.log(`UpdateSessionStatus result: ${success}`);
        
        if (success) {
          const sessionData = await db.getSession(sessionCode);
          console.log('Session data after update:', sessionData);
          if (!sessionData) {
            socket.emit('admin-action-error', { message: 'Session not found' });
            return;
          }
          const gameSession = gameSessions.get(sessionData.id);
          if (gameSession) {
            gameSession.status = action === 'start' ? 'active' : 'ended';
            io.to(sessionData.id).emit('session-status-changed', { 
              status: gameSession.status,
              message: action === 'start' ? 'Game started!' : 'Game ended!'
            });
          }
          socket.emit('admin-action-success', { message: `Session ${action}ed successfully` });
          await db.logEvent(sessionData.id, null, 'session_' + action, { sessionCode });
        } else {
          console.error('Failed to update session status for:', sessionCode);
          socket.emit('admin-action-error', { message: 'Failed to update session' });
        }
      } catch (error) {
        console.error('Error controlling session:', error);
        socket.emit('admin-action-error', { message: 'Server error' });
      }
    });

    // Admin: Join session room for live updates
    socket.on('admin-join-session', async (data) => {
      console.log('Admin joining session room:', data);
      try {
        const { sessionId } = data;
        
        // Join the session room
        socket.join(sessionId);
        console.log(`Admin joined session room: ${sessionId}`);
        
        // Get current game session and send initial leaderboard
        const gameSession = gameSessions.get(sessionId);
        if (gameSession) {
          broadcastLeaderboard(gameSession);
          console.log('Sent initial leaderboard to admin');
        }
        
      } catch (error) {
        console.error('Error joining admin to session:', error);
      }
    });

    // Leaderboard: Join session room for live updates
    socket.on('leaderboard-join-session', async (data) => {
      console.log('Leaderboard joining session room:', data);
      try {
        const { sessionId } = data;
        
        // Join the session room
        socket.join(sessionId);
        console.log(`Leaderboard joined session room: ${sessionId}`);
        
        // Get current game session and send initial leaderboard
        const gameSession = gameSessions.get(sessionId);
        if (gameSession) {
          broadcastLeaderboard(gameSession);
          console.log('Sent initial leaderboard to leaderboard display');
        }
        
      } catch (error) {
        console.error('Error joining leaderboard to session:', error);
      }
    });

    // Admin: Get flags for management
    socket.on('admin-get-flags', async (data) => {
      console.log('Admin requesting flags:', data);
      try {
        const { sessionId } = data;
        const flags = await db.getSessionFlags(sessionId);
        socket.emit('admin-flags-list', { flags });
      } catch (error) {
        console.error('Error getting flags:', error);
        socket.emit('admin-flags-error', { message: 'Failed to get flags' });
      }
    });

    // Admin: Add new flag
    socket.on('admin-add-flag', async (data) => {
      console.log('Admin adding flag:', data);
      try {
        const { sessionId, title, clue, answer, hints, difficulty, points } = data;
        const flagId = await db.addFlag(sessionId, title, clue, answer, hints, difficulty, points);
        
        // Update game session flags
        const gameSession = gameSessions.get(sessionId);
        if (gameSession) {
          const newFlag = await db.getFlag(flagId);
          gameSession.flags.set(flagId, newFlag);
        }
        
        socket.emit('admin-flag-added', { flagId, message: 'Flag added successfully' });
        
        // Send updated flags list
        const flags = await db.getSessionFlags(sessionId);
        socket.emit('admin-flags-list', { flags });
        
      } catch (error) {
        console.error('Error adding flag:', error);
        socket.emit('admin-flags-error', { message: 'Failed to add flag' });
      }
    });

    // Admin: Update flag
    socket.on('admin-update-flag', async (data) => {
      console.log('Admin updating flag:', data);
      try {
        const { flagId, title, clue, answer, hints, difficulty, points, sessionId } = data;
        const success = await db.updateFlag(flagId, title, clue, answer, hints, difficulty, points);
        
        if (success) {
          // Update game session flags
          const gameSession = gameSessions.get(sessionId);
          if (gameSession) {
            const updatedFlag = await db.getFlag(flagId);
            gameSession.flags.set(flagId, updatedFlag);
          }
          
          socket.emit('admin-flag-updated', { message: 'Flag updated successfully' });
          
          // Send updated flags list
          const flags = await db.getSessionFlags(sessionId);
          socket.emit('admin-flags-list', { flags });
        } else {
          socket.emit('admin-flags-error', { message: 'Flag not found or not updated' });
        }
        
      } catch (error) {
        console.error('Error updating flag:', error);
        socket.emit('admin-flags-error', { message: 'Failed to update flag' });
      }
    });

    // Admin: Delete flag
    socket.on('admin-delete-flag', async (data) => {
      console.log('Admin deleting flag:', data);
      try {
        const { flagId, sessionId } = data;
        const success = await db.deleteFlag(flagId);
        
        if (success) {
          // Remove from game session flags
          const gameSession = gameSessions.get(sessionId);
          if (gameSession) {
            gameSession.flags.delete(flagId);
          }
          
          socket.emit('admin-flag-deleted', { message: 'Flag deleted successfully' });
          
          // Send updated flags list
          const flags = await db.getSessionFlags(sessionId);
          socket.emit('admin-flags-list', { flags });
        } else {
          socket.emit('admin-flags-error', { message: 'Flag not found or not deleted' });
        }
        
      } catch (error) {
        console.error('Error deleting flag:', error);
        socket.emit('admin-flags-error', { message: 'Failed to delete flag' });
      }
    });

    // Admin: Get template flags for default management
    socket.on('admin-get-template-flags', async () => {
      console.log('Admin requesting template flags');
      try {
        const templateFlags = await db.getTemplateFlags();
        socket.emit('admin-template-flags-list', { flags: templateFlags });
      } catch (error) {
        console.error('Error getting template flags:', error);
        socket.emit('admin-template-flags-error', { message: 'Failed to get template flags' });
      }
    });

    // Admin: Add new template flag
    socket.on('admin-add-template-flag', async (data) => {
      console.log('Admin adding template flag:', data);
      try {
        const { title, clue, answer, hints, difficulty, points } = data;
        const flagId = await db.addTemplateFlag(title, clue, answer, hints, difficulty, points);
        
        socket.emit('admin-template-flag-added', { flagId, message: 'Template flag added successfully' });
        
        // Send updated template flags list
        const templateFlags = await db.getTemplateFlags();
        socket.emit('admin-template-flags-list', { flags: templateFlags });
        
      } catch (error) {
        console.error('Error adding template flag:', error);
        socket.emit('admin-template-flags-error', { message: 'Failed to add template flag' });
      }
    });

    // Admin: Update template flag
    socket.on('admin-update-template-flag', async (data) => {
      console.log('Admin updating template flag:', data);
      try {
        const { flagId, title, clue, answer, hints, difficulty, points } = data;
        const success = await db.updateTemplateFlag(flagId, title, clue, answer, hints, difficulty, points);
        
        if (success) {
          socket.emit('admin-template-flag-updated', { message: 'Template flag updated successfully' });
          
          // Send updated template flags list
          const templateFlags = await db.getTemplateFlags();
          socket.emit('admin-template-flags-list', { flags: templateFlags });
        } else {
          socket.emit('admin-template-flags-error', { message: 'Template flag not found or not updated' });
        }
        
      } catch (error) {
        console.error('Error updating template flag:', error);
        socket.emit('admin-template-flags-error', { message: 'Failed to update template flag' });
      }
    });

    // Admin: Delete template flag
    socket.on('admin-delete-template-flag', async (data) => {
      console.log('Admin deleting template flag:', data);
      try {
        const { flagId } = data;
        const success = await db.deleteTemplateFlag(flagId);
        
        if (success) {
          socket.emit('admin-template-flag-deleted', { message: 'Template flag deleted successfully' });
          
          // Send updated template flags list
          const templateFlags = await db.getTemplateFlags();
          socket.emit('admin-template-flags-list', { flags: templateFlags });
        } else {
          socket.emit('admin-template-flags-error', { message: 'Template flag not found or not deleted' });
        }
        
      } catch (error) {
        console.error('Error deleting template flag:', error);
        socket.emit('admin-template-flags-error', { message: 'Failed to delete template flag' });
      }
    });

    // Admin: Get all sessions
    socket.on('admin-get-all-sessions', async () => {
      console.log('Admin requesting all sessions');
      try {
        const sessions = await db.getAllSessions();
        socket.emit('admin-all-sessions-list', { sessions });
      } catch (error) {
        console.error('Error getting all sessions:', error);
        socket.emit('admin-sessions-error', { message: 'Failed to get sessions' });
      }
    });

    // Admin: Kill/End a session
    socket.on('admin-kill-session', async (data) => {
      console.log('Admin killing session:', data);
      try {
        const { sessionId } = data;
        const success = await db.endSession(sessionId);
        
        if (success) {
          // Notify all users in that session that it's ended
          io.to(sessionId).emit('session-ended', { 
            message: 'Session has been terminated by admin' 
          });
          
          socket.emit('admin-session-killed', { 
            message: 'Session terminated successfully',
            sessionId 
          });
          
          // Send updated sessions list
          const sessions = await db.getAllSessions();
          socket.emit('admin-all-sessions-list', { sessions });
        } else {
          socket.emit('admin-sessions-error', { message: 'Failed to terminate session' });
        }
        
      } catch (error) {
        console.error('Error killing session:', error);
        socket.emit('admin-sessions-error', { message: 'Failed to terminate session' });
      }
    });

    // Admin: Delete a session permanently
    socket.on('admin-delete-session', async (data) => {
      console.log('Admin deleting session:', data);
      try {
        const { sessionId } = data;
        const success = await db.deleteSession(sessionId);
        
        if (success) {
          socket.emit('admin-session-deleted', { 
            message: 'Session deleted successfully',
            sessionId 
          });
          
          // Send updated sessions list
          const sessions = await db.getAllSessions();
          socket.emit('admin-all-sessions-list', { sessions });
        } else {
          socket.emit('admin-sessions-error', { message: 'Failed to delete session' });
        }
        
      } catch (error) {
        console.error('Error deleting session:', error);
        socket.emit('admin-sessions-error', { message: 'Failed to delete session' });
      }
    });

    // Admin: Update player coins
    socket.on('admin-update-coins', async (data) => {
      console.log('Admin updating player coins:', data);
      try {
        const { playerId, newCoins } = data;
        
        // Validate coins amount
        if (typeof newCoins !== 'number' || newCoins < 0) {
          socket.emit('admin-coins-error', { message: 'Invalid coins amount' });
          return;
        }
        
        const success = await db.updatePlayerCoins(playerId, newCoins);
        
        if (success) {
          // Get updated player info
          const player = await db.getPlayer(playerId);
          
          socket.emit('admin-coins-updated', { 
            message: `Player coins updated to ${newCoins}`,
            player: player
          });
          
          // Notify the player if they're connected
          const playerSocketId = playerSockets.get(playerId);
          if (playerSocketId) {
            io.to(playerSocketId).emit('coins-updated', { 
              coins: newCoins,
              message: 'Your coins have been updated by admin'
            });
          }
          
          // Update leaderboard for all users in the session
          if (player && player.session_id) {
            const sessionPlayers = await db.getSessionPlayers(player.session_id);
            io.to(player.session_id).emit('leaderboard-update', { leaderboard: sessionPlayers });
          }
        } else {
          socket.emit('admin-coins-error', { message: 'Failed to update coins' });
        }
        
      } catch (error) {
        console.error('Error updating player coins:', error);
        socket.emit('admin-coins-error', { message: 'Failed to update coins' });
      }
    });

    // Admin: Get session players for coin management
    socket.on('admin-get-session-players', async (data) => {
      console.log('Admin requesting session players for coin management:', data);
      try {
        const { sessionId } = data;
        const players = await db.getSessionPlayers(sessionId);
        socket.emit('admin-session-players-list', { players });
      } catch (error) {
        console.error('Error getting session players:', error);
        socket.emit('admin-coins-error', { message: 'Failed to get players' });
      }
    });

    // Submit flag
    socket.on('submit-flag', async (data) => {
      try {
        const playerId = socket.request.session?.playerId;
        const sessionId = socket.request.session?.sessionId;
        
        if (!playerId || !sessionId) {
          socket.emit('flag-result', { success: false, message: 'Not authenticated' });
          return;
        }

        const gameSession = gameSessions.get(sessionId);
        if (!gameSession || gameSession.status !== 'active') {
          socket.emit('flag-result', { success: false, message: 'Game not active' });
          return;
        }

        const result = await db.checkFlagSolution(playerId, data.flagId, data.answer);
        
        if (result.correct) {
          // Update player score
          await db.updatePlayerScore(playerId, result.points);
          
          // Update game session
          const player = gameSession.players.get(playerId);
          if (player) {
            player.score += result.points;
            player.solvedFlags = player.solvedFlags || [];
            player.solvedFlags.push(data.flagId);
          }

          // Log event
          await db.logEvent(sessionId, playerId, 'flag_solved', {
            flagId: data.flagId,
            points: result.points,
            answer: data.answer
          });

          // Add to activity feed
          gameSession.addActivity({
            type: 'achievement',
            message: `${player?.username} solved ${data.flagId.toUpperCase()} (+${result.points} pts)`,
            timestamp: Date.now(),
            playerName: player?.username
          });

          socket.emit('flag-result', {
            success: true,
            message: `Correct! You earned ${result.points} points!`,
            points: result.points,
            flagId: data.flagId
          });

          // Broadcast achievement
          io.to(sessionId).emit('player-achievement', {
            playerName: player?.username,
            flagId: data.flagId,
            points: result.points
          });

          // Update leaderboard
          broadcastLeaderboard(gameSession);

        } else {
          socket.emit('flag-result', {
            success: false,
            message: result.message
          });
        }

      } catch (error) {
        console.error('Error submitting flag:', error);
        socket.emit('flag-result', { success: false, message: 'Server error' });
      }
    });

    // Buy hint
    socket.on('buy-hint', async (data) => {
      try {
        const playerId = socket.request.session?.playerId;
        const sessionId = socket.request.session?.sessionId;
        
        if (!playerId || !sessionId) {
          socket.emit('hint-result', { success: false, message: 'Not authenticated' });
          return;
        }

        const gameSession = gameSessions.get(sessionId);
        if (!gameSession || gameSession.status !== 'active') {
          socket.emit('hint-result', { success: false, message: 'Game not active' });
          return;
        }

        const player = gameSession.players.get(playerId);
        const flag = gameSession.flags.get(data.flagId);
        
        if (!player || !flag) {
          socket.emit('hint-result', { success: false, message: 'Invalid request' });
          return;
        }

        const hintCost = 10;
        if (player.coins < hintCost) {
          socket.emit('hint-result', { success: false, message: 'Not enough coins!' });
          return;
        }

        // Update player coins
        await db.updatePlayerScore(playerId, 0, -hintCost);
        player.coins -= hintCost;

        const hintIndex = Math.min(data.hintIndex || 0, flag.hints.length - 1);
        const hint = flag.hints[hintIndex];

        // Log event
        await db.logEvent(sessionId, playerId, 'hint_purchased', {
          flagId: data.flagId,
          hintIndex,
          cost: hintCost
        });

        socket.emit('hint-result', {
          success: true,
          hint: hint,
          coinsLeft: player.coins
        });

      } catch (error) {
        console.error('Error buying hint:', error);
        socket.emit('hint-result', { success: false, message: 'Server error' });
      }
    });

    // Launch attack
    socket.on('launch-attack', async (data) => {
      try {
        const playerId = socket.request.session?.playerId;
        const sessionId = socket.request.session?.sessionId;
        
        if (!playerId || !sessionId) {
          socket.emit('attack-result', { success: false, message: 'Not authenticated' });
          return;
        }

        const gameSession = gameSessions.get(sessionId);
        if (!gameSession || gameSession.status !== 'active') {
          socket.emit('attack-result', { success: false, message: 'Game not active' });
          return;
        }

        const attacker = gameSession.players.get(playerId);
        if (!attacker) {
          socket.emit('attack-result', { success: false, message: 'Player not found' });
          return;
        }

        // Attack costs and durations
        const attackCosts = {
          'sleep': 10,
          'jam': 50,
          'steal': 100
        };

        const attackDurations = {
          'sleep': 10000,
          'jam': 5000,
          'steal': 3000
        };

        // Adjust cost if targeting all players
        let attackCost = attackCosts[data.attackType] || 50;
        if (data.targetId === 'all') {
          attackCost += 100; // Extra cost for targeting all players
        }
        
        const duration = attackDurations[data.attackType] || 5000;

        if (attacker.coins < attackCost) {
          socket.emit('attack-result', { success: false, message: 'Not enough coins!' });
          return;
        }

        // Validate target (if specified)
        let targetPlayers = [];
        if (data.targetId === 'all') {
          // Target all other players (exclude attacker)
          targetPlayers = Array.from(gameSession.players.values())
            .filter(p => p.id !== playerId)
            .map(p => p.id);
        } else if (data.targetId) {
          // Target specific player
          if (data.targetId === playerId) {
            socket.emit('attack-result', { success: false, message: 'Cannot attack yourself!' });
            return;
          }
          if (!gameSession.players.has(data.targetId)) {
            socket.emit('attack-result', { success: false, message: 'Target player not found!' });
            return;
          }
          targetPlayers = [data.targetId];
        } else {
          socket.emit('attack-result', { success: false, message: 'Must specify a target!' });
          return;
        }

        if (targetPlayers.length === 0) {
          socket.emit('attack-result', { success: false, message: 'No valid targets found!' });
          return;
        }

        // Check cooldown
        if (attacker.lastAttack && Date.now() - attacker.lastAttack < 30000) {
          socket.emit('attack-result', { 
            success: false, 
            message: 'Attack on cooldown! Wait 30 seconds.' 
          });
          return;
        }

        // Update player
        await db.updatePlayerScore(playerId, 0, -attackCost);
        attacker.coins -= attackCost;
        attacker.lastAttack = Date.now();
        attacker.isAttacking = true;

        // Record attack in database (store target info)
        const attackId = await db.recordAttack(sessionId, playerId, data.attackType, JSON.stringify(targetPlayers), attackCost, duration);

        // Get target names for messaging
        const targetNames = targetPlayers.map(id => {
          const target = gameSession.players.get(id);
          return target ? target.username : 'Unknown';
        }).filter(name => name !== 'Unknown');

        const attack = {
          id: attackId,
          attacker: attacker.username,
          type: data.attackType,
          timestamp: Date.now(),
          duration,
          targets: targetPlayers,
          targetNames: targetNames
        };

        gameSession.attacks.push(attack);

        // Create appropriate message
        const targetMessage = data.targetId === 'all' ? 'all players' : targetNames.join(', ');
        
        // Add to activity feed
        gameSession.addActivity({
          type: 'attack',
          message: `${attacker.username} launched ${data.attackType.toUpperCase()} attack on ${targetMessage}!`,
          timestamp: Date.now(),
          playerName: attacker.username
        });

        // Log event
        await db.logEvent(sessionId, playerId, 'attack_launched', {
          attackType: data.attackType,
          targets: targetPlayers,
          cost: attackCost,
          duration
        });

        // Handle steal attack special logic
        let stealResults = [];
        if (data.attackType === 'steal') {
          for (const targetId of targetPlayers) {
            const target = gameSession.players.get(targetId);
            if (target && target.solvedFlags && target.solvedFlags.length > 0) {
              // Determine how many flags to steal (1-2 random flags, max 50% of target's flags)
              const maxSteal = Math.max(1, Math.floor(target.solvedFlags.length * 0.5));
              const stealCount = Math.min(2, maxSteal);
              
              // Randomly select flags to steal
              const shuffled = [...target.solvedFlags].sort(() => 0.5 - Math.random());
              const stolenFlags = shuffled.slice(0, stealCount);
              
              if (stolenFlags.length > 0) {
                // Calculate points to transfer and collect flag details
                let totalPoints = 0;
                const flagDetails = [];
                for (const flagId of stolenFlags) {
                  const flag = gameSession.flags.get(flagId);
                  if (flag) {
                    totalPoints += flag.points;
                    flagDetails.push({
                      id: flagId,
                      title: flag.title || flagId.toUpperCase(),
                      points: flag.points,
                      difficulty: flag.difficulty
                    });
                  }
                }
                
                // Update database - remove solutions from target
                for (const flagId of stolenFlags) {
                  await db.removeFlagSolution(targetId, flagId);
                }
                
                // Update database - add solutions to attacker (if they don't already have them)
                for (const flagId of stolenFlags) {
                  if (!attacker.solvedFlags.includes(flagId)) {
                    await db.addFlagSolution(playerId, flagId);
                    attacker.solvedFlags.push(flagId);
                  }
                }
                
                // Update scores in database
                await db.updatePlayerScore(targetId, -totalPoints, 0);
                await db.updatePlayerScore(playerId, totalPoints, 0);
                
                // Update game session player data
                target.solvedFlags = target.solvedFlags.filter(f => !stolenFlags.includes(f));
                target.score -= totalPoints;
                attacker.score += totalPoints;
                
                stealResults.push({
                  targetName: target.username,
                  stolenFlags: stolenFlags,
                  flagDetails: flagDetails, // Include detailed flag information
                  pointsStolen: totalPoints
                });
                
                // Log the theft
                await db.logEvent(sessionId, playerId, 'flags_stolen', {
                  targetId: targetId,
                  targetName: target.username,
                  flagsStolen: stolenFlags,
                  pointsStolen: totalPoints
                });
              }
            }
          }
        }

        // Broadcast attack information to all players in session
        io.to(sessionId).emit('attack-launched', attack);
        
        // Send targeted attack effects only to affected players
        targetPlayers.forEach(targetId => {
          const targetSocket = playerSockets.get(targetId);
          if (targetSocket) {
            io.to(targetSocket).emit('attack-targeted', {
              attackId: attackId,
              attacker: attacker.username,
              type: data.attackType,
              duration: duration
            });
          }
        });
        
        // Update leaderboard to show new attack
        broadcastLeaderboard(gameSession);
        
        // Create attack result message
        let attackMessage = `${data.attackType.toUpperCase()} attack launched on ${targetMessage}!`;
        if (data.attackType === 'steal' && stealResults.length > 0) {
          const totalStolen = stealResults.reduce((sum, result) => sum + result.pointsStolen, 0);
          const flagCount = stealResults.reduce((sum, result) => sum + result.stolenFlags.length, 0);
          attackMessage += ` Stole ${flagCount} flag(s) worth ${totalStolen} points!`;
        }
        
        socket.emit('attack-result', {
          success: true,
          message: attackMessage,
          coinsLeft: attacker.coins,
          stealResults: data.attackType === 'steal' ? stealResults : undefined
        });

        // Send steal notifications to targets
        if (data.attackType === 'steal' && stealResults.length > 0) {
          stealResults.forEach(result => {
            const targetSocket = playerSockets.get(targetPlayers.find(id => {
              const target = gameSession.players.get(id);
              return target && target.username === result.targetName;
            }));
            
            if (targetSocket) {
              io.to(targetSocket).emit('steal-notification', {
                attacker: attacker.username,
                flagsLost: result.stolenFlags,
                flagDetails: result.flagDetails, // Include detailed flag information
                pointsLost: result.pointsStolen
              });
            }
          });
        }

        // Remove attack after duration
        setTimeout(() => {
          gameSession.attacks = gameSession.attacks.filter(a => a.id !== attackId);
          attacker.isAttacking = false;
          io.to(sessionId).emit('attack-ended', attackId);
          
          // Update leaderboard to remove ended attack
          broadcastLeaderboard(gameSession);
        }, duration);

      } catch (error) {
        console.error('Error launching attack:', error);
        socket.emit('attack-result', { success: false, message: 'Server error' });
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      
      const playerId = socket.request.session?.playerId;
      const sessionId = socket.request.session?.sessionId;
      
      if (playerId && sessionId) {
        // Remove from socket mapping
        playerSockets.delete(playerId);
        
        // Update game session
        const gameSession = gameSessions.get(sessionId);
        if (gameSession) {
          gameSession.removePlayer(playerId);
          broadcastLeaderboard(gameSession);
        }
      }
    });
  });

  function broadcastLeaderboard(gameSession) {
    if (!gameSession) return;

    const leaderboard = gameSession.getLeaderboard();
    
    io.to(gameSession.id).emit('leaderboard-update', {
      leaderboard,
      attacks: gameSession.attacks,
      totalPlayers: gameSession.players.size,
      recentActivity: gameSession.recentActivity
    });
  }

  // Cleanup disconnected players periodically
  setInterval(async () => {
    try {
      const cleaned = await db.cleanupDisconnectedPlayers();
      if (cleaned > 0) {
        console.log(`Cleaned up ${cleaned} inactive players`);
      }
    } catch (error) {
      console.error('Error cleaning up players:', error);
    }
  }, 5 * 60 * 1000); // Every 5 minutes

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${PORT}`);
    console.log(`> Game sessions database initialized`);
    console.log(`> Demo session code: DEMO2024`);
    console.log(`> Admin password: admin123`);
  });
});