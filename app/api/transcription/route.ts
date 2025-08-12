import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { WhisperXTranscriber } from '@/lib/transcription/whisperx';
import path from 'path';

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mediaFileId, options = {} } = body;

    if (!mediaFileId) {
      return NextResponse.json(
        { error: 'Media file ID is required' },
        { status: 400 }
      );
    }

    // Get media file from database
    const mediaFile = await prisma.mediaFile.findUnique({
      where: { id: mediaFileId }
    });

    if (!mediaFile) {
      return NextResponse.json(
        { error: 'Media file not found' },
        { status: 404 }
      );
    }

    // Check if transcription already exists and is processing
    const existingTranscript = await prisma.transcript.findFirst({
      where: {
        mediaFileId,
        status: 'PROCESSING'
      }
    });

    if (existingTranscript) {
      return NextResponse.json(
        { error: 'Transcription already in progress', transcriptId: existingTranscript.id },
        { status: 409 }
      );
    }

    // Initialize WhisperX transcriber
    const transcriber = new WhisperXTranscriber({
      pythonPath: process.env.PYTHON_PATH || '/Users/vp/SAZ Projects/transcriber-cutter/venv_whisperx/bin/python',
      whisperxScript: path.join(process.cwd(), 'scripts', 'whisperx_service.py'),
      tempDir: path.join(process.cwd(), 'temp', 'whisperx')
    });

    // Initialize the service
    await transcriber.initialize();

    // Start transcription
    console.log(`Starting transcription for media file ${mediaFileId}`);
    
    const result = await transcriber.transcribe(
      mediaFile.filePath,
      mediaFileId,
      {
        language: options.language || 'auto',
        enableDiarization: options.enableDiarization ?? true,
        model: options.model || 'large-v2',
        device: options.device || 'auto',
        maxSpeakers: options.maxSpeakers || 10,
      }
    );

    return NextResponse.json({
      success: true,
      transcriptId: result.transcriptId,
      language: result.language,
      confidence: result.confidence,
      processingTime: result.processingTime,
      segmentCount: result.segments.length,
      speakerCount: result.speakers?.length || 0,
      diarizationEnabled: result.diarizationEnabled,
    });

  } catch (error) {
    console.error('Transcription API error:', error);
    return NextResponse.json(
      { 
        error: 'Transcription failed', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mediaFileId = searchParams.get('mediaFileId');
    const transcriptId = searchParams.get('transcriptId');

    if (transcriptId) {
      // Get specific transcript with all details
      const transcript = await prisma.transcript.findUnique({
        where: { id: transcriptId },
        include: {
          segments: {
            include: {
              speaker: true,
              words: true,
            },
            orderBy: { start: 'asc' }
          },
          speakers: {
            orderBy: { segmentCount: 'desc' }
          },
          mediaFile: {
            select: {
              id: true,
              filename: true,
              originalName: true,
              type: true,
              duration: true,
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

      return NextResponse.json({ transcript });

    } else if (mediaFileId) {
      // Get all transcripts for a media file
      const transcripts = await prisma.transcript.findMany({
        where: { mediaFileId },
        include: {
          speakers: {
            select: {
              id: true,
              label: true,
              segmentCount: true,
            }
          }
        },
        orderBy: { id: 'desc' }
      });

      return NextResponse.json({ transcripts });

    } else {
      // Get all transcripts
      const transcripts = await prisma.transcript.findMany({
        include: {
          mediaFile: {
            select: {
              id: true,
              filename: true,
              originalName: true,
            }
          },
          speakers: {
            select: {
              id: true,
              label: true,
              segmentCount: true,
            }
          }
        },
        orderBy: { id: 'desc' },
        take: 50 // Limit to recent 50
      });

      return NextResponse.json({ transcripts });
    }

  } catch (error) {
    console.error('Failed to fetch transcripts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transcripts' },
      { status: 500 }
    );
  }
}

// Delete a transcript
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const transcriptId = searchParams.get('transcriptId');

    if (!transcriptId) {
      return NextResponse.json(
        { error: 'Transcript ID is required' },
        { status: 400 }
      );
    }

    // Delete transcript and all related data (cascade)
    await prisma.transcript.delete({
      where: { id: transcriptId }
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Transcript deleted successfully' 
    });

  } catch (error) {
    console.error('Failed to delete transcript:', error);
    return NextResponse.json(
      { error: 'Failed to delete transcript' },
      { status: 500 }
    );
  }
}