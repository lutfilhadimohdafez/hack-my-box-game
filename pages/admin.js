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
  };

  const addMessage = (message, type) => {
    setMessages(prev => [...prev, { 
      id: Date.now(), 
      text: message, 
      type, 
      timestamp: new Date().toLocaleTimeString() 
    }].slice(-20)); // Keep more messages for admin
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
        <div className="max-w-6xl mx-auto flex justify-between items-center">
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

      <div className="max-w-6xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Game Controls */}
        <div className="lg:col-span-1">
          <div className="bg-gray-800 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-bold mb-4 text-red-400">🎮 Game Controls</h2>
            
            <div className="space-y-3">
              <button
                onClick={() => controlSession('start')}
                disabled={gameStatus === 'active'}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white p-3 rounded font-medium"
              >
                🚀 Start Game
              </button>
              
              <button
                onClick={() => controlSession('pause')}
                disabled={gameStatus !== 'active'}
                className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 text-white p-3 rounded font-medium"
              >
                ⏸️ Pause Game
              </button>
              
              <button
                onClick={() => controlSession('end')}
                disabled={gameStatus === 'ended'}
                className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white p-3 rounded font-medium"
              >
                🏁 End Game
              </button>
            </div>

            <div className="mt-6 p-4 bg-blue-900/30 rounded">
              <h3 className="font-medium text-blue-400 mb-2">Session Info</h3>
              <div className="text-sm text-blue-300 space-y-1">
                <div>Code: <span className="font-mono">{sessionData.sessionCode}</span></div>
                <div>Status: <span className="capitalize">{gameStatus}</span></div>
                <div>Players: {players.length}</div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4 text-yellow-400">⚡ Quick Actions</h2>
            <div className="space-y-3">
              <button
                onClick={() => router.push('/leaderboard')}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white p-2 rounded text-sm"
              >
                📊 View Leaderboard Display
              </button>
              
              <button
                onClick={() => window.open('/leaderboard', '_blank')}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded text-sm"
              >
                🖥️ Open Leaderboard (New Tab)
              </button>
            </div>
          </div>
        </div>

        {/* Player Management */}
        <div className="lg:col-span-1">
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4 text-green-400">👥 Players ({players.length})</h2>
            
            {players.length === 0 ? (
              <div className="text-center text-gray-400 py-8">
                <div className="text-4xl mb-2">👻</div>
                <div>No players connected</div>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
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
        </div>

        {/* Activity Log */}
        <div className="lg:col-span-1">
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4 text-blue-400">📋 Activity Log</h2>
            
            <div className="space-y-2 max-h-96 overflow-y-auto">
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

      {/* Bottom Stats */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 border-t border-gray-700 p-4">
        <div className="max-w-6xl mx-auto flex justify-center items-center space-x-8 text-sm">
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
        </div>
      </div>
    </div>
  );
}