#!/bin/sh

# Ensure database directory exists
mkdir -p /app/database

# Initialize database if it doesn't exist
if [ ! -f "/app/database/game.db" ]; then
    echo "Database not found, initializing..."
    npm run db:init
else
    echo "Database already exists"
fi

# Start the application
exec npm start
