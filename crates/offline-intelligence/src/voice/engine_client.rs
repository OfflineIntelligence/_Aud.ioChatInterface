//! HTTP client for communicating with Python Voice Engine service

use anyhow::Result;
use base64::{engine::general_purpose, Engine as _};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tracing::{debug, error, info};

use super::{AudioChunk, VoiceProcessingResult};

/// Voice Engine Status Response
#[derive(Debug, Deserialize)]
pub struct VoiceEngineHealth {
    pub status: String,
    pub models_loaded: VoiceModelsStatus,
}

#[derive(Debug, Deserialize)]
pub struct VoiceModelsStatus {
    pub vad: bool,
    pub stt: bool,
    pub tts: bool,
}

/// VAD Detection Request
#[derive(Debug, Serialize)]
pub struct VadRequest {
    pub audio_data: String, // base64 encoded
    pub sample_rate: u32,
}

/// VAD Detection Response
#[derive(Debug, Deserialize)]
pub struct VadResponse {
    pub is_speech: bool,
    pub confidence: f32,
    pub sample_rate: u32,
}

/// STT Transcription Request
#[derive(Debug, Serialize)]
pub struct SttRequest {
    pub audio_data: String, // base64 encoded
    pub sample_rate: u32,
    pub language: String,
}

/// STT Transcription Response
#[derive(Debug, Deserialize)]
pub struct SttResponse {
    pub text: String,
    pub confidence: f32,
    pub duration_ms: u32,
}

/// TTS Synthesis Request
#[derive(Debug, Serialize)]
pub struct TtsRequest {
    pub text: String,
    pub language: String,
    pub speaker: String,
    pub sample_rate: u32,
    pub output_format: String,
}

/// TTS Synthesis Response
#[derive(Debug, Deserialize)]
pub struct TtsResponse {
    pub audio_data: String, // base64 encoded audio
    pub format: String,
    pub sample_rate: u32,
    pub duration_ms: u32,
}

pub struct VoiceEngineClient {
    client: Client,
    base_url: String,
}

#[derive(Debug, Clone, PartialEq)]
pub enum VoiceEngineStatus {
    Healthy,
    Degraded,
    Unreachable,
}

impl VoiceEngineClient {
    pub fn new(base_url: String) -> Self {
        Self {
            client: Client::new(),
            base_url,
        }
    }

    /// Check if voice engine is healthy and all models are loaded
    pub async fn health_check(&self) -> Result<VoiceEngineStatus> {
        let url = format!("{}/health", self.base_url);
        
        match self.client.get(&url).send().await {
            Ok(response) => {
                if response.status().is_success() {
                    match response.json::<VoiceEngineHealth>().await {
                        Ok(health) => {
                            if health.models_loaded.vad 
                                && health.models_loaded.stt 
                                && health.models_loaded.tts {
                                info!("✅ Voice engine is healthy - all models loaded");
                                Ok(VoiceEngineStatus::Healthy)
                            } else {
                                error!("⚠️ Voice engine degraded - some models not loaded: {:?}", health.models_loaded);
                                Ok(VoiceEngineStatus::Degraded)
                            }
                        }
                        Err(e) => {
                            error!("❌ Failed to parse voice engine health response: {}", e);
                            Ok(VoiceEngineStatus::Degraded)
                        }
                    }
                } else {
                    error!("❌ Voice engine returned non-success status: {}", response.status());
                    Ok(VoiceEngineStatus::Unreachable)
                }
            }
            Err(e) => {
                error!("❌ Cannot reach voice engine at {}: {}", url, e);
                Ok(VoiceEngineStatus::Unreachable)
            }
        }
    }

