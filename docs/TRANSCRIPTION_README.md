# AI Transcription System: WhisperX Integration

## Overview

A production-ready transcription pipeline that integrates WhisperX for high-accuracy speech-to-text with speaker diarization, complemented by OpenAI Whisper API fallback for maximum reliability.

## Architecture

```
┌─────────────────────────────────────────────┐
│              Next.js Frontend               │
├─────────────────────────────────────────────┤
│ • Upload Interface & Progress Tracking     │
│ • Real-time Transcript Display             │
│ • Speaker Management & Editing             │
│ • Export Controls & Format Selection       │
└─────────────────────────────────────────────┘
                      │
┌─────────────────────────────────────────────┐
│                API Layer                    │
├─────────────────────────────────────────────┤
│ • /api/transcribe - Job Management         │
│ • /api/transcribe/progress - Real-time SSE │
│ • /api/transcribe/export - Multi-format    │
│ • /api/transcribe/queue - Status & Stats   │
└─────────────────────────────────────────────┘
                      │
┌─────────────────────────────────────────────┐
│            Transcription Services           │
├─────────────────────────────────────────────┤
│ • WhisperX Service (Primary)               │
│ • OpenAI Whisper API (Fallback)            │
│ • Intelligent Queue Management             │
│ • Real-time Progress Tracking              │
└─────────────────────────────────────────────┘
                      │
┌─────────────────────────────────────────────┐
│              Data Layer                     │
├─────────────────────────────────────────────┤
│ • Prisma ORM with SQLite/PostgreSQL        │
│ • Transcript & Speaker Models              │
│ • Word-level Timestamp Storage             │
│ • Job Queue & Status Tracking              │
└─────────────────────────────────────────────┘
```

## Key Features

### 🎯 High-Accuracy Transcription
- **WhisperX Integration**: State-of-the-art accuracy with forced alignment
- **Multi-language Support**: 99 languages with auto-detection
- **Word-level Timestamps**: Frame-accurate timing for precise editing
- **Confidence Scoring**: Quality assessment for each segment and word

### 👥 Advanced Speaker Diarization
- **Multi-speaker Detection**: Up to 10 speakers automatically identified
- **Consistent Labeling**: Speakers tracked across entire sessions
- **Speaker Statistics**: Duration, segment count, confidence metrics
- **Manual Override**: Edit speaker names and assignments

### 🔄 Intelligent Fallback System
- **Primary/Fallback Strategy**: WhisperX → OpenAI Whisper API
- **Automatic Switching**: Based on file size, requirements, and availability
- **Error Recovery**: Robust retry mechanisms with exponential backoff
- **Service Health Monitoring**: Real-time status and capability detection

### 🚀 Production-Ready Infrastructure
- **Background Processing**: Non-blocking queue system with concurrency control
- **Progress Tracking**: Real-time updates via Server-Sent Events
- **Resource Management**: Memory optimization and cleanup protocols
- **Scalable Architecture**: Horizontal scaling support for high volume

### 📊 Comprehensive Export Options
- **Multiple Formats**: SRT, VTT, TXT, JSON with full metadata
- **Filtering**: By confidence, speaker, time range, or custom criteria
- **Batch Processing**: Export multiple transcripts simultaneously
- **API Integration**: Programmatic access for automation workflows

## Performance Metrics

| Metric | WhisperX (Local) | OpenAI API |
|--------|-----------------|-------------|
| **Accuracy** | 95-98% | 92-95% |
| **Speed** | 0.1-0.3x realtime* | 0.2-0.5x realtime |
| **Languages** | 99 languages | 57 languages |
| **File Size Limit** | Unlimited** | 25MB |
| **Diarization** | ✅ Up to 10 speakers | ❌ Not available |
| **Cost** | Compute only | $0.006/minute |

*With GPU acceleration  
**Limited by available storage and memory

## Quick Start

### 1. Installation
```bash
# Clone and install dependencies
npm install

# Install Python dependencies
pip install whisperx torch torchaudio pyannote.audio

# Setup environment
cp .env.example .env
# Edit .env with your configuration

# Initialize database
npx prisma db push
```

