-- CreateTable
CREATE TABLE "media_files" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "codec" TEXT,
    "size" BIGINT NOT NULL,
    "duration" REAL,
    "bitrate" INTEGER,
    "resolution" TEXT,
    "framerate" REAL,
    "audioChannels" INTEGER,
    "filePath" TEXT NOT NULL,
    "thumbnailPath" TEXT,
    "waveformPath" TEXT,
    "metadata" TEXT,
    "tags" TEXT NOT NULL,
    "category" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" DATETIME
);

-- CreateTable
CREATE TABLE "media_imports" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "quality" TEXT NOT NULL,
    "originalTitle" TEXT,
    "originalDescription" TEXT,
    "originalDuration" REAL,
    "originalThumbnail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "error" TEXT,
    "mediaFileId" TEXT,
    CONSTRAINT "media_imports_mediaFileId_fkey" FOREIGN KEY ("mediaFileId") REFERENCES "media_files" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "transcripts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "language" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "engine" TEXT NOT NULL DEFAULT 'whisperx',
    "modelVersion" TEXT,
    "processingTime" REAL,
    "diarizationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "maxSpeakers" INTEGER NOT NULL DEFAULT 5,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "error" TEXT,
    "mediaFileId" TEXT NOT NULL,
    CONSTRAINT "transcripts_mediaFileId_fkey" FOREIGN KEY ("mediaFileId") REFERENCES "media_files" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "transcript_segments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "start" REAL NOT NULL,
    "end" REAL NOT NULL,
    "text" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "speakerId" TEXT,
    "transcriptId" TEXT NOT NULL,
    CONSTRAINT "transcript_segments_speakerId_fkey" FOREIGN KEY ("speakerId") REFERENCES "speakers" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "transcript_segments_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "transcripts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "words" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "text" TEXT NOT NULL,
    "start" REAL NOT NULL,
    "end" REAL NOT NULL,
    "confidence" REAL NOT NULL,
    "segmentId" TEXT NOT NULL,
    CONSTRAINT "words_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "transcript_segments" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "speakers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "name" TEXT,
    "totalDuration" REAL NOT NULL DEFAULT 0,
    "segmentCount" INTEGER NOT NULL DEFAULT 0,
    "averageConfidence" REAL NOT NULL DEFAULT 0,
    "transcriptId" TEXT NOT NULL,
    CONSTRAINT "speakers_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "transcripts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "summaries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "length" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "confidence" REAL,
    "model" TEXT NOT NULL DEFAULT 'gpt-3.5-turbo',
    "promptVersion" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transcriptId" TEXT NOT NULL,
    CONSTRAINT "summaries_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "transcripts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "highlights" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "startTime" REAL NOT NULL,
    "endTime" REAL NOT NULL,
    "duration" REAL NOT NULL,
    "confidence" REAL NOT NULL,
    "reason" TEXT NOT NULL,
    "engagement" REAL,
    "sentiment" TEXT,
    "keywords" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUGGESTED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mediaFileId" TEXT NOT NULL,
    CONSTRAINT "highlights_mediaFileId_fkey" FOREIGN KEY ("mediaFileId") REFERENCES "media_files" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "timelines" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "settings" TEXT NOT NULL,
    "duration" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "mediaFileId" TEXT NOT NULL,
    CONSTRAINT "timelines_mediaFileId_fkey" FOREIGN KEY ("mediaFileId") REFERENCES "media_files" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tracks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "volume" REAL NOT NULL DEFAULT 1.0,
    "opacity" REAL NOT NULL DEFAULT 1.0,
    "settings" TEXT,
    "timelineId" TEXT NOT NULL,
    CONSTRAINT "tracks_timelineId_fkey" FOREIGN KEY ("timelineId") REFERENCES "timelines" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "clips" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "sourceStart" REAL NOT NULL,
    "sourceEnd" REAL NOT NULL,
    "timelineStart" REAL NOT NULL,
    "duration" REAL NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "volume" REAL NOT NULL DEFAULT 1.0,
    "opacity" REAL NOT NULL DEFAULT 1.0,
    "trackId" TEXT NOT NULL,
    CONSTRAINT "clips_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "tracks" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "effects" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parameters" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "startTime" REAL,
    "endTime" REAL,
    "clipId" TEXT NOT NULL,
    CONSTRAINT "effects_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "clips" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "exports" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "preset" TEXT,
    "settings" TEXT NOT NULL,
    "outputPath" TEXT,
    "fileSize" BIGINT,
    "duration" REAL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "progress" REAL NOT NULL DEFAULT 0,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "error" TEXT,
    "processingTime" REAL,
    "mediaFileId" TEXT,
    "timelineId" TEXT,
    "highlightId" TEXT,
    CONSTRAINT "exports_mediaFileId_fkey" FOREIGN KEY ("mediaFileId") REFERENCES "media_files" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "exports_timelineId_fkey" FOREIGN KEY ("timelineId") REFERENCES "timelines" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "exports_highlightId_fkey" FOREIGN KEY ("highlightId") REFERENCES "highlights" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "data" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "progress" REAL NOT NULL DEFAULT 0,
    "result" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "media_files_filePath_key" ON "media_files"("filePath");

