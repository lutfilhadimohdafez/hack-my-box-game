FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Remove lock file if it exists to avoid sync issues
RUN rm -f package-lock.json

# Install all dependencies (including dev) for build
RUN npm install

# Copy source code
COPY . .

# Create database directory with proper permissions
RUN mkdir -p database && chown -R node:node database

# Initialize the database before building
RUN npm run db:init

# Build the Next.js app
RUN npm run build

# Remove dev dependencies after build
RUN npm prune --omit=dev

# Create a non-root user
USER node

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["npm", "start"]
