# Media Transcription & Editing Service - Data Model

## Overview

The data model is designed for local SQLite storage with Prisma ORM, optimized for single-user media processing workflows with efficient querying and relationship management.

## Database Schema Design

### Core Entities

#### 1. Media Files
```prisma
model MediaFile {
  id          String   @id @default(cuid())
  filename    String
  originalName String
  title       String?
  description String?
  type        MediaType
  format      String
  codec       String?
  size        BigInt
  duration    Float?   // in seconds
  bitrate     Int?
  resolution  Json?    // { width: Int, height: Int }
  framerate   Float?
  audioChannels Int?
  
  // File paths
  filePath      String   @unique
  thumbnailPath String?
  waveformPath  String?
  
  // Metadata
  metadata    Json?    // Additional format-specific metadata
  tags        String[] // User-defined tags
  category    String?
  
  // Status tracking
  status      ProcessingStatus @default(UPLOADED)
  uploadedAt  DateTime @default(now())
  processedAt DateTime?
  
  // Relationships
  transcripts  Transcript[]
  timelines    Timeline[]
  imports      MediaImport[]
  exports      Export[]
  highlights   Highlight[]
  
  @@map("media_files")
  @@index([type, status])
  @@index([uploadedAt])
  @@index([tags])
}

enum MediaType {
  VIDEO
  AUDIO
}

enum ProcessingStatus {
  UPLOADED
  PROCESSING
  READY
  ERROR
  DELETED
}
```

#### 2. Media Imports
```prisma
model MediaImport {
  id       String @id @default(cuid())
  url      String
  platform String // youtube, vimeo, podcast, generic
  quality  String // highest, high, medium, low
  
  // Import metadata
  originalTitle    String?
  originalDescription String?
  originalDuration Float?
  originalThumbnail String?
  
  // Status tracking
  status     ImportStatus @default(PENDING)
  startedAt  DateTime @default(now())
  completedAt DateTime?
  error      String?
  
  // Relationship
  mediaFile  MediaFile? @relation(fields: [mediaFileId], references: [id])
  mediaFileId String?
  
  @@map("media_imports")
  @@index([status, startedAt])
}

enum ImportStatus {
  PENDING
  DOWNLOADING
  PROCESSING
  COMPLETED
  FAILED
}
```

#### 3. Transcripts
```prisma
model Transcript {
  id         String @id @default(cuid())
  language   String
  confidence Float  // Overall confidence score
  
  // Processing info
  engine     String @default("whisperx")
  modelVersion String?
  processingTime Float?
  
  // Diarization settings
  diarizationEnabled Boolean @default(true)
  maxSpeakers        Int     @default(5)
  
  // Status
  status     TranscriptStatus @default(PROCESSING)
  createdAt  DateTime @default(now())
  completedAt DateTime?
  error      String?
  
  // Relationships
  mediaFile   MediaFile @relation(fields: [mediaFileId], references: [id], onDelete: Cascade)
  mediaFileId String
  
  segments    TranscriptSegment[]
  speakers    Speaker[]
  summaries   Summary[]
  
  @@map("transcripts")
  @@index([mediaFileId])
  @@index([status])
  @@index([language])
}

enum TranscriptStatus {
  PROCESSING
  COMPLETED
  FAILED
}
```

#### 4. Transcript Segments
```prisma
model TranscriptSegment {
  id         String @id @default(cuid())
  start      Float  // Start time in seconds
  end        Float  // End time in seconds
  text       String
  confidence Float
  
  // Speaker information
  speaker    Speaker? @relation(fields: [speakerId], references: [id])
  speakerId  String?
  
  // Relationships
  transcript   Transcript @relation(fields: [transcriptId], references: [id], onDelete: Cascade)
  transcriptId String
  
  words        Word[]
  
  @@map("transcript_segments")
  @@index([transcriptId, start])
  @@index([speakerId])
}
```

