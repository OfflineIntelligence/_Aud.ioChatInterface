//! Voice processing module for Aud.io
//! Handles integration between frontend, voice engine, and LLM backend

pub mod engine_client;
pub mod audio_stream;

pub use engine_client::{VoiceEngineClient, VoiceEngineStatus};
pub use audio_stream::{AudioChunk, AudioFormat, AudioStreamHandler};

/// Voice processing configuration
#[derive(Debug, Clone)]
pub struct VoiceConfig {
    pub voice_engine_url: String,
    pub enable_voice_input: bool,
    pub enable_voice_output: bool,
    pub sample_rate: u32,
    pub chunk_duration_ms: u32,
}

impl Default for VoiceConfig {
    fn default() -> Self {
        Self {
            voice_engine_url: "http://127.0.0.1:8002".to_string(),
            enable_voice_input: true,
            enable_voice_output: true,
            sample_rate: 16000,
            chunk_duration_ms: 1000,
        }
    }
}

/// Voice session state
#[derive(Debug, Clone)]
pub struct VoiceSession {
    pub session_id: String,
    pub is_recording: bool,
    pub recording_start_time: Option<std::time::Instant>,
    pub accumulated_audio: Vec<AudioChunk>,
    pub current_transcription: String,
}

impl VoiceSession {
    pub fn new(session_id: String) -> Self {
        Self {
            session_id,
            is_recording: false,
            recording_start_time: None,
            accumulated_audio: Vec::new(),
            current_transcription: String::new(),
        }
    }
    
    pub fn start_recording(&mut self) {
        self.is_recording = true;
        self.recording_start_time = Some(std::time::Instant::now());
        self.accumulated_audio.clear();
        self.current_transcription.clear();
    }
    
    pub fn stop_recording(&mut self) -> bool {
        let was_recording = self.is_recording;
        self.is_recording = false;
        self.recording_start_time = None;
        was_recording
    }
    
    pub fn add_audio_chunk(&mut self, chunk: AudioChunk) {
        if self.is_recording {
            self.accumulated_audio.push(chunk);
        }
    }
    
    pub fn update_transcription(&mut self, text: String) {
        self.current_transcription = text;
    }
    
    pub fn get_recording_duration(&self) -> Option<std::time::Duration> {
        self.recording_start_time.map(|start| start.elapsed())
    }
}

/// Voice processing result
#[derive(Debug)]
pub struct VoiceProcessingResult {
    pub text: String,
    pub confidence: f32,
    pub processing_time_ms: u64,
    pub audio_duration_ms: Option<u64>,
}