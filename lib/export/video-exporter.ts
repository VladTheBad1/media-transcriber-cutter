import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs/promises';
import { 
  ExportJob, 
  ExportPreset, 
  ExportProgress, 
  FFmpegCommand,
  ExportEventCallback 
} from './types';
import { SubtitleGenerator, SubtitleSegment } from './subtitle-generator';
import { AutoCropProcessor } from './auto-crop';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface ExportResult {
  success: boolean;
  outputPath?: string;
  fileSize?: number;
  duration?: number;
  actualBitrate?: number;
  processingTime?: number;
  error?: string;
}

export interface BatchExportResult {
  results: ExportResult[];
  errors: string[];
  totalExports: number;
  successfulExports: number;
  totalProcessingTime: number;
}

export class VideoExporter {
  private subtitleGenerator: SubtitleGenerator;
  private autoCropProcessor: AutoCropProcessor;
  private tempDir: string;
  private outputDir: string;

  constructor(options: {
    tempDir?: string;
    outputDir?: string;
  } = {}) {
    this.subtitleGenerator = new SubtitleGenerator();
    this.autoCropProcessor = new AutoCropProcessor();
    this.tempDir = options.tempDir || './temp/export';
    this.outputDir = options.outputDir || './exports';
  }

  /**
   * Export video with advanced features
   */
  async exportVideo(
    job: ExportJob,
    onProgress?: ExportEventCallback
  ): Promise<ExportResult> {
    const startTime = Date.now();
    
    try {
      // Emit started event
      onProgress?.({
        type: 'started',
        jobId: job.id,
        timestamp: new Date(),
        data: { preset: job.preset?.name }
      });

      // Get source media information
      const mediaFile = job.mediaFileId ? 
        await prisma.mediaFile.findUnique({
          where: { id: job.mediaFileId },
          include: {
            transcripts: {
              include: { segments: true }
            }
          }
        }) : null;

      const timeline = job.timelineId ?
        await prisma.timeline.findUnique({
          where: { id: job.timelineId },
          include: {
            tracks: {
              include: { clips: true }
            },
            mediaFile: true
          }
        }) : null;

      if (!mediaFile && !timeline) {
        throw new Error('No source media or timeline found');
      }

      const sourcePath = mediaFile?.filePath || timeline?.mediaFile?.filePath;
      if (!sourcePath) {
        throw new Error('Source file path not found');
      }

      // Prepare output path
      const outputPath = path.join(
        this.outputDir,
        job.output.directory,
        job.output.filename
      );

      await fs.mkdir(path.dirname(outputPath), { recursive: true });

      // Get video metadata
      const metadata = await this.getVideoMetadata(sourcePath);
      
      // Prepare subtitle data if needed
      let subtitleSegments: SubtitleSegment[] = [];
      if (job.options.includeSubtitles && mediaFile?.transcripts?.[0]) {
        const transcript = mediaFile.transcripts[0];
        subtitleSegments = transcript.segments.map(segment => ({
          id: segment.id,
          startTime: segment.start,
          endTime: segment.end,
          text: segment.text,
          confidence: segment.confidence,
          speaker: (segment as any).speaker?.name || segment.speakerId
        }));
      }

      // Build FFmpeg command
      const ffmpegCommand = await this.buildFFmpegCommand(
        sourcePath,
        outputPath,
        job,
        metadata,
        subtitleSegments
      );

      // Execute export
      const result = await this.executeFFmpegCommand(
        ffmpegCommand,
        job.id,
        onProgress
      );

      const processingTime = Date.now() - startTime;

      // Get output file stats
      const outputStats = await fs.stat(outputPath).catch(() => null);
      const outputMetadata = await this.getVideoMetadata(outputPath).catch(() => null);

      const exportResult: ExportResult = {
        success: true,
        outputPath,
        fileSize: outputStats?.size,
        duration: outputMetadata?.format?.duration,
        processingTime: processingTime / 1000,
        actualBitrate: outputMetadata?.format?.bit_rate
      };

      // Emit completed event
      onProgress?.({
        type: 'completed',
        jobId: job.id,
        timestamp: new Date(),
        data: exportResult
      });

      return exportResult;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      const exportResult: ExportResult = {
        success: false,
        error: errorMessage,
        processingTime: processingTime / 1000
      };

      // Emit failed event
      onProgress?.({
        type: 'failed',
        jobId: job.id,
        timestamp: new Date(),
        data: { error: errorMessage }
      });

      return exportResult;
    }
  }

