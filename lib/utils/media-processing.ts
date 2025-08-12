import { TimelineData, TimelineClip, TimelineTrack } from '../services/timeline-service'

// Types for media processing
export interface MediaProcessingOptions {
  outputFormat: 'mp4' | 'webm' | 'mov' | 'avi'
  videoCodec: 'h264' | 'h265' | 'vp9' | 'av1'
  audioCodec: 'aac' | 'mp3' | 'opus' | 'wav'
  resolution: { width: number; height: number }
  frameRate: number
  videoBitrate?: number
  audioBitrate?: number
  quality: 'low' | 'medium' | 'high' | 'lossless'
}

export interface ExportPreset {
  name: string
  description: string
  targetPlatform: string
  options: MediaProcessingOptions
  maxFileSize?: number
  maxDuration?: number
}

// Popular export presets for social media platforms
export const EXPORT_PRESETS: Record<string, ExportPreset> = {
  'youtube-1080p': {
    name: 'YouTube 1080p',
    description: 'High quality for YouTube uploads',
    targetPlatform: 'YouTube',
    options: {
      outputFormat: 'mp4',
      videoCodec: 'h264',
      audioCodec: 'aac',
      resolution: { width: 1920, height: 1080 },
      frameRate: 30,
      videoBitrate: 8000,
      audioBitrate: 128,
      quality: 'high'
    }
  },
  'youtube-shorts': {
    name: 'YouTube Shorts',
    description: 'Vertical format for YouTube Shorts',
    targetPlatform: 'YouTube',
    maxDuration: 60,
    options: {
      outputFormat: 'mp4',
      videoCodec: 'h264',
      audioCodec: 'aac',
      resolution: { width: 1080, height: 1920 },
      frameRate: 30,
      videoBitrate: 6000,
      audioBitrate: 128,
      quality: 'high'
    }
  },
  'instagram-reel': {
    name: 'Instagram Reel',
    description: 'Vertical format for Instagram Reels',
    targetPlatform: 'Instagram',
    maxDuration: 90,
    options: {
      outputFormat: 'mp4',
      videoCodec: 'h264',
      audioCodec: 'aac',
      resolution: { width: 1080, height: 1920 },
      frameRate: 30,
      videoBitrate: 5000,
      audioBitrate: 128,
      quality: 'medium'
    }
  },
  'instagram-post': {
    name: 'Instagram Post',
    description: 'Square format for Instagram posts',
    targetPlatform: 'Instagram',
    maxDuration: 60,
    options: {
      outputFormat: 'mp4',
      videoCodec: 'h264',
      audioCodec: 'aac',
      resolution: { width: 1080, height: 1080 },
      frameRate: 30,
      videoBitrate: 4000,
      audioBitrate: 128,
      quality: 'medium'
    }
  },
  'tiktok': {
    name: 'TikTok',
    description: 'Vertical format for TikTok',
    targetPlatform: 'TikTok',
    maxDuration: 180,
    options: {
      outputFormat: 'mp4',
      videoCodec: 'h264',
      audioCodec: 'aac',
      resolution: { width: 1080, height: 1920 },
      frameRate: 30,
      videoBitrate: 4000,
      audioBitrate: 128,
      quality: 'medium'
    }
  },
  'twitter': {
    name: 'Twitter',
    description: 'Widescreen format for Twitter',
    targetPlatform: 'Twitter',
    maxDuration: 140,
    maxFileSize: 512 * 1024 * 1024, // 512MB
    options: {
      outputFormat: 'mp4',
      videoCodec: 'h264',
      audioCodec: 'aac',
      resolution: { width: 1280, height: 720 },
      frameRate: 30,
      videoBitrate: 3000,
      audioBitrate: 128,
      quality: 'medium'
    }
  },
  'linkedin': {
    name: 'LinkedIn',
    description: 'Professional format for LinkedIn',
    targetPlatform: 'LinkedIn',
    maxDuration: 600,
    options: {
      outputFormat: 'mp4',
      videoCodec: 'h264',
      audioCodec: 'aac',
      resolution: { width: 1920, height: 1080 },
      frameRate: 30,
      videoBitrate: 5000,
      audioBitrate: 128,
      quality: 'high'
    }
  },
  'podcast-audio': {
    name: 'Podcast Audio',
    description: 'High quality audio for podcasts',
    targetPlatform: 'Podcast',
    options: {
      outputFormat: 'mp4', // MP3 container
      videoCodec: 'h264', // No video
      audioCodec: 'mp3',
      resolution: { width: 1, height: 1 }, // Minimal video track
      frameRate: 1,
      audioBitrate: 128,
      quality: 'high'
    }
  }
}

// Frame-accurate time calculations
export const timeToFrameExact = (time: number, frameRate: number): number => {
  return Math.round(time * frameRate)
}

export const frameToTimeExact = (frame: number, frameRate: number): number => {
  return frame / frameRate
}