#### 5. Words (Word-level timestamps)
```prisma
model Word {
  id         String @id @default(cuid())
  text       String
  start      Float
  end        Float
  confidence Float
  
  // Relationship
  segment   TranscriptSegment @relation(fields: [segmentId], references: [id], onDelete: Cascade)
  segmentId String
  
  @@map("words")
  @@index([segmentId, start])
}
```

#### 6. Speakers
```prisma
model Speaker {
  id               String @id @default(cuid())
  label            String // speaker_1, speaker_2, etc.
  name             String? // User-assigned name
  totalDuration    Float   @default(0)
  segmentCount     Int     @default(0)
  averageConfidence Float  @default(0)
  
  // Relationships
  transcript   Transcript @relation(fields: [transcriptId], references: [id], onDelete: Cascade)
  transcriptId String
  
  segments     TranscriptSegment[]
  
  @@map("speakers")
  @@index([transcriptId])
  @@unique([transcriptId, label])
}
```

### AI Features

#### 7. Summaries
```prisma
model Summary {
  id          String @id @default(cuid())
  type        SummaryType
  length      SummaryLength
  content     Json // Structured content based on type
  confidence  Float?
  
  // Processing info
  model       String  @default("gpt-3.5-turbo")
  promptVersion String?
  createdAt   DateTime @default(now())
  
  // Relationships
  transcript   Transcript @relation(fields: [transcriptId], references: [id], onDelete: Cascade)
  transcriptId String
  
  @@map("summaries")
  @@index([transcriptId, type])
}

enum SummaryType {
  EXECUTIVE    // Brief overview
  KEYPOINTS    // Bullet points
  CHAPTERS     // Chapter breakdown
  ACTIONS      // Action items
}

enum SummaryLength {
  SHORT
  MEDIUM
  LONG
}
```

#### 8. Highlights
```prisma
model Highlight {
  id          String @id @default(cuid())
  title       String
  startTime   Float
  endTime     Float
  duration    Float
  confidence  Float
  reason      String // Why this was selected as highlight
  
  // AI analysis
  engagement  Float? // Predicted engagement score
  sentiment   String? // positive, neutral, negative
  keywords    String[] // Key topics/phrases
  
  // Status
  status      HighlightStatus @default(SUGGESTED)
  createdAt   DateTime @default(now())
  
  // Relationships
  mediaFile   MediaFile @relation(fields: [mediaFileId], references: [id], onDelete: Cascade)
  mediaFileId String
  
  exports     Export[]
  
  @@map("highlights")
  @@index([mediaFileId, status])
  @@index([confidence])
}

enum HighlightStatus {
  SUGGESTED   // AI-generated suggestion
  APPROVED    // User approved
  REJECTED    // User rejected
  EXPORTED    // Already exported
}
```

### Video Editing

#### 9. Timelines
```prisma
model Timeline {
  id          String @id @default(cuid())
  name        String
  description String?
  
  // Timeline settings
  settings    Json // resolution, framerate, etc.
  duration    Float @default(0)
  
  // Status
  status      TimelineStatus @default(DRAFT)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  // Relationships
  mediaFile   MediaFile @relation(fields: [mediaFileId], references: [id], onDelete: Cascade)
  mediaFileId String
  
  tracks      Track[]
  exports     Export[]
  
  @@map("timelines")
  @@index([mediaFileId])
  @@index([status])
}

enum TimelineStatus {
  DRAFT
  READY
  EXPORTING
  ARCHIVED
}
```

#### 10. Tracks
```prisma
model Track {
  id       String @id @default(cuid())
  name     String
  type     TrackType
  order    Int     @default(0)
  enabled  Boolean @default(true)
  locked   Boolean @default(false)
  
  // Track settings
  volume   Float @default(1.0)
  opacity  Float @default(1.0)
  settings Json? // Track-specific settings
  
  // Relationships
  timeline   Timeline @relation(fields: [timelineId], references: [id], onDelete: Cascade)
  timelineId String
  
  clips      Clip[]
  
  @@map("tracks")
  @@index([timelineId, order])
}

enum TrackType {
  VIDEO
  AUDIO
  TEXT
  OVERLAY
}
```

