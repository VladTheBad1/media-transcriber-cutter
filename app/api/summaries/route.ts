import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import SummaryGenerator, { SummaryOptions } from '../../../lib/ai/summary-generator';

const prisma = new PrismaClient();

// GET /api/summaries - List summaries for a transcript
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const transcriptId = searchParams.get('transcriptId');
    const mediaFileId = searchParams.get('mediaFileId');
    const type = searchParams.get('type');
    const length = searchParams.get('length');

    if (!transcriptId && !mediaFileId) {
      return NextResponse.json(
        { error: 'Either transcriptId or mediaFileId is required' },
        { status: 400 }
      );
    }

    const where: any = {};
    
    if (transcriptId) {
      where.transcriptId = transcriptId;
    }
    
    if (mediaFileId) {
      where.transcript = {
        mediaFileId
      };
    }

    if (type) {
      where.type = type;
    }

    if (length) {
      where.length = length;
    }

    const summaries = await prisma.summary.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        transcript: {
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
        }
      }
    });

    return NextResponse.json({
      success: true,
      summaries: summaries.map(s => ({
        id: s.id,
        type: s.type,
        length: s.length,
        content: s.content,
        confidence: s.confidence,
        model: s.model,
        createdAt: s.createdAt,
        transcript: {
          id: s.transcript.id,
          language: s.transcript.language,
          confidence: s.transcript.confidence,
          mediaFile: s.transcript.mediaFile,
        }
      }))
    });

  } catch (error) {
    console.error('Error fetching summaries:', error);
    return NextResponse.json(
      { error: 'Failed to fetch summaries' },
      { status: 500 }
    );
  }
}

// POST /api/summaries - Generate a summary for a transcript
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      transcriptId,
      mediaFileId,
      options = {}
    } = body;

    if (!transcriptId && !mediaFileId) {
      return NextResponse.json(
        { error: 'Either transcriptId or mediaFileId is required' },
        { status: 400 }
      );
    }

    // Find transcript if only mediaFileId provided
    let targetTranscriptId = transcriptId;

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

    // Validate transcript exists and is completed
    const transcript = await prisma.transcript.findUnique({
      where: { id: targetTranscriptId },
      include: { 
        mediaFile: { 
          select: { id: true, filename: true, title: true } 
        } 
      }
    });

    if (!transcript) {
      return NextResponse.json(
        { error: 'Transcript not found' },
        { status: 404 }
      );
    }

    if (transcript.status !== 'COMPLETED') {
      return NextResponse.json(
        { error: 'Transcript is not completed yet' },
        { status: 400 }
      );
    }

    // Parse summary options
    const summaryOptions: SummaryOptions = {
      type: options.type || 'detailed',
      length: options.length || 'medium',
      focus: options.focus || 'key_points',
      includeTimestamps: options.includeTimestamps || false,
      includeSpeakers: options.includeSpeakers || false,
      keywordFilter: options.keywordFilter || [],
      sentimentAnalysis: options.sentimentAnalysis !== false,
      extractQuotes: options.extractQuotes !== false,
      generateActionItems: options.generateActionItems !== false,
    };

    console.log(`Generating ${summaryOptions.type} summary for transcript ${targetTranscriptId}`);

    // Generate summary
    const generator = new SummaryGenerator(summaryOptions);
    const result = await generator.generateSummary(targetTranscriptId!);

    return NextResponse.json({
      success: true,
      message: `Generated ${summaryOptions.type} summary`,
      summary: result,
      mediaFile: {
        id: transcript.mediaFile.id,
        filename: transcript.mediaFile.filename,
        title: transcript.mediaFile.title,
      },
    });

  } catch (error) {
    console.error('Error generating summary:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate summary',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// PUT /api/summaries - Update an existing summary
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { summaryId, content, type, length } = body;

    if (!summaryId) {
      return NextResponse.json(
        { error: 'summaryId is required' },
        { status: 400 }
      );
    }

    const updateData: any = {};
    
    if (content !== undefined) updateData.content = content;
    if (type !== undefined) updateData.type = type;
    if (length !== undefined) updateData.length = length;

    const updatedSummary = await prisma.summary.update({
      where: { id: summaryId },
      data: updateData,
      include: {
        transcript: {
          include: {
            mediaFile: {
              select: { id: true, filename: true, title: true }
            }
          }
        }
      }
    });

    return NextResponse.json({
      success: true,
      summary: {
        id: updatedSummary.id,
        type: updatedSummary.type,
        length: updatedSummary.length,
        content: updatedSummary.content,
        confidence: updatedSummary.confidence,
        createdAt: updatedSummary.createdAt,
        transcript: {
          id: updatedSummary.transcript.id,
          language: updatedSummary.transcript.language,
          mediaFile: updatedSummary.transcript.mediaFile,
        }
      }
    });

  } catch (error) {
    console.error('Error updating summary:', error);
    return NextResponse.json(
      { error: 'Failed to update summary' },
      { status: 500 }
    );
  }
}

// DELETE /api/summaries - Delete a summary
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const summaryId = searchParams.get('summaryId');

    if (!summaryId) {
      return NextResponse.json(
        { error: 'summaryId is required' },
        { status: 400 }
      );
    }

    await prisma.summary.delete({
      where: { id: summaryId }
    });

    return NextResponse.json({
      success: true,
      message: 'Summary deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting summary:', error);
    return NextResponse.json(
      { error: 'Failed to delete summary' },
      { status: 500 }
    );
  }
}