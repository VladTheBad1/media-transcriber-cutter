import { PrismaClient } from '@prisma/client';
import MediaProcessor, { MediaMetadata } from './ffmpeg';
import BrowserMediaProcessor from './browser';
import MediaProcessingQueue, { MediaProcessingJob } from './queue';
import MediaStorage from './storage';
import { detectFormat, validateFileSize, formatFileSize, formatDuration } from './formats';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

const prisma = new PrismaClient();

export interface ProcessingOptions {
  priority?: number;
  generateThumbnail?: boolean;
  generateWaveform?: boolean;
  optimizeForWeb?: boolean;
  extractAudio?: boolean;
  customOperations?: string[];
}

export interface UploadResult {
  mediaId: string;
  filename: string;
  originalName: string;
  type: 'video' | 'audio';
  size: number;
  duration?: number;
  format: string;
  status: string;
  processingJobs: string[];
  metadata: any;
  urls: {
    stream?: string;
    thumbnail?: string;
    waveform?: string;
  };
}

export class MediaService {
  private processor: MediaProcessor;
  private browserProcessor: BrowserMediaProcessor;
  private queue: MediaProcessingQueue;
  private storage: MediaStorage;
  
  constructor(options?: {
    ffmpegPath?: string;
    maxConcurrent?: number;
    uploadDir?: string;
    mediaDir?: string;
    tempDir?: string;
  }) {
    this.processor = new MediaProcessor({
      ffmpegPath: options?.ffmpegPath,
      tempDir: options?.tempDir,
      mediaDir: options?.mediaDir
    });
    
    this.browserProcessor = new BrowserMediaProcessor();
    
    this.queue = new MediaProcessingQueue({
      maxConcurrent: options?.maxConcurrent || 3,
      ffmpegPath: options?.ffmpegPath,
      tempDir: options?.tempDir,
      mediaDir: options?.mediaDir
    });
    
    this.storage = new MediaStorage({
      uploadDir: options?.uploadDir,
      mediaDir: options?.mediaDir,
      tempDir: options?.tempDir
    });
  }
  
  /**
   * Initialize the media service
   */
  async initialize(): Promise<void> {
    await this.storage.initialize();
    console.log('Media service initialized');
  }
  
  /**
   * Upload and process a media file
   */
  async uploadFile(
    file: File | Buffer,
    originalName: string,
    metadata?: any,
    options: ProcessingOptions = {}
  ): Promise<UploadResult> {
    // Validate file
    const format = detectFormat(originalName);
    if (!format) {
      throw new Error(`Unsupported file format: ${path.extname(originalName)}`);
    }
    
    const fileSize = file instanceof File ? file.size : file.length;
    const sizeValidation = validateFileSize(originalName, fileSize);
    if (!sizeValidation.valid) {
      throw new Error(sizeValidation.error);
    }
    
    // Generate media ID and file path
    const mediaId = uuidv4();
    const filePath = this.storage.generateFilePath(originalName, mediaId, 'uploads');
    
    // Save file to disk
    const fileData = file instanceof File ? Buffer.from(await file.arrayBuffer()) : file;
    await this.storage.saveFile(filePath, fileData);
    
    console.log(`File uploaded: ${originalName} -> ${filePath} (${formatFileSize(fileSize)})`);
    
    // Extract media metadata
    let mediaMetadata: MediaMetadata;
    try {
      mediaMetadata = await this.processor.getMediaMetadata(filePath);
    } catch (error) {
      console.warn('Failed to extract metadata with FFmpeg:', error);
      // Use basic metadata if FFmpeg fails
      mediaMetadata = {
        duration: 0,
        format: format.extension,
        size: fileSize
      };
    }
    
    // Create database record
    const mediaFile = await prisma.mediaFile.create({
      data: {
        id: mediaId,
        filename: path.basename(filePath),
        originalName,
        title: metadata?.title || originalName.replace(/\.[^/.]+$/, ''),
        description: metadata?.description,
        type: format.category === 'video' ? 'VIDEO' : 'AUDIO',
        format: mediaMetadata.format || format.extension,
        codec: mediaMetadata.codec,
        size: BigInt(fileSize),
        duration: mediaMetadata.duration,
        bitrate: mediaMetadata.bitrate,
        resolution: mediaMetadata.resolution 
          ? `${mediaMetadata.resolution.width}x${mediaMetadata.resolution.height}`
          : null,
        framerate: mediaMetadata.framerate,
        audioChannels: mediaMetadata.audioChannels,
        filePath,
        metadata: JSON.stringify({
          ...mediaMetadata,
          uploadTimestamp: Date.now(),
          originalMetadata: metadata,
          format: format
        }),
        tags: JSON.stringify(metadata?.tags || []),
        category: metadata?.category,
        status: 'PROCESSING'
      }
    });
    
    // Queue processing jobs
    const processingJobs = await this.queueProcessingJobs(
      mediaFile,
      filePath,
      format.category === 'video',
      options
    );
    
    // Generate URLs
    const urls = {
      stream: `/api/media/stream/${path.basename(filePath)}`,
      thumbnail: format.category === 'video' ? `/api/media/thumbnail/${mediaId}_thumb_10s.jpg` : undefined,
      waveform: `/api/media/waveform/${mediaId}_waveform.png`
    };
    
    return {
      mediaId: mediaFile.id,
      filename: mediaFile.filename,
      originalName: mediaFile.originalName,
      type: mediaFile.type.toLowerCase() as 'video' | 'audio',
      size: Number(mediaFile.size),
      duration: mediaFile.duration,
      format: mediaFile.format,
      status: 'processing',
      processingJobs: processingJobs.map(job => job.id),
      metadata: {
        resolution: mediaFile.resolution,
        framerate: mediaFile.framerate,
        audioChannels: mediaFile.audioChannels,
        bitrate: mediaFile.bitrate,
        codec: mediaFile.codec,
        formatInfo: format
      },
      urls
    };
  }
  
