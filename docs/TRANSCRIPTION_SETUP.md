# Transcription System Setup Guide

This guide explains how to set up the production-ready WhisperX transcription system with speaker diarization and OpenAI Whisper API fallback.

## Prerequisites

### System Requirements
- **Operating System**: macOS, Linux, or Windows 10+
- **Memory**: 8GB RAM minimum, 16GB+ recommended for local WhisperX
- **Storage**: 10GB+ free space for models and processing
- **GPU** (optional): NVIDIA GPU with CUDA for accelerated WhisperX processing
- **Python**: 3.8+ with pip
- **Node.js**: 18+ with npm/yarn
- **FFmpeg**: For audio/video processing

### Required Software

#### 1. Python Environment
```bash
# Check Python version (3.8+ required)
python3 --version

# Install Python if needed (macOS with Homebrew)
brew install python@3.11

# Create virtual environment (recommended)
python3 -m venv transcription-env
source transcription-env/bin/activate  # Linux/macOS
# transcription-env\Scripts\activate   # Windows
```

#### 2. FFmpeg Installation
```bash
# macOS (Homebrew)
brew install ffmpeg

# Ubuntu/Debian
sudo apt update && sudo apt install ffmpeg

# Windows (using Chocolatey)
choco install ffmpeg

# Verify installation
ffmpeg -version
```

## Installation Steps

### 1. Install Node.js Dependencies
```bash
# Install project dependencies
npm install

# Or with yarn
yarn install
```

### 2. Install WhisperX and Dependencies
```bash
# Install WhisperX with all dependencies
pip install whisperx[all]

# Or install with specific torch version for CUDA
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
pip install whisperx

# Verify installation
python3 -c "import whisperx; print('WhisperX ready')"
```

### 3. Install PyTorch Audio Dependencies
```bash
# Install additional audio processing libraries
pip install librosa soundfile

# For speaker diarization (required for multi-speaker support)
pip install pyannote.audio

# Install alignment dependencies
pip install transformers speechbrain
```

### 4. Database Setup
```bash
# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma db push

# Optional: Seed with sample data
npx prisma db seed
```

### 5. Environment Configuration
```bash
# Copy environment template
cp .env.example .env

# Edit environment variables
nano .env
```

#### Required Environment Variables

```env
# Database
DATABASE_URL="file:./dev.db"

# OpenAI API (optional, for fallback)
OPENAI_API_KEY="your-openai-api-key-here"

# HuggingFace Token (required for speaker diarization)
HUGGING_FACE_HUB_TOKEN="your-huggingface-token"

# Transcription Configuration
PYTHON_PATH="python3"
TRANSCRIPTION_TEMP_DIR="./temp/transcription"
ENABLE_WHISPERX=true
ENABLE_OPENAI_WHISPER=true
TRANSCRIPTION_FALLBACK_STRATEGY="whisperx-first"
```

## Configuration Options

### WhisperX Configuration

#### Model Selection
- **tiny**: Fastest, lowest accuracy (~39 MB)
- **base**: Balanced speed/accuracy (~74 MB)
- **small**: Good accuracy (~244 MB)
- **medium**: High accuracy (~769 MB)
- **large**: Highest accuracy (~1550 MB)
- **large-v2**: Latest large model with improvements
- **large-v3**: Most recent model (recommended)

#### Device Configuration
- **auto**: Automatically detect best device (recommended)
- **cpu**: Force CPU processing
- **cuda**: Use GPU acceleration (requires NVIDIA GPU + CUDA)

#### Compute Type
- **int8**: Fastest, lowest memory, reduced accuracy
- **int16**: Balanced performance and accuracy
- **float16**: Good accuracy, reasonable speed (default)
- **float32**: Highest accuracy, slowest

### Speaker Diarization Setup

#### 1. HuggingFace Account
1. Create account at https://huggingface.co/
2. Go to Settings → Access Tokens
3. Create new token with read permissions
4. Add token to `.env` as `HUGGING_FACE_HUB_TOKEN`

#### 2. Accept Model License
Visit and accept the license for speaker diarization models:
- https://huggingface.co/pyannote/speaker-diarization-3.1
- https://huggingface.co/pyannote/segmentation-3.0

## Testing Installation

### 1. Quick System Test
```bash
# Test Node.js dependencies
npm run transcribe:test

# Test WhisperX installation
python3 -c "
import whisperx
print('WhisperX version:', whisperx.__version__)
print('Available devices:', ['cuda' if torch.cuda.is_available() else 'cpu'])
"

# Test speaker diarization
python3 -c "
from pyannote.audio import Pipeline
pipeline = Pipeline.from_pretrained('pyannote/speaker-diarization-3.1')
print('Speaker diarization ready')
"
```

