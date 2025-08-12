import { PrismaClient } from '@prisma/client';
import { EventEmitter } from 'events';
import path from 'path';
import { 
  ExportJob, 
  BatchExportJob, 
  ExportProgress, 
  ExportEvent,
  ExportEventCallback 
} from './types';
import { VideoExporter } from './video-exporter';

const prisma = new PrismaClient();

export interface QueueOptions {
  maxConcurrentJobs: number;
  retryAttempts: number;
  retryDelay: number; // milliseconds
  priorityLevels: number;
  tempDir?: string;
  outputDir?: string;
}

export interface QueueStats {
  totalJobs: number;
  queuedJobs: number;
  processingJobs: number;
  completedJobs: number;
  failedJobs: number;
  averageProcessingTime: number;
  estimatedTimeRemaining: number;
}

export class ExportQueue extends EventEmitter {
  private videoExporter: VideoExporter;
  private options: QueueOptions;
  private processingJobs = new Map<string, ExportJob>();
  private jobQueue: ExportJob[] = [];
  private isProcessing = false;
  private stats: QueueStats = {
    totalJobs: 0,
    queuedJobs: 0,
    processingJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
    averageProcessingTime: 0,
    estimatedTimeRemaining: 0
  };

  constructor(options: Partial<QueueOptions> = {}) {
    super();
    
    this.options = {
      maxConcurrentJobs: 2,
      retryAttempts: 3,
      retryDelay: 5000,
      priorityLevels: 5,
      tempDir: './temp/export',
      outputDir: './exports',
      ...options
    };

    this.videoExporter = new VideoExporter({
      tempDir: this.options.tempDir,
      outputDir: this.options.outputDir
    });

    // Load existing jobs from database on startup
    this.loadPendingJobs();
  }

  /**
   * Add a single export job to the queue
   */
  async addJob(job: Omit<ExportJob, 'id' | 'status' | 'progress'>): Promise<string> {
    const exportJob: ExportJob = {
      ...job,
      id: this.generateJobId(),
      status: 'queued',
      progress: 0,
      startedAt: undefined,
      completedAt: undefined
    };

    // Save to database
    await this.saveJobToDatabase(exportJob);
    
    // Add to queue with priority sorting
    this.insertJobByPriority(exportJob);
    
    this.updateStats();
    this.emit('jobAdded', exportJob);
    
    // Start processing if not already running
    this.startProcessing();
    
    return exportJob.id;
  }

  /**
   * Add multiple jobs as a batch
   */
  async addBatchJob(
    jobs: Array<Omit<ExportJob, 'id' | 'status' | 'progress'>>,
    options: {
      batchName?: string;
      sequential?: boolean;
      priority?: number;
    } = {}
  ): Promise<string> {
    const batchId = this.generateJobId();
    const batchJob: BatchExportJob = {
      id: batchId,
      jobs: [],
      status: 'queued',
      progress: 0,
      results: {
        successful: 0,
        failed: 0,
        total: jobs.length,
        outputs: []
      }
    };

    // Create individual jobs with batch reference
    for (const jobData of jobs) {
      const job: ExportJob = {
        ...jobData,
        id: this.generateJobId(),
        status: 'queued',
        progress: 0,
        options: {
          ...jobData.options,
          priority: options.priority || jobData.options.priority
        }
      };
      
      batchJob.jobs.push(job);
      await this.saveJobToDatabase(job);
      this.insertJobByPriority(job);
    }

    // Save batch job
    await this.saveBatchJobToDatabase(batchJob);
    
    this.updateStats();
    this.emit('batchJobAdded', batchJob);
    this.startProcessing();
    
    return batchId;
  }

  /**
   * Cancel a specific job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    // Remove from queue if not started
    const queueIndex = this.jobQueue.findIndex(job => job.id === jobId);
    if (queueIndex !== -1) {
      const job = this.jobQueue[queueIndex];
      job.status = 'cancelled';
      this.jobQueue.splice(queueIndex, 1);
      
      await this.updateJobInDatabase(job);
      this.updateStats();
      this.emit('jobCancelled', job);
      return true;
    }

    // Cancel if currently processing
    const processingJob = this.processingJobs.get(jobId);
    if (processingJob) {
      processingJob.status = 'cancelled';
      this.processingJobs.delete(jobId);
      
      await this.updateJobInDatabase(processingJob);
      this.updateStats();
      this.emit('jobCancelled', processingJob);
      return true;
    }

    return false;
  }

  /**
   * Pause the entire queue
   */
  pauseQueue(): void {
    this.isProcessing = false;
    this.emit('queuePaused');
  }

