import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import path from 'path';

const prisma = new PrismaClient();

// Request validation schema
const TranscribeRequestSchema = z.object({
  mediaFileId: z.string().cuid(),
  options: z.object({
    language: z.string().optional(),
    enableDiarization: z.boolean().optional(),
    maxSpeakers: z.number().min(1).max(20).optional(),
    model: z.enum(['tiny', 'base', 'small', 'medium', 'large', 'large-v2', 'large-v3']).optional(),
    device: z.enum(['cpu', 'cuda', 'auto']).optional(),
  }).optional(),
  priority: z.number().min(0).max(10).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mediaFileId, options = {}, priority = 0 } = TranscribeRequestSchema.parse(body);

    console.log(`Starting transcription for media file: ${mediaFileId}`);

    // Validate media file exists
    const mediaFile = await prisma.mediaFile.findUnique({
      where: { id: mediaFileId },
      include: {
        transcripts: {
          where: { status: { in: ['PROCESSING', 'COMPLETED'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!mediaFile) {
      return NextResponse.json(
        { error: 'Media file not found' },
        { status: 404 }
      );
    }

    // Check if transcription is already in progress or completed
    if (mediaFile.transcripts.length > 0) {
      const existingTranscript = mediaFile.transcripts[0];
      if (existingTranscript.status === 'PROCESSING') {
        return NextResponse.json(
          { 
            error: 'Transcription already in progress',
            transcriptId: existingTranscript.id,
            status: existingTranscript.status,
          },
          { status: 409 }
        );
      }
      if (existingTranscript.status === 'COMPLETED') {
        return NextResponse.json(
          {
            message: 'Transcription already completed',
            transcriptId: existingTranscript.id,
            status: existingTranscript.status,
          },
          { status: 200 }
        );
      }
    }

    // Extract audio from media file if needed - use server-side FFmpeg directly
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    let audioPath = mediaFile.filePath;

    // If it's a video file, extract audio optimized for transcription
    if (mediaFile.type === 'video') {
      console.log(`Extracting audio from video: ${mediaFile.filename}`);
      
      // Use FFmpeg directly to extract audio
      const outputPath = path.join('temp', `${mediaFileId}_audio.wav`);
      try {
        // Create temp directory if it doesn't exist
        await execAsync('mkdir -p temp');
        
        // Extract audio as WAV for WhisperX
        const command = `ffmpeg -i "${mediaFile.filePath}" -vn -acodec pcm_s16le -ac 1 -ar 16000 "${outputPath}" -y`;
        await execAsync(command);
        
        audioPath = outputPath;
        console.log(`Audio extracted to: ${audioPath}`);
      } catch (error) {
        console.error('Failed to extract audio:', error);
        return NextResponse.json(
          { error: 'Failed to extract audio for transcription' },
          { status: 500 }
        );
      }
    }

    // Queue transcription job
    const { transcriptionQueue } = await import('@/lib/transcription');
    const jobId = await transcriptionQueue.addJob(
      mediaFileId,
      audioPath,
      {
        language: options.language || 'auto',
        enableDiarization: options.enableDiarization ?? true,
        maxSpeakers: options.maxSpeakers || 10,
        model: options.model || 'large-v2',
        device: options.device || 'auto',
      },
      priority
    );

    console.log(`Transcription job queued: ${jobId} for media ${mediaFileId}`);

    return NextResponse.json({
      message: 'Transcription started successfully',
      jobId,
      mediaFileId,
      status: 'queued',
      options,
    }, { status: 202 });

  } catch (error) {
    console.error('Transcription request failed:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Invalid request data',
          details: error.errors,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mediaFileId = searchParams.get('mediaFileId');

    if (!mediaFileId) {
      return NextResponse.json(
        { error: 'mediaFileId parameter is required' },
        { status: 400 }
      );
    }

    // Get transcripts for the media file
    const transcripts = await prisma.transcript.findMany({
      where: { mediaFileId },
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
      orderBy: { createdAt: 'desc' },
    });

    if (transcripts.length === 0) {
      return NextResponse.json(
        { error: 'No transcripts found for this media file' },
        { status: 404 }
      );
    }

    // Also get job status from queue
    const { transcriptionQueue } = await import('@/lib/transcription');
    const queueJobs = transcriptionQueue.getJobsForMedia(mediaFileId);

    // Format response
    const response = transcripts.map(transcript => ({
      id: transcript.id,
      mediaFileId: transcript.mediaFileId,
      language: transcript.language,
      confidence: transcript.confidence,
      status: transcript.status,
      engine: transcript.engine,
      modelVersion: transcript.modelVersion,
      diarizationEnabled: transcript.diarizationEnabled,
      maxSpeakers: transcript.maxSpeakers,
      processingTime: transcript.processingTime,
      createdAt: transcript.createdAt,
      completedAt: transcript.completedAt,
      error: transcript.error,
      
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
      
      // Include queue job info if available
      queueJob: queueJobs.length > 0 ? {
        id: queueJobs[0].id,
        status: queueJobs[0].status,
        progress: queueJobs[0].progress,
        attempts: queueJobs[0].attempts,
        error: queueJobs[0].error,
      } : null,
    }));

    return NextResponse.json(response);

  } catch (error) {
    console.error('Failed to get transcription status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}