-- CreateIndex
CREATE INDEX "media_files_type_status_idx" ON "media_files"("type", "status");

-- CreateIndex
CREATE INDEX "media_files_uploadedAt_idx" ON "media_files"("uploadedAt");

-- CreateIndex
CREATE INDEX "media_imports_status_startedAt_idx" ON "media_imports"("status", "startedAt");

-- CreateIndex
CREATE INDEX "transcripts_mediaFileId_idx" ON "transcripts"("mediaFileId");

-- CreateIndex
CREATE INDEX "transcripts_status_idx" ON "transcripts"("status");

-- CreateIndex
CREATE INDEX "transcripts_language_idx" ON "transcripts"("language");

-- CreateIndex
CREATE INDEX "transcript_segments_transcriptId_start_idx" ON "transcript_segments"("transcriptId", "start");

-- CreateIndex
CREATE INDEX "transcript_segments_speakerId_idx" ON "transcript_segments"("speakerId");

-- CreateIndex
CREATE INDEX "words_segmentId_start_idx" ON "words"("segmentId", "start");

-- CreateIndex
CREATE INDEX "speakers_transcriptId_idx" ON "speakers"("transcriptId");

-- CreateIndex
CREATE UNIQUE INDEX "speakers_transcriptId_label_key" ON "speakers"("transcriptId", "label");

-- CreateIndex
CREATE INDEX "summaries_transcriptId_type_idx" ON "summaries"("transcriptId", "type");

-- CreateIndex
CREATE INDEX "highlights_mediaFileId_status_idx" ON "highlights"("mediaFileId", "status");

-- CreateIndex
CREATE INDEX "highlights_confidence_idx" ON "highlights"("confidence");

-- CreateIndex
CREATE INDEX "timelines_mediaFileId_idx" ON "timelines"("mediaFileId");

-- CreateIndex
CREATE INDEX "timelines_status_idx" ON "timelines"("status");

-- CreateIndex
CREATE INDEX "tracks_timelineId_order_idx" ON "tracks"("timelineId", "order");

-- CreateIndex
CREATE INDEX "clips_trackId_timelineStart_idx" ON "clips"("trackId", "timelineStart");

-- CreateIndex
CREATE INDEX "effects_clipId_order_idx" ON "effects"("clipId", "order");

-- CreateIndex
CREATE INDEX "exports_status_startedAt_idx" ON "exports"("status", "startedAt");

-- CreateIndex
CREATE INDEX "exports_mediaFileId_idx" ON "exports"("mediaFileId");

-- CreateIndex
CREATE INDEX "exports_timelineId_idx" ON "exports"("timelineId");

-- CreateIndex
CREATE INDEX "jobs_status_priority_idx" ON "jobs"("status", "priority");

-- CreateIndex
CREATE INDEX "jobs_type_status_idx" ON "jobs"("type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key");

-- CreateIndex
CREATE INDEX "settings_category_idx" ON "settings"("category");
