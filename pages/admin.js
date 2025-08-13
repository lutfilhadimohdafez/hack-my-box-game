import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import io from 'socket.io-client';

let socket;

export default function AdminPanel() {
  const router = useRouter();
  const [isConnected, setIsConnected] = useState(false);
  const [sessionData, setSessionData] = useState(null);
  const [players, setPlayers] = useState([]);
  const [gameStatus, setGameStatus] = useState('waiting');
  const [messages, setMessages] = useState([]);
  
  // Flag management state
  const [flags, setFlags] = useState([]);
  const [showFlagForm, setShowFlagForm] = useState(false);
  const [editingFlag, setEditingFlag] = useState(null);
  const [flagForm, setFlagForm] = useState({
    title: '',
    clue: '',
    answer: '',
    hints: [''],
    difficulty: 'medium',
    points: 100
  });

  useEffect(() => {
    socketInitializer();
    
    return () => {
      if (socket) socket.disconnect();
    };
  }, []);

  const socketInitializer = async () => {
    socket = io();

    socket.on('connect', () => {
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('leaderboard-update', (data) => {
      setPlayers(data.leaderboard);
    });

    socket.on('admin-action-success', (data) => {
      addMessage(data.message, 'success');
    });

    socket.on('admin-action-error', (data) => {
      addMessage(data.message, 'error');
    });

    socket.on('session-status-changed', (data) => {
      setGameStatus(data.status);
      addMessage(data.message, 'success');
    });

    socket.on('player-achievement', (data) => {
      addMessage(`${data.playerName} solved ${data.flagId.toUpperCase()}!`, 'info');
    });

    socket.on('attack-launched', (attack) => {
      addMessage(`${attack.attacker} launched ${attack.type.toUpperCase()} attack`, 'warning');
    });

    // Flag management socket handlers
    socket.on('admin-flags-list', (data) => {
      setFlags(data.flags);
    });

    socket.on('admin-flag-added', (data) => {
      addMessage(data.message, 'success');
      setShowFlagForm(false);
      resetFlagForm();
    });

    socket.on('admin-flag-updated', (data) => {
      addMessage(data.message, 'success');
      setShowFlagForm(false);
      setEditingFlag(null);
      resetFlagForm();
    });

    socket.on('admin-flag-deleted', (data) => {
      addMessage(data.message, 'success');
    });

    socket.on('admin-flags-error', (data) => {
      addMessage(data.message, 'error');
    });
  };

  const addMessage = (message, type) => {
    setMessages(prev => [...prev, { 
      id: Date.now(), 
      text: message, 
      type, 
      timestamp: new Date().toLocaleTimeString() 
    }].slice(-20));
  };

  // Flag management functions
  const resetFlagForm = () => {
    setFlagForm({
      title: '',
      clue: '',
      answer: '',
      hints: [''],
      difficulty: 'medium',
      points: 100
    });
  };

  const handleFlagSubmit = (e) => {
    e.preventDefault();
    if (!sessionData || !socket) return;

    const flagData = {
      sessionId: sessionData.id,
      title: flagForm.title,
      clue: flagForm.clue,
      answer: flagForm.answer,
      hints: flagForm.hints.filter(hint => hint.trim() !== ''),
      difficulty: flagForm.difficulty,
      points: parseInt(flagForm.points)
    };

    if (editingFlag) {
      socket.emit('admin-update-flag', { ...flagData, flagId: editingFlag.id });
    } else {
      socket.emit('admin-add-flag', flagData);
    }
  };

  const editFlag = (flag) => {
    setEditingFlag(flag);
    setFlagForm({
      title: flag.title,
      clue: flag.clue,
      answer: flag.answer,
      hints: flag.hints.length > 0 ? flag.hints : [''],
      difficulty: flag.difficulty,
      points: flag.points
    });
    setShowFlagForm(true);
  };

  const deleteFlag = (flagId) => {
    if (confirm('Are you sure you want to delete this flag?')) {
      socket.emit('admin-delete-flag', { flagId, sessionId: sessionData.id });
    }
  };

  const addHintField = () => {
    setFlagForm(prev => ({
      ...prev,
      hints: [...prev.hints, '']
    }));
  };

  const updateHint = (index, value) => {
    setFlagForm(prev => ({
      ...prev,
      hints: prev.hints.map((hint, i) => i === index ? value : hint)
    }));
  };

  const removeHint = (index) => {
    setFlagForm(prev => ({
      ...prev,
      hints: prev.hints.filter((_, i) => i !== index)
    }));
  };

  const controlSession = (action) => {
    if (sessionData) {
      socket.emit('admin-control-session', {
        action,
        sessionCode: sessionData.sessionCode
      });
    }
  };

  const goBack = () => {
    router.push('/');
  };

  // Get session info from URL params and join session room
  useEffect(() => {
    const { session, sessionCode, sessionName } = router.query;
    if (session) {
      setSessionData({
        id: session,
        sessionCode: sessionCode || 'UNKNOWN',
        sessionName: decodeURIComponent(sessionName || 'Unknown Session')
      });
      
      // Join the session room for live updates
      if (socket && isConnected) {
        console.log('Admin joining session room:', session);
        socket.emit('admin-join-session', { sessionId: session });
        // Load flags after joining
        socket.emit('admin-get-flags', { sessionId: session });
      }
    }
  }, [router.query, socket, isConnected]);

  if (!sessionData) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-red-500 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-400">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 p-4 shadow-lg">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <button
              onClick={goBack}
              className="text-gray-400 hover:text-white transition-colors"
            >
              ← Back
            </button>
            <h1 className="text-2xl font-bold text-red-400">👑 Admin Panel</h1>
            <div className="text-gray-300">{sessionData.sessionName}</div>
          </div>
          <div className="flex items-center space-x-6">
            <span className="text-lg">📊 {players.length} players</span>
            <div className={`px-3 py-1 rounded text-sm ${
              gameStatus === 'active' ? 'bg-green-600' :
              gameStatus === 'waiting' ? 'bg-yellow-600' : 'bg-red-600'
            }`}>
              {gameStatus.toUpperCase()}
            </div>
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4">
        {/* Main Grid - Game Controls and Player Management */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Left Column - Game Controls and Quick Actions */}
          <div>
            {/* Game Controls */}
            <div className="bg-gray-800 rounded-lg p-6 mb-6">
              <h2 className="text-xl font-bold mb-4 text-red-400">🎮 Game Controls</h2>
              
              <div className="space-y-3">
                <button
                  onClick={() => controlSession('start')}
                  disabled={gameStatus === 'active'}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white p-3 rounded font-medium"
                >
                  ▶️ Start Game
                </button>
                
                <button
                  onClick={() => controlSession('end')}
                  disabled={gameStatus !== 'active'}
                  className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white p-3 rounded font-medium"
                >
                  ⏹️ End Game
                </button>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-bold mb-4 text-yellow-400">⚡ Quick Actions</h2>
              <div className="space-y-3">
                <button
                  onClick={() => {
                    const leaderboardUrl = `/leaderboard?session=${sessionData.id}&sessionCode=${sessionData.sessionCode}&sessionName=${encodeURIComponent(sessionData.sessionName)}`;
                    router.push(leaderboardUrl);
                  }}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white p-2 rounded text-sm"
                >
                  📊 View Leaderboard Display
                </button>
                
                <button
                  onClick={() => {
                    const leaderboardUrl = `/leaderboard?session=${sessionData.id}&sessionCode=${sessionData.sessionCode}&sessionName=${encodeURIComponent(sessionData.sessionName)}`;
                    window.open(leaderboardUrl, '_blank');
                  }}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded text-sm"
                >
                  🖥️ Open Leaderboard (New Tab)
                </button>
              </div>
            </div>
          </div>

          {/* Right Column - Player Management and Activity */}
          <div>
            {/* Player Management */}
            <div className="bg-gray-800 rounded-lg p-6 mb-6">
              <h2 className="text-xl font-bold mb-4 text-green-400">👥 Players ({players.length})</h2>
              
              {players.length === 0 ? (
                <div className="text-center text-gray-400 py-8">
                  <div className="text-4xl mb-2">👻</div>
                  <div>No players connected</div>
                </div>
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {players.map((player) => (
                    <div
                      key={player.name}
                      className={`p-3 rounded border-2 ${
                        player.rank === 1 ? 'border-yellow-400 bg-yellow-900/20' :
                        player.rank === 2 ? 'border-gray-400 bg-gray-700/20' :
                        player.rank === 3 ? 'border-orange-600 bg-orange-900/20' :
                        'border-gray-600 bg-gray-700/20'
                      } ${player.isAttacking ? 'animate-pulse border-red-500' : ''}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="text-xl">
                            {player.rank === 1 ? '🥇' :
                             player.rank === 2 ? '🥈' :
                             player.rank === 3 ? '🥉' : `#${player.rank}`}
                          </div>
                          <div>
                            <div className="font-medium">
                              {player.name}
                              {player.isAttacking && <span className="text-red-400 ml-2">⚔️</span>}
                            </div>
                            <div className="text-sm text-gray-400">
                              {player.solvedFlags} flags solved
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-lg">{player.score}</div>
                          <div className="text-sm text-gray-400">points</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Activity Log */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-bold mb-4 text-blue-400">📋 Activity Log</h2>
              
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {messages.length === 0 ? (
                  <div className="text-center text-gray-400 py-8">
                    <div className="text-4xl mb-2">📝</div>
                    <div>No activity yet</div>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`text-sm p-3 rounded border-l-4 ${
                        msg.type === 'success' ? 'bg-green-900/30 border-green-500 text-green-300' :
                        msg.type === 'error' ? 'bg-red-900/30 border-red-500 text-red-300' :
                        msg.type === 'warning' ? 'bg-yellow-900/30 border-yellow-500 text-yellow-300' :
                        'bg-blue-900/30 border-blue-500 text-blue-300'
                      }`}
                    >
                      <div className="font-medium">{msg.text}</div>
                      <div className="text-xs opacity-75 mt-1">{msg.timestamp}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Flag Management Section */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-orange-400">🚩 Flag Management</h2>
            <button
              onClick={() => {
                setShowFlagForm(true);
                setEditingFlag(null);
                resetFlagForm();
              }}
              className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded text-sm"
            >
              ➕ Add New Flag
            </button>
          </div>

          {/* Flags List */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
            {flags.map((flag) => (
              <div key={flag.id} className="bg-gray-700 rounded-lg p-4 border border-gray-600">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-lg text-white">{flag.title}</h3>
                  <div className="flex space-x-1">
                    <button
                      onClick={() => editFlag(flag)}
                      className="text-blue-400 hover:text-blue-300 text-sm"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => deleteFlag(flag.id)}
                      className="text-red-400 hover:text-red-300 text-sm"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
                <div className="text-sm text-gray-300 mb-2">{flag.clue}</div>
                <div className="flex justify-between items-center text-xs">
                  <span className={`px-2 py-1 rounded ${
                    flag.difficulty === 'easy' ? 'bg-green-600' :
                    flag.difficulty === 'medium' ? 'bg-yellow-600' : 'bg-red-600'
                  }`}>
                    {flag.difficulty}
                  </span>
                  <span className="text-yellow-400">{flag.points} pts</span>
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {flag.hints?.length || 0} hints available
                </div>
              </div>
            ))}
            
            {flags.length === 0 && (
              <div className="col-span-full text-center text-gray-400 py-8">
                <div className="text-4xl mb-2">🚩</div>
                <div>No flags created yet</div>
              </div>
            )}
          </div>

          {/* Flag Form Modal */}
          {showFlagForm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-screen overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold text-orange-400">
                    {editingFlag ? 'Edit Flag' : 'Add New Flag'}
                  </h3>
                  <button
                    onClick={() => {
                      setShowFlagForm(false);
                      setEditingFlag(null);
                      resetFlagForm();
                    }}
                    className="text-gray-400 hover:text-white"
                  >
                    ✕
                  </button>
                </div>
                
                <form onSubmit={handleFlagSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Title</label>
                    <input
                      type="text"
                      value={flagForm.title}
                      onChange={(e) => setFlagForm(prev => ({ ...prev, title: e.target.value }))}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Clue</label>
                    <textarea
                      value={flagForm.clue}
                      onChange={(e) => setFlagForm(prev => ({ ...prev, clue: e.target.value }))}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white h-20"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Answer</label>
                    <input
                      type="text"
                      value={flagForm.answer}
                      onChange={(e) => setFlagForm(prev => ({ ...prev, answer: e.target.value }))}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                      required
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Difficulty</label>
                      <select
                        value={flagForm.difficulty}
                        onChange={(e) => setFlagForm(prev => ({ ...prev, difficulty: e.target.value }))}
                        className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                      >
                        <option value="easy">Easy</option>
                        <option value="medium">Medium</option>
                        <option value="hard">Hard</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-1">Points</label>
                      <input
                        type="number"
                        value={flagForm.points}
                        onChange={(e) => setFlagForm(prev => ({ ...prev, points: parseInt(e.target.value) }))}
                        className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                        min="1"
                        required
                      />
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-sm font-medium">Hints</label>
                      <button
                        type="button"
                        onClick={addHintField}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm"
                      >
                        + Add Hint
                      </button>
                    </div>
                    {flagForm.hints.map((hint, index) => (
                      <div key={index} className="flex space-x-2 mb-2">
                        <input
                          type="text"
                          value={hint}
                          onChange={(e) => updateHint(index, e.target.value)}
                          placeholder={`Hint ${index + 1}`}
                          className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                        />
                        {flagForm.hints.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeHint(index)}
                            className="text-red-400 hover:text-red-300 px-2"
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  
                  <div className="flex space-x-3 pt-4">
                    <button
                      type="submit"
                      className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-2 rounded"
                    >
                      {editingFlag ? 'Update Flag' : 'Add Flag'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowFlagForm(false);
                        setEditingFlag(null);
                        resetFlagForm();
                      }}
                      className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 rounded"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Stats */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 border-t border-gray-700 p-4">
        <div className="max-w-7xl mx-auto flex justify-center items-center space-x-8 text-sm">
          <div className="flex items-center space-x-2">
            <span className="text-yellow-400">🏆</span>
            <span>
              Leader: {players.length > 0 ? `${players[0].name} (${players[0].score} pts)` : 'None'}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-green-400">👥</span>
            <span>Players: {players.length}</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-blue-400">📡</span>
            <span>Status: {isConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-orange-400">🚩</span>
            <span>Flags: {flags.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
