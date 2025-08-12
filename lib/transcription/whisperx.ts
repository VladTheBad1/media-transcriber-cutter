import { spawn } from 'child_process';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { MediaProcessingError } from '../media/ffmpeg';

const prisma = new PrismaClient();

// WhisperX output schema validation
const WhisperXSegment = z.object({
  start: z.number(),
  end: z.number(),
  text: z.string(),
  words: z.array(z.object({
    word: z.string(),
    start: z.number(),
    end: z.number(),
    // Accept either 'score' or 'confidence' field
    score: z.number().optional(),
    confidence: z.number().optional(),
  }).transform(obj => ({
    ...obj,
    score: obj.score ?? obj.confidence ?? 1.0,
  }))).optional(),
});

const WhisperXResult = z.object({
  segments: z.array(WhisperXSegment),
  language: z.string(),
  language_probability: z.number().optional(),
});

const WhisperXDiarizedResult = z.object({
  segments: z.array(WhisperXSegment.extend({
    speaker: z.string().optional(),
  })),
  language: z.string(),
  language_probability: z.number().optional(),
  speakers: z.array(z.object({
    id: z.string(),
    start: z.number(),
    end: z.number(),
  })).optional(),
});

export interface TranscriptionOptions {
  language?: string;
  enableDiarization?: boolean;
  maxSpeakers?: number;
  model?: 'tiny' | 'base' | 'small' | 'medium' | 'large' | 'large-v2' | 'large-v3';
  device?: 'cpu' | 'cuda' | 'auto';
  alignModel?: string;
  diarizeModel?: string;
  computeType?: 'int8' | 'int16' | 'float16' | 'float32';
  batchSize?: number;
  minSpeakerChangeDuration?: number;
}

export interface TranscriptionResult {
  transcriptId: string;
  mediaFileId: string;
  language: string;
  confidence: number;
  processingTime: number;
  segments: TranscriptionSegment[];
  speakers?: Speaker[];
  diarizationEnabled: boolean;
}

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  confidence: number;
  speaker?: Speaker;
  words?: WordTimestamp[];
}

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  confidence: number;
}

export interface Speaker {
  id: string;
  label: string;
  name?: string;
  totalDuration: number;
  segmentCount: number;
  averageConfidence: number;
}

export class WhisperXTranscriber {
  private pythonPath: string;
  private whisperxScript: string;
  private tempDir: string;
  private modelCache: Map<string, boolean> = new Map();

  constructor(options?: {
    pythonPath?: string;
    whisperxScript?: string;
    tempDir?: string;
  }) {
    this.pythonPath = options?.pythonPath || process.env.PYTHON_PATH || '/Users/vp/SAZ Projects/transcriber-cutter/venv_whisperx/bin/python';
    this.whisperxScript = options?.whisperxScript || this.getDefaultScriptPath();
    this.tempDir = options?.tempDir || './temp/whisperx';
  }

  private getDefaultScriptPath(): string {
    return path.join(process.cwd(), 'scripts', 'whisperx_service.py');
  }