#### 11. Clips
```prisma
model Clip {
  id            String @id @default(cuid())
  name          String?
  
  // Source timing
  sourceStart   Float  // Start in source media
  sourceEnd     Float  // End in source media
  
  // Timeline timing
  timelineStart Float  // Start in timeline
  duration      Float  // Clip duration
  
  // Clip settings
  enabled       Boolean @default(true)
  locked        Boolean @default(false)
  volume        Float   @default(1.0)
  opacity       Float   @default(1.0)
  
  // Relationships
  track   Track @relation(fields: [trackId], references: [id], onDelete: Cascade)
  trackId String
  
  effects Effect[]
  
  @@map("clips")
  @@index([trackId, timelineStart])
}
```

#### 12. Effects
```prisma
model Effect {
  id         String @id @default(cuid())
  type       EffectType
  name       String
  parameters Json // Effect-specific parameters
  enabled    Boolean @default(true)
  order      Int @default(0)
  
  // Timing (for time-based effects)
  startTime  Float?
  endTime    Float?
  
  // Relationships
  clip   Clip @relation(fields: [clipId], references: [id], onDelete: Cascade)
  clipId String
  
  @@map("effects")
  @@index([clipId, order])
}

enum EffectType {
  FADE
  TRANSITION
  CROP
  SCALE
  ROTATE
  COLOR
  SPEED
  AUDIO_FILTER
  SUBTITLE
}
```

### Export System

#### 13. Exports
```prisma
model Export {
  id          String @id @default(cuid())
  filename    String
  format      String
  preset      Json? // Platform-specific settings
  settings    Json  // Export quality settings
  
  // File info
  outputPath  String?
  fileSize    BigInt?
  duration    Float?
  
  // Processing
  status      ExportStatus @default(QUEUED)
  progress    Float @default(0)
  startedAt   DateTime @default(now())
  completedAt DateTime?
  error       String?
  processingTime Float?
  
  // Relationships
  mediaFile   MediaFile? @relation(fields: [mediaFileId], references: [id])
  mediaFileId String?
  
  timeline    Timeline? @relation(fields: [timelineId], references: [id])
  timelineId  String?
  
  highlight   Highlight? @relation(fields: [highlightId], references: [id])
  highlightId String?
  
  @@map("exports")
  @@index([status, startedAt])
  @@index([mediaFileId])
  @@index([timelineId])
}

enum ExportStatus {
  QUEUED
  PROCESSING
  COMPLETED
  FAILED
  CANCELLED
}
```

### System & Configuration

#### 14. Jobs
```prisma
model Job {
  id          String @id @default(cuid())
  type        JobType
  priority    Int @default(0)
  data        Json
  
  // Status tracking
  status      JobStatus @default(PENDING)
  progress    Float @default(0)
  result      Json?
  error       String?
  
  // Timing
  createdAt   DateTime @default(now())
  startedAt   DateTime?
  completedAt DateTime?
  
  // Processing info
  attempts    Int @default(0)
  maxAttempts Int @default(3)
  
  @@map("jobs")
  @@index([type, status])
  @@index([priority, createdAt])
}

enum JobType {
  MEDIA_IMPORT
  TRANSCRIPTION
  AI_ANALYSIS
  VIDEO_PROCESSING
  EXPORT
  CLEANUP
}

enum JobStatus {
  PENDING
  ACTIVE
  COMPLETED
  FAILED
  DELAYED
  CANCELLED
}
```

#### 15. Settings
```prisma
model Setting {
  id    String @id @default(cuid())
  key   String @unique
  value Json
  
  // Metadata
  category    String?
  description String?
  updatedAt   DateTime @updatedAt
  
  @@map("settings")
  @@index([category])
}
```

