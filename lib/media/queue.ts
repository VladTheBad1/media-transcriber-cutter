import { PrismaClient } from '@prisma/client';
import MediaProcessor, { ProcessingResult } from './ffmpeg';
import path from 'path';

const prisma = new PrismaClient();

export interface MediaProcessingJob {
  id: string;
  type: 'audio-extraction' | 'thumbnail-generation' | 'video-optimization' | 'transcription-prep' | 'waveform-generation';
  mediaFileId: string;
  inputPath: string;
  outputDir?: string;
  priority: number;
  options?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface JobResult {
  success: boolean;
  outputPath?: string;
  metadata?: any;
  error?: string;
  processingTime: number;
}

export class MediaProcessingQueue {
  private jobs: Map<string, MediaProcessingJob> = new Map();
  private processing: Set<string> = new Set();
  private processor: MediaProcessor;
  private maxConcurrent: number;
  private isRunning = false;
  
  constructor(options?: {
    maxConcurrent?: number;
    ffmpegPath?: string;
    tempDir?: string;
    mediaDir?: string;
  }) {
    this.maxConcurrent = options?.maxConcurrent || 3;
    this.processor = new MediaProcessor({
      ffmpegPath: options?.ffmpegPath,
      tempDir: options?.tempDir,
      mediaDir: options?.mediaDir
    });
  }
  
  /**
   * Add a processing job to the queue
   */
  async addJob(job: MediaProcessingJob): Promise<string> {
    // Store job in database
    const dbJob = await prisma.job.create({
      data: {
        id: job.id,
        type: job.type,
        priority: job.priority,
        data: JSON.stringify({
          mediaFileId: job.mediaFileId,
          inputPath: job.inputPath,
          outputDir: job.outputDir,
          options: job.options,
          metadata: job.metadata
        }),
        status: 'PENDING'
      }
    });
    
    // Add to memory queue
    this.jobs.set(job.id, job);
    
    // Update media file status
    await prisma.mediaFile.update({
      where: { id: job.mediaFileId },
      data: { status: 'PROCESSING' }
    });
    
    // Start processing if not already running
    if (!this.isRunning) {
      this.startProcessing();
    }
    
    return job.id;
  }
  
  /**
   * Start the queue processing loop
   */
  private async startProcessing(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    
    console.log('Starting media processing queue...');
    
    while (this.isRunning) {
      // Check if we can start more jobs
      if (this.processing.size < this.maxConcurrent && this.jobs.size > 0) {
        const nextJob = this.getNextJob();
        if (nextJob) {
          this.processJob(nextJob);
        }
      }
      
      // Wait before next iteration
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Stop if no jobs remaining
      if (this.jobs.size === 0 && this.processing.size === 0) {
        this.isRunning = false;
      }
    }
    
    console.log('Media processing queue stopped.');
  }
  
  /**
   * Get the next job to process (priority-based)
   */
  private getNextJob(): MediaProcessingJob | null {
    const availableJobs = Array.from(this.jobs.values())
      .filter(job => !this.processing.has(job.id))
      .sort((a, b) => b.priority - a.priority); // Higher priority first
    
    return availableJobs[0] || null;
  }
  
  /**
   * Process a single job
   */
  private async processJob(job: MediaProcessingJob): Promise<void> {
    const startTime = Date.now();
    this.processing.add(job.id);
    
    try {
      // Update job status
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: 'PROCESSING',
          startedAt: new Date()
        }
      });
      
      console.log(`Processing job ${job.id} (${job.type})...`);
      
      // Process based on job type
      const result = await this.executeJob(job);
      const processingTime = Date.now() - startTime;
      
