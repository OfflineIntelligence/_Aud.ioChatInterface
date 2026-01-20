"""
Text-to-Speech Module using Piper
Handles offline speech synthesis with voice customization
"""

import os
import logging
import threading
import time
from typing import Optional, List
import numpy as np
from piper import PiperVoice
import tempfile

from ..audio_utils import audio_manager

logger = logging.getLogger(__name__)

class SpeechSynthesizer:
    """Main speech synthesis class using Piper TTS"""
    
    def __init__(self, model_path: str = None, config_path: str = None):
        self.model_path = model_path or self._find_default_model()
        self.config_path = config_path or self._find_default_config()
        self.voice = None
        self.sample_rate = 22050  # Default Piper sample rate
        self.is_speaking = False
        self.speak_lock = threading.Lock()
        
        self._initialize_voice()
    
    def _find_default_model(self) -> str:
        """Find default Piper model path"""
        possible_paths = [
            os.path.join(os.path.dirname(__file__), "..", "..", "resources", "piper", "en_US-lessac-medium.onnx"),
            os.path.join(os.getcwd(), "resources", "piper", "en_US-lessac-medium.onnx"),
            os.path.expanduser("~/piper-tts/en_US-lessac-medium.onnx")
        ]
        
        for path in possible_paths:
            if os.path.exists(path):
                logger.info(f"Found Piper model at: {path}")
                return path
                
        logger.warning("No Piper model found. Please download a model and place it in resources/piper/")
        return ""
    
    def _find_default_config(self) -> str:
        """Find default Piper config path"""
        if not self.model_path:
            return ""
            
        config_path = self.model_path.replace('.onnx', '.onnx.json')
        if os.path.exists(config_path):
            logger.info(f"Found Piper config at: {config_path}")
            return config_path
            
        return ""
    
    def _initialize_voice(self):
        """Initialize Piper voice model"""
        if not self.model_path or not os.path.exists(self.model_path):
            logger.error("Piper model not found. Speech synthesis disabled.")
            return False
            
        try:
            logger.info(f"Loading Piper model from: {self.model_path}")
            self.voice = PiperVoice.load(self.model_path, config_path=self.config_path)
            self.sample_rate = self.voice.config.sample_rate
            logger.info(f"Piper model loaded successfully (sample rate: {self.sample_rate})")
            return True
        except Exception as e:
            logger.error(f"Failed to load Piper model: {e}")
            return False
    
    def synthesize(self, text: str, play_immediately: bool = True, 
                  save_path: Optional[str] = None) -> Optional[np.ndarray]:
        """
        Synthesize speech from text
        
        Args:
            text: Text to synthesize
            play_immediately: Whether to play the audio immediately
            save_path: Optional path to save the audio file
            
        Returns:
            Audio data as numpy array, or None if failed
        """
        if not self.voice:
            logger.error("Voice model not initialized")
            return None
            
        if not text or not text.strip():
            logger.warning("Empty text provided")
            return None
            
        with self.speak_lock:
            try:
                self.is_speaking = True
                logger.debug(f"Synthesizing: {text}")
                
                # Generate audio
                audio_data = self.voice.synthesize(text)
                
                # Convert to numpy array
                if isinstance(audio_data, list):
                    audio_array = np.array(audio_data, dtype=np.float32)
                else:
                    audio_array = np.frombuffer(audio_data, dtype=np.float32)
                
                # Save to file if requested
                if save_path:
                    self._save_audio_file(audio_array, save_path)
                
                # Play immediately if requested
                if play_immediately:
                    self._play_audio(audio_array)
                
                return audio_array
                
            except Exception as e:
                logger.error(f"Synthesis failed: {e}")
                return None
            finally:
                self.is_speaking = False
    
    def speak(self, text: str) -> bool:
        """Speak text synchronously"""
        return self.synthesize(text, play_immediately=True) is not None
    
    def speak_async(self, text: str, callback: Optional[callable] = None) -> threading.Thread:
        """Speak text asynchronously in a separate thread"""
        def speak_thread():
            success = self.speak(text)
            if callback:
                callback(success)
                
        thread = threading.Thread(target=speak_thread, daemon=True)
        thread.start()
        return thread
    
    def _play_audio(self, audio_data: np.ndarray):
        """Play synthesized audio"""
        try:
            # Ensure audio manager has output device selected
            if not audio_manager.output_device:
                audio_manager.select_devices()
                
            success = audio_manager.play_audio(audio_data, self.sample_rate)
            if not success:
                logger.warning("Failed to play synthesized audio")
                
        except Exception as e:
            logger.error(f"Audio playback error: {e}")
    
    def _save_audio_file(self, audio_data: np.ndarray, filepath: str):
        """Save audio data to WAV file"""
        try:
            from scipy.io.wavfile import write
            
            # Convert float32 [-1, 1] to int16
            audio_int16 = (audio_data * 32767).astype(np.int16)
            
            # Write WAV file
            write(filepath, self.sample_rate, audio_int16)
            logger.info(f"Saved audio to: {filepath}")
            
        except Exception as e:
            logger.error(f"Failed to save audio file: {e}")
    
    def is_available(self) -> bool:
        """Check if TTS is ready for use"""
        return self.voice is not None
    
    def get_available_voices(self) -> List[str]:
        """Get list of available voice models"""
        voices = []
        
        # Check resources directory
        piper_dir = os.path.join(os.path.dirname(__file__), "..", "..", "resources", "piper")
        if os.path.exists(piper_dir):
            for file in os.listdir(piper_dir):
                if file.endswith('.onnx'):
                    voices.append(file)
                    
        return voices
    
    def set_voice(self, model_name: str) -> bool:
        """Change to a different voice model"""
        piper_dir = os.path.join(os.path.dirname(__file__), "..", "..", "resources", "piper")
        model_path = os.path.join(piper_dir, model_name)
        config_path = model_path.replace('.onnx', '.onnx.json')
        
        if not os.path.exists(model_path):
            logger.error(f"Voice model not found: {model_path}")
            return False
            
        try:
            self.model_path = model_path
            self.config_path = config_path
            return self._initialize_voice()
        except Exception as e:
            logger.error(f"Failed to set voice: {e}")
            return False
    
    def set_speech_params(self, length_scale: float = 1.0, noise_scale: float = 0.667,
                         noise_w: float = 0.8):
        """Adjust speech synthesis parameters"""
        if not self.voice:
            return
            
        try:
            # Note: Piper parameter adjustment may vary by version
            # This is a simplified approach
            logger.info(f"Setting speech parameters: length={length_scale}, noise={noise_scale}")
            
            # Store parameters for future use
            self.length_scale = length_scale
            self.noise_scale = noise_scale
            self.noise_w = noise_w
            
        except Exception as e:
            logger.error(f"Failed to set speech parameters: {e}")

