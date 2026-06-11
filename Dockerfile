# ── Stage 1: Base image ──────────────────────────────
# Start with official Node.js 20 on Alpine Linux
# Alpine is tiny — 5MB vs 900MB for full Ubuntu
# smaller image = faster builds, faster deployments
FROM node:20-alpine

# ── Stage 2: Working directory ───────────────────────
# All subsequent commands run from this folder
# inside the container
WORKDIR /app

# ── Stage 3: Install dependencies ────────────────────
# Copy package files first — before copying source code
# Why? Docker caches each step
# If source code changes but package.json doesn't →
# Docker reuses cached node_modules layer
# Much faster rebuilds
COPY package*.json ./

RUN npm install --production

# ── Stage 4: Copy source code ────────────────────────
# Copy everything except what is in .dockerignore
COPY . .

# ── Stage 5: Expose port ─────────────────────────────
# Tell Docker this container listens on port 3000
# This is documentation — does not actually open the port
# Port mapping happens in docker-compose.yml
EXPOSE 3000

# ── Stage 6: Start command ───────────────────────────
# Command to run when container starts
# Using node directly not nodemon — production mode
CMD ["node", "index.js"]