import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs/promises';
import { TimelineClip, TimelineTrack, TimelineState } from '@/lib/timeline/operations';
import { ExportPreset, ExportJob, ExportProgress, SubtitleStyle } from './types';
import { SubtitleGenerator } from './subtitle-generator';

export interface FFmpegExportOptions {
  preset: ExportPreset;
  timeline?: {
    startTime: number;
    endTime: number;
    tracks: TimelineTrack[];
  };
  subtitles?: {
    segments: Array<{
      id: string;
      startTime: number;
      endTime: number;
      text: string;
      speaker?: string;
    }>;
    style?: SubtitleStyle;
    format: 'srt' | 'vtt' | 'burned';
  };
  watermark?: {
    text: string;
    position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
    opacity: number;
  };
  outputPath: string;
  onProgress?: (progress: ExportProgress) => void;
}

export interface FFmpegExportResult {
  success: boolean;
  outputPath?: string;
  fileSize?: number;
  duration?: number;
  error?: string;
  processingTime: number;
}

export class FFmpegExporter {
  private subtitleGenerator: SubtitleGenerator;
  private tempDir: string;

  constructor(options: { tempDir?: string } = {}) {
    this.subtitleGenerator = new SubtitleGenerator();
    this.tempDir = options.tempDir || './temp/export';
  }

  /**
   * Export video from timeline segments using FFmpeg
   */
  async exportVideo(
    inputPath: string,
    options: FFmpegExportOptions
  ): Promise<FFmpegExportResult> {
    const startTime = Date.now();
    
    try {
      // Ensure output directory exists
      await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
      await fs.mkdir(this.tempDir, { recursive: true });

      // Build FFmpeg command based on timeline or simple export
      if (options.timeline && options.timeline.tracks.length > 0) {
        return await this.exportFromTimeline(inputPath, options);
      } else {
        return await this.exportSimple(inputPath, options);
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: (Date.now() - startTime) / 1000
      };
    }
  }

  /**
   * Export video from timeline with complex editing
   */
  private async exportFromTimeline(
    inputPath: string,
    options: FFmpegExportOptions
  ): Promise<FFmpegExportResult> {
    const startTime = Date.now();
    const { preset, timeline, subtitles, watermark, outputPath, onProgress } = options;

    if (!timeline) {
      throw new Error('Timeline is required for timeline export');
    }

    // Get video segments from timeline
    const videoTrack = timeline.tracks.find(t => t.type === 'video');
    const audioTrack = timeline.tracks.find(t => t.type === 'audio');
    
    if (!videoTrack?.clips.length) {
      throw new Error('No video clips found in timeline');
    }

    // Create filter complex for timeline editing
    const filterComplex = this.buildTimelineFilterComplex(
      videoTrack.clips,
      audioTrack?.clips || [],
      preset,
      subtitles,
      watermark
    );

    return new Promise((resolve, reject) => {
      let lastProgress = 0;
      let processedFrames = 0;
      let totalFrames = 0;

      const command = ffmpeg(inputPath)
        .complexFilter(filterComplex, 'final_output')
        .map('final_output');

      // Apply video codec settings
      if (preset.video) {
        command
          .videoCodec(preset.video.codec === 'h264' ? 'libx264' : preset.video.codec)
          .videoBitrate(preset.video.bitrate)
          .size(`${preset.video.resolution.width}x${preset.video.resolution.height}`)
          .fps(preset.video.fps);

        if (preset.video.profile) {
          command.outputOptions(`-profile:v ${preset.video.profile}`);
        }
        if (preset.video.level) {
          command.outputOptions(`-level:v ${preset.video.level}`);
        }
      }

      // Apply audio codec settings
      if (preset.audio) {
        command
          .audioCodec(preset.audio.codec === 'aac' ? 'aac' : preset.audio.codec)
          .audioBitrate(preset.audio.bitrate)
          .audioFrequency(preset.audio.sampleRate)
          .audioChannels(preset.audio.channels);
      }

      // Apply optimization settings
      if (preset.optimization) {
        if (preset.optimization.fastStart) {
          command.outputOptions('-movflags +faststart');
        }
        if (preset.optimization.webOptimized) {
          command.outputOptions('-pix_fmt yuv420p');
        }
      }

      // Format
      if (preset.video?.format) {
        command.format(preset.video.format);
      }

      // Progress tracking
      command.on('start', (commandLine) => {
        console.log('FFmpeg command:', commandLine);
        onProgress?.({
          jobId: path.basename(outputPath),
          stage: 'processing',
          progress: 0,
          currentOperation: 'Starting export...'
        });
      });

      command.on('progress', (progress) => {
        const currentProgress = Math.min(progress.percent || 0, 100);
        
        if (currentProgress > lastProgress + 1) { // Update every 1%
          lastProgress = currentProgress;
          processedFrames = progress.frames || 0;
          totalFrames = Math.max(totalFrames, processedFrames);

          onProgress?.({
            jobId: path.basename(outputPath),
            stage: 'processing',
            progress: currentProgress,
            currentOperation: 'Encoding video...',
            processedFrames,
            totalFrames,
            bitrate: progress.currentKbps ? `${progress.currentKbps}k` : undefined,
            fps: progress.currentFps,
            speed: (progress as any).speed
          });
        }
      });

      command.on('end', async () => {
        try {
          const stats = await fs.stat(outputPath);
          const metadata = await this.getVideoMetadata(outputPath);
          
          onProgress?.({
            jobId: path.basename(outputPath),
            stage: 'complete',
            progress: 100,
            currentOperation: 'Export completed'
          });

          resolve({
            success: true,
            outputPath,
            fileSize: stats.size,
            duration: metadata?.format?.duration,
            processingTime: (Date.now() - startTime) / 1000
          });
        } catch (error) {
          resolve({
            success: true,
            outputPath,
            processingTime: (Date.now() - startTime) / 1000
          });
        }
      });

      command.on('error', (err) => {
        console.error('FFmpeg error:', err);
        reject(new Error(`FFmpeg export failed: ${err.message}`));
      });

      // Start the export
      command.save(outputPath);
    });
  }

