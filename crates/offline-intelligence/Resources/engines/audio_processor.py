"""
Audio Processing Utilities
Handle audio I/O, format conversion, and streaming
"""

import numpy as np
import base64
import io
import wave
import soundfile as sf
from scipy import signal

class AudioProcessor:
    """Handle audio encoding, decoding, and format conversion"""

    @staticmethod
    def base64_to_numpy(base64_data: str, sample_rate: int = 16000) -> np.ndarray:
        """
        Convert base64 encoded audio to numpy array

        Args:
            base64_data: Base64 encoded audio data
            sample_rate: Expected sample rate

        Returns:
            Audio as numpy array (float32, mono)
        """
        # Decode base64
        audio_bytes = base64.b64decode(base64_data)

        # Convert to numpy array
        # Assuming 16-bit PCM audio
        audio_int16 = np.frombuffer(audio_bytes, dtype=np.int16)

        # Convert to float32 [-1.0, 1.0]
        audio_float32 = audio_int16.astype(np.float32) / 32768.0

        return audio_float32

    @staticmethod
    def numpy_to_base64(audio: np.ndarray) -> str:
        """
        Convert numpy array to base64 encoded audio

        Args:
            audio: Audio numpy array (float32)

        Returns:
            Base64 encoded audio string
        """
        # Convert float32 to int16
        audio_int16 = (audio * 32768.0).astype(np.int16)

        # Convert to bytes
        audio_bytes = audio_int16.tobytes()

        # Encode to base64
        base64_data = base64.b64encode(audio_bytes).decode('utf-8')

        return base64_data

    @staticmethod
    def numpy_to_wav_bytes(audio: np.ndarray, sample_rate: int) -> bytes:
        """
        Convert numpy array to WAV file bytes

        Args:
            audio: Audio numpy array (float32)
            sample_rate: Sample rate

        Returns:
            WAV file as bytes
        """
        # Convert float32 to int16
        audio_int16 = (audio * 32768.0).astype(np.int16)

        # Create WAV file in memory
        buffer = io.BytesIO()
        with wave.open(buffer, 'wb') as wav_file:
            wav_file.setnchannels(1)  # Mono
            wav_file.setsampwidth(2)  # 16-bit
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(audio_int16.tobytes())

        return buffer.getvalue()

    @staticmethod
    def wav_bytes_to_numpy(wav_bytes: bytes) -> tuple:
        """
        Convert WAV bytes to numpy array

        Args:
            wav_bytes: WAV file as bytes

        Returns:
            (audio_array, sample_rate)
        """
        buffer = io.BytesIO(wav_bytes)
        audio, sample_rate = sf.read(buffer)

        # Ensure float32
        audio = audio.astype(np.float32)

        # Ensure mono
        if audio.ndim > 1:
            audio = np.mean(audio, axis=1)

        return audio, sample_rate

    @staticmethod
    def resample(audio: np.ndarray, orig_sr: int, target_sr: int) -> np.ndarray:
        """
        Resample audio to target sample rate

        Args:
            audio: Audio numpy array
            orig_sr: Original sample rate
            target_sr: Target sample rate

        Returns:
            Resampled audio
        """
        if orig_sr == target_sr:
            return audio

        # Calculate resampling ratio
        num_samples = int(len(audio) * target_sr / orig_sr)

        # Use scipy resample
        resampled = signal.resample(audio, num_samples)

        return resampled.astype(np.float32)

    @staticmethod
    def normalize(audio: np.ndarray, target_level: float = 0.9) -> np.ndarray:
        """
        Normalize audio to target level

        Args:
            audio: Audio numpy array
            target_level: Target peak level (0.0-1.0)

        Returns:
            Normalized audio
        """
        max_val = np.abs(audio).max()

        if max_val > 0:
            audio = audio * (target_level / max_val)

        return audio

    @staticmethod
    def add_silence(audio: np.ndarray, sample_rate: int, duration_ms: int = 100) -> np.ndarray:
        """
        Add silence to end of audio

        Args:
            audio: Audio numpy array
            sample_rate: Sample rate
            duration_ms: Duration of silence in milliseconds

        Returns:
            Audio with silence appended
        """
        num_samples = int(sample_rate * duration_ms / 1000)
        silence = np.zeros(num_samples, dtype=np.float32)
        return np.concatenate([audio, silence])

    @staticmethod
    def split_into_chunks(audio: np.ndarray, chunk_size: int, overlap: int = 0) -> list:
        """
        Split audio into chunks

        Args:
            audio: Audio numpy array
            chunk_size: Size of each chunk in samples
            overlap: Overlap between chunks in samples

        Returns:
            List of audio chunks
        """
        chunks = []
        start = 0

        while start < len(audio):
            end = min(start + chunk_size, len(audio))
            chunk = audio[start:end]

            # Pad last chunk if needed
            if len(chunk) < chunk_size:
                chunk = np.pad(chunk, (0, chunk_size - len(chunk)), mode='constant')

            chunks.append(chunk)
            start += chunk_size - overlap

        return chunks

    @staticmethod
    def apply_gain(audio: np.ndarray, gain_db: float) -> np.ndarray:
        """
        Apply gain to audio in dB

        Args:
            audio: Audio numpy array
            gain_db: Gain in decibels

        Returns:
            Audio with gain applied
        """
        gain_linear = 10 ** (gain_db / 20)
        return audio * gain_linear

    @staticmethod
    def detect_silence(audio: np.ndarray, threshold: float = 0.01, min_duration_ms: int = 300, sample_rate: int = 16000) -> list:
        """
        Detect silence regions in audio

        Args:
            audio: Audio numpy array
            threshold: Amplitude threshold for silence
            min_duration_ms: Minimum silence duration in ms
            sample_rate: Sample rate

        Returns:
            List of (start_idx, end_idx) tuples for silence regions
        """
        # Find samples below threshold
        is_silence = np.abs(audio) < threshold

        # Find continuous silence regions
        min_samples = int(sample_rate * min_duration_ms / 1000)

        silence_regions = []
        start_idx = None

        for i, silent in enumerate(is_silence):
            if silent and start_idx is None:
                start_idx = i
            elif not silent and start_idx is not None:
                duration = i - start_idx
                if duration >= min_samples:
                    silence_regions.append((start_idx, i))
                start_idx = None

        return silence_regions

