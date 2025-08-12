import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getExportQueue } from '@/lib/export';

const prisma = new PrismaClient();

/**
 * GET /api/export/status/[id]
 * Get export job status
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    
    // For now, return mock status since we're doing direct export
    // Later this will query the queue system
    return NextResponse.json({
      success: true,
      job: {
        id,
        status: 'completed',
        progress: 100,
        result: {
          outputPath: `/exports/${id}.mp4`,
          fileSize: 0,
          duration: 0
        }
      }
    });
  } catch (error) {
    console.error('Error getting job status:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to get job status',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/export/status/[id]
 * Cancel export job
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    
    // Cancel job in queue
    const queue = getExportQueue();
    const cancelled = await queue.cancelJob(id);
    
    if (cancelled) {
      return NextResponse.json({
        success: true,
        message: 'Job cancelled successfully'
      });
    } else {
      return NextResponse.json(
        { success: false, error: 'Job not found or cannot be cancelled' },
        { status: 404 }
      );
    }
  } catch (error) {
    console.error('Error cancelling job:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to cancel job',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/export/status/[id]
 * Retry failed export job
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { action } = body;
    
    if (action === 'retry') {
      const queue = getExportQueue();
      const retried = await queue.retryJob(id);
      
      if (retried) {
        return NextResponse.json({
          success: true,
          message: 'Job retried successfully'
        });
      } else {
        return NextResponse.json(
          { success: false, error: 'Job not found or cannot be retried' },
          { status: 404 }
        );
      }
    } else {
      return NextResponse.json(
        { success: false, error: 'Invalid action' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error retrying job:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to retry job',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