## Data Relationships

### Primary Relationships
```
MediaFile (1) → (N) Transcript → (N) TranscriptSegment → (N) Word
MediaFile (1) → (N) Timeline → (N) Track → (N) Clip → (N) Effect
MediaFile (1) → (N) Export
MediaFile (1) → (N) Highlight
Transcript (1) → (N) Speaker → (N) TranscriptSegment
Transcript (1) → (N) Summary
```

### Cross-Entity Relationships
```
Timeline → Export (video editing outputs)
Highlight → Export (highlight clips)
MediaFile → MediaImport (source tracking)
Job → All entities (processing queue)
```

## Indexing Strategy

### Performance Indexes
```sql
-- Media file lookups
CREATE INDEX idx_media_files_type_status ON media_files(type, status);
CREATE INDEX idx_media_files_uploaded_at ON media_files(uploadedAt);
CREATE INDEX idx_media_files_tags ON media_files USING gin(tags);

-- Transcript queries
CREATE INDEX idx_transcripts_media_file ON transcripts(mediaFileId);
CREATE INDEX idx_transcript_segments_time ON transcript_segments(transcriptId, start);

-- Timeline operations
CREATE INDEX idx_timelines_media_file ON timelines(mediaFileId);
CREATE INDEX idx_clips_timeline_time ON clips(trackId, timelineStart);

-- Job processing
CREATE INDEX idx_jobs_queue ON jobs(type, status, priority, createdAt);
```

## Data Storage Patterns

### File System Organization
```
/media-library/
├── originals/           # Source files
│   ├── {mediaId}.{ext}
├── processed/           # Processed versions
│   ├── {mediaId}_audio.wav
│   ├── {mediaId}_preview.mp4
├── thumbnails/          # Generated thumbnails
│   ├── {mediaId}_thumb.jpg
│   ├── {mediaId}_sprites.jpg
├── waveforms/           # Audio waveform data
│   ├── {mediaId}_wave.json
├── transcripts/         # Text files
│   ├── {transcriptId}.srt
│   ├── {transcriptId}.vtt
├── exports/             # Final outputs
│   ├── {exportId}.{format}
└── temp/               # Temporary processing files
    ├── {jobId}/
```

### JSON Schema Examples

#### Media Resolution
```json
{
  "width": 1920,
  "height": 1080,
  "aspectRatio": "16:9"
}
```

#### Timeline Settings
```json
{
  "resolution": { "width": 1920, "height": 1080 },
  "framerate": 29.97,
  "sampleRate": 48000,
  "aspectRatio": "16:9"
}
```

#### Effect Parameters
```json
{
  "fade": {
    "type": "in",
    "duration": 1.0,
    "curve": "linear"
  },
  "crop": {
    "x": 0,
    "y": 0,
    "width": 1080,
    "height": 1920
  }
}
```

#### Export Preset
```json
{
  "platform": "tiktok",
  "aspectRatio": "9:16",
  "resolution": { "width": 1080, "height": 1920 },
  "maxDuration": 180,
  "framerate": 30,
  "quality": "high",
  "audioBitrate": 128
}
```

## Data Migration & Versioning

### Schema Versioning
- Use Prisma migrations for schema changes
- Version tracking in `settings` table
- Backward compatibility for data exports

### Data Cleanup Policies
- Automatic cleanup of temporary files after 24 hours
- Export file retention based on user settings
- Transcript cache management for storage optimization

## Performance Considerations

### Query Optimization
- Use connection pooling for concurrent operations
- Implement query result caching for repeated operations
- Batch operations for bulk processing

### Storage Management
- Lazy loading for large transcript data
- Streaming for large media file operations
- Compression for text-heavy data (transcripts, summaries)

### Scalability Patterns
- Partitioning by date for historical data
- Archival strategy for old projects
- Resource usage monitoring and alerts

This data model provides a robust foundation for the media transcription and editing service while maintaining performance and flexibility for future enhancements.