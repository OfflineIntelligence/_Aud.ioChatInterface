"""
Speech-to-Text Module using Vosk
Handles offline speech recognition with voice activity detection
"""

import os
import json
import logging
import threading
import queue
import time
from typing import Optional, Callable, List
import numpy as np
from vosk import Model, KaldiRecognizer
import webrtcvad

from ..audio_utils import audio_manager, AudioBuffer

logger = logging.getLogger(__name__)

class SpeechRecognizer:
    """Main speech recognition class integrating Vosk STT and WebRTC VAD"""
    
    def __init__(self, model_path: str = None):
        self.model_path = model_path or self._find_default_model()
        self.vosk_model = None
        self.recognizer = None
        self.vad = webrtcvad.Vad(2)  # Aggressiveness level 2 (0-3)
        self.sample_rate = 16000
        self.frame_duration = 30  # ms
        self.frame_size = int(self.sample_rate * self.frame_duration / 1000)
        
        # Audio buffers
        self.audio_buffer = AudioBuffer(duration_seconds=10.0, sample_rate=self.sample_rate)
        self.speech_buffer = AudioBuffer(duration_seconds=30.0, sample_rate=self.sample_rate)
        
        # Threading
        self.is_listening = False
        self.listen_thread = None
        self.processing_thread = None
        self.audio_queue = queue.Queue(maxsize=100)
        
        # Callbacks
        self.partial_callback: Optional[Callable[[str], None]] = None
        self.final_callback: Optional[Callable[[str], None]] = None
        self.silence_callback: Optional[Callable[[], None]] = None
        
        # State tracking
        self.is_speaking = False
        self.silence_start_time = None
        self.silence_threshold = 1.5  # seconds of silence to trigger end of speech
        
        self._initialize_model()
    
    def _find_default_model(self) -> str:
        """Find default Vosk model path"""
        possible_paths = [
            os.path.join(os.path.dirname(__file__), "..", "..", "resources", "vosk", "model"),
            os.path.join(os.getcwd(), "resources", "vosk", "model"),
            os.path.expanduser("~/vosk-model-small-en-us-0.15")
        ]
        
        for path in possible_paths:
            if os.path.exists(path):
                logger.info(f"Found Vosk model at: {path}")
                return path
                
        logger.warning("No Vosk model found. Please download a model and place it in resources/vosk/")
        return ""
    
    def _initialize_model(self):
        """Initialize Vosk model and recognizer"""
        if not self.model_path or not os.path.exists(self.model_path):
            logger.error("Vosk model not found. Speech recognition disabled.")
            return False
            
        try:
            logger.info(f"Loading Vosk model from: {self.model_path}")
            self.vosk_model = Model(self.model_path)
            self.recognizer = KaldiRecognizer(self.vosk_model, self.sample_rate)
            self.recognizer.SetWords(True)  # Enable word-level timing
            logger.info("Vosk model loaded successfully")
            return True
        except Exception as e:
            logger.error(f"Failed to load Vosk model: {e}")
            return False
    
    def set_callbacks(self, partial_callback: Optional[Callable[[str], None]] = None,
                     final_callback: Optional[Callable[[str], None]] = None,
                     silence_callback: Optional[Callable[[], None]] = None):
        """Set callback functions for speech events"""
        self.partial_callback = partial_callback
        self.final_callback = final_callback
        self.silence_callback = silence_callback
    
    def is_voice_activity(self, audio_frame: bytes) -> bool:
        """Detect voice activity in audio frame using WebRTC VAD"""
        try:
            return self.vad.is_speech(audio_frame, self.sample_rate)
        except:
            # Fallback: simple energy-based detection
            audio_array = np.frombuffer(audio_frame, dtype=np.int16)
            energy = np.mean(np.abs(audio_array.astype(np.float32)))
            return energy > 500  # Threshold determined empirically
    
    def start_listening(self) -> bool:
        """Start continuous speech recognition"""
        if self.is_listening:
            logger.warning("Already listening")
            return False
            
        if not self.vosk_model or not self.recognizer:
            logger.error("Model not initialized")
            return False
            
        if not audio_manager.select_devices():
            logger.error("No audio devices available")
            return False
            
        self.is_listening = True
        
        # Start audio capture thread
        self.listen_thread = threading.Thread(target=self._audio_capture_loop, daemon=True)
        self.listen_thread.start()
        
        # Start processing thread
        self.processing_thread = threading.Thread(target=self._processing_loop, daemon=True)
        self.processing_thread.start()
        
        logger.info("Started speech recognition")
        return True
    
    def stop_listening(self):
        """Stop speech recognition"""
        self.is_listening = False
        
        if self.listen_thread:
            self.listen_thread.join(timeout=2.0)
            
        if self.processing_thread:
            self.processing_thread.join(timeout=2.0)
            
        audio_manager.stop_recording()
        logger.info("Stopped speech recognition")
    
    def _audio_capture_loop(self):
        """Capture audio and feed to processing queue"""
        def audio_callback(audio_data: np.ndarray):
            if not self.is_listening:
                return
                
            # Convert to int16 and split into VAD frames
            audio_int16 = (audio_data * 32767).astype(np.int16)
            
            # Split into 30ms frames for VAD
            for i in range(0, len(audio_int16), self.frame_size):
                if i + self.frame_size <= len(audio_int16):
                    frame = audio_int16[i:i + self.frame_size].tobytes()
                    
                    # Add to queues
                    self.audio_buffer.write(audio_data[i:i + self.frame_size])
                    
                    try:
                        self.audio_queue.put_nowait((frame, audio_data[i:i + self.frame_size]))
                    except queue.Full:
                        pass  # Drop frame if queue is full
        
        audio_manager.start_recording(audio_callback)
    
    def _processing_loop(self):
        """Process audio frames for speech detection and recognition"""
        speech_frames = []
        silence_frames = 0
        min_speech_frames = 5  # Minimum frames to consider speech active
        
        while self.is_listening:
            try:
                frame_bytes, audio_chunk = self.audio_queue.get(timeout=0.1)
                
                # Voice Activity Detection
                is_speech = self.is_voice_activity(frame_bytes)
                
                if is_speech:
                    speech_frames.append(audio_chunk)
                    silence_frames = 0
                    if not self.is_speaking and len(speech_frames) >= min_speech_frames:
                        self._speech_started()
                else:
                    silence_frames += 1
                    if self.is_speaking:
                        if silence_frames > (self.silence_threshold * 1000 / self.frame_duration):
                            self._speech_ended(speech_frames)
                            speech_frames = []
                            
                # Process accumulated speech for recognition
                if self.is_speaking and len(speech_frames) > 0:
                    self._process_speech_frames(speech_frames)
                    
            except queue.Empty:
                continue
            except Exception as e:
                logger.error(f"Processing error: {e}")
    
    def _speech_started(self):
        """Handle speech start event"""
        self.is_speaking = True
        self.silence_start_time = None
        logger.debug("Speech started detected")
    
    def _speech_ended(self, speech_frames: List[np.ndarray]):
        """Handle speech end event"""
        self.is_speaking = False
        self.silence_start_time = time.time()
        
        # Process final speech segment
        if speech_frames:
            full_audio = np.concatenate(speech_frames)
            self._process_final_speech(full_audio)
            
        logger.debug("Speech ended detected")
        
        if self.silence_callback:
            self.silence_callback()
    
    def _process_speech_frames(self, frames: List[np.ndarray]):
        """Process ongoing speech frames for partial recognition"""
        if len(frames) < 10:  # Need minimum frames for meaningful recognition
            return
            
        try:
            # Concatenate frames
            audio_data = np.concatenate(frames[-20:])  # Last ~0.6 seconds
            audio_int16 = (audio_data * 32767).astype(np.int16)
            
            # Feed to Vosk recognizer
            if self.recognizer.AcceptWaveform(audio_int16.tobytes()):
                result = json.loads(self.recognizer.Result())
                if 'text' in result and result['text'].strip():
                    if self.partial_callback:
                        self.partial_callback(result['text'])
            else:
                partial_result = json.loads(self.recognizer.PartialResult())
                if 'partial' in partial_result and partial_result['partial'].strip():
                    if self.partial_callback:
                        self.partial_callback(partial_result['partial'])
                        
        except Exception as e:
            logger.error(f"Partial recognition error: {e}")
    
    def _process_final_speech(self, audio_data: np.ndarray):
        """Process final speech segment for complete recognition"""
        try:
            audio_int16 = (audio_data * 32767).astype(np.int16)
            
            # Force final recognition
            self.recognizer.AcceptWaveform(audio_int16.tobytes())
            result = json.loads(self.recognizer.FinalResult())
            
            if 'text' in result and result['text'].strip():
                logger.info(f"Final recognition: {result['text']}")
                if self.final_callback:
                    self.final_callback(result['text'])
                    
        except Exception as e:
            logger.error(f"Final recognition error: {e}")
    
    def transcribe_audio_file(self, filepath: str) -> str:
        """Transcribe a complete audio file"""
        if not self.vosk_model or not self.recognizer:
            return ""
            
        try:
            import wave
            with wave.open(filepath, 'rb') as wf:
                if wf.getframerate() != self.sample_rate:
                    logger.error(f"Audio file sample rate {wf.getframerate()} != {self.sample_rate}")
                    return ""
                
                results = []
                while True:
                    data = wf.readframes(4000)
                    if len(data) == 0:
                        break
                    if self.recognizer.AcceptWaveform(data):
                        result = json.loads(self.recognizer.Result())
                        if 'text' in result:
                            results.append(result['text'])
                
                # Get final result
                final_result = json.loads(self.recognizer.FinalResult())
                if 'text' in final_result:
                    results.append(final_result['text'])
                
                return ' '.join(results).strip()
                
        except Exception as e:
            logger.error(f"File transcription error: {e}")
            return ""

# Global speech recognizer instance
speech_recognizer = SpeechRecognizer()

if __name__ == "__main__":
    # Test the speech recognizer
    logging.basicConfig(level=logging.INFO)
    
    def on_partial(text):
        print(f"Partial: {text}")
    
    def on_final(text):
        print(f"Final: {text}")
    
    def on_silence():
        print("Silence detected")
    
    speech_recognizer.set_callbacks(
        partial_callback=on_partial,
        final_callback=on_final,
        silence_callback=on_silence
    )
    
    print("Starting speech recognition test...")
    print("Speak into your microphone (Ctrl+C to stop)")
    
    try:
        if speech_recognizer.start_listening():
            while True:
                time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopping...")
        speech_recognizer.stop_listening()