// Generate FFmpeg command from timeline data
export const generateFFmpegCommand = (
  timeline: TimelineData,
  inputFilePath: string,
  outputFilePath: string,
  preset: ExportPreset
): string[] => {
  const command = ['ffmpeg']
  
  // Input file
  command.push('-i', inputFilePath)
  
  // Video filters
  const videoFilters: string[] = []
  const audioFilters: string[] = []
  
  // Process each track
  timeline.tracks.forEach((track, trackIndex) => {
    if (!track.visible) return
    
    track.clips.forEach((clip, clipIndex) => {
      const startTime = clip.start
      const duration = clip.duration
      const sourceStart = clip.sourceStart || 0
      
      if (track.type === 'video') {
        // Video clip processing
        let videoFilter = `[0:v]trim=start=${sourceStart}:duration=${duration},setpts=PTS-STARTPTS`
        
        // Apply opacity if not full
        if (clip.opacity && clip.opacity !== 1.0) {
          videoFilter += `,format=rgba,colorchannelmixer=aa=${clip.opacity}`
        }
        
        // Apply effects
        clip.effects?.forEach(effect => {
          if (!effect.enabled) return
          
          switch (effect.type) {
            case 'fade':
              const fadeParams = effect.parameters as { duration: number }
              videoFilter += `,fade=t=in:st=0:d=${fadeParams.duration}`
              break
          }
        })
        
        videoFilters.push(`${videoFilter}[v${trackIndex}_${clipIndex}]`)
      } else if (track.type === 'audio') {
        // Audio clip processing
        let audioFilter = `[0:a]atrim=start=${sourceStart}:duration=${duration},asetpts=PTS-STARTPTS`
        
        // Apply volume
        const volume = (clip.volume || 1.0) * (track.volume || 1.0)
        if (volume !== 1.0) {
          audioFilter += `,volume=${volume}`
        }
        
        // Apply effects
        clip.effects?.forEach(effect => {
          if (!effect.enabled) return
          
          switch (effect.type) {
            case 'fade':
              const fadeParams = effect.parameters as { duration: number }
              audioFilter += `,afade=t=in:st=0:d=${fadeParams.duration}`
              break
          }
        })
        
        audioFilters.push(`${audioFilter}[a${trackIndex}_${clipIndex}]`)
      }
    })
  })
  
  // Combine video filters
  if (videoFilters.length > 0) {
    // Simple concatenation for now (complex overlay logic would go here)
    const videoFilterComplex = videoFilters.join(';')
    command.push('-filter_complex', videoFilterComplex)
  }
  
  // Combine audio filters
  if (audioFilters.length > 0) {
    const audioFilterComplex = audioFilters.join(';')
    command.push('-filter_complex', audioFilterComplex)
  }
  
  // Output format options
  command.push('-c:v', preset.options.videoCodec)
  command.push('-c:a', preset.options.audioCodec)
  
  // Resolution and frame rate
  command.push('-s', `${preset.options.resolution.width}x${preset.options.resolution.height}`)
  command.push('-r', preset.options.frameRate.toString())
  
  // Bitrates
  if (preset.options.videoBitrate) {
    command.push('-b:v', `${preset.options.videoBitrate}k`)
  }
  if (preset.options.audioBitrate) {
    command.push('-b:a', `${preset.options.audioBitrate}k`)
  }
  
  // Quality settings
  switch (preset.options.quality) {
    case 'low':
      command.push('-crf', '28')
      break
    case 'medium':
      command.push('-crf', '23')
      break
    case 'high':
      command.push('-crf', '18')
      break
    case 'lossless':
      command.push('-crf', '0')
      break
  }
  
  // Output file
  command.push('-y', outputFilePath) // -y to overwrite existing files
  
  return command
}

// Validate timeline for export
export const validateTimelineForExport = (
  timeline: TimelineData,
  preset: ExportPreset
): { isValid: boolean; errors: string[]; warnings: string[] } => {
  const errors: string[] = []
  const warnings: string[] = []
  
  // Check duration constraints
  if (preset.maxDuration && timeline.duration > preset.maxDuration) {
    errors.push(`Timeline duration (${timeline.duration}s) exceeds maximum for ${preset.name} (${preset.maxDuration}s)`)
  }
  
  // Check for overlapping clips
  timeline.tracks.forEach(track => {
    if (!track.visible) return
    
    const sortedClips = [...track.clips].sort((a, b) => a.start - b.start)
    for (let i = 0; i < sortedClips.length - 1; i++) {
      if (sortedClips[i].end > sortedClips[i + 1].start) {
        warnings.push(`Overlapping clips detected in track "${track.name}"`)
        break
      }
    }
  })
  
  // Check for empty tracks
  const emptyTracks = timeline.tracks.filter(track => track.visible && track.clips.length === 0)
  if (emptyTracks.length > 0) {
    warnings.push(`${emptyTracks.length} visible tracks are empty`)
  }
  
  // Check aspect ratio compatibility
  const timelineAspectRatio = timeline.settings.resolution.width / timeline.settings.resolution.height
  const presetAspectRatio = preset.options.resolution.width / preset.options.resolution.height
  
  if (Math.abs(timelineAspectRatio - presetAspectRatio) > 0.1) {
    warnings.push(`Timeline aspect ratio (${timelineAspectRatio.toFixed(2)}) differs significantly from preset (${presetAspectRatio.toFixed(2)})`)
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}

// Calculate estimated file size
export const estimateFileSize = (
  timeline: TimelineData,
  preset: ExportPreset
): { estimatedSize: number; formattedSize: string } => {
  const duration = timeline.duration
  const videoBitrate = preset.options.videoBitrate || 4000 // Default 4 Mbps
  const audioBitrate = preset.options.audioBitrate || 128 // Default 128 kbps
  
  // Rough calculation: (video bitrate + audio bitrate) * duration / 8
  const totalBitrate = videoBitrate + audioBitrate
  const estimatedSize = (totalBitrate * duration) / 8 * 1024 // Size in bytes
  
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }
  
  return {
    estimatedSize,
    formattedSize: formatBytes(estimatedSize)
  }
}

