/**
 * Media Processing Library - Main exports
 */

// Core classes
export { MediaProcessor, MediaProcessingError } from './ffmpeg';
export { BrowserMediaProcessor } from './browser';
export { MediaProcessingQueue } from './queue';
export { MediaStorage } from './storage';
export { MediaService } from './service';

// Utilities
export {
  detectFormat,
  isFormatSupported,
  getFormatsByCategory,
  getSupportedExtensions,
  getMimeType,
  isVideoFormat,
  isAudioFormat,
  validateFileSize,
  formatFileSize,
  formatDuration,
  getPreset,
  SUPPORTED_FORMATS,
  EXPORT_PRESETS
} from './formats';

// Types
export type {
  AudioExtractionOptions,
  ProcessingResult,
  MediaMetadata
  // BrowserProcessingOptions // TODO: Export this type from ffmpeg module
} from './ffmpeg';

export type {
  MediaProcessingJob,
  JobResult
} from './queue';

export type {
  StorageConfig
} from './storage';

export type {
  MediaFormat
} from './formats';

export type {
  ProcessingOptions,
  UploadResult
} from './service';

// Default service instance
import MediaService from './service';

// Create default service instance with environment configuration
export const mediaService = new MediaService({
  ffmpegPath: process.env.FFMPEG_PATH,
  maxConcurrent: parseInt(process.env.PROCESSING_WORKERS || '3'),
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  mediaDir: process.env.MEDIA_DIR || './media',
  tempDir: process.env.TEMP_DIR || './temp'
});

// Initialize service on import (for server-side usage, but not during build)
if (typeof window === 'undefined' && process.env.NODE_ENV !== 'production' && !process.env.NEXT_PHASE) {
  mediaService.initialize().catch(error => {
    console.error('Failed to initialize media service:', error);
  });
}
