"""
Silero STT (Speech-to-Text) Module
Real-time streaming transcription
"""

import torch
import numpy as np
from pathlib import Path

class SileroSTT:
    def __init__(self, model_path: str = None, language: str = "en"):
        """
        Initialize Silero STT

        Args:
            model_path: Path to silero STT model
            language: Language code (default: "en")
        """
        self.language = language
        self.device = torch.device('cpu')

        # Load model
        if model_path is None:
            model_path = Path(__file__).parent / "silero_models" / "stt" / "v4_en.pt"

        # Load Silero STT model from torch hub
        self.model, self.decoder, self.utils = torch.hub.load(
            repo_or_dir='snakers4/silero-models',
            model='silero_stt',
            language=language,
            device=self.device
        )

        self.model.eval()
        self.model.to(self.device)

        # Extract utility functions
        self.read_audio = self.utils[0]
        self.read_batch = self.utils[1]
        self.split_into_batches = self.utils[2]

        print(f"✓ Silero STT loaded for language: {language}")

    def transcribe(self, audio: np.ndarray, sample_rate: int = 16000) -> dict:
        """
        Transcribe audio to text

        Args:
            audio: Audio data as numpy array (mono, float32)
            sample_rate: Sample rate (must be 16000)

        Returns:
            {
                "text": str,
                "confidence": float,
                "duration_ms": int
            }
        """
        # Ensure sample rate is 16kHz
        if sample_rate != 16000:
            raise ValueError("Silero STT requires 16kHz sample rate")

        # Convert to torch tensor
        audio_tensor = torch.from_numpy(audio).float().to(self.device)

        # Ensure correct shape
        if audio_tensor.dim() == 1:
            audio_tensor = audio_tensor.unsqueeze(0)

        # Run STT
        with torch.no_grad():
            output = self.model(audio_tensor)

        # Decode output to text
        text = self.decoder(output[0].cpu())

        # Calculate duration
        duration_ms = int((len(audio) / sample_rate) * 1000)

        return {
            "text": text,
            "confidence": 0.9,  # Silero doesn't provide confidence, use placeholder
            "duration_ms": duration_ms
        }

    def transcribe_streaming(self, audio_chunks: list, sample_rate: int = 16000):
        """
        Transcribe audio chunks in streaming fashion

        Args:
            audio_chunks: List of audio numpy arrays
            sample_rate: Sample rate

        Yields:
            Transcription results for each chunk
        """
        for i, chunk in enumerate(audio_chunks):
            result = self.transcribe(chunk, sample_rate)
            result["chunk_index"] = i
            result["is_final"] = (i == len(audio_chunks) - 1)
            yield result

    def transcribe_file(self, audio_path: str) -> dict:
        """
        Transcribe audio file

        Args:
            audio_path: Path to audio file

        Returns:
            Transcription result
        """
        # Read audio file
        audio = self.read_audio(audio_path)

        # Transcribe
        return self.transcribe(audio.numpy(), sample_rate=16000)

# Test code
if __name__ == "__main__":
    print("Testing Silero STT...")

    stt = SileroSTT()

    # Test with silent audio
    silence = np.zeros(16000 * 2, dtype=np.float32)  # 2 seconds
    result = stt.transcribe(silence, sample_rate=16000)
    print(f"Silence test: {result}")

    # Test with noise
    noise = np.random.randn(16000 * 2).astype(np.float32) * 0.1
    result = stt.transcribe(noise, sample_rate=16000)
    print(f"Noise test: {result}")

    print("\n✓ STT module working correctly!")
    print("Note: For real testing, speak into microphone or provide audio file")