  /**
   * Batch export multiple jobs
   */
  async batchExport(
    jobs: ExportJob[],
    onProgress?: ExportEventCallback,
    options: {
      maxConcurrent?: number;
      continueOnError?: boolean;
    } = {}
  ): Promise<BatchExportResult> {
    const { maxConcurrent = 3, continueOnError = true } = options;
    const results: ExportResult[] = [];
    const errors: string[] = [];
    const startTime = Date.now();

    // Process jobs in batches to avoid overwhelming the system
    for (let i = 0; i < jobs.length; i += maxConcurrent) {
      const batch = jobs.slice(i, i + maxConcurrent);
      
      const batchPromises = batch.map(async (job) => {
        try {
          return await this.exportVideo(job, onProgress);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          errors.push(`Job ${job.id}: ${errorMessage}`);
          
          if (!continueOnError) {
            throw error;
          }
          
          return {
            success: false,
            error: errorMessage
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Update overall progress
      const overallProgress = ((i + batch.length) / jobs.length) * 100;
      onProgress?.({
        type: 'progress',
        jobId: 'batch',
        timestamp: new Date(),
        data: { progress: overallProgress }
      });
    }

    const totalProcessingTime = (Date.now() - startTime) / 1000;
    const successfulExports = results.filter(r => r.success).length;

    return {
      results,
      errors,
      totalExports: jobs.length,
      successfulExports,
      totalProcessingTime
    };
  }

  /**
   * Generate preview of export settings
   */
  async generatePreview(
    job: ExportJob,
    previewDuration: number = 10,
    startTime: number = 0
  ): Promise<string> {
    const sourcePath = await this.getSourcePath(job);
    const previewPath = path.join(
      this.tempDir,
      `preview_${job.id}_${Date.now()}.mp4`
    );

    await fs.mkdir(path.dirname(previewPath), { recursive: true });

    const metadata = await this.getVideoMetadata(sourcePath);
    
    // Build a simplified command for preview
    const previewJob: ExportJob = {
      ...job,
      timeline: job.timeline ? {
        ...job.timeline,
        startTime: startTime,
        endTime: Math.min(startTime + previewDuration, job.timeline.endTime)
      } : undefined
    };

    const ffmpegCommand = await this.buildFFmpegCommand(
      sourcePath,
      previewPath,
      previewJob,
      metadata,
      [],
      { isPreview: true }
    );

    await this.executeFFmpegCommand(ffmpegCommand, `preview_${job.id}`);
    
    return previewPath;
  }

  /**
   * Validate export job before processing
   */
  async validateExportJob(job: ExportJob): Promise<{
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
      // Check source file exists
      const sourcePath = await this.getSourcePath(job);
      const metadata = await this.getVideoMetadata(sourcePath);

      if (!metadata) {
        errors.push('Unable to read source media metadata');
        return { valid: false, warnings, errors };
      }

      // Validate preset constraints if present
      if (job.preset) {
        const duration = job.timeline ? 
          job.timeline.endTime - job.timeline.startTime : 
          metadata.format?.duration || 0;

        if (job.preset.constraints) {
          const { maxDuration, maxFileSize } = job.preset.constraints;
          
          if (maxDuration && duration > maxDuration) {
            errors.push(`Duration ${duration.toFixed(1)}s exceeds maximum ${maxDuration}s for ${job.preset.platform}`);
          }

          // Estimate file size
          const estimatedFileSize = this.estimateFileSize(duration, job.preset);
          if (maxFileSize && estimatedFileSize > maxFileSize) {
            warnings.push(`Estimated file size may exceed platform limit`);
          }

          // Estimate processing time
          const estimatedProcessingTime = this.estimateProcessingTime(duration, job.preset);

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
        }
      }

      return { valid: true, warnings, errors };

    } catch (error) {
      errors.push(`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return { valid: false, warnings, errors };
    }
  }

  // Private helper methods
  private async buildFFmpegCommand(
    inputPath: string,
    outputPath: string,
    job: ExportJob,
    metadata: any,
    subtitleSegments: SubtitleSegment[],
    options: { isPreview?: boolean } = {}
  ): Promise<FFmpegCommand> {
    const preset = job.preset;
    if (!preset) {
      throw new Error('Export preset is required');
    }

    const inputs = [{ path: inputPath, options: [] }];
    const filters: string[] = [];
    const outputOptions: string[] = [];

    // Timeline trimming
    if (job.timeline) {
      inputs[0].options!.push(`-ss ${job.timeline.startTime}`);
      if (job.timeline.endTime > job.timeline.startTime) {
        const duration = job.timeline.endTime - job.timeline.startTime;
        inputs[0].options!.push(`-t ${duration}`);
      }
    }

    // Video codec and settings
    if (preset.video && !options.isPreview) {
      outputOptions.push(`-c:v ${preset.video.codec === 'h264' ? 'libx264' : preset.video.codec}`);
      outputOptions.push(`-b:v ${preset.video.bitrate}`);
      outputOptions.push(`-r ${preset.video.fps}`);
      
      if (preset.video.profile) {
        outputOptions.push(`-profile:v ${preset.video.profile}`);
      }
      
      if (preset.video.level) {
        outputOptions.push(`-level:v ${preset.video.level}`);
      }
    } else if (options.isPreview) {
      // Preview settings - faster, lower quality
      outputOptions.push('-c:v libx264');
      outputOptions.push('-preset ultrafast');
      outputOptions.push('-crf 28');
    }

    // Audio codec and settings
    if (preset.audio) {
      outputOptions.push(`-c:a ${preset.audio.codec === 'aac' ? 'aac' : preset.audio.codec}`);
      outputOptions.push(`-b:a ${preset.audio.bitrate}`);
      outputOptions.push(`-ar ${preset.audio.sampleRate}`);
      outputOptions.push(`-ac ${preset.audio.channels}`);
    }

    // Auto-crop processing
    if (preset.processing?.autoCrop && preset.video) {
      this.autoCropProcessor.initialize(
        metadata.streams[0].width,
        metadata.streams[0].height,
        preset.video.aspectRatio
      );

      try {
        const analysisResult = await this.autoCropProcessor.analyzeVideo(inputPath, {
          targetAspectRatio: preset.video.aspectRatio,
          enableFaceTracking: preset.processing.faceTracking,
          enableObjectTracking: false,
          smoothingFactor: 0.7,
          minConfidence: 0.5,
          paddingPercent: 10,
          maxCropMovement: 20,
          sampleInterval: 1.0
        });

        const keyframes = this.autoCropProcessor.generateCropKeyframes(analysisResult, {
          targetAspectRatio: preset.video.aspectRatio,
          enableFaceTracking: preset.processing.faceTracking,
          enableObjectTracking: false,
          smoothingFactor: 0.7,
          minConfidence: 0.5,
          paddingPercent: 10,
          maxCropMovement: 20,
          sampleInterval: 1.0
        });

        const cropFilters = this.autoCropProcessor.generateCropFilters(
          keyframes, 
          metadata.format?.duration || 30
        );
        
        filters.push(...cropFilters);
      } catch (error) {
        console.warn('Auto-crop failed, falling back to center crop:', error);
        // Fall back to center crop
        const { width: targetWidth, height: targetHeight } = preset.video.resolution;
        const sourceWidth = metadata.streams[0].width;
        const sourceHeight = metadata.streams[0].height;
        const x = Math.floor((sourceWidth - targetWidth) / 2);
        const y = Math.floor((sourceHeight - targetHeight) / 2);
        filters.push(`crop=${targetWidth}:${targetHeight}:${x}:${y}`);
      }
    }

    // Scaling (if no auto-crop or different resolution needed)
    if (preset.video && !preset.processing?.autoCrop) {
      const { width, height } = preset.video.resolution;
      filters.push(`scale=${width}:${height}`);
    }

    // Audio processing
    if (preset.processing?.audioNormalization) {
      filters.push('loudnorm=I=-16:LRA=11:TP=-1.5');
    }

    if (preset.processing?.noiseReduction) {
      filters.push('anlmdn');
    }

    // Color correction
    if (preset.processing?.colorCorrection) {
      filters.push('eq=contrast=1.1:brightness=0.05:saturation=1.1');
    }

    // Burned-in subtitles
    if (job.options.includeSubtitles && 
        preset.subtitles?.format === 'burned' && 
        subtitleSegments.length > 0 && 
        preset.subtitles.style) {
      
      const subtitleFilters = this.subtitleGenerator.generateBurnedSubtitleFilters(
        subtitleSegments,
        preset.subtitles.style,
        preset.video?.resolution.width || metadata.streams[0].width,
        preset.video?.resolution.height || metadata.streams[0].height
      );

      // Convert subtitle filters to FFmpeg filter strings
      subtitleFilters.forEach(filter => {
        const options = Object.entries(filter.options || {})
          .map(([key, value]) => `${key}=${value}`)
          .join(':');
        filters.push(`${filter.name}=${options}`);
      });
    }

    // Watermark
    if (job.options.watermark?.enabled && job.options.watermark.text) {
      const watermarkFilter = `drawtext=text='${job.options.watermark.text}':fontcolor=white:fontsize=24:x=w-tw-10:y=10:alpha=${job.options.watermark.opacity}`;
      filters.push(watermarkFilter);
    }

    // Optimization settings
    if (preset.optimization) {
      if (preset.optimization.twoPass && !options.isPreview) {
        outputOptions.push('-pass 1', '-f null');
      }
      
      if (preset.optimization.fastStart) {
        outputOptions.push('-movflags +faststart');
      }
      
      if (preset.optimization.webOptimized) {
        outputOptions.push('-pix_fmt yuv420p');
      }
    }

    // Format
    if (preset.video?.format) {
      outputOptions.push(`-f ${preset.video.format}`);
    }

    return {
      inputs,
      filters: filters.length > 0 ? [{ name: 'complex', options: { filter_complex: filters.join(',') } }] : [],
      output: {
        path: outputPath,
        options: outputOptions,
        format: preset.video?.format
      },
      globalOptions: ['-y'] // Overwrite output files
    };
  }

  private async executeFFmpegCommand(
    command: FFmpegCommand,
    jobId: string,
    onProgress?: ExportEventCallback
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let ffmpegProcess = ffmpeg();

      // Add inputs
      command.inputs.forEach(input => {
        ffmpegProcess = ffmpegProcess.input(input.path);
        if (input.options) {
          input.options.forEach(option => {
            ffmpegProcess = ffmpegProcess.inputOptions(option);
          });
        }
      });

      // Add filters
      if (command.filters && command.filters.length > 0) {
        command.filters.forEach(filter => {
          if (filter.name === 'complex' && filter.options?.filter_complex) {
            ffmpegProcess = ffmpegProcess.complexFilter(String(filter.options.filter_complex));
          }
        });
      }

      // Add output options
      ffmpegProcess = ffmpegProcess.outputOptions(command.output.options);

      // Add global options
      if (command.globalOptions) {
        ffmpegProcess = ffmpegProcess.outputOptions(command.globalOptions);
      }

      // Progress tracking
      ffmpegProcess.on('progress', (progress) => {
        onProgress?.({
          type: 'progress',
          jobId,
          timestamp: new Date(),
          data: {
            progress: progress.percent || 0,
            currentOperation: 'encoding',
            processedFrames: progress.frames,
            fps: progress.currentFps,
            bitrate: progress.currentKbps ? `${progress.currentKbps}k` : undefined,
            speed: (progress as any).speed ? `${(progress as any).speed}x` : undefined
          }
        });
      });

      ffmpegProcess.on('start', (commandLine) => {
        console.log('FFmpeg started:', commandLine);
      });

      ffmpegProcess.on('end', () => {
        console.log('FFmpeg processing completed');
        resolve();
      });

      ffmpegProcess.on('error', (err) => {
        console.error('FFmpeg error:', err);
        reject(err);
      });

      // Start the process
      ffmpegProcess.save(command.output.path);
    });
  }

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

  private async getSourcePath(job: ExportJob): Promise<string> {
    if (job.mediaFileId) {
      const mediaFile = await prisma.mediaFile.findUnique({
        where: { id: job.mediaFileId }
      });
      if (!mediaFile?.filePath) {
        throw new Error('Media file not found or has no file path');
      }
      return mediaFile.filePath;
    }

    if (job.timelineId) {
      const timeline = await prisma.timeline.findUnique({
        where: { id: job.timelineId },
        include: { mediaFile: true }
      });
      if (!timeline?.mediaFile?.filePath) {
        throw new Error('Timeline media file not found or has no file path');
      }
      return timeline.mediaFile.filePath;
    }

    throw new Error('No source media specified in export job');
  }

  private estimateFileSize(duration: number, preset: ExportPreset): number {
    let totalBitrate = 0;
    
    if (preset.video?.bitrate) {
      totalBitrate += parseInt(preset.video.bitrate.replace('k', '')) * 1000;
    }
    
    if (preset.audio?.bitrate) {
      totalBitrate += parseInt(preset.audio.bitrate.replace('k', '')) * 1000;
    }
    
    // Convert to bytes and add 10% overhead
    return Math.round((totalBitrate * duration / 8) * 1.1);
  }

  private estimateProcessingTime(duration: number, preset: ExportPreset): number {
    let multiplier = 1.0;
    
    if (preset.optimization?.twoPass) multiplier *= 2.0;
    if (preset.processing?.autoCrop) multiplier *= 1.5;
    if (preset.processing?.faceTracking) multiplier *= 1.3;
    if (preset.processing?.noiseReduction) multiplier *= 1.2;
    
    if (preset.video?.codec === 'h265') multiplier *= 3.0;
    
    return duration * multiplier;
  }
}