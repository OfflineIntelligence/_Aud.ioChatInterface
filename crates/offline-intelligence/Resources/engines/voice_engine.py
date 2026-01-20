"""
Voice Engine Service - Main FastAPI Application
Provides REST API for Voice Mode (VAD, STT, TTS)
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel
from typing import Optional, List
import numpy as np
import asyncio
from pathlib import Path
import io
import uvicorn

# Import Silero modules
from silero_vad import SileroVAD
from silero_stt import SileroSTT
from silero_tts import SileroTTS
from audio_processor import AudioProcessor

# FastAPI app
app = FastAPI(title="Voice Engine API", version="1.0.0")

# Global model instances
vad_model: Optional[SileroVAD] = None
stt_model: Optional[SileroSTT] = None
tts_model: Optional[SileroTTS] = None
audio_processor = AudioProcessor()

# Session storage for streaming
active_sessions = {}

# Request/Response models
class VADRequest(BaseModel):
    audio_data: str  # base64 encoded
    sample_rate: int = 16000

class VADResponse(BaseModel):
    is_speech: bool
    confidence: float
    sample_rate: int

class STTRequest(BaseModel):
    audio_data: str  # base64 encoded
    sample_rate: int = 16000
    language: str = "en"

class STTResponse(BaseModel):
    text: str
    confidence: float
    duration_ms: int

class TTSRequest(BaseModel):
    text: str
    language: str = "en"
    speaker: str = "en_0"
    sample_rate: int = 48000
    output_format: str = "wav"  # "wav" or "pcm"

class TTSStreamRequest(BaseModel):
    text: str
    language: str = "en"
    speaker: str = "en_0"
    chunk_size: int = 50  # characters per chunk

class HealthResponse(BaseModel):
    status: str
    models_loaded: dict

# Startup: Load all models
@app.on_event("startup")
async def startup_event():
    """Load all Silero models on startup"""
    global vad_model, stt_model, tts_model

    print("="*60)
    print("Voice Engine Service Starting...")
    print("="*60)

    try:
        # Load VAD
        print("\n[1/3] Loading Silero VAD...")
        vad_model = SileroVAD()

        # Load STT
        print("\n[2/3] Loading Silero STT...")
        stt_model = SileroSTT(language="en")

        # Load TTS
        print("\n[3/3] Loading Silero TTS...")
        tts_model = SileroTTS(language="en", speaker="en_0")

        print("\n" + "="*60)
        print("✓ All models loaded successfully!")
        print("Voice Engine Service ready on http://127.0.0.1:8002")
        print("="*60 + "\n")

    except Exception as e:
        print(f"\n✗ Error loading models: {e}")
        print("Please run download_models.py first!")
        raise

# Health check
@app.get("/", response_model=HealthResponse)
async def root():
    """Health check endpoint"""
    return {
        "status": "ok",
        "models_loaded": {
            "vad": vad_model is not None,
            "stt": stt_model is not None,
            "tts": tts_model is not None
        }
    }

@app.get("/health", response_model=HealthResponse)
async def health():
    """Health check endpoint"""
    return await root()

# VAD Endpoints
@app.post("/vad/detect", response_model=VADResponse)
async def detect_speech(request: VADRequest):
    """
    Detect speech in audio chunk using Silero VAD

    Returns:
        VADResponse with is_speech flag and confidence
    """
    try:
        # Convert base64 to numpy
        audio = audio_processor.base64_to_numpy(request.audio_data, request.sample_rate)

        # Detect speech
        result = vad_model.detect_speech(audio, request.sample_rate)

        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"VAD error: {str(e)}")

@app.post("/vad/reset")
async def reset_vad():
    """Reset VAD internal states"""
    vad_model.reset_states()
    return {"status": "reset"}

# STT Endpoints
@app.post("/stt/transcribe", response_model=STTResponse)
async def transcribe_audio(request: STTRequest):
    """
    Transcribe audio to text using Silero STT

    Returns:
        STTResponse with transcribed text
    """
    try:
        # Convert base64 to numpy
        audio = audio_processor.base64_to_numpy(request.audio_data, request.sample_rate)

        # Transcribe
        result = stt_model.transcribe(audio, request.sample_rate)

        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"STT error: {str(e)}")

@app.post("/stt/transcribe-stream")
async def transcribe_stream(request: STTRequest):
    """
    Stream transcription results (for chunked audio)

    Returns:
        Server-Sent Events with partial transcriptions
    """
    try:
        # Convert base64 to numpy
        audio = audio_processor.base64_to_numpy(request.audio_data, request.sample_rate)

        # Split into chunks for streaming
        chunk_size = request.sample_rate * 1  # 1 second chunks
        chunks = audio_processor.split_into_chunks(audio, chunk_size)

        async def event_generator():
            for i, chunk in enumerate(chunks):
                result = stt_model.transcribe(chunk, request.sample_rate)
                result["chunk_index"] = i
                result["is_final"] = (i == len(chunks) - 1)

                # Yield as SSE
                yield f"data: {result}\n\n"

                # Small delay for streaming effect
                await asyncio.sleep(0.1)

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream"
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"STT stream error: {str(e)}")

# TTS Endpoints
@app.post("/tts/synthesize")
async def synthesize_speech(request: TTSRequest):
    """
    Synthesize speech from text using Silero TTS

    Returns:
        Audio file (WAV or PCM)
    """
    try:
        # Synthesize audio
        audio = tts_model.synthesize(request.text)

        # Convert to requested format
        if request.output_format == "wav":
            audio_bytes = audio_processor.numpy_to_wav_bytes(audio, request.sample_rate)
            media_type = "audio/wav"
        else:  # pcm
            audio_int16 = (audio * 32768.0).astype(np.int16)
            audio_bytes = audio_int16.tobytes()
            media_type = "audio/pcm"

        return Response(
            content=audio_bytes,
            media_type=media_type,
            headers={
                "Content-Disposition": f"attachment; filename=speech.{request.output_format}"
            }
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS error: {str(e)}")

@app.post("/tts/synthesize-stream")
async def synthesize_stream(request: TTSStreamRequest):
    """
    Stream synthesized speech in chunks

    Returns:
        Streaming audio chunks
    """
    try:
        async def audio_generator():
            # Split text into chunks
            words = request.text.split()
            current_chunk = ""

            for word in words:
                if len(current_chunk) + len(word) + 1 <= request.chunk_size:
                    current_chunk += word + " "
                else:
                    if current_chunk:
                        # Synthesize chunk
                        audio = tts_model.synthesize(current_chunk.strip())
                        audio_bytes = audio_processor.numpy_to_wav_bytes(audio, tts_model.sample_rate)
                        yield audio_bytes

                    current_chunk = word + " "

            # Last chunk
            if current_chunk:
                audio = tts_model.synthesize(current_chunk.strip())
                audio_bytes = audio_processor.numpy_to_wav_bytes(audio, tts_model.sample_rate)
                yield audio_bytes

        return StreamingResponse(
            audio_generator(),
            media_type="audio/wav"
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS stream error: {str(e)}")

# Combined endpoint: STT + TTS pipeline
@app.post("/voice/process")
async def process_voice(request: STTRequest):
    """
    Full voice processing pipeline: Audio → Text → Audio

    Returns:
        {
            "transcription": STTResponse,
            "audio_response": bytes (optional)
        }
    """
    try:
        # Convert base64 to numpy
        audio = audio_processor.base64_to_numpy(request.audio_data, request.sample_rate)

        # Transcribe
        transcription = stt_model.transcribe(audio, request.sample_rate)

        # For demo: echo back the transcription as speech
        response_text = f"You said: {transcription['text']}"
        response_audio = tts_model.synthesize(response_text)
        audio_bytes = audio_processor.numpy_to_wav_bytes(response_audio, tts_model.sample_rate)
        audio_base64 = audio_processor.numpy_to_base64(response_audio)

        return {
            "transcription": transcription,
            "response_text": response_text,
            "audio_response": audio_base64
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Voice processing error: {str(e)}")

# Utility endpoints
@app.get("/models/info")
async def get_models_info():
    """Get information about loaded models"""
    return {
        "vad": {
            "loaded": vad_model is not None,
            "threshold": vad_model.threshold if vad_model else None
        },
        "stt": {
            "loaded": stt_model is not None,
            "language": stt_model.language if stt_model else None
        },
        "tts": {
            "loaded": tts_model is not None,
            "language": tts_model.language if tts_model else None,
            "speaker": tts_model.speaker if tts_model else None,
            "sample_rate": tts_model.sample_rate if tts_model else None,
            "speakers": tts_model.list_speakers() if tts_model else []
        }
    }

# Run server
if __name__ == "__main__":
    uvicorn.run(
        "voice_engine:app",
        host="127.0.0.1",
        port=8002,
        log_level="info",
        reload=False
    )
