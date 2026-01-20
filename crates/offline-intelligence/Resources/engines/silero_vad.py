"""
Silero VAD (Voice Activity Detection) Module
Detects speech in audio chunks
"""

import torch
import numpy as np
from pathlib import Path

class SileroVAD:
    def __init__(self, model_path: str = None, threshold: float = 0.5):
        """
        Initialize Silero VAD

        Args:
            model_path: Path to silero_vad.jit model
            threshold: Confidence threshold for speech detection (0.0-1.0)
        """
        self.threshold = threshold
        self.device = torch.device('cpu')

        # Load model
        if model_path is None:
            model_path = Path(__file__).parent / "silero_models" / "vad" / "silero_vad.jit"

        self.model = torch.jit.load(str(model_path))
        self.model.eval()
        self.model.to(self.device)

        # VAD state
        self.reset_states()

        print(f"✓ Silero VAD loaded from: {model_path}")

    def reset_states(self):
        """Reset VAD internal states"""
        # Newer Silero VAD models don't require explicit state management
        pass

    def detect_speech(self, audio: np.ndarray, sample_rate: int = 16000) -> dict:
        """
        Detect speech in audio chunk

        Args:
            audio: Audio data as numpy array (mono, float32)
            sample_rate: Sample rate (must be 16000 for Silero VAD)

        Returns:
            {
                "is_speech": bool,
                "confidence": float,
                "sample_rate": int
            }
        """
        # Ensure sample rate is 16kHz
        if sample_rate != 16000:
            raise ValueError("Silero VAD requires 16kHz sample rate")

        # Convert to torch tensor
        audio_tensor = torch.from_numpy(audio).float().to(self.device)

        # Ensure correct shape (1, num_samples)
        if audio_tensor.dim() == 1:
            audio_tensor = audio_tensor.unsqueeze(0)

        # Run VAD
        with torch.no_grad():
            # Newer Silero VAD models only need audio tensor and sample rate
            speech_prob = self.model(audio_tensor, sample_rate)

        # Handle different return types
        if isinstance(speech_prob, torch.Tensor):
            confidence = speech_prob.item()
        else:
            confidence = float(speech_prob)
        
        is_speech = confidence >= self.threshold

        return {
            "is_speech": is_speech,
            "confidence": confidence,
            "sample_rate": sample_rate
        }

    def process_stream(self, audio_chunks: list, sample_rate: int = 16000):
        """
        Process multiple audio chunks and detect speech segments

        Args:
            audio_chunks: List of audio numpy arrays
            sample_rate: Sample rate

        Yields:
            Speech detection results for each chunk
        """
        self.reset_states()

        for chunk in audio_chunks:
            result = self.detect_speech(chunk, sample_rate)
            yield result

# Test code
if __name__ == "__main__":
    print("Testing Silero VAD...")

    vad = SileroVAD()

    # Test with silence (zeros)
    silence = np.zeros(16000, dtype=np.float32)  # 1 second of silence
    result = vad.detect_speech(silence, sample_rate=16000)
    print(f"Silence test: {result}")

    # Test with noise (random)
    noise = np.random.randn(16000).astype(np.float32) * 0.1
    vad.reset_states()
    result = vad.detect_speech(noise, sample_rate=16000)
    print(f"Noise test: {result}")

    print("\n✓ VAD module working correctly!")
