import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import io from 'socket.io-client';

let socket;

export default function JoinSession() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    sessionCode: '',
    sessionName: '', // For admin creating new session
    username: '',
    isAdmin: false,
    adminPassword: ''
  });
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [currentJoinData, setCurrentJoinData] = useState(null); // Store current join attempt

  useEffect(() => {
    socketInitializer();
    
    // Pre-fill demo code if in development
    if (process.env.NODE_ENV === 'development') {
      setFormData(prev => ({
        ...prev,
        sessionCode: 'DEMO2024'
      }));
    }
    
    return () => {
      if (socket) socket.disconnect();
    };
  }, []);

  const socketInitializer = async () => {
    console.log('Initializing socket...');
    socket = io();

    socket.on('connect', () => {
      console.log('Socket connected:', socket.id);
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected');
      setIsConnected(false);
    });

    socket.on('session-error', (data) => {
      setError(data.message);
      setIsConnecting(false);
    });

    socket.on('game-joined', (data) => {
      console.log('Game joined successfully:', data);
      
      // Try to get join data from state or sessionStorage
      let joinData = currentJoinData;
      if (!joinData && typeof window !== 'undefined') {
        const stored = sessionStorage.getItem('pendingJoinData');
        if (stored) {
          joinData = JSON.parse(stored);
          console.log('Retrieved join data from sessionStorage for game redirect:', joinData);
        }
      }
      
      // Use stored join data for navigation
      if (joinData) {
        const sessionCode = joinData.sessionCode;
        const username = joinData.username;
        console.log('Redirecting to game page with:', { sessionCode, username });
        
        // Clear the stored data
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('pendingJoinData');
        }
        
        router.push(`/game?sessionCode=${sessionCode}&username=${username}`);
      } else {
        console.log('No join data available, redirecting to basic game page');
        router.push('/game');
      }
    });

    socket.on('admin-authenticated', (data) => {
      console.log('Admin authenticated:', data);
      console.log('Current join data:', currentJoinData);
      
      // Try to get join data from state or sessionStorage
      let joinData = currentJoinData;
      if (!joinData && typeof window !== 'undefined') {
        const stored = sessionStorage.getItem('pendingJoinData');
        if (stored) {
          joinData = JSON.parse(stored);
          console.log('Retrieved join data from sessionStorage:', joinData);
        }
      }
      
      // Pass sessionId, sessionCode, and sessionName in URL for admin panel
      if (joinData) {
        const sessionName = joinData.sessionName || data.sessionName || 'New Session';
        const adminUrl = `/admin?session=${data.sessionId}&sessionCode=${joinData.sessionCode}&sessionName=${encodeURIComponent(sessionName)}`;
        console.log('Redirecting admin to:', adminUrl);
        
        // Clear the stored data
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('pendingJoinData');
        }
        
        router.push(adminUrl);
      } else {
        console.log('No currentJoinData, redirecting to basic admin URL');
        router.push(`/admin?session=${data.sessionId}`);
      }
    });
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value.toUpperCase()
    }));
    setError('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('Form submitted!', { isConnected, socket: !!socket });
    
    if (!isConnected) {
      setError('Not connected to server. Please wait...');
      return;
    }
    
    if (!socket) {
      setError('Socket not initialized. Please refresh the page.');
      return;
    }
    
    if (!formData.sessionCode.trim()) {
      setError('Please enter a session code');
      return;
    }

    if (!formData.isAdmin && !formData.username.trim()) {
      setError('Please enter a username');
      return;
    }

    if (formData.isAdmin && !formData.adminPassword) {
      setError('Please enter admin password');
      return;
    }

    if (formData.isAdmin && !formData.sessionName.trim()) {
      setError('Please enter session name');
      return;
    }

    setIsConnecting(true);
    setError('');

    const joinData = {
      sessionCode: formData.sessionCode.trim(),
      username: formData.username.trim(),
      adminPassword: formData.isAdmin ? formData.adminPassword : null,
      // Send sessionName if admin
      ...(formData.isAdmin ? { sessionName: formData.sessionName.trim() } : {})
    };

    // Store join data for use in success handlers
    setCurrentJoinData(joinData);
    
    // Also store in sessionStorage as backup
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('pendingJoinData', JSON.stringify(joinData));
    }

    console.log('Emitting join-session with data:', joinData);
    socket.emit('join-session', joinData);
    
    // Safety timeout to reset connecting state if no response
    setTimeout(() => {
      if (isConnecting) {
        setIsConnecting(false);
        setError('Connection timeout. Please try again.');
      }
    }, 10000);
  };

  const toggleAdminMode = () => {
    setFormData(prev => ({
      ...prev,
      isAdmin: !prev.isAdmin,
      adminPassword: ''
    }));
    setError('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-red-900 to-gray-900 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-lg shadow-2xl p-8 w-full max-w-md border border-red-500/20">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-4">🏴‍☠️</div>
          <h1 className="text-3xl font-bold text-red-400 mb-2">Hack My Box</h1>
          <p className="text-gray-400">Enter the cyber battlefield</p>
        </div>

        {/* Connection Status */}
        <div className="flex items-center justify-center mb-6">
          <div className={`w-3 h-3 rounded-full mr-2 ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
          <span className={`text-sm ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
            {isConnected ? 'Connected' : 'Connecting...'}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Session Code */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Session Code *
            </label>
            <input
              type="text"
              name="sessionCode"
              value={formData.sessionCode}
              onChange={handleInputChange}
              className="w-full p-3 border border-gray-600 rounded bg-gray-700 text-white placeholder-gray-400 focus:border-red-500 focus:outline-none"
              placeholder="Enter session code..."
              maxLength="10"
              required
            />
          </div>

          {/* Admin Toggle */}
          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="adminToggle"
              name="isAdmin"
              checked={formData.isAdmin}
              onChange={handleInputChange}
              className="w-4 h-4 text-red-600 bg-gray-700 border-gray-600 rounded focus:ring-red-500"
            />
            <label htmlFor="adminToggle" className="text-sm text-gray-300">
              Admin Mode 👑
            </label>
          </div>

          {/* Username (only for players) */}
          {!formData.isAdmin && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Username *
              </label>
              <input
                type="text"
                name="username"
                value={formData.username}
                onChange={handleInputChange}
                className="w-full p-3 border border-gray-600 rounded bg-gray-700 text-white placeholder-gray-400 focus:border-red-500 focus:outline-none"
                placeholder="Your hacker name..."
                maxLength="20"
                required={!formData.isAdmin}
              />
            </div>
          )}

          {/* Session Name (only for admin) */}
          {formData.isAdmin && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Session Name *
                </label>
                <input
                  type="text"
                  name="sessionName"
                  value={formData.sessionName}
                  onChange={handleInputChange}
                  className="w-full p-3 border border-gray-600 rounded bg-gray-700 text-white placeholder-gray-400 focus:border-red-500 focus:outline-none"
                  placeholder="Enter session name..."
                  maxLength="40"
                  required={formData.isAdmin}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Admin Password *
                </label>
                <input
                  type="password"
                  name="adminPassword"
                  value={formData.adminPassword}
                  onChange={(e) => setFormData(prev => ({ ...prev, adminPassword: e.target.value }))}
                  className="w-full p-3 border border-gray-600 rounded bg-gray-700 text-white placeholder-gray-400 focus:border-red-500 focus:outline-none"
                  placeholder="Enter admin password..."
                  required={formData.isAdmin}
                />
              </div>
            </>
          )}

          {/* Error Display */}
          {error && (
            <div className="p-3 bg-red-900/30 border border-red-500 rounded text-red-300 text-sm">
              ⚠️ {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={!isConnected || isConnecting}
            className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white p-3 rounded font-medium transition-colors flex items-center justify-center space-x-2"
          >
            {isConnecting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                <span>Connecting...</span>
              </>
            ) : (
              <span>{formData.isAdmin ? '🔑 Admin Access' : '🚀 Join Game'}</span>
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="mt-6 text-center text-xs text-gray-500">
          Powered by Socket.IO & Next.js
        </div>
      </div>
    </div>
  );
}