import { PrismaClient } from '@prisma/client';
import { WhisperXTranscriber, type TranscriptionOptions, type TranscriptionResult } from './whisperx';
import { OpenAITranscriber, type OpenAITranscriptionOptions } from './openai';
import { MediaProcessingError } from '../media/ffmpeg';
import { EventEmitter } from 'events';

const prisma = new PrismaClient();

export interface TranscriptionServiceConfig {
  // WhisperX configuration
  pythonPath?: string;
  whisperxScript?: string;
  tempDir?: string;
  enableWhisperX?: boolean;
  
  // OpenAI configuration
  openaiApiKey?: string;
  enableOpenAI?: boolean;
  
  // Service configuration
  fallbackStrategy?: 'whisperx-first' | 'openai-first' | 'whisperx-only' | 'openai-only';
  maxRetries?: number;
  retryDelay?: number;
  enableProgressTracking?: boolean;
}

export interface TranscriptionJob {
  id: string;
  mediaFileId: string;
  audioPath: string;
  options: TranscriptionOptions;
  priority: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: TranscriptionResult;
  error?: string;
  progress: number;
  attempt: number;
}

export interface TranscriptionProgress {
  jobId: string;
  mediaFileId: string;
  status: 'initializing' | 'loading-model' | 'transcribing' | 'diarizing' | 'post-processing' | 'completed' | 'failed';
  progress: number; // 0-100
  message: string;
  timeElapsed: number;
  estimatedTimeRemaining?: number;
}

export class TranscriptionService extends EventEmitter {
  private whisperx?: WhisperXTranscriber;
  private openai?: OpenAITranscriber;
  private config: Required<TranscriptionServiceConfig>;
  private jobs = new Map<string, TranscriptionJob>();
  private isProcessing = false;

  constructor(config: TranscriptionServiceConfig = {}) {
    super();
    
    // Set default configuration
    this.config = {
      pythonPath: config.pythonPath || process.env.PYTHON_PATH || 'python3',
      whisperxScript: config.whisperxScript || './scripts/whisperx_service.py',
      tempDir: config.tempDir || './temp/transcription',
      enableWhisperX: config.enableWhisperX ?? true,
      openaiApiKey: config.openaiApiKey || process.env.OPENAI_API_KEY,
      enableOpenAI: config.enableOpenAI ?? true,
      fallbackStrategy: config.fallbackStrategy || 'whisperx-first',
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 5000,
      enableProgressTracking: config.enableProgressTracking ?? true,
    };
  }

  /**
   * Initialize the transcription service
   */
  async initialize(): Promise<void> {
    console.log('Initializing transcription service...');

    // Initialize WhisperX if enabled
    if (this.config.enableWhisperX) {
      try {
        this.whisperx = new WhisperXTranscriber({
          pythonPath: this.config.pythonPath,
          whisperxScript: this.config.whisperxScript,
          tempDir: this.config.tempDir,
        });
        await this.whisperx.initialize();
        console.log('WhisperX transcriber initialized');
      } catch (error) {
        console.warn('WhisperX initialization failed:', error);
        if (this.config.fallbackStrategy === 'whisperx-only') {
          throw new MediaProcessingError('WhisperX initialization failed and no fallback configured');
        }
        this.whisperx = undefined;
      }
    }

    // Initialize OpenAI if enabled
    if (this.config.enableOpenAI && this.config.openaiApiKey) {
      try {
        this.openai = new OpenAITranscriber(this.config.openaiApiKey);
        console.log('OpenAI transcriber initialized');
      } catch (error) {
        console.warn('OpenAI initialization failed:', error);
        if (this.config.fallbackStrategy === 'openai-only') {
          throw new MediaProcessingError('OpenAI initialization failed and no fallback configured');
        }
        this.openai = undefined;
      }
    }

    // Validate that at least one transcriber is available
    if (!this.whisperx && !this.openai) {
      throw new MediaProcessingError('No transcription services available');
    }

    console.log('Transcription service initialized successfully');
  }

  /**
   * Queue a transcription job
   */
  async queueTranscription(
    mediaFileId: string,
    audioPath: string,
    options: TranscriptionOptions = {},
    priority: number = 0
  ): Promise<string> {
    const jobId = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const job: TranscriptionJob = {
      id: jobId,
      mediaFileId,
      audioPath,
      options,
      priority,
      createdAt: new Date(),
      status: 'pending',
      progress: 0,
      attempt: 0,
    };

    this.jobs.set(jobId, job);
    
    console.log(`Queued transcription job ${jobId} for media ${mediaFileId}`);
    
    // Start processing if not already running
    if (!this.isProcessing) {
      setImmediate(() => this.processQueue());
    }

    return jobId;
  }

