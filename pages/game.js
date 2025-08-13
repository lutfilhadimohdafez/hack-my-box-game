import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import io from 'socket.io-client';

let socket;

export default function GamePage() {
  const router = useRouter();
  const [isConnected, setIsConnected] = useState(false);
  const [player, setPlayer] = useState(null);
  const [flags, setFlags] = useState([]);
  const [gameJoined, setGameJoined] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [selectedFlag, setSelectedFlag] = useState(null);
  const [flagAnswer, setFlagAnswer] = useState('');
  const [messages, setMessages] = useState([]);
  const [hints, setHints] = useState({});
  const [attacks, setAttacks] = useState([]);
  const [isUnderAttack, setIsUnderAttack] = useState(false);
  const [gameStatus, setGameStatus] = useState('waiting');

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
      setGameJoined(true);
      setGameStatus('active');
      addMessage(`Welcome to ${data.sessionName}!`, 'success');
      console.log('Game joined successfully, flags:', data.flags?.length);
    });

    socket.on('session-status-changed', (data) => {
      setGameStatus(data.status);
      addMessage(data.message, data.status === 'active' ? 'success' : 'warning');
    });

    socket.on('flag-result', (data) => {
      addMessage(data.message, data.success ? 'success' : 'error');
      if (data.success) {
        setPlayer(prev => ({ 
          ...prev, 
          score: prev.score + data.points,
          solvedFlags: [...(prev.solvedFlags || []), selectedFlag]
        }));
        setFlagAnswer('');
        setSelectedFlag(null);
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
      }
    });

    socket.on('attack-launched', (attack) => {
      setAttacks(prev => [...prev, attack]);
      setIsUnderAttack(true);
      addMessage(`🚨 ${attack.attacker} launched a ${attack.type.toUpperCase()} attack!`, 'warning');
      
      // Simulate attack effects
      if (attack.type === 'sleep') {
        setTimeout(() => setIsUnderAttack(false), attack.duration);
      } else {
        setTimeout(() => setIsUnderAttack(false), 3000);
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
    if (gameStatus === 'active') {
      socket.emit('launch-attack', { attackType });
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
    <div className="min-h-screen bg-gray-900 text-white">
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
            <div className="space-y-3">
              <button
                onClick={() => launchAttack('sleep')}
                disabled={player?.coins < 10 || isUnderAttack || gameStatus !== 'active'}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white p-2 rounded text-sm"
              >
                Sleep Attack (10 coins)
                <div className="text-xs opacity-75">Freeze opponents for 10s</div>
              </button>
              
              <button
                onClick={() => launchAttack('jam')}
                disabled={player?.coins < 50 || isUnderAttack || gameStatus !== 'active'}
                className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 text-white p-2 rounded text-sm"
              >
                Jam Attack (50 coins)
                <div className="text-xs opacity-75">Disrupt all PCs for 5s</div>
              </button>
              
              <button
                onClick={() => launchAttack('steal')}
                disabled={player?.coins < 100 || isUnderAttack || gameStatus !== 'active'}
                className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white p-2 rounded text-sm"
              >
                Data Steal (100 coins)
                <div className="text-xs opacity-75">Steal team data</div>
              </button>
            </div>

            {/* Active Attacks */}
            {attacks.length > 0 && (
              <div className="mt-4 p-3 bg-red-900/30 rounded">
                <h4 className="font-medium text-red-400 mb-2">🚨 Active Attacks:</h4>
                {attacks.map((attack) => (
                  <div key={attack.id} className="text-sm text-red-300">
                    {attack.attacker}: {attack.type.toUpperCase()}
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