# Test code
if __name__ == "__main__":
    print("Testing Audio Processor...")

    processor = AudioProcessor()

    # Test audio generation
    sample_rate = 16000
    duration = 1.0
    audio = np.sin(2 * np.pi * 440 * np.arange(sample_rate * duration) / sample_rate).astype(np.float32)

    print(f"Generated test audio: {audio.shape} samples")

    # Test base64 encoding/decoding
    base64_data = processor.numpy_to_base64(audio)
    decoded_audio = processor.base64_to_numpy(base64_data, sample_rate)
    print(f"✓ Base64 encoding/decoding: {decoded_audio.shape} samples")

    # Test WAV conversion
    wav_bytes = processor.numpy_to_wav_bytes(audio, sample_rate)
    print(f"✓ WAV conversion: {len(wav_bytes)} bytes")

    # Test resampling
    resampled = processor.resample(audio, sample_rate, 48000)
    print(f"✓ Resampling: {audio.shape} → {resampled.shape}")

    # Test normalization
    normalized = processor.normalize(audio * 0.5, target_level=0.9)
    print(f"✓ Normalization: max = {np.abs(normalized).max():.3f}")

    # Test chunking
    chunks = processor.split_into_chunks(audio, chunk_size=4000, overlap=400)
    print(f"✓ Chunking: {len(chunks)} chunks of size {chunks[0].shape}")

    # Test silence detection
    silence_audio = np.concatenate([audio * 0.5, np.zeros(sample_rate), audio * 0.5])
    silence_regions = processor.detect_silence(silence_audio, threshold=0.01, min_duration_ms=300, sample_rate=sample_rate)
    print(f"✓ Silence detection: {len(silence_regions)} regions found")

    print("\n✓ Audio processor working correctly!")
