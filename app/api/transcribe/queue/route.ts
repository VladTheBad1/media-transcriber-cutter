import { NextRequest, NextResponse } from 'next/server';
import { transcriptionQueue, transcriptionService } from '@/lib/transcription';

// GET /api/transcribe/queue - Get queue statistics and status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mediaFileId = searchParams.get('mediaFileId');

    // Get queue statistics
    const queueStats = transcriptionQueue.getStats();
    
    // Get transcription service status
    const serviceStatus = transcriptionService.getStatus();

    // Get jobs for specific media file if requested
    let jobs = null;
    if (mediaFileId) {
      jobs = transcriptionQueue.getJobsForMedia(mediaFileId).map(job => ({
        id: job.id,
        mediaFileId: job.mediaFileId,
        status: job.status,
        progress: job.progress,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        priority: job.priority,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        error: job.error,
        options: job.options,
      }));
    }

    return NextResponse.json({
      queue: {
        ...queueStats,
        status: queueStats.activeJobs > 0 ? 'processing' : 'idle',
      },
      service: {
        ...serviceStatus,
        status: serviceStatus.whisperxAvailable || serviceStatus.openaiAvailable ? 'ready' : 'unavailable',
      },
      jobs,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Failed to get queue status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/transcribe/queue - Queue management operations
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'cleanup':
        // Clean up old completed jobs
        const maxAge = body.maxAge || 24 * 60 * 60 * 1000; // 24 hours default
        const cleaned = transcriptionService.cleanupJobs(maxAge);
        
        return NextResponse.json({
          message: `Cleaned up ${cleaned} old jobs`,
          cleaned,
        });

      case 'pause':
        // Pause queue processing (implementation depends on your needs)
        return NextResponse.json({
          message: 'Queue pause not implemented',
        }, { status: 501 });

      case 'resume':
        // Resume queue processing (implementation depends on your needs)
        return NextResponse.json({
          message: 'Queue resume not implemented',
        }, { status: 501 });

      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('Queue management operation failed:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}