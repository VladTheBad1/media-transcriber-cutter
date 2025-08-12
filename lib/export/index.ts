// Export System - Main Entry Point

export * from './types';
export * from './presets';
export * from './subtitle-generator';
export * from './auto-crop';
export * from './video-exporter';
export * from './queue';

// Re-export commonly used types and functions
export type {
  ExportPreset,
  ExportJob,
  ExportProgress,
  SubtitleStyle,
  CropRegion,
  VideoAnalysisResult,
  ExportEventCallback
} from './types';

export {
  SOCIAL_MEDIA_PRESETS,
  QUALITY_PRESETS,
  AUDIO_PRESETS,
  getPresetById,
  getPresetsByPlatform,
  validatePresetConstraints,
  estimateExportTime,
  estimateFileSize
} from './presets';

export { SubtitleGenerator } from './subtitle-generator';
export { AutoCropProcessor } from './auto-crop';
export { VideoExporter } from './video-exporter';
export { ExportQueue, getExportQueue } from './queue';

// Utility functions for common operations
import { ExportPreset, ExportJob } from './types';
import { SOCIAL_MEDIA_PRESETS, validatePresetConstraints } from './presets';

/**
 * Create an export job with platform preset
 */
export function createExportJobWithPreset(
  presetId: string,
  mediaFileId: string,
  outputFilename: string,
  options: {
    includeSubtitles?: boolean;
    priority?: number;
    outputDirectory?: string;
    timeline?: {
      startTime: number;
      endTime: number;
      tracks?: string[];
    };
  } = {}
): Omit<ExportJob, 'id' | 'status' | 'progress'> {
  const preset = SOCIAL_MEDIA_PRESETS.find(p => p.id === presetId);
  if (!preset) {
    throw new Error(`Preset ${presetId} not found`);
  }

  return {
    mediaFileId,
    preset,
    timeline: { 
      ...options.timeline, 
      tracks: options.timeline?.tracks || [] 
    },
    output: {
      filename: outputFilename,
      directory: options.outputDirectory || 'exports',
      overwrite: true
    },
    options: {
      priority: options.priority || 0,
      includeSubtitles: options.includeSubtitles ?? true,
      watermark: {
        enabled: false,
        position: 'bottom-right',
        opacity: 0.7
      },
      preview: {
        enabled: false,
        maxDuration: 10
      }
    }
  };
}

/**
 * Validate export settings before queuing
 */
export async function validateExportSettings(
  job: Omit<ExportJob, 'id' | 'status' | 'progress'>,
  duration: number
): Promise<{
  valid: boolean;
  warnings: string[];
  errors: string[];
  estimates?: {
    fileSize: number;
    processingTime: number;
  };
}> {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!job.preset) {
    errors.push('Export preset is required');
    return { valid: false, warnings, errors };
  }

  // Validate preset constraints
  const validation = validatePresetConstraints(job.preset, duration, 0);
  warnings.push(...validation.warnings);
  errors.push(...validation.errors);

  // Estimate file size and processing time
  let estimatedFileSize = 0;
  let estimatedProcessingTime = 0;

  if (job.preset.video?.bitrate && job.preset.audio?.bitrate) {
    const videoBitrate = parseInt(job.preset.video.bitrate.replace('k', '')) * 1000;
    const audioBitrate = parseInt(job.preset.audio.bitrate.replace('k', '')) * 1000;
    estimatedFileSize = Math.round(((videoBitrate + audioBitrate) * duration / 8) * 1.1);
  }

  // Estimate processing time based on preset complexity
  estimatedProcessingTime = duration;
  if (job.preset.optimization?.twoPass) estimatedProcessingTime *= 2;
  if (job.preset.processing?.autoCrop) estimatedProcessingTime *= 1.5;
  if (job.preset.processing?.faceTracking) estimatedProcessingTime *= 1.3;

  return {
    valid: errors.length === 0,
    warnings,
    errors,
    estimates: {
      fileSize: estimatedFileSize,
      processingTime: estimatedProcessingTime
    }
  };
}

/**
 * Get recommended export presets for a platform
 */
export function getRecommendedPresetsForPlatform(platform: string): ExportPreset[] {
  const platformPresets = SOCIAL_MEDIA_PRESETS.filter(
    preset => preset.platform.toLowerCase() === platform.toLowerCase()
  );

  // Sort by common usage patterns
  const priorityOrder = ['reels', 'shorts', 'video', 'post'];
  
  return platformPresets.sort((a, b) => {
    const aIndex = priorityOrder.findIndex(term => a.id.includes(term));
    const bIndex = priorityOrder.findIndex(term => b.id.includes(term));
    
    if (aIndex === -1 && bIndex === -1) return 0;
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    
    return aIndex - bIndex;
  });
}

/**
 * Generate batch export jobs for multiple platforms
 */
export function createMultiPlatformExportJobs(
  mediaFileId: string,
  baseFilename: string,
  platforms: string[],
  options: {
    timeline?: {
      startTime: number;
      endTime: number;
      tracks?: string[];
    };
    includeSubtitles?: boolean;
    outputDirectory?: string;
    priority?: number;
  } = {}
): Array<Omit<ExportJob, 'id' | 'status' | 'progress'>> {
  const jobs: Array<Omit<ExportJob, 'id' | 'status' | 'progress'>> = [];

  platforms.forEach(platform => {
    const presets = getRecommendedPresetsForPlatform(platform);
    
    presets.forEach(preset => {
      const filename = `${baseFilename}_${preset.id}.${preset.video?.format || 'mp4'}`;
      
      jobs.push(createExportJobWithPreset(
        preset.id,
        mediaFileId,
        filename,
        options
      ));
    });
  });

  return jobs;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Format duration for display
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
}

/**
 * Calculate aspect ratio from resolution
 */
export function calculateAspectRatio(width: number, height: number): string {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
}

/**
 * Parse aspect ratio to dimensions
 */
export function parseAspectRatio(aspectRatio: string, maxWidth: number): { width: number; height: number } {
  const [w, h] = aspectRatio.split(':').map(Number);
  const ratio = w / h;
  
  const width = maxWidth;
  const height = Math.round(width / ratio);
  
  return { width, height };
}