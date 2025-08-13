const io = require('socket.io-client');

async function testSessionJoin() {
    console.log('Testing session join for TEST691...');
    
    const socket = io('http://localhost:3000');
    
    socket.on('connect', () => {
        console.log('Connected to server');
        
        // Join session as player
        socket.emit('join-session', {
            sessionCode: 'TEST691',
            username: 'TestPlayer',
            adminPassword: null
        });
    });
    
    socket.on('game-joined', (data) => {
        console.log('Game joined response:', data);
        console.log('Session status from server:', data.sessionStatus);
        process.exit(0);
    });
    
    socket.on('session-error', (error) => {
        console.log('Session error:', error);
        process.exit(1);
    });
    
    socket.on('connect_error', (error) => {
        console.log('Connection error:', error);
        process.exit(1);
    });
    
    // Timeout after 10 seconds
    setTimeout(() => {
        console.log('Timeout - no response received');
        process.exit(1);
    }, 10000);
}

testSessionJoin();
