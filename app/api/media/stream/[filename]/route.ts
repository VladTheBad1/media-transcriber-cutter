import { NextRequest, NextResponse } from 'next/server';
import { createReadStream, stat } from 'fs';
import { promisify } from 'util';
import path from 'path';
import { getMimeType } from '@/lib/media/formats';

const statAsync = promisify(stat);

interface RouteParams {
  params: {
    filename: string;
  };
}

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const MEDIA_DIR = process.env.MEDIA_DIR || './media';

/**
 * GET /api/media/stream/[filename] - Stream media files with range support
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { filename } = params;
    
    // Security: prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return NextResponse.json(
        { error: 'Invalid filename' },
        { status: 400 }
      );
    }
    
    // Try to find file in uploads or optimized directory
    let filePath = path.join(UPLOAD_DIR, filename);
    
    try {
      await statAsync(filePath);
    } catch (error) {
      // Try optimized directory
      filePath = path.join(MEDIA_DIR, 'optimized', filename);
      try {
        await statAsync(filePath);
      } catch (error) {
        return NextResponse.json(
          { error: 'File not found' },
          { status: 404 }
        );
      }
    }
    
    const stats = await statAsync(filePath);
    const fileSize = stats.size;
    const mimeType = getMimeType(filename) || 'application/octet-stream';
    
    // Handle range requests for video streaming
    const range = request.headers.get('range');
    
    if (range) {
      return handleRangeRequest(filePath, fileSize, mimeType, range);
    } else {
      return handleFullFileRequest(filePath, fileSize, mimeType);
    }
    
  } catch (error) {
    console.error('Error streaming media file:', error);
    return NextResponse.json(
      { error: 'Failed to stream file' },
      { status: 500 }
    );
  }
}

/**
 * Handle range request for partial content
 */
function handleRangeRequest(
  filePath: string,
  fileSize: number,
  mimeType: string,
  rangeHeader: string
): Response {
  const parts = rangeHeader.replace(/bytes=/, '').split('-');
  const start = parseInt(parts[0], 10);
  const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
  const chunkSize = (end - start) + 1;
  
  const stream = createReadStream(filePath, { start, end });
  
  // Convert Node.js stream to Web Stream
  const readableStream = new ReadableStream({
    start(controller) {
      stream.on('data', (chunk) => {
        controller.enqueue(new Uint8Array(Buffer.from(chunk)));
      });
      
      stream.on('end', () => {
        controller.close();
      });
      
      stream.on('error', (error) => {
        controller.error(error);
      });
    },
    
    cancel() {
      stream.destroy();
    }
  });
  
  return new Response(readableStream, {
    status: 206,
    headers: {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize.toString(),
      'Content-Type': mimeType,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

/**
 * Handle full file request
 */
function handleFullFileRequest(
  filePath: string,
  fileSize: number,
  mimeType: string
): Response {
  const stream = createReadStream(filePath);
  
  // Convert Node.js stream to Web Stream
  const readableStream = new ReadableStream({
    start(controller) {
      stream.on('data', (chunk) => {
        controller.enqueue(new Uint8Array(Buffer.from(chunk)));
      });
      
      stream.on('end', () => {
        controller.close();
      });
      
      stream.on('error', (error) => {
        controller.error(error);
      });
    },
    
    cancel() {
      stream.destroy();
    }
  });
  
  return new Response(readableStream, {
    status: 200,
    headers: {
      'Content-Length': fileSize.toString(),
      'Content-Type': mimeType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

/**
 * HEAD /api/media/stream/[filename] - Get file metadata
 */
export async function HEAD(
  request: NextRequest,
  { params }: RouteParams
): Promise<Response> {
  try {
    const { filename } = params;
    
    // Security: prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return new Response(null, { status: 400 });
    }
    
    // Try to find file
    let filePath = path.join(UPLOAD_DIR, filename);
    
    try {
      await statAsync(filePath);
    } catch (error) {
      filePath = path.join(MEDIA_DIR, 'optimized', filename);
      try {
        await statAsync(filePath);
      } catch (error) {
        return new Response(null, { status: 404 });
      }
    }
    
    const stats = await statAsync(filePath);
    const mimeType = getMimeType(filename) || 'application/octet-stream';
    
    return new Response(null, {
      status: 200,
      headers: {
        'Content-Length': stats.size.toString(),
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
        'Last-Modified': stats.mtime.toUTCString(),
        'Cache-Control': 'public, max-age=3600',
      },
    });
    
  } catch (error) {
    console.error('Error getting file metadata:', error);
    return new Response(null, { status: 500 });
  }
}
