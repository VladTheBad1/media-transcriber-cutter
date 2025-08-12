import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

export interface BrowserProcessingOptions {
  quality?: 'low' | 'medium' | 'high';
  format?: string;
  maxSize?: number;
}

export class BrowserMediaProcessor {
  private ffmpeg: FFmpeg;
  private isLoaded = false;
  private loadingPromise: Promise<void> | null = null;
  
  constructor() {
    this.ffmpeg = new FFmpeg();
  }
  
  /**
   * Initialize FFmpeg.wasm
   */
  async initialize(): Promise<void> {
    if (this.isLoaded) return;
    if (this.loadingPromise) return this.loadingPromise;
    
    this.loadingPromise = this.loadFFmpeg();
    await this.loadingPromise;
    this.isLoaded = true;
    this.loadingPromise = null;
  }
  
  private async loadFFmpeg(): Promise<void> {
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    
    // Set up logging
    this.ffmpeg.on('log', ({ message }) => {
      console.log('[FFmpeg]', message);
    });
    
    this.ffmpeg.on('progress', ({ progress }) => {
      console.log(`[FFmpeg] Progress: ${(progress * 100).toFixed(2)}%`);
    });
    
    // Load FFmpeg
    await this.ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
  }
  
  /**
   * Extract audio from video file in browser
   */
  async extractAudio(
    file: File,
    options: BrowserProcessingOptions = {}
  ): Promise<Blob> {
    await this.initialize();
    
    const { format = 'wav', quality = 'medium' } = options;
    const inputName = `input.${this.getFileExtension(file.name)}`;
    const outputName = `output.${format}`;
    
    try {
      // Write input file
      await this.ffmpeg.writeFile(inputName, await fetchFile(file));
      
      // Build FFmpeg command based on format and quality
      const args = this.buildAudioExtractionArgs(inputName, outputName, format, quality);
      
      // Execute FFmpeg command
      await this.ffmpeg.exec(args);
      
      // Read output file
      const data = await this.ffmpeg.readFile(outputName);
      
      // Clean up
      await this.cleanup([inputName, outputName]);
      
      return new Blob([data], { type: this.getMimeType(format) });
    } catch (error) {
      await this.cleanup([inputName, outputName]);
      throw new Error(`Audio extraction failed: ${error}`);
    }
  }
  
  /**
   * Extract audio optimized for transcription
   */
  async extractAudioForTranscription(file: File): Promise<Blob> {
    await this.initialize();
    
    const inputName = `input.${this.getFileExtension(file.name)}`;
    const outputName = 'transcription_audio.wav';
    
    try {
      await this.ffmpeg.writeFile(inputName, await fetchFile(file));
      
      // Optimized settings for transcription
      await this.ffmpeg.exec([
        '-i', inputName,
        '-ar', '16000',        // 16kHz sample rate
        '-ac', '1',           // Mono channel
        '-f', 'wav',          // WAV format
        '-af', 'highpass=f=80,lowpass=f=8000,dynaudnorm=f=150:g=15', // Audio filters
        outputName
      ]);
      
      const data = await this.ffmpeg.readFile(outputName);
      await this.cleanup([inputName, outputName]);
      
      return new Blob([data], { type: 'audio/wav' });
    } catch (error) {
      await this.cleanup([inputName, outputName]);
      throw new Error(`Transcription audio extraction failed: ${error}`);
    }
  }
  
  /**
   * Generate video thumbnail in browser
   */
  async generateThumbnail(
    file: File,
    timestamp: number = 10,
    size: { width: number; height: number } = { width: 320, height: 240 }
  ): Promise<Blob> {
    await this.initialize();
    
    const inputName = `input.${this.getFileExtension(file.name)}`;
    const outputName = 'thumbnail.jpg';
    
    try {
      await this.ffmpeg.writeFile(inputName, await fetchFile(file));
      
      await this.ffmpeg.exec([
        '-i', inputName,
        '-ss', timestamp.toString(),
        '-frames:v', '1',
        '-vf', `scale=${size.width}:${size.height}:force_original_aspect_ratio=decrease,pad=${size.width}:${size.height}:-1:-1:color=black`,
        '-f', 'image2',
        outputName
      ]);
      
      const data = await this.ffmpeg.readFile(outputName);
      await this.cleanup([inputName, outputName]);
      
      return new Blob([data], { type: 'image/jpeg' });
    } catch (error) {
      await this.cleanup([inputName, outputName]);
      throw new Error(`Thumbnail generation failed: ${error}`);
    }
  }
  
