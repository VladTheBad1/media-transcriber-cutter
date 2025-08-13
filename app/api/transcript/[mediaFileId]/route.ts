import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(
  request: NextRequest,
  { params }: { params: { mediaFileId: string } }
) {
  try {
    const { mediaFileId } = params;

    // Get the most recent transcript for this media file
    const transcript = await prisma.transcript.findFirst({
      where: {
        mediaFileId,
        status: 'COMPLETED'
      },
      orderBy: {
        completedAt: 'desc'
      },
      include: {
        segments: {
          orderBy: {
            start: 'asc'
          },
          include: {
            speaker: true,
            words: {
              orderBy: {
                start: 'asc'
              }
            }
          }
        },
        speakers: true
      }
    });

    if (!transcript) {
      return NextResponse.json(
        { error: 'No transcript found for this media file' },
        { status: 404 }
      );
    }

    // Format the response
    const formattedTranscript = {
      id: transcript.id,
      mediaFileId: transcript.mediaFileId,
      language: transcript.language,
      confidence: transcript.confidence,
      status: transcript.status,
      segments: transcript.segments.map(segment => ({
        id: segment.id,
        start: segment.start,
        end: segment.end,
        text: segment.text,
        confidence: segment.confidence,
        speaker: segment.speaker ? {
          id: segment.speaker.id,
          label: segment.speaker.label,
          name: segment.speaker.name
        } : undefined,
        words: segment.words.map(word => ({
          id: word.id,
          text: word.text,
          start: word.start,
          end: word.end,
          confidence: word.confidence
        }))
      })),
      speakers: transcript.speakers.map(speaker => ({
        id: speaker.id,
        label: speaker.label,
        name: speaker.name,
        totalDuration: speaker.totalDuration,
        segmentCount: speaker.segmentCount,
        averageConfidence: speaker.averageConfidence
      }))
    };

    return NextResponse.json({
      transcript: formattedTranscript
    });

  } catch (error) {
    console.error('Failed to fetch transcript:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transcript' },
      { status: 500 }
    );
  }
}