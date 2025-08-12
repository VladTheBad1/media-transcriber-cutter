// Export System Types
export interface ExportPreset {
  id: string;
  name: string;
  platform: string;
  description: string;
  
  // Video settings
  video?: {
    codec: 'h264' | 'h265' | 'vp8' | 'vp9';
    resolution: { width: number; height: number };
    aspectRatio: string;
    bitrate: string;
    fps: number;
    format: 'mp4' | 'webm' | 'mov' | 'avi';
    profile?: string;
    level?: string;
  };
  
  // Audio settings
  audio?: {
    codec: 'aac' | 'mp3' | 'opus' | 'vorbis';
    bitrate: string;
    sampleRate: number;
    channels: number;
  };
  
  // Subtitle settings
  subtitles?: {
    format: 'srt' | 'vtt' | 'ass' | 'burned';
    style?: SubtitleStyle;
    position?: 'top' | 'center' | 'bottom';
    enabled: boolean;
  };
  
  // Platform constraints
  constraints?: {
    maxDuration?: number; // seconds
    maxFileSize?: number; // bytes
    minFileSize?: number;
    requiredAspectRatio?: string;
  };
  
  // Auto-processing options
  processing?: {
    autoCrop: boolean;
    faceTracking: boolean;
    audioNormalization: boolean;
    noiseReduction: boolean;
    colorCorrection: boolean;
  };
  
  // Optimization settings
  optimization?: {
    twoPass: boolean;
    fastStart: boolean;
    webOptimized: boolean;
    compressionLevel: 'low' | 'medium' | 'high' | 'ultra';
  };
}

export interface SubtitleStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900';
  color: string;
  backgroundColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  shadowColor?: string;
  shadowOffset?: { x: number; y: number };
  padding?: { top: number; bottom: number; left: number; right: number };
  alignment: 'left' | 'center' | 'right';
  position?: { x: number; y: number }; // percentage from top-left
}

export interface ExportJob {
  id: string;
  mediaFileId?: string;
  timelineId?: string;
  highlightId?: string;
  
  preset?: ExportPreset;
  customSettings?: Partial<ExportPreset>;
  
  // Timeline specific
  timeline?: {
    startTime: number;
    endTime: number;
    tracks: string[]; // track IDs to include
  };
  
  // Output settings
  output: {
    filename: string;
    directory: string;
    overwrite: boolean;
  };
  
  // Processing options
  options: {
    priority: number;
    includeSubtitles: boolean;
    subtitleLanguage?: string;
    watermark?: {
      enabled: boolean;
      text?: string;
      image?: string;
      position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
      opacity: number;
    };
    preview?: {
      enabled: boolean;
      maxDuration: number; // seconds
    };
  };
  
  // Status and progress
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number; // 0-100
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  
  // Results
  result?: {
    outputPath: string;
    fileSize: number;
    duration: number;
    actualBitrate?: number;
    quality?: {
      psnr?: number;
      ssim?: number;
    };
  };
}

export interface ExportProgress {
  jobId: string;
  stage: 'preparing' | 'processing' | 'finalizing' | 'complete';
  progress: number;
  currentOperation?: string;
  timeRemaining?: number;
  processedFrames?: number;
  totalFrames?: number;
  bitrate?: string;
  fps?: number;
  speed?: string; // e.g., "2.5x"
}

export interface BatchExportJob {
  id: string;
  jobs: ExportJob[];
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  startedAt?: Date;
  completedAt?: Date;
  
  results: {
    successful: number;
    failed: number;
    total: number;
    outputs: string[];
  };
}

export interface ExportValidation {
  valid: boolean;
  warnings: string[];
  errors: string[];
  estimatedDuration?: number;
  estimatedFileSize?: number;
}

export interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  trackingData?: {
    startTime: number;
    endTime: number;
    keyframes: Array<{
      time: number;
      region: { x: number; y: number; width: number; height: number };
    }>;
  };
}

export interface VideoAnalysisResult {
  faces: Array<{
    boundingBox: CropRegion;
    confidence: number;
    timeRange: { start: number; end: number };
  }>;
  
  objects: Array<{
    type: string;
    boundingBox: CropRegion;
    confidence: number;
    timeRange: { start: number; end: number };
  }>;
  
  recommendedCrops: {
    vertical: CropRegion;
    square: CropRegion;
    horizontal: CropRegion;
  };
  
  qualityMetrics: {
    averageBrightness: number;
    contrast: number;
    sharpness: number;
    colorfulness: number;
  };
}

// FFmpeg-specific types
export interface FFmpegFilter {
  name: string;
  options?: Record<string, string | number>;
  inputs?: string[];
  outputs?: string[];
}

export interface FFmpegCommand {
  inputs: Array<{
    path: string;
    options?: string[];
  }>;
  
  filters?: FFmpegFilter[];
  
  output: {
    path: string;
    options: string[];
    format?: string;
  };
  
  globalOptions?: string[];
}

// Event types for progress tracking
export interface ExportEvent {
  type: 'started' | 'progress' | 'completed' | 'failed' | 'cancelled';
  jobId: string;
  timestamp: Date;
  data?: any;
}

export type ExportEventCallback = (event: ExportEvent) => void;

// Quality presets
export interface QualityPreset {
  name: string;
  description: string;
  videoBitrate: string;
  audioBitrate: string;
  crf?: number;
  preset?: string;
  profile?: string;
  level?: string;
  estimatedQuality: 'low' | 'medium' | 'high' | 'ultra';
  estimatedSpeed: 'slow' | 'medium' | 'fast' | 'ultrafast';
}