  /**
   * Resume queue processing
   */
  resumeQueue(): void {
    if (!this.isProcessing) {
      this.isProcessing = true;
      this.emit('queueResumed');
      this.startProcessing();
    }
  }

  /**
   * Clear all queued jobs (not processing ones)
   */
  async clearQueue(): Promise<void> {
    const cancelledJobs = [...this.jobQueue];
    this.jobQueue = [];
    
    // Update database
    for (const job of cancelledJobs) {
      job.status = 'cancelled';
      await this.updateJobInDatabase(job);
    }
    
    this.updateStats();
    this.emit('queueCleared', cancelledJobs.length);
  }

  /**
   * Get current queue status
   */
  getStats(): QueueStats {
    return { ...this.stats };
  }

  /**
   * Get specific job status
   */
  async getJobStatus(jobId: string): Promise<ExportJob | null> {
    // Check processing jobs first
    const processingJob = this.processingJobs.get(jobId);
    if (processingJob) {
      return processingJob;
    }

    // Check queue
    const queuedJob = this.jobQueue.find(job => job.id === jobId);
    if (queuedJob) {
      return queuedJob;
    }

    // Check database
    const dbJob = await prisma.export.findUnique({
      where: { id: jobId }
    });

    if (dbJob) {
      return this.mapDatabaseJobToExportJob(dbJob);
    }

    return null;
  }

  /**
   * Get all jobs with optional filtering
   */
  async getJobs(filter: {
    status?: ExportJob['status'];
    limit?: number;
    offset?: number;
  } = {}): Promise<ExportJob[]> {
    const dbJobs = await prisma.export.findMany({
      where: filter.status ? { status: filter.status } : undefined,
      orderBy: { startedAt: 'desc' },
      take: filter.limit,
      skip: filter.offset
    });

    return dbJobs.map(this.mapDatabaseJobToExportJob);
  }

  /**
   * Retry a failed job
   */
  async retryJob(jobId: string): Promise<boolean> {
    const job = await this.getJobStatus(jobId);
    if (!job || job.status !== 'failed') {
      return false;
    }

    job.status = 'queued';
    job.progress = 0;
    job.error = undefined;
    job.startedAt = undefined;
    job.completedAt = undefined;

    await this.updateJobInDatabase(job);
    this.insertJobByPriority(job);
    
    this.updateStats();
    this.emit('jobRetried', job);
    this.startProcessing();
    
    return true;
  }

  // Private methods
  private async loadPendingJobs(): Promise<void> {
    const pendingJobs = await prisma.export.findMany({
      where: {
        status: { in: ['queued', 'processing'] }
      },
      orderBy: { startedAt: 'asc' }
    });

    for (const dbJob of pendingJobs) {
      const job = this.mapDatabaseJobToExportJob(dbJob);
      
      if (job.status === 'processing') {
        // Reset processing jobs to queued on startup
        job.status = 'queued';
        job.progress = 0;
        await this.updateJobInDatabase(job);
      }
      
      this.insertJobByPriority(job);
    }

    this.updateStats();
  }

  private async startProcessing(): Promise<void> {
    if (!this.isProcessing) {
      this.isProcessing = true;
    }

    // Process jobs while we have capacity and queued jobs
    while (
      this.processingJobs.size < this.options.maxConcurrentJobs &&
      this.jobQueue.length > 0 &&
      this.isProcessing
    ) {
      const job = this.jobQueue.shift()!;
      this.processJob(job);
    }
  }

