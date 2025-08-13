/**
 * Transcription Library - Main exports
 * 
 * Production-ready WhisperX integration with speaker diarization,
 * OpenAI Whisper API fallback, and intelligent job queue management.
 */

// Core transcription services
export { WhisperXTranscriber } from './whisperx';
export { OpenAITranscriber } from './openai';
export { TranscriptionService } from './service';
export { TranscriptionQueue } from './queue';

// Types and interfaces
export type {
  TranscriptionOptions,
  TranscriptionResult,
  TranscriptionSegment,
  WordTimestamp,
  Speaker,
} from './whisperx';

export type {
  OpenAITranscriptionOptions,
} from './openai';

export type {
  TranscriptionServiceConfig,
  TranscriptionJob,
  TranscriptionProgress,
} from './service';

export type {
  QueueJob,
  QueueConfig,
} from './queue';

// Default service instances
import TranscriptionService from './service';
import TranscriptionQueue from './queue';

// Create default transcription service
export const transcriptionService = new TranscriptionService({
  pythonPath: process.env.PYTHON_PATH || '/Users/vp/SAZ Projects/transcriber-cutter/venv_whisperx/bin/python',
  whisperxScript: process.env.WHISPERX_SCRIPT_PATH,
  tempDir: process.env.TRANSCRIPTION_TEMP_DIR || './temp/transcription',
  enableWhisperX: process.env.ENABLE_WHISPERX !== 'false',
  openaiApiKey: process.env.OPENAI_API_KEY,
  enableOpenAI: process.env.ENABLE_OPENAI_WHISPER !== 'false',
  fallbackStrategy: (process.env.TRANSCRIPTION_FALLBACK_STRATEGY as any) || 'whisperx-first',
  maxRetries: parseInt(process.env.TRANSCRIPTION_MAX_RETRIES || '3'),
  retryDelay: parseInt(process.env.TRANSCRIPTION_RETRY_DELAY || '5000'),
  enableProgressTracking: process.env.TRANSCRIPTION_PROGRESS_TRACKING !== 'false',
});

// Create default transcription queue
export const transcriptionQueue = new TranscriptionQueue(
  {
    pythonPath: process.env.PYTHON_PATH || '/Users/vp/SAZ Projects/transcriber-cutter/venv_whisperx/bin/python',
    whisperxScript: process.env.WHISPERX_SCRIPT_PATH,
    tempDir: process.env.TRANSCRIPTION_TEMP_DIR || './temp/transcription',
    enableWhisperX: process.env.ENABLE_WHISPERX !== 'false',
    openaiApiKey: process.env.OPENAI_API_KEY,
    enableOpenAI: process.env.ENABLE_OPENAI_WHISPER !== 'false',
    fallbackStrategy: (process.env.TRANSCRIPTION_FALLBACK_STRATEGY as any) || 'whisperx-first',
    maxRetries: parseInt(process.env.TRANSCRIPTION_MAX_RETRIES || '3'),
    retryDelay: parseInt(process.env.TRANSCRIPTION_RETRY_DELAY || '5000'),
  },
  {
    concurrency: parseInt(process.env.TRANSCRIPTION_CONCURRENCY || '2'),
    maxAttempts: parseInt(process.env.TRANSCRIPTION_MAX_ATTEMPTS || '3'),
    retryDelay: parseInt(process.env.TRANSCRIPTION_RETRY_DELAY || '5000'),
    jobTimeout: parseInt(process.env.TRANSCRIPTION_JOB_TIMEOUT || (30 * 60 * 1000).toString()),
    cleanupInterval: parseInt(process.env.TRANSCRIPTION_CLEANUP_INTERVAL || (60 * 60 * 1000).toString()),
    maxCompletedAge: parseInt(process.env.TRANSCRIPTION_MAX_COMPLETED_AGE || (24 * 60 * 60 * 1000).toString()),
  }
);

// Initialize services on import (server-side only, but not during build)
if (typeof window === 'undefined' && process.env.NODE_ENV !== 'production' && !process.env.NEXT_PHASE) {
  transcriptionService.initialize().catch(error => {
    console.error('Failed to initialize transcription service:', error);
  });
  
  transcriptionQueue.initialize().catch(error => {
    console.error('Failed to initialize transcription queue:', error);
  });
}

