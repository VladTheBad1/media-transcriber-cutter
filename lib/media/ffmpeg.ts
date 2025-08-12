import ffmpeg from 'fluent-ffmpeg';
import { promisify } from 'util';
import { pipeline } from 'stream';
import fs from 'fs/promises';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const streamPipeline = promisify(pipeline);
const prisma = new PrismaClient();

export interface AudioExtractionOptions {
  sampleRate?: number;
  channels?: number;
  format?: string;
  bitrate?: string;
  audioFilters?: string[];
}

export interface ProcessingResult {
  success: boolean;
  outputPath: string;
  metadata?: any;
  error?: string;
}

export interface MediaMetadata {
  duration: number;
  format: string;
  codec?: string;
  bitrate?: number;
  resolution?: { width: number; height: number };
  framerate?: number;
  audioChannels?: number;
  size: number;
}

export class MediaProcessingError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'MediaProcessingError';
  }
}

export class MediaProcessor {
  private ffmpegPath: string;
  private tempDir: string;
  private mediaDir: string;
  
  constructor(options?: {
    ffmpegPath?: string;
    tempDir?: string;
    mediaDir?: string;
  }) {
    this.ffmpegPath = options?.ffmpegPath || 'ffmpeg';
    this.tempDir = options?.tempDir || './temp';
    this.mediaDir = options?.mediaDir || './media';
    
    // Set FFmpeg path if provided
    if (this.ffmpegPath !== 'ffmpeg') {
      ffmpeg.setFfmpegPath(this.ffmpegPath);
    }
  }
  
