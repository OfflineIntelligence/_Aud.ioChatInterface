"""
Silero TTS (Text-to-Speech) Module
Convert text to speech audio
"""

import torch
import numpy as np
from pathlib import Path
import soundfile as sf

class SileroTTS:
    def __init__(self, model_path: str = None, language: str = "en", speaker: str = "en_0"):
        """
        Initialize Silero TTS

        Args:
            model_path: Path to silero TTS model
            language: Language code (default: "en")
            speaker: Speaker ID (default: "en_0")
        """
        self.language = language
        self.speaker = speaker
        self.device = torch.device('cpu')
        self.sample_rate = 48000  # Silero TTS default sample rate

        # Load model from torch hub (TTS models are cached by torch hub automatically)
        # The model_path parameter is ignored for TTS since the model can't be easily saved
        result = torch.hub.load(
            repo_or_dir='snakers4/silero-models',
            model='silero_tts',
            language=language,
            speaker='v3_en'
        )

        # Handle tuple result (model, example_text)
        if isinstance(result, tuple):
            self.model = result[0]
        else:
            self.model = result

        print(f"✓ Silero TTS loaded from torch hub cache")

        # Model is already on CPU and in eval mode
        print(f"  Language: {language}, Speaker: {speaker}")
        print(f"  Sample rate: {self.sample_rate} Hz")

    def synthesize(self, text: str, output_path: str = None) -> np.ndarray:
        """
        Synthesize speech from text

        Args:
            text: Input text to synthesize
            output_path: Optional path to save audio file

        Returns:
            Audio data as numpy array (mono, float32)
        """
        # Generate speech
        with torch.no_grad():
            audio = self.model.apply_tts(
                text=text,
                speaker=self.speaker,
                sample_rate=self.sample_rate
            )

        # Convert to numpy
        audio_np = audio.cpu().numpy()

        # Save to file if requested
        if output_path:
            sf.write(output_path, audio_np, self.sample_rate)
            print(f"✓ Audio saved to: {output_path}")

        return audio_np

    def synthesize_streaming(self, text_chunks: list, chunk_size: int = 50):
        """
        Synthesize audio in streaming chunks

        Args:
            text_chunks: List of text strings
            chunk_size: Maximum characters per chunk

        Yields:
            Audio numpy arrays for each chunk
        """
        for text in text_chunks:
            # Split text into smaller chunks if needed
            if len(text) > chunk_size:
                words = text.split()
                current_chunk = ""
                for word in words:
                    if len(current_chunk) + len(word) + 1 <= chunk_size:
                        current_chunk += word + " "
                    else:
                        if current_chunk:
                            audio = self.synthesize(current_chunk.strip())
                            yield audio
                        current_chunk = word + " "
                if current_chunk:
                    audio = self.synthesize(current_chunk.strip())
                    yield audio
            else:
                audio = self.synthesize(text)
                yield audio

    def synthesize_ssml(self, ssml: str) -> np.ndarray:
        """
        Synthesize speech from SSML markup (future enhancement)

        Args:
            ssml: SSML markup string

        Returns:
            Audio data as numpy array
        """
        # For now, just strip SSML tags and synthesize plain text
        import re
        plain_text = re.sub(r'<[^>]+>', '', ssml)
        return self.synthesize(plain_text)

    def get_sample_rate(self) -> int:
        """Get the sample rate of generated audio"""
        return self.sample_rate

    def list_speakers(self) -> list:
        """List available speakers"""
        # Silero TTS v4 English speakers
        return [
            "en_0",   # Default female
            "en_1",   # Male
            "en_2",   # Female
            "en_3",   # Male
            "en_4",   # Female
        ]

# Test code
if __name__ == "__main__":
    print("Testing Silero TTS...")

    tts = SileroTTS()

    # Test with simple text
    test_text = "Hello, this is a test of the Silero text to speech system."
    print(f"\nSynthesizing: '{test_text}'")

    audio = tts.synthesize(test_text)
    print(f"✓ Generated audio: {audio.shape} samples, {len(audio)/tts.sample_rate:.2f} seconds")

    # Save to file
    output_path = Path(__file__).parent / "test_output.wav"
    tts.synthesize(test_text, output_path=str(output_path))

    # Test streaming
    print("\nTesting streaming synthesis...")
    text_chunks = [
        "This is the first chunk.",
        "Here comes the second chunk.",
        "And finally, the third chunk."
    ]

    total_samples = 0
    for i, audio_chunk in enumerate(tts.synthesize_streaming(text_chunks)):
        total_samples += len(audio_chunk)
        print(f"  Chunk {i+1}: {len(audio_chunk)} samples")

    print(f"✓ Total: {total_samples} samples, {total_samples/tts.sample_rate:.2f} seconds")
    print("\n✓ TTS module working correctly!")
