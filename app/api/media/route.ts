import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * GET /api/media - List media files with pagination and filtering
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Parse query parameters
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const search = searchParams.get('search') || '';
    const type = searchParams.get('type') || 'all';
    const sortBy = searchParams.get('sortBy') || 'uploadedAt';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    const status = searchParams.get('status') || 'all';
    
    // Build filters
    const where: any = {};
    
    // Search filter
    if (search) {
      where.OR = [
        { filename: { contains: search, mode: 'insensitive' } },
        { originalName: { contains: search, mode: 'insensitive' } },
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }
    
    // Type filter
    if (type !== 'all') {
      where.type = type.toUpperCase();
    }
    
    // Status filter
    if (status !== 'all') {
      where.status = status.toUpperCase();
    }
    
    // Build sort options
    const orderBy: any = {};
    switch (sortBy) {
      case 'name':
        orderBy.filename = sortOrder;
        break;
      case 'created':
      case 'uploadedAt':
        orderBy.uploadedAt = sortOrder;
        break;
      case 'duration':
        orderBy.duration = sortOrder;
        break;
      case 'size':
        orderBy.size = sortOrder;
        break;
      default:
        orderBy.uploadedAt = 'desc';
    }
    
    // Execute queries
    const [mediaFiles, totalCount] = await Promise.all([
      prisma.mediaFile.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          transcripts: {
            select: {
              id: true,
              language: true,
              status: true,
              confidence: true,
              createdAt: true
            }
          },
          timelines: {
            select: {
              id: true,
              name: true,
              status: true,
              updatedAt: true
            }
          },
          highlights: {
            select: {
              id: true,
              confidence: true,
              status: true
            }
          }
        }
      }),
      prisma.mediaFile.count({ where })
    ]);
    
    const totalPages = Math.ceil(totalCount / limit);
    
    // Format response
    const items = mediaFiles.map(file => {
      // Parse tags
      let tags: string[] = [];
      try {
        if (file.tags) {
          tags = JSON.parse(file.tags);
        }
      } catch (error) {
        console.warn('Invalid tags JSON for file:', file.id);
      }
      
      return {
        mediaId: file.id,
        filename: file.filename,
        originalName: file.originalName,
        title: file.title,
        type: file.type.toLowerCase(),
        format: file.format,
        size: Number(file.size),
        duration: file.duration,
        resolution: file.resolution,
        thumbnailUrl: file.thumbnailPath ? `/api/media/thumbnail/${file.id}` : null,
        status: file.status.toLowerCase(),
        uploadedAt: file.uploadedAt.toISOString(),
        processedAt: file.processedAt?.toISOString(),
        tags,
        category: file.category,
        hasTranscripts: file.transcripts.length > 0,
        hasTimelines: file.timelines.length > 0,
        hasHighlights: file.highlights.length > 0,
        transcriptStatus: file.transcripts.length > 0 
          ? file.transcripts[0].status.toLowerCase() 
          : null,
        processingStats: {
          transcriptCount: file.transcripts.length,
          timelineCount: file.timelines.length,
          highlightCount: file.highlights.length
        }
      };
    });
    
    return NextResponse.json({
      items,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1
      },
      filters: {
        search,
        type,
        status,
        sortBy,
        sortOrder
      }
    });
    
  } catch (error) {
    console.error('Error fetching media files:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch media files',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/media - Bulk operations on media files
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { operation, mediaIds, data } = body;
    
    if (!operation || !Array.isArray(mediaIds) || mediaIds.length === 0) {
      return NextResponse.json(
        { error: 'Invalid operation or media IDs' },
        { status: 400 }
      );
    }
    
    switch (operation) {
      case 'bulk-update':
        return await handleBulkUpdate(mediaIds, data);
      
      case 'bulk-delete':
        return await handleBulkDelete(mediaIds);
      
      case 'bulk-export':
        return await handleBulkExport(mediaIds, data);
      
      default:
        return NextResponse.json(
          { error: `Unknown operation: ${operation}` },
          { status: 400 }
        );
    }
    
  } catch (error) {
    console.error('Error in bulk operation:', error);
    return NextResponse.json(
      { 
        error: 'Bulk operation failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * Handle bulk update operation
 */
async function handleBulkUpdate(
  mediaIds: string[],
  data: { tags?: string[]; category?: string }
): Promise<NextResponse> {
  const updates: any = {};
  
  if (data.tags) {
    updates.tags = JSON.stringify(data.tags);
  }
  
  if (data.category !== undefined) {
    updates.category = data.category;
  }
  
  const result = await prisma.mediaFile.updateMany({
    where: {
      id: { in: mediaIds }
    },
    data: updates
  });
  
  return NextResponse.json({
    message: `Updated ${result.count} media files`,
    updatedCount: result.count,
    requestedCount: mediaIds.length
  });
}

/**
 * Handle bulk delete operation
 */
async function handleBulkDelete(mediaIds: string[]): Promise<NextResponse> {
  // Check for processing files
  const processingFiles = await prisma.mediaFile.findMany({
    where: {
      id: { in: mediaIds },
      OR: [
        { status: 'PROCESSING' },
        { exports: { some: { status: { in: ['PROCESSING', 'QUEUED'] } } } }
      ]
    },
    select: { id: true, filename: true }
  });
  
  if (processingFiles.length > 0) {
    return NextResponse.json(
      {
        error: 'Cannot delete files that are currently processing',
        processingFiles: processingFiles.map(f => ({
          id: f.id,
          filename: f.filename
        }))
      },
      { status: 409 }
    );
  }
  
  // Get file paths before deletion
  const filesToDelete = await prisma.mediaFile.findMany({
    where: { id: { in: mediaIds } },
    select: {
      id: true,
      filePath: true,
      thumbnailPath: true,
      waveformPath: true
    }
  });
  
  // Delete from database
  const result = await prisma.mediaFile.deleteMany({
    where: { id: { in: mediaIds } }
  });
  
  // Delete physical files (fire and forget)
  filesToDelete.forEach(async (file) => {
    const paths = [file.filePath, file.thumbnailPath, file.waveformPath]
      .filter(Boolean) as string[];
    
    await Promise.allSettled(
      paths.map(async (filePath) => {
        try {
          const { unlink } = await import('fs/promises');
          await unlink(filePath);
        } catch (error) {
          console.warn(`Failed to delete file ${filePath}:`, error);
        }
      })
    );
  });
  
  return NextResponse.json({
    message: `Deleted ${result.count} media files`,
    deletedCount: result.count,
    requestedCount: mediaIds.length
  });
}

/**
 * Handle bulk export operation
 */
async function handleBulkExport(
  mediaIds: string[],
  data: { format: string; preset?: string; settings?: any }
): Promise<NextResponse> {
  // This would integrate with your export queue system
  // For now, return a placeholder response
  
  return NextResponse.json({
    message: `Queued ${mediaIds.length} files for export`,
    format: data.format,
    exportIds: mediaIds.map(id => `export_${id}_${Date.now()}`)
  });
}
