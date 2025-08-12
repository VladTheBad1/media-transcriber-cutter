import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { VideoExporter, getPresetById } from '@/lib/export';
import path from 'path';

const prisma = new PrismaClient();

/**
 * POST /api/export/preview
 * Generate a preview of export settings
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      mediaFileId,
      timelineId,
      highlightId,
      presetId,
      customPreset,
      previewDuration = 10,
      startTime = 0,
      timeline
    } = body;

    // Validate required fields
    if (!mediaFileId && !timelineId && !highlightId) {
      return NextResponse.json(
        { success: false, error: 'Media file, timeline, or highlight ID is required' },
        { status: 400 }
      );
    }

    if (!presetId && !customPreset) {
      return NextResponse.json(
        { success: false, error: 'Preset ID or custom preset is required' },
        { status: 400 }
      );
    }

    // Get the preset
    const preset = presetId ? getPresetById(presetId) : customPreset;
    if (!preset) {
      return NextResponse.json(
        { success: false, error: 'Invalid preset' },
        { status: 400 }
      );
    }

    // Get source media information
    let sourceMedia = null;
    if (mediaFileId) {
      sourceMedia = await prisma.mediaFile.findUnique({
        where: { id: mediaFileId },
        include: {
          transcripts: {
            include: { segments: true }
          }
        }
      });
    } else if (timelineId) {
      const timelineData = await prisma.timeline.findUnique({
        where: { id: timelineId },
        include: { 
          mediaFile: {
            include: {
              transcripts: {
                include: { segments: true }
              }
            }
          }
        }
      });
      sourceMedia = timelineData?.mediaFile;
    } else if (highlightId) {
      const highlight = await prisma.highlight.findUnique({
        where: { id: highlightId },
        include: { 
          mediaFile: {
            include: {
              transcripts: {
                include: { segments: true }
              }
            }
          }
        }
      });
      sourceMedia = highlight?.mediaFile;
    }

    if (!sourceMedia) {
      return NextResponse.json(
        { success: false, error: 'Source media not found' },
        { status: 404 }
      );
    }

    // Check if source file exists
    if (!sourceMedia.filePath) {
      return NextResponse.json(
        { success: false, error: 'Source file path not found' },
        { status: 404 }
      );
    }

    // Create a temporary export job for preview
    const previewJob = {
      id: `preview_${Date.now()}`,
      mediaFileId,
      timelineId,
      highlightId,
      preset,
      timeline,
      output: {
        filename: `preview_${Date.now()}.${preset.video?.format || 'mp4'}`,
        directory: 'temp/previews',
        overwrite: true
      },
      options: {
        priority: 999, // High priority for previews
        includeSubtitles: true,
        watermark: {
          enabled: false,
          position: 'bottom-right' as const,
          opacity: 0.7
        },
        preview: {
          enabled: true,
          maxDuration: previewDuration
        }
      },
      status: 'queued' as const,
      progress: 0
    };

    // Generate preview
    const exporter = new VideoExporter({
      tempDir: './temp/export',
      outputDir: './temp/previews'
    });

    const previewPath = await exporter.generatePreview(
      previewJob,
      previewDuration,
      startTime
    );

    // Get preview file stats
    const fs = await import('fs/promises');
    const previewStats = await fs.stat(previewPath);

    // Generate preview URL (would need proper file serving setup)
    const previewUrl = `/api/export/preview/download?path=${encodeURIComponent(previewPath)}`;

    // Calculate preview metadata
    const actualDuration = Math.min(previewDuration, (sourceMedia.duration || 0) - startTime);
    
    return NextResponse.json({
      success: true,
      preview: {
        url: previewUrl,
        path: previewPath,
        filename: path.basename(previewPath),
        fileSize: previewStats.size,
        duration: actualDuration,
        preset: {
          id: preset.id,
          name: preset.name,
          platform: preset.platform,
          resolution: preset.video?.resolution,
          format: preset.video?.format
        },
        settings: {
          startTime,
          previewDuration: actualDuration,
          includeSubtitles: previewJob.options.includeSubtitles,
          autoCrop: preset.processing?.autoCrop || false
        }
      },
      message: 'Preview generated successfully'
    });

  } catch (error) {
    console.error('Error generating export preview:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to generate export preview',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/export/preview
 * Clean up preview files
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const previewPath = searchParams.get('path');
    const olderThan = searchParams.get('olderThan'); // minutes

    const fs = await import('fs/promises');
    const path = await import('path');

    if (previewPath) {
      // Delete specific preview file
      try {
        await fs.unlink(previewPath);
        return NextResponse.json({
          success: true,
          message: 'Preview file deleted successfully'
        });
      } catch (error) {
        return NextResponse.json(
          { success: false, error: 'Preview file not found or could not be deleted' },
          { status: 404 }
        );
      }
    }

    // Clean up old preview files
    const previewDir = './temp/previews';
    const maxAge = olderThan ? parseInt(olderThan) * 60 * 1000 : 30 * 60 * 1000; // Default 30 minutes
    const now = Date.now();

    try {
      const files = await fs.readdir(previewDir);
      let deletedCount = 0;

      for (const file of files) {
        const filePath = path.join(previewDir, file);
        const stats = await fs.stat(filePath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      }

      return NextResponse.json({
        success: true,
        message: `Cleaned up ${deletedCount} old preview files`,
        deletedCount
      });

    } catch (error) {
      return NextResponse.json(
        { success: false, error: 'Failed to clean up preview files' },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Error cleaning up previews:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to clean up previews',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}