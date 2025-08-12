#!/Users/vp/SAZ Projects/transcriber-cutter/venv_whisperx/bin/python

import time
import whisperx
import sys

# Test different configurations
print("Testing WhisperX performance configurations for Apple Silicon...")

audio_file = "/Users/vp/SAZ Projects/transcriber-cutter/test-assets/test-audio.wav"

configs = [
    {"model": "base", "compute": "int8", "batch": 16},
    {"model": "small", "compute": "int8", "batch": 32},
    {"model": "medium", "compute": "int8", "batch": 24},
]

for config in configs:
    print(f"\nTesting: Model={config['model']}, Compute={config['compute']}, Batch={config['batch']}")
    
    try:
        start = time.time()
        
        # Load model
        model = whisperx.load_model(
            config["model"],
            "cpu",
            compute_type=config["compute"]
        )
        
        # Load audio
        audio = whisperx.load_audio(audio_file)
        
        # Transcribe
        result = model.transcribe(audio, batch_size=config["batch"])
        
        elapsed = time.time() - start
        print(f"  Time: {elapsed:.2f}s")
        print(f"  Language: {result.get('language', 'unknown')}")
        
        del model  # Free memory
        
    except Exception as e:
        print(f"  Error: {e}")

print("\nRecommendation: Use 'small' or 'medium' model with int8 for best speed/quality balance")