  /**
   * Initialize WhisperX service and verify installation
   */
  async initialize(): Promise<void> {
    try {
      // Ensure temp directory exists
      await fs.mkdir(this.tempDir, { recursive: true });

      // Check if Python script exists
      try {
        await fs.access(this.whisperxScript);
        console.log('WhisperX script found at:', this.whisperxScript);
      } catch {
        throw new Error(`WhisperX script not found at: ${this.whisperxScript}. Please ensure scripts/whisperx_service.py exists.`);
      }

      // Test WhisperX availability
      await this.testWhisperXInstallation();
      
      console.log('WhisperX transcriber initialized successfully');
    } catch (error) {
      throw new MediaProcessingError(
        `WhisperX initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Transcribe audio file with optional speaker diarization
   */
  async transcribe(
    audioPath: string,
    mediaFileId: string,
    options: TranscriptionOptions = {}
  ): Promise<TranscriptionResult> {
    const startTime = Date.now();
    
    try {
      // Validate input file exists
      await fs.access(audioPath);

      // Set default options - optimized for Apple Silicon M4 Max
      const opts: Required<TranscriptionOptions> = {
        language: options.language || 'auto',
        enableDiarization: options.enableDiarization ?? false, // Disable for faster processing
        maxSpeakers: options.maxSpeakers || 10,
        model: options.model || 'medium', // Use medium model for better speed on M4 Max
        device: options.device || 'cpu', // WhisperX only supports CPU/CUDA
        alignModel: options.alignModel || 'WAV2VEC2_ASR_LARGE_LV60K_960H',
        diarizeModel: options.diarizeModel || 'pyannote/speaker-diarization-3.1',
        computeType: options.computeType || 'int8', // Use int8 for 4x faster CPU performance
        batchSize: options.batchSize || 24, // Optimized batch size
        minSpeakerChangeDuration: options.minSpeakerChangeDuration || 0.5,
      };

      // Create transcript record
      const transcript = await prisma.transcript.create({
        data: {
          mediaFileId,
          language: opts.language === 'auto' ? 'unknown' : opts.language,
          confidence: 0,
          engine: 'whisperx',
          modelVersion: opts.model,
          diarizationEnabled: opts.enableDiarization,
          maxSpeakers: opts.maxSpeakers,
          status: 'PROCESSING',
        },
      });

      console.log(`Starting WhisperX transcription for media ${mediaFileId} with transcript ${transcript.id}`);

      // Run WhisperX transcription
      const result = await this.runWhisperX(audioPath, opts);

      // Process and save results
      const transcriptionResult = await this.processWhisperXResult(
        transcript.id,
        mediaFileId,
        result,
        opts.enableDiarization
      );

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

      console.log(`WhisperX transcription completed in ${processingTime.toFixed(2)}s`);

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
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        });
      } catch (dbError) {
        console.error('Failed to update transcript error status:', dbError);
      }

      throw new MediaProcessingError(
        `WhisperX transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Run WhisperX Python subprocess
   */
  private async runWhisperX(
    audioPath: string,
    options: Required<TranscriptionOptions>
  ): Promise<z.infer<typeof WhisperXDiarizedResult>> {
    return new Promise((resolve, reject) => {
      const outputPath = path.join(this.tempDir, `${Date.now()}_output.json`);
      
      const args = [
        this.whisperxScript,
        audioPath,  // Input file is positional argument
        '--output', outputPath,
        '--model', options.model,
        '--device', options.device,
      ];

      // Add language if specified
      if (options.language !== 'auto') {
        args.push('--language', options.language);
      }

      // Add diarization options
      if (!options.enableDiarization) {
        args.push('--no-diarization');
      } else {
        if (options.maxSpeakers > 0) {
          args.push('--max-speakers', options.maxSpeakers.toString());
        }
        // Add HF token from environment if available
        const hfToken = process.env.HF_TOKEN;
        if (hfToken) {
          args.push('--hf-token', hfToken);
        }
      }

      console.log('Running WhisperX command:', this.pythonPath, args.join(' '));

      const whisperProcess = spawn(this.pythonPath, args);
      let stdout = '';
      let stderr = '';

      whisperProcess.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        console.log('WhisperX:', chunk.trim());
      });

      whisperProcess.stderr.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;
        console.error('WhisperX Error:', chunk.trim());
      });

      whisperProcess.on('close', async (code) => {
        if (code !== 0) {
          reject(new Error(`WhisperX process failed with code ${code}: ${stderr}`));
          return;
        }

        try {
          // Read output file
          const outputData = await fs.readFile(outputPath, 'utf-8');
          const result = JSON.parse(outputData);
          
          // Validate output schema
          const validated = WhisperXDiarizedResult.parse(result);
          
          // Cleanup output file
          await fs.unlink(outputPath).catch(() => {});
          
          resolve(validated);
        } catch (parseError) {
          reject(new Error(`Failed to parse WhisperX output: ${parseError instanceof Error ? parseError.message : 'Parse error'}`));
        }
      });

      whisperProcess.on('error', (error) => {
        reject(new Error(`WhisperX process error: ${error.message}`));
      });

      // Set timeout for long transcriptions
      setTimeout(() => {
        if (!whisperProcess.killed) {
          whisperProcess.kill();
          reject(new Error('WhisperX transcription timeout'));
        }
      }, 30 * 60 * 1000); // 30 minutes timeout
    });
  }

  /**
   * Process WhisperX results and save to database
   */
  private async processWhisperXResult(
    transcriptId: string,
    mediaFileId: string,
    result: z.infer<typeof WhisperXDiarizedResult>,
    diarizationEnabled: boolean
  ): Promise<TranscriptionResult> {
    const speakers: Speaker[] = [];
    const segments: TranscriptionSegment[] = [];
    const speakerStats = new Map<string, { duration: number; count: number; totalConfidence: number }>();

    // Process segments and collect speaker statistics
    for (const segment of result.segments) {
      const words: WordTimestamp[] = segment.words?.map(word => ({
        word: word.word,
        start: word.start,
        end: word.end,
        confidence: word.score ?? 1.0,
      })) || [];

      // Calculate segment confidence from word scores
      const confidence = words.length > 0 
        ? words.reduce((sum, word) => sum + word.confidence, 0) / words.length
        : 0.8; // Default confidence if no word-level scores

      const segmentData: TranscriptionSegment = {
        start: segment.start,
        end: segment.end,
        text: segment.text.trim(),
        confidence,
        words,
      };

      // Handle speaker assignment
      if (diarizationEnabled && segment.speaker) {
        const speakerId = segment.speaker;
        const duration = segment.end - segment.start;
        
        if (!speakerStats.has(speakerId)) {
          speakerStats.set(speakerId, { duration: 0, count: 0, totalConfidence: 0 });
        }
        
        const stats = speakerStats.get(speakerId)!;
        stats.duration += duration;
        stats.count += 1;
        stats.totalConfidence += confidence;
      }

      segments.push(segmentData);
    }

    // Create speaker records if diarization was enabled
    if (diarizationEnabled) {
      let speakerIndex = 1;
      const speakerEntries = Array.from(speakerStats.entries());
      for (const [speakerId, stats] of speakerEntries) {
        const speaker: Speaker = {
          id: speakerId,
          label: `Speaker ${speakerIndex}`,
          totalDuration: stats.duration,
          segmentCount: stats.count,
          averageConfidence: stats.totalConfidence / stats.count,
        };
        speakers.push(speaker);
        speakerIndex++;
      }

      // Save speakers to database
      await prisma.speaker.createMany({
        data: speakers.map(speaker => ({
          label: speaker.label,
          name: speaker.name,
          totalDuration: speaker.totalDuration,
          segmentCount: speaker.segmentCount,
          averageConfidence: speaker.averageConfidence,
          transcriptId,
        })),
      });

      // Get created speakers with IDs for segment assignment
      const dbSpeakers = await prisma.speaker.findMany({
        where: { transcriptId },
      });

      // Create speaker ID mapping
      const speakerMap = new Map<string, string>();
      speakers.forEach((speaker, index) => {
        speakerMap.set(speaker.id, dbSpeakers[index].id);
      });

      // Assign speakers to segments
      segments.forEach((segment, index) => {
        const originalSpeakerId = result.segments[index].speaker;
        if (originalSpeakerId && speakerMap.has(originalSpeakerId)) {
          const dbSpeaker = dbSpeakers.find(s => speakerMap.get(originalSpeakerId) === s.id);
          if (dbSpeaker) {
            segment.speaker = {
              id: dbSpeaker.id,
              label: dbSpeaker.label,
              name: dbSpeaker.name || undefined,
              totalDuration: dbSpeaker.totalDuration,
              segmentCount: dbSpeaker.segmentCount,
              averageConfidence: dbSpeaker.averageConfidence,
            };
          }
        }
      });
    }

    // Save segments to database
    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index];
      const dbSegment = await prisma.transcriptSegment.create({
        data: {
          transcriptId,
          start: segment.start,
          end: segment.end,
          text: segment.text,
          confidence: segment.confidence,
          speakerId: segment.speaker?.id,
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
      : 0;

    return {
      transcriptId,
      mediaFileId,
      language: result.language,
      confidence: overallConfidence,
      processingTime: 0, // Will be set by caller
      segments,
      speakers: speakers.length > 0 ? speakers : undefined,
      diarizationEnabled,
    };
  }

  /**
   * Ensure WhisperX Python script exists
   */
  private async ensureWhisperXScript(): Promise<void> {
    const scriptDir = path.dirname(this.whisperxScript);
    await fs.mkdir(scriptDir, { recursive: true });

    try {
      await fs.access(this.whisperxScript);
    } catch {
      // Script doesn't exist, create it
      await this.createWhisperXScript();
    }
  }

  /**
   * Create the WhisperX Python service script
   */
  private async createWhisperXScript(): Promise<void> {
    const scriptContent = `#!/usr/bin/env python3
"""
WhisperX Transcription Service
Standalone Python script for running WhisperX with speaker diarization
"""

import argparse
import json
import os
import sys
import time
from typing import Dict, Any, Optional

def main():
    parser = argparse.ArgumentParser(description='WhisperX Transcription Service')
    parser.add_argument('--audio_path', required=True, help='Path to audio file')
    parser.add_argument('--output_path', required=True, help='Path to output JSON file')
    parser.add_argument('--model', default='large-v2', help='WhisperX model size')
    parser.add_argument('--language', default=None, help='Language code (auto-detect if not specified)')
    parser.add_argument('--device', default='auto', help='Device to use (cpu, cuda, auto)')
    parser.add_argument('--compute_type', default='float16', help='Compute type')
    parser.add_argument('--batch_size', type=int, default=16, help='Batch size')
    parser.add_argument('--enable_diarization', action='store_true', help='Enable speaker diarization')
    parser.add_argument('--max_speakers', type=int, default=10, help='Maximum number of speakers')
    parser.add_argument('--min_speaker_change', type=float, default=0.5, help='Minimum speaker change duration')
    parser.add_argument('--align_model', default='WAV2VEC2_ASR_LARGE_LV60K_960H', help='Alignment model')
    parser.add_argument('--diarize_model', default='pyannote/speaker-diarization-3.1', help='Diarization model')
    
    args = parser.parse_args()
    
    try:
        import whisperx
        import torch
    except ImportError as e:
        print(f"Error: Missing required packages. Please install whisperx: {e}", file=sys.stderr)
        sys.exit(1)
    
    try:
        # Determine device
        if args.device == 'auto':
            device = 'cuda' if torch.cuda.is_available() else 'cpu'
        else:
            device = args.device
            
        print(f"Using device: {device}")
        print(f"Processing audio: {args.audio_path}")
        
        # Load audio
        audio = whisperx.load_audio(args.audio_path)
        print("Audio loaded successfully")
        
        # Load model
        print(f"Loading WhisperX model: {args.model}")
        model = whisperx.load_model(
            args.model,
            device,
            compute_type=args.compute_type,
            language=args.language
        )
        print("Model loaded successfully")
        
        # Transcribe
        print("Starting transcription...")
        result = model.transcribe(
            audio,
            batch_size=args.batch_size,
            language=args.language
        )
        print(f"Transcription completed. Language detected: {result['language']}")
        
        # Load alignment model and align
        if hasattr(whisperx, 'load_align_model'):
            print("Loading alignment model...")
            model_a, metadata = whisperx.load_align_model(
                language_code=result["language"],
                device=device,
                model_name=args.align_model
            )
            
            print("Aligning transcription...")
            result = whisperx.align(
                result["segments"],
                model_a,
                metadata,
                audio,
                device,
                return_char_alignments=False
            )
            print("Alignment completed")
        
        # Speaker diarization
        if args.enable_diarization:
            try:
                print("Loading diarization model...")
                diarize_model = whisperx.DiarizationPipeline(
                    use_auth_token=os.getenv('HUGGING_FACE_HUB_TOKEN'),
                    device=device,
                    model_name=args.diarize_model
                )
                
                print("Performing speaker diarization...")
                diarize_segments = diarize_model(
                    args.audio_path,
                    min_speakers=1,
                    max_speakers=args.max_speakers
                )
                
                print("Assigning speakers to segments...")
                result = whisperx.assign_word_speakers(diarize_segments, result)
                print(f"Speaker diarization completed")
                
                # Extract speaker information
                speakers = []
                if hasattr(diarize_segments, 'labels_'):
                    for label in diarize_segments.labels_:
                        speakers.append({
                            'id': label,
                            'start': 0,  # Will be calculated from segments
                            'end': 0     # Will be calculated from segments
                        })
                result['speakers'] = speakers
                
            except Exception as e:
                print(f"Warning: Speaker diarization failed: {e}", file=sys.stderr)
                print("Continuing without speaker diarization...")
        
        # Ensure all segments have required fields
        for segment in result.get('segments', []):
            if 'start' not in segment or 'end' not in segment:
                continue
            if 'text' not in segment:
                segment['text'] = ''
            if 'words' not in segment:
                segment['words'] = []
        
        # Write results
        with open(args.output_path, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        
        print(f"Results written to: {args.output_path}")
        
    except Exception as e:
        print(f"Error during transcription: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
`;

    await fs.writeFile(this.whisperxScript, scriptContent);
    await fs.chmod(this.whisperxScript, 0o755); // Make executable
    console.log(`Created WhisperX script: ${this.whisperxScript}`);
  }

  /**
   * Test WhisperX installation
   */
  private async testWhisperXInstallation(): Promise<void> {
    // First check if our Python script exists
    try {
      await fs.access(this.whisperxScript);
    } catch {
      console.log('WhisperX script not found at:', this.whisperxScript);
      // Script will be created by ensureWhisperXScript
    }
    
    return new Promise((resolve, reject) => {
      // Test if Python and required modules are available
      const testCode = 'import whisperx, torch; print(f"WhisperX available, CUDA: {torch.cuda.is_available()}")';
      const testProcess = spawn(this.pythonPath, ['-c', testCode]);
      
      let stderr = '';
      testProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      testProcess.stdout.on('data', (data) => {
        console.log('WhisperX test:', data.toString().trim());
      });
      
      testProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          const message = stderr.includes('ModuleNotFoundError')
            ? 'WhisperX dependencies not installed. Please run: pip install -r scripts/requirements.txt'
            : `WhisperX test failed: ${stderr}`;
          reject(new Error(message));
        }
      });

      testProcess.on('error', (error) => {
        reject(new Error(`Python execution failed: ${error.message}. Make sure Python 3 is installed.`));
      });
    });
  }

  /**
   * Get available models
   */
  getAvailableModels(): string[] {
    return ['tiny', 'base', 'small', 'medium', 'large', 'large-v2', 'large-v3'];
  }

  /**
   * Get supported languages
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
    };
  }
}

export default WhisperXTranscriber;