### 2. Integration Test
```bash
# Start development server
npm run dev

# In another terminal, test transcription API
curl -X POST http://localhost:3000/api/transcribe \
  -H "Content-Type: application/json" \
  -d '{"mediaFileId": "test", "options": {"model": "base"}}'
```

### 3. Test with Sample Audio
```bash
# Create test directory
mkdir -p test-audio

# Download sample audio (optional)
curl -o test-audio/sample.wav https://sample-audio-url.com/sample.wav

# Upload via UI at http://localhost:3000
```

## Performance Optimization

### 1. GPU Acceleration
```bash
# Check CUDA availability
python3 -c "import torch; print('CUDA available:', torch.cuda.is_available())"

# Install CUDA-enabled PyTorch
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118

# Set environment for GPU
export CUDA_VISIBLE_DEVICES=0
```

### 2. Memory Optimization
```env
# Reduce batch size for lower memory usage
WHISPERX_BATCH_SIZE=8

# Use smaller model for resource-constrained environments
WHISPERX_MODEL="small"

# Limit concurrent transcriptions
TRANSCRIPTION_CONCURRENCY=1
```

### 3. Model Caching
```bash
# Pre-download models to avoid first-run delays
python3 -c "
import whisperx
model = whisperx.load_model('large-v2', 'auto')
print('Model cached successfully')
"
```

## Troubleshooting

### Common Issues

#### 1. WhisperX Import Error
```bash
# Solution: Check Python environment
which python3
pip list | grep whisperx

# Reinstall if needed
pip uninstall whisperx
pip install whisperx
```

#### 2. CUDA Memory Error
```env
# Reduce batch size
WHISPERX_BATCH_SIZE=4

# Or force CPU processing
WHISPERX_DEVICE="cpu"
```

#### 3. Speaker Diarization Fails
```bash
# Check HuggingFace token
python3 -c "
import os
print('Token set:', bool(os.getenv('HUGGING_FACE_HUB_TOKEN')))
"

# Test model access
python3 -c "
from pyannote.audio import Pipeline
pipeline = Pipeline.from_pretrained('pyannote/speaker-diarization-3.1')
"
```

#### 4. Audio Processing Errors
```bash
# Check FFmpeg installation
ffmpeg -version

# Test audio conversion
ffmpeg -i input.mp4 -ac 1 -ar 16000 output.wav
```

### Debug Mode
```env
# Enable detailed logging
DEBUG=true
NODE_ENV="development"

# Check logs
tail -f logs/transcription.log
```

## Production Deployment

### 1. Server Setup
```bash
# Install PM2 for process management
npm install -g pm2

# Start application
pm2 start ecosystem.config.js

# Monitor processes
pm2 monit
```

### 2. Resource Monitoring
```bash
# Monitor GPU usage (if available)
nvidia-smi -l 1

# Monitor memory usage
htop

# Monitor disk space
df -h
```

### 3. Backup Configuration
```bash
# Backup environment and database
cp .env .env.backup
cp dev.db dev.db.backup

# Backup WhisperX models
tar -czf models-backup.tar.gz ~/.cache/whisperx/
```

## API Usage Examples

### 1. Start Transcription
```javascript
const response = await fetch('/api/transcribe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    mediaFileId: 'media_123',
    options: {
      language: 'en',
      enableDiarization: true,
      maxSpeakers: 5,
      model: 'large-v2'
    }
  })
});

const { jobId } = await response.json();
```

### 2. Monitor Progress
```javascript
const eventSource = new EventSource(`/api/transcribe/progress?jobId=${jobId}`);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Progress:', data.progress + '%');
};
```

### 3. Export Results
```javascript
// Download SRT file
const response = await fetch(`/api/transcribe/export/${transcriptId}?format=srt`);
const srtContent = await response.text();

// Get JSON with speaker info
const jsonResponse = await fetch(`/api/transcribe/export/${transcriptId}?format=json&includeSpeakers=true`);
const transcript = await jsonResponse.json();
```

## Support and Documentation

- **GitHub Issues**: Report bugs and feature requests
- **Discord Community**: Real-time support and discussions  
- **Documentation**: Comprehensive API and integration guides
- **Video Tutorials**: Step-by-step setup and usage guides

For additional support, check the project wiki or join our community channels.