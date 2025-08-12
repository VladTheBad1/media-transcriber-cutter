import { mkdir, access, writeFile, readFile, unlink, stat } from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';

export interface StorageConfig {
  uploadDir: string;
  mediaDir: string;
  tempDir: string;
  cacheDir: string;
  maxFileSize: number;
  allowedExtensions: string[];
}

export class MediaStorage {
  private config: StorageConfig;
  
  constructor(config: Partial<StorageConfig> = {}) {
    this.config = {
      uploadDir: process.env.UPLOAD_DIR || './uploads',
      mediaDir: process.env.MEDIA_DIR || './media',
      tempDir: process.env.TEMP_DIR || './temp',
      cacheDir: process.env.CACHE_DIR || './cache',
      maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '5368709120'), // 5GB
      allowedExtensions: [
        'mp4', 'avi', 'mov', 'mkv', 'webm', 'flv', 'm4v', 'wmv', '3gp', 'ogv',
        'mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'wma', 'aiff'
      ],
      ...config
    };
  }
  
  /**
   * Initialize storage directories
   */
  async initialize(): Promise<void> {
    const directories = [
      this.config.uploadDir,
      this.config.mediaDir,
      this.config.tempDir,
      this.config.cacheDir,
      path.join(this.config.mediaDir, 'thumbnails'),
      path.join(this.config.mediaDir, 'optimized'),
      path.join(this.config.mediaDir, 'waveforms'),
      path.join(this.config.mediaDir, 'audio'),
      path.join(this.config.mediaDir, 'exports')
    ];
    
    await Promise.all(
      directories.map(async (dir) => {
        try {
          await access(dir);
        } catch (error) {
          await mkdir(dir, { recursive: true });
          console.log(`Created directory: ${dir}`);
        }
      })
    );
  }
  
  /**
   * Validate file for upload
   */
  validateFile(filename: string, size: number): {
    valid: boolean;
    error?: string;
  } {
    // Check file size
    if (size > this.config.maxFileSize) {
      return {
        valid: false,
        error: `File size ${size} exceeds maximum ${this.config.maxFileSize} bytes`
      };
    }
    
    // Check file extension
    const extension = path.extname(filename).toLowerCase().slice(1);
    if (!this.config.allowedExtensions.includes(extension)) {
      return {
        valid: false,
        error: `File type .${extension} is not supported`
      };
    }
    
    return { valid: true };
  }
  
  /**
   * Generate secure file path for upload
   */
  generateFilePath(
    originalName: string,
    mediaId: string,
    subdir: 'uploads' | 'thumbnails' | 'optimized' | 'waveforms' | 'audio' | 'exports' = 'uploads'
  ): string {
    const extension = path.extname(originalName);
    const timestamp = Date.now();
    const filename = `${mediaId}_${timestamp}${extension}`;
    
    const baseDir = subdir === 'uploads' 
      ? this.config.uploadDir 
      : path.join(this.config.mediaDir, subdir);
    
    return path.join(baseDir, filename);
  }
  
  /**
   * Save file to disk
   */
  async saveFile(
    filePath: string,
    data: Buffer | Uint8Array
  ): Promise<void> {
    const directory = path.dirname(filePath);
    
    // Ensure directory exists
    try {
      await access(directory);
    } catch (error) {
      await mkdir(directory, { recursive: true });
    }
    
    await writeFile(filePath, data);
  }
  
  /**
   * Get file info
   */
  async getFileInfo(filePath: string): Promise<{
    exists: boolean;
    size?: number;
    modified?: Date;
  }> {
    try {
      const stats = await stat(filePath);
      return {
        exists: true,
        size: stats.size,
        modified: stats.mtime
      };
    } catch (error) {
      return { exists: false };
    }
  }
  
  /**
   * Delete file
   */
  async deleteFile(filePath: string): Promise<void> {
    try {
      await unlink(filePath);
      console.log(`Deleted file: ${filePath}`);
    } catch (error) {
      console.warn(`Failed to delete file ${filePath}:`, error);
      throw error;
    }
  }
  
  /**
   * Generate file hash
   */
  async generateFileHash(filePath: string): Promise<string> {
    const data = await readFile(filePath);
    return createHash('sha256').update(data).digest('hex');
  }
  
  /**
   * Check if file exists
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      await access(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Get file URL for serving
   */
  getFileUrl(
    filePath: string,
    type: 'media' | 'thumbnail' | 'waveform' | 'export' = 'media'
  ): string {
    const filename = path.basename(filePath);
    
    switch (type) {
      case 'thumbnail':
        return `/api/media/thumbnail/${filename}`;
      case 'waveform':
        return `/api/media/waveform/${filename}`;
      case 'export':
        return `/api/export/download/${filename}`;
      default:
        return `/api/media/stream/${filename}`;
    }
  }
  
  /**
   * Clean up old temporary files
   */
  async cleanupOldFiles(
    directory: string,
    maxAgeHours: number = 24
  ): Promise<{ cleaned: number; errors: number }> {
    const maxAge = maxAgeHours * 60 * 60 * 1000;
    const cutoffTime = Date.now() - maxAge;
    
    let cleaned = 0;
    let errors = 0;
    
    try {
      const { readdir } = await import('fs/promises');
      const files = await readdir(directory);
      
      await Promise.allSettled(
        files.map(async (filename) => {
          try {
            const filePath = path.join(directory, filename);
            const stats = await stat(filePath);
            
            if (stats.mtime.getTime() < cutoffTime) {
              await unlink(filePath);
              cleaned++;
              console.log(`Cleaned up old file: ${filePath}`);
            }
          } catch (error) {
            errors++;
            console.warn(`Error cleaning up file ${filename}:`, error);
          }
        })
      );
    } catch (error) {
      console.error(`Error reading directory ${directory}:`, error);
      errors++;
    }
    
    return { cleaned, errors };
  }
  
  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{
    directories: Record<string, { files: number; totalSize: number }>;
    totalFiles: number;
    totalSize: number;
  }> {
    const directories = {
      uploads: this.config.uploadDir,
      media: this.config.mediaDir,
      temp: this.config.tempDir,
      cache: this.config.cacheDir
    };
    
    const stats: Record<string, { files: number; totalSize: number }> = {};
    let totalFiles = 0;
    let totalSize = 0;
    
    await Promise.all(
      Object.entries(directories).map(async ([key, dir]) => {
        try {
          const dirStats = await this.getDirectoryStats(dir);
          stats[key] = dirStats;
          totalFiles += dirStats.files;
          totalSize += dirStats.totalSize;
        } catch (error) {
          console.warn(`Error getting stats for ${dir}:`, error);
          stats[key] = { files: 0, totalSize: 0 };
        }
      })
    );
    
    return {
      directories: stats,
      totalFiles,
      totalSize
    };
  }
  
  /**
   * Get directory statistics recursively
   */
  private async getDirectoryStats(
    directory: string
  ): Promise<{ files: number; totalSize: number }> {
    let files = 0;
    let totalSize = 0;
    
    try {
      await access(directory);
      const { readdir } = await import('fs/promises');
      const entries = await readdir(directory, { withFileTypes: true });
      
      await Promise.all(
        entries.map(async (entry) => {
          const fullPath = path.join(directory, entry.name);
          
          if (entry.isDirectory()) {
            const subStats = await this.getDirectoryStats(fullPath);
            files += subStats.files;
            totalSize += subStats.totalSize;
          } else if (entry.isFile()) {
            try {
              const stats = await stat(fullPath);
              files++;
              totalSize += stats.size;
            } catch (error) {
              console.warn(`Error getting stats for ${fullPath}:`, error);
            }
          }
        })
      );
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        throw error;
      }
    }
    
    return { files, totalSize };
  }
  
  /**
   * Get configuration
   */
  getConfig(): StorageConfig {
    return { ...this.config };
  }
}

export default MediaStorage;
