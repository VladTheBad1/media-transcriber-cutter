import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import MediaProcessor, { MediaMetadata } from '@/lib/media/ffmpeg';
import MediaProcessingQueue, { MediaProcessingJob } from '@/lib/media/queue';

const prisma = new PrismaClient();
const processor = new MediaProcessor();
const queue = new MediaProcessingQueue({ maxConcurrent: 3 });

// Configure upload directories
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const MEDIA_DIR = process.env.MEDIA_DIR || './media';
const TEMP_DIR = process.env.TEMP_DIR || './temp';
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '5368709120'); // 5GB

// Supported file formats
const SUPPORTED_VIDEO_FORMATS = [
  'mp4', 'avi', 'mov', 'mkv', 'webm', 'flv', 'm4v', 'wmv', '3gp', 'ogv'
];
const SUPPORTED_AUDIO_FORMATS = [
  'mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'wma', 'aiff'
];

export async function POST(request: NextRequest) {
  try {
    // Ensure directories exist
    await ensureDirectoriesExist();
    
    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const metadataStr = formData.get('metadata') as string;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }
    
    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size ${file.size} exceeds maximum ${MAX_FILE_SIZE} bytes` },
        { status: 413 }
      );
    }
    
    // Validate file format
    const fileExtension = path.extname(file.name).toLowerCase().slice(1);
    const isVideo = SUPPORTED_VIDEO_FORMATS.includes(fileExtension);
    const isAudio = SUPPORTED_AUDIO_FORMATS.includes(fileExtension);
    
    if (!isVideo && !isAudio) {
      return NextResponse.json(
        { error: `Unsupported file format: ${fileExtension}` },
        { status: 400 }
      );
    }
    
    // Parse metadata
    let metadata = {};
    try {
      if (metadataStr) {
        metadata = JSON.parse(metadataStr);
      }
    } catch (error) {
      console.warn('Invalid metadata JSON:', metadataStr);
    }
    
    // Generate unique file ID and paths
    const mediaId = uuidv4();
    const originalName = file.name;
    const filename = `${mediaId}_${Date.now()}.${fileExtension}`;
    const filePath = path.join(UPLOAD_DIR, filename);
    
    // Save file to disk
    const bytes = await file.arrayBuffer();
    await writeFile(filePath, Buffer.from(bytes));
    
    console.log(`File uploaded: ${filename} (${file.size} bytes)`);
    
    // Extract media metadata using FFmpeg
    let mediaMetadata: MediaMetadata;
    try {
      mediaMetadata = await processor.getMediaMetadata(filePath);
    } catch (error) {
      console.error('Failed to extract metadata:', error);
      // Use basic metadata if FFmpeg fails
      mediaMetadata = {
        duration: 0,
        format: fileExtension,
        size: file.size
      };
    }
    
    // Create database record
    const mediaFile = await prisma.mediaFile.create({
      data: {
        id: mediaId,
        filename,
        originalName,
        title: (metadata as any)?.title || originalName.replace(/\.[^/.]+$/, ''),
        description: (metadata as any)?.description,
        type: isVideo ? 'VIDEO' : 'AUDIO',
        format: mediaMetadata.format,
        codec: mediaMetadata.codec,
        size: BigInt(file.size),
        duration: mediaMetadata.duration,
        bitrate: mediaMetadata.bitrate,
        resolution: mediaMetadata.resolution 
          ? `${mediaMetadata.resolution.width}x${mediaMetadata.resolution.height}`
          : null,
        framerate: mediaMetadata.framerate,
        audioChannels: mediaMetadata.audioChannels,
        filePath,
        metadata: JSON.stringify({
          ...mediaMetadata,
          uploadTimestamp: Date.now(),
          originalMetadata: metadata
        }),
        tags: JSON.stringify((metadata as any)?.tags || []),
        category: (metadata as any)?.category,
        status: 'PROCESSING'
      }
    });
    
    // Queue initial processing jobs
    const jobs = await queueInitialProcessing(mediaFile, filePath, isVideo);
    
    // Return upload response
    return NextResponse.json({
      mediaId: mediaFile.id,
      filename: mediaFile.filename,
      originalName: mediaFile.originalName,
      type: mediaFile.type.toLowerCase(),
      size: Number(mediaFile.size),
      duration: mediaFile.duration,
      format: mediaFile.format,
      status: 'processing',
      processingJobs: jobs.map(job => job.id),
      metadata: {
        resolution: mediaFile.resolution,
        framerate: mediaFile.framerate,
        audioChannels: mediaFile.audioChannels,
        bitrate: mediaFile.bitrate
      }
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { 
        error: 'Upload failed', 
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * Queue initial processing jobs for uploaded media
 */
async function queueInitialProcessing(
  mediaFile: any,
  filePath: string,
  isVideo: boolean
): Promise<MediaProcessingJob[]> {
  const jobs: MediaProcessingJob[] = [];
  
  // Always extract audio for transcription
  const audioJob: MediaProcessingJob = {
    id: `audio_${mediaFile.id}_${Date.now()}`,
    type: 'transcription-prep',
    mediaFileId: mediaFile.id,
    inputPath: filePath,
    outputDir: TEMP_DIR,
    priority: 10
  };
  jobs.push(audioJob);
  await queue.addJob(audioJob);
  
  // Generate thumbnail for video files
  if (isVideo) {
    const thumbnailJob: MediaProcessingJob = {
      id: `thumb_${mediaFile.id}_${Date.now()}`,
      type: 'thumbnail-generation',
      mediaFileId: mediaFile.id,
      inputPath: filePath,
      outputDir: path.join(MEDIA_DIR, 'thumbnails'),
      priority: 8,
      options: {
        timestamp: 10,
        generateSprite: true
      }
    };
    jobs.push(thumbnailJob);
    await queue.addJob(thumbnailJob);
    
    // Optimize for web delivery
    const optimizeJob: MediaProcessingJob = {
      id: `optimize_${mediaFile.id}_${Date.now()}`,
      type: 'video-optimization',
      mediaFileId: mediaFile.id,
      inputPath: filePath,
      outputDir: path.join(MEDIA_DIR, 'optimized'),
      priority: 5,
      options: {
        quality: 'medium',
        maxWidth: 1920,
        maxHeight: 1080
      }
    };
    jobs.push(optimizeJob);
    await queue.addJob(optimizeJob);
  }
  
  // Generate waveform for all media
  const waveformJob: MediaProcessingJob = {
    id: `waveform_${mediaFile.id}_${Date.now()}`,
    type: 'waveform-generation',
    mediaFileId: mediaFile.id,
    inputPath: filePath,
    outputDir: path.join(MEDIA_DIR, 'waveforms'),
    priority: 6,
    options: {
      width: 1000,
      height: 100,
      samples: 1000
    }
  };
  jobs.push(waveformJob);
  await queue.addJob(waveformJob);
  
  return jobs;
}

/**
 * Ensure required directories exist
 */
async function ensureDirectoriesExist(): Promise<void> {
  const dirs = [
    UPLOAD_DIR,
    MEDIA_DIR,
    TEMP_DIR,
    path.join(MEDIA_DIR, 'thumbnails'),
    path.join(MEDIA_DIR, 'optimized'),
    path.join(MEDIA_DIR, 'waveforms')
  ];
  
  await Promise.all(
    dirs.map(async (dir) => {
      try {
        await mkdir(dir, { recursive: true });
      } catch (error) {
        if ((error as any).code !== 'EEXIST') {
          throw error;
        }
      }
    })
  );
}

// Handle OPTIONS for CORS
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
