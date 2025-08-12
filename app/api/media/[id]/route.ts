import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { unlink } from 'fs/promises';
import path from 'path';

const prisma = new PrismaClient();

interface RouteParams {
  params: {
    id: string;
  };
}

/**
 * GET /api/media/[id] - Get media file details
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = params;
    
    const mediaFile = await prisma.mediaFile.findUnique({
      where: { id },
      include: {
        transcripts: {
          include: {
            segments: {
              include: {
                words: true,
                speaker: true
              },
              orderBy: { start: 'asc' }
            },
            speakers: true,
            summaries: true
          }
        },
        timelines: {
          include: {
            tracks: {
              include: {
                clips: {
                  include: {
                    effects: true
                  }
                }
              }
            }
          }
        },
        highlights: true,
        exports: {
          orderBy: { startedAt: 'desc' }
        }
      }
    });
    
    if (!mediaFile) {
      return NextResponse.json(
        { error: 'Media file not found' },
        { status: 404 }
      );
    }
    
    // Parse metadata
    let metadata = {};
    try {
      if (mediaFile.metadata) {
        metadata = JSON.parse(mediaFile.metadata);
      }
    } catch (error) {
      console.warn('Invalid metadata JSON for media file:', id);
    }
    
    // Parse tags
    let tags: string[] = [];
    try {
      if (mediaFile.tags) {
        tags = JSON.parse(mediaFile.tags);
      }
    } catch (error) {
      console.warn('Invalid tags JSON for media file:', id);
    }
    
    return NextResponse.json({
      mediaId: mediaFile.id,
      filename: mediaFile.filename,
      originalName: mediaFile.originalName,
      title: mediaFile.title,
      description: mediaFile.description,
      type: mediaFile.type.toLowerCase(),
      format: mediaFile.format,
      codec: mediaFile.codec,
      size: Number(mediaFile.size),
      duration: mediaFile.duration,
      bitrate: mediaFile.bitrate,
      resolution: mediaFile.resolution ? {
        width: parseInt(mediaFile.resolution.split('x')[0]),
        height: parseInt(mediaFile.resolution.split('x')[1])
      } : null,
      framerate: mediaFile.framerate,
      audioChannels: mediaFile.audioChannels,
      thumbnailUrl: mediaFile.thumbnailPath ? `/media/thumbnails/${path.basename(mediaFile.thumbnailPath)}` : null,
      waveformUrl: mediaFile.waveformPath ? `/media/waveforms/${path.basename(mediaFile.waveformPath)}` : null,
      status: mediaFile.status.toLowerCase(),
      uploadedAt: mediaFile.uploadedAt.toISOString(),
      processedAt: mediaFile.processedAt?.toISOString(),
      tags,
      category: mediaFile.category,
      metadata,
      transcripts: mediaFile.transcripts.map(transcript => ({
        transcriptId: transcript.id,
        language: transcript.language,
        confidence: transcript.confidence,
        status: transcript.status.toLowerCase(),
        createdAt: transcript.createdAt.toISOString(),
        completedAt: transcript.completedAt?.toISOString(),
        diarizationEnabled: transcript.diarizationEnabled,
        segmentCount: transcript.segments.length,
        speakerCount: transcript.speakers.length,
        summaryCount: transcript.summaries.length
      })),
      timelines: mediaFile.timelines.map(timeline => ({
        timelineId: timeline.id,
        name: timeline.name,
        description: timeline.description,
        duration: timeline.duration,
        status: timeline.status.toLowerCase(),
        createdAt: timeline.createdAt.toISOString(),
        updatedAt: timeline.updatedAt.toISOString(),
        trackCount: timeline.tracks.length
      })),
      highlights: mediaFile.highlights.map(highlight => ({
        highlightId: highlight.id,
        title: highlight.title,
        startTime: highlight.startTime,
        endTime: highlight.endTime,
        duration: highlight.duration,
        confidence: highlight.confidence,
        reason: highlight.reason,
        status: highlight.status.toLowerCase(),
        createdAt: highlight.createdAt.toISOString()
      })),
      exports: mediaFile.exports.map(exportJob => ({
        exportId: exportJob.id,
        filename: exportJob.filename,
        format: exportJob.format,
        preset: exportJob.preset,
        fileSize: exportJob.fileSize ? Number(exportJob.fileSize) : null,
        duration: exportJob.duration,
        status: exportJob.status.toLowerCase(),
        progress: exportJob.progress,
        startedAt: exportJob.startedAt.toISOString(),
        completedAt: exportJob.completedAt?.toISOString(),
        error: exportJob.error
      }))
    });
    
  } catch (error) {
    console.error('Error fetching media details:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch media details',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/media/[id] - Update media file metadata
 */
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = params;
    const body = await request.json();
    
    const { title, description, tags, category } = body;
    
    // Validate media file exists
    const existingMedia = await prisma.mediaFile.findUnique({
      where: { id }
    });
    
    if (!existingMedia) {
      return NextResponse.json(
        { error: 'Media file not found' },
        { status: 404 }
      );
    }
    
    // Update media file
    const updatedMedia = await prisma.mediaFile.update({
      where: { id },
      data: {
        title: title !== undefined ? title : undefined,
        description: description !== undefined ? description : undefined,
        tags: tags ? JSON.stringify(tags) : undefined,
        category: category !== undefined ? category : undefined
      }
    });
    
    return NextResponse.json({
      mediaId: updatedMedia.id,
      title: updatedMedia.title,
      description: updatedMedia.description,
      tags: updatedMedia.tags ? JSON.parse(updatedMedia.tags) : [],
      category: updatedMedia.category,
      message: 'Media file updated successfully'
    });
    
  } catch (error) {
    console.error('Error updating media file:', error);
    return NextResponse.json(
      { 
        error: 'Failed to update media file',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/media/[id] - Delete media file and associated data
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = params;
    
    // Get media file with associated data
    const mediaFile = await prisma.mediaFile.findUnique({
      where: { id },
      include: {
        transcripts: true,
        timelines: true,
        exports: true
      }
    });
    
    if (!mediaFile) {
      return NextResponse.json(
        { error: 'Media file not found' },
        { status: 404 }
      );
    }
    
    // Check if any exports are currently processing
    const processingExports = mediaFile.exports.filter(
      exp => exp.status === 'PROCESSING' || exp.status === 'QUEUED'
    );
    
    if (processingExports.length > 0) {
      return NextResponse.json(
        { 
          error: 'Cannot delete media file with active processing jobs',
          processingJobs: processingExports.length
        },
        { status: 409 }
      );
    }
    
    // Collect file paths to delete
    const filesToDelete: string[] = [mediaFile.filePath];
    
    if (mediaFile.thumbnailPath) {
      filesToDelete.push(mediaFile.thumbnailPath);
    }
    
    if (mediaFile.waveformPath) {
      filesToDelete.push(mediaFile.waveformPath);
    }
    
    // Add export files
    mediaFile.exports.forEach(exp => {
      if (exp.outputPath) {
        filesToDelete.push(exp.outputPath);
      }
    });
    
    // Delete database records (cascading deletes will handle related data)
    await prisma.mediaFile.delete({
      where: { id }
    });
    
    // Delete physical files
    await Promise.allSettled(
      filesToDelete.map(async (filePath) => {
        try {
          await unlink(filePath);
          console.log(`Deleted file: ${filePath}`);
        } catch (error) {
          console.warn(`Failed to delete file ${filePath}:`, error);
        }
      })
    );
    
    return NextResponse.json({
      message: 'Media file deleted successfully',
      deletedFiles: filesToDelete.length
    });
    
  } catch (error) {
    console.error('Error deleting media file:', error);
    return NextResponse.json(
      { 
        error: 'Failed to delete media file',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
