"""
Download Silero models for Voice Mode
Run this script once to download all required models
"""

import os
import torch
from pathlib import Path

# Base directory for models
BASE_DIR = Path(__file__).parent / "silero_models"
BASE_DIR.mkdir(exist_ok=True)

def download_vad_model():
    """Download Silero VAD model"""
    print("Downloading Silero VAD model...")
    vad_dir = BASE_DIR / "vad"
    vad_dir.mkdir(exist_ok=True)

    model, utils = torch.hub.load(
        repo_or_dir='snakers4/silero-vad',
        model='silero_vad',
        force_reload=False,
        onnx=False
    )

    # Save model
    model_path = vad_dir / "silero_vad.jit"
    torch.jit.save(torch.jit.script(model), str(model_path))
    print(f"✓ VAD model saved to: {model_path}")

    return model, utils

def download_stt_model():
    """Download Silero STT model (English)"""
    print("\nDownloading Silero STT model (English)...")
    stt_dir = BASE_DIR / "stt"
    stt_dir.mkdir(exist_ok=True)

    device = torch.device('cpu')

    model, decoder, utils = torch.hub.load(
        repo_or_dir='snakers4/silero-models',
        model='silero_stt',
        language='en',
        device=device
    )

    # Save model
    model_path = stt_dir / "v4_en.pt"
    torch.save(model.state_dict(), str(model_path))
    print(f"✓ STT model saved to: {model_path}")

    return model, decoder, utils

def download_tts_model():
    """Download Silero TTS model (English)"""
    print("\nDownloading Silero TTS model (English)...")
    tts_dir = BASE_DIR / "tts"
    tts_dir.mkdir(exist_ok=True)

    device = torch.device('cpu')

    # Use v3_en which is the stable English model
    result = torch.hub.load(
        repo_or_dir='snakers4/silero-models',
        model='silero_tts',
        language='en',
        speaker='v3_en'
    )

    # Check if result is a tuple (model, example_text) or just model
    if isinstance(result, tuple):
        model = result[0]  # First element is the model
        print(f"  Loaded model with {len(result)} outputs from torch hub")
    else:
        model = result

    # The TTS model from torch hub is a packaged model that can't be easily saved
    # It's cached by torch hub in ~/.cache/torch/hub/ so we don't need to save it
    # Instead, create a marker file to indicate the model was downloaded
    model_path = tts_dir / "v3_en.downloaded"
    model_path.write_text("Model cached by torch hub")

    print(f"✓ TTS model downloaded and cached by torch hub")
    print(f"  Cache location: ~/.cache/torch/hub/")

    return model

def verify_models():
    """Verify all models are downloaded"""
    print("\n" + "="*60)
    print("Verifying downloaded models...")
    print("="*60)

    models = {
        "VAD": BASE_DIR / "vad" / "silero_vad.jit",
        "STT": BASE_DIR / "stt" / "v4_en.pt",
        "TTS": BASE_DIR / "tts" / "v3_en.downloaded"
    }

    all_good = True
    for name, path in models.items():
        if path.exists():
            size_mb = path.stat().st_size / (1024 * 1024)
            print(f"✓ {name}: {path} ({size_mb:.2f} MB)")
        else:
            print(f"✗ {name}: NOT FOUND at {path}")
            all_good = False

    if all_good:
        print("\n✓ All models downloaded successfully!")
        print(f"\nModels directory: {BASE_DIR.absolute()}")
    else:
        print("\n✗ Some models are missing. Please run this script again.")

    return all_good

if __name__ == "__main__":
    print("="*60)
    print("Silero Model Downloader for Voice Mode")
    print("="*60)
    print(f"Models will be saved to: {BASE_DIR.absolute()}")
    print()

    try:
        # Download all models
        vad_model, vad_utils = download_vad_model()
        stt_model, stt_decoder, stt_utils = download_stt_model()
        tts_model = download_tts_model()

        # Verify
        verify_models()

    except Exception as e:
        print(f"\n✗ Error during download: {e}")
        print("Please check your internet connection and try again.")
