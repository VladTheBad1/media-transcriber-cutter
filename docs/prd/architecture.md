# Media Transcription & Editing Service - Architecture Design

## System Overview

A comprehensive local media processing service that combines transcription, AI analysis, and video editing capabilities in a web-based interface.

## Architecture Pattern: Hybrid Client-Server Processing

### Core Principles
- **Local Processing First**: Use client-side processing (FFmpeg.wasm) for lightweight operations
- **Server-Side Heavy Lifting**: Complex operations (WhisperX, large video processing) on server
- **Progressive Enhancement**: Start with basic features, add advanced capabilities
- **Media Library Management**: Organized local storage with database indexing

## System Components

### 1. Frontend Layer (Next.js 14)
```
┌─────────────────────────────────────────────┐
│              Next.js Frontend               │
├─────────────────────────────────────────────┤
│ • Media Upload Interface                    │
│ • Timeline Editor (React Components)       │
│ • Real-time Preview Player                 │
│ • Export Configuration                      │
│ • Media Library Browser                    │
│ • Transcription Editor                     │
└─────────────────────────────────────────────┘
```

**Key Components:**
- **UploadZone**: Drag-drop for media files and URL input
- **TimelineEditor**: Custom React component for video editing
- **MediaPlayer**: Video.js based player with custom controls
- **TranscriptionView**: Editable transcript with speaker labels
- **ExportPanel**: Multi-format export with social media presets

### 2. API Layer (Next.js API Routes)
```
┌─────────────────────────────────────────────┐
│                API Routes                   │
├─────────────────────────────────────────────┤
│ • /api/upload - Media file handling        │
│ • /api/transcribe - WhisperX integration   │
│ • /api/process - Video editing pipeline    │
│ • /api/export - Format conversion          │
│ • /api/library - Media management          │
│ • /api/ai - Summary and analysis           │
└─────────────────────────────────────────────┘
```

### 3. Processing Engine
```
┌─────────────────────────────────────────────┐
│            Processing Services              │
├─────────────────────────────────────────────┤
│ • WhisperX Service (Python subprocess)     │
│ • FFmpeg Service (Native + WebAssembly)    │
│ • AI Analysis Service (OpenAI integration) │
│ • Export Service (Multi-format rendering)  │
│ • Queue Manager (Bull/BullMQ)              │
└─────────────────────────────────────────────┘
```

### 4. Storage Layer
```
┌─────────────────────────────────────────────┐
│              Storage & Database             │
├─────────────────────────────────────────────┤
│ • SQLite Database (Prisma ORM)             │
│ • Local Media Library (/media)             │
│ • Cache Layer (/cache)                     │
│ • Temporary Processing (/temp)             │
│ • Export Output (/exports)                 │
└─────────────────────────────────────────────┘
```

## Data Flow Architecture

### 1. Media Ingestion Flow
```
Media Input → Upload Handler → Format Detection → Storage → Database Record → Processing Queue
```

### 2. Transcription Pipeline
```
Audio Extraction → WhisperX Processing → Speaker Diarization → Timestamp Alignment → Database Storage
```

### 3. AI Analysis Pipeline
```
Transcript → Chunking → OpenAI Analysis → Key Points Extraction → Highlight Detection → Storage
```

### 4. Video Editing Pipeline
```
Timeline Data → FFmpeg Command Generation → Processing → Preview Generation → Final Export
```

## Technology Integration Points

### WhisperX Integration
```python
# Server-side Python service
whisperx_service/
├── app.py              # Flask/FastAPI service
├── transcription.py    # WhisperX wrapper
├── diarization.py      # Speaker identification
└── requirements.txt    # Python dependencies
```

### FFmpeg Integration
```javascript
// Dual approach for optimal performance
const processVideo = {
  lightweight: () => FFmpegWasm.process(command),  // Client-side
  heavyweight: () => FFmpegNative.exec(command)    // Server-side
}
```