  /**
   * Simple export without timeline editing
   */
  private async exportSimple(
    inputPath: string,
    options: FFmpegExportOptions
  ): Promise<FFmpegExportResult> {
    const startTime = Date.now();
    const { preset, subtitles, watermark, outputPath, onProgress } = options;

    return new Promise((resolve, reject) => {
      let lastProgress = 0;

      const command = ffmpeg(inputPath);

      // Build filter chain
      const filters: string[] = [];

      // Video scaling
      if (preset.video) {
        filters.push(`scale=${preset.video.resolution.width}:${preset.video.resolution.height}`);
      }

      // Burned-in subtitles
      if (subtitles?.format === 'burned' && subtitles.segments.length > 0 && subtitles.style) {
        const subtitleFilter = this.buildBurnedSubtitleFilter(subtitles.segments, subtitles.style);
        filters.push(subtitleFilter);
      }

      // Watermark
      if (watermark) {
        const watermarkFilter = this.buildWatermarkFilter(watermark);
        filters.push(watermarkFilter);
      }

      // Apply filters
      if (filters.length > 0) {
        command.videoFilters(filters);
      }

      // Apply video codec settings
      if (preset.video) {
        command
          .videoCodec(preset.video.codec === 'h264' ? 'libx264' : preset.video.codec)
          .videoBitrate(preset.video.bitrate)
          .fps(preset.video.fps);

        if (preset.video.profile) {
          command.outputOptions(`-profile:v ${preset.video.profile}`);
        }
      }

      // Apply audio codec settings
      if (preset.audio) {
        command
          .audioCodec(preset.audio.codec === 'aac' ? 'aac' : preset.audio.codec)
          .audioBitrate(preset.audio.bitrate)
          .audioFrequency(preset.audio.sampleRate)
          .audioChannels(preset.audio.channels);
      } else {
        // Audio-only export
        command.noVideo();
      }

      // Audio processing
      if (preset.processing) {
        const audioFilters: string[] = [];
        
        if (preset.processing.audioNormalization) {
          audioFilters.push('loudnorm=I=-16:LRA=11:TP=-1.5');
        }
        
        if (preset.processing.noiseReduction) {
          audioFilters.push('anlmdn');
        }
        
        if (audioFilters.length > 0) {
          command.audioFilters(audioFilters);
        }
      }

      // Apply optimization settings
      if (preset.optimization) {
        if (preset.optimization.fastStart) {
          command.outputOptions('-movflags +faststart');
        }
        if (preset.optimization.webOptimized) {
          command.outputOptions('-pix_fmt yuv420p');
        }
        if (preset.optimization.twoPass) {
          // Two-pass encoding for better quality
          command.outputOptions('-pass 1', '-f null');
        }
      }

      // Format
      if (preset.video?.format) {
        command.format(preset.video.format);
      } else if (preset.audio && !preset.video) {
        // Audio-only format
        command.format(preset.audio.codec);
      }

      // Progress tracking
      command.on('start', (commandLine) => {
        console.log('FFmpeg command:', commandLine);
        onProgress?.({
          jobId: path.basename(outputPath),
          stage: 'processing',
          progress: 0,
          currentOperation: 'Starting export...'
        });
      });

      command.on('progress', (progress) => {
        const currentProgress = Math.min(progress.percent || 0, 100);
        
        if (currentProgress > lastProgress + 1) {
          lastProgress = currentProgress;
          
          onProgress?.({
            jobId: path.basename(outputPath),
            stage: 'processing',
            progress: currentProgress,
            currentOperation: preset.audio && !preset.video ? 'Encoding audio...' : 'Encoding video...',
            processedFrames: progress.frames,
            bitrate: progress.currentKbps ? `${progress.currentKbps}k` : undefined,
            fps: progress.currentFps,
            speed: (progress as any).speed
          });
        }
      });

      command.on('end', async () => {
        try {
          // Generate separate subtitle file if needed
          if (subtitles && (subtitles.format === 'srt' || subtitles.format === 'vtt') && subtitles.segments.length > 0) {
            const subtitlePath = outputPath.replace(path.extname(outputPath), `.${subtitles.format}`);
            await this.generateSubtitleFile(subtitles.segments, subtitles.format, subtitlePath);
          }

          const stats = await fs.stat(outputPath);
          const metadata = await this.getVideoMetadata(outputPath);
          
          onProgress?.({
            jobId: path.basename(outputPath),
            stage: 'complete',
            progress: 100,
            currentOperation: 'Export completed'
          });

          resolve({
            success: true,
            outputPath,
            fileSize: stats.size,
            duration: metadata?.format?.duration,
            processingTime: (Date.now() - startTime) / 1000
          });
        } catch (error) {
          resolve({
            success: true,
            outputPath,
            processingTime: (Date.now() - startTime) / 1000
          });
        }
      });

      command.on('error', (err) => {
        console.error('FFmpeg error:', err);
        reject(new Error(`FFmpeg export failed: ${err.message}`));
      });

      // Start the export
      command.save(outputPath);
    });
  }

