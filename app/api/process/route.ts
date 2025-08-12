import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import MediaProcessingQueue, { MediaProcessingJob } from '@/lib/media/queue';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

const prisma = new PrismaClient();
const queue = new MediaProcessingQueue({ maxConcurrent: 3 });

const MEDIA_DIR = process.env.MEDIA_DIR || './media';
const TEMP_DIR = process.env.TEMP_DIR || './temp';

/**
 * POST /api/process - Queue media processing jobs
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      mediaId, 
      operations, 
      priority = 5,
      options = {}
    } = body;
    
    if (!mediaId || !operations || !Array.isArray(operations)) {
      return NextResponse.json(
        { error: 'mediaId and operations array are required' },
        { status: 400 }
      );
    }
    
    // Validate media file exists
    const mediaFile = await prisma.mediaFile.findUnique({
      where: { id: mediaId }
    });
    
    if (!mediaFile) {
      return NextResponse.json(
        { error: 'Media file not found' },
        { status: 404 }
      );
    }
    
    // Create processing jobs
    const jobs: MediaProcessingJob[] = [];
    const jobIds: string[] = [];
    
    for (const operation of operations) {
      const jobId = `${operation}_${mediaId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const job: MediaProcessingJob = {
        id: jobId,
        type: operation,
        mediaFileId: mediaId,
        inputPath: mediaFile.filePath,
        outputDir: getOutputDir(operation),
        priority,
        options: {
          ...options,
          ...getOperationOptions(operation, options)
        }
      };
      
      jobs.push(job);
      jobIds.push(jobId);
      
      // Add to queue
      await queue.addJob(job);
    }
    
    // Update media file status
    await prisma.mediaFile.update({
      where: { id: mediaId },
      data: { status: 'PROCESSING' }
    });
    
    return NextResponse.json({
      message: `Queued ${operations.length} processing jobs`,
      mediaId,
      operations,
      jobIds,
      queueStats: queue.getQueueStats()
    });
    
  } catch (error) {
    console.error('Error queuing processing jobs:', error);
    return NextResponse.json(
      { 
        error: 'Failed to queue processing jobs',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/process - Get processing queue status
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    const mediaId = searchParams.get('mediaId');
    
    if (jobId) {
      // Get specific job status
      const jobStatus = await queue.getJobStatus(jobId);
      if (!jobStatus) {
        return NextResponse.json(
          { error: 'Job not found' },
          { status: 404 }
        );
      }
      
      return NextResponse.json({
        jobId,
        ...jobStatus
      });
    }
    
    if (mediaId) {
      // Get all jobs for a media file
      const jobs = await prisma.job.findMany({
        where: {
          data: {
            contains: `"mediaFileId":"${mediaId}"`
          }
        },
        orderBy: { createdAt: 'desc' }
      });
      
      return NextResponse.json({
        mediaId,
        jobs: jobs.map(job => ({
          jobId: job.id,
          type: job.type,
          status: job.status.toLowerCase(),
          progress: job.progress,
          createdAt: job.createdAt.toISOString(),
          startedAt: job.startedAt?.toISOString(),
          completedAt: job.completedAt?.toISOString(),
          error: job.error,
          attempts: job.attempts
        }))
      });
    }
    
    // Get general queue statistics
    const queueStats = queue.getQueueStats();
    
    // Get recent jobs from database
    const recentJobs = await prisma.job.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        type: true,
        status: true,
        progress: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
        error: true
      }
    });
    
    // Get processing statistics
    const stats = await prisma.job.groupBy({
      by: ['status'],
      _count: {
        id: true
      },
      where: {
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      }
    });
    
    return NextResponse.json({
      queueStats,
      recentJobs: recentJobs.map(job => ({
        jobId: job.id,
        type: job.type,
        status: job.status.toLowerCase(),
        progress: job.progress,
        createdAt: job.createdAt.toISOString(),
        startedAt: job.startedAt?.toISOString(),
        completedAt: job.completedAt?.toISOString(),
        error: job.error
      })),
      statistics: {
        last24Hours: stats.reduce((acc, stat) => {
          acc[stat.status.toLowerCase()] = stat._count.id;
          return acc;
        }, {} as Record<string, number>)
      }
    });
    
  } catch (error) {
    console.error('Error fetching processing status:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch processing status',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/process - Cancel processing jobs
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    const mediaId = searchParams.get('mediaId');
    
    if (jobId) {
      // Cancel specific job
      const cancelled = await queue.cancelJob(jobId);
      
      return NextResponse.json({
        jobId,
        cancelled,
        message: cancelled ? 'Job cancelled successfully' : 'Job not found or cannot be cancelled'
      });
    }
    
    if (mediaId) {
      // Cancel all jobs for a media file
      const jobs = await prisma.job.findMany({
        where: {
          status: { in: ['PENDING', 'PROCESSING'] },
          data: {
            contains: `"mediaFileId":"${mediaId}"`
          }
        },
        select: { id: true }
      });
      
      const cancelResults = await Promise.allSettled(
        jobs.map(job => queue.cancelJob(job.id))
      );
      
      const cancelledCount = cancelResults.filter(
        result => result.status === 'fulfilled' && result.value
      ).length;
      
      return NextResponse.json({
        mediaId,
        totalJobs: jobs.length,
        cancelledCount,
        message: `Cancelled ${cancelledCount} of ${jobs.length} jobs`
      });
    }
    
    return NextResponse.json(
      { error: 'jobId or mediaId parameter required' },
      { status: 400 }
    );
    
  } catch (error) {
    console.error('Error cancelling jobs:', error);
    return NextResponse.json(
      { 
        error: 'Failed to cancel jobs',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * Get output directory for operation type
 */
function getOutputDir(operation: string): string {
  switch (operation) {
    case 'thumbnail-generation':
      return path.join(MEDIA_DIR, 'thumbnails');
    case 'video-optimization':
      return path.join(MEDIA_DIR, 'optimized');
    case 'waveform-generation':
      return path.join(MEDIA_DIR, 'waveforms');
    case 'transcription-prep':
    case 'audio-extraction':
      return path.join(MEDIA_DIR, 'audio');
    default:
      return TEMP_DIR;
  }
}

/**
 * Get default options for operation type
 */
function getOperationOptions(
  operation: string, 
  userOptions: Record<string, any>
): Record<string, any> {
  const baseOptions = userOptions || {};
  
  switch (operation) {
    case 'thumbnail-generation':
      return {
        timestamp: 10,
        generateSprite: false,
        ...baseOptions
      };
    
    case 'video-optimization':
      return {
        quality: 'medium',
        maxWidth: 1920,
        maxHeight: 1080,
        ...baseOptions
      };
    
    case 'waveform-generation':
      return {
        width: 1000,
        height: 100,
        samples: 1000,
        ...baseOptions
      };
    
    case 'transcription-prep':
      return {
        sampleRate: 16000,
        channels: 1,
        format: 'wav',
        ...baseOptions
      };
    
    case 'audio-extraction':
      return {
        format: 'mp3',
        bitrate: '128k',
        ...baseOptions
      };
    
    default:
      return baseOptions;
  }
}
