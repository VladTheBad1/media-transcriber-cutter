import { ExportPreset, QualityPreset } from './types';

// Social Media Platform Presets
export const SOCIAL_MEDIA_PRESETS: ExportPreset[] = [
  // TikTok
  {
    id: 'tiktok-vertical',
    name: 'TikTok',
    platform: 'TikTok',
    description: 'Vertical video optimized for TikTok',
    video: {
      codec: 'h264',
      resolution: { width: 1080, height: 1920 },
      aspectRatio: '9:16',
      bitrate: '2500k',
      fps: 30,
      format: 'mp4',
      profile: 'high',
      level: '4.0'
    },
    audio: {
      codec: 'aac',
      bitrate: '128k',
      sampleRate: 44100,
      channels: 2
    },
    subtitles: {
      format: 'burned',
      enabled: true,
      position: 'center',
      style: {
        fontFamily: 'Arial Black',
        fontSize: 52,
        fontWeight: '900',
        color: '#ffffff',
        strokeColor: '#000000',
        strokeWidth: 3,
        shadowColor: '#000000',
        shadowOffset: { x: 2, y: 2 },
        padding: { top: 20, bottom: 20, left: 20, right: 20 },
        alignment: 'center'
      }
    },
    constraints: {
      maxDuration: 180, // 3 minutes
      maxFileSize: 287 * 1024 * 1024 // 287MB
    },
    processing: {
      autoCrop: true,
      faceTracking: true,
      audioNormalization: true,
      noiseReduction: true,
      colorCorrection: true
    },
    optimization: {
      twoPass: false,
      fastStart: true,
      webOptimized: true,
      compressionLevel: 'medium'
    }
  },

  // Instagram Reels
  {
    id: 'instagram-reels',
    name: 'Instagram Reels',
    platform: 'Instagram',
    description: 'Vertical video for Instagram Reels',
    video: {
      codec: 'h264',
      resolution: { width: 1080, height: 1920 },
      aspectRatio: '9:16',
      bitrate: '3500k',
      fps: 30,
      format: 'mp4',
      profile: 'high',
      level: '4.0'
    },
    audio: {
      codec: 'aac',
      bitrate: '128k',
      sampleRate: 44100,
      channels: 2
    },
    subtitles: {
      format: 'burned',
      enabled: true,
      position: 'center',
      style: {
        fontFamily: 'Helvetica Neue',
        fontSize: 48,
        fontWeight: 'bold',
        color: '#ffffff',
        strokeColor: '#000000',
        strokeWidth: 2,
        shadowColor: '#000000',
        shadowOffset: { x: 1, y: 1 },
        padding: { top: 16, bottom: 16, left: 16, right: 16 },
        alignment: 'center'
      }
    },
    constraints: {
      maxDuration: 90, // 90 seconds
      maxFileSize: 100 * 1024 * 1024 // 100MB
    },
    processing: {
      autoCrop: true,
      faceTracking: true,
      audioNormalization: true,
      noiseReduction: true,
      colorCorrection: true
    },
    optimization: {
      twoPass: false,
      fastStart: true,
      webOptimized: true,
      compressionLevel: 'high'
    }
  },

  // Instagram Posts (Square)
  {
    id: 'instagram-post',
    name: 'Instagram Post',
    platform: 'Instagram',
    description: 'Square format for Instagram feed posts',
    video: {
      codec: 'h264',
      resolution: { width: 1080, height: 1080 },
      aspectRatio: '1:1',
      bitrate: '3500k',
      fps: 30,
      format: 'mp4',
      profile: 'high'
    },
    audio: {
      codec: 'aac',
      bitrate: '128k',
      sampleRate: 44100,
      channels: 2
    },
    subtitles: {
      format: 'burned',
      enabled: true,
      position: 'bottom',
      style: {
        fontFamily: 'Helvetica Neue',
        fontSize: 42,
        fontWeight: 'bold',
        color: '#ffffff',
        strokeColor: '#000000',
        strokeWidth: 2,
        padding: { top: 12, bottom: 12, left: 12, right: 12 },
        alignment: 'center'
      }
    },
    constraints: {
      maxDuration: 60, // 60 seconds
      maxFileSize: 100 * 1024 * 1024 // 100MB
    },
    processing: {
      autoCrop: true,
      faceTracking: true,
      audioNormalization: true,
      noiseReduction: false,
      colorCorrection: true
    },
    optimization: {
      twoPass: false,
      fastStart: true,
      webOptimized: true,
      compressionLevel: 'high'
    }
  },

  // YouTube Shorts
  {
    id: 'youtube-shorts',
    name: 'YouTube Shorts',
    platform: 'YouTube',
    description: 'Vertical short-form content for YouTube',
    video: {
      codec: 'h264',
      resolution: { width: 1080, height: 1920 },
      aspectRatio: '9:16',
      bitrate: '4000k',
      fps: 30,
      format: 'mp4',
      profile: 'high',
      level: '4.2'
    },
    audio: {
      codec: 'aac',
      bitrate: '128k',
      sampleRate: 48000,
      channels: 2
    },
    subtitles: {
      format: 'srt',
      enabled: true,
      style: {
        fontFamily: 'Roboto',
        fontSize: 44,
        fontWeight: 'bold',
        color: '#ffffff',
        backgroundColor: 'rgba(0,0,0,0.7)',
        padding: { top: 8, bottom: 8, left: 16, right: 16 },
        alignment: 'center'
      }
    },
    constraints: {
      maxDuration: 60, // 60 seconds
      maxFileSize: 512 * 1024 * 1024 // 512MB
    },
    processing: {
      autoCrop: true,
      faceTracking: true,
      audioNormalization: true,
      noiseReduction: true,
      colorCorrection: true
    },
    optimization: {
      twoPass: true,
      fastStart: true,
      webOptimized: true,
      compressionLevel: 'high'
    }
  },

  // YouTube Standard
  {
    id: 'youtube-standard',
    name: 'YouTube Video',
    platform: 'YouTube',
    description: 'Standard horizontal video for YouTube',
    video: {
      codec: 'h264',
      resolution: { width: 1920, height: 1080 },
      aspectRatio: '16:9',
      bitrate: '5000k',
      fps: 30,
      format: 'mp4',
      profile: 'high',
      level: '4.2'
    },
    audio: {
      codec: 'aac',
      bitrate: '128k',
      sampleRate: 48000,
      channels: 2
    },
    subtitles: {
      format: 'srt',
      enabled: true,
      style: {
        fontFamily: 'Roboto',
        fontSize: 20,
        fontWeight: 'normal',
        color: '#ffffff',
        backgroundColor: 'rgba(0,0,0,0.8)',
        padding: { top: 4, bottom: 4, left: 8, right: 8 },
        alignment: 'center'
      }
    },
    constraints: {
      maxDuration: 43200, // 12 hours
      maxFileSize: 256 * 1024 * 1024 * 1024 // 256GB
    },
    processing: {
      autoCrop: false,
      faceTracking: false,
      audioNormalization: true,
      noiseReduction: true,
      colorCorrection: false
    },
    optimization: {
      twoPass: true,
      fastStart: true,
      webOptimized: true,
      compressionLevel: 'high'
    }
  },

  // Twitter/X
  {
    id: 'twitter-video',
    name: 'Twitter/X Video',
    platform: 'Twitter',
    description: 'Video optimized for Twitter/X platform',
    video: {
      codec: 'h264',
      resolution: { width: 1280, height: 720 },
      aspectRatio: '16:9',
      bitrate: '2000k',
      fps: 30,
      format: 'mp4',
      profile: 'baseline'
    },
    audio: {
      codec: 'aac',
      bitrate: '128k',
      sampleRate: 44100,
      channels: 2
    },
    subtitles: {
      format: 'burned',
      enabled: true,
      position: 'bottom',
      style: {
        fontFamily: 'Helvetica',
        fontSize: 28,
        fontWeight: 'bold',
        color: '#ffffff',
        strokeColor: '#000000',
        strokeWidth: 1,
        padding: { top: 8, bottom: 8, left: 12, right: 12 },
        alignment: 'center'
      }
    },
    constraints: {
      maxDuration: 140, // 2:20
      maxFileSize: 512 * 1024 * 1024 // 512MB
    },
    processing: {
      autoCrop: false,
      faceTracking: false,
      audioNormalization: true,
      noiseReduction: true,
      colorCorrection: false
    },
    optimization: {
      twoPass: false,
      fastStart: true,
      webOptimized: true,
      compressionLevel: 'medium'
    }
  },

  // LinkedIn
  {
    id: 'linkedin-video',
    name: 'LinkedIn Video',
    platform: 'LinkedIn',
    description: 'Professional video for LinkedIn',
    video: {
      codec: 'h264',
      resolution: { width: 1920, height: 1080 },
      aspectRatio: '16:9',
      bitrate: '4000k',
      fps: 30,
      format: 'mp4',
      profile: 'high'
    },
    audio: {
      codec: 'aac',
      bitrate: '128k',
      sampleRate: 44100,
      channels: 2
    },
    subtitles: {
      format: 'srt',
      enabled: true,
      style: {
        fontFamily: 'Open Sans',
        fontSize: 18,
        fontWeight: 'normal',
        color: '#ffffff',
        backgroundColor: 'rgba(0,0,0,0.8)',
        padding: { top: 4, bottom: 4, left: 8, right: 8 },
        alignment: 'center'
      }
    },
    constraints: {
      maxDuration: 600, // 10 minutes
      maxFileSize: 200 * 1024 * 1024 // 200MB
    },
    processing: {
      autoCrop: false,
      faceTracking: false,
      audioNormalization: true,
      noiseReduction: false,
      colorCorrection: false
    },
    optimization: {
      twoPass: true,
      fastStart: true,
      webOptimized: true,
      compressionLevel: 'high'
    }
  },

  // Facebook Video
  {
    id: 'facebook-video',
    name: 'Facebook Video',
    platform: 'Facebook',
    description: 'Standard video for Facebook posts',
    video: {
      codec: 'h264',
      resolution: { width: 1280, height: 720 },
      aspectRatio: '16:9',
      bitrate: '3000k',
      fps: 30,
      format: 'mp4',
      profile: 'high'
    },
    audio: {
      codec: 'aac',
      bitrate: '128k',
      sampleRate: 44100,
      channels: 2
    },
    subtitles: {
      format: 'burned',
      enabled: true,
      position: 'bottom',
      style: {
        fontFamily: 'Helvetica',
        fontSize: 24,
        fontWeight: 'bold',
        color: '#ffffff',
        strokeColor: '#000000',
        strokeWidth: 1,
        padding: { top: 8, bottom: 8, left: 12, right: 12 },
        alignment: 'center'
      }
    },
    constraints: {
      maxDuration: 240, // 4 minutes
      maxFileSize: 1024 * 1024 * 1024 // 1GB
    },
    processing: {
      autoCrop: false,
      faceTracking: false,
      audioNormalization: true,
      noiseReduction: false,
      colorCorrection: false
    },
    optimization: {
      twoPass: false,
      fastStart: true,
      webOptimized: true,
      compressionLevel: 'medium'
    }
  }
];

