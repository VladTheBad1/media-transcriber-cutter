#!/usr/bin/env python3
"""
Simple Whisper Transcription Service
Fallback service using OpenAI Whisper when WhisperX is not available
"""

import os
import sys
import json
import argparse
import warnings
import whisper
from pathlib import Path

# Suppress warnings
warnings.filterwarnings("ignore")

class SimpleWhisperTranscriber:
    def __init__(self, model_size="base"):
        """
        Initialize Whisper transcriber
        
        Args:
            model_size: Whisper model size (tiny, base, small, medium, large)
        """
        print(f"Loading Whisper model '{model_size}'...", file=sys.stderr)
        self.model = whisper.load_model(model_size)
        print("Model loaded successfully", file=sys.stderr)
    
    def transcribe(self, audio_path, language=None):
        """
        Transcribe audio file
        
        Args:
            audio_path: Path to audio file
            language: Language code (e.g., 'en') or None for auto-detection
            
        Returns:
            Dictionary with transcription results
        """
        print(f"Processing: {audio_path}", file=sys.stderr)
        
        # Transcribe with Whisper
        print("Transcribing audio...", file=sys.stderr)
        result = self.model.transcribe(
            audio_path,
            language=language,
            word_timestamps=True,
            verbose=False
        )
        
        detected_language = result.get("language", "unknown")
        print(f"Detected language: {detected_language}", file=sys.stderr)
        
        # Format output
        output = {
            "language": detected_language,
            "segments": [],
            "speakers": []  # No speaker diarization in basic Whisper
        }
        
        # Process segments
        for segment in result.get("segments", []):
            seg_data = {
                "start": segment["start"],
                "end": segment["end"],
                "text": segment["text"].strip(),
                "confidence": 1.0  # Whisper doesn't provide confidence scores
            }
            
            # Add word-level timestamps if available
            if "words" in segment:
                seg_data["words"] = [
                    {
                        "word": word.get("word", ""),
                        "start": word.get("start", 0),
                        "end": word.get("end", 0),
                        "confidence": word.get("probability", 1.0)
                    }
                    for word in segment["words"]
                ]
            
            output["segments"].append(seg_data)
        
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
    parser = argparse.ArgumentParser(description='Simple Whisper Transcription Service')
    parser.add_argument('input', help='Input audio/video file path')
    parser.add_argument('-o', '--output', help='Output JSON file path')
    parser.add_argument('-m', '--model', default='base', 
                       choices=['tiny', 'base', 'small', 'medium', 'large'],
                       help='Whisper model size')
    parser.add_argument('-l', '--language', help='Language code (e.g., en, es, fr)')
    
    # Compatibility arguments (ignored but accepted)
    parser.add_argument('-d', '--device', default='auto', help='Device (ignored)')
    parser.add_argument('--no-diarization', action='store_true', help='Disable diarization (always disabled)')
    parser.add_argument('--min-speakers', type=int, help='Min speakers (ignored)')
    parser.add_argument('--max-speakers', type=int, help='Max speakers (ignored)')
    parser.add_argument('--hf-token', help='HF token (ignored)')
    
    args = parser.parse_args()
    
    # Set output path if not provided
    if not args.output:
        input_path = Path(args.input)
        args.output = input_path.with_suffix('.json')
    
    # Initialize transcriber
    transcriber = SimpleWhisperTranscriber(model_size=args.model)
    
    # Process file
    success = transcriber.process_file(
        args.input,
        args.output,
        language=args.language
    )
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()