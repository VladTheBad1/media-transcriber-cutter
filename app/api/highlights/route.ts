import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import HighlightGenerator, { HighlightCriteria, HighlightSuggestion } from '../../../lib/ai/highlight-generator';

const prisma = new PrismaClient();

// GET /api/highlights - List highlights for a media file
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mediaFileId = searchParams.get('mediaFileId');
    const transcriptId = searchParams.get('transcriptId');
    const status = searchParams.get('status');
    const type = searchParams.get('type');

    if (!mediaFileId && !transcriptId) {
      return NextResponse.json(
        { error: 'Either mediaFileId or transcriptId is required' },
        { status: 400 }
      );
    }

    const where: any = {};
    
    if (mediaFileId) {
      where.mediaFileId = mediaFileId;
    }
    
    if (transcriptId) {
      where.mediaFile = {
        transcripts: {
          some: { id: transcriptId }
        }
      };
    }

    if (status) {
      where.status = status;
    }

    // Filter by highlight type if requested
    if (type) {
      switch (type) {
        case 'social':
          where.duration = { lte: 60 }; // Social clips are typically short
          break;
        case 'long':
          where.duration = { gte: 300 }; // Long segments (5+ minutes)
          break;
        case 'high_confidence':
          where.confidence = { gte: 0.8 };
          break;
      }
    }

    const highlights = await prisma.highlight.findMany({
      where,
      orderBy: [
        { confidence: 'desc' },
        { engagement: 'desc' },
        { startTime: 'asc' }
      ],
      include: {
        mediaFile: {
          select: {
            id: true,
            filename: true,
            title: true,
            duration: true,
          }
        }
      }
    });

    return NextResponse.json({
      success: true,
      highlights: highlights.map(h => ({
        id: h.id,
        title: h.title,
        startTime: h.startTime,
        endTime: h.endTime,
        duration: h.duration,
        confidence: h.confidence,
        reason: h.reason,
        engagement: h.engagement || 0,
        sentiment: h.sentiment || 'neutral',
        keywords: h.keywords.split(',').filter(k => k.trim()),
        status: h.status,
        createdAt: h.createdAt,
        mediaFile: h.mediaFile,
      }))
    });

  } catch (error) {
    console.error('Error fetching highlights:', error);
    return NextResponse.json(
      { error: 'Failed to fetch highlights' },
      { status: 500 }
    );
  }
}