### Real-time Preview System
```javascript
// Preview generation for timeline scrubbing
const previewSystem = {
  thumbnails: generateThumbnailSprites(),
  waveform: generateAudioWaveform(),
  markers: mapTranscriptToTimeline()
}
```

## Scalability Considerations

### File Size Handling
- **Small Files (<100MB)**: Client-side processing with FFmpeg.wasm
- **Medium Files (100MB-1GB)**: Server-side with progress tracking
- **Large Files (>1GB)**: Chunked processing with resume capability

### Performance Optimization
- **Lazy Loading**: Load media library content on demand
- **Caching**: Aggressive caching of transcripts and thumbnails
- **Background Processing**: Queue-based processing for heavy operations
- **Preview Generation**: Pre-generate thumbnails and waveforms

### Storage Management
```
media_library/
├── originals/          # Source media files
├── processed/          # Transcoded versions
├── thumbnails/         # Generated previews
├── audio_extracts/     # Audio-only versions
├── transcripts/        # Text and SRT files
└── exports/           # Final output files
```

## Security & Privacy

### Local-First Architecture
- All processing happens locally
- No external API calls for sensitive content
- Optional OpenAI integration for enhanced features
- User controls data retention policies

### File System Security
- Sandboxed media directory access
- Input validation and sanitization
- Process isolation for external tools
- Secure temporary file handling

## Integration Architecture

### External Media Sources
```javascript
// URL processing pipeline
const mediaImporter = {
  youtube: (url) => ytdlp.download(url),
  vimeo: (url) => vimeoAPI.fetch(url),
  podcast: (url) => podcastParser.extract(url),
  generic: (url) => mediaFetch.download(url)
}
```

### Export Destinations
```javascript
// Social media format presets
const exportFormats = {
  tiktok: { aspect: '9:16', maxDuration: 180 },
  instagram: { aspect: '1:1', maxDuration: 90 },
  youtube: { aspect: '16:9', maxDuration: null },
  twitter: { aspect: '16:9', maxDuration: 140 },
  linkedin: { aspect: '16:9', maxDuration: 600 }
}
```

## Development Phases

### Phase 1: Core Media Processing (Weeks 1-3)
- Basic file upload and storage
- Media format detection and conversion
- Simple playback interface
- Basic transcription with WhisperX

### Phase 2: Advanced Transcription (Weeks 4-5)
- Speaker diarization implementation
- Timestamp synchronization
- Editable transcript interface
- Multi-language support

### Phase 3: AI Enhancement (Weeks 6-7)
- Summary generation
- Key points extraction
- Highlight detection algorithms
- Silence removal automation

### Phase 4: Video Editing (Weeks 8-10)
- Timeline editor implementation
- Cut and trim functionality
- Transition effects
- Preview system

### Phase 5: Export & Social (Weeks 11-12)
- Multi-format export engine
- Social media presets
- Auto-crop and subject tracking
- Batch export capabilities

## Quality Gates

### Performance Targets
- **Upload Processing**: <5 seconds for format detection
- **Transcription**: Real-time processing (1x speed minimum)
- **Preview Generation**: <2 seconds for timeline scrubbing
- **Export**: 2x real-time for standard formats

### Quality Metrics
- **Accuracy**: >95% transcription accuracy for clear audio
- **Reliability**: <1% failed processing rate
- **Usability**: <3 clicks to common operations
- **Performance**: Support files up to 2GB smoothly

## Risk Mitigation

### Technical Risks
- **Large File Processing**: Implement chunking and progress tracking
- **Memory Usage**: Stream processing and cleanup protocols
- **Cross-Platform**: Docker containerization for consistency
- **Dependency Management**: Version lock critical media libraries

### User Experience Risks
- **Complex Interface**: Progressive disclosure of advanced features
- **Processing Time**: Clear progress indication and backgrounding
- **Error Handling**: Graceful degradation and retry mechanisms
- **Learning Curve**: Comprehensive onboarding and tooltips

This architecture balances local processing capabilities with user experience, ensuring the application can handle complex media workflows while remaining responsive and reliable.