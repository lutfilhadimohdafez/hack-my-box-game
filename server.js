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

// Function to add default flags to new sessions
async function addDefaultFlags(sessionId) {
  const defaultFlags = [
    {
      title: 'Welcome Challenge',
      clue: 'What is the answer to life, the universe, and everything?',
      answer: '42',
      hints: ['Think Douglas Adams', 'Hitchhiker\'s Guide to the Galaxy', 'The ultimate answer'],
      difficulty: 'easy',
      points: 100
    },
    {
      title: 'Base64 Basics',
      clue: 'SGFjayBNeSBCb3g=',
      answer: 'HACK_MY_BOX',
      hints: ['This looks encoded', 'Try base64 decoding', 'Online decoder tools exist'],
      difficulty: 'medium',
      points: 200
    }
  ];

  for (const flag of defaultFlags) {
    await db.addFlag(sessionId, flag.title, flag.clue, flag.answer, flag.hints, flag.difficulty, flag.points);
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
              // Set session status to active immediately after creation
              await db.updateSessionStatus(sessionCode, 'active');
              
              // Add default flags for new sessions
              await addDefaultFlags(created.sessionId);
              
              sessionData = await db.getSession(sessionCode);
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
            sessionName: sessionData.session_name 
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
            points: result.points
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

        const attackCost = attackCosts[data.attackType] || 50;
        const duration = attackDurations[data.attackType] || 5000;

        if (attacker.coins < attackCost) {
          socket.emit('attack-result', { success: false, message: 'Not enough coins!' });
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

        // Record attack in database
        const attackId = await db.recordAttack(sessionId, playerId, data.attackType, null, attackCost, duration);

        const attack = {
          id: attackId,
          attacker: attacker.username,
          type: data.attackType,
          timestamp: Date.now(),
          duration
        };

        gameSession.attacks.push(attack);

        // Add to activity feed
        gameSession.addActivity({
          type: 'attack',
          message: `${attacker.username} launched ${data.attackType.toUpperCase()} attack!`,
          timestamp: Date.now(),
          playerName: attacker.username
        });

        // Log event
        await db.logEvent(sessionId, playerId, 'attack_launched', {
          attackType: data.attackType,
          cost: attackCost,
          duration
        });

        // Broadcast attack
        io.to(sessionId).emit('attack-launched', attack);
        
        socket.emit('attack-result', {
          success: true,
          message: `${data.attackType.toUpperCase()} attack launched!`,
          coinsLeft: attacker.coins
        });

        // Remove attack after duration
        setTimeout(() => {
          gameSession.attacks = gameSession.attacks.filter(a => a.id !== attackId);
          attacker.isAttacking = false;
          io.to(sessionId).emit('attack-ended', attackId);
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