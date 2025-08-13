#!/bin/sh

# Ensure database directory exists
mkdir -p /app/database

# Debug: Check current directory and database files
echo "Current directory: $(pwd)"
echo "Database directory contents:"
ls -la /app/database/

# Check if database exists AND has content
DB_SIZE=0
if [ -f "/app/database/game.db" ]; then
    DB_SIZE=$(stat -c%s /app/database/game.db)
fi

# Initialize database if it doesn't exist OR is empty
if [ ! -f "/app/database/game.db" ] || [ "$DB_SIZE" -eq 0 ]; then
    echo "Database missing or empty (size: $DB_SIZE), initializing..."
    
    # Remove empty database file if it exists
    rm -f /app/database/game.db
    
    # Run initialization
    npm run db:init
    
    echo "After initialization:"
    ls -la /app/database/
    
    # Check new size
    if [ -f "/app/database/game.db" ]; then
        NEW_SIZE=$(stat -c%s /app/database/game.db)
        echo "New database file size: $NEW_SIZE"
    fi
else
    echo "Database already exists with size: $DB_SIZE"
fi

# Start the application
exec npm start
