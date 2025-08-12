#!/usr/bin/env node

/**
 * Background Worker Process for Media Transcription Studio
 * Handles job queue processing for transcription, export, and media processing tasks
 */

const { PrismaClient } = require('@prisma/client');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

const prisma = new PrismaClient();

class MediaWorker {
  constructor() {
    this.isRunning = true;
    this.concurrency = parseInt(process.env.WORKER_CONCURRENCY) || 2;
    this.activeJobs = new Map();
    this.pollInterval = 5000; // 5 seconds
    
    // Graceful shutdown handling
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
    
    console.log(`Media Worker started with concurrency: ${this.concurrency}`);
  }

  async start() {
    console.log('Starting media processing worker...');
    
    while (this.isRunning) {
      try {
        if (this.activeJobs.size < this.concurrency) {
          await this.processNextJob();
        }
        await this.sleep(this.pollInterval);
      } catch (error) {
        console.error('Worker error:', error);
        await this.sleep(this.pollInterval);
      }
    }
  }

  async processNextJob() {
    const job = await prisma.job.findFirst({
      where: {
        status: 'PENDING'
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'asc' }
      ]
    });

    if (!job) {
      return;
    }

    // Mark job as processing
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: 'PROCESSING',
        startedAt: new Date(),
        attempts: job.attempts + 1
      }
    });

    console.log(`Processing job ${job.id} (${job.type})`);

    // Process job based on type
    try {
      let result;
      switch (job.type) {
        case 'TRANSCRIBE':
          result = await this.processTranscriptionJob(job);
          break;
        case 'EXPORT':
          result = await this.processExportJob(job);
          break;
        case 'MEDIA_PROCESS':
          result = await this.processMediaJob(job);
          break;
        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }

      // Mark job as completed
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          result: JSON.stringify(result)
        }
      });

      console.log(`Job ${job.id} completed successfully`);

    } catch (error) {
      console.error(`Job ${job.id} failed:`, error);

      const shouldRetry = job.attempts < job.maxAttempts;
      
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: shouldRetry ? 'PENDING' : 'FAILED',
          error: error.message,
          completedAt: shouldRetry ? null : new Date()
        }
      });

      if (!shouldRetry) {
        console.log(`Job ${job.id} failed permanently after ${job.attempts} attempts`);
      }
    }
  }

  async processTranscriptionJob(job) {
    const data = JSON.parse(job.data);
    const { mediaFileId, options = {} } = data;

    // Get media file info
    const mediaFile = await prisma.mediaFile.findUnique({
      where: { id: mediaFileId }
    });

    if (!mediaFile) {
      throw new Error(`Media file not found: ${mediaFileId}`);
    }

    // Prepare transcription command
    const pythonPath = process.env.PYTHON_PATH || 'python3';
    const whisperxPath = process.env.WHISPERX_SERVICE_PATH || 'scripts/whisperx_service.py';
    
    const args = [
      whisperxPath,
      mediaFile.filePath,
      '--model', options.model || 'large-v2',
      '--device', options.device || 'auto'
    ];

    if (options.language) {
      args.push('--language', options.language);
    }

    if (options.noDiarization) {
      args.push('--no-diarization');
    }

    if (options.minSpeakers) {
      args.push('--min-speakers', options.minSpeakers.toString());
    }

    if (options.maxSpeakers) {
      args.push('--max-speakers', options.maxSpeakers.toString());
    }

    if (process.env.HF_TOKEN) {
      args.push('--hf-token', process.env.HF_TOKEN);
    }

    // Run transcription
    const result = await this.runProcess(pythonPath, args);
    const transcriptionResult = JSON.parse(result);

    // Save transcript to database
    await this.saveTranscript(mediaFileId, transcriptionResult, options);

    return {
      success: true,
      language: transcriptionResult.language,
      segments: transcriptionResult.segments.length,
      speakers: transcriptionResult.speakers.length
    };
  }

  async processExportJob(job) {
    const data = JSON.parse(job.data);
    const { exportId } = data;

    // Get export info
    const exportRecord = await prisma.export.findUnique({
      where: { id: exportId },
      include: {
        mediaFile: true,
        timeline: true,
        highlight: true
      }
    });

    if (!exportRecord) {
      throw new Error(`Export not found: ${exportId}`);
    }

    // Update export status
    await prisma.export.update({
      where: { id: exportId },
      data: {
        status: 'PROCESSING',
        progress: 0
      }
    });

    // Process export based on type
    let outputPath;
    if (exportRecord.timeline) {
      outputPath = await this.exportTimeline(exportRecord);
    } else if (exportRecord.highlight) {
      outputPath = await this.exportHighlight(exportRecord);
    } else {
      outputPath = await this.exportMediaFile(exportRecord);
    }

    // Get file stats
    const stats = await fs.stat(outputPath);

    // Update export record
    await prisma.export.update({
      where: { id: exportId },
      data: {
        status: 'COMPLETED',
        progress: 100,
        outputPath,
        fileSize: BigInt(stats.size),
        completedAt: new Date()
      }
    });

    return {
      success: true,
      outputPath,
      fileSize: stats.size
    };
  }

  async processMediaJob(job) {
    const data = JSON.parse(job.data);
    // Implement media processing logic
    return { success: true, message: 'Media processing not implemented yet' };
  }

  async saveTranscript(mediaFileId, transcriptionResult, options) {
    // Create transcript record
    const transcript = await prisma.transcript.create({
      data: {
        mediaFileId,
        language: transcriptionResult.language,
        confidence: this.calculateAverageConfidence(transcriptionResult.segments),
        engine: 'whisperx',
        modelVersion: options.model || 'large-v2',
        diarizationEnabled: !options.noDiarization,
        maxSpeakers: options.maxSpeakers || 5,
        status: 'COMPLETED',
        completedAt: new Date()
      }
    });

    // Save speakers
    const speakerMap = new Map();
    for (const speaker of transcriptionResult.speakers) {
      const dbSpeaker = await prisma.speaker.create({
        data: {
          transcriptId: transcript.id,
          label: speaker.id,
          totalDuration: speaker.total_duration || 0,
          segmentCount: speaker.segments || 0,
          averageConfidence: 0.9 // Default confidence
        }
      });
      speakerMap.set(speaker.id, dbSpeaker.id);
    }

    // Save segments
    for (const segment of transcriptionResult.segments) {
      const dbSegment = await prisma.transcriptSegment.create({
        data: {
          transcriptId: transcript.id,
          start: segment.start,
          end: segment.end,
          text: segment.text,
          confidence: segment.confidence || 0.9,
          speakerId: segment.speaker ? speakerMap.get(segment.speaker) : null
        }
      });

      // Save words if available
      if (segment.words) {
        for (const word of segment.words) {
          await prisma.word.create({
            data: {
              segmentId: dbSegment.id,
              text: word.word,
              start: word.start,
              end: word.end,
              confidence: word.confidence || 0.9
            }
          });
        }
      }
    }

    return transcript;
  }

  calculateAverageConfidence(segments) {
    if (segments.length === 0) return 0;
    const total = segments.reduce((sum, seg) => sum + (seg.confidence || 0.9), 0);
    return total / segments.length;
  }

  async exportTimeline(exportRecord) {
    // Implement timeline export logic
    throw new Error('Timeline export not implemented yet');
  }

  async exportHighlight(exportRecord) {
    // Implement highlight export logic  
    throw new Error('Highlight export not implemented yet');
  }

  async exportMediaFile(exportRecord) {
    // Implement media file export logic
    throw new Error('Media file export not implemented yet');
  }

  async runProcess(command, args) {
    return new Promise((resolve, reject) => {
      const process = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Process failed with code ${code}: ${stderr}`));
        }
      });

      process.on('error', reject);
    });
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async shutdown() {
    console.log('Worker shutting down...');
    this.isRunning = false;
    
    // Wait for active jobs to complete
    while (this.activeJobs.size > 0) {
      console.log(`Waiting for ${this.activeJobs.size} jobs to complete...`);
      await this.sleep(1000);
    }

    await prisma.$disconnect();
    process.exit(0);
  }
}

// Start worker
const worker = new MediaWorker();
worker.start().catch(error => {
  console.error('Worker failed to start:', error);
  process.exit(1);
});