#!/Users/vp/SAZ Projects/transcriber-cutter/venv_whisperx/bin/python
"""
WhisperX Transcription Service
Provides high-quality transcription with speaker diarization
"""

import os
import sys
import json
import argparse
import warnings
import torch
import whisperx
import gc
from pathlib import Path

# Suppress warnings
warnings.filterwarnings("ignore")

class WhisperXTranscriber:
    def __init__(self, model_size="large-v2", device="auto", compute_type="float16"):
        """
        Initialize WhisperX transcriber
        
        Args:
            model_size: Whisper model size (tiny, base, small, medium, large, large-v2, large-v3)
            device: Device to use (cpu, cuda, or auto)
            compute_type: Compute type for faster-whisper (float16, int8, float32)
        """
        if device == "auto":
            if torch.cuda.is_available():
                self.device = "cuda"
            else:
                self.device = "cpu"
        else:
            self.device = device
            
        # Set optimal compute type based on device
        if self.device == "cpu":
            # Use int8 for faster CPU performance on Apple Silicon
            self.compute_type = "int8"
        else:
            self.compute_type = compute_type
        
        print(f"Loading WhisperX model '{model_size}' on {self.device}...", file=sys.stderr)
        
        # Load WhisperX model
        self.model = whisperx.load_model(
            model_size, 
            self.device, 
            compute_type=self.compute_type,
            language=None  # Auto-detect language
        )
        
        self.diarize_model = None
        
    def load_diarization_model(self, hf_token=None):
        """Load speaker diarization model"""
        if not hf_token:
            hf_token = os.getenv("HF_TOKEN")
            
        if not hf_token:
            print("Warning: No Hugging Face token provided. Speaker diarization will be disabled.", file=sys.stderr)
            return False
            
        try:
            print("Loading speaker diarization model...", file=sys.stderr)
            self.diarize_model = whisperx.DiarizationPipeline(use_auth_token=hf_token, device=self.device)
            return True
        except Exception as e:
            print(f"Failed to load diarization model: {e}", file=sys.stderr)
            return False
    
    def transcribe(self, audio_path, language=None, enable_diarization=True, min_speakers=None, max_speakers=None):
        """
        Transcribe audio file with optional speaker diarization
        
        Args:
            audio_path: Path to audio file
            language: Language code (e.g., 'en') or None for auto-detection
            enable_diarization: Enable speaker diarization
            min_speakers: Minimum number of speakers
            max_speakers: Maximum number of speakers
            
        Returns:
            Dictionary with transcription results
        """
        print(f"Processing: {audio_path}", file=sys.stderr)
        
        # Load audio
        print("Progress: 10%", file=sys.stderr)
        audio = whisperx.load_audio(audio_path)
        print("Progress: 20%", file=sys.stderr)
        
        # Transcribe with Whisper
        print("Transcribing audio...", file=sys.stderr)
        print("Progress: 30%", file=sys.stderr)
        result = self.model.transcribe(
            audio, 
            batch_size=16,
            language=language
        )
        print("Progress: 70%", file=sys.stderr)
        
        detected_language = result.get("language", "unknown")
        print(f"Detected language: {detected_language}", file=sys.stderr)
        
        # Align whisper output
        print("Aligning transcript...", file=sys.stderr)
        print("Progress: 75%", file=sys.stderr)
        model_a, metadata = whisperx.load_align_model(
            language_code=detected_language, 
            device=self.device
        )
        print("Progress: 80%", file=sys.stderr)
        result = whisperx.align(
            result["segments"], 
            model_a, 
            metadata, 
            audio, 
            self.device,
            return_char_alignments=False
        )
        print("Progress: 90%", file=sys.stderr)
        
        # Speaker diarization
        if enable_diarization and self.diarize_model:
            print("Performing speaker diarization...", file=sys.stderr)
            diarize_segments = self.diarize_model(
                audio,
                min_speakers=min_speakers,
                max_speakers=max_speakers
            )
            
            # Assign speakers to segments
            result = whisperx.assign_word_speakers(diarize_segments, result)
            
        # Format output
        output = {
            "language": detected_language,
            "segments": [],
            "speakers": []
        }
        
        # Process segments
        speaker_stats = {}
        for segment in result["segments"]:
            seg_data = {
                "start": segment["start"],
                "end": segment["end"],
                "text": segment["text"].strip(),
                "confidence": segment.get("confidence", 1.0)
            }
            
            # Add speaker information if available
            if "speaker" in segment:
                speaker_id = segment["speaker"]
                seg_data["speaker"] = speaker_id
                
                # Track speaker statistics
                if speaker_id not in speaker_stats:
                    speaker_stats[speaker_id] = {
                        "id": speaker_id,
                        "segments": 0,
                        "total_duration": 0
                    }
                speaker_stats[speaker_id]["segments"] += 1
                speaker_stats[speaker_id]["total_duration"] += segment["end"] - segment["start"]
            
            # Add word-level timestamps if available
            if "words" in segment:
                seg_data["words"] = [
                    {
                        "word": word["word"],
                        "start": word["start"],
                        "end": word["end"],
                        "confidence": word.get("confidence", 1.0)
                    }
                    for word in segment["words"]
                ]
            
            output["segments"].append(seg_data)
        
        # Add speaker information
        output["speakers"] = list(speaker_stats.values())
        
        # Clean up
        del model_a
        gc.collect()
        torch.cuda.empty_cache() if self.device == "cuda" else None
        
        return output
    
    def process_file(self, input_path, output_path, **kwargs):
        """Process a single file and save results"""
        try:
            result = self.transcribe(input_path, **kwargs)
            
            # Save to JSON file
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(result, f, ensure_ascii=False, indent=2)
            
            print(f"Transcription saved to: {output_path}", file=sys.stderr)
            
            # Also output to stdout for pipe communication
            print(json.dumps(result))
            
            return True
            
        except Exception as e:
            error_result = {
                "error": str(e),
                "success": False
            }
            print(json.dumps(error_result))
            return False

def main():
    parser = argparse.ArgumentParser(description='WhisperX Transcription Service')
    parser.add_argument('input', help='Input audio/video file path')
    parser.add_argument('-o', '--output', help='Output JSON file path')
    parser.add_argument('-m', '--model', default='large-v2', help='Whisper model size')
    parser.add_argument('-d', '--device', default='auto', choices=['auto', 'cpu', 'cuda'], help='Device to use')
    parser.add_argument('-l', '--language', help='Language code (e.g., en, es, fr)')
    parser.add_argument('--no-diarization', action='store_true', help='Disable speaker diarization')
    parser.add_argument('--min-speakers', type=int, help='Minimum number of speakers')
    parser.add_argument('--max-speakers', type=int, help='Maximum number of speakers')
    parser.add_argument('--hf-token', help='Hugging Face token for diarization')
    
    args = parser.parse_args()
    
    # Set output path if not provided
    if not args.output:
        input_path = Path(args.input)
        args.output = input_path.with_suffix('.json')
    
    # Initialize transcriber
    transcriber = WhisperXTranscriber(
        model_size=args.model,
        device=args.device
    )
    
    # Load diarization model if needed
    if not args.no_diarization:
        transcriber.load_diarization_model(args.hf_token)
    
    # Process file
    success = transcriber.process_file(
        args.input,
        args.output,
        language=args.language,
        enable_diarization=not args.no_diarization,
        min_speakers=args.min_speakers,
        max_speakers=args.max_speakers
    )
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()