// Quality presets for custom exports
export const QUALITY_PRESETS: Record<string, QualityPreset> = {
  'ultra-low': {
    name: 'Ultra Low',
    description: 'Fastest export with smallest file size',
    videoBitrate: '500k',
    audioBitrate: '64k',
    crf: 35,
    preset: 'ultrafast',
    estimatedQuality: 'low',
    estimatedSpeed: 'ultrafast'
  },
  'low': {
    name: 'Low Quality',
    description: 'Fast export with small file size',
    videoBitrate: '1000k',
    audioBitrate: '96k',
    crf: 30,
    preset: 'fast',
    estimatedQuality: 'low',
    estimatedSpeed: 'fast'
  },
  'medium': {
    name: 'Medium Quality',
    description: 'Balanced quality and speed',
    videoBitrate: '2500k',
    audioBitrate: '128k',
    crf: 23,
    preset: 'medium',
    estimatedQuality: 'medium',
    estimatedSpeed: 'medium'
  },
  'high': {
    name: 'High Quality',
    description: 'High quality with good compression',
    videoBitrate: '5000k',
    audioBitrate: '192k',
    crf: 18,
    preset: 'slow',
    estimatedQuality: 'high',
    estimatedSpeed: 'slow'
  },
  'ultra': {
    name: 'Ultra Quality',
    description: 'Maximum quality, slowest export',
    videoBitrate: '10000k',
    audioBitrate: '320k',
    crf: 15,
    preset: 'slower',
    estimatedQuality: 'ultra',
    estimatedSpeed: 'slow'
  },
  'lossless': {
    name: 'Lossless',
    description: 'No quality loss, large file size',
    videoBitrate: '50000k',
    audioBitrate: '1411k', // CD quality PCM
    crf: 0,
    preset: 'slow',
    profile: 'high444',
    estimatedQuality: 'ultra',
    estimatedSpeed: 'slow'
  }
};

