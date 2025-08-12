import OpenAI from 'openai';
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { MediaProcessingError } from '../media/ffmpeg';
import type { TranscriptionOptions, TranscriptionResult, TranscriptionSegment, WordTimestamp } from './whisperx';

const prisma = new PrismaClient();

export interface OpenAITranscriptionOptions {
  language?: string;
  prompt?: string;
  temperature?: number;
  responseFormat?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt';
  timestampGranularities?: ('word' | 'segment')[];
}

export class OpenAITranscriber {
  private client: OpenAI;
  private maxFileSize: number = 25 * 1024 * 1024; // 25MB OpenAI limit

  constructor(apiKey?: string) {
    if (!apiKey && !process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key is required. Set OPENAI_API_KEY environment variable or pass apiKey.');
    }
    
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Transcribe audio using OpenAI Whisper API
   */
  async transcribe(
    audioPath: string,
    mediaFileId: string,
    options: OpenAITranscriptionOptions = {}
  ): Promise<TranscriptionResult> {
    const startTime = Date.now();

    try {
      // Validate file size
      const stats = fs.statSync(audioPath);
      if (stats.size > this.maxFileSize) {
        throw new Error(`File size ${stats.size} bytes exceeds OpenAI limit of ${this.maxFileSize} bytes`);
      }

      // Create transcript record
      const transcript = await prisma.transcript.create({
        data: {
          mediaFileId,
          language: options.language || 'auto',
          confidence: 0,
          engine: 'openai-whisper',
          modelVersion: 'whisper-1',
          diarizationEnabled: false, // OpenAI doesn't support diarization
          maxSpeakers: 1,
          status: 'PROCESSING',
        },
      });

      console.log(`Starting OpenAI Whisper transcription for media ${mediaFileId} with transcript ${transcript.id}`);

      // Prepare file for upload
      const audioFile = fs.createReadStream(audioPath);

      // Configure request options
      const requestOptions: any = {
        file: audioFile,
        model: 'whisper-1',
        response_format: options.responseFormat || 'verbose_json',
        language: options.language,
        prompt: options.prompt,
        temperature: options.temperature || 0,
      };

      // Add timestamp granularities if supported
      if (options.timestampGranularities) {
        requestOptions.timestamp_granularities = options.timestampGranularities;
      }

      // Make transcription request
      const response = await this.client.audio.transcriptions.create(requestOptions);

      // Process response based on format
      let transcriptionResult: TranscriptionResult;
      
      if (options.responseFormat === 'verbose_json' || !options.responseFormat) {
        transcriptionResult = await this.processVerboseResponse(
          transcript.id,
          mediaFileId,
          response as any,
          startTime
        );
      } else {
        // Handle simple text/srt/vtt responses
        transcriptionResult = await this.processSimpleResponse(
          transcript.id,
          mediaFileId,
          response as any,
          options.responseFormat || 'text',
          startTime
        );
      }

      // Update transcript with final status
      const processingTime = (Date.now() - startTime) / 1000;
      await prisma.transcript.update({
        where: { id: transcript.id },
        data: {
          confidence: transcriptionResult.confidence,
          language: transcriptionResult.language,
          processingTime,
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      console.log(`OpenAI Whisper transcription completed in ${processingTime.toFixed(2)}s`);

      return {
        ...transcriptionResult,
        processingTime,
      };

    } catch (error) {
      // Update transcript with error status
      try {
        await prisma.transcript.updateMany({
          where: {
            mediaFileId,
            status: 'PROCESSING',
          },
          data: {
            status: 'FAILED',
            error: this.formatError(error),
          },
        });
      } catch (dbError) {
        console.error('Failed to update transcript error status:', dbError);
      }

      throw new MediaProcessingError(
        `OpenAI Whisper transcription failed: ${this.formatError(error)}`
      );
    }
  }

  /**
   * Process verbose JSON response with segments and word-level timestamps
   */
  private async processVerboseResponse(
    transcriptId: string,
    mediaFileId: string,
    response: any,
    startTime: number
  ): Promise<TranscriptionResult> {
    const segments: TranscriptionSegment[] = [];

    // Process segments from OpenAI response
    if (response.segments && Array.isArray(response.segments)) {
      for (const segment of response.segments) {
        const words: WordTimestamp[] = [];
        
        // Process word-level timestamps if available
        if (segment.words && Array.isArray(segment.words)) {
          for (const word of segment.words) {
            words.push({
              word: word.word || word.text || '',
              start: word.start || 0,
              end: word.end || 0,
              confidence: this.convertLogProbToConfidence(word.avg_logprob || segment.avg_logprob),
            });
          }
        }

        // Calculate confidence from log probability
        const confidence = this.convertLogProbToConfidence(segment.avg_logprob);

        const segmentData: TranscriptionSegment = {
          start: segment.start || 0,
          end: segment.end || 0,
          text: (segment.text || '').trim(),
          confidence,
          words: words.length > 0 ? words : undefined,
        };

        segments.push(segmentData);
      }
    } else {
      // Fallback: create single segment from full text
      segments.push({
        start: 0,
        end: response.duration || 0,
        text: response.text || '',
        confidence: 0.9, // Default confidence for full text
      });
    }

    // Save segments to database
    for (const segment of segments) {
      const dbSegment = await prisma.transcriptSegment.create({
        data: {
          transcriptId,
          start: segment.start,
          end: segment.end,
          text: segment.text,
          confidence: segment.confidence,
          speakerId: null, // No speaker diarization from OpenAI
        },
      });

      // Save words if available
      if (segment.words && segment.words.length > 0) {
        await prisma.word.createMany({
          data: segment.words.map(word => ({
            segmentId: dbSegment.id,
            text: word.word,
            start: word.start,
            end: word.end,
            confidence: word.confidence,
          })),
        });
      }
    }

    // Calculate overall confidence
    const overallConfidence = segments.length > 0 
      ? segments.reduce((sum, seg) => sum + seg.confidence, 0) / segments.length
      : 0.9;

    return {
      transcriptId,
      mediaFileId,
      language: response.language || 'en',
      confidence: overallConfidence,
      processingTime: (Date.now() - startTime) / 1000,
      segments,
      diarizationEnabled: false,
    };
  }

  /**
   * Process simple response formats (text, srt, vtt)
   */
  private async processSimpleResponse(
    transcriptId: string,
    mediaFileId: string,
    response: any,
    format: string,
    startTime: number
  ): Promise<TranscriptionResult> {
    let segments: TranscriptionSegment[] = [];
    const text = typeof response === 'string' ? response : response.text || '';

    if (format === 'srt' || format === 'vtt') {
      // Parse SRT/VTT format to extract segments
      segments = this.parseSubtitleFormat(text, format);
    } else {
      // Simple text - create single segment
      segments = [{
        start: 0,
        end: 0, // Unknown duration
        text: text.trim(),
        confidence: 0.9,
      }];
    }

    // Save segments to database
    for (const segment of segments) {
      await prisma.transcriptSegment.create({
        data: {
          transcriptId,
          start: segment.start,
          end: segment.end,
          text: segment.text,
          confidence: segment.confidence,
          speakerId: null,
        },
      });
    }

    return {
      transcriptId,
      mediaFileId,
      language: 'en', // Default language for simple formats
      confidence: 0.9,
      processingTime: (Date.now() - startTime) / 1000,
      segments,
      diarizationEnabled: false,
    };
  }

  /**
   * Parse SRT or VTT subtitle format
   */
  private parseSubtitleFormat(content: string, format: 'srt' | 'vtt'): TranscriptionSegment[] {
    const segments: TranscriptionSegment[] = [];
    const lines = content.split('\n');
    
    if (format === 'srt') {
      // Parse SRT format
      let i = 0;
      while (i < lines.length) {
        // Skip sequence number
        if (/^\d+$/.test(lines[i]?.trim())) {
          i++;
          
          // Parse timestamp line
          const timeLine = lines[i]?.trim();
          if (timeLine && timeLine.includes('-->')) {
            const [startStr, endStr] = timeLine.split('-->').map(s => s.trim());
            const start = this.parseTimestamp(startStr);
            const end = this.parseTimestamp(endStr);
            i++;
            
            // Collect text lines
            const textLines: string[] = [];
            while (i < lines.length && lines[i]?.trim() !== '') {
              textLines.push(lines[i]);
              i++;
            }
            
            if (textLines.length > 0) {
              segments.push({
                start,
                end,
                text: textLines.join(' ').trim(),
                confidence: 0.9,
              });
            }
          }
        }
        i++;
      }
    } else if (format === 'vtt') {
      // Parse VTT format (simplified)
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]?.trim();
        if (line && line.includes('-->')) {
          const [startStr, endStr] = line.split('-->').map(s => s.trim());
          const start = this.parseTimestamp(startStr);
          const end = this.parseTimestamp(endStr);
          
          // Get text from next line
          if (i + 1 < lines.length) {
            const text = lines[i + 1]?.trim();
            if (text) {
              segments.push({
                start,
                end,
                text,
                confidence: 0.9,
              });
            }
          }
        }
      }
    }

    return segments;
  }

  /**
   * Parse timestamp string to seconds
   */
  private parseTimestamp(timestamp: string): number {
    const match = timestamp.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
    if (!match) return 0;

    const [, hours, minutes, seconds, milliseconds] = match;
    return (
      parseInt(hours) * 3600 +
      parseInt(minutes) * 60 +
      parseInt(seconds) +
      parseInt(milliseconds) / 1000
    );
  }

  /**
   * Convert OpenAI log probability to confidence score
   */
  private convertLogProbToConfidence(logProb?: number): number {
    if (typeof logProb !== 'number') return 0.9;
    
    // Convert log probability to confidence (0-1)
    // OpenAI log probs are typically negative values around -0.1 to -2.0
    // Convert using exponential: confidence = exp(logProb)
    const confidence = Math.exp(logProb);
    
    // Clamp between 0.1 and 1.0
    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * Format error message from various error types
   */
  private formatError(error: unknown): string {
    if (error instanceof OpenAI.APIError) {
      return `OpenAI API error (${error.status}): ${error.message}`;
    }
    
    if (error instanceof Error) {
      return error.message;
    }
    
    return 'Unknown transcription error';
  }

  /**
   * Check if file size is within OpenAI limits
   */
  isFileSizeSupported(filePath: string): boolean {
    try {
      const stats = fs.statSync(filePath);
      return stats.size <= this.maxFileSize;
    } catch {
      return false;
    }
  }

  /**
   * Get maximum supported file size
   */
  getMaxFileSize(): number {
    return this.maxFileSize;
  }

  /**
   * Get supported languages for OpenAI Whisper
   */
  getSupportedLanguages(): Record<string, string> {
    return {
      'auto': 'Auto-detect',
      'en': 'English',
      'es': 'Spanish',
      'fr': 'French', 
      'de': 'German',
      'it': 'Italian',
      'pt': 'Portuguese',
      'ru': 'Russian',
      'ja': 'Japanese',
      'ko': 'Korean',
      'zh': 'Chinese',
      'ar': 'Arabic',
      'hi': 'Hindi',
      'nl': 'Dutch',
      'pl': 'Polish',
      'tr': 'Turkish',
      'vi': 'Vietnamese',
      'uk': 'Ukrainian',
      'sv': 'Swedish',
      'da': 'Danish',
      'no': 'Norwegian',
      'fi': 'Finnish',
      'is': 'Icelandic',
      'he': 'Hebrew',
      'th': 'Thai',
      'id': 'Indonesian',
      'ms': 'Malay',
      'tl': 'Filipino',
    };
  }
}

export default OpenAITranscriber;