// Utility functions
export const transcriptionUtils = {
  /**
   * Convert seconds to formatted timestamp string
   */
  formatTimestamp: (seconds: number, includeMilliseconds: boolean = false): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);

    if (hours > 0) {
      const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      return includeMilliseconds ? `${timeStr}.${ms.toString().padStart(3, '0')}` : timeStr;
    } else {
      const timeStr = `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      return includeMilliseconds ? `${timeStr}.${ms.toString().padStart(3, '0')}` : timeStr;
    }
  },

  /**
   * Parse timestamp string to seconds
   */
  parseTimestamp: (timestamp: string): number => {
    const parts = timestamp.split(':');
    let seconds = 0;
    
    if (parts.length === 3) {
      // HH:MM:SS or HH:MM:SS.mmm format
      seconds += parseInt(parts[0]) * 3600; // hours
      seconds += parseInt(parts[1]) * 60;   // minutes
      const secParts = parts[2].split('.');
      seconds += parseInt(secParts[0]);     // seconds
      if (secParts[1]) {
        seconds += parseInt(secParts[1].padEnd(3, '0')) / 1000; // milliseconds
      }
    } else if (parts.length === 2) {
      // MM:SS or MM:SS.mmm format
      seconds += parseInt(parts[0]) * 60;   // minutes
      const secParts = parts[1].split('.');
      seconds += parseInt(secParts[0]);     // seconds
      if (secParts[1]) {
        seconds += parseInt(secParts[1].padEnd(3, '0')) / 1000; // milliseconds
      }
    }
    
    return seconds;
  },

  /**
   * Convert transcript to SRT format
   */
  toSRT: (segments: any[]): string => { // TODO: Fix TranscriptionSegment type
    let srt = '';
    
    segments.forEach((segment, index) => {
      const startTime = transcriptionUtils.formatTimestamp(segment.start, true).replace('.', ',');
      const endTime = transcriptionUtils.formatTimestamp(segment.end, true).replace('.', ',');
      
      srt += `${index + 1}\n`;
      srt += `${startTime} --> ${endTime}\n`;
      srt += `${segment.text}\n\n`;
    });
    
    return srt.trim();
  },

  /**
   * Convert transcript to VTT format
   */
  toVTT: (segments: any[]): string => { // TODO: Fix TranscriptionSegment type
    let vtt = 'WEBVTT\n\n';
    
    segments.forEach((segment) => {
      const startTime = transcriptionUtils.formatTimestamp(segment.start, true);
      const endTime = transcriptionUtils.formatTimestamp(segment.end, true);
      
      vtt += `${startTime} --> ${endTime}\n`;
      if (segment.speaker) {
        vtt += `<v ${segment.speaker.label}>${segment.text}\n\n`;
      } else {
        vtt += `${segment.text}\n\n`;
      }
    });
    
    return vtt.trim();
  },

  /**
   * Convert transcript to plain text
   */
  toPlainText: (segments: any[], includeSpeakers: boolean = false, includeTimestamps: boolean = false): string => { // TODO: Fix TranscriptionSegment type
    return segments.map(segment => {
      let line = '';
      
      if (includeTimestamps) {
        line += `[${transcriptionUtils.formatTimestamp(segment.start)}] `;
      }
      
      if (includeSpeakers && segment.speaker) {
        line += `${segment.speaker.label}: `;
      }
      
      line += segment.text;
      return line;
    }).join('\n');
  },

  /**
   * Calculate transcript statistics
   */
  getStats: (segments: any[]) => { // TODO: Fix TranscriptionSegment type
    const totalDuration = segments.length > 0 ? Math.max(...segments.map(s => s.end)) : 0;
    const totalWords = segments.reduce((sum, segment) => {
      return sum + segment.text.split(/\s+/).filter(word => word.length > 0).length;
    }, 0);
    
    const speakers = new Set(
      segments
        .map(s => s.speaker?.label)
        .filter(Boolean)
    );
    
    const averageConfidence = segments.length > 0 
      ? segments.reduce((sum, seg) => sum + seg.confidence, 0) / segments.length
      : 0;

    return {
      totalDuration,
      totalWords,
      totalSegments: segments.length,
      speakerCount: speakers.size,
      averageConfidence,
      wordsPerMinute: totalDuration > 0 ? (totalWords / (totalDuration / 60)) : 0,
    };
  },

  /**
   * Filter segments by confidence threshold
   */
  filterByConfidence: (segments: any[], threshold: number): any[] => { // TODO: Fix TranscriptionSegment type
    return segments.filter(segment => segment.confidence >= threshold);
  },

  /**
   * Filter segments by speaker
   */
  filterBySpeaker: (segments: any[], speakerLabel: string): any[] => { // TODO: Fix TranscriptionSegment type
    return segments.filter(segment => segment.speaker?.label === speakerLabel);
  },

  /**
   * Get segments within time range
   */
  getSegmentsInRange: (segments: any[], startTime: number, endTime: number): any[] => { // TODO: Fix TranscriptionSegment type
    return segments.filter(segment => 
      segment.start < endTime && segment.end > startTime
    );
  },

  /**
   * Merge consecutive segments from same speaker
   */
  mergeConsecutiveSpeakerSegments: (segments: any[], maxGap: number = 1.0): any[] => { // TODO: Fix TranscriptionSegment type
    if (segments.length === 0) return segments;

    const merged: any[] = []; // TODO: Fix TranscriptionSegment type
    let current = { ...segments[0] };

    for (let i = 1; i < segments.length; i++) {
      const next = segments[i];
      
      // Check if we can merge with current
      if (
        current.speaker?.label === next.speaker?.label &&
        (next.start - current.end) <= maxGap
      ) {
        // Merge segments
        current.end = next.end;
        current.text += ' ' + next.text;
        current.confidence = (current.confidence + next.confidence) / 2;
        
        // Merge words if available
        if (current.words && next.words) {
          current.words = [...current.words, ...next.words];
        }
      } else {
        // Can't merge, push current and start new
        merged.push(current);
        current = { ...next };
      }
    }
    
    // Don't forget the last segment
    merged.push(current);
    
    return merged;
  },
};

export default {
  transcriptionService,
  transcriptionQueue,
  transcriptionUtils,
};