    /// Detect speech in audio chunk using VAD
    pub async fn detect_speech(&self, audio_chunk: &AudioChunk) -> Result<VadResponse> {
        let url = format!("{}/vad/detect", self.base_url);
        
        let base64_audio = general_purpose::STANDARD.encode(&audio_chunk.data);
        
        let request = VadRequest {
            audio_data: base64_audio,
            sample_rate: audio_chunk.sample_rate,
        };

        debug!("Sending VAD request for {} bytes of audio", audio_chunk.data.len());
        
        let response = self.client
            .post(&url)
            .json(&request)
            .send()
            .await?;

        if response.status().is_success() {
            let vad_response = response.json::<VadResponse>().await?;
            debug!("VAD result: speech={}, confidence={}", vad_response.is_speech, vad_response.confidence);
            Ok(vad_response)
        } else {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            Err(anyhow::anyhow!("VAD request failed with status {}: {}", status, body))
        }
    }

    /// Transcribe audio to text using STT
    pub async fn transcribe_audio(&self, audio_chunk: &AudioChunk) -> Result<VoiceProcessingResult> {
        let start_time = std::time::Instant::now();
        
        let url = format!("{}/stt/transcribe", self.base_url);
        
        let base64_audio = general_purpose::STANDARD.encode(&audio_chunk.data);
        
        let request = SttRequest {
            audio_data: base64_audio,
            sample_rate: audio_chunk.sample_rate,
            language: "en".to_string(),
        };

        debug!("Sending STT request for {} bytes of audio", audio_chunk.data.len());
        
        let response = self.client
            .post(&url)
            .json(&request)
            .send()
            .await?;

        let processing_time = start_time.elapsed().as_millis() as u64;

        if response.status().is_success() {
            let stt_response = response.json::<SttResponse>().await?;
            
            let result = VoiceProcessingResult {
                text: stt_response.text,
                confidence: stt_response.confidence,
                processing_time_ms: processing_time,
                audio_duration_ms: Some(stt_response.duration_ms as u64),
            };
            
            info!("✅ STT successful: '{}' (confidence: {}, {}ms processing)", 
                  result.text, result.confidence, processing_time);
            
            Ok(result)
        } else {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            Err(anyhow::anyhow!("STT request failed with status {}: {}", status, body))
        }
    }

    /// Synthesize text to speech using TTS
    pub async fn synthesize_speech(&self, text: &str) -> Result<Vec<u8>> {
        let url = format!("{}/tts/synthesize", self.base_url);
        
        let request = TtsRequest {
            text: text.to_string(),
            language: "en".to_string(),
            speaker: "en_0".to_string(),
            sample_rate: 48000,
            output_format: "wav".to_string(),
        };

        debug!("Sending TTS request for {} characters", text.len());
        
        let response = self.client
            .post(&url)
            .json(&request)
            .send()
            .await?;

        if response.status().is_success() {
            let bytes = response.bytes().await?;
            info!("✅ TTS successful: {} bytes of audio generated", bytes.len());
            Ok(bytes.to_vec())
        } else {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            Err(anyhow::anyhow!("TTS request failed with status {}: {}", status, body))
        }
    }

    /// Process complete voice workflow: VAD + STT
    pub async fn process_voice_input(&self, audio_chunk: &AudioChunk) -> Result<Option<VoiceProcessingResult>> {
        // First check if there's speech
        match self.detect_speech(audio_chunk).await {
            Ok(vad_result) => {
                if vad_result.is_speech && vad_result.confidence > 0.5 {
                    debug!("Speech detected (confidence: {}), proceeding with transcription", vad_result.confidence);
                    // If speech detected, transcribe it
                    match self.transcribe_audio(audio_chunk).await {
                        Ok(transcription) => Ok(Some(transcription)),
                        Err(e) => {
                            error!("STT failed after VAD detection: {}", e);
                            Ok(None)
                        }
                    }
                } else {
                    debug!("No speech detected (confidence: {})", vad_result.confidence);
                    Ok(None)
                }
            }
            Err(e) => {
                error!("VAD failed: {}", e);
                // Fall back to direct STT if VAD fails
                match self.transcribe_audio(audio_chunk).await {
                    Ok(transcription) => Ok(Some(transcription)),
                    Err(stt_error) => {
                        error!("STT also failed after VAD error: {}", stt_error);
                        Err(anyhow::anyhow!("Both VAD and STT failed: VAD: {}, STT: {}", e, stt_error))
                    }
                }
            }
        }
    }
}