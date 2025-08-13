import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';

let socket;

export default function LeaderboardDisplay() {
  const [leaderboard, setLeaderboard] = useState([]);
  const [attacks, setAttacks] = useState([]);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [recentActivity, setRecentActivity] = useState([]);

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
      setLeaderboard(data.leaderboard || []);
      setAttacks(data.attacks || []);
      setTotalPlayers(data.totalPlayers || 0);
    });

    socket.on('player-achievement', (data) => {
      addRecentActivity({
        type: 'achievement',
        message: `${data.playerName} solved ${data.flagId.toUpperCase()} (+${data.points} pts)`,
        timestamp: Date.now(),
        playerName: data.playerName
      });
    });

    socket.on('attack-launched', (attack) => {
      addRecentActivity({
        type: 'attack',
        message: `${attack.attacker} launched ${attack.type.toUpperCase()} attack!`,
        timestamp: attack.timestamp,
        playerName: attack.attacker
      });
    });
  };

  const addRecentActivity = (activity) => {
    setRecentActivity(prev => 
      [activity, ...prev].slice(0, 10) // Keep only latest 10 activities
    );
  };

  const getAttackIcon = (type) => {
    switch(type) {
      case 'sleep': return '💤';
      case 'jam': return '📡';
      case 'steal': return '🔓';
      default: return '⚔️';
    }
  };

  const getRankDisplay = (rank) => {
    switch(rank) {
      case 1: return '🥇';
      case 2: return '🥈'; 
      case 3: return '🥉';
      default: return `#${rank}`;
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-red-900 to-purple-900 p-6 shadow-lg">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h1 className="text-4xl font-bold text-white">🏴‍☠️ HACK MY BOX</h1>
              <div className="text-xl text-red-200">LIVE LEADERBOARD</div>
            </div>
            <div className="flex items-center space-x-6">
              <div className="text-right">
                <div className="text-2xl font-bold">{totalPlayers}</div>
                <div className="text-sm text-red-200">Active Players</div>
              </div>
              <div className={`flex items-center space-x-2 ${isConnected ? 'text-green-300' : 'text-red-300'}`}>
                <div className={`w-4 h-4 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                <span>{isConnected ? 'LIVE' : 'DISCONNECTED'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-4 gap-6 h-screen">
        {/* Main Leaderboard */}
        <div className="lg:col-span-2">
          <div className="bg-gray-800 rounded-lg p-6 h-full">
            <h2 className="text-3xl font-bold mb-6 text-center text-yellow-400">
              🏆 LEADERBOARD 🏆
            </h2>
            
            {leaderboard.length === 0 ? (
              <div className="text-center text-gray-400 text-xl mt-20">
                Waiting for players to join...
              </div>
            ) : (
              <div className="space-y-4">
                {leaderboard.map((player, index) => (
                  <div
                    key={player.name}
                    className={`p-4 rounded-lg border-2 transition-all duration-300 ${
                      index === 0 ? 'border-yellow-400 bg-gradient-to-r from-yellow-900/30 to-yellow-800/30' :
                      index === 1 ? 'border-gray-400 bg-gradient-to-r from-gray-800/30 to-gray-700/30' :
                      index === 2 ? 'border-orange-600 bg-gradient-to-r from-orange-900/30 to-orange-800/30' :
                      'border-gray-600 bg-gray-700/30'
                    } ${player.isAttacking ? 'animate-pulse border-red-500' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="text-3xl font-bold w-16 text-center">
                          {getRankDisplay(player.rank)}
                        </div>
                        <div>
                          <div className={`text-xl font-bold ${
                            index === 0 ? 'text-yellow-300' :
                            index === 1 ? 'text-gray-300' :
                            index === 2 ? 'text-orange-300' : 'text-white'
                          }`}>
                            {player.name}
                            {player.isAttacking && <span className="text-red-400 ml-2">⚔️</span>}
                          </div>
                          <div className="text-sm text-gray-400">
                            {player.solvedFlags} flags solved
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-2xl font-bold ${
                          index === 0 ? 'text-yellow-300' :
                          index === 1 ? 'text-gray-300' :
                          index === 2 ? 'text-orange-300' : 'text-white'
                        }`}>
                          {player.score}
                        </div>
                        <div className="text-sm text-gray-400">points</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Active Attacks Panel */}
        <div className="lg:col-span-1">
          <div className="bg-gray-800 rounded-lg p-6 h-full">
            <h3 className="text-2xl font-bold mb-4 text-red-400">🚨 ACTIVE ATTACKS</h3>
            
            {attacks.length === 0 ? (
              <div className="text-center text-gray-400 mt-8">
                <div className="text-4xl mb-2">🛡️</div>
                <div>All systems secure</div>
              </div>
            ) : (
              <div className="space-y-3">
                {attacks.map((attack) => (
                  <div
                    key={attack.id}
                    className="p-4 bg-red-900/40 border border-red-600 rounded-lg animate-pulse"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="text-2xl">{getAttackIcon(attack.type)}</div>
                      <div>
                        <div className="font-bold text-red-300">
                          {attack.type.toUpperCase()} ATTACK
                        </div>
                        <div className="text-sm text-red-400">
                          by {attack.attacker}
                        </div>
                        <div className="text-xs text-red-500">
                          {new Date(attack.timestamp).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Attack Warning */}
            {attacks.length > 0 && (
              <div className="mt-6 p-4 bg-red-800/60 border border-red-500 rounded-lg animate-bounce">
                <div className="text-center text-red-200">
                  <div className="text-2xl mb-2">⚠️ WARNING ⚠️</div>
                  <div className="font-bold">SYSTEMS UNDER ATTACK!</div>
                  <div className="text-sm">Multiple threats detected</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity Panel */}
        <div className="lg:col-span-1">
          <div className="bg-gray-800 rounded-lg p-6 h-full">
            <h3 className="text-2xl font-bold mb-4 text-green-400">📈 LIVE ACTIVITY</h3>
            
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {(recentActivity || []).length === 0 ? (
                <div className="text-center text-gray-400 mt-8">
                  <div className="text-4xl mb-2">⏳</div>
                  <div>Waiting for activity...</div>
                </div>
              ) : (
                (recentActivity || []).map((activity, index) => (
                  <div
                    key={`${activity.timestamp}-${index}`}
                    className={`p-3 rounded-lg border-l-4 ${
                      activity.type === 'achievement' 
                        ? 'bg-green-900/30 border-green-500 text-green-300' 
                        : 'bg-red-900/30 border-red-500 text-red-300'
                    } animate-fadeInUp`}
                    style={{animationDelay: `${index * 0.1}s`}}
                  >
                    <div className="text-sm font-medium">
                      {activity.message}
                    </div>
                    <div className="text-xs opacity-75 mt-1">
                      {new Date(activity.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Stats Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 border-t border-gray-700 p-4">
        <div className="max-w-7xl mx-auto flex justify-center items-center space-x-8">
          <div className="flex items-center space-x-2">
            <span className="text-yellow-400">🏆</span>
            <span className="text-sm">
              Leader: {leaderboard.length > 0 ? `${leaderboard[0].name} (${leaderboard[0].score} pts)` : 'None'}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-red-400">⚔️</span>
            <span className="text-sm">
              Attacks: {attacks.length} active
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-blue-400">👥</span>
            <span className="text-sm">
              Players: {totalPlayers} online
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-green-400">📡</span>
            <span className="text-sm">
              Status: {isConnected ? 'LIVE' : 'OFFLINE'}
            </span>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .animate-fadeInUp {
          animation: fadeInUp 0.5s ease-out forwards;
        }
      `}</style>
    </div>
  );
}