// POST /api/highlights - Generate highlights for a transcript
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { transcriptId, mediaFileId, criteria = {} } = body;

    if (!transcriptId && !mediaFileId) {
      return NextResponse.json(
        { error: 'Either transcriptId or mediaFileId is required' },
        { status: 400 }
      );
    }

    // Find transcript if only mediaFileId provided
    let targetTranscriptId = transcriptId;
    let targetMediaFileId = mediaFileId;

    if (!transcriptId && mediaFileId) {
      const transcript = await prisma.transcript.findFirst({
        where: { 
          mediaFileId,
          status: 'COMPLETED' 
        },
        orderBy: { createdAt: 'desc' }
      });

      if (!transcript) {
        return NextResponse.json(
          { error: 'No completed transcript found for media file' },
          { status: 404 }
        );
      }

      targetTranscriptId = transcript.id;
    }

    if (!mediaFileId && transcriptId) {
      const transcript = await prisma.transcript.findUnique({
        where: { id: transcriptId },
        include: { mediaFile: { select: { id: true } } }
      });

      if (!transcript) {
        return NextResponse.json(
          { error: 'Transcript not found' },
          { status: 404 }
        );
      }

      targetMediaFileId = transcript.mediaFile.id;
    }

    // Parse criteria
    const highlightCriteria: HighlightCriteria = {
      minConfidence: criteria.minConfidence || 0.7,
      maxSilenceDuration: criteria.maxSilenceDuration || 2.0,
      minSegmentDuration: criteria.minSegmentDuration || 5.0,
      maxSegmentDuration: criteria.maxSegmentDuration || 60.0,
      detectLaughter: criteria.detectLaughter !== false,
      detectApplause: criteria.detectApplause !== false,
      detectEmphasis: criteria.detectEmphasis !== false,
      detectTopicChanges: criteria.detectTopicChanges !== false,
      detectQuestions: criteria.detectQuestions !== false,
      speakerChangeWeight: criteria.speakerChangeWeight || 0.3,
      speakerDominanceThreshold: criteria.speakerDominanceThreshold || 0.8,
      enableSentimentAnalysis: criteria.enableSentimentAnalysis !== false,
      targetSentiments: criteria.targetSentiments || ['positive', 'excited', 'emphatic'],
      keywords: criteria.keywords || [],
      keywordWeight: criteria.keywordWeight || 0.4,
      highlightCount: criteria.highlightCount || 10,
      socialMediaLength: criteria.socialMediaLength || 30,
      chapterMinLength: criteria.chapterMinLength || 300,
    };

    console.log(`Generating highlights for transcript ${targetTranscriptId}`);

    // Initialize highlight generator
    const generator = new HighlightGenerator(highlightCriteria);

    // Generate highlights
    const suggestions = await generator.analyzeTranscript(targetTranscriptId!);

    // Save to database
    await generator.saveHighlights(targetMediaFileId!, suggestions);

    // Also generate chapters if requested
    let chapters = [];
    if (criteria.generateChapters !== false) {
      try {
        chapters = await generator.generateChapters(targetTranscriptId!);
      } catch (error) {
        console.warn('Chapter generation failed:', error);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Generated ${suggestions.length} highlight suggestions`,
      highlights: suggestions,
      chapters: chapters,
      criteria: highlightCriteria,
    });

  } catch (error) {
    console.error('Error generating highlights:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate highlights',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// PUT /api/highlights - Update highlight status or details
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { highlightId, status, title, startTime, endTime } = body;

    if (!highlightId) {
      return NextResponse.json(
        { error: 'highlightId is required' },
        { status: 400 }
      );
    }

    const updateData: any = {};
    
    if (status) {
      if (!['SUGGESTED', 'APPROVED', 'REJECTED', 'EXPORTED'].includes(status)) {
        return NextResponse.json(
          { error: 'Invalid status. Must be SUGGESTED, APPROVED, REJECTED, or EXPORTED' },
          { status: 400 }
        );
      }
      updateData.status = status;
    }

    if (title !== undefined) updateData.title = title;
    if (startTime !== undefined) {
      updateData.startTime = startTime;
      if (endTime !== undefined) {
        updateData.endTime = endTime;
        updateData.duration = endTime - startTime;
      }
    } else if (endTime !== undefined) {
      const highlight = await prisma.highlight.findUnique({
        where: { id: highlightId },
        select: { startTime: true }
      });
      if (highlight) {
        updateData.endTime = endTime;
        updateData.duration = endTime - highlight.startTime;
      }
    }

    const updatedHighlight = await prisma.highlight.update({
      where: { id: highlightId },
      data: updateData,
      include: {
        mediaFile: {
          select: {
            id: true,
            filename: true,
            title: true,
          }
        }
      }
    });

    return NextResponse.json({
      success: true,
      highlight: {
        id: updatedHighlight.id,
        title: updatedHighlight.title,
        startTime: updatedHighlight.startTime,
        endTime: updatedHighlight.endTime,
        duration: updatedHighlight.duration,
        confidence: updatedHighlight.confidence,
        reason: updatedHighlight.reason,
        engagement: updatedHighlight.engagement || 0,
        sentiment: updatedHighlight.sentiment || 'neutral',
        keywords: updatedHighlight.keywords.split(',').filter(k => k.trim()),
        status: updatedHighlight.status,
        createdAt: updatedHighlight.createdAt,
        mediaFile: updatedHighlight.mediaFile,
      }
    });

  } catch (error) {
    console.error('Error updating highlight:', error);
    return NextResponse.json(
      { error: 'Failed to update highlight' },
      { status: 500 }
    );
  }
}

// DELETE /api/highlights - Delete a highlight
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const highlightId = searchParams.get('highlightId');

    if (!highlightId) {
      return NextResponse.json(
        { error: 'highlightId is required' },
        { status: 400 }
      );
    }

    await prisma.highlight.delete({
      where: { id: highlightId }
    });

    return NextResponse.json({
      success: true,
      message: 'Highlight deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting highlight:', error);
    return NextResponse.json(
      { error: 'Failed to delete highlight' },
      { status: 500 }
    );
  }
}