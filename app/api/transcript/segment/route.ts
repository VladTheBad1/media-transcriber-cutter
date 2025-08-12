import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Update a transcript segment
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { segmentId, text } = body;

    if (!segmentId || !text) {
      return NextResponse.json(
        { error: 'Segment ID and text are required' },
        { status: 400 }
      );
    }

    // Update the segment text
    const updatedSegment = await prisma.transcriptSegment.update({
      where: { id: segmentId },
      data: { 
        text: text.trim(),
        // Optionally update confidence to indicate manual edit
        confidence: 1.0
      },
      include: {
        speaker: true,
        words: true
      }
    });

    return NextResponse.json({
      success: true,
      segment: updatedSegment
    });

  } catch (error) {
    console.error('Failed to update transcript segment:', error);
    return NextResponse.json(
      { error: 'Failed to update transcript segment' },
      { status: 500 }
    );
  }
}

// Get a specific segment
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const segmentId = searchParams.get('segmentId');

    if (!segmentId) {
      return NextResponse.json(
        { error: 'Segment ID is required' },
        { status: 400 }
      );
    }

    const segment = await prisma.transcriptSegment.findUnique({
      where: { id: segmentId },
      include: {
        speaker: true,
        words: true
      }
    });

    if (!segment) {
      return NextResponse.json(
        { error: 'Segment not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ segment });

  } catch (error) {
    console.error('Failed to fetch segment:', error);
    return NextResponse.json(
      { error: 'Failed to fetch segment' },
      { status: 500 }
    );
  }
}