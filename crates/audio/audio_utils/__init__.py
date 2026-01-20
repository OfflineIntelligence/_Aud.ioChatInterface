"""
Audio Utilities Module
Handles cross-platform audio I/O, buffering, and format conversion
"""

import sounddevice as sd
import numpy as np
import wave
import threading
import queue
import logging
from typing import Optional, Callable, Tuple
from scipy import signal

logger = logging.getLogger(__name__)

class AudioManager:
    """Manages audio input/output devices and streams"""
    
    def __init__(self):
        self.input_device = None
        self.output_device = None
        self.sample_rate = 16000  # Standard for speech processing
        self.channels = 1
        self.block_duration = 0.1  # 100ms blocks for real-time processing
        self.stream = None
        self.is_recording = False
        
    def list_devices(self) -> dict:
        """List available audio devices"""
        devices = sd.query_devices()
        input_devices = []
        output_devices = []
        
        for i, device in enumerate(devices):
            if device['max_input_channels'] > 0:
                input_devices.append({
                    'id': i,
                    'name': device['name'],
                    'channels': device['max_input_channels'],
                    'sample_rates': self._get_supported_rates(i, 'input')
                })
            if device['max_output_channels'] > 0:
                output_devices.append({
                    'id': i,
                    'name': device['name'],
                    'channels': device['max_output_channels'],
                    'sample_rates': self._get_supported_rates(i, 'output')
                })
                
        return {
            'input_devices': input_devices,
            'output_devices': output_devices
        }
    
    def _get_supported_rates(self, device_id: int, io_type: str) -> list:
        """Get supported sample rates for a device"""
        try:
            supported_rates = [8000, 16000, 22050, 44100, 48000]
            valid_rates = []
            
            for rate in supported_rates:
                try:
                    if io_type == 'input':
                        sd.check_input_settings(device=device_id, samplerate=rate, channels=1)
                    else:
                        sd.check_output_settings(device=device_id, samplerate=rate, channels=1)
                    valid_rates.append(rate)
                except:
                    continue
                    
            return valid_rates if valid_rates else [44100]
        except:
            return [44100]
    
    def select_devices(self, input_device_id: Optional[int] = None, 
                      output_device_id: Optional[int] = None) -> bool:
        """Select audio devices for input/output"""
        try:
            devices = self.list_devices()
            
            # Select input device
            if input_device_id is not None:
                input_dev = next((d for d in devices['input_devices'] if d['id'] == input_device_id), None)
                if input_dev:
                    self.input_device = input_device_id
                    logger.info(f"Selected input device: {input_dev['name']}")
                else:
                    logger.error(f"Input device {input_device_id} not found")
                    return False
            
            # Select output device  
            if output_device_id is not None:
                output_dev = next((d for d in devices['output_devices'] if d['id'] == output_device_id), None)
                if output_dev:
                    self.output_device = output_device_id
                    logger.info(f"Selected output device: {output_dev['name']}")
                else:
                    logger.error(f"Output device {output_device_id} not found")
                    return False
                    
            return True
        except Exception as e:
            logger.error(f"Device selection failed: {e}")
            return False
    
    def start_recording(self, callback: Callable[[np.ndarray], None]) -> bool:
        """Start continuous audio recording with callback"""
        if self.is_recording:
            logger.warning("Already recording")
            return False
            
        if self.input_device is None:
            logger.error("No input device selected")
            return False
            
        try:
            def audio_callback(indata, frames, time, status):
                if status:
                    logger.warning(f"Audio stream status: {status}")
                if callback:
                    callback(indata.copy())
            
            self.stream = sd.InputStream(
                device=self.input_device,
                channels=self.channels,
                samplerate=self.sample_rate,
                blocksize=int(self.sample_rate * self.block_duration),
                callback=audio_callback
            )
            
            self.stream.start()
            self.is_recording = True
            logger.info("Started audio recording")
            return True
            
        except Exception as e:
            logger.error(f"Failed to start recording: {e}")
            return False
    
    def stop_recording(self):
        """Stop audio recording"""
        if not self.is_recording:
            return
            
        try:
            if self.stream:
                self.stream.stop()
                self.stream.close()
                self.stream = None
                
            self.is_recording = False
            logger.info("Stopped audio recording")
            
        except Exception as e:
            logger.error(f"Error stopping recording: {e}")
    
    def play_audio(self, audio_data: np.ndarray, sample_rate: int = None) -> bool:
        """Play audio data through output device"""
        if self.output_device is None:
            logger.error("No output device selected")
            return False
            
        try:
            sr = sample_rate or self.sample_rate
            
            # Resample if needed
            if sr != self.sample_rate:
                audio_data = self._resample_audio(audio_data, sr, self.sample_rate)
                sr = self.sample_rate
            
            # Play synchronously
            sd.play(audio_data, sr, device=self.output_device)
            sd.wait()  # Wait for playback to complete
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to play audio: {e}")
            return False
    
    def _resample_audio(self, audio_data: np.ndarray, from_rate: int, to_rate: int) -> np.ndarray:
        """Resample audio data to target sample rate"""
        if from_rate == to_rate:
            return audio_data
            
        try:
            # Calculate resampling ratio
            ratio = to_rate / from_rate
            new_length = int(len(audio_data) * ratio)
            
            # Use scipy for resampling
            resampled = signal.resample(audio_data, new_length)
            return resampled.astype(np.float32)
            
        except Exception as e:
            logger.warning(f"Resampling failed, returning original: {e}")
            return audio_data