### 2. Configuration
```env
# Required for speaker diarization
HUGGING_FACE_HUB_TOKEN="your_token_here"

# Optional for fallback
OPENAI_API_KEY="your_openai_key"

# WhisperX settings
WHISPERX_MODEL="large-v2"
WHISPERX_DEVICE="auto"
ENABLE_WHISPERX=true
```

### 3. Usage
```bash
# Start development server
npm run dev

# Test installation
npm run transcribe:test

# Upload media and transcribe via UI
open http://localhost:3000
```

## API Examples

### Start Transcription
```javascript
const response = await fetch('/api/transcribe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    mediaFileId: 'media_123',
    options: {
      language: 'auto',
      enableDiarization: true,
      maxSpeakers: 5,
      model: 'large-v2'
    },
    priority: 5
  })
});

const { jobId } = await response.json();
```

### Monitor Progress
```javascript
const eventSource = new EventSource(`/api/transcribe/progress?jobId=${jobId}`);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch(data.type) {
    case 'progress':
      updateProgress(data.progress, data.message);
      break;
    case 'completed':
      showResults(data.result);
      break;
    case 'failed':
      handleError(data.error);
      break;
  }
};
```

### Export Results
```javascript
// Download SRT subtitle file
const downloadSRT = async (transcriptId) => {
  const url = `/api/transcribe/export/${transcriptId}?format=srt&includeSpeakers=true`;
  const response = await fetch(url);
  
  const blob = await response.blob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'transcript.srt';
  link.click();
};

// Get filtered JSON data
const getFilteredTranscript = async (transcriptId) => {
  const response = await fetch(`/api/transcribe/export/${transcriptId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      format: 'json',
      minConfidence: 0.8,
      speakerFilter: 'Speaker 1',
      startTime: 30.0,
      endTime: 300.0
    })
  });
  
  return await response.json();
};
```

## Advanced Configuration

### WhisperX Optimization
```env
# GPU acceleration (requires NVIDIA GPU + CUDA)
WHISPERX_DEVICE="cuda"
WHISPERX_COMPUTE_TYPE="float16"
WHISPERX_BATCH_SIZE=16

# Memory optimization for large files
WHISPERX_CHUNK_LENGTH=30
WHISPERX_MAX_LINE_WIDTH=40
```

### Queue Management
```env
# Concurrent processing
TRANSCRIPTION_CONCURRENCY=3

# Timeout and retry settings
TRANSCRIPTION_JOB_TIMEOUT=1800000  # 30 minutes
TRANSCRIPTION_MAX_RETRIES=3
TRANSCRIPTION_RETRY_DELAY=5000     # 5 seconds
```

### Database Scaling
```env
# PostgreSQL for production
DATABASE_URL="postgresql://user:pass@host:5432/transcription_db"

# Connection pooling
DATABASE_POOL_SIZE=10
DATABASE_TIMEOUT=30000
```

## Integration Examples

### React Component
```jsx
import { useState, useEffect } from 'react';

export const TranscriptionManager = ({ mediaFileId }) => {
  const [jobId, setJobId] = useState(null);
  const [progress, setProgress] = useState(0);
  const [transcript, setTranscript] = useState(null);

  const startTranscription = async () => {
    const response = await fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mediaFileId,
        options: {
          enableDiarization: true,
          model: 'large-v2'
        }
      })
    });

    const { jobId } = await response.json();
    setJobId(jobId);
  };

  useEffect(() => {
    if (!jobId) return;

    const eventSource = new EventSource(`/api/transcribe/progress?jobId=${jobId}`);
    
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'progress') {
        setProgress(data.progress);
      } else if (data.type === 'completed') {
        setTranscript(data.result);
        eventSource.close();
      }
    };

    return () => eventSource.close();
  }, [jobId]);

  return (
    <div>
      {!jobId ? (
        <button onClick={startTranscription}>
          Start Transcription
        </button>
      ) : transcript ? (
        <TranscriptViewer transcript={transcript} />
      ) : (
        <ProgressBar progress={progress} />
      )}
    </div>
  );
};
```

### Node.js Service Integration
```javascript
import { transcriptionQueue, transcriptionUtils } from '@/lib/transcription';

