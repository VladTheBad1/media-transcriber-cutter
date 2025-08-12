import { NextRequest, NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import { join, extname } from 'path';
import { existsSync } from 'fs';

/**
 * GET /api/files/[...path]
 * Serve files from exports and temp directories
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    const filePath = params.path.join('/');
    
    // Determine the base directory based on the path
    let baseDir: string;
    let relativePath: string;
    
    if (filePath.startsWith('exports/')) {
      baseDir = join(process.cwd(), 'exports');
      relativePath = filePath.replace('exports/', '');
    } else if (filePath.startsWith('preview/')) {
      baseDir = join(process.cwd(), 'temp', 'preview');
      relativePath = filePath.replace('preview/', '');
    } else if (filePath.startsWith('temp/')) {
      baseDir = join(process.cwd(), 'temp');
      relativePath = filePath.replace('temp/', '');
    } else {
      // Default to exports directory
      baseDir = join(process.cwd(), 'exports');
      relativePath = filePath;
    }
    
    const fullPath = join(baseDir, relativePath);
    
    // Security check - ensure the path is within allowed directories
    if (!fullPath.startsWith(baseDir)) {
      return NextResponse.json(
        { success: false, error: 'Invalid file path' },
        { status: 403 }
      );
    }
    
    // Check if file exists
    if (!existsSync(fullPath)) {
      return NextResponse.json(
        { success: false, error: 'File not found' },
        { status: 404 }
      );
    }
    
    // Get file stats
    const fileStats = await stat(fullPath);
    
    // Determine content type based on file extension
    const ext = extname(fullPath).toLowerCase();
    let contentType = 'application/octet-stream';
    
    const mimeTypes: Record<string, string> = {
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.aac': 'audio/aac',
      '.flac': 'audio/flac',
      '.srt': 'text/plain',
      '.vtt': 'text/vtt',
      '.json': 'application/json',
      '.txt': 'text/plain',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif'
    };
    
    contentType = mimeTypes[ext] || 'application/octet-stream';
    
    // Handle range requests for video/audio streaming
    const range = request.headers.get('range');
    
    if (range && (contentType.startsWith('video/') || contentType.startsWith('audio/'))) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileStats.size - 1;
      const chunkSize = (end - start) + 1;
      
      const file = await readFile(fullPath);
      const chunk = file.slice(start, end + 1);
      
      return new NextResponse(chunk, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileStats.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize.toString(),
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=3600',
        }
      });
    }
    
    // Read and serve the entire file
    const fileBuffer = await readFile(fullPath);
    
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': fileStats.size.toString(),
        'Cache-Control': 'public, max-age=3600',
        'Content-Disposition': `inline; filename="${relativePath}"`,
      }
    });
    
  } catch (error) {
    console.error('Error serving file:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to serve file',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * HEAD /api/files/[...path]
 * Get file metadata without content
 */
export async function HEAD(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    const filePath = params.path.join('/');
    
    // Determine the base directory
    let baseDir: string;
    let relativePath: string;
    
    if (filePath.startsWith('exports/')) {
      baseDir = join(process.cwd(), 'exports');
      relativePath = filePath.replace('exports/', '');
    } else if (filePath.startsWith('preview/')) {
      baseDir = join(process.cwd(), 'temp', 'preview');
      relativePath = filePath.replace('preview/', '');
    } else {
      baseDir = join(process.cwd(), 'exports');
      relativePath = filePath;
    }
    
    const fullPath = join(baseDir, relativePath);
    
    // Security check
    if (!fullPath.startsWith(baseDir)) {
      return new NextResponse(null, { status: 403 });
    }
    
    // Check if file exists
    if (!existsSync(fullPath)) {
      return new NextResponse(null, { status: 404 });
    }
    
    const fileStats = await stat(fullPath);
    const ext = extname(fullPath).toLowerCase();
    
    const mimeTypes: Record<string, string> = {
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mov': 'video/quicktime',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.srt': 'text/plain',
      '.vtt': 'text/vtt'
    };
    
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    
    return new NextResponse(null, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': fileStats.size.toString(),
        'Last-Modified': fileStats.mtime.toUTCString(),
        'Accept-Ranges': 'bytes',
      }
    });
    
  } catch (error) {
    return new NextResponse(null, { status: 500 });
  }
}
