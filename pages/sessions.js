import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import io from 'socket.io-client';

let socket;

export default function SessionManager() {
  const router = useRouter();
  const [isConnected, setIsConnected] = useState(false);
  const [allSessions, setAllSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    socketInitializer();
    
    return () => {
      if (socket) socket.disconnect();
    };
  }, []);

  // Auto-load sessions when socket connects
  useEffect(() => {
    if (socket && isConnected) {
      // Add a small delay to ensure all socket handlers are set up
      setTimeout(() => {
        loadAllSessions();
      }, 100);
    }
  }, [socket, isConnected]);

  // Also load when tab becomes visible (page focus)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && socket && isConnected) {
        setTimeout(() => loadAllSessions(), 200);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [socket, isConnected]);

  const socketInitializer = async () => {
    socket = io();

    socket.on('connect', () => {
      setIsConnected(true);
      loadAllSessions();
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    // Session management socket handlers
    socket.on('admin-all-sessions-list', (data) => {
      setAllSessions(data.sessions);
      setLoading(false);
    });

    socket.on('admin-session-killed', (data) => {
      addMessage(data.message, 'success');
      setTimeout(() => loadAllSessions(), 500); // Refresh the list with delay
    });

    socket.on('admin-session-deleted', (data) => {
      addMessage(data.message, 'success');
      setTimeout(() => loadAllSessions(), 500); // Refresh the list with delay
    });

    socket.on('admin-sessions-error', (data) => {
      addMessage(data.message, 'error');
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

  const loadAllSessions = () => {
    if (socket && isConnected) {
      socket.emit('admin-get-all-sessions');
    }
  };

  const killSession = (sessionId, sessionCode) => {
    if (confirm(`Are you sure you want to terminate session "${sessionCode}"? This will end the game for all players.`)) {
      socket.emit('admin-kill-session', { sessionId });
    }
  };

  const deleteSession = (sessionId, sessionCode) => {
    if (confirm(`Are you sure you want to PERMANENTLY DELETE session "${sessionCode}"? This will remove all data including players, flags, and game history. This action cannot be undone.`)) {
      socket.emit('admin-delete-session', { sessionId });
    }
  };

  const goBack = () => {
    router.push('/');
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-green-600 text-white';
      case 'waiting': return 'bg-yellow-600 text-black';
      case 'ended': return 'bg-red-600 text-white';
      default: return 'bg-gray-600 text-white';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Not set';
    return new Date(dateString).toLocaleString();
  };

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
            <h1 className="text-2xl font-bold text-red-400">🎛️ Session Manager</h1>
            <span className="text-gray-300">Master Control Panel</span>
          </div>
          <div className="flex items-center space-x-6">
            <button
              onClick={loadAllSessions}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm"
            >
              🔄 Refresh
            </button>
            <span className="text-lg">📊 {allSessions.length} sessions</span>
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4">
        {/* Messages */}
        {messages.length > 0 && (
          <div className="mb-6 space-y-2">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`p-3 rounded-lg flex justify-between items-center ${
                  message.type === 'success' ? 'bg-green-900 border border-green-600' :
                  message.type === 'error' ? 'bg-red-900 border border-red-600' :
                  message.type === 'warning' ? 'bg-yellow-900 border border-yellow-600' :
                  'bg-blue-900 border border-blue-600'
                }`}
              >
                <span>{message.text}</span>
                <span className="text-xs opacity-75">{message.timestamp}</span>
              </div>
            ))}
          </div>
        )}

        {/* Session Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-2xl font-bold text-green-400">
              {allSessions.filter(s => s.status === 'active').length}
            </div>
            <div className="text-sm text-gray-400">Active Sessions</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-2xl font-bold text-yellow-400">
              {allSessions.filter(s => s.status === 'waiting').length}
            </div>
            <div className="text-sm text-gray-400">Waiting Sessions</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-2xl font-bold text-red-400">
              {allSessions.filter(s => s.status === 'ended').length}
            </div>
            <div className="text-sm text-gray-400">Ended Sessions</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-2xl font-bold text-blue-400">
              {allSessions.reduce((sum, s) => sum + (s.player_count || 0), 0)}
            </div>
            <div className="text-sm text-gray-400">Total Players</div>
          </div>
        </div>

        {/* Sessions List */}
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-red-400">All Game Sessions</h2>
            <div className="text-sm text-gray-400">
              Click "Manage" to open session admin panel
            </div>
          </div>

          {loading ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-2">⏳</div>
              <div>Loading sessions...</div>
            </div>
          ) : (
            <div className="space-y-4">
              {allSessions.map((session) => (
                <div key={session.id} className="bg-gray-700 rounded-lg p-4 border border-gray-600 hover:border-gray-500 transition-colors">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-3">
                        <h3 className="font-bold text-lg text-white">{session.session_name}</h3>
                        <span className="text-sm font-mono bg-gray-800 px-2 py-1 rounded text-cyan-400">
                          {session.session_code}
                        </span>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(session.status)}`}>
                          {session.status.toUpperCase()}
                        </span>
                        <span className="text-sm text-green-400">
                          👥 {session.player_count} players
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-300">
                        <div>
                          <span className="text-gray-500">Created:</span>
                          <div className="text-white">{formatDate(session.created_at)}</div>
                        </div>
                        <div>
                          <span className="text-gray-500">Started:</span>
                          <div className="text-white">{formatDate(session.started_at)}</div>
                        </div>
                        <div>
                          <span className="text-gray-500">Ended:</span>
                          <div className="text-white">{formatDate(session.ended_at)}</div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex space-x-2 ml-4">
                      <button
                        onClick={() => window.open(`/admin?session=${session.id}&sessionCode=${session.session_code}&sessionName=${encodeURIComponent(session.session_name)}`, '_blank')}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm"
                        title="Open session admin panel"
                      >
                        🚀 Manage
                      </button>
                      {session.status !== 'ended' && (
                        <button
                          onClick={() => killSession(session.id, session.session_code)}
                          className="bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-2 rounded text-sm"
                          title="Terminate session (end game)"
                        >
                          ⏹️ End
                        </button>
                      )}
                      <button
                        onClick={() => deleteSession(session.id, session.session_code)}
                        className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded text-sm"
                        title="Permanently delete session and all data"
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              
              {allSessions.length === 0 && !loading && (
                <div className="text-center text-gray-400 py-8">
                  <div className="text-4xl mb-2">🎛️</div>
                  <div>No sessions found</div>
                  <button
                    onClick={loadAllSessions}
                    className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
                  >
                    Retry Loading
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 text-center text-gray-500 text-sm pb-4">
        Session Manager - CTF Game Administration Tool
      </div>
    </div>
  );
}
