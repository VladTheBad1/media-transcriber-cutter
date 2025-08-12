import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import HighlightGenerator, { HighlightCriteria } from '../../../../lib/ai/highlight-generator';

const prisma = new PrismaClient();

// POST /api/highlights/analyze - Advanced highlight analysis with custom criteria
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      transcriptId, 
      mediaFileId, 
      criteria = {},
      analysisType = 'comprehensive',
      returnFormat = 'detailed'
    } = body;

    if (!transcriptId && !mediaFileId) {
      return NextResponse.json(
        { error: 'Either transcriptId or mediaFileId is required' },
        { status: 400 }
      );
    }

    // Resolve transcript ID if needed
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
        include: { 
          mediaFile: { 
            select: { id: true, duration: true, filename: true } 
          } 
        }
      });

      if (!transcript) {
        return NextResponse.json(
          { error: 'Transcript not found' },
          { status: 404 }
        );
      }

      targetMediaFileId = transcript.mediaFile.id;
    }

    // Configure analysis based on type
    let highlightCriteria: HighlightCriteria;
    
    switch (analysisType) {
      case 'social':
        highlightCriteria = {
          ...criteria,
          socialMediaLength: criteria.socialMediaLength || 30,
          minSegmentDuration: criteria.minSegmentDuration || 5,
          maxSegmentDuration: criteria.maxSegmentDuration || 45,
          highlightCount: criteria.highlightCount || 20,
          detectEmphasis: true,
          enableSentimentAnalysis: true,
          targetSentiments: ['positive', 'excited', 'emphatic'],
          detectLaughter: true,
          detectApplause: true,
        };
        break;

      case 'educational':
        highlightCriteria = {
          ...criteria,
          detectQuestions: true,
          detectTopicChanges: true,
          detectEmphasis: true,
          keywords: criteria.keywords || [],
          keywordWeight: criteria.keywordWeight || 0.6,
          minSegmentDuration: criteria.minSegmentDuration || 10,
          maxSegmentDuration: criteria.maxSegmentDuration || 120,
          highlightCount: criteria.highlightCount || 15,
        };
        break;

      case 'podcast':
        highlightCriteria = {
          ...criteria,
          speakerChangeWeight: criteria.speakerChangeWeight || 0.4,
          detectLaughter: true,
          detectEmphasis: true,
          enableSentimentAnalysis: true,
          minSegmentDuration: criteria.minSegmentDuration || 8,
          maxSegmentDuration: criteria.maxSegmentDuration || 90,
          highlightCount: criteria.highlightCount || 12,
          chapterMinLength: criteria.chapterMinLength || 180, // 3 minutes
        };
        break;

      case 'presentation':
        highlightCriteria = {
          ...criteria,
          detectTopicChanges: true,
          detectQuestions: true,
          detectApplause: true,
          keywords: criteria.keywords || [],
          keywordWeight: criteria.keywordWeight || 0.5,
          minSegmentDuration: criteria.minSegmentDuration || 15,
          maxSegmentDuration: criteria.maxSegmentDuration || 180,
          highlightCount: criteria.highlightCount || 8,
        };
        break;

      case 'interview':
        highlightCriteria = {
          ...criteria,
          speakerChangeWeight: criteria.speakerChangeWeight || 0.5,
          detectQuestions: true,
          detectEmphasis: true,
          enableSentimentAnalysis: true,
          targetSentiments: ['positive', 'negative', 'emphatic'],
          minSegmentDuration: criteria.minSegmentDuration || 10,
          maxSegmentDuration: criteria.maxSegmentDuration || 120,
          highlightCount: criteria.highlightCount || 10,
        };
        break;

      default: // comprehensive
        highlightCriteria = {
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
          highlightCount: criteria.highlightCount || 15,
          socialMediaLength: criteria.socialMediaLength || 30,
          chapterMinLength: criteria.chapterMinLength || 300,
        };
    }

    console.log(`Running ${analysisType} analysis for transcript ${targetTranscriptId}`);

    // Initialize and run analysis
    const generator = new HighlightGenerator(highlightCriteria);
    const suggestions = await generator.analyzeTranscript(targetTranscriptId!);

    // Generate chapters for long-form content
    let chapters = [];
    if (analysisType === 'comprehensive' || analysisType === 'podcast' || analysisType === 'educational') {
      try {
        chapters = await generator.generateChapters(targetTranscriptId!);
      } catch (error) {
        console.warn('Chapter generation failed:', error);
      }
    }

    // Calculate analysis metrics
    const metrics = {
      totalHighlights: suggestions.length,
      averageConfidence: suggestions.reduce((sum, h) => sum + h.confidence, 0) / suggestions.length,
      averageEngagement: suggestions.reduce((sum, h) => sum + h.engagement, 0) / suggestions.length,
      highlightTypes: suggestions.reduce((acc, h) => {
        acc[h.type] = (acc[h.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      sentimentDistribution: suggestions.reduce((acc, h) => {
        acc[h.sentiment] = (acc[h.sentiment] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      totalDuration: suggestions.reduce((sum, h) => sum + h.duration, 0),
      socialClips: suggestions.filter(h => h.type === 'social_clip').length,
      autoHighlights: suggestions.filter(h => h.type === 'auto_highlight').length,
      silenceRemovals: suggestions.filter(h => h.type === 'silence_removal').length,
    };

    // Format response based on requested format
    let response: any = {
      success: true,
      analysisType,
      metrics,
      criteria: highlightCriteria,
    };

    if (returnFormat === 'detailed') {
      response.highlights = suggestions;
      response.chapters = chapters;
    } else if (returnFormat === 'summary') {
      response.topHighlights = suggestions
        .sort((a, b) => b.confidence * b.engagement - a.confidence * a.engagement)
        .slice(0, 5);
      response.chapterCount = chapters.length;
    } else if (returnFormat === 'metrics') {
      // Just return metrics and criteria
    }

    // Save highlights to database if requested
    if (body.saveToDatabase !== false) {
      await generator.saveHighlights(targetMediaFileId!, suggestions);
      response.saved = true;
      response.message = `Generated and saved ${suggestions.length} highlights`;
    } else {
      response.message = `Generated ${suggestions.length} highlights (not saved)`;
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error('Error in highlight analysis:', error);
    return NextResponse.json(
      { 
        error: 'Failed to analyze highlights',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// GET /api/highlights/analyze - Get analysis presets and options
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');

    if (type === 'presets') {
      return NextResponse.json({
        success: true,
        presets: {
          social: {
            name: 'Social Media',
            description: 'Optimized for short, engaging social media clips',
            defaults: {
              socialMediaLength: 30,
              minSegmentDuration: 5,
              maxSegmentDuration: 45,
              highlightCount: 20,
              detectEmphasis: true,
              enableSentimentAnalysis: true,
              targetSentiments: ['positive', 'excited', 'emphatic'],
              detectLaughter: true,
              detectApplause: true,
            }
          },
          educational: {
            name: 'Educational Content',
            description: 'Focus on key learning moments and topic changes',
            defaults: {
              detectQuestions: true,
              detectTopicChanges: true,
              detectEmphasis: true,
              keywordWeight: 0.6,
              minSegmentDuration: 10,
              maxSegmentDuration: 120,
              highlightCount: 15,
            }
          },
          podcast: {
            name: 'Podcast',
            description: 'Speaker transitions and engaging moments',
            defaults: {
              speakerChangeWeight: 0.4,
              detectLaughter: true,
              detectEmphasis: true,
              enableSentimentAnalysis: true,
              minSegmentDuration: 8,
              maxSegmentDuration: 90,
              highlightCount: 12,
              chapterMinLength: 180,
            }
          },
          presentation: {
            name: 'Presentation',
            description: 'Key points and audience reactions',
            defaults: {
              detectTopicChanges: true,
              detectQuestions: true,
              detectApplause: true,
              keywordWeight: 0.5,
              minSegmentDuration: 15,
              maxSegmentDuration: 180,
              highlightCount: 8,
            }
          },
          interview: {
            name: 'Interview',
            description: 'Speaker interactions and important answers',
            defaults: {
              speakerChangeWeight: 0.5,
              detectQuestions: true,
              detectEmphasis: true,
              enableSentimentAnalysis: true,
              targetSentiments: ['positive', 'negative', 'emphatic'],
              minSegmentDuration: 10,
              maxSegmentDuration: 120,
              highlightCount: 10,
            }
          },
          comprehensive: {
            name: 'Comprehensive',
            description: 'Full analysis with all detection methods',
            defaults: {
              minConfidence: 0.7,
              maxSilenceDuration: 2.0,
              minSegmentDuration: 5.0,
              maxSegmentDuration: 60.0,
              detectLaughter: true,
              detectApplause: true,
              detectEmphasis: true,
              detectTopicChanges: true,
              detectQuestions: true,
              speakerChangeWeight: 0.3,
              enableSentimentAnalysis: true,
              highlightCount: 15,
            }
          }
        }
      });
    }

    if (type === 'options') {
      return NextResponse.json({
        success: true,
        options: {
          analysisTypes: [
            'comprehensive',
            'social',
            'educational', 
            'podcast',
            'presentation',
            'interview'
          ],
          returnFormats: [
            'detailed',
            'summary', 
            'metrics'
          ],
          sentimentOptions: [
            'positive',
            'negative',
            'neutral',
            'excited',
            'emphatic'
          ],
          highlightTypes: [
            'auto_highlight',
            'social_clip',
            'chapter_marker',
            'silence_removal'
          ],
          criteria: {
            minConfidence: { min: 0.1, max: 1.0, default: 0.7, step: 0.1 },
            maxSilenceDuration: { min: 0.5, max: 10.0, default: 2.0, step: 0.5 },
            minSegmentDuration: { min: 1.0, max: 60.0, default: 5.0, step: 1.0 },
            maxSegmentDuration: { min: 10.0, max: 300.0, default: 60.0, step: 10.0 },
            speakerChangeWeight: { min: 0.0, max: 1.0, default: 0.3, step: 0.1 },
            keywordWeight: { min: 0.0, max: 1.0, default: 0.4, step: 0.1 },
            highlightCount: { min: 1, max: 50, default: 15, step: 1 },
            socialMediaLength: { min: 10, max: 120, default: 30, step: 5 },
            chapterMinLength: { min: 60, max: 1800, default: 300, step: 30 },
          }
        }
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Use ?type=presets or ?type=options to get configuration data'
    });

  } catch (error) {
    console.error('Error fetching analysis options:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analysis options' },
      { status: 500 }
    );
  }
}