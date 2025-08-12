import { NextRequest, NextResponse } from 'next/server';
import { createReadStream, stat } from 'fs';
import { promisify } from 'util';
import path from 'path';

const statAsync = promisify(stat);

interface RouteParams {
  params: {
    filename: string;
  };
}

const MEDIA_DIR = process.env.MEDIA_DIR || './media';

/**
 * GET /api/media/thumbnail/[filename] - Serve thumbnail images
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
    
    const filePath = path.join(MEDIA_DIR, 'thumbnails', filename);
    
    try {
      const stats = await statAsync(filePath);
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
          'Content-Type': 'image/jpeg',
          'Content-Length': stats.size.toString(),
          'Cache-Control': 'public, max-age=86400', // 24 hours
          'Last-Modified': stats.mtime.toUTCString(),
        },
      });
      
    } catch (error) {
      return NextResponse.json(
        { error: 'Thumbnail not found' },
        { status: 404 }
      );
    }
    
  } catch (error) {
    console.error('Error serving thumbnail:', error);
    return NextResponse.json(
      { error: 'Failed to serve thumbnail' },
      { status: 500 }
    );
  }
}

/**
 * HEAD /api/media/thumbnail/[filename] - Get thumbnail metadata
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
    
    const filePath = path.join(MEDIA_DIR, 'thumbnails', filename);
    
    try {
      const stats = await statAsync(filePath);
      
      return new Response(null, {
        status: 200,
        headers: {
          'Content-Type': 'image/jpeg',
          'Content-Length': stats.size.toString(),
          'Last-Modified': stats.mtime.toUTCString(),
          'Cache-Control': 'public, max-age=86400',
        },
      });
      
    } catch (error) {
      return new Response(null, { status: 404 });
    }
    
  } catch (error) {
    console.error('Error getting thumbnail metadata:', error);
    return new Response(null, { status: 500 });
  }
}
