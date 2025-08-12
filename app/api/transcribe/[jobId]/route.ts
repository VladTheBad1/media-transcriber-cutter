import { NextRequest, NextResponse } from 'next/server';
import { transcriptionQueue } from '@/lib/transcription';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// GET /api/transcribe/[jobId] - Get job status and result
export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const jobId = params.jobId;

    // Get job from queue
    const job = transcriptionQueue.getJob(jobId);
    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Get transcript data if completed
    let transcript = null;
    if (job.status === 'completed' && job.result?.transcriptId) {
      transcript = await prisma.transcript.findUnique({
        where: { id: job.result.transcriptId },
        include: {
          segments: {
            include: {
              speaker: true,
              words: true,
            },
            orderBy: { start: 'asc' },
          },
          speakers: true,
          summaries: true,
        },
      });
    }

    const response = {
      jobId: job.id,
      mediaFileId: job.mediaFileId,
      status: job.status,
      progress: job.progress,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      error: job.error,
      options: job.options,
      
      // Include transcript data if available
      result: transcript ? {
        transcriptId: transcript.id,
        language: transcript.language,
        confidence: transcript.confidence,
        engine: transcript.engine,
        modelVersion: transcript.modelVersion,
        diarizationEnabled: transcript.diarizationEnabled,
        processingTime: transcript.processingTime,
        
        segments: transcript.segments.map(segment => ({
          id: segment.id,
          start: segment.start,
          end: segment.end,
          text: segment.text,
          confidence: segment.confidence,
          speaker: segment.speaker ? {
            id: segment.speaker.id,
            label: segment.speaker.label,
            name: segment.speaker.name,
          } : null,
          words: segment.words.map(word => ({
            id: word.id,
            text: word.text,
            start: word.start,
            end: word.end,
            confidence: word.confidence,
          })),
        })),

        speakers: transcript.speakers.map(speaker => ({
          id: speaker.id,
          label: speaker.label,
          name: speaker.name,
          totalDuration: speaker.totalDuration,
          segmentCount: speaker.segmentCount,
          averageConfidence: speaker.averageConfidence,
        })),

        summaries: transcript.summaries.map(summary => ({
          id: summary.id,
          type: summary.type,
          length: summary.length,
          content: summary.content,
          confidence: summary.confidence,
          createdAt: summary.createdAt,
        })),
      } : job.result,
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Failed to get job status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/transcribe/[jobId] - Cancel job
export async function DELETE(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const jobId = params.jobId;

    const success = await transcriptionQueue.cancelJob(jobId, 'Cancelled by user');
    
    if (!success) {
      return NextResponse.json(
        { error: 'Job not found or cannot be cancelled' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: 'Job cancelled successfully',
      jobId,
    });

  } catch (error) {
    console.error('Failed to cancel job:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH /api/transcribe/[jobId] - Retry failed job
export async function PATCH(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const jobId = params.jobId;

    const job = transcriptionQueue.getJob(jobId);
    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    if (job.status !== 'failed') {
      return NextResponse.json(
        { error: 'Only failed jobs can be retried' },
        { status: 400 }
      );
    }

    // Create new job with same parameters
    const newJobId = await transcriptionQueue.addJob(
      job.mediaFileId,
      job.audioPath,
      job.options,
      job.priority
    );

    return NextResponse.json({
      message: 'Job retry queued successfully',
      originalJobId: jobId,
      newJobId,
    });

  } catch (error) {
    console.error('Failed to retry job:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}