// Audio-only presets
export const AUDIO_PRESETS: ExportPreset[] = [
  {
    id: 'podcast-high',
    name: 'Podcast (High Quality)',
    platform: 'Podcast',
    description: 'High quality audio for podcasts',
    audio: {
      codec: 'mp3',
      bitrate: '192k',
      sampleRate: 44100,
      channels: 2
    },
    optimization: {
      twoPass: false,
      fastStart: true,
      webOptimized: false,
      compressionLevel: 'high'
    },
    processing: {
      autoCrop: false,
      faceTracking: false,
      audioNormalization: true,
      noiseReduction: true,
      colorCorrection: false
    }
  },
  {
    id: 'podcast-medium',
    name: 'Podcast (Medium Quality)',
    platform: 'Podcast',
    description: 'Balanced quality and file size for podcasts',
    audio: {
      codec: 'mp3',
      bitrate: '128k',
      sampleRate: 44100,
      channels: 2
    },
    optimization: {
      twoPass: false,
      fastStart: true,
      webOptimized: false,
      compressionLevel: 'medium'
    },
    processing: {
      autoCrop: false,
      faceTracking: false,
      audioNormalization: true,
      noiseReduction: true,
      colorCorrection: false
    }
  },
  {
    id: 'audio-lossless',
    name: 'Lossless Audio',
    platform: 'Archive',
    description: 'Uncompressed audio for archival',
    audio: {
      codec: 'aac', // TODO: Add flac to codec type union
      bitrate: '1411k',
      sampleRate: 44100,
      channels: 2
    },
    optimization: {
      twoPass: false,
      fastStart: false,
      webOptimized: false,
      compressionLevel: 'ultra'
    },
    processing: {
      autoCrop: false,
      faceTracking: false,
      audioNormalization: false,
      noiseReduction: false,
      colorCorrection: false
    }
  }
];

