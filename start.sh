#!/bin/sh

# Ensure database directory exists
mkdir -p /app/database

# Debug: Check current directory and database files
echo "Current directory: $(pwd)"
echo "Database directory contents:"
ls -la /app/database/

# Initialize database if it doesn't exist
if [ ! -f "/app/database/game.db" ]; then
    echo "Database not found, initializing..."
    npm run db:init
    echo "After initialization:"
    ls -la /app/database/
else
    echo "Database already exists"
    echo "Database file size: $(stat -c%s /app/database/game.db)"
    
    # Check if the database has tables
    echo "Checking database tables..."
    sqlite3 /app/database/game.db ".tables"
fi

# Start the application
exec npm start
