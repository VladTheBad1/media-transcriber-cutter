import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { transcriptionUtils } from '@/lib/transcription';
import { z } from 'zod';

const prisma = new PrismaClient();

// Export format validation
const ExportFormatSchema = z.enum(['srt', 'vtt', 'txt', 'json']);
const ExportOptionsSchema = z.object({
  format: ExportFormatSchema,
  includeSpeakers: z.boolean().optional(),
  includeTimestamps: z.boolean().optional(),
  includeWordTimestamps: z.boolean().optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  speakerFilter: z.string().optional(),
  startTime: z.number().min(0).optional(),
  endTime: z.number().min(0).optional(),
});

// GET /api/transcribe/export/[transcriptId]?format=srt&includeSpeakers=true
export async function GET(
  request: NextRequest,
  { params }: { params: { transcriptId: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const transcriptId = params.transcriptId;
    
    // Parse export options
    const options = {
      format: (searchParams.get('format') || 'srt') as z.infer<typeof ExportFormatSchema>,
      includeSpeakers: searchParams.get('includeSpeakers') === 'true',
      includeTimestamps: searchParams.get('includeTimestamps') === 'true',
      includeWordTimestamps: searchParams.get('includeWordTimestamps') === 'true',
      minConfidence: searchParams.get('minConfidence') ? parseFloat(searchParams.get('minConfidence')!) : undefined,
      speakerFilter: searchParams.get('speakerFilter') || undefined,
      startTime: searchParams.get('startTime') ? parseFloat(searchParams.get('startTime')!) : undefined,
      endTime: searchParams.get('endTime') ? parseFloat(searchParams.get('endTime')!) : undefined,
    };

    // Validate options
    ExportOptionsSchema.parse(options);

    // Get transcript with segments and speakers
    const transcript = await prisma.transcript.findUnique({
      where: { id: transcriptId },
      include: {
        mediaFile: true,
        segments: {
          include: {
            speaker: true,
            words: options.includeWordTimestamps,
          },
          orderBy: { start: 'asc' },
        },
        speakers: true,
      },
    });

    if (!transcript) {
      return NextResponse.json(
        { error: 'Transcript not found' },
        { status: 404 }
      );
    }

    if (transcript.status !== 'COMPLETED') {
      return NextResponse.json(
        { error: 'Transcript is not completed' },
        { status: 400 }
      );
    }

    // Convert segments to the format expected by utils
    let segments = transcript.segments.map(segment => ({
      start: segment.start,
      end: segment.end,
      text: segment.text,
      confidence: segment.confidence,
      speaker: segment.speaker ? {
        id: segment.speaker.id,
        label: segment.speaker.label,
        name: segment.speaker.name,
        totalDuration: segment.speaker.totalDuration,
        segmentCount: segment.speaker.segmentCount,
        averageConfidence: segment.speaker.averageConfidence,
      } : undefined,
      words: segment.words?.map(word => ({
        word: word.text,
        start: word.start,
        end: word.end,
        confidence: word.confidence,
      })),
    }));

    // Apply filters
    if (options.minConfidence !== undefined) {
      segments = transcriptionUtils.filterByConfidence(segments, options.minConfidence);
    }

    if (options.speakerFilter) {
      segments = transcriptionUtils.filterBySpeaker(segments, options.speakerFilter);
    }

    if (options.startTime !== undefined || options.endTime !== undefined) {
      segments = transcriptionUtils.getSegmentsInRange(
        segments,
        options.startTime || 0,
        options.endTime || Infinity
      );
    }

    // Generate export content based on format
    let content: string;
    let contentType: string;
    let filename: string;

    const baseFilename = transcript.mediaFile?.filename || 'transcript';

    switch (options.format) {
      case 'srt':
        content = transcriptionUtils.toSRT(segments);
        contentType = 'application/x-subrip';
        filename = `${baseFilename}.srt`;
        break;

      case 'vtt':
        content = transcriptionUtils.toVTT(segments);
        contentType = 'text/vtt';
        filename = `${baseFilename}.vtt`;
        break;

      case 'txt':
        content = transcriptionUtils.toPlainText(
          segments,
          options.includeSpeakers,
          options.includeTimestamps
        );
        contentType = 'text/plain';
        filename = `${baseFilename}.txt`;
        break;

      case 'json':
        const jsonData = {
          transcript: {
            id: transcript.id,
            mediaFileId: transcript.mediaFileId,
            language: transcript.language,
            confidence: transcript.confidence,
            engine: transcript.engine,
            modelVersion: transcript.modelVersion,
            diarizationEnabled: transcript.diarizationEnabled,
            processingTime: transcript.processingTime,
            createdAt: transcript.createdAt,
            completedAt: transcript.completedAt,
          },
          segments,
          speakers: transcript.speakers.map(speaker => ({
            id: speaker.id,
            label: speaker.label,
            name: speaker.name,
            totalDuration: speaker.totalDuration,
            segmentCount: speaker.segmentCount,
            averageConfidence: speaker.averageConfidence,
          })),
          statistics: transcriptionUtils.getStats(segments),
          exportOptions: options,
          exportedAt: new Date().toISOString(),
        };
        content = JSON.stringify(jsonData, null, 2);
        contentType = 'application/json';
        filename = `${baseFilename}.json`;
        break;
    }

    // Return file download response
    return new Response(content, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache',
      },
    });

  } catch (error) {
    console.error('Export failed:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Invalid export options',
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

// POST /api/transcribe/export/[transcriptId] - Generate export with custom options
export async function POST(
  request: NextRequest,
  { params }: { params: { transcriptId: string } }
) {
  try {
    const transcriptId = params.transcriptId;
    const body = await request.json();
    const options = ExportOptionsSchema.parse(body);

    // Get transcript with segments and speakers
    const transcript = await prisma.transcript.findUnique({
      where: { id: transcriptId },
      include: {
        mediaFile: true,
        segments: {
          include: {
            speaker: true,
            words: options.includeWordTimestamps,
          },
          orderBy: { start: 'asc' },
        },
        speakers: true,
      },
    });

    if (!transcript) {
      return NextResponse.json(
        { error: 'Transcript not found' },
        { status: 404 }
      );
    }

    if (transcript.status !== 'COMPLETED') {
      return NextResponse.json(
        { error: 'Transcript is not completed' },
        { status: 400 }
      );
    }

    // Convert segments to the format expected by utils
    let segments = transcript.segments.map(segment => ({
      start: segment.start,
      end: segment.end,
      text: segment.text,
      confidence: segment.confidence,
      speaker: segment.speaker ? {
        id: segment.speaker.id,
        label: segment.speaker.label,
        name: segment.speaker.name,
        totalDuration: segment.speaker.totalDuration,
        segmentCount: segment.speaker.segmentCount,
        averageConfidence: segment.speaker.averageConfidence,
      } : undefined,
      words: segment.words?.map(word => ({
        word: word.text,
        start: word.start,
        end: word.end,
        confidence: word.confidence,
      })),
    }));

    // Apply filters
    if (options.minConfidence !== undefined) {
      segments = transcriptionUtils.filterByConfidence(segments, options.minConfidence);
    }

    if (options.speakerFilter) {
      segments = transcriptionUtils.filterBySpeaker(segments, options.speakerFilter);
    }

    if (options.startTime !== undefined || options.endTime !== undefined) {
      segments = transcriptionUtils.getSegmentsInRange(
        segments,
        options.startTime || 0,
        options.endTime || Infinity
      );
    }

    // Generate export content based on format
    let content: string;

    switch (options.format) {
      case 'srt':
        content = transcriptionUtils.toSRT(segments);
        break;

      case 'vtt':
        content = transcriptionUtils.toVTT(segments);
        break;

      case 'txt':
        content = transcriptionUtils.toPlainText(
          segments,
          options.includeSpeakers,
          options.includeTimestamps
        );
        break;

      case 'json':
        const jsonData = {
          transcript: {
            id: transcript.id,
            mediaFileId: transcript.mediaFileId,
            language: transcript.language,
            confidence: transcript.confidence,
            engine: transcript.engine,
            modelVersion: transcript.modelVersion,
            diarizationEnabled: transcript.diarizationEnabled,
            processingTime: transcript.processingTime,
            createdAt: transcript.createdAt,
            completedAt: transcript.completedAt,
          },
          segments,
          speakers: transcript.speakers.map(speaker => ({
            id: speaker.id,
            label: speaker.label,
            name: speaker.name,
            totalDuration: speaker.totalDuration,
            segmentCount: speaker.segmentCount,
            averageConfidence: speaker.averageConfidence,
          })),
          statistics: transcriptionUtils.getStats(segments),
          exportOptions: options,
          exportedAt: new Date().toISOString(),
        };
        content = JSON.stringify(jsonData, null, 2);
        break;
    }

    // Return content as JSON response (for preview)
    return NextResponse.json({
      content,
      format: options.format,
      segmentCount: segments.length,
      statistics: transcriptionUtils.getStats(segments),
      options,
    });

  } catch (error) {
    console.error('Export generation failed:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Invalid export options',
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