export class MediaProcessor {
  async processVideo(videoPath, options = {}) {
    // Extract audio optimized for transcription
    const audioPath = await this.extractAudio(videoPath);
    
    // Queue transcription
    const jobId = await transcriptionQueue.addJob(
      'media_123',
      audioPath,
      options,
      5 // priority
    );
    
    // Wait for completion
    return new Promise((resolve, reject) => {
      transcriptionQueue.on('job-completed', (event) => {
        if (event.jobId === jobId) {
          resolve(event.result);
        }
      });
      
      transcriptionQueue.on('job-failed', (event) => {
        if (event.jobId === jobId) {
          reject(new Error(event.error));
        }
      });
    });
  }

  async generateSubtitles(transcriptId, format = 'srt') {
    const response = await fetch(`/api/transcribe/export/${transcriptId}?format=${format}`);
    return await response.text();
  }
}
```

## Deployment Guide

### Docker Configuration
```dockerfile
FROM node:18-alpine

# Install Python and system dependencies
RUN apk add --no-cache python3 py3-pip ffmpeg

# Install WhisperX
RUN pip3 install whisperx torch torchaudio

# Copy and install app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npx prisma generate

EXPOSE 3000
CMD ["npm", "start"]
```

### Production Environment
```yaml
# docker-compose.yml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:password@db:5432/transcription
      - REDIS_URL=redis://redis:6379
    volumes:
      - ./media:/app/media
      - ./temp:/app/temp
    depends_on:
      - db
      - redis

  db:
    image: postgres:15
    environment:
      - POSTGRES_DB=transcription
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

## Monitoring and Analytics

### Performance Metrics
```javascript
// Get system performance stats
const stats = await fetch('/api/transcribe/queue').then(r => r.json());

console.log('Queue Status:', {
  active: stats.queue.activeJobs,
  pending: stats.queue.queuedJobs,
  throughput: stats.queue.completed / stats.queue.total,
  avgProcessingTime: stats.avgProcessingTime
});
```

### Error Tracking
```javascript
// Monitor failed jobs
transcriptionQueue.on('job-failed', (event) => {
  analytics.track('transcription_failed', {
    jobId: event.jobId,
    mediaFileId: event.mediaFileId,
    error: event.error,
    attempts: event.attempts
  });
});
```

## Troubleshooting

### Common Issues

**WhisperX Installation**
```bash
# CUDA version mismatch
pip uninstall torch torchvision torchaudio
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118

# Missing audio libraries
sudo apt install libsndfile1 libsox-fmt-all
```

**Memory Issues**
```env
# Reduce batch size and model size
WHISPERX_MODEL="medium"
WHISPERX_BATCH_SIZE=4
TRANSCRIPTION_CONCURRENCY=1
```

**Speaker Diarization Errors**
```bash
# Accept required model licenses
# Visit: https://huggingface.co/pyannote/speaker-diarization-3.1
# Click "Agree" to license terms

# Verify token permissions
python3 -c "
from huggingface_hub import HfApi
api = HfApi(token='your_token')
print('Token valid:', api.whoami())
"
```

## License and Credits

This transcription system is built on several open-source projects:

- **WhisperX**: MIT License - Advanced speech recognition with alignment
- **OpenAI Whisper**: MIT License - Robust speech recognition model  
- **pyannote.audio**: MIT License - Speaker diarization and audio analysis
- **Next.js**: MIT License - React framework for production applications
- **Prisma**: Apache 2.0 - Next-generation database toolkit

## Contributing

We welcome contributions! Please see our contributing guidelines for:

- Code style and standards
- Testing requirements  
- Documentation updates
- Feature request process
- Bug report templates

## Support

- **Documentation**: Comprehensive guides and API reference
- **Community**: Discord server for real-time help
- **Issues**: GitHub issue tracker for bugs and features
- **Commercial**: Enterprise support and custom development

---

Built with ❤️ for professional media workflows