  /**
   * Compress video for web delivery
   */
  async compressVideo(
    file: File,
    options: BrowserProcessingOptions = {}
  ): Promise<Blob> {
    await this.initialize();
    
    const { quality = 'medium', maxSize } = options;
    const inputName = `input.${this.getFileExtension(file.name)}`;
    const outputName = 'compressed.mp4';
    
    const qualitySettings = {
      low: ['-crf', '30', '-preset', 'ultrafast', '-vf', 'scale=640:360'],
      medium: ['-crf', '23', '-preset', 'fast', '-vf', 'scale=1280:720'],
      high: ['-crf', '18', '-preset', 'medium', '-vf', 'scale=1920:1080']
    };
    
    try {
      await this.ffmpeg.writeFile(inputName, await fetchFile(file));
      
      const args = [
        '-i', inputName,
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-b:a', '128k',
        ...qualitySettings[quality],
        '-movflags', 'faststart',
        '-pix_fmt', 'yuv420p',
        '-f', 'mp4',
        outputName
      ];
      
      await this.ffmpeg.exec(args);
      
      const data = await this.ffmpeg.readFile(outputName);
      await this.cleanup([inputName, outputName]);
      
      const compressedBlob = new Blob([data], { type: 'video/mp4' });
      
      // Check size constraint if specified
      if (maxSize && compressedBlob.size > maxSize) {
        throw new Error(`Compressed file size ${compressedBlob.size} exceeds maximum ${maxSize}`);
      }
      
      return compressedBlob;
    } catch (error) {
      await this.cleanup([inputName, outputName]);
      throw new Error(`Video compression failed: ${error}`);
    }
  }
  
  /**
   * Get basic media information
   */
  async getMediaInfo(file: File): Promise<{
    duration?: number;
    format?: string;
    size: number;
  }> {
    // For browser implementation, we'll use a simpler approach
    // In a real implementation, you might use ffprobe equivalent
    
    if (file.type.startsWith('video/')) {
      return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        
        video.onloadedmetadata = () => {
          resolve({
            duration: video.duration,
            format: file.type,
            size: file.size
          });
        };
        
        video.onerror = () => {
          reject(new Error('Failed to load video metadata'));
        };
        
        video.src = URL.createObjectURL(file);
      });
    } else if (file.type.startsWith('audio/')) {
      return new Promise((resolve, reject) => {
        const audio = document.createElement('audio');
        audio.preload = 'metadata';
        
        audio.onloadedmetadata = () => {
          resolve({
            duration: audio.duration,
            format: file.type,
            size: file.size
          });
        };
        
        audio.onerror = () => {
          reject(new Error('Failed to load audio metadata'));
        };
        
        audio.src = URL.createObjectURL(file);
      });
    }
    
    return {
      format: file.type,
      size: file.size
    };
  }
  
  /**
   * Build FFmpeg arguments for audio extraction
   */
  private buildAudioExtractionArgs(
    input: string,
    output: string,
    format: string,
    quality: string
  ): string[] {
    const baseArgs = ['-i', input];
    
    switch (format) {
      case 'mp3':
        const mp3Quality = quality === 'high' ? '192k' : quality === 'low' ? '96k' : '128k';
        return [...baseArgs, '-acodec', 'libmp3lame', '-b:a', mp3Quality, '-f', 'mp3', output];
      
      case 'wav':
        const sampleRate = quality === 'high' ? '48000' : quality === 'low' ? '22050' : '44100';
        return [...baseArgs, '-ar', sampleRate, '-f', 'wav', output];
      
      case 'aac':
        const aacBitrate = quality === 'high' ? '256k' : quality === 'low' ? '96k' : '128k';
        return [...baseArgs, '-c:a', 'aac', '-b:a', aacBitrate, '-f', 'adts', output];
      
      default:
        return [...baseArgs, '-f', format, output];
    }
  }
  
  /**
   * Get file extension from filename
   */
  private getFileExtension(filename: string): string {
    return filename.split('.').pop()?.toLowerCase() || 'mp4';
  }
  
  /**
   * Get MIME type for audio format
   */
  private getMimeType(format: string): string {
    const mimeTypes: Record<string, string> = {
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'aac': 'audio/aac',
      'ogg': 'audio/ogg',
      'flac': 'audio/flac'
    };
    
    return mimeTypes[format] || 'audio/mpeg';
  }
  
  /**
   * Clean up temporary files in FFmpeg memory
   */
  private async cleanup(filenames: string[]): Promise<void> {
    for (const filename of filenames) {
      try {
        await this.ffmpeg.deleteFile(filename);
      } catch (error) {
        // Ignore cleanup errors
        console.warn(`Failed to cleanup ${filename}:`, error);
      }
    }
  }
  
  /**
   * Check if FFmpeg is loaded and ready
   */
  isReady(): boolean {
    return this.isLoaded;
  }
  
  /**
   * Terminate FFmpeg instance
   */
  async terminate(): Promise<void> {
    if (this.isLoaded) {
      await this.ffmpeg.terminate();
      this.isLoaded = false;
    }
  }
}

export default BrowserMediaProcessor;
