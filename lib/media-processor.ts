import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { mkdir } from 'fs/promises';

const execAsync = promisify(exec);

export interface MediaInfo {
  duration: number;
  width?: number;
  height?: number;
  framerate?: number;
  bitrate?: number;
  codec?: string;
  audioChannels?: number;
}

export class MediaProcessor {
  private static thumbnailsDir = path.join(process.cwd(), 'public', 'thumbnails');

  /**
   * Extract media information using FFprobe
   */
  static async getMediaInfo(filePath: string): Promise<MediaInfo> {
    try {
      const { stdout } = await execAsync(
        `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`
      );
      
      const data = JSON.parse(stdout);
      const videoStream = data.streams?.find((s: any) => s.codec_type === 'video');
      const audioStream = data.streams?.find((s: any) => s.codec_type === 'audio');
      
      const duration = parseFloat(data.format?.duration || '0');
      
      return {
        duration,
        width: videoStream?.width,
        height: videoStream?.height,
        framerate: videoStream?.r_frame_rate ? 
          (() => {
            const parts = videoStream.r_frame_rate.split('/');
            return parts.length === 2 ? parseFloat(parts[0]) / parseFloat(parts[1]) : parseFloat(videoStream.r_frame_rate);
          })() : undefined,
        bitrate: parseInt(data.format?.bit_rate || '0'),
        codec: videoStream?.codec_name,
        audioChannels: audioStream?.channels,
      };
    } catch (error) {
      console.error('Failed to get media info:', error);
      return { duration: 0 };
    }
  }

  /**
   * Generate thumbnail from video
   */
  static async generateThumbnail(
    videoPath: string, 
    outputName: string,
    timestamp: number = 1
  ): Promise<string | null> {
    try {
      // Ensure thumbnails directory exists
      await mkdir(this.thumbnailsDir, { recursive: true });
      
      const thumbnailPath = path.join(this.thumbnailsDir, `${outputName}.jpg`);
      
      // Generate thumbnail at specified timestamp
      await execAsync(
        `ffmpeg -i "${videoPath}" -ss ${timestamp} -vframes 1 -vf "scale=320:-1" -q:v 2 "${thumbnailPath}"`
      );
      
      return `/thumbnails/${outputName}.jpg`;
    } catch (error) {
      console.error('Failed to generate thumbnail:', error);
      return null;
    }
  }

  /**
   * Generate waveform image from audio/video
   */
  static async generateWaveform(
    mediaPath: string,
    outputName: string
  ): Promise<string | null> {
    try {
      // Ensure thumbnails directory exists
      await mkdir(this.thumbnailsDir, { recursive: true });
      
      const waveformPath = path.join(this.thumbnailsDir, `${outputName}_waveform.png`);
      
      // Generate waveform visualization
      await execAsync(
        `ffmpeg -i "${mediaPath}" -filter_complex "showwavespic=s=640x120:colors=white" -frames:v 1 "${waveformPath}"`
      );
      
      return `/thumbnails/${outputName}_waveform.png`;
    } catch (error) {
      console.error('Failed to generate waveform:', error);
      return null;
    }
  }

  /**
   * Extract audio from video file
   */
  static async extractAudio(
    videoPath: string,
    outputPath: string
  ): Promise<boolean> {
    try {
      await execAsync(
        `ffmpeg -i "${videoPath}" -vn -acodec pcm_s16le -ar 44100 -ac 2 "${outputPath}"`
      );
      return true;
    } catch (error) {
      console.error('Failed to extract audio:', error);
      return false;
    }
  }
}