import { NextRequest, NextResponse } from 'next/server';
import { transcriptionQueue } from '@/lib/transcription';

// Server-Sent Events endpoint for real-time transcription progress
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mediaFileId = searchParams.get('mediaFileId');
  const jobId = searchParams.get('jobId');

  if (!mediaFileId && !jobId) {
    return NextResponse.json(
      { error: 'Either mediaFileId or jobId parameter is required' },
      { status: 400 }
    );
  }

  // Create Server-Sent Events response
  const encoder = new TextEncoder();
  let intervalId: NodeJS.Timeout | null = null;
  
  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection message
      const data = encoder.encode(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);
      controller.enqueue(data);

      // Set up event listeners for transcription progress
      const handleProgress = (progress: any) => {
        if (mediaFileId && progress.mediaFileId === mediaFileId) {
          const data = encoder.encode(`data: ${JSON.stringify({ type: 'progress', ...progress })}\n\n`);
          controller.enqueue(data);
        } else if (jobId && progress.jobId === jobId) {
          const data = encoder.encode(`data: ${JSON.stringify({ type: 'progress', ...progress })}\n\n`);
          controller.enqueue(data);
        }
      };

      const handleJobCompleted = (event: any) => {
        if (mediaFileId && event.mediaFileId === mediaFileId) {
          const data = encoder.encode(`data: ${JSON.stringify({ type: 'completed', ...event })}\n\n`);
          controller.enqueue(data);
        }
      };

      const handleJobFailed = (event: any) => {
        if (mediaFileId && event.mediaFileId === mediaFileId) {
          const data = encoder.encode(`data: ${JSON.stringify({ type: 'failed', ...event })}\n\n`);
          controller.enqueue(data);
        }
      };

      const handleJobCancelled = (event: any) => {
        if (mediaFileId && event.mediaFileId === mediaFileId) {
          const data = encoder.encode(`data: ${JSON.stringify({ type: 'cancelled', ...event })}\n\n`);
          controller.enqueue(data);
        }
      };

      // Attach event listeners
      transcriptionQueue.on('job-progress', handleProgress);
      transcriptionQueue.on('job-completed', handleJobCompleted);
      transcriptionQueue.on('job-failed', handleJobFailed);
      transcriptionQueue.on('job-cancelled', handleJobCancelled);

      // Send periodic heartbeat and status updates
      intervalId = setInterval(() => {
        const heartbeat = encoder.encode(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: new Date().toISOString() })}\n\n`);
        controller.enqueue(heartbeat);

        // Send current job status if specific job is being tracked
        if (jobId) {
          const job = transcriptionQueue.getJob(jobId);
          if (job) {
            const statusUpdate = encoder.encode(`data: ${JSON.stringify({ 
              type: 'status', 
              jobId: job.id,
              status: job.status,
              progress: job.progress,
              timestamp: new Date().toISOString()
            })}\n\n`);
            controller.enqueue(statusUpdate);
          }
        }
      }, 5000); // Heartbeat every 5 seconds

      // Clean up function
      const cleanup = () => {
        transcriptionQueue.removeListener('job-progress', handleProgress);
        transcriptionQueue.removeListener('job-completed', handleJobCompleted);
        transcriptionQueue.removeListener('job-failed', handleJobFailed);
        transcriptionQueue.removeListener('job-cancelled', handleJobCancelled);
        
        if (intervalId) {
          clearInterval(intervalId);
        }
      };

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        cleanup();
        controller.close();
      });
    },

    cancel() {
      if (intervalId) {
        clearInterval(intervalId);
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}