class VoiceManager:
    """Manage multiple voices and provide high-level TTS interface"""
    
    def __init__(self):
        self.default_synthesizer = SpeechSynthesizer()
        self.active_synthesizer = self.default_synthesizer
        self.voice_presets = {
            'normal': {'length_scale': 1.0, 'noise_scale': 0.667, 'noise_w': 0.8},
            'fast': {'length_scale': 0.8, 'noise_scale': 0.667, 'noise_w': 0.8},
            'slow': {'length_scale': 1.2, 'noise_scale': 0.667, 'noise_w': 0.8},
            'clear': {'length_scale': 1.0, 'noise_scale': 0.3, 'noise_w': 0.5}
        }
    
    def speak(self, text: str, voice_preset: str = 'normal', 
              wait: bool = True) -> bool:
        """High-level speak function with presets"""
        if not self.active_synthesizer.is_available():
            logger.error("No voice synthesizer available")
            return False
            
        # Apply voice preset
        if voice_preset in self.voice_presets:
            params = self.voice_presets[voice_preset]
            self.active_synthesizer.set_speech_params(**params)
        
        if wait:
            return self.active_synthesizer.speak(text)
        else:
            self.active_synthesizer.speak_async(text)
            return True
    
    def set_voice_by_name(self, voice_name: str) -> bool:
        """Switch to a different voice by name"""
        return self.active_synthesizer.set_voice(voice_name)
    
    def get_available_voices(self) -> List[str]:
        """Get all available voices"""
        return self.active_synthesizer.get_available_voices()

# Global voice manager instance
voice_manager = VoiceManager()

if __name__ == "__main__":
    # Test the speech synthesizer
    logging.basicConfig(level=logging.INFO)
    
    print("Testing speech synthesis...")
    
    # Test available voices
    voices = voice_manager.get_available_voices()
    print(f"Available voices: {voices}")
    
    # Test speaking
    test_text = "Hello, this is a test of the offline text to speech system."
    print(f"Speaking: {test_text}")
    
    success = voice_manager.speak(test_text, voice_preset='clear')
    if success:
        print("Speech synthesis completed successfully")
    else:
        print("Speech synthesis failed")