  /**
   * Build filter complex for timeline-based editing
   */
  private buildTimelineFilterComplex(
    videoClips: TimelineClip[],
    audioClips: TimelineClip[],
    preset: ExportPreset,
    subtitles?: FFmpegExportOptions['subtitles'],
    watermark?: FFmpegExportOptions['watermark']
  ): string[] {
    const filters: string[] = [];
    let videoIndex = 0;
    let audioIndex = 0;

    // Process video clips
    const videoSegments: string[] = [];
    videoClips.forEach((clip, index) => {
      if (clip.sourceStart !== undefined && clip.sourceEnd !== undefined) {
        // Trim clip from source
        const duration = clip.sourceEnd - clip.sourceStart;
        filters.push(
          `[0:v]trim=start=${clip.sourceStart}:duration=${duration},setpts=PTS-STARTPTS[v${index}]`
        );
        videoSegments.push(`[v${index}]`);
        videoIndex = index + 1;
      }
    });

    // Process audio clips
    const audioSegments: string[] = [];
    audioClips.forEach((clip, index) => {
      if (clip.sourceStart !== undefined && clip.sourceEnd !== undefined) {
        const duration = clip.sourceEnd - clip.sourceStart;
        filters.push(
          `[0:a]atrim=start=${clip.sourceStart}:duration=${duration},asetpts=PTS-STARTPTS[a${index}]`
        );
        
        // Apply volume if specified
        if (clip.volume !== undefined && clip.volume !== 1) {
          filters.push(`[a${index}]volume=${clip.volume}[a${index}_vol]`);
          audioSegments.push(`[a${index}_vol]`);
        } else {
          audioSegments.push(`[a${index}]`);
        }
        audioIndex = index + 1;
      }
    });

    // Concatenate video segments
    if (videoSegments.length > 1) {
      filters.push(
        `${videoSegments.join('')}concat=n=${videoSegments.length}:v=1:a=0[video_concat]`
      );
    } else if (videoSegments.length === 1) {
      filters.push(`${videoSegments[0]}copy[video_concat]`);
    }

    // Concatenate audio segments
    if (audioSegments.length > 1) {
      filters.push(
        `${audioSegments.join('')}concat=n=${audioSegments.length}:v=0:a=1[audio_concat]`
      );
    } else if (audioSegments.length === 1) {
      filters.push(`${audioSegments[0]}copy[audio_concat]`);
    }

    // Scale video to target resolution
    if (preset.video) {
      filters.push(
        `[video_concat]scale=${preset.video.resolution.width}:${preset.video.resolution.height}[video_scaled]`
      );
    }

    // Add burned-in subtitles
    let finalVideoLabel = preset.video ? '[video_scaled]' : '[video_concat]';
    if (subtitles?.format === 'burned' && subtitles.segments.length > 0 && subtitles.style) {
      const subtitleFilter = this.buildBurnedSubtitleFilter(subtitles.segments, subtitles.style);
      filters.push(`${finalVideoLabel}${subtitleFilter}[video_subtitled]`);
      finalVideoLabel = '[video_subtitled]';
    }

    // Add watermark
    if (watermark) {
      const watermarkFilter = this.buildWatermarkFilter(watermark);
      filters.push(`${finalVideoLabel}${watermarkFilter}[video_watermarked]`);
      finalVideoLabel = '[video_watermarked]';
    }

    // Combine final video and audio
    if (audioSegments.length > 0) {
      filters.push(
        `${finalVideoLabel}[audio_concat]concat=n=1:v=1:a=1[final_output]`
      );
    } else {
      filters.push(`${finalVideoLabel}copy[final_output]`);
    }

    return filters;
  }

