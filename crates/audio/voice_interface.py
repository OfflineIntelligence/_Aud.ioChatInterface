"""
Main Voice Interface Module
Integrates STT and TTS for complete voice interaction
"""

import logging
import threading
import time
import json
from typing import Optional, Callable, Dict, Any
from dataclasses import dataclass
from enum import Enum

from .stt import speech_recognizer
from .tts import voice_manager
from ..audio_utils import audio_manager

logger = logging.getLogger(__name__)

class VoiceMode(Enum):
    """Voice interaction modes"""
    INACTIVE = "inactive"
    LISTENING = "listening" 
    PROCESSING = "processing"
    SPEAKING = "speaking"

@dataclass
class VoiceConfig:
    """Configuration for voice interface"""
    enable_stt: bool = True
    enable_tts: bool = True
    silence_threshold: float = 1.5  # seconds
    confidence_threshold: float = 0.6
    wake_word: Optional[str] = None  # e.g., "Hey assistant"
    auto_respond: bool = True
    continuous_mode: bool = False

class VoiceInterface:
    """Main voice interface class that coordinates STT, TTS, and interaction logic"""
    
    def __init__(self, config: Optional[VoiceConfig] = None):
        self.config = config or VoiceConfig()
        self.mode = VoiceMode.INACTIVE
        self.mode_lock = threading.Lock()
        
        # Callbacks
        self.speech_callback: Optional[Callable[[str], Any]] = None
        self.response_callback: Optional[Callable[[str], Any]] = None
        self.mode_change_callback: Optional[Callable[[VoiceMode, VoiceMode], None]] = None
        
        # State tracking
        self.is_active = False
        self.last_speech_time = 0
        self.pending_response = None
        self.wake_word_detected = False
        
        # Setup STT callbacks
        speech_recognizer.set_callbacks(
            partial_callback=self._on_partial_recognition,
            final_callback=self._on_final_recognition,
            silence_callback=self._on_silence_detected
        )
        
        logger.info("Voice interface initialized")
    
    def set_callbacks(self, speech_callback: Optional[Callable[[str], Any]] = None,
                     response_callback: Optional[Callable[[str], Any]] = None,
                     mode_change_callback: Optional[Callable[[VoiceMode, VoiceMode], None]] = None):
        """Set callback functions"""
        self.speech_callback = speech_callback
        self.response_callback = response_callback
        self.mode_change_callback = mode_change_callback
    
    def start(self) -> bool:
        """Start the voice interface"""
        if self.is_active:
            logger.warning("Voice interface already active")
            return True
            
        try:
            # Initialize audio devices
            if not audio_manager.select_devices():
                logger.error("Failed to initialize audio devices")
                return False
            
            # Start speech recognition if enabled
            if self.config.enable_stt:
                if not speech_recognizer.start_listening():
                    logger.error("Failed to start speech recognition")
                    return False
            
            self.is_active = True
            self._set_mode(VoiceMode.LISTENING)
            logger.info("Voice interface started successfully")
            return True
            
        except Exception as e:
            logger.error(f"Failed to start voice interface: {e}")
            return False
    
    def stop(self):
        """Stop the voice interface"""
        if not self.is_active:
            return
            
        try:
            if self.config.enable_stt:
                speech_recognizer.stop_listening()
                
            self.is_active = False
            self._set_mode(VoiceMode.INACTIVE)
            logger.info("Voice interface stopped")
            
        except Exception as e:
            logger.error(f"Error stopping voice interface: {e}")
    
    def speak(self, text: str, wait: bool = True, voice_preset: str = 'normal') -> bool:
        """Speak text through TTS"""
        if not self.config.enable_tts:
            logger.warning("TTS is disabled")
            return False
            
        try:
            self._set_mode(VoiceMode.SPEAKING)
            
            if wait:
                success = voice_manager.speak(text, voice_preset=voice_preset, wait=True)
            else:
                voice_manager.speak(text, voice_preset=voice_preset, wait=False)
                success = True
                
            if success:
                logger.info(f"Spoke: {text}")
                if self.response_callback:
                    self.response_callback(text)
            else:
                logger.error("Failed to speak text")
                
            return success
            
        except Exception as e:
            logger.error(f"TTS error: {e}")
            return False
        finally:
            if self.is_active:
                self._set_mode(VoiceMode.LISTENING)
    
    def speak_async(self, text: str, voice_preset: str = 'normal'):
        """Speak text asynchronously"""
        threading.Thread(target=self.speak, args=(text, False, voice_preset), daemon=True).start()
    
    def _on_partial_recognition(self, text: str):
        """Handle partial speech recognition"""
        logger.debug(f"Partial recognition: {text}")
        # Could show live transcription in UI
    
    def _on_final_recognition(self, text: str):
        """Handle final speech recognition"""
        if not text.strip():
            return
            
        logger.info(f"Recognized: {text}")
        self.last_speech_time = time.time()
        
        # Check for wake word if configured
        if self.config.wake_word:
            if self.config.wake_word.lower() in text.lower():
                self.wake_word_detected = True
                logger.info("Wake word detected")
                self.speak("Yes, I'm listening", voice_preset='clear')
                return
            elif not self.wake_word_detected:
                # Ignore speech until wake word is detected
                return
        
        # Process the recognized speech
        self._process_speech(text)
    
    def _on_silence_detected(self):
        """Handle silence detection"""
        logger.debug("Silence detected")
        
        # Reset wake word state after period of silence
        if self.wake_word_detected and self.config.wake_word:
            time_since_last_speech = time.time() - self.last_speech_time
            if time_since_last_speech > 10.0:  # 10 seconds
                self.wake_word_detected = False
                logger.debug("Wake word state reset due to prolonged silence")
    
    def _process_speech(self, text: str):
        """Process recognized speech and generate response"""
        try:
            self._set_mode(VoiceMode.PROCESSING)
            
            # Call speech callback for application processing
            if self.speech_callback:
                response = self.speech_callback(text)
                if response and self.config.auto_respond:
                    # Handle different response types
                    if isinstance(response, str):
                        self.pending_response = response
                    elif isinstance(response, dict):
                        self.pending_response = response.get('response', '')
                    else:
                        self.pending_response = str(response)
                    
                    # Speak response if available
                    if self.pending_response:
                        self.speak_async(self.pending_response)
                        
        except Exception as e:
            logger.error(f"Speech processing error: {e}")
            self.speak("Sorry, I encountered an error processing your request")
        finally:
            if self.is_active:
                self._set_mode(VoiceMode.LISTENING)
    
    def _set_mode(self, new_mode: VoiceMode):
        """Set voice interface mode with callback notification"""
        with self.mode_lock:
            old_mode = self.mode
            self.mode = new_mode
            
            if old_mode != new_mode:
                logger.debug(f"Mode changed: {old_mode.value} -> {new_mode.value}")
                if self.mode_change_callback:
                    self.mode_change_callback(old_mode, new_mode)
    
    def get_status(self) -> Dict[str, Any]:
        """Get current status information"""
        return {
            'active': self.is_active,
            'mode': self.mode.value,
            'stt_enabled': self.config.enable_stt,
            'tts_enabled': self.config.enable_tts,
            'wake_word_enabled': self.config.wake_word is not None,
            'wake_word_detected': self.wake_word_detected,
            'last_speech_time': self.last_speech_time,
            'devices': {
                'input': audio_manager.input_device,
                'output': audio_manager.output_device
            }
        }
    
    def set_wake_word(self, wake_word: Optional[str]):
        """Set or disable wake word"""
        self.config.wake_word = wake_word
        if wake_word:
            logger.info(f"Wake word set to: {wake_word}")
        else:
            logger.info("Wake word disabled")
    
    def set_continuous_mode(self, enabled: bool):
        """Enable/disable continuous listening mode"""
        self.config.continuous_mode = enabled
        logger.info(f"Continuous mode {'enabled' if enabled else 'disabled'}")

