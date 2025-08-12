#!/bin/bash
set -e

# Docker entrypoint script for Media Transcription Studio
echo "Starting Media Transcription Studio..."

# Check if we're running as root (not recommended but sometimes necessary)
if [ "$EUID" -eq 0 ]; then
    echo "Warning: Running as root. Consider using a non-root user for better security."
fi

# Wait for database to be ready
echo "Waiting for database connection..."
until node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.\$connect()
  .then(() => { console.log('Database connected'); prisma.\$disconnect(); process.exit(0); })
  .catch(() => { console.log('Database not ready...'); process.exit(1); });
" 2>/dev/null; do
    echo "Database is unavailable - sleeping"
    sleep 2
done

# Run database migrations
echo "Running database migrations..."
npx prisma migrate deploy || {
    echo "Migration failed, attempting to push schema..."
    npx prisma db push --skip-generate || {
        echo "Schema push failed, continuing anyway..."
    }
}

# Seed database if needed
if [ "$SEED_DATABASE" = "true" ]; then
    echo "Seeding database..."
    npx prisma db seed || echo "Database seeding failed or no seed script found"
fi

# Test Python/WhisperX setup
echo "Testing Python setup..."
python3 -c "
try:
    import whisperx
    import torch
    print(f'WhisperX ready. CUDA available: {torch.cuda.is_available()}')
    if torch.cuda.is_available():
        print(f'CUDA devices: {torch.cuda.device_count()}')
        for i in range(torch.cuda.device_count()):
            print(f'  Device {i}: {torch.cuda.get_device_name(i)}')
except ImportError as e:
    print(f'Warning: {e}')
    print('WhisperX may not work properly')
" || echo "Python setup check completed with warnings"

# Download initial models if cache is empty and PRELOAD_MODELS is set
if [ "$PRELOAD_MODELS" = "true" ] && [ ! -f "/app/models/.downloaded" ]; then
    echo "Preloading WhisperX models..."
    python3 -c "
import whisperx
import torch
device = 'cuda' if torch.cuda.is_available() else 'cpu'
print(f'Loading models on {device}...')
try:
    model = whisperx.load_model('base', device)
    print('Base model loaded successfully')
    del model
except Exception as e:
    print(f'Model preload failed: {e}')
"
    touch /app/models/.downloaded || true
fi

# Create necessary directories
mkdir -p /app/uploads /app/exports /app/temp /app/models

# Set permissions if running as root
if [ "$EUID" -eq 0 ]; then
    chown -R appuser:appuser /app/uploads /app/exports /app/temp /app/models 2>/dev/null || true
fi

# Print environment information
echo "Environment:"
echo "  NODE_ENV: ${NODE_ENV:-development}"
echo "  Database: ${DATABASE_URL:0:20}..."
echo "  Redis: ${REDIS_URL:-not configured}"
echo "  Python: $(python3 --version)"
echo "  FFmpeg: $(ffmpeg -version 2>&1 | head -n1)"
echo "  CUDA Available: $(python3 -c 'import torch; print(torch.cuda.is_available())' 2>/dev/null || echo 'unknown')"

# Execute the main command
echo "Starting application with command: $@"
exec "$@"