      // Update job as completed
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          result: JSON.stringify(result)
        }
      });
      
      // Update media file with results
      await this.updateMediaFile(job, result);
      
      console.log(`Job ${job.id} completed in ${processingTime}ms`);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      console.error(`Job ${job.id} failed:`, errorMessage);
      
      // Update job as failed
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          error: errorMessage,
          attempts: { increment: 1 }
        }
      });
      
      // Update media file status
      await prisma.mediaFile.update({
        where: { id: job.mediaFileId },
        data: { status: 'ERROR' }
      });
      
    } finally {
      // Remove from processing and jobs
      this.processing.delete(job.id);
      this.jobs.delete(job.id);
    }
  }
  
  /**
   * Execute a job based on its type
   */
  private async executeJob(job: MediaProcessingJob): Promise<JobResult> {
    const startTime = Date.now();
    
    switch (job.type) {
      case 'audio-extraction':
        return await this.processAudioExtraction(job);
      
      case 'transcription-prep':
        return await this.processTranscriptionPrep(job);
      
      case 'thumbnail-generation':
        return await this.processThumbnailGeneration(job);
      
      case 'video-optimization':
        return await this.processVideoOptimization(job);
      
      case 'waveform-generation':
        return await this.processWaveformGeneration(job);
      
      default:
        throw new Error(`Unknown job type: ${job.type}`);
    }
  }
  
  /**
   * Process audio extraction job
   */
  private async processAudioExtraction(job: MediaProcessingJob): Promise<JobResult> {
    const startTime = Date.now();
    const { inputPath, outputDir, options } = job;
    
    const result = await this.processor.extractAudio(
      inputPath,
      path.join(outputDir || './temp', `${job.mediaFileId}_audio.mp3`),
      options
    );
    
    return {
      success: result.success,
      outputPath: result.outputPath,
      metadata: result.metadata,
      processingTime: Date.now() - startTime
    };
  }
  
  /**
   * Process transcription preparation job
   */
  private async processTranscriptionPrep(job: MediaProcessingJob): Promise<JobResult> {
    const startTime = Date.now();
    const { inputPath, outputDir } = job;
    
    const result = await this.processor.optimizeForTranscription(inputPath, outputDir);
    
    return {
      success: result.success,
      outputPath: result.outputPath,
      metadata: result.metadata,
      processingTime: Date.now() - startTime
    };
  }
  
  /**
   * Process thumbnail generation job
   */
  private async processThumbnailGeneration(job: MediaProcessingJob): Promise<JobResult> {
    const startTime = Date.now();
    const { inputPath, outputDir, options } = job;
    const { timestamp = 10, generateSprite = false } = options || {};
    
    if (generateSprite) {
      const result = await this.processor.generateThumbnailSprite(
        inputPath,
        20,
        outputDir
      );
      
      return {
        success: true,
        outputPath: result.spritePath,
        metadata: { thumbnails: result.thumbnails },
        processingTime: Date.now() - startTime
      };
    } else {
      const outputPath = await this.processor.generateThumbnail(
        inputPath,
        timestamp,
        outputDir
      );
      
      return {
        success: true,
        outputPath,
        processingTime: Date.now() - startTime
      };
    }
  }
  
  /**
   * Process video optimization job
   */
  private async processVideoOptimization(job: MediaProcessingJob): Promise<JobResult> {
    const startTime = Date.now();
    const { inputPath, outputDir, options } = job;
    
    const outputPath = path.join(
      outputDir || './temp',
      `${job.mediaFileId}_optimized.mp4`
    );
    
    const result = await this.processor.optimizeForWeb(
      inputPath,
      outputPath,
      options
    );
    
    return {
      success: result.success,
      outputPath: result.outputPath,
      metadata: result.metadata,
      processingTime: Date.now() - startTime
    };
  }
  
  /**
   * Process waveform generation job
   */
  private async processWaveformGeneration(job: MediaProcessingJob): Promise<JobResult> {
    const startTime = Date.now();
    const { inputPath, outputDir, options } = job;
    
    const result = await this.processor.generateWaveform(inputPath, outputDir, options);
    
    return {
      success: true,
      outputPath: result.waveformPath,
      metadata: { peaksData: result.peaksData },
      processingTime: Date.now() - startTime
    };
  }
  
  /**
   * Update media file with job results
   */
  private async updateMediaFile(
    job: MediaProcessingJob,
    result: JobResult
  ): Promise<void> {
    const updates: any = {
      status: 'READY',
      processedAt: new Date()
    };
    
    // Update specific fields based on job type
    switch (job.type) {
      case 'thumbnail-generation':
        if (result.outputPath) {
          updates.thumbnailPath = result.outputPath;
        }
        break;
      
      case 'waveform-generation':
        if (result.outputPath) {
          updates.waveformPath = result.outputPath;
        }
        break;
      
      case 'transcription-prep':
      case 'audio-extraction':
        // Audio extraction results might be handled differently
        // depending on your specific needs
        break;
    }
    
    // Update metadata if available
    if (result.metadata) {
      const existingMetadata = await prisma.mediaFile.findUnique({
        where: { id: job.mediaFileId },
        select: { metadata: true }
      });
      
      const currentMetadata = existingMetadata?.metadata 
        ? JSON.parse(existingMetadata.metadata)
        : {};
      
      updates.metadata = JSON.stringify({
        ...currentMetadata,
        ...result.metadata
      });
    }
    
    await prisma.mediaFile.update({
      where: { id: job.mediaFileId },
      data: updates
    });
  }
  
  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<{
    status: string;
    progress: number;
    result?: any;
    error?: string;
  } | null> {
    const job = await prisma.job.findUnique({
      where: { id: jobId }
    });
    
    if (!job) return null;
    
    return {
      status: job.status,
      progress: job.progress,
      result: job.result ? JSON.parse(job.result) : undefined,
      error: job.error
    };
  }
  
  /**
   * Cancel a job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    // Remove from queue if pending
    if (this.jobs.has(jobId)) {
      this.jobs.delete(jobId);
      
      // Update database
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'CANCELLED',
          completedAt: new Date()
        }
      });
      
      return true;
    }
    
    return false;
  }
  
  /**
   * Get queue statistics
   */
  getQueueStats(): {
    pending: number;
    processing: number;
    maxConcurrent: number;
    isRunning: boolean;
  } {
    return {
      pending: this.jobs.size,
      processing: this.processing.size,
      maxConcurrent: this.maxConcurrent,
      isRunning: this.isRunning
    };
  }
  
  /**
   * Stop the queue
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    
    // Wait for current jobs to finish
    while (this.processing.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

export default MediaProcessingQueue;
