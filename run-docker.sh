#!/bin/bash

# Script to run the Media Transcription Studio Docker container

echo "Starting Media Transcription Studio with Docker..."

# Create necessary directories if they don't exist
mkdir -p uploads exports temp models data prisma

# Stop any existing container
docker-compose -f docker-compose.sqlite.yml down 2>/dev/null

# Build if needed (will use cache if already built)
echo "Building Docker image..."
docker-compose -f docker-compose.sqlite.yml build

# Start the container
echo "Starting container..."
docker-compose -f docker-compose.sqlite.yml up -d

# Wait for health check
echo "Waiting for application to be ready..."
sleep 5

# Check if running
if docker-compose -f docker-compose.sqlite.yml ps | grep -q "Up"; then
    echo "✅ Media Transcription Studio is running at http://localhost:3000"
    echo ""
    echo "To view logs: docker-compose -f docker-compose.sqlite.yml logs -f"
    echo "To stop: docker-compose -f docker-compose.sqlite.yml down"
else
    echo "❌ Failed to start. Check logs with: docker-compose -f docker-compose.sqlite.yml logs"
fi