  /**
   * Process file in browser using FFmpeg.wasm
   */
  async processInBrowser(
    file: File,
    operation: 'extract-audio' | 'extract-transcription-audio' | 'generate-thumbnail' | 'compress-video',
    options?: any
  ): Promise<Blob> {
    await this.browserProcessor.initialize();
    
    switch (operation) {
      case 'extract-audio':
        return await this.browserProcessor.extractAudio(file, options);
      
      case 'extract-transcription-audio':
        return await this.browserProcessor.extractAudioForTranscription(file);
      
      case 'generate-thumbnail':
        const { timestamp = 10, size = { width: 320, height: 240 } } = options || {};
        return await this.browserProcessor.generateThumbnail(file, timestamp, size);
      
      case 'compress-video':
        return await this.browserProcessor.compressVideo(file, options);
      
      default:
        throw new Error(`Unknown browser operation: ${operation}`);
    }
  }
  
  /**
   * Get media file details
   */
  async getMediaFile(mediaId: string): Promise<any> {
    const mediaFile = await prisma.mediaFile.findUnique({
      where: { id: mediaId },
      include: {
        transcripts: {
          include: {
            segments: {
              take: 10, // Limit for performance
              orderBy: { start: 'asc' }
            },
            speakers: true,
            summaries: true
          }
        },
        timelines: {
          include: {
            tracks: {
              include: {
                clips: {
                  take: 5 // Limit for performance
                }
              }
            }
          }
        },
        highlights: {
          orderBy: { confidence: 'desc' },
          take: 10
        },
        exports: {
          orderBy: { startedAt: 'desc' },
          take: 5
        }
      }
    });
    
    if (!mediaFile) {
      throw new Error('Media file not found');
    }
    
    // Parse metadata and tags
    let metadata = {};
    let tags: string[] = [];
    
    try {
      if (mediaFile.metadata) {
        metadata = JSON.parse(mediaFile.metadata);
      }
    } catch (error) {
      console.warn('Invalid metadata JSON:', mediaFile.metadata);
    }
    
    try {
      if (mediaFile.tags) {
        tags = JSON.parse(mediaFile.tags);
      }
    } catch (error) {
      console.warn('Invalid tags JSON:', mediaFile.tags);
    }
    
    // Generate URLs
    const urls = {
      stream: `/api/media/stream/${mediaFile.filename}`,
      thumbnail: mediaFile.thumbnailPath 
        ? `/api/media/thumbnail/${path.basename(mediaFile.thumbnailPath)}`
        : null,
      waveform: mediaFile.waveformPath
        ? `/api/media/waveform/${path.basename(mediaFile.waveformPath)}`
        : null
    };
    
    return {
      ...mediaFile,
      size: Number(mediaFile.size),
      metadata,
      tags,
      urls,
      processingStats: {
        transcriptCount: mediaFile.transcripts.length,
        timelineCount: mediaFile.timelines.length,
        highlightCount: mediaFile.highlights.length,
        exportCount: mediaFile.exports.length
      }
    };
  }
  
