"""
Simple Voice Mode Test
Tests basic functionality without heavy dependencies
"""

import sys
import os
import platform

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def test_basic_setup():
    """Test basic system setup"""
    print("🔍 System Information")
    print(f"Platform: {platform.system()} {platform.release()}")
    print(f"Python: {sys.version}")
    print(f"Working Directory: {os.getcwd()}")
    print()
    
    # Test directory structure
    required_dirs = [
        'stt',
        'tts', 
        'audio_utils'
    ]
    
    print("📁 Checking directory structure:")
    for dir_name in required_dirs:
        if os.path.exists(dir_name):
            print(f"  ✅ {dir_name}")
        else:
            print(f"  ❌ {dir_name} (missing)")
    
    # Test main files
    main_files = [
        'voice_interface.py',
        'api_wrapper.py',
        'main.py',
        'requirements.txt'
    ]
    
    print("\n📄 Checking main files:")
    for file_name in main_files:
        if os.path.exists(file_name):
            print(f"  ✅ {file_name}")
        else:
            print(f"  ❌ {file_name} (missing)")

def test_audio_imports():
    """Test audio-related imports"""
    print("\n🧪 Testing Audio Imports:")
    
    # Test what we can import
    test_modules = [
        ('sounddevice', 'Audio I/O'),
        ('vosk', 'Speech Recognition'),
        ('numpy', 'Numerical Computing'),
        ('json', 'JSON handling'),
        ('threading', 'Threading'),
        ('queue', 'Queue management'),
        ('logging', 'Logging')
    ]
    
    successful_imports = []
    failed_imports = []
    
    for module_name, description in test_modules:
        try:
            __import__(module_name)
            print(f"  ✅ {module_name:<12} - {description}")
            successful_imports.append(module_name)
        except ImportError as e:
            print(f"  ❌ {module_name:<12} - {description} ({e})")
            failed_imports.append(module_name)
    
    return len(failed_imports) == 0

def test_audio_devices():
    """Test audio device detection"""
    print("\n🎧 Testing Audio Device Detection:")
    
    try:
        import sounddevice as sd
        devices = sd.query_devices()
        print(f"  ✅ Found {len(devices)} audio devices")
        
        input_devices = [d for d in devices if d['max_input_channels'] > 0]
        output_devices = [d for d in devices if d['max_output_channels'] > 0]
        
        print(f"  🎤 Input devices: {len(input_devices)}")
        print(f"  🔊 Output devices: {len(output_devices)}")
        
        if input_devices:
            print("  Sample input devices:")
            for i, dev in enumerate(input_devices[:3]):
                print(f"    {i+1}. {dev['name']}")
                
        if output_devices:
            print("  Sample output devices:")
            for i, dev in enumerate(output_devices[:3]):
                print(f"    {i+1}. {dev['name']}")
                
        return True
        
    except Exception as e:
        print(f"  ❌ Audio device test failed: {e}")
        return False

def test_voice_structure():
    """Test voice mode code structure"""
    print("\n🏗️  Testing Voice Mode Structure:")
    
    try:
        # Test importing voice interface components
        from audio_utils import AudioManager, AudioBuffer
        print("  ✅ Audio utilities import successful")
        
        # Test basic instantiation
        audio_manager = AudioManager()
        audio_buffer = AudioBuffer()
        print("  ✅ Audio utilities instantiation successful")
        
        # Test device listing (doesn't require hardware)
        devices = audio_manager.list_devices()
        print("  ✅ Device listing successful")
        print(f"    Found {len(devices['input_devices'])} input devices")
        print(f"    Found {len(devices['output_devices'])} output devices")
        
        return True
        
    except Exception as e:
        print(f"  ❌ Voice structure test failed: {e}")
        return False

def main():
    """Main test function"""
    print("=" * 50)
    print("Aud.io Voice Mode - Basic Test Suite")
    print("=" * 50)
    
    # Run all tests
    tests = [
        ("System Setup", test_basic_setup),
        ("Audio Imports", test_audio_imports),
        ("Audio Devices", test_audio_devices),
        ("Voice Structure", test_voice_structure)
    ]
    
    passed_tests = 0
    total_tests = len(tests)
    
    for test_name, test_func in tests:
        print(f"\n{test_name}")
        print("-" * len(test_name))
        try:
            if test_func():
                passed_tests += 1
        except Exception as e:
            print(f"  ❌ Test failed with exception: {e}")
    
    # Summary
    print("\n" + "=" * 50)
    print("TEST SUMMARY")
    print("=" * 50)
    print(f"Passed: {passed_tests}/{total_tests}")
    
    if passed_tests == total_tests:
        print("🎉 All tests passed! Voice mode is ready for use.")
        print("\nNext steps:")
        print("1. Download Vosk and Piper models")
        print("2. Place models in crates/resources/")
        print("3. Run: python main.py --cli")
    else:
        print("⚠️  Some tests failed. Check the errors above.")
        print("\nCommon solutions:")
        print("- Install missing Python packages: pip install -r requirements.txt")
        print("- Check audio driver installation")
        print("- Verify Python version compatibility")
    
    return passed_tests == total_tests

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)