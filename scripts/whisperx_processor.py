#!/Users/vp/SAZ Projects/transcriber-cutter/venv_whisperx/bin/python
"""
WhisperX Processor for Media Transcription Studio
Handles transcription using WhisperX with GPU acceleration
"""

import os
import sys
import json
import argparse
import logging
from pathlib import Path
import whisperx
import torch
import gc

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def transcribe_audio(
    audio_path: str,
    model_size: str = "base",
    language: str = None,
    device: str = "cpu",
    compute_type: str = "float32",
    batch_size: int = 16,
    output_dir: str = None
):
    """
    Transcribe audio using WhisperX
    
    Args:
        audio_path: Path to audio file
        model_size: Whisper model size (tiny, base, small, medium, large-v2)
        language: Language code (e.g., 'en', 'es') or None for auto-detection
        device: Device to use ('cuda' or 'cpu')
        compute_type: Compute type for faster-whisper
        batch_size: Batch size for transcription
        output_dir: Directory to save output files
    
    Returns:
        Dictionary containing transcription results
    """
    
    # Check if CUDA is available
    if device == "cuda" and not torch.cuda.is_available():
        logger.warning("CUDA requested but not available, falling back to CPU")
        device = "cpu"
        compute_type = "float32"
    
    logger.info(f"Loading WhisperX model: {model_size}")
    logger.info(f"Using device: {device}, compute type: {compute_type}")
    
    try:
        # Load model
        model = whisperx.load_model(
            model_size, 
            device, 
            compute_type=compute_type,
            language=language
        )
        
        # Load audio
        logger.info(f"Loading audio from: {audio_path}")
        audio = whisperx.load_audio(audio_path)
        
        # Transcribe
        logger.info("Starting transcription...")
        result = model.transcribe(
            audio, 
            batch_size=batch_size,
            language=language
        )
        
        # Align whisper output
        logger.info("Aligning transcript...")
        model_a, metadata = whisperx.load_align_model(
            language_code=result["language"], 
            device=device
        )
        result = whisperx.align(
            result["segments"], 
            model_a, 
            metadata, 
            audio, 
            device, 
            return_char_alignments=False
        )
        
        # Format output
        transcription = {
            "language": result.get("language", "unknown"),
            "segments": []
        }
        
        for segment in result["segments"]:
            transcription["segments"].append({
                "id": len(transcription["segments"]),
                "start": segment["start"],
                "end": segment["end"],
                "text": segment["text"].strip(),
                "confidence": segment.get("score", 0.0),
                "words": segment.get("words", [])
            })
        
        # Calculate overall confidence
        if transcription["segments"]:
            total_confidence = sum(s["confidence"] for s in transcription["segments"])
            transcription["confidence"] = total_confidence / len(transcription["segments"])
        else:
            transcription["confidence"] = 0.0
        
        # Save output if directory specified
        if output_dir:
            output_path = Path(output_dir) / f"{Path(audio_path).stem}_transcription.json"
            output_path.parent.mkdir(parents=True, exist_ok=True)
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(transcription, f, indent=2, ensure_ascii=False)
            logger.info(f"Saved transcription to: {output_path}")
        
        # Clean up
        del model
        del model_a
        gc.collect()
        if device == "cuda":
            torch.cuda.empty_cache()
        
        return transcription
        
    except Exception as e:
        logger.error(f"Transcription failed: {str(e)}")
        raise

def main():
    parser = argparse.ArgumentParser(description="Transcribe audio using WhisperX")
    parser.add_argument("audio_path", help="Path to audio file")
    parser.add_argument("--model", default="base", help="Model size (tiny, base, small, medium, large-v2)")
    parser.add_argument("--language", default=None, help="Language code (e.g., 'en') or leave empty for auto-detection")
    parser.add_argument("--device", default="cpu", choices=["cuda", "cpu"], help="Device to use")
    parser.add_argument("--compute-type", default="float32", help="Compute type (float32, float16, int8)")
    parser.add_argument("--batch-size", type=int, default=16, help="Batch size for transcription")
    parser.add_argument("--output-dir", help="Directory to save output files")
    parser.add_argument("--json", action="store_true", help="Output as JSON to stdout")
    
    args = parser.parse_args()
    
    try:
        result = transcribe_audio(
            args.audio_path,
            model_size=args.model,
            language=args.language,
            device=args.device,
            compute_type=args.compute_type,
            batch_size=args.batch_size,
            output_dir=args.output_dir
        )
        
        if args.json:
            print(json.dumps(result, indent=2, ensure_ascii=False))
        else:
            print(f"Transcription complete!")
            print(f"Language: {result['language']}")
            print(f"Segments: {len(result['segments'])}")
            print(f"Confidence: {result['confidence']:.2%}")
            
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()