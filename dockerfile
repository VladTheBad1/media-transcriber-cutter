# Multi-stage Docker build for Media Transcription Studio
# Optimized for production deployment with GPU support

# Stage 1: Python dependencies and WhisperX setup
FROM python:3.11-slim as python-base

# Install system dependencies for audio/video processing
RUN apt-get update && apt-get install -y \
    ffmpeg \
    git \
    gcc \
    g++ \
    build-essential \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# Install WhisperX and dependencies
RUN pip install --no-cache-dir \
    whisperx \
    torch \
    torchaudio \
    transformers \
    accelerate \
    datasets

# Copy WhisperX service
COPY scripts/whisperx_service.py /app/whisperx_service.py
RUN chmod +x /app/whisperx_service.py

# Stage 2: Node.js dependencies
FROM node:18-alpine as node-deps

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Generate Prisma client
RUN npx prisma generate

# Stage 3: Build stage
FROM node:18-alpine as builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (including dev)
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Stage 4: Production image
FROM ubuntu:22.04 as production

# Install system dependencies
RUN apt-get update && apt-get install -y \
    nodejs \
    npm \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    ca-certificates \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Create non-root user
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Copy Python environment from python-base
COPY --from=python-base /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=python-base /usr/local/bin /usr/local/bin
COPY --from=python-base /app/whisperx_service.py ./scripts/whisperx_service.py

# Copy Node.js dependencies
COPY --from=node-deps /app/node_modules ./node_modules
COPY --from=node-deps /app/prisma ./prisma

# Copy built application
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package*.json ./

# Copy configuration files
COPY next.config.js ./
COPY tailwind.config.ts ./
COPY postcss.config.js ./
COPY tsconfig.json ./

# Create necessary directories
RUN mkdir -p \
    /app/uploads \
    /app/exports \
    /app/temp \
    /app/models \
    && chown -R appuser:appuser /app

# Set up volumes for media storage
VOLUME ["/app/uploads", "/app/exports", "/app/temp", "/app/models"]

# Switch to non-root user
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Expose port
EXPOSE 3000

# Environment variables
ENV NODE_ENV=production
ENV PYTHON_PATH=/usr/bin/python3
ENV WHISPERX_SERVICE_PATH=/app/scripts/whisperx_service.py

# Start script
COPY --chown=appuser:appuser docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["npm", "start"]