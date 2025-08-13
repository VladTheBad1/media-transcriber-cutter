import { PrismaClient } from '@prisma/client';
import { EventEmitter } from 'events';
import TranscriptionService, { type TranscriptionServiceConfig } from './service';
import type { TranscriptionOptions, TranscriptionResult } from './whisperx';

const prisma = new PrismaClient();

export interface QueueJob {
  id: string;
  type: 'transcription';
  mediaFileId: string;
  audioPath: string;
  options: TranscriptionOptions;
  priority: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  result?: any;
}

export interface QueueConfig {
  concurrency?: number;
  maxAttempts?: number;
  retryDelay?: number;
  jobTimeout?: number;
  cleanupInterval?: number;
  maxCompletedAge?: number;
}

export class TranscriptionQueue extends EventEmitter {
  private transcriptionService: TranscriptionService;
  private jobs = new Map<string, QueueJob>();
  private processing = new Set<string>();
  private config: Required<QueueConfig>;
  private cleanupTimer?: NodeJS.Timeout;
  private isShuttingDown = false;

  constructor(
    transcriptionConfig: TranscriptionServiceConfig = {},
    queueConfig: QueueConfig = {}
  ) {
    super();

    this.transcriptionService = new TranscriptionService(transcriptionConfig);
    
    // Set default queue configuration
    this.config = {
      concurrency: queueConfig.concurrency || 2,
      maxAttempts: queueConfig.maxAttempts || 3,
      retryDelay: queueConfig.retryDelay || 5000,
      jobTimeout: queueConfig.jobTimeout || 30 * 60 * 1000, // 30 minutes
      cleanupInterval: queueConfig.cleanupInterval || 60 * 60 * 1000, // 1 hour
      maxCompletedAge: queueConfig.maxCompletedAge || 24 * 60 * 60 * 1000, // 24 hours
    };

    // Set up transcription service event listeners
    this.setupTranscriptionListeners();

    // Load existing jobs from database
    this.loadPersistedJobs();
  }

  /**
   * Initialize the queue system
   */
  async initialize(): Promise<void> {
    console.log('Initializing transcription queue...');
    
    // Initialize transcription service
    await this.transcriptionService.initialize();

    // Start cleanup timer
    this.startCleanupTimer();

    // Resume processing any pending jobs
    this.processQueue();

    console.log(`Transcription queue initialized with concurrency: ${this.config.concurrency}`);
  }

  /**
   * Add a transcription job to the queue
   */
  async addJob(
    mediaFileId: string,
    audioPath: string,
    options: TranscriptionOptions = {},
    priority: number = 0
  ): Promise<string> {
    const jobId = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const job: QueueJob = {
      id: jobId,
      type: 'transcription',
      mediaFileId,
      audioPath,
      options,
      priority,
      status: 'pending',
      progress: 0,
      attempts: 0,
      maxAttempts: this.config.maxAttempts,
      createdAt: new Date(),
    };

    // Save job to memory and database
    this.jobs.set(jobId, job);
    await this.persistJob(job);

    console.log(`Added transcription job ${jobId} for media ${mediaFileId}`);
    
    // Emit job added event
    this.emit('job-added', job);

    // Start processing if not at capacity
    this.processQueue();

    return jobId;
  }

  /**
   * Process the job queue
   */
  private async processQueue(): Promise<void> {
    if (this.isShuttingDown) return;

    // Check if we're at capacity
    if (this.processing.size >= this.config.concurrency) {
      return;
    }

    // Get next job to process
    const nextJob = this.getNextJob();
    if (!nextJob) {
      return;
    }

    // Start processing the job
    this.processing.add(nextJob.id);
    this.processJob(nextJob);

    // Continue processing more jobs if we have capacity
    if (this.processing.size < this.config.concurrency) {
      setImmediate(() => this.processQueue());
    }
  }

  /**
   * Get the next job to process (highest priority, oldest first)
   */
  private getNextJob(): QueueJob | null {
    const pendingJobs = Array.from(this.jobs.values())
      .filter(job => job.status === 'pending')
      .sort((a, b) => {
        // Sort by priority (descending), then by creation time (ascending)
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        return a.createdAt.getTime() - b.createdAt.getTime();
      });

    return pendingJobs[0] || null;
  }

  /**
   * Process a single job
   */
  private async processJob(job: QueueJob): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Update job status
      job.status = 'processing';
      job.startedAt = new Date();
      job.attempts++;
      
      await this.updateJobStatus(job);
      
      console.log(`Processing transcription job ${job.id} (attempt ${job.attempts}/${job.maxAttempts})`);

      // Set timeout for the job
      const timeoutId = setTimeout(() => {
        this.cancelJob(job.id, 'Job timeout');
      }, this.config.jobTimeout);

