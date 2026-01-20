//! Voice API endpoints for the Aud.io backend

use axum::{
    extract::{State, Json},
    http::StatusCode,
    response::IntoResponse,
};
use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use tracing::{debug, error, info};

use crate::{
    voice::{
        engine_client::VoiceEngineClient,
        audio_stream::{AudioChunk, AudioFormat},
    },
    UnifiedAppState
};

// Request/Response types
#[derive(Debug, Deserialize)]
pub struct StartRecordingRequest {
    pub session_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct StartRecordingResponse {
    pub recording_id: String,
    pub status: String,
}

#[derive(Debug, Deserialize)]
pub struct ProcessAudioRequest {
    pub recording_id: String,
    pub audio_chunk: String, // base64 encoded
    pub is_final: bool,
}

#[derive(Debug, Serialize)]
pub struct ProcessAudioResponse {
    pub success: bool,
    pub transcription: Option<String>,
    pub confidence: Option<f32>,
    pub is_speech: Option<bool>,
    pub error: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct StopRecordingRequest {
    pub recording_id: String,
}

#[derive(Debug, Serialize)]
pub struct StopRecordingResponse {
    pub success: bool,
    pub transcription: String,
    pub confidence: f32,
    pub duration_ms: u64,
    pub error: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SynthesizeRequest {
    pub text: String,
    pub session_id: Option<String>,
    pub voice_mode: bool,
}

#[derive(Debug, Serialize)]
pub struct SynthesizeResponse {
    pub success: bool,
    pub audio_data: Option<String>, // base64 encoded
    pub format: Option<String>,
    pub duration_ms: Option<u32>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct VoiceHealthResponse {
    pub voice_engine_status: String,
    pub models_loaded: Option<VoiceModelsStatus>,
    pub active_recordings: usize,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct VoiceModelsStatus {
    pub vad: bool,
    pub stt: bool,
    pub tts: bool,
}

pub async fn voice_health(
    State(_state): State<UnifiedAppState>,
) -> impl IntoResponse {
    // Check voice engine health
    let voice_client = VoiceEngineClient::new("http://127.0.0.1:8002".to_string());
    
    match voice_client.health_check().await {
        Ok(status) => {
            let status_str = match status {
                crate::voice::engine_client::VoiceEngineStatus::Healthy => "healthy",
                crate::voice::engine_client::VoiceEngineStatus::Degraded => "degraded",
                crate::voice::engine_client::VoiceEngineStatus::Unreachable => "unreachable",
            };
            
            Json(VoiceHealthResponse {
                voice_engine_status: status_str.to_string(),
                models_loaded: None,
                active_recordings: 0,
                error: None,
            })
        }
        Err(e) => {
            error!("Voice health check failed: {}", e);
            Json(VoiceHealthResponse {
                voice_engine_status: "error".to_string(),
                models_loaded: None,
                active_recordings: 0,
                error: Some(e.to_string()),
            })
        }
    }
}

pub async fn start_recording(
    State(_state): State<UnifiedAppState>,
    Json(request): Json<StartRecordingRequest>,
) -> impl IntoResponse {
    let recording_id = request.session_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    
    info!("🎤 Starting voice recording session: {}", recording_id);
    
    Json(StartRecordingResponse {
        recording_id,
        status: "recording".to_string(),
    })
}

pub async fn process_audio_chunk(
    State(_state): State<UnifiedAppState>,
    Json(request): Json<ProcessAudioRequest>,
) -> impl IntoResponse {
    debug!("Processing audio chunk for recording: {}", request.recording_id);
    
    // Decode base64 audio data
    let audio_data = match base64::engine::general_purpose::STANDARD.decode(&request.audio_chunk) {
        Ok(data) => data,
        Err(e) => {
            error!("Failed to decode base64 audio: {}", e);
            return Json(ProcessAudioResponse {
                success: false,
                transcription: None,
                confidence: None,
                is_speech: None,
                error: Some(format!("Failed to decode audio: {}", e)),
            });
        }
    };

    // Create audio chunk
    let audio_chunk = AudioChunk::new(
        audio_data,
        16000, // Standard sample rate for STT
        1,     // Mono
        AudioFormat::Pcm16,
    );

    // Process with voice engine
    let voice_client = VoiceEngineClient::new("http://127.0.0.1:8002".to_string());
    
    match voice_client.process_voice_input(&audio_chunk).await {
        Ok(Some(result)) => {
            info!("✅ Voice processing successful: '{}' (confidence: {})", 
                  result.text, result.confidence);
            
            Json(ProcessAudioResponse {
                success: true,
                transcription: Some(result.text),
                confidence: Some(result.confidence),
                is_speech: Some(true),
                error: None,
            })
        }
        Ok(None) => {
            debug!("No speech detected in audio chunk");
            Json(ProcessAudioResponse {
                success: true,
                transcription: None,
                confidence: None,
                is_speech: Some(false),
                error: None,
            })
        }
        Err(e) => {
            error!("Voice processing failed: {}", e);
            Json(ProcessAudioResponse {
                success: false,
                transcription: None,
                confidence: None,
                is_speech: None,
                error: Some(e.to_string()),
            })
        }
    }
}

pub async fn stop_recording(
    State(_state): State<UnifiedAppState>,
    Json(request): Json<StopRecordingRequest>,
) -> impl IntoResponse {
    info!("⏹️ Stopping voice recording: {}", request.recording_id);
    
    Json(StopRecordingResponse {
        success: true,
        transcription: "Recording stopped".to_string(),
        confidence: 1.0,
        duration_ms: 0,
        error: None,
    })
}

pub async fn synthesize_speech(
    State(_state): State<UnifiedAppState>,
    Json(request): Json<SynthesizeRequest>,
) -> impl IntoResponse {
    if !request.voice_mode {
        // Voice mode is disabled, don't synthesize
        return Json(SynthesizeResponse {
            success: true,
            audio_data: None,
            format: None,
            duration_ms: None,
            error: Some("Voice mode disabled".to_string()),
        });
    }

    info!("🔊 Synthesizing speech for text: {}", 
          if request.text.len() > 50 { 
              format!("{}...", &request.text[..50]) 
          } else { 
              request.text.clone() 
          });

    let voice_client = VoiceEngineClient::new("http://127.0.0.1:8002".to_string());
    
    match voice_client.synthesize_speech(&request.text).await {
        Ok(audio_bytes) => {
            let base64_audio = base64::engine::general_purpose::STANDARD.encode(&audio_bytes);
            
            info!("✅ Speech synthesis successful: {} bytes", audio_bytes.len());
            
            Json(SynthesizeResponse {
                success: true,
                audio_data: Some(base64_audio),
                format: Some("wav".to_string()),
                duration_ms: Some((audio_bytes.len() as u32 / (48000 * 2)) * 1000), // Rough estimate
                error: None,
            })
        }
        Err(e) => {
            error!("Speech synthesis failed: {}", e);
            Json(SynthesizeResponse {
                success: false,
                audio_data: None,
                format: None,
                duration_ms: None,
                error: Some(e.to_string()),
            })
        }
    }
}

// Helper function to integrate voice processing with existing chat flow
pub async fn process_voice_message(text: &str, voice_mode: bool) -> anyhow::Result<Option<Vec<u8>>> {
    if voice_mode && !text.is_empty() {
        let voice_client = VoiceEngineClient::new("http://127.0.0.1:8002".to_string());
        match voice_client.synthesize_speech(text).await {
            Ok(audio_data) => {
                info!("✅ Generated {} bytes of audio for voice response", audio_data.len());
                Ok(Some(audio_data))
            }
            Err(e) => {
                error!("Failed to synthesize voice response: {}", e);
                Ok(None) // Don't fail the whole request, just skip audio
            }
        }
    } else {
        Ok(None)
    }
}