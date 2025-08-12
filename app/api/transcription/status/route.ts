import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const transcriptId = searchParams.get('transcriptId');

    if (!transcriptId) {
      return NextResponse.json(
        { error: 'Transcript ID is required' },
        { status: 400 }
      );
    }

    // Get transcript status
    const transcript = await prisma.transcript.findUnique({
      where: { id: transcriptId },
      select: {
        id: true,
        status: true,
        confidence: true,
        language: true,
        processingTime: true,
        error: true,
        createdAt: true,
        completedAt: true,
        segments: {
          select: {
            id: true
          }
        },
        speakers: {
          select: {
            id: true,
            label: true,
            segmentCount: true
          }
        }
      }
    });

    if (!transcript) {
      return NextResponse.json(
        { error: 'Transcript not found' },
        { status: 404 }
      );
    }

    // Calculate progress based on status and time elapsed
    let progress = 0;
    let message = '';
    let estimatedTimeRemaining = null;

    const startTime = transcript.createdAt.getTime();
    const currentTime = Date.now();
    const elapsedSeconds = Math.floor((currentTime - startTime) / 1000);

    switch (transcript.status) {
      case 'PENDING':
        progress = 0;
        message = 'Waiting to start transcription...';
        break;
      case 'PROCESSING':
        // Estimate progress based on elapsed time
        // Assume ~5 seconds per second of audio for base model on CPU
        const estimatedTotalSeconds = 300; // Estimate 5 minutes for average file
        progress = Math.min(95, Math.floor((elapsedSeconds / estimatedTotalSeconds) * 100));
        
        // Update message based on progress
        if (progress < 10) {
          message = 'Loading WhisperX model...';
        } else if (progress < 30) {
          message = 'Processing audio file...';
        } else if (progress < 70) {
          message = 'Transcribing speech...';
        } else if (progress < 90) {
          message = 'Finalizing transcript...';
        } else {
          message = 'Almost done...';
        }
        
        estimatedTimeRemaining = Math.max(0, estimatedTotalSeconds - elapsedSeconds);
        break;
      case 'COMPLETED':
        progress = 100;
        message = 'Transcription completed successfully';
        estimatedTimeRemaining = 0;
        break;
      case 'FAILED':
        progress = 0;
        message = transcript.error || 'Transcription failed';
        break;
    }

    return NextResponse.json({
      id: transcript.id,
      status: transcript.status,
      progress,
      message,
      estimatedTimeRemaining,
      elapsedSeconds,
      confidence: transcript.confidence,
      language: transcript.language,
      processingTime: transcript.processingTime,
      segmentCount: transcript.segments.length,
      speakerCount: transcript.speakers.length,
      createdAt: transcript.createdAt,
      completedAt: transcript.completedAt,
      error: transcript.error
    });

  } catch (error) {
    console.error('Failed to get transcript status:', error);
    return NextResponse.json(
      { error: 'Failed to get transcript status' },
      { status: 500 }
    );
  }
}