  /**
   * Extract and optimize audio from video for transcription
   */
  async optimizeForTranscription(
    inputPath: string,
    outputDir?: string
  ): Promise<ProcessingResult> {
    try {
      const outputPath = path.join(
        outputDir || this.tempDir,
        `${path.basename(inputPath, path.extname(inputPath))}_transcription.wav`
      );
      
      await this.extractAudio(inputPath, outputPath, {
        sampleRate: 16000,
        channels: 1,
        format: 'wav',
        audioFilters: [
          'highpass=f=80',        // Remove low-frequency noise
          'lowpass=f=8000',       // Remove high-frequency noise
          'dynaudnorm=f=150:g=15' // Normalize audio levels
        ]
      });
      
      return {
        success: true,
        outputPath,
        metadata: await this.getMediaMetadata(outputPath)
      };
    } catch (error) {
      throw new MediaProcessingError(
        `Transcription optimization failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
  
  /**
   * Extract audio from video file
   */
  async extractAudio(
    inputPath: string,
    outputPath: string,
    options: AudioExtractionOptions = {}
  ): Promise<ProcessingResult> {
    const {
      sampleRate = 44100,
      channels = 2,
      format = 'mp3',
      bitrate = '128k',
      audioFilters = []
    } = options;
    
    return new Promise((resolve, reject) => {
      let command = ffmpeg(inputPath)
        .audioFrequency(sampleRate)
        .audioChannels(channels)
        .audioBitrate(bitrate)
        .format(format);
      
      // Apply audio filters if provided
      if (audioFilters.length > 0) {
        command = command.audioFilters(audioFilters);
      }
      
      command
        .on('start', (commandLine) => {
          console.log('FFmpeg started:', commandLine);
        })
        .on('progress', (progress) => {
          console.log(`Audio extraction progress: ${progress.percent?.toFixed(2)}%`);
        })
        .on('end', async () => {
          try {
            const metadata = await this.getMediaMetadata(outputPath);
            resolve({
              success: true,
              outputPath,
              metadata
            });
          } catch (error) {
            resolve({
              success: true,
              outputPath
            });
          }
        })
        .on('error', (err) => {
          reject(new MediaProcessingError(`Audio extraction failed: ${err.message}`));
        })
        .save(outputPath);
    });
  }
  
  /**
   * Generate thumbnail from video
   */
  async generateThumbnail(
    videoPath: string,
    timestamp: number = 10,
    outputDir?: string
  ): Promise<string> {
    const outputPath = path.join(
      outputDir || this.tempDir,
      `${path.basename(videoPath, path.extname(videoPath))}_thumb_${timestamp}s.jpg`
    );
    
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .seekInput(timestamp)
        .frames(1)
        .size('320x240')
        .aspect('16:9')
        .format('image2')
        .on('start', (commandLine) => {
          console.log('Thumbnail generation started:', commandLine);
        })
        .on('end', () => {
          console.log('Thumbnail generated successfully');
          resolve(outputPath);
        })
        .on('error', (err) => {
          reject(new MediaProcessingError(`Thumbnail generation failed: ${err.message}`));
        })
        .save(outputPath);
    });
  }
  
  /**
   * Generate multiple thumbnails for video scrubbing
   */
  async generateThumbnailSprite(
    videoPath: string,
    count: number = 20,
    outputDir?: string
  ): Promise<{ spritePath: string; thumbnails: string[] }> {
    const metadata = await this.getMediaMetadata(videoPath);
    const duration = metadata.duration;
    const interval = duration / count;
    const thumbnails: string[] = [];
    
    // Generate individual thumbnails
    for (let i = 0; i < count; i++) {
      const timestamp = i * interval;
      const thumbnailPath = await this.generateThumbnail(
        videoPath,
        timestamp,
        outputDir
      );
      thumbnails.push(thumbnailPath);
    }
    
    // Create sprite sheet (simplified implementation)
    const spritePath = path.join(
      outputDir || this.tempDir,
      `${path.basename(videoPath, path.extname(videoPath))}_sprite.jpg`
    );
    
    return { spritePath, thumbnails };
  }
  
  /**
   * Generate video preview (short clip)
   */
  async generatePreview(
    videoPath: string,
    startTime: number = 0,
    duration: number = 30,
    outputDir?: string
  ): Promise<string> {
    const outputPath = path.join(
      outputDir || this.tempDir,
      `${path.basename(videoPath, path.extname(videoPath))}_preview.mp4`
    );
    
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .seekInput(startTime)
        .duration(duration)
        .size('640x480')
        .videoBitrate('500k')
        .audioBitrate('64k')
        .format('mp4')
        .outputOptions([
          '-movflags', 'faststart', // Optimize for web playback
          '-preset', 'fast'
        ])
        .on('start', (commandLine) => {
          console.log('Preview generation started:', commandLine);
        })
        .on('progress', (progress) => {
          console.log(`Preview progress: ${progress.percent?.toFixed(2)}%`);
        })
        .on('end', () => {
          console.log('Preview generated successfully');
          resolve(outputPath);
        })
        .on('error', (err) => {
          reject(new MediaProcessingError(`Preview generation failed: ${err.message}`));
        })
        .save(outputPath);
    });
  }
  
  /**
   * Get comprehensive media metadata
   */
  async getMediaMetadata(filePath: string): Promise<MediaMetadata> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          reject(new MediaProcessingError(`Metadata extraction failed: ${err.message}`));
          return;
        }
        
        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
        
        resolve({
          duration: metadata.format.duration || 0,
          format: metadata.format.format_name || 'unknown',
          codec: videoStream?.codec_name || audioStream?.codec_name,
          bitrate: parseInt(String(metadata.format.bit_rate || '0')),
          resolution: videoStream ? {
            width: videoStream.width || 0,
            height: videoStream.height || 0
          } : undefined,
          framerate: videoStream ? this.parseFramerate(videoStream.r_frame_rate) : undefined,
          audioChannels: audioStream?.channels,
          size: parseInt(String(metadata.format.size || '0'))
        });
      });
    });
  }
  
  /**
   * Generate waveform data for audio visualization
   */
  async generateWaveform(
    audioPath: string,
    outputDir?: string,
    options?: {
      width?: number;
      height?: number;
      samples?: number;
    }
  ): Promise<{ waveformPath: string; peaksData: number[] }> {
    const {
      width = 1000,
      height = 100,
      samples = 1000
    } = options || {};
    
    const waveformPath = path.join(
      outputDir || this.tempDir,
      `${path.basename(audioPath, path.extname(audioPath))}_waveform.png`
    );
    
    // Generate visual waveform
    return new Promise((resolve, reject) => {
      ffmpeg(audioPath)
        .complexFilter([
          `[0:a]showwavespic=s=${width}x${height}:colors=blue[v]`
        ])
        .map('[v]')
        .frames(1)
        .format('png')
        .on('end', async () => {
          // Extract peaks data for programmatic use
          const peaksData = await this.extractAudioPeaks(audioPath, samples);
          resolve({ waveformPath, peaksData });
        })
        .on('error', (err) => {
          reject(new MediaProcessingError(`Waveform generation failed: ${err.message}`));
        })
        .save(waveformPath);
    });
  }
  
  /**
   * Extract audio peaks data for waveform visualization
   */
  private async extractAudioPeaks(audioPath: string, samples: number): Promise<number[]> {
    return new Promise((resolve, reject) => {
      const peaks: number[] = [];
      
      ffmpeg(audioPath)
        .format('f32le')
        .audioChannels(1)
        .on('end', () => {
          // Simplified: return mock data for now
          // In a real implementation, you'd parse the audio data
          const mockPeaks = Array.from({ length: samples }, (_, i) => 
            Math.sin(i / 10) * Math.random() * 0.8
          );
          resolve(mockPeaks);
        })
        .on('error', (err) => {
          reject(new MediaProcessingError(`Peaks extraction failed: ${err.message}`));
        })
        .pipe() // This would need proper stream handling in production
        .on('data', (chunk) => {
          // Process audio data chunks to extract peaks
          // Implementation would parse Float32Array data
        });
    });
  }
  
  /**
   * Convert video to web-optimized format
   */
  async optimizeForWeb(
    inputPath: string,
    outputPath: string,
    options?: {
      quality?: 'low' | 'medium' | 'high' | 'ultra';
      maxWidth?: number;
      maxHeight?: number;
    }
  ): Promise<ProcessingResult> {
    const { quality = 'medium', maxWidth = 1920, maxHeight = 1080 } = options || {};
    
    const qualitySettings = {
      low: { crf: '30', preset: 'fast', maxBitrate: '1000k' },
      medium: { crf: '23', preset: 'medium', maxBitrate: '2500k' },
      high: { crf: '18', preset: 'slow', maxBitrate: '5000k' },
      ultra: { crf: '15', preset: 'slower', maxBitrate: '10000k' }
    };
    
    const settings = qualitySettings[quality];
    
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .size(`${maxWidth}x${maxHeight}`)
        .aspect('16:9')
        .outputOptions([
          '-crf', settings.crf,
          '-preset', settings.preset,
          '-maxrate', settings.maxBitrate,
          '-bufsize', '2000k',
          '-movflags', 'faststart',
          '-pix_fmt', 'yuv420p'
        ])
        .format('mp4')
        .on('start', (commandLine) => {
          console.log('Web optimization started:', commandLine);
        })
        .on('progress', (progress) => {
          console.log(`Optimization progress: ${progress.percent?.toFixed(2)}%`);
        })
        .on('end', async () => {
          try {
            const metadata = await this.getMediaMetadata(outputPath);
            resolve({
              success: true,
              outputPath,
              metadata
            });
          } catch (error) {
            resolve({
              success: true,
              outputPath
            });
          }
        })
        .on('error', (err) => {
          reject(new MediaProcessingError(`Web optimization failed: ${err.message}`));
        })
        .save(outputPath);
    });
  }
  
  /**
   * Parse framerate from FFmpeg format
   */
  private parseFramerate(framerateStr?: string): number | undefined {
    if (!framerateStr) return undefined;
    
    const parts = framerateStr.split('/');
    if (parts.length === 2) {
      const numerator = parseInt(parts[0]);
      const denominator = parseInt(parts[1]);
      return denominator > 0 ? numerator / denominator : undefined;
    }
    
    return parseFloat(framerateStr) || undefined;
  }
  
  /**
   * Clean up temporary files
   */
  async cleanup(filePaths: string[]): Promise<void> {
    await Promise.allSettled(
      filePaths.map(async (filePath) => {
        try {
          await fs.unlink(filePath);
          console.log(`Cleaned up: ${filePath}`);
        } catch (error) {
          console.warn(`Failed to cleanup ${filePath}:`, error);
        }
      })
    );
  }
}

export default MediaProcessor;