  /**
   * Process transcription queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    
    try {
      const pendingJobs = Array.from(this.jobs.values())
        .filter(job => job.status === 'pending')
        .sort((a, b) => b.priority - a.priority || a.createdAt.getTime() - b.createdAt.getTime());

      for (const job of pendingJobs) {
        await this.processJob(job);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single transcription job
   */
  private async processJob(job: TranscriptionJob): Promise<void> {
    const startTime = Date.now();
    
    try {
      job.status = 'processing';
      job.startedAt = new Date();
      job.attempt++;

      this.emitProgress(job.id, job.mediaFileId, {
        status: 'initializing',
        progress: 0,
        message: 'Starting transcription...',
        timeElapsed: 0,
      });

      console.log(`Processing transcription job ${job.id} (attempt ${job.attempt})`);

      // Determine which transcriber to use
      const transcriber = this.selectTranscriber(job);
      if (!transcriber) {
        throw new Error('No suitable transcriber available');
      }

      // Execute transcription
      let result: TranscriptionResult;
      
      if (transcriber === 'whisperx' && this.whisperx) {
        this.emitProgress(job.id, job.mediaFileId, {
          status: 'loading-model',
          progress: 10,
          message: 'Loading WhisperX model...',
          timeElapsed: Date.now() - startTime,
        });
        
        result = await this.whisperx.transcribe(job.audioPath, job.mediaFileId, job.options);
        
      } else if (transcriber === 'openai' && this.openai) {
        this.emitProgress(job.id, job.mediaFileId, {
          status: 'transcribing',
          progress: 30,
          message: 'Transcribing with OpenAI Whisper...',
          timeElapsed: Date.now() - startTime,
        });

        const openaiOptions: OpenAITranscriptionOptions = {
          language: job.options.language === 'auto' ? undefined : job.options.language,
          timestampGranularities: ['word', 'segment'],
          responseFormat: 'verbose_json',
          temperature: 0,
        };
        
        result = await this.openai.transcribe(job.audioPath, job.mediaFileId, openaiOptions);
      } else {
        throw new Error('Selected transcriber is not available');
      }

      // Job completed successfully
      job.status = 'completed';
      job.completedAt = new Date();
      job.result = result;
      job.progress = 100;

      const processingTime = (Date.now() - startTime) / 1000;
      
      this.emitProgress(job.id, job.mediaFileId, {
        status: 'completed',
        progress: 100,
        message: `Transcription completed in ${processingTime.toFixed(1)}s`,
        timeElapsed: Date.now() - startTime,
      });

      console.log(`Transcription job ${job.id} completed successfully in ${processingTime.toFixed(2)}s`);
      
      // Emit completion event
      this.emit('transcription-completed', {
        jobId: job.id,
        mediaFileId: job.mediaFileId,
        result,
        processingTime,
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Check if we should retry
      if (job.attempt < this.config.maxRetries && this.shouldRetry(error, job)) {
        console.log(`Transcription job ${job.id} failed, retrying in ${this.config.retryDelay}ms...`);
        
        job.status = 'pending'; // Reset to pending for retry
        job.error = errorMessage;
        
        this.emitProgress(job.id, job.mediaFileId, {
          status: 'failed',
          progress: 0,
          message: `Attempt ${job.attempt} failed, retrying...`,
          timeElapsed: Date.now() - startTime,
        });

        // Schedule retry
        setTimeout(() => {
          if (!this.isProcessing) {
            setImmediate(() => this.processQueue());
          }
        }, this.config.retryDelay);
        
        return;
      }

      // Job failed permanently
      job.status = 'failed';
      job.error = errorMessage;
      job.progress = 0;

      this.emitProgress(job.id, job.mediaFileId, {
        status: 'failed',
        progress: 0,
        message: `Transcription failed: ${errorMessage}`,
        timeElapsed: Date.now() - startTime,
      });

      console.error(`Transcription job ${job.id} failed permanently:`, error);
      
      // Emit failure event
      this.emit('transcription-failed', {
        jobId: job.id,
        mediaFileId: job.mediaFileId,
        error: errorMessage,
        attempts: job.attempt,
      });
    }
  }

  /**
   * Select the appropriate transcriber based on configuration and job requirements
   */
  private selectTranscriber(job: TranscriptionJob): 'whisperx' | 'openai' | null {
    const needsDiarization = job.options.enableDiarization !== false;
    const fileSize = this.getFileSize(job.audioPath);
    
    switch (this.config.fallbackStrategy) {
      case 'whisperx-only':
        return this.whisperx ? 'whisperx' : null;
        
      case 'openai-only':
        return this.openai ? 'openai' : null;
        
      case 'openai-first':
        // Try OpenAI first, but fall back to WhisperX for diarization
        if (needsDiarization && this.whisperx) {
          return 'whisperx';
        }
        if (this.openai && (!fileSize || this.openai.isFileSizeSupported(job.audioPath))) {
          return 'openai';
        }
        return this.whisperx ? 'whisperx' : null;
        
      case 'whisperx-first':
      default:
        // Try WhisperX first, fall back to OpenAI
        if (this.whisperx) {
          return 'whisperx';
        }
        if (this.openai && (!fileSize || this.openai.isFileSizeSupported(job.audioPath))) {
          return 'openai';
        }
        return null;
    }
  }

  /**
   * Get file size in bytes
   */
  private getFileSize(filePath: string): number | null {
    try {
      const fs = require('fs');
      return fs.statSync(filePath).size;
    } catch {
      return null;
    }
  }

  /**
   * Determine if a job should be retried based on the error
   */
  private shouldRetry(error: unknown, job: TranscriptionJob): boolean {
    if (!(error instanceof Error)) return false;
    
    const errorMessage = error.message.toLowerCase();
    
    // Don't retry for certain types of errors
    const nonRetryableErrors = [
      'file not found',
      'unsupported format', 
      'file too large',
      'invalid api key',
      'quota exceeded',
      'model not found',
    ];
    
    for (const nonRetryable of nonRetryableErrors) {
      if (errorMessage.includes(nonRetryable)) {
        return false;
      }
    }
    
    // Retry for network errors, temporary failures, etc.
    return true;
  }

  /**
   * Emit progress update
   */
  private emitProgress(jobId: string, mediaFileId: string, progress: Partial<TranscriptionProgress>): void {
    if (!this.config.enableProgressTracking) return;

    const fullProgress: TranscriptionProgress = {
      jobId,
      mediaFileId,
      status: 'initializing',
      progress: 0,
      message: '',
      timeElapsed: 0,
      ...progress,
    };

    this.emit('transcription-progress', fullProgress);
  }

  /**
   * Get job status
   */
  getJobStatus(jobId: string): TranscriptionJob | null {
    return this.jobs.get(jobId) || null;
  }

  /**
   * Get all jobs for a media file
   */
  getMediaJobs(mediaFileId: string): TranscriptionJob[] {
    return Array.from(this.jobs.values())
      .filter(job => job.mediaFileId === mediaFileId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Cancel a transcription job
   */
  cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || job.status === 'completed') {
      return false;
    }

    job.status = 'failed';
    job.error = 'Cancelled by user';
    
    this.emit('transcription-cancelled', { jobId, mediaFileId: job.mediaFileId });
    return true;
  }

  /**
   * Clean up completed jobs older than specified time
   */
  cleanupJobs(maxAge: number = 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - maxAge;
    let cleaned = 0;
    
    const jobEntries = Array.from(this.jobs.entries());
    for (const [jobId, job] of jobEntries) {
      if (job.status === 'completed' && job.completedAt && job.completedAt.getTime() < cutoff) {
        this.jobs.delete(jobId);
        cleaned++;
      }
    }
    
    console.log(`Cleaned up ${cleaned} old transcription jobs`);
    return cleaned;
  }

  /**
   * Get service status and capabilities
   */
  getStatus(): {
    whisperxAvailable: boolean;
    openaiAvailable: boolean;
    activeJobs: number;
    queuedJobs: number;
    totalJobs: number;
    capabilities: {
      diarization: boolean;
      multiLanguage: boolean;
      wordTimestamps: boolean;
      maxFileSize?: number;
    };
  } {
    const jobs = Array.from(this.jobs.values());
    const activeJobs = jobs.filter(j => j.status === 'processing').length;
    const queuedJobs = jobs.filter(j => j.status === 'pending').length;

    return {
      whisperxAvailable: !!this.whisperx,
      openaiAvailable: !!this.openai,
      activeJobs,
      queuedJobs,
      totalJobs: jobs.length,
      capabilities: {
        diarization: !!this.whisperx,
        multiLanguage: true,
        wordTimestamps: true,
        maxFileSize: this.openai?.getMaxFileSize(),
      },
    };
  }

  /**
   * Shutdown the service gracefully
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down transcription service...');
    
    // Cancel all pending jobs
    const jobValues = Array.from(this.jobs.values());
    for (const job of jobValues) {
      if (job.status === 'pending') {
        this.cancelJob(job.id);
      }
    }

    // Wait for active jobs to complete (with timeout)
    const timeout = 30000; // 30 seconds
    const startTime = Date.now();
    
    while (this.isProcessing && (Date.now() - startTime) < timeout) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    this.removeAllListeners();
    console.log('Transcription service shutdown complete');
  }
}

export default TranscriptionService;