  /**
   * Delete media file and associated data
   */
  async deleteMediaFile(mediaId: string): Promise<void> {
    const mediaFile = await prisma.mediaFile.findUnique({
      where: { id: mediaId },
      include: {
        exports: true
      }
    });
    
    if (!mediaFile) {
      throw new Error('Media file not found');
    }
    
    // Check for active processing
    const activeExports = mediaFile.exports.filter(
      exp => exp.status === 'PROCESSING' || exp.status === 'QUEUED'
    );
    
    if (activeExports.length > 0) {
      throw new Error('Cannot delete media file with active processing jobs');
    }
    
    // Collect files to delete
    const filesToDelete = [mediaFile.filePath];
    
    if (mediaFile.thumbnailPath) {
      filesToDelete.push(mediaFile.thumbnailPath);
    }
    
    if (mediaFile.waveformPath) {
      filesToDelete.push(mediaFile.waveformPath);
    }
    
    mediaFile.exports.forEach(exp => {
      if (exp.outputPath) {
        filesToDelete.push(exp.outputPath);
      }
    });
    
    // Delete database record (cascading deletes will handle related data)
    await prisma.mediaFile.delete({
      where: { id: mediaId }
    });
    
    // Delete physical files
    await Promise.allSettled(
      filesToDelete.map(async (filePath) => {
        try {
          await this.storage.deleteFile(filePath);
        } catch (error) {
          console.warn(`Failed to delete file ${filePath}:`, error);
        }
      })
    );
    
    console.log(`Deleted media file ${mediaId} and ${filesToDelete.length} associated files`);
  }
  
  /**
   * Get processing queue statistics
   */
  getQueueStats(): any {
    return this.queue.getQueueStats();
  }
  
  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<any> {
    return await this.storage.getStorageStats();
  }
  
  /**
   * Clean up old temporary files
   */
  async cleanup(maxAgeHours: number = 24): Promise<{ cleaned: number; errors: number }> {
    const config = this.storage.getConfig();
    return await this.storage.cleanupOldFiles(config.tempDir, maxAgeHours);
  }
  
  /**
   * Queue processing jobs for uploaded media
   */
  private async queueProcessingJobs(
    mediaFile: any,
    filePath: string,
    isVideo: boolean,
    options: ProcessingOptions
  ): Promise<MediaProcessingJob[]> {
    const jobs: MediaProcessingJob[] = [];
    
    const {
      priority = 5,
      generateThumbnail = isVideo,
      generateWaveform = true,
      optimizeForWeb = isVideo,
      extractAudio = true,
      customOperations = []
    } = options;
    
    // Always extract audio for transcription
    if (extractAudio) {
      const audioJob: MediaProcessingJob = {
        id: `audio_${mediaFile.id}_${Date.now()}`,
        type: 'transcription-prep',
        mediaFileId: mediaFile.id,
        inputPath: filePath,
        outputDir: path.join(this.storage.getConfig().mediaDir, 'audio'),
        priority: priority + 5 // Higher priority for transcription
      };
      jobs.push(audioJob);
      await this.queue.addJob(audioJob);
    }
    
    // Generate thumbnail for videos
    if (generateThumbnail && isVideo) {
      const thumbnailJob: MediaProcessingJob = {
        id: `thumb_${mediaFile.id}_${Date.now()}`,
        type: 'thumbnail-generation',
        mediaFileId: mediaFile.id,
        inputPath: filePath,
        outputDir: path.join(this.storage.getConfig().mediaDir, 'thumbnails'),
        priority: priority,
        options: {
          timestamp: 10,
          generateSprite: true
        }
      };
      jobs.push(thumbnailJob);
      await this.queue.addJob(thumbnailJob);
    }
    
    // Generate waveform
    if (generateWaveform) {
      const waveformJob: MediaProcessingJob = {
        id: `waveform_${mediaFile.id}_${Date.now()}`,
        type: 'waveform-generation',
        mediaFileId: mediaFile.id,
        inputPath: filePath,
        outputDir: path.join(this.storage.getConfig().mediaDir, 'waveforms'),
        priority: priority - 1,
        options: {
          width: 1000,
          height: 100,
          samples: 1000
        }
      };
      jobs.push(waveformJob);
      await this.queue.addJob(waveformJob);
    }
    
    // Optimize for web delivery
    if (optimizeForWeb && isVideo) {
      const optimizeJob: MediaProcessingJob = {
        id: `optimize_${mediaFile.id}_${Date.now()}`,
        type: 'video-optimization',
        mediaFileId: mediaFile.id,
        inputPath: filePath,
        outputDir: path.join(this.storage.getConfig().mediaDir, 'optimized'),
        priority: priority - 2,
        options: {
          quality: 'medium',
          maxWidth: 1920,
          maxHeight: 1080
        }
      };
      jobs.push(optimizeJob);
      await this.queue.addJob(optimizeJob);
    }
    
    // Add custom operations
    for (const operation of customOperations) {
      const customJob: MediaProcessingJob = {
        id: `${operation}_${mediaFile.id}_${Date.now()}`,
        type: operation as any,
        mediaFileId: mediaFile.id,
        inputPath: filePath,
        outputDir: this.storage.getConfig().tempDir,
        priority: priority - 3
      };
      jobs.push(customJob);
      await this.queue.addJob(customJob);
    }
    
    return jobs;
  }
}

export default MediaService;
