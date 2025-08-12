import { NextRequest, NextResponse } from 'next/server';
import { getExportQueue } from '@/lib/export';

/**
 * GET /api/export/queue
 * Get queue status and job list
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');

    const queue = getExportQueue();
    
    // Get queue statistics
    const stats = queue.getStats();
    
    // Get job list with optional filtering
    const jobs = await queue.getJobs({
      status: status as any,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined
    });

    // Format jobs for API response
    const formattedJobs = jobs.map(job => ({
      id: job.id,
      mediaFileId: job.mediaFileId,
      timelineId: job.timelineId,
      highlightId: job.highlightId,
      preset: job.preset ? {
        id: job.preset.id,
        name: job.preset.name,
        platform: job.preset.platform,
        format: job.preset.video?.format || job.preset.audio?.codec
      } : null,
      output: {
        filename: job.output.filename,
        directory: job.output.directory
      },
      status: job.status,
      progress: job.progress,
      priority: job.options.priority,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      error: job.error,
      result: job.result ? {
        outputPath: job.result.outputPath,
        fileSize: job.result.fileSize,
        duration: job.result.duration
      } : null
    }));

    return NextResponse.json({
      success: true,
      queue: {
        stats,
        jobs: formattedJobs,
        total: formattedJobs.length
      }
    });

  } catch (error) {
    console.error('Error getting export queue:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to get export queue',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/export/queue
 * Queue management actions (pause, resume, clear)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, priority } = body;

    if (!action) {
      return NextResponse.json(
        { success: false, error: 'Action is required' },
        { status: 400 }
      );
    }

    const queue = getExportQueue();
    let message = '';

    switch (action) {
      case 'pause':
        queue.pauseQueue();
        message = 'Queue paused successfully';
        break;

      case 'resume':
        queue.resumeQueue();
        message = 'Queue resumed successfully';
        break;

      case 'clear':
        await queue.clearQueue();
        message = 'Queue cleared successfully';
        break;

      case 'stats':
        // Just return current stats
        const stats = queue.getStats();
        return NextResponse.json({
          success: true,
          stats
        });

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }

    // Get updated stats
    const updatedStats = queue.getStats();

    return NextResponse.json({
      success: true,
      message,
      stats: updatedStats
    });

  } catch (error) {
    console.error('Error managing export queue:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to manage export queue',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/export/queue
 * Clear all jobs from queue
 */
export async function DELETE(request: NextRequest) {
  try {
    const queue = getExportQueue();
    await queue.clearQueue();
    
    const stats = queue.getStats();

    return NextResponse.json({
      success: true,
      message: 'Export queue cleared successfully',
      stats
    });

  } catch (error) {
    console.error('Error clearing export queue:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to clear export queue',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}