      try {
        // Queue the job with transcription service
        const serviceJobId = await this.transcriptionService.queueTranscription(
          job.mediaFileId,
          job.audioPath,
          job.options,
          job.priority
        );

        // Wait for completion or failure
        await new Promise((resolve, reject) => {
          const onCompleted = (event: any) => {
            if (event.jobId === serviceJobId) {
              job.result = event.result;
              resolve(event.result);
              this.transcriptionService.removeListener('transcription-completed', onCompleted);
              this.transcriptionService.removeListener('transcription-failed', onFailed);
            }
          };

          const onFailed = (event: any) => {
            if (event.jobId === serviceJobId) {
              reject(new Error(event.error));
              this.transcriptionService.removeListener('transcription-completed', onCompleted);
              this.transcriptionService.removeListener('transcription-failed', onFailed);
            }
          };

          this.transcriptionService.on('transcription-completed', onCompleted);
          this.transcriptionService.on('transcription-failed', onFailed);
        });

        clearTimeout(timeoutId);

        // Job completed successfully
        job.status = 'completed';
        job.completedAt = new Date();
        job.progress = 100;

        const processingTime = (Date.now() - startTime) / 1000;
        console.log(`Transcription job ${job.id} completed successfully in ${processingTime.toFixed(2)}s`);

        // Emit completion event
        this.emit('job-completed', {
          job,
          result: job.result,
          processingTime,
        });

      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      console.error(`Transcription job ${job.id} failed:`, error);

      // Check if we should retry
      if (job.attempts < job.maxAttempts && this.shouldRetry(error)) {
        console.log(`Retrying transcription job ${job.id} in ${this.config.retryDelay}ms...`);
        
        job.status = 'pending';
        job.error = `Attempt ${job.attempts} failed: ${errorMessage}`;
        
        // Schedule retry
        setTimeout(() => {
          this.processQueue();
        }, this.config.retryDelay);

      } else {
        // Job failed permanently
        job.status = 'failed';
        job.error = errorMessage;
        job.progress = 0;

        console.error(`Transcription job ${job.id} failed permanently after ${job.attempts} attempts`);
        
        // Emit failure event
        this.emit('job-failed', {
          job,
          error: errorMessage,
          attempts: job.attempts,
        });
      }
    } finally {
      // Update job in database and remove from processing set
      await this.updateJobStatus(job);
      this.processing.delete(job.id);

      // Continue processing queue
      setImmediate(() => this.processQueue());
    }
  }

  /**
   * Set up transcription service event listeners
   */
  private setupTranscriptionListeners(): void {
    this.transcriptionService.on('transcription-progress', (progress) => {
      console.log('Queue received transcription progress:', progress);
      
      // Find the queue job and update progress
      const job = Array.from(this.jobs.values())
        .find(j => j.mediaFileId === progress.mediaFileId && j.status === 'processing');
      
      if (job) {
        job.progress = progress.progress;
        const event = {
          jobId: job.id,
          mediaFileId: job.mediaFileId,
          progress: progress.progress,
          message: progress.message,
          status: progress.status,
        };
        console.log('Queue emitting job-progress:', event);
        this.emit('job-progress', event);
      } else {
        console.log('No active job found for mediaFileId:', progress.mediaFileId);
      }
    });
  }

  /**
   * Determine if a job should be retried
   */
  private shouldRetry(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    
    const errorMessage = error.message.toLowerCase();
    
    // Don't retry for certain types of errors
    const nonRetryableErrors = [
      'file not found',
      'unsupported format',
      'file too large',
      'invalid api key',
      'quota exceeded',
      'cancelled',
      'timeout',
    ];
    
    return !nonRetryableErrors.some(nonRetryable => errorMessage.includes(nonRetryable));
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string, reason?: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job || job.status === 'completed') {
      return false;
    }

    job.status = 'cancelled';
    job.error = reason || 'Cancelled by user';
    
    await this.updateJobStatus(job);
    
    // Remove from processing set
    this.processing.delete(jobId);
    
    // Also cancel in transcription service
    this.transcriptionService.cancelJob(jobId);

    console.log(`Cancelled transcription job ${jobId}: ${reason || 'User request'}`);
    
    this.emit('job-cancelled', { jobId, mediaFileId: job.mediaFileId, reason });
    
    // Continue processing queue
    this.processQueue();
    
    return true;
  }

  /**
   * Get job status
   */
  getJob(jobId: string): QueueJob | null {
    return this.jobs.get(jobId) || null;
  }

  /**
   * Get all jobs for a media file
   */
  getJobsForMedia(mediaFileId: string): QueueJob[] {
    return Array.from(this.jobs.values())
      .filter(job => job.mediaFileId === mediaFileId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    cancelled: number;
    concurrency: number;
    activeJobs: number;
  } {
    const jobs = Array.from(this.jobs.values());
    
    return {
      total: jobs.length,
      pending: jobs.filter(j => j.status === 'pending').length,
      processing: jobs.filter(j => j.status === 'processing').length,
      completed: jobs.filter(j => j.status === 'completed').length,
      failed: jobs.filter(j => j.status === 'failed').length,
      cancelled: jobs.filter(j => j.status === 'cancelled').length,
      concurrency: this.config.concurrency,
      activeJobs: this.processing.size,
    };
  }

  /**
   * Persist job to database
   */
  private async persistJob(job: QueueJob): Promise<void> {
    try {
      await prisma.job.upsert({
        where: { id: job.id },
        update: {
          status: job.status,
          progress: job.progress,
          error: job.error,
          result: job.result ? JSON.stringify(job.result) : null,
          attempts: job.attempts,
          startedAt: job.startedAt,
          completedAt: job.completedAt,
        },
        create: {
          id: job.id,
          type: job.type,
          priority: job.priority,
          data: JSON.stringify({
            mediaFileId: job.mediaFileId,
            audioPath: job.audioPath,
            options: job.options,
          }),
          status: job.status,
          progress: job.progress,
          attempts: job.attempts,
          maxAttempts: job.maxAttempts,
          createdAt: job.createdAt,
          startedAt: job.startedAt,
          completedAt: job.completedAt,
          error: job.error,
          result: job.result ? JSON.stringify(job.result) : null,
        },
      });
    } catch (error) {
      console.error(`Failed to persist job ${job.id}:`, error);
    }
  }

  /**
   * Update job status in database
   */
  private async updateJobStatus(job: QueueJob): Promise<void> {
    await this.persistJob(job);
  }

  /**
   * Load persisted jobs from database
   */
  private async loadPersistedJobs(): Promise<void> {
    try {
      const dbJobs = await prisma.job.findMany({
        where: {
          type: 'transcription',
          status: {
            in: ['pending', 'processing'],
          },
        },
      });

      for (const dbJob of dbJobs) {
        try {
          const data = JSON.parse(dbJob.data);
          const job: QueueJob = {
            id: dbJob.id,
            type: 'transcription',
            mediaFileId: data.mediaFileId,
            audioPath: data.audioPath,
            options: data.options || {},
            priority: dbJob.priority,
            status: dbJob.status === 'processing' ? 'pending' : dbJob.status as any, // TODO: Fix status type assertion
            progress: dbJob.progress,
            attempts: dbJob.attempts,
            maxAttempts: dbJob.maxAttempts,
            createdAt: dbJob.createdAt,
            startedAt: dbJob.startedAt || undefined,
            completedAt: dbJob.completedAt || undefined,
            error: dbJob.error || undefined,
            result: dbJob.result ? JSON.parse(dbJob.result) : undefined,
          };

          this.jobs.set(job.id, job);
        } catch (parseError) {
          console.error(`Failed to parse persisted job ${dbJob.id}:`, parseError);
        }
      }

      console.log(`Loaded ${this.jobs.size} persisted transcription jobs`);
    } catch (error) {
      console.error('Failed to load persisted jobs:', error);
    }
  }

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupCompletedJobs();
    }, this.config.cleanupInterval);
  }

  /**
   * Clean up old completed jobs
   */
  private async cleanupCompletedJobs(): Promise<void> {
    const cutoff = new Date(Date.now() - this.config.maxCompletedAge);
    let cleaned = 0;

    const jobEntries = Array.from(this.jobs.entries());
    for (const [jobId, job] of jobEntries) {
      if (
        (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') &&
        job.completedAt &&
        job.completedAt < cutoff
      ) {
        this.jobs.delete(jobId);
        cleaned++;

        // Remove from database
        try {
          await prisma.job.delete({ where: { id: jobId } });
        } catch (error) {
          console.error(`Failed to delete job ${jobId} from database:`, error);
        }
      }
    }

    if (cleaned > 0) {
      console.log(`Cleaned up ${cleaned} old transcription jobs`);
    }
  }

  /**
   * Shutdown the queue gracefully
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down transcription queue...');
    
    this.isShuttingDown = true;

    // Clear cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // Cancel all pending jobs
    const pendingJobs = Array.from(this.jobs.values()).filter(job => job.status === 'pending');
    for (const job of pendingJobs) {
      await this.cancelJob(job.id, 'System shutdown');
    }

    // Wait for processing jobs to complete (with timeout)
    const timeout = 30000; // 30 seconds
    const startTime = Date.now();
    
    while (this.processing.size > 0 && (Date.now() - startTime) < timeout) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Shutdown transcription service
    await this.transcriptionService.shutdown();

    this.removeAllListeners();
    console.log('Transcription queue shutdown complete');
  }
}

export default TranscriptionQueue;