# Global voice interface instance
voice_interface = VoiceInterface()

# Convenience functions
def start_voice_interface() -> bool:
    """Start the global voice interface"""
    return voice_interface.start()

def stop_voice_interface():
    """Stop the global voice interface"""
    voice_interface.stop()

def speak_text(text: str, wait: bool = True) -> bool:
    """Speak text using the global voice interface"""
    return voice_interface.speak(text, wait)

def get_voice_status() -> Dict[str, Any]:
    """Get status of the global voice interface"""
    return voice_interface.get_status()

if __name__ == "__main__":
    # Test the voice interface
    logging.basicConfig(level=logging.INFO)
    
    def on_speech_recognized(text):
        print(f"🎤 Recognized: {text}")
        # Echo back the recognized text
        return f"You said: {text}"
    
    def on_response_generated(response):
        print(f"🔊 Speaking: {response}")
    
    def on_mode_change(old_mode, new_mode):
        print(f"🔄 Mode: {old_mode.value} -> {new_mode.value}")
    
    # Configure callbacks
    voice_interface.set_callbacks(
        speech_callback=on_speech_recognized,
        response_callback=on_response_generated,
        mode_change_callback=on_mode_change
    )
    
    print("Starting voice interface test...")
    print("Say something into your microphone!")
    print("Press Ctrl+C to stop")
    
    try:
        if start_voice_interface():
            # Keep running
            while True:
                time.sleep(1)
        else:
            print("Failed to start voice interface")
    except KeyboardInterrupt:
        print("\nStopping voice interface...")
        stop_voice_interface()
        print("Done!")