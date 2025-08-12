import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { 
  getExportQueue,
  createExportJobWithPreset,
  createMultiPlatformExportJobs,
  validateExportSettings,
  getPresetById,
  SOCIAL_MEDIA_PRESETS
} from '@/lib/export';
import { FFmpegExporter } from '@/lib/export/ffmpeg-export';
import { generateId } from '@/lib/utils';
import path from 'path';
import fs from 'fs/promises';

const prisma = new PrismaClient();

/**
 * POST /api/export/start
 * Start a new export job
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
      outputFilename,
      outputDirectory = 'exports',
      timeline,
      options = {}
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

    if (!outputFilename) {
      return NextResponse.json(
        { success: false, error: 'Output filename is required' },
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

    // Initialize FFmpeg exporter
    const exporter = new FFmpegExporter({
      tempDir: './temp/export'
    });

    // Get source media information for validation
    let sourceMedia = null;
    let duration = 0;

    if (mediaFileId) {
      sourceMedia = await prisma.mediaFile.findUnique({
        where: { id: mediaFileId }
      });
      duration = sourceMedia?.duration || 0;
    } else if (timelineId) {
      const timelineData = await prisma.timeline.findUnique({
        where: { id: timelineId },
        include: { mediaFile: true }
      });
      sourceMedia = timelineData?.mediaFile;
      duration = timelineData?.duration || 0;
    } else if (highlightId) {
      const highlight = await prisma.highlight.findUnique({
        where: { id: highlightId },
        include: { mediaFile: true }
      });
      sourceMedia = highlight?.mediaFile;
      duration = highlight?.duration || 0;
    }

    if (!sourceMedia) {
      return NextResponse.json(
        { success: false, error: 'Source media not found' },
        { status: 404 }
      );
    }

    // Apply timeline constraints if specified
    if (timeline?.startTime !== undefined && timeline?.endTime !== undefined) {
      duration = timeline.endTime - timeline.startTime;
    }

    // Create export job
    const exportJob = {
      mediaFileId,
      timelineId,
      highlightId,
      preset,
      timeline,
      output: {
        filename: outputFilename,
        directory: outputDirectory,
        overwrite: true
      },
      options: {
        priority: options.priority || 0,
        includeSubtitles: options.includeSubtitles ?? true,
        watermark: options.watermark || {
          enabled: false,
          position: 'bottom-right',
          opacity: 0.7
        },
        preview: options.preview || {
          enabled: false,
          maxDuration: 10
        }
      }
    };

    // Validate the export settings
    const validation = await validateExportSettings(exportJob, duration);
    if (!validation.valid) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Export validation failed',
          validation
        },
        { status: 400 }
      );
    }

    // Start export directly (for now - later can be queued)
    const jobId = generateId();
    const outputDir = path.join(process.cwd(), 'exports', outputDirectory);
    const outputPath = path.join(outputDir, outputFilename);
    
    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    // Get timeline data if specified
    let timelineData = null;
    let subtitleSegments = null;
    
    if (timelineId) {
      timelineData = await prisma.timeline.findUnique({
        where: { id: timelineId },
        include: {
          tracks: {
            include: { clips: true }
          }
        }
      });
    }

    // Get transcript for subtitles if available
    if (sourceMedia && options.includeSubtitles !== false) {
      const transcript = await prisma.transcript.findFirst({
        where: { mediaFileId: sourceMedia.id },
        include: { segments: true }
      });
      
      if (transcript?.segments) {
        subtitleSegments = transcript.segments.map(segment => ({
          id: segment.id,
          startTime: segment.start,
          endTime: segment.end,
          text: segment.text,
          speaker: segment.speakerId
        }));
      }
    }

    // Prepare export options
    const exportOptions = {
      preset,
      timeline: timelineData ? {
        startTime: timeline?.startTime || 0,
        endTime: timeline?.endTime || duration,
        tracks: timelineData.tracks.map(track => ({
          id: track.id,
          name: track.name,
          type: track.type as 'video' | 'audio' | 'text' | 'overlay',
          clips: track.clips.map(clip => ({
            id: clip.id,
            start: clip.timelineStart,
            end: clip.timelineStart + clip.duration,
            duration: clip.duration,
            type: track.type as 'video' | 'audio' | 'text',
            sourceStart: clip.sourceStart,
            sourceEnd: clip.sourceEnd,
            volume: clip.volume,
            opacity: clip.opacity,
            locked: clip.locked,
            effects: []
          }))
        }))
      } : undefined,
      subtitles: subtitleSegments ? {
        segments: subtitleSegments,
        format: preset.subtitles?.format === 'burned' ? 'burned' as const : 
                preset.subtitles?.format === 'srt' ? 'srt' as const : 'vtt' as const,
        style: preset.subtitles?.style
      } : undefined,
      watermark: options.watermark?.enabled ? {
        text: options.watermark.text || 'Watermark',
        position: options.watermark.position || 'bottom-right',
        opacity: options.watermark.opacity || 0.7
      } : undefined,
      outputPath
    };

    try {
      // Start the export process
      const result = await exporter.exportVideo(sourceMedia.filePath!, exportOptions);
      
      if (result.success) {
        return NextResponse.json({
          success: true,
          jobId,
          result: {
            outputPath: result.outputPath,
            fileSize: result.fileSize,
            duration: result.duration,
            processingTime: result.processingTime
          },
          validation,
          estimates: validation.estimates,
          message: 'Export completed successfully'
        });
      } else {
        return NextResponse.json(
          { 
            success: false, 
            error: result.error || 'Export failed',
            jobId
          },
          { status: 500 }
        );
      }
    } catch (exportError) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Export processing failed',
          message: exportError instanceof Error ? exportError.message : 'Unknown error',
          jobId
        },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Error starting export:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to start export',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/export/start (Batch Export)
 * Start multiple export jobs
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      mediaFileId,
      timelineId,
      baseFilename,
      platforms,
      timeline,
      options = {},
      batchOptions = {}
    } = body;

    if (!mediaFileId && !timelineId) {
      return NextResponse.json(
        { success: false, error: 'Media file or timeline ID is required' },
        { status: 400 }
      );
    }

    if (!baseFilename) {
      return NextResponse.json(
        { success: false, error: 'Base filename is required' },
        { status: 400 }
      );
    }

    if (!platforms || !Array.isArray(platforms) || platforms.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one platform is required' },
        { status: 400 }
      );
    }

    // Get source media for validation
    let sourceMedia = null;
    if (mediaFileId) {
      sourceMedia = await prisma.mediaFile.findUnique({
        where: { id: mediaFileId }
      });
    } else if (timelineId) {
      const timelineData = await prisma.timeline.findUnique({
        where: { id: timelineId },
        include: { mediaFile: true }
      });
      sourceMedia = timelineData?.mediaFile;
    }

    if (!sourceMedia) {
      return NextResponse.json(
        { success: false, error: 'Source media not found' },
        { status: 404 }
      );
    }

    // Create multi-platform export jobs
    const exportJobs = createMultiPlatformExportJobs(
      mediaFileId || timelineId!,
      baseFilename,
      platforms,
      {
        timeline,
        includeSubtitles: options.includeSubtitles,
        outputDirectory: options.outputDirectory,
        priority: options.priority
      }
    );

    if (exportJobs.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No export jobs created for specified platforms' },
        { status: 400 }
      );
    }

    // Validate jobs (sample validation on first job)
    const sampleDuration = sourceMedia.duration || 0;
    const sampleValidation = await validateExportSettings(exportJobs[0], sampleDuration);

    // Add batch to queue
    const queue = getExportQueue();
    const batchId = await queue.addBatchJob(exportJobs, {
      batchName: batchOptions.batchName || `${baseFilename}_multi_platform`,
      sequential: batchOptions.sequential || false,
      priority: options.priority || 0
    });

    return NextResponse.json({
      success: true,
      batchId,
      jobCount: exportJobs.length,
      platforms: exportJobs.map(job => ({
        platform: job.preset?.platform,
        presetId: job.preset?.id,
        filename: job.output.filename
      })),
      sampleValidation,
      message: `Batch export with ${exportJobs.length} jobs queued successfully`
    });

  } catch (error) {
    console.error('Error starting batch export:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to start batch export',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}