class AudioBuffer:
    """Circular buffer for audio data with efficient access"""
    
    def __init__(self, duration_seconds: float = 5.0, sample_rate: int = 16000):
        self.sample_rate = sample_rate
        self.buffer_size = int(duration_seconds * sample_rate)
        self.buffer = np.zeros(self.buffer_size, dtype=np.float32)
        self.write_pos = 0
        self.lock = threading.Lock()
        
    def write(self, audio_chunk: np.ndarray):
        """Write audio chunk to circular buffer"""
        with self.lock:
            chunk_len = len(audio_chunk)
            if chunk_len > self.buffer_size:
                # If chunk is larger than buffer, take the most recent samples
                audio_chunk = audio_chunk[-self.buffer_size:]
                chunk_len = self.buffer_size
                
            if self.write_pos + chunk_len <= self.buffer_size:
                # Single write operation
                self.buffer[self.write_pos:self.write_pos + chunk_len] = audio_chunk
            else:
                # Wrap around buffer
                first_part = self.buffer_size - self.write_pos
                self.buffer[self.write_pos:] = audio_chunk[:first_part]
                self.buffer[:chunk_len - first_part] = audio_chunk[first_part:]
                
            self.write_pos = (self.write_pos + chunk_len) % self.buffer_size
    
    def read_last(self, duration_seconds: float) -> np.ndarray:
        """Read the last N seconds of audio"""
        with self.lock:
            samples_needed = int(duration_seconds * self.sample_rate)
            samples_needed = min(samples_needed, self.buffer_size)
            
            if samples_needed <= self.write_pos:
                # Continuous segment
                start_pos = self.write_pos - samples_needed
                return self.buffer[start_pos:self.write_pos].copy()
            else:
                # Wrapped segment - combine end and beginning
                end_samples = self.write_pos
                start_samples = samples_needed - end_samples
                result = np.concatenate([
                    self.buffer[-start_samples:],
                    self.buffer[:end_samples]
                ])
                return result
    
    def clear(self):
        """Clear the buffer"""
        with self.lock:
            self.buffer.fill(0)
            self.write_pos = 0

def convert_to_wav(audio_data: np.ndarray, sample_rate: int, filepath: str) -> bool:
    """Convert numpy audio array to WAV file"""
    try:
        # Normalize to 16-bit range
        if audio_data.dtype != np.int16:
            audio_normalized = np.int16(audio_data / np.max(np.abs(audio_data)) * 32767)
        else:
            audio_normalized = audio_data
            
        with wave.open(filepath, 'wb') as wav_file:
            wav_file.setnchannels(1)  # Mono
            wav_file.setsampwidth(2)  # 16-bit
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(audio_normalized.tobytes())
            
        return True
    except Exception as e:
        logger.error(f"Failed to save WAV file: {e}")
        return False

def load_wav_file(filepath: str) -> Tuple[np.ndarray, int]:
    """Load WAV file and return audio data and sample rate"""
    try:
        with wave.open(filepath, 'rb') as wav_file:
            sample_rate = wav_file.getframerate()
            frames = wav_file.readframes(wav_file.getnframes())
            
        audio_data = np.frombuffer(frames, dtype=np.int16)
        # Convert to float32 normalized to [-1, 1]
        audio_float = audio_data.astype(np.float32) / 32768.0
        
        return audio_float, sample_rate
    except Exception as e:
        logger.error(f"Failed to load WAV file: {e}")
        return np.array([]), 0

# Global audio manager instance
audio_manager = AudioManager()

if __name__ == "__main__":
    # Test audio devices
    logging.basicConfig(level=logging.INFO)
    devices = audio_manager.list_devices()
    print("Available Input Devices:")
    for dev in devices['input_devices']:
        print(f"  {dev['id']}: {dev['name']} - {dev['sample_rates']}")
    
    print("\nAvailable Output Devices:")
    for dev in devices['output_devices']:
        print(f"  {dev['id']}: {dev['name']} - {dev['sample_rates']}")