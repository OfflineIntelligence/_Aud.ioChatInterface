#!/usr/bin/env python3
"""
Installation and Test Script for Aud.io Voice Mode
"""

import subprocess
import sys
import os
import platform

def install_dependencies():
    """Install required Python packages"""
    print("📦 Installing Python dependencies...")
    
    requirements_file = os.path.join(os.path.dirname(__file__), 'requirements.txt')
    
    try:
        subprocess.check_call([
            sys.executable, '-m', 'pip', 'install', '-r', requirements_file
        ])
        print("✅ Dependencies installed successfully")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Failed to install dependencies: {e}")
        return False

def test_imports():
    """Test that all modules can be imported"""
    print("🧪 Testing module imports...")
    
    modules_to_test = [
        'sounddevice',
        'numpy', 
        'webrtcvad',
        'vosk',
        'piper'
    ]
    
    failed_imports = []
    
    for module in modules_to_test:
        try:
            __import__(module)
            print(f"✅ {module}")
        except ImportError as e:
            print(f"❌ {module}: {e}")
            failed_imports.append(module)
    
    return len(failed_imports) == 0

def test_audio_devices():
    """Test audio device detection"""
    print("🎧 Testing audio device detection...")
    
    try:
        import sounddevice as sd
        devices = sd.query_devices()
        print(f"✅ Found {len(devices)} audio devices")
        
        input_devices = [d for d in devices if d['max_input_channels'] > 0]
        output_devices = [d for d in devices if d['max_output_channels'] > 0]
        
        print(f"   Input devices: {len(input_devices)}")
        print(f"   Output devices: {len(output_devices)}")
        
        return True
    except Exception as e:
        print(f"❌ Audio device test failed: {e}")
        return False

def download_models():
    """Guide user through model downloads"""
    print("\n🤖 Model Download Instructions")
    print("=" * 40)
    
    vosk_model_url = "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip"
    piper_model_url = "https://github.com/rhasspy/piper/releases/download/v1.2.0/vosk-model-en-us-0.22.zip"
    
    print("For offline voice functionality, you need to download:")
    print()
    print("1. Vosk STT Model:")
    print(f"   URL: {vosk_model_url}")
    print("   Extract to: crates/resources/vosk/model/")
    print()
    print("2. Piper TTS Model:")
    print(f"   URL: {piper_model_url}") 
    print("   Extract to: crates/resources/piper/")
    print()
    print("Alternative smaller models:")
    print("- Vosk: vosk-model-small-en-us-0.15 (40MB)")
    print("- Piper: en_US-lessac-medium (60MB)")
    print()
    print("Create the directories if they don't exist:")
    print("mkdir -p crates/resources/vosk/model")
    print("mkdir -p crates/resources/piper")

def main():
    """Main installation and test routine"""
    print("Aud.io Voice Mode Installation Tester")
    print("=" * 40)
    print(f"Platform: {platform.system()} {platform.release()}")
    print(f"Python: {sys.version}")
    print()
    
    # Test 1: Dependencies
    if not install_dependencies():
        print("\n⚠️  Dependency installation failed. Please install manually:")
        print("pip install -r requirements.txt")
        return False
    
    print()
    
    # Test 2: Imports
    if not test_imports():
        print("\n⚠️  Some modules failed to import. Check installations.")
        return False
    
    print()
    
    # Test 3: Audio devices
    if not test_audio_devices():
        print("\n⚠️  Audio device detection failed.")
        print("Please check your audio hardware and drivers.")
        return False
    
    print()
    
    # Show model download instructions
    download_models()
    
    print("\n🎉 Installation test completed successfully!")
    print("\nNext steps:")
    print("1. Download the required voice models")
    print("2. Run: python main.py --cli")
    print("3. Or run: python main.py --start-api")
    
    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)