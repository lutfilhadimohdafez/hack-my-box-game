import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import io from 'socket.io-client';

let socket;

export default function GamePage() {
  const router = useRouter();
  const [isConnected, setIsConnected] = useState(false);
  const [player, setPlayer] = useState(null);
  const [players, setPlayers] = useState([]); // Other players for targeting
  const [flags, setFlags] = useState([]);
  const [gameJoined, setGameJoined] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [selectedFlag, setSelectedFlag] = useState(null);
  const [flagAnswer, setFlagAnswer] = useState('');
  const [messages, setMessages] = useState([]);
  const [hints, setHints] = useState({});
  const [attacks, setAttacks] = useState([]);
  const [isUnderAttack, setIsUnderAttack] = useState(false);
  const [attackAnimation, setAttackAnimation] = useState(null); // For custom attack animations
  const [terminalLines, setTerminalLines] = useState([]); // For terminal-style animations
  const [gameStatus, setGameStatus] = useState('waiting');
  const [challengeCompleted, setChallengeCompleted] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState(''); // For attack targeting

  useEffect(() => {
    socketInitializer();
    
    return () => {
      if (socket) socket.disconnect();
    };
  }, []);

  // Auto-join session from URL parameters
  useEffect(() => {
    const { sessionCode, username } = router.query;
    console.log('Game page query params:', { sessionCode, username, isConnected, gameJoined });
    
    if (sessionCode && username && socket && isConnected && !gameJoined) {
      console.log('Auto-joining session:', { sessionCode, username });
      socket.emit('join-session', {
        sessionCode: sessionCode,
        username: username,
        adminPassword: null
      });
    }
  }, [router.query, socket, isConnected, gameJoined]);

  // Check for challenge completion
  useEffect(() => {
    if (player && flags && flags.length > 0 && gameStatus === 'active') {
      const solvedCount = player.solvedFlags?.length || 0;
      const totalFlags = flags.length;
      
      if (solvedCount === totalFlags && totalFlags > 0 && !challengeCompleted) {
        setChallengeCompleted(true);
        addMessage('🎉 Congratulations! Challenge Completed! 🎉', 'success');
        
        // Auto-refresh after a short delay to show updated state
        setTimeout(() => {
          window.location.reload();
        }, 3000);
      }
    }
  }, [player?.solvedFlags, flags, challengeCompleted, gameStatus]);

  const socketInitializer = async () => {
    socket = io();

    socket.on('connect', () => {
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('game-joined', (data) => {
      console.log('Received game-joined event:', data);
      setSessionName(data.sessionName);
      setFlags(data.flags);
      setPlayer(data.player);
      setPlayers(data.players || []); // Set other players for targeting
      setGameJoined(true);
      setGameStatus(data.sessionStatus || 'waiting'); // Use actual session status
      addMessage(`Welcome to ${data.sessionName}!`, 'success');
      
      // Add status-specific message
      if (data.sessionStatus === 'waiting') {
        addMessage('Waiting for admin to start the game...', 'info');
      }
      
      console.log('Game joined successfully, flags:', data.flags?.length, 'players:', data.players?.length, 'status:', data.sessionStatus);
    });

    socket.on('session-status-changed', (data) => {
      setGameStatus(data.status);
      addMessage(data.message, data.status === 'active' ? 'success' : 'warning');
      
      // Auto-refresh when session starts to ensure fresh state
      if (data.status === 'active') {
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      }
    });

    socket.on('flag-result', (data) => {
      console.log('Flag result received:', data);
      addMessage(data.message, data.success ? 'success' : 'error');
      if (data.success) {
        console.log('Flag solved successfully, updating player state');
        console.log('Current player solvedFlags before update:', player?.solvedFlags);
        console.log('Adding flag ID to solved:', data.flagId);
        
        setPlayer(prev => {
          const currentSolved = prev.solvedFlags || [];
          // Make sure we don't add duplicates
          const newSolvedFlags = currentSolved.includes(data.flagId) 
            ? currentSolved 
            : [...currentSolved, data.flagId];
            
          const updatedPlayer = { 
            ...prev, 
            score: prev.score + data.points,
            solvedFlags: newSolvedFlags
          };
          console.log('Updated player solvedFlags:', updatedPlayer.solvedFlags);
          return updatedPlayer;
        });
        
        setFlagAnswer('');
        setSelectedFlag(null);
        
        // Force a small delay to ensure state has updated
        setTimeout(() => {
          console.log('Flag completion processed, should now show as solved');
        }, 100);
      }
    });

    socket.on('hint-result', (data) => {
      if (data.success) {
        setHints(prev => ({
          ...prev,
          [selectedFlag]: [...(prev[selectedFlag] || []), data.hint]
        }));
        setPlayer(prev => ({ ...prev, coins: data.coinsLeft }));
        addMessage(`Hint: ${data.hint}`, 'info');
      } else {
        addMessage(data.message, 'error');
      }
    });

    socket.on('attack-result', (data) => {
      addMessage(data.message, data.success ? 'success' : 'error');
      if (data.success) {
        setPlayer(prev => ({ ...prev, coins: data.coinsLeft }));
        
        // Handle steal results - update player's solved flags and score
        if (data.stealResults && data.stealResults.length > 0) {
          // Show detailed steal logs for each target
          data.stealResults.forEach(result => {
            if (result.flagDetails && result.flagDetails.length > 0) {
              addMessage(`💰 Stolen from ${result.targetName}:`, 'success');
              result.flagDetails.forEach(flag => {
                addMessage(`  → ${flag.title} (${flag.difficulty}, ${flag.points} pts)`, 'success');
              });
              addMessage(`  Total gained: ${result.pointsStolen} points`, 'success');
            } else if (result.pointsStolen === 0) {
              addMessage(`🔍 ${result.targetName} had no flags to steal`, 'warning');
            }
          });
          
          setPlayer(prev => {
            const totalPointsGained = data.stealResults.reduce((sum, result) => sum + result.pointsStolen, 0);
            const newFlags = [...prev.solvedFlags];
            
            // Add stolen flags to solved flags
            data.stealResults.forEach(result => {
              result.stolenFlags.forEach(flagId => {
                if (!newFlags.includes(flagId)) {
                  newFlags.push(flagId);
                }
              });
            });
            
            return {
              ...prev,
              score: prev.score + totalPointsGained,
              solvedFlags: newFlags
            };
          });
        }
      }
    });

    socket.on('steal-notification', (data) => {
      addMessage(`� ${data.attacker} stole from you!`, 'error');
      
      // Show detailed information about what was stolen
      if (data.flagDetails && data.flagDetails.length > 0) {
        data.flagDetails.forEach(flag => {
          addMessage(`  → Lost: ${flag.title} (${flag.difficulty}, ${flag.points} pts)`, 'error');
        });
        addMessage(`  Total lost: ${data.pointsLost} points`, 'error');
      }
      
      // Update player state - remove stolen flags and points
      setPlayer(prev => ({
        ...prev,
        score: prev.score - data.pointsLost,
        solvedFlags: prev.solvedFlags.filter(flagId => !data.flagsLost.includes(flagId))
      }));
    });

    socket.on('attack-launched', (attack) => {
      setAttacks(prev => [...prev, attack]);
      // Show message about attack but don't affect this player unless they're targeted
      const targetMessage = attack.targetNames ? 
        (attack.targetNames.length > 1 ? `targeting ${attack.targetNames.join(', ')}` : `targeting ${attack.targetNames[0]}`) :
        'on all players';
      addMessage(`🚨 ${attack.attacker} launched a ${attack.type.toUpperCase()} attack ${targetMessage}!`, 'warning');
    });

    socket.on('attack-targeted', (data) => {
      // This event is only sent to players who are actually targeted
      setIsUnderAttack(true);
      addMessage(`🚨 You are under ${data.type.toUpperCase()} attack by ${data.attacker}!`, 'error');
      
      // Apply attack effects based on type with custom animations
      switch(data.type) {
        case 'jam':
          startJamAttackAnimation(data.attacker, data.duration);
          break;
        case 'ddos':
          startDdosAttackAnimation(data.attacker, data.duration);
          break;
        case 'steal':
          startStealAttackAnimation(data.attacker, data.duration);
          break;
        default:
          // Default behavior for other attack types
          setTimeout(() => {
            setIsUnderAttack(false);
            addMessage(`Attack ended - systems restored`, 'info');
          }, data.duration);
      }
    });

    socket.on('attack-ended', (attackId) => {
      setAttacks(prev => prev.filter(a => a.id !== attackId));
    });

    socket.on('player-achievement', (data) => {
      if (data.playerName !== player?.name) {
        addMessage(`${data.playerName} solved ${data.flagId.toUpperCase()}!`, 'info');
      }
    });

    socket.on('leaderboard-update', (data) => {
      // Update players list with current scores, excluding current player
      if (data.players && player) {
        const otherPlayers = data.players
          .filter(p => p.id !== player.id)
          .map(p => ({
            id: p.id,
            name: p.name,
            score: p.score
          }));
        setPlayers(otherPlayers);
      }
    });

    socket.on('session-error', (data) => {
      addMessage(data.message, 'error');
      setTimeout(() => router.push('/'), 2000);
    });
  };

  const addMessage = (message, type) => {
    setMessages(prev => [...prev, { 
      id: Date.now(), 
      text: message, 
      type, 
      timestamp: new Date().toLocaleTimeString() 
    }].slice(-10));
  };

  // Attack Animation Functions
  const startJamAttackAnimation = (attacker, duration) => {
    setAttackAnimation('jam');
    setTerminalLines([]);
    
    const jamMessages = [
      "SYSTEM BREACH DETECTED...",
      "UNAUTHORIZED ACCESS ATTEMPT",
      `SOURCE: ${attacker.toUpperCase()}`,
      "FIREWALL STATUS: COMPROMISED",
      "NETWORK SECURITY: OFFLINE",
      "ATTEMPTING COUNTERMEASURES...",
      "ERROR: COUNTERMEASURES FAILED",
      "SYSTEM JAMMED - FUNCTIONALITY LIMITED",
      "COMMUNICATION CHANNELS: DISRUPTED",
      "RESTORE PROTOCOL: INITIALIZING...",
      "PLEASE WAIT FOR SYSTEM RECOVERY..."
    ];

    let currentLine = 0;
    const typewriterInterval = setInterval(() => {
      if (currentLine < jamMessages.length) {
        setTerminalLines(prev => [...prev, jamMessages[currentLine]]);
        currentLine++;
      } else {
        clearInterval(typewriterInterval);
      }
    }, 800);

    // End animation after duration
    setTimeout(() => {
      clearInterval(typewriterInterval);
      setAttackAnimation(null);
      setTerminalLines([]);
      setIsUnderAttack(false);
    }, duration);
  };

  const startDdosAttackAnimation = (attacker, duration) => {
    setAttackAnimation('ddos');
    
    // Create visual lag/freeze effect
    setTimeout(() => {
      setAttackAnimation(null);
      setIsUnderAttack(false);
    }, duration);
  };

  const startStealAttackAnimation = (attacker, duration) => {
    setAttackAnimation('steal');
    
    setTimeout(() => {
      setAttackAnimation(null);
      setIsUnderAttack(false);
    }, duration);
  };

  const submitFlag = () => {
    if (selectedFlag && flagAnswer.trim() && gameStatus === 'active') {
      socket.emit('submit-flag', {
        flagId: selectedFlag,
        answer: flagAnswer.trim()
      });
    }
  };

  const buyHint = () => {
    if (selectedFlag && gameStatus === 'active') {
      const currentHints = hints[selectedFlag] || [];
      socket.emit('buy-hint', {
        flagId: selectedFlag,
        hintIndex: currentHints.length
      });
    }
  };

  const launchAttack = (attackType) => {
    if (gameStatus === 'active' && selectedTarget) {
      socket.emit('launch-attack', { 
        attackType: attackType,
        targetId: selectedTarget 
      });
    }
  };

  const goBack = () => {
    router.push('/');
  };

  // Show loading/error states
  if (!gameJoined) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="bg-gray-800 p-8 rounded-lg shadow-xl max-w-md w-full text-center">
          <div className="text-4xl mb-4">🏴‍☠️</div>
          {isConnected ? (
            <>
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-red-500 border-t-transparent mx-auto mb-4"></div>
              <p className="text-gray-400">Connecting to game session...</p>
            </>
          ) : (
            <>
              <p className="text-red-400 mb-4">Connection failed</p>
              <button 
                onClick={goBack}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
              >
                Go Back
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white relative">
      {/* Attack Animation Overlays */}
      {attackAnimation === 'jam' && (
        <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
          <div className="font-mono text-green-400 text-lg space-y-2 max-w-2xl mx-auto p-8">
            <div className="text-center text-red-400 text-2xl mb-8">⚠️ SYSTEM COMPROMISED ⚠️</div>
            {terminalLines.map((line, index) => (
              <div key={index} className="typing-animation">
                <span className="text-gray-500">{'>'}</span> {line}
              </div>
            ))}
            <div className="text-center text-yellow-400 mt-8 animate-pulse">
              SIGNAL JAMMED - RESTORING CONNECTION...
            </div>
          </div>
        </div>
      )}

      {attackAnimation === 'ddos' && (
        <div className="fixed inset-0 bg-red-900 bg-opacity-80 z-50 flex items-center justify-center">
          <div className="text-center animate-pulse glitch">
            <div className="text-6xl mb-4">⚠️</div>
            <div className="text-3xl font-bold text-red-400 mb-4">DDOS ATTACK</div>
            <div className="text-xl text-gray-300">System Overloaded</div>
            <div className="text-lg text-gray-400 animate-bounce mt-4">Loading...</div>
          </div>
        </div>
      )}

      {attackAnimation === 'steal' && (
        <div className="fixed inset-0 bg-purple-900 bg-opacity-80 z-50 flex items-center justify-center">
          <div className="text-center">
            <div className="text-6xl mb-4 animate-pulse">🕵️</div>
            <div className="text-3xl font-bold text-purple-400 mb-4">INFILTRATION DETECTED</div>
            <div className="text-xl text-gray-300">Unauthorized data access</div>
            <div className="text-lg text-gray-400 mt-4">Scanning for breaches...</div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-gray-800 p-4 shadow-lg">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <button
              onClick={goBack}
              className="text-gray-400 hover:text-white transition-colors"
            >
              ← Back
            </button>
            <h1 className="text-2xl font-bold text-red-400">🏴‍☠️ {sessionName}</h1>
            <div className={`px-3 py-1 rounded text-sm ${
              gameStatus === 'active' ? 'bg-green-600 text-white' :
              gameStatus === 'waiting' ? 'bg-yellow-600 text-white' :
              'bg-red-600 text-white'
            }`}>
              {gameStatus.toUpperCase()}
            </div>
          </div>
          {player && (
            <div className="flex items-center space-x-6">
              <span className="text-lg">👤 {player.name}</span>
              <span className="text-lg">🏆 {player.score} pts</span>
              <span className="text-lg">🪙 {player.coins} coins</span>
              <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            </div>
          )}
        </div>
      </div>

      {/* Game Status Message */}
      {gameStatus !== 'active' && (
        <div className="bg-yellow-900/30 border border-yellow-500 p-4 text-center text-yellow-300">
          {gameStatus === 'waiting' ? '⏳ Waiting for admin to start the game...' :
           gameStatus === 'ended' ? '🏁 Game has ended!' : '⚠️ Game status unknown'}
        </div>
      )}

      {/* Challenge Completed Screen */}
      {challengeCompleted && (
        <div className="bg-green-900/30 border border-green-500 p-8 text-center mb-6">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-3xl font-bold text-green-400 mb-2">Challenge Completed!</h2>
          <p className="text-green-300 mb-4">
            Congratulations! You've successfully solved all {flags.length} challenges!
          </p>
          <div className="text-xl text-green-200">
            Final Score: <span className="font-bold text-green-400">{player?.score} points</span>
          </div>
          <div className="text-sm text-green-300 mt-4">
            Page will auto-refresh in a moment...
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Flags Section */}
        <div className="lg:col-span-2">
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4 text-red-400">🎯 Challenges</h2>
            <div className="space-y-4">
              {flags.map((flag) => (
                <div
                  key={flag.id}
                  className={`p-4 rounded border-2 cursor-pointer transition-all ${
                    selectedFlag === flag.id
                      ? 'border-red-400 bg-gray-700'
                      : 'border-gray-600 hover:border-gray-500 bg-gray-750'
                  } ${player?.solvedFlags?.includes(flag.id) ? 'opacity-50' : ''} ${
                    gameStatus !== 'active' ? 'cursor-not-allowed opacity-75' : ''
                  }`}
                  onClick={() => gameStatus === 'active' && !player?.solvedFlags?.includes(flag.id) && setSelectedFlag(flag.id)}
                >
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-medium">
                      {flag.title || flag.id.toUpperCase()}
                      {player?.solvedFlags?.includes(flag.id) && <span className="text-green-400 ml-2">✓ Solved</span>}
                    </h3>
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-1 rounded text-xs ${
                        flag.difficulty === 'easy' ? 'bg-green-600' :
                        flag.difficulty === 'medium' ? 'bg-yellow-600' : 'bg-red-600'
                      }`}>
                        {flag.difficulty}
                      </span>
                      <span className="text-yellow-400">{flag.points} pts</span>
                    </div>
                  </div>
                  <p className="text-gray-300">{flag.clue}</p>
                  
                  {selectedFlag === flag.id && !player?.solvedFlags?.includes(flag.id) && gameStatus === 'active' && (
                    <div className="mt-4 space-y-3">
                      {/* Hints */}
                      {hints[flag.id] && hints[flag.id].length > 0 && (
                        <div className="bg-blue-900/30 p-3 rounded">
                          <h4 className="font-medium text-blue-400 mb-2">💡 Hints:</h4>
                          {hints[flag.id].map((hint, index) => (
                            <p key={index} className="text-sm text-blue-300 mb-1">• {hint}</p>
                          ))}
                        </div>
                      )}
                      
                      {/* Flag Input */}
                      <div className="flex space-x-2">
                        <input
                          type="text"
                          value={flagAnswer}
                          onChange={(e) => setFlagAnswer(e.target.value)}
                          placeholder="Enter flag..."
                          className="flex-1 p-2 border border-gray-600 rounded bg-gray-700 text-white"
                          onKeyPress={(e) => e.key === 'Enter' && submitFlag()}
                          disabled={isUnderAttack}
                        />
                        <button
                          onClick={submitFlag}
                          disabled={!flagAnswer.trim() || isUnderAttack}
                          className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-4 py-2 rounded"
                        >
                          Submit
                        </button>
                      </div>
                      
                      {/* Buy Hint Button */}
                      <button
                        onClick={buyHint}
                        disabled={player.coins < 10}
                        className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-3 py-1 rounded text-sm"
                      >
                        Buy Hint (10 coins)
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Side Panel */}
        <div className="space-y-6">
          {/* Attack Panel */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4 text-red-400">⚔️ Attacks</h2>
            
            {/* Target Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">Select Target:</label>
              <select 
                value={selectedTarget} 
                onChange={(e) => setSelectedTarget(e.target.value)}
                className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
              >
                <option value="">Choose target...</option>
                {players.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.score} pts)</option>
                ))}
                <option value="all">🎯 All Players (+50 coins cost)</option>
              </select>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => launchAttack('sleep')}
                disabled={player?.coins < 10 || isUnderAttack || gameStatus !== 'active' || !selectedTarget}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white p-2 rounded text-sm"
              >
                Sleep Attack (10 coins)
                <div className="text-xs opacity-75">Freeze target for 10s</div>
              </button>
              
              <button
                onClick={() => launchAttack('jam')}
                disabled={player?.coins < (selectedTarget === 'all' ? 150 : 50) || isUnderAttack || gameStatus !== 'active' || !selectedTarget}
                className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 text-white p-2 rounded text-sm"
              >
                Jam Attack ({selectedTarget === 'all' ? '150' : '50'} coins)
                <div className="text-xs opacity-75">Disrupt target{selectedTarget === 'all' ? 's' : ''} for {selectedTarget === 'all' ? '7' : '5'}s</div>
              </button>
              
              <button
                onClick={() => launchAttack('steal')}
                disabled={player?.coins < (selectedTarget === 'all' ? 200 : 100) || isUnderAttack || gameStatus !== 'active' || !selectedTarget}
                className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white p-2 rounded text-sm"
              >
                Data Steal ({selectedTarget === 'all' ? '200' : '100'} coins)
                <div className="text-xs opacity-75">Steal solved flags & points from target{selectedTarget === 'all' ? 's' : ''}</div>
              </button>
            </div>

            {!selectedTarget && players.length > 0 && (
              <div className="mt-3 text-xs text-yellow-300 text-center">
                ⚠️ Select a target to launch attacks
              </div>
            )}

            {players.length === 0 && (
              <div className="mt-3 text-xs text-gray-400 text-center">
                No other players to attack
              </div>
            )}

            {/* Active Attacks */}
            {attacks.length > 0 && (
              <div className="mt-4 p-3 bg-red-900/30 rounded">
                <h4 className="font-medium text-red-400 mb-2">🚨 Active Attacks:</h4>
                {attacks.map((attack) => (
                  <div key={attack.id} className="text-sm text-red-300">
                    <div className="font-medium">{attack.attacker}: {attack.type.toUpperCase()}</div>
                    {attack.targetNames && (
                      <div className="text-xs opacity-75">
                        → {attack.targetNames.length > 1 ? `${attack.targetNames.join(', ')}` : attack.targetNames[0]}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Messages */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4 text-green-400">📢 Messages</h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`text-sm p-2 rounded ${
                    msg.type === 'success' ? 'bg-green-900/30 text-green-300' :
                    msg.type === 'error' ? 'bg-red-900/30 text-red-300' :
                    msg.type === 'warning' ? 'bg-yellow-900/30 text-yellow-300' :
                    'bg-blue-900/30 text-blue-300'
                  }`}
                >
                  <span className="text-xs opacity-75">{msg.timestamp}</span>
                  <div>{msg.text}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Attack Overlay */}
      {isUnderAttack && (
        <div className="fixed inset-0 bg-red-900/50 flex items-center justify-center z-50">
          <div className="bg-red-800 p-8 rounded-lg text-center animate-pulse">
            <h2 className="text-2xl font-bold text-white mb-2">🚨 UNDER ATTACK! 🚨</h2>
            <p className="text-red-200">System temporarily compromised...</p>
          </div>
        </div>
      )}
    </div>
  );
}