// Generate thumbnail from timeline at specific time
export const generateThumbnailCommand = (
  inputFilePath: string,
  outputFilePath: string,
  timeSeconds: number,
  width: number = 320,
  height: number = 180
): string[] => {
  return [
    'ffmpeg',
    '-i', inputFilePath,
    '-ss', timeSeconds.toString(),
    '-vframes', '1',
    '-vf', `scale=${width}:${height}`,
    '-y', outputFilePath
  ]
}

// Extract audio waveform data
export const generateWaveformCommand = (
  inputFilePath: string,
  outputFilePath: string,
  samples: number = 1000
): string[] => {
  return [
    'ffmpeg',
    '-i', inputFilePath,
    '-filter_complex', `[0:a]aformat=channel_layouts=mono,compand,showwavespic=s=${samples}x200:colors=#00FF00`,
    '-frames:v', '1',
    '-y', outputFilePath
  ]
}

// Smart crop detection for different aspect ratios
export const generateSmartCropCommand = (
  inputFilePath: string,
  outputFilePath: string,
  targetAspectRatio: number, // width/height
  duration: number
): string[] => {
  const cropFilter = `cropdetect=24:16:0`
  const scaleFilter = targetAspectRatio > 1 
    ? `scale=1920:1080` // Landscape
    : targetAspectRatio < 1 
      ? `scale=1080:1920` // Portrait  
      : `scale=1080:1080` // Square
  
  return [
    'ffmpeg',
    '-i', inputFilePath,
    '-vf', `${cropFilter},${scaleFilter}`,
    '-t', duration.toString(),
    '-y', outputFilePath
  ]
}

// Batch processing utilities
export interface BatchExportJob {
  id: string
  timeline: TimelineData
  preset: ExportPreset
  inputPath: string
  outputPath: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  error?: string
}

export class BatchExportManager {
  private jobs: Map<string, BatchExportJob> = new Map()
  private processing = false
  
  addJob(job: Omit<BatchExportJob, 'id' | 'status' | 'progress'>): string {
    const id = Math.random().toString(36).substr(2, 9)
    this.jobs.set(id, {
      ...job,
      id,
      status: 'pending',
      progress: 0
    })
    return id
  }
  
  getJob(id: string): BatchExportJob | undefined {
    return this.jobs.get(id)
  }
  
  getAllJobs(): BatchExportJob[] {
    return Array.from(this.jobs.values())
  }
  
  async processJobs(onProgress?: (job: BatchExportJob) => void): Promise<void> {
    if (this.processing) return
    
    this.processing = true
    
    const jobValues = Array.from(this.jobs.values());
    for (const job of jobValues) {
      if (job.status !== 'pending') continue
      
      job.status = 'processing'
      onProgress?.(job)
      
      try {
        // Generate FFmpeg command
        const command = generateFFmpegCommand(
          job.timeline,
          job.inputPath,
          job.outputPath,
          job.preset
        )
        
        // In a real implementation, this would execute the FFmpeg command
        // and update progress based on FFmpeg output
        console.log('Processing job:', job.id, 'Command:', command.join(' '))
        
        // Simulate progress updates
        for (let progress = 0; progress <= 100; progress += 10) {
          job.progress = progress
          onProgress?.(job)
          await new Promise(resolve => setTimeout(resolve, 100))
        }
        
        job.status = 'completed'
        job.progress = 100
      } catch (error) {
        job.status = 'failed'
        job.error = error instanceof Error ? error.message : 'Unknown error'
      }
      
      onProgress?.(job)
    }
    
    this.processing = false
  }
  
  removeJob(id: string): boolean {
    return this.jobs.delete(id)
  }
  
  clearCompleted(): void {
    const jobEntries = Array.from(this.jobs.entries());
    for (const [id, job] of jobEntries) {
      if (job.status === 'completed') {
        this.jobs.delete(id)
      }
    }
  }
}