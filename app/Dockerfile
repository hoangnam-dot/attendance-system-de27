FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install dependencies first for better caching
COPY package*.json ./
RUN npm ci --only=production || npm install --production

# Copy application source code with node user ownership
COPY --chown=node:node . .

# Ensure app directory permissions
RUN chown -R node:node /app

# Switch to non-root user (Hardening Measure 1)
USER node

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose internal app port
EXPOSE 3000

# Start application
CMD ["node", "src/server.js"]
