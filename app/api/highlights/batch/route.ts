import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import HighlightGenerator, { HighlightCriteria } from '../../../../lib/ai/highlight-generator';

const prisma = new PrismaClient();

interface BatchRequest {
  mediaFileIds?: string[];
  transcriptIds?: string[];
  criteria?: HighlightCriteria;
  analysisType?: string;
  saveToDatabase?: boolean;
  generateChapters?: boolean;
}

interface BatchResult {
  mediaFileId: string;
  transcriptId: string;
  filename: string;
  success: boolean;
  error?: string;
  highlightCount?: number;
  chapterCount?: number;
  processingTime?: number;
  metrics?: {
    averageConfidence: number;
    averageEngagement: number;
    totalDuration: number;
    highlightTypes: Record<string, number>;
  };
}

// POST /api/highlights/batch - Process multiple transcripts for highlight generation
export async function POST(request: NextRequest) {
  try {
    const body: BatchRequest = await request.json();
    const { 
      mediaFileIds = [],
      transcriptIds = [],
      criteria = {},
      analysisType = 'comprehensive',
      saveToDatabase = true,
      generateChapters = true
    } = body;

    if (mediaFileIds.length === 0 && transcriptIds.length === 0) {
      return NextResponse.json(
        { error: 'Either mediaFileIds or transcriptIds must be provided' },
        { status: 400 }
      );
    }

    const results: BatchResult[] = [];
    const startTime = Date.now();

    // Collect all transcripts to process
    const transcriptsToProcess: Array<{
      transcriptId: string;
      mediaFileId: string;
      filename: string;
    }> = [];

    // Process media file IDs
    if (mediaFileIds.length > 0) {
      const mediaFiles = await prisma.mediaFile.findMany({
        where: { 
          id: { in: mediaFileIds } 
        },
        include: {
          transcripts: {
            where: { status: 'COMPLETED' },
            orderBy: { createdAt: 'desc' },
            take: 1, // Get the latest completed transcript
          }
        }
      });

      for (const mediaFile of mediaFiles) {
        if (mediaFile.transcripts.length > 0) {
          transcriptsToProcess.push({
            transcriptId: mediaFile.transcripts[0].id,
            mediaFileId: mediaFile.id,
            filename: mediaFile.filename,
          });
        } else {
          results.push({
            mediaFileId: mediaFile.id,
            transcriptId: '',
            filename: mediaFile.filename,
            success: false,
            error: 'No completed transcript found',
          });
        }
      }
    }

    // Process transcript IDs directly
    if (transcriptIds.length > 0) {
      const transcripts = await prisma.transcript.findMany({
        where: { 
          id: { in: transcriptIds },
          status: 'COMPLETED'
        },
        include: {
          mediaFile: {
            select: { id: true, filename: true }
          }
        }
      });

      for (const transcript of transcripts) {
        transcriptsToProcess.push({
          transcriptId: transcript.id,
          mediaFileId: transcript.mediaFile.id,
          filename: transcript.mediaFile.filename,
        });
      }
    }

    console.log(`Processing ${transcriptsToProcess.length} transcripts in batch`);

    // Configure analysis criteria based on type
    const highlightCriteria = configureAnalysisCriteria(analysisType, criteria);
    const generator = new HighlightGenerator(highlightCriteria);

    // Process each transcript
    for (const transcript of transcriptsToProcess) {
      const processingStartTime = Date.now();
      
      try {
        console.log(`Processing transcript ${transcript.transcriptId} for file ${transcript.filename}`);

        // Generate highlights
        const suggestions = await generator.analyzeTranscript(transcript.transcriptId);
        
        // Generate chapters if requested
        let chapters = [];
        if (generateChapters) {
          try {
            chapters = await generator.generateChapters(transcript.transcriptId);
          } catch (chapterError) {
            console.warn(`Chapter generation failed for ${transcript.filename}:`, chapterError);
          }
        }

        // Save to database if requested
        if (saveToDatabase) {
          await generator.saveHighlights(transcript.mediaFileId, suggestions);
        }

        // Calculate metrics
        const metrics = {
          averageConfidence: suggestions.reduce((sum, h) => sum + h.confidence, 0) / suggestions.length,
          averageEngagement: suggestions.reduce((sum, h) => sum + h.engagement, 0) / suggestions.length,
          totalDuration: suggestions.reduce((sum, h) => sum + h.duration, 0),
          highlightTypes: suggestions.reduce((acc, h) => {
            acc[h.type] = (acc[h.type] || 0) + 1;
            return acc;
          }, {} as Record<string, number>),
        };

        const processingTime = (Date.now() - processingStartTime) / 1000;

        results.push({
          mediaFileId: transcript.mediaFileId,
          transcriptId: transcript.transcriptId,
          filename: transcript.filename,
          success: true,
          highlightCount: suggestions.length,
          chapterCount: chapters.length,
          processingTime,
          metrics,
        });

      } catch (error) {
        console.error(`Failed to process transcript ${transcript.transcriptId}:`, error);
        
        results.push({
          mediaFileId: transcript.mediaFileId,
          transcriptId: transcript.transcriptId,
          filename: transcript.filename,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const totalProcessingTime = (Date.now() - startTime) / 1000;
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    // Calculate aggregate metrics
    const successResults = results.filter(r => r.success && r.metrics);
    const aggregateMetrics = successResults.length > 0 ? {
      totalHighlights: successResults.reduce((sum, r) => sum + (r.highlightCount || 0), 0),
      totalChapters: successResults.reduce((sum, r) => sum + (r.chapterCount || 0), 0),
      averageConfidence: successResults.reduce((sum, r) => sum + (r.metrics?.averageConfidence || 0), 0) / successResults.length,
      averageEngagement: successResults.reduce((sum, r) => sum + (r.metrics?.averageEngagement || 0), 0) / successResults.length,
      totalDuration: successResults.reduce((sum, r) => sum + (r.metrics?.totalDuration || 0), 0),
      averageProcessingTime: successResults.reduce((sum, r) => sum + (r.processingTime || 0), 0) / successResults.length,
    } : null;

    return NextResponse.json({
      success: true,
      message: `Batch processing completed: ${successCount} successful, ${failureCount} failed`,
      totalProcessingTime,
      analysisType,
      criteria: highlightCriteria,
      results,
      summary: {
        total: results.length,
        successful: successCount,
        failed: failureCount,
        aggregateMetrics,
      }
    });

  } catch (error) {
    console.error('Error in batch highlight processing:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process batch highlights',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// GET /api/highlights/batch - Get batch processing status and options
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'status') {
      // Get current batch processing status
      const recentHighlights = await prisma.highlight.findMany({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
          }
        },
        include: {
          mediaFile: {
            select: { id: true, filename: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      const groupedByMedia = recentHighlights.reduce((acc, highlight) => {
        const key = highlight.mediaFile.id;
        if (!acc[key]) {
          acc[key] = {
            mediaFileId: key,
            filename: highlight.mediaFile.filename,
            highlightCount: 0,
            latestGeneration: highlight.createdAt,
          };
        }
        acc[key].highlightCount++;
        if (highlight.createdAt > acc[key].latestGeneration) {
          acc[key].latestGeneration = highlight.createdAt;
        }
        return acc;
      }, {} as Record<string, any>);

      return NextResponse.json({
        success: true,
        recentActivity: {
          last24Hours: Object.values(groupedByMedia),
          totalHighlights: recentHighlights.length,
          uniqueMediaFiles: Object.keys(groupedByMedia).length,
        }
      });
    }

    if (action === 'available') {
      // Get media files available for batch processing
      const availableFiles = await prisma.mediaFile.findMany({
        where: {
          transcripts: {
            some: {
              status: 'COMPLETED'
            }
          }
        },
        include: {
          transcripts: {
            where: { status: 'COMPLETED' },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          highlights: {
            select: { id: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          }
        },
        orderBy: { uploadedAt: 'desc' },
      });

      const formatted = availableFiles.map(file => ({
        mediaFileId: file.id,
        filename: file.filename,
        title: file.title,
        duration: file.duration,
        uploadedAt: file.uploadedAt,
        transcriptId: file.transcripts[0]?.id,
        transcriptLanguage: file.transcripts[0]?.language,
        transcriptConfidence: file.transcripts[0]?.confidence,
        hasHighlights: file.highlights.length > 0,
        lastHighlightGeneration: file.highlights[0]?.createdAt,
      }));

      return NextResponse.json({
        success: true,
        availableFiles: formatted,
        total: formatted.length,
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Use ?action=status or ?action=available to get specific information'
    });

  } catch (error) {
    console.error('Error getting batch status:', error);
    return NextResponse.json(
      { error: 'Failed to get batch status' },
      { status: 500 }
    );
  }
}

// Helper function to configure analysis criteria
function configureAnalysisCriteria(analysisType: string, customCriteria: HighlightCriteria): HighlightCriteria {
  const baseCriteria: HighlightCriteria = {
    minConfidence: customCriteria.minConfidence || 0.7,
    maxSilenceDuration: customCriteria.maxSilenceDuration || 2.0,
    minSegmentDuration: customCriteria.minSegmentDuration || 5.0,
    maxSegmentDuration: customCriteria.maxSegmentDuration || 60.0,
    detectLaughter: customCriteria.detectLaughter !== false,
    detectApplause: customCriteria.detectApplause !== false,
    detectEmphasis: customCriteria.detectEmphasis !== false,
    detectTopicChanges: customCriteria.detectTopicChanges !== false,
    detectQuestions: customCriteria.detectQuestions !== false,
    speakerChangeWeight: customCriteria.speakerChangeWeight || 0.3,
    speakerDominanceThreshold: customCriteria.speakerDominanceThreshold || 0.8,
    enableSentimentAnalysis: customCriteria.enableSentimentAnalysis !== false,
    targetSentiments: customCriteria.targetSentiments || ['positive', 'excited', 'emphatic'],
    keywords: customCriteria.keywords || [],
    keywordWeight: customCriteria.keywordWeight || 0.4,
    highlightCount: customCriteria.highlightCount || 15,
    socialMediaLength: customCriteria.socialMediaLength || 30,
    chapterMinLength: customCriteria.chapterMinLength || 300,
  };

  // Override based on analysis type
  switch (analysisType) {
    case 'social':
      return {
        ...baseCriteria,
        socialMediaLength: 30,
        minSegmentDuration: 5,
        maxSegmentDuration: 45,
        highlightCount: 20,
        targetSentiments: ['positive', 'excited', 'emphatic'],
      };
    
    case 'educational':
      return {
        ...baseCriteria,
        detectQuestions: true,
        detectTopicChanges: true,
        keywordWeight: 0.6,
        minSegmentDuration: 10,
        maxSegmentDuration: 120,
        highlightCount: 15,
      };
    
    case 'podcast':
      return {
        ...baseCriteria,
        speakerChangeWeight: 0.4,
        minSegmentDuration: 8,
        maxSegmentDuration: 90,
        highlightCount: 12,
        chapterMinLength: 180,
      };
    
    case 'presentation':
      return {
        ...baseCriteria,
        detectTopicChanges: true,
        detectApplause: true,
        keywordWeight: 0.5,
        minSegmentDuration: 15,
        maxSegmentDuration: 180,
        highlightCount: 8,
      };
    
    case 'interview':
      return {
        ...baseCriteria,
        speakerChangeWeight: 0.5,
        detectQuestions: true,
        targetSentiments: ['positive', 'negative', 'emphatic'],
        minSegmentDuration: 10,
        maxSegmentDuration: 120,
        highlightCount: 10,
      };
    
    default:
      return baseCriteria;
  }
}