  private async processJob(job: ExportJob): Promise<void> {
    job.status = 'processing';
    job.progress = 0;
    job.startedAt = new Date();
    
    this.processingJobs.set(job.id, job);
    await this.updateJobInDatabase(job);
    this.updateStats();

    const onProgress: ExportEventCallback = (event) => {
      if (event.type === 'progress' && event.data?.progress !== undefined) {
        job.progress = event.data.progress;
        this.emit('jobProgress', { jobId: job.id, progress: job.progress });
      }
      
      // Forward all events
      this.emit('exportEvent', event);
    };

    try {
      const result = await this.videoExporter.exportVideo(job, onProgress);
      
      if (result.success) {
        job.status = 'completed';
        job.progress = 100;
        job.completedAt = new Date();
        job.result = {
          outputPath: result.outputPath!,
          fileSize: result.fileSize!,
          duration: result.duration!,
          actualBitrate: result.actualBitrate
        };
        
        this.emit('jobCompleted', job);
      } else {
        throw new Error(result.error || 'Export failed');
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      job.status = 'failed';
      job.error = errorMessage;
      job.completedAt = new Date();
      
      this.emit('jobFailed', { job, error: errorMessage });
      
      // Retry logic
      const currentAttempts = (job as any).retryAttempts || 0; // TODO: Fix retryAttempts type
      if (currentAttempts < this.options.retryAttempts) {
        setTimeout(() => {
          job.status = 'queued';
          job.error = undefined;
          job.startedAt = undefined;
          job.completedAt = undefined;
          (job as any).retryAttempts = currentAttempts + 1; // TODO: Fix retryAttempts type
          
          this.insertJobByPriority(job);
          this.updateStats();
          this.emit('jobRetrying', job);
          this.startProcessing();
        }, this.options.retryDelay);
      }
    } finally {
      this.processingJobs.delete(job.id);
      await this.updateJobInDatabase(job);
      this.updateStats();
      
      // Continue processing if there are more jobs
      this.startProcessing();
    }
  }

  private insertJobByPriority(job: ExportJob): void {
    const priority = job.options.priority || 0;
    
    // Find insertion point based on priority (higher priority first)
    let insertIndex = 0;
    while (
      insertIndex < this.jobQueue.length &&
      (this.jobQueue[insertIndex].options.priority || 0) >= priority
    ) {
      insertIndex++;
    }
    
    this.jobQueue.splice(insertIndex, 0, job);
  }

  private updateStats(): void {
    this.stats.totalJobs = this.jobQueue.length + this.processingJobs.size;
    this.stats.queuedJobs = this.jobQueue.length;
    this.stats.processingJobs = this.processingJobs.size;
    
    // Database stats would be calculated here in a real implementation
    // For now, just emit stats update
    this.emit('statsUpdated', this.stats);
  }

  private generateJobId(): string {
    return `export_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async saveJobToDatabase(job: ExportJob): Promise<void> {
    await prisma.export.create({
      data: {
        id: job.id,
        filename: job.output.filename,
        format: job.preset?.video?.format || 'mp4',
        preset: job.preset?.id,
        settings: JSON.stringify({
          preset: job.preset,
          customSettings: job.customSettings,
          options: job.options,
          timeline: job.timeline
        }),
        status: job.status,
        progress: job.progress,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        error: job.error,
        mediaFileId: job.mediaFileId,
        timelineId: job.timelineId,
        highlightId: job.highlightId
      }
    });
  }

  private async saveBatchJobToDatabase(batchJob: BatchExportJob): Promise<void> {
    // In a real implementation, we'd have a separate batch_exports table
    // For now, we'll store batch info in the job settings
    for (const job of batchJob.jobs) {
      await this.updateJobInDatabase({
        ...job,
        // Add batch reference to job settings
      });
    }
  }

  private async updateJobInDatabase(job: ExportJob): Promise<void> {
    await prisma.export.update({
      where: { id: job.id },
      data: {
        status: job.status,
        progress: job.progress,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        error: job.error,
        outputPath: job.result?.outputPath,
        fileSize: job.result?.fileSize ? BigInt(job.result.fileSize) : undefined,
        duration: job.result?.duration,
        processingTime: (job.result as any)?.processingTime
      }
    });
  }

  private mapDatabaseJobToExportJob(dbJob: any): ExportJob {
    const settings = JSON.parse(dbJob.settings || '{}');
    
    return {
      id: dbJob.id,
      mediaFileId: dbJob.mediaFileId,
      timelineId: dbJob.timelineId,
      highlightId: dbJob.highlightId,
      preset: settings.preset,
      customSettings: settings.customSettings,
      timeline: settings.timeline,
      output: {
        filename: dbJob.filename,
        directory: path.dirname(dbJob.outputPath || ''),
        overwrite: true
      },
      options: settings.options || { priority: 0, includeSubtitles: false },
      status: dbJob.status,
      progress: dbJob.progress,
      startedAt: dbJob.startedAt,
      completedAt: dbJob.completedAt,
      error: dbJob.error,
      result: dbJob.outputPath ? {
        outputPath: dbJob.outputPath,
        fileSize: Number(dbJob.fileSize),
        duration: dbJob.duration,
        actualBitrate: dbJob.actualBitrate
      } : undefined
    };
  }
}

// Export queue singleton
let exportQueueInstance: ExportQueue | null = null;

export function getExportQueue(options?: Partial<QueueOptions>): ExportQueue {
  if (!exportQueueInstance) {
    exportQueueInstance = new ExportQueue(options);
  }
  return exportQueueInstance;
}