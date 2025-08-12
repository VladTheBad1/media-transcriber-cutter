/**
 * Media format detection and validation utilities
 */

export interface MediaFormat {
  extension: string;
  mimeType: string;
  category: 'video' | 'audio';
  codec?: string;
  description: string;
  supported: boolean;
  quality: 'low' | 'medium' | 'high' | 'lossless';
}

export const SUPPORTED_FORMATS: Record<string, MediaFormat> = {
  // Video formats
  mp4: {
    extension: 'mp4',
    mimeType: 'video/mp4',
    category: 'video',
    codec: 'H.264/AAC',
    description: 'MPEG-4 Video',
    supported: true,
    quality: 'high'
  },
  avi: {
    extension: 'avi',
    mimeType: 'video/x-msvideo',
    category: 'video',
    description: 'Audio Video Interleave',
    supported: true,
    quality: 'medium'
  },
  mov: {
    extension: 'mov',
    mimeType: 'video/quicktime',
    category: 'video',
    codec: 'H.264/AAC',
    description: 'QuickTime Movie',
    supported: true,
    quality: 'high'
  },
  mkv: {
    extension: 'mkv',
    mimeType: 'video/x-matroska',
    category: 'video',
    description: 'Matroska Video',
    supported: true,
    quality: 'high'
  },
  webm: {
    extension: 'webm',
    mimeType: 'video/webm',
    category: 'video',
    codec: 'VP8/VP9/Vorbis',
    description: 'WebM Video',
    supported: true,
    quality: 'high'
  },
  flv: {
    extension: 'flv',
    mimeType: 'video/x-flv',
    category: 'video',
    description: 'Flash Video',
    supported: true,
    quality: 'medium'
  },
  m4v: {
    extension: 'm4v',
    mimeType: 'video/x-m4v',
    category: 'video',
    codec: 'H.264/AAC',
    description: 'iTunes Video',
    supported: true,
    quality: 'high'
  },
  wmv: {
    extension: 'wmv',
    mimeType: 'video/x-ms-wmv',
    category: 'video',
    description: 'Windows Media Video',
    supported: true,
    quality: 'medium'
  },
  '3gp': {
    extension: '3gp',
    mimeType: 'video/3gpp',
    category: 'video',
    description: '3GPP Video',
    supported: true,
    quality: 'low'
  },
  ogv: {
    extension: 'ogv',
    mimeType: 'video/ogg',
    category: 'video',
    codec: 'Theora/Vorbis',
    description: 'Ogg Video',
    supported: true,
    quality: 'medium'
  },
  
  // Audio formats
  mp3: {
    extension: 'mp3',
    mimeType: 'audio/mpeg',
    category: 'audio',
    codec: 'MPEG-1 Audio Layer III',
    description: 'MP3 Audio',
    supported: true,
    quality: 'high'
  },
  wav: {
    extension: 'wav',
    mimeType: 'audio/wav',
    category: 'audio',
    codec: 'PCM',
    description: 'WAV Audio',
    supported: true,
    quality: 'lossless'
  },
  flac: {
    extension: 'flac',
    mimeType: 'audio/flac',
    category: 'audio',
    codec: 'FLAC',
    description: 'Free Lossless Audio Codec',
    supported: true,
    quality: 'lossless'
  },
  aac: {
    extension: 'aac',
    mimeType: 'audio/aac',
    category: 'audio',
    codec: 'Advanced Audio Coding',
    description: 'AAC Audio',
    supported: true,
    quality: 'high'
  },
  m4a: {
    extension: 'm4a',
    mimeType: 'audio/m4a',
    category: 'audio',
    codec: 'AAC',
    description: 'MPEG-4 Audio',
    supported: true,
    quality: 'high'
  },
  ogg: {
    extension: 'ogg',
    mimeType: 'audio/ogg',
    category: 'audio',
    codec: 'Vorbis',
    description: 'Ogg Vorbis Audio',
    supported: true,
    quality: 'high'
  },
  wma: {
    extension: 'wma',
    mimeType: 'audio/x-ms-wma',
    category: 'audio',
    codec: 'Windows Media Audio',
    description: 'Windows Media Audio',
    supported: true,
    quality: 'medium'
  },
  aiff: {
    extension: 'aiff',
    mimeType: 'audio/aiff',
    category: 'audio',
    codec: 'PCM',
    description: 'Audio Interchange File Format',
    supported: true,
    quality: 'lossless'
  }
};

/**
 * Detect media format from file extension
 */
export function detectFormat(filename: string): MediaFormat | null {
  const extension = filename.split('.').pop()?.toLowerCase();
  if (!extension) return null;
  
  return SUPPORTED_FORMATS[extension] || null;
}