// Utility functions
export function getPresetById(id: string): ExportPreset | undefined {
  return [...SOCIAL_MEDIA_PRESETS, ...AUDIO_PRESETS].find(preset => preset.id === id);
}

export function getPresetsByPlatform(platform: string): ExportPreset[] {
  return [...SOCIAL_MEDIA_PRESETS, ...AUDIO_PRESETS].filter(
    preset => preset.platform.toLowerCase() === platform.toLowerCase()
  );
}

export function validatePresetConstraints(
  preset: ExportPreset, 
  duration: number, 
  estimatedFileSize: number
): { valid: boolean; warnings: string[]; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!preset.constraints) {
    return { valid: true, warnings, errors };
  }

  const { maxDuration, maxFileSize, minFileSize } = preset.constraints;

  // Check duration constraints
  if (maxDuration && duration > maxDuration) {
    errors.push(`Duration ${Math.round(duration)}s exceeds maximum ${maxDuration}s for ${preset.platform}`);
  }

  // Check file size constraints
  if (maxFileSize && estimatedFileSize > maxFileSize) {
    const maxSizeMB = Math.round(maxFileSize / (1024 * 1024));
    const estimatedSizeMB = Math.round(estimatedFileSize / (1024 * 1024));
    warnings.push(`Estimated size ${estimatedSizeMB}MB may exceed ${maxSizeMB}MB limit for ${preset.platform}`);
  }

  if (minFileSize && estimatedFileSize < minFileSize) {
    const minSizeMB = Math.round(minFileSize / (1024 * 1024));
    warnings.push(`File size may be too small for optimal ${preset.platform} quality`);
  }

  // Check aspect ratio for auto-crop presets
  if (preset.processing?.autoCrop && preset.video?.aspectRatio) {
    warnings.push(`Auto-crop will be applied to match ${preset.video.aspectRatio} aspect ratio`);
  }

  return { 
    valid: errors.length === 0, 
    warnings, 
    errors 
  };
}

export function estimateExportTime(
  duration: number, 
  preset: ExportPreset, 
  qualityPreset?: QualityPreset
): number {
  // Base multiplier based on preset optimization
  let multiplier = 1.0;

  if (preset.optimization?.twoPass) multiplier *= 2.0;
  if (preset.processing?.autoCrop) multiplier *= 1.5;
  if (preset.processing?.faceTracking) multiplier *= 1.3;
  if (preset.processing?.noiseReduction) multiplier *= 1.2;

  // Quality-based multiplier
  if (qualityPreset) {
    const speedMultipliers = {
      'ultrafast': 0.3,
      'fast': 0.6,
      'medium': 1.0,
      'slow': 2.0
    };
    multiplier *= speedMultipliers[qualityPreset.estimatedSpeed] || 1.0;
  }

  // Video codec multiplier
  if (preset.video?.codec === 'h265') multiplier *= 3.0;
  if (preset.video?.codec === 'vp9') multiplier *= 2.5;

  return duration * multiplier;
}

export function estimateFileSize(
  duration: number, 
  preset: ExportPreset,
  qualityPreset?: QualityPreset
): number {
  let totalBitrate = 0;

  // Video bitrate
  if (preset.video?.bitrate) {
    const videoBitrate = parseInt(preset.video.bitrate.replace('k', '')) * 1000;
    totalBitrate += videoBitrate;
  }

  // Audio bitrate
  if (preset.audio?.bitrate) {
    const audioBitrate = parseInt(preset.audio.bitrate.replace('k', '')) * 1000;
    totalBitrate += audioBitrate;
  }

  // Use quality preset bitrates if available
  if (qualityPreset) {
    const videoBitrate = parseInt(qualityPreset.videoBitrate.replace('k', '')) * 1000;
    const audioBitrate = parseInt(qualityPreset.audioBitrate.replace('k', '')) * 1000;
    totalBitrate = videoBitrate + audioBitrate;
  }

  // Convert to bytes: bitrate (bits/sec) * duration (sec) / 8 (bits per byte)
  const estimatedBytes = (totalBitrate * duration) / 8;
  
  // Add 10% overhead for container and metadata
  return Math.round(estimatedBytes * 1.1);
}