  /**
   * Build burned-in subtitle filter
   */
  private buildBurnedSubtitleFilter(
    segments: Array<{ startTime: number; endTime: number; text: string }>,
    style: SubtitleStyle
  ): string {
    const subtitleFilters = segments.map(segment => {
      const escapedText = segment.text.replace(/'/g, "\\'").replace(/:/g, "\\:");
      const position = this.getSubtitlePosition(style);
      
      return `drawtext=text='${escapedText}':fontfile=/System/Library/Fonts/Arial.ttf:fontsize=${style.fontSize}:fontcolor=${style.color}:borderw=${style.strokeWidth || 0}:bordercolor=${style.strokeColor || '#000000'}:${position}:enable='between(t,${segment.startTime},${segment.endTime})'`;
    });
    
    return subtitleFilters.join(',');
  }

  /**
   * Build watermark filter
   */
  private buildWatermarkFilter(watermark: { text: string; position: string; opacity: number }): string {
    const position = this.getWatermarkPosition(watermark.position);
    const alpha = watermark.opacity.toString();
    
    return `drawtext=text='${watermark.text}':fontfile=/System/Library/Fonts/Arial.ttf:fontsize=24:fontcolor=white:${position}:alpha=${alpha}`;
  }

  /**
   * Get subtitle position for FFmpeg drawtext filter
   */
  private getSubtitlePosition(style: SubtitleStyle): string {
    if (style.position) {
      return `x=${style.position.x}*w/100:y=${style.position.y}*h/100`;
    }

    switch (style.alignment) {
      case 'left':
        return 'x=10:y=h-th-20';
      case 'right':
        return 'x=w-tw-10:y=h-th-20';
      case 'center':
      default:
        return 'x=(w-tw)/2:y=h-th-40';
    }
  }

  /**
   * Get watermark position for FFmpeg drawtext filter
   */
  private getWatermarkPosition(position: string): string {
    switch (position) {
      case 'top-left':
        return 'x=10:y=10';
      case 'top-right':
        return 'x=w-tw-10:y=10';
      case 'bottom-left':
        return 'x=10:y=h-th-10';
      case 'bottom-right':
        return 'x=w-tw-10:y=h-th-10';
      case 'center':
        return 'x=(w-tw)/2:y=(h-th)/2';
      default:
        return 'x=w-tw-10:y=h-th-10';
    }
  }

  /**
   * Generate separate subtitle file
   */
  private async generateSubtitleFile(
    segments: Array<{ startTime: number; endTime: number; text: string }>,
    format: 'srt' | 'vtt',
    outputPath: string
  ): Promise<void> {
    let content = '';
    
    if (format === 'srt') {
      content = this.subtitleGenerator.generateSRT(segments.map(s => ({
        id: `seg_${s.startTime}`,
        startTime: s.startTime,
        endTime: s.endTime,
        text: s.text,
        confidence: 1,
        speaker: undefined
      })));
    } else if (format === 'vtt') {
      content = this.subtitleGenerator.generateVTT(segments.map(s => ({
        id: `seg_${s.startTime}`,
        startTime: s.startTime,
        endTime: s.endTime,
        text: s.text,
        confidence: 1,
        speaker: undefined
      })));
    }

    await fs.writeFile(outputPath, content, 'utf-8');
  }

  /**
   * Get video metadata using FFprobe
   */
  private async getVideoMetadata(filePath: string): Promise<any> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          reject(err);
        } else {
          resolve(metadata);
        }
      });
    });
  }

  /**
   * Validate export settings
   */
  async validateExportSettings(
    inputPath: string,
    preset: ExportPreset
  ): Promise<{
    valid: boolean;
    warnings: string[];
    errors: string[];
    estimations?: {
      duration: number;
      fileSize: number;
      processingTime: number;
    };
  }> {
    const warnings: string[] = [];
    const errors: string[] = [];

    try {
      // Check if input file exists
      await fs.access(inputPath);
      
      // Get input metadata
      const metadata = await this.getVideoMetadata(inputPath);
      const duration = metadata.format?.duration || 0;
      
      // Validate preset constraints
      if (preset.constraints) {
        if (preset.constraints.maxDuration && duration > preset.constraints.maxDuration) {
          errors.push(`Duration ${duration.toFixed(1)}s exceeds maximum ${preset.constraints.maxDuration}s for ${preset.platform}`);
        }
      }
      
      // Estimate file size
      let estimatedFileSize = 0;
      if (preset.video?.bitrate && preset.audio?.bitrate) {
        const videoBitrate = parseInt(preset.video.bitrate.replace('k', '')) * 1000;
        const audioBitrate = parseInt(preset.audio.bitrate.replace('k', '')) * 1000;
        estimatedFileSize = Math.round(((videoBitrate + audioBitrate) * duration / 8) * 1.1);
      }
      
      if (preset.constraints?.maxFileSize && estimatedFileSize > preset.constraints.maxFileSize) {
        warnings.push('Estimated file size may exceed platform limit');
      }
      
      // Estimate processing time
      let estimatedProcessingTime = duration;
      if (preset.optimization?.twoPass) estimatedProcessingTime *= 2;
      if (preset.processing?.autoCrop) estimatedProcessingTime *= 1.5;
      if (preset.processing?.faceTracking) estimatedProcessingTime *= 1.3;
      
      return {
        valid: errors.length === 0,
        warnings,
        errors,
        estimations: {
          duration,
          fileSize: estimatedFileSize,
          processingTime: estimatedProcessingTime
        }
      };
    } catch (error) {
      errors.push(`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return { valid: false, warnings, errors };
    }
  }

  /**
   * Create preview of export settings
   */
  async generatePreview(
    inputPath: string,
    preset: ExportPreset,
    options: {
      startTime?: number;
      duration?: number;
      outputPath: string;
    }
  ): Promise<FFmpegExportResult> {
    const startTime = Date.now();
    const { startTime: previewStart = 0, duration = 10, outputPath } = options;
    
    return new Promise((resolve, reject) => {
      const command = ffmpeg(inputPath)
        .seekInput(previewStart)
        .duration(duration)
        .size('640x480')
        .videoBitrate('1000k')
        .audioBitrate('128k')
        .format('mp4')
        .outputOptions([
          '-preset', 'ultrafast',
          '-movflags', '+faststart'
        ]);

      command.on('end', async () => {
        try {
          const stats = await fs.stat(outputPath);
          resolve({
            success: true,
            outputPath,
            fileSize: stats.size,
            duration,
            processingTime: (Date.now() - startTime) / 1000
          });
        } catch (error) {
          resolve({
            success: true,
            outputPath,
            processingTime: (Date.now() - startTime) / 1000
          });
        }
      });

      command.on('error', (err) => {
        reject(new Error(`Preview generation failed: ${err.message}`));
      });

      command.save(outputPath);
    });
  }
}

// Create default exporter instance
const defaultExporter = new FFmpegExporter();

export { defaultExporter };
export default FFmpegExporter;