/**
 * Check if file format is supported
 */
export function isFormatSupported(filename: string): boolean {
  const format = detectFormat(filename);
  return format?.supported || false;
}

/**
 * Get supported formats by category
 */
export function getFormatsByCategory(category: 'video' | 'audio'): MediaFormat[] {
  return Object.values(SUPPORTED_FORMATS).filter(
    format => format.category === category && format.supported
  );
}

/**
 * Get all supported extensions
 */
export function getSupportedExtensions(): string[] {
  return Object.keys(SUPPORTED_FORMATS);
}

/**
 * Get MIME type for file extension
 */
export function getMimeType(filename: string): string | null {
  const format = detectFormat(filename);
  return format?.mimeType || null;
}

/**
 * Check if format is video
 */
export function isVideoFormat(filename: string): boolean {
  const format = detectFormat(filename);
  return format?.category === 'video' || false;
}

/**
 * Check if format is audio
 */
export function isAudioFormat(filename: string): boolean {
  const format = detectFormat(filename);
  return format?.category === 'audio' || false;
}

/**
 * Get optimal export formats for different use cases
 */
export const EXPORT_PRESETS = {
  // Social media presets
  tiktok: {
    format: 'mp4',
    aspectRatio: '9:16',
    maxDuration: 180,
    resolution: { width: 720, height: 1280 },
    bitrate: '2500k',
    audioBitrate: '128k'
  },
  instagram_reel: {
    format: 'mp4',
    aspectRatio: '9:16',
    maxDuration: 90,
    resolution: { width: 720, height: 1280 },
    bitrate: '3000k',
    audioBitrate: '128k'
  },
  instagram_post: {
    format: 'mp4',
    aspectRatio: '1:1',
    maxDuration: 60,
    resolution: { width: 720, height: 720 },
    bitrate: '2000k',
    audioBitrate: '128k'
  },
  youtube_short: {
    format: 'mp4',
    aspectRatio: '9:16',
    maxDuration: 60,
    resolution: { width: 1080, height: 1920 },
    bitrate: '5000k',
    audioBitrate: '192k'
  },
  youtube_video: {
    format: 'mp4',
    aspectRatio: '16:9',
    resolution: { width: 1920, height: 1080 },
    bitrate: '8000k',
    audioBitrate: '192k'
  },
  twitter: {
    format: 'mp4',
    aspectRatio: '16:9',
    maxDuration: 140,
    resolution: { width: 1280, height: 720 },
    bitrate: '2000k',
    audioBitrate: '128k'
  },
  linkedin: {
    format: 'mp4',
    aspectRatio: '16:9',
    maxDuration: 600,
    resolution: { width: 1920, height: 1080 },
    bitrate: '5000k',
    audioBitrate: '192k'
  },
  
  // Quality presets
  web_optimized: {
    format: 'mp4',
    resolution: { width: 1280, height: 720 },
    bitrate: '2000k',
    audioBitrate: '128k'
  },
  high_quality: {
    format: 'mp4',
    resolution: { width: 1920, height: 1080 },
    bitrate: '8000k',
    audioBitrate: '192k'
  },
  archive_quality: {
    format: 'mkv',
    bitrate: '15000k',
    audioBitrate: '320k'
  },
  
  // Audio presets
  podcast: {
    format: 'mp3',
    audioBitrate: '128k',
    channels: 1,
    sampleRate: 44100
  },
  music: {
    format: 'mp3',
    audioBitrate: '320k',
    channels: 2,
    sampleRate: 44100
  },
  transcription: {
    format: 'wav',
    audioBitrate: '64k',
    channels: 1,
    sampleRate: 16000
  }
};

/**
 * Get preset configuration
 */
export function getPreset(presetName: string): any {
  return EXPORT_PRESETS[presetName as keyof typeof EXPORT_PRESETS];
}

/**
 * Validate file size based on format and use case
 */
export function validateFileSize(
  filename: string,
  fileSize: number,
  maxSize?: number
): { valid: boolean; error?: string } {
  const format = detectFormat(filename);
  if (!format) {
    return { valid: false, error: 'Unknown file format' };
  }
  
  // Default max sizes (in bytes)
  const defaultMaxSizes = {
    video: 5 * 1024 * 1024 * 1024, // 5GB
    audio: 1 * 1024 * 1024 * 1024  // 1GB
  };
  
  const maxAllowedSize = maxSize || defaultMaxSizes[format.category];
  
  if (fileSize > maxAllowedSize) {
    return {
      valid: false,
      error: `File size ${formatFileSize(fileSize)} exceeds maximum ${formatFileSize(maxAllowedSize)} for ${format.category} files`
    };
  }
  
  return { valid: true };
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
