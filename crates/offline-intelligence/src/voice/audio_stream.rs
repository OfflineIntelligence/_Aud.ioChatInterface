//! Audio streaming utilities for voice processing

use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

/// Audio format specification
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum AudioFormat {
    Pcm16,
    PcmFloat32,
    Wav,
}

/// Audio chunk containing raw audio data
#[derive(Debug, Clone)]
pub struct AudioChunk {
    pub data: Vec<u8>,
    pub sample_rate: u32,
    pub channels: u16,
    pub format: AudioFormat,
    pub timestamp: std::time::Instant,
}

impl AudioChunk {
    pub fn new(data: Vec<u8>, sample_rate: u32, channels: u16, format: AudioFormat) -> Self {
        Self {
            data,
            sample_rate,
            channels,
            format,
            timestamp: std::time::Instant::now(),
        }
    }

    pub fn duration_ms(&self) -> u64 {
        match self.format {
            AudioFormat::Pcm16 => {
                let bytes_per_sample = 2 * self.channels as usize;
                let samples = self.data.len() / bytes_per_sample;
                (samples as u64 * 1000) / self.sample_rate as u64
            }
            AudioFormat::PcmFloat32 => {
                let bytes_per_sample = 4 * self.channels as usize;
                let samples = self.data.len() / bytes_per_sample;
                (samples as u64 * 1000) / self.sample_rate as u64
            }
            AudioFormat::Wav => {
                // For WAV, we'd need to parse the header to get actual audio duration
                // This is a simplified estimation
                let audio_data_size = self.data.len().saturating_sub(44); // WAV header is typically 44 bytes
                let bytes_per_sample = 2 * self.channels as usize; // Assuming 16-bit PCM in WAV
                let samples = audio_data_size / bytes_per_sample;
                (samples as u64 * 1000) / self.sample_rate as u64
            }
        }
    }

    pub fn is_empty(&self) -> bool {
        self.data.is_empty()
    }
}

/// Audio stream buffer for accumulating chunks
pub struct AudioStreamBuffer {
    chunks: VecDeque<AudioChunk>,
    max_duration_ms: u64,
    total_duration_ms: u64,
}

impl AudioStreamBuffer {
    pub fn new(max_duration_ms: u64) -> Self {
        Self {
            chunks: VecDeque::new(),
            max_duration_ms,
            total_duration_ms: 0,
        }
    }

    pub fn add_chunk(&mut self, chunk: AudioChunk) {
        let chunk_duration = chunk.duration_ms();
        
        // Remove oldest chunks if we exceed max duration
        while !self.chunks.is_empty() && (self.total_duration_ms + chunk_duration) > self.max_duration_ms {
            if let Some(old_chunk) = self.chunks.pop_front() {
                self.total_duration_ms = self.total_duration_ms.saturating_sub(old_chunk.duration_ms());
            }
        }

        self.chunks.push_back(chunk);
        self.total_duration_ms += chunk_duration;
    }

    pub fn get_combined_data(&self) -> Vec<u8> {
        let total_size: usize = self.chunks.iter().map(|chunk| chunk.data.len()).sum();
        let mut combined = Vec::with_capacity(total_size);

        for chunk in &self.chunks {
            combined.extend_from_slice(&chunk.data);
        }

        combined
    }

    pub fn clear(&mut self) {
        self.chunks.clear();
        self.total_duration_ms = 0;
    }

    pub fn len(&self) -> usize {
        self.chunks.len()
    }

    pub fn is_empty(&self) -> bool {
        self.chunks.is_empty()
    }

    pub fn total_duration(&self) -> u64 {
        self.total_duration_ms
    }
}

/// Audio stream handler for real-time processing
pub struct AudioStreamHandler {
    buffer: AudioStreamBuffer,
    chunk_callback: Option<Box<dyn Fn(AudioChunk) -> anyhow::Result<()> + Send + Sync>>,
    stream_callback: Option<Box<dyn Fn(Vec<u8>) -> anyhow::Result<()> + Send + Sync>>,
}

impl AudioStreamHandler {
    pub fn new(buffer_duration_ms: u64) -> Self {
        Self {
            buffer: AudioStreamBuffer::new(buffer_duration_ms),
            chunk_callback: None,
            stream_callback: None,
        }
    }

    pub fn with_chunk_callback<F>(mut self, callback: F) -> Self
    where
        F: Fn(AudioChunk) -> anyhow::Result<()> + Send + Sync + 'static,
    {
        self.chunk_callback = Some(Box::new(callback));
        self
    }

    pub fn with_stream_callback<F>(mut self, callback: F) -> Self
    where
        F: Fn(Vec<u8>) -> anyhow::Result<()> + Send + Sync + 'static,
    {
        self.stream_callback = Some(Box::new(callback));
        self
    }

    pub fn process_chunk(&mut self, chunk: AudioChunk) -> anyhow::Result<()> {
        // Call chunk callback if registered
        if let Some(ref callback) = self.chunk_callback {
            callback(chunk.clone())?;
        }

        // Add to buffer
        self.buffer.add_chunk(chunk);

        // Call stream callback if registered
        if let Some(ref callback) = self.stream_callback {
            let combined_data = self.buffer.get_combined_data();
            callback(combined_data)?;
        }

        Ok(())
    }

    pub fn get_current_buffer(&self) -> Vec<u8> {
        self.buffer.get_combined_data()
    }

    pub fn clear_buffer(&mut self) {
        self.buffer.clear();
    }

    pub fn buffer_duration(&self) -> u64 {
        self.buffer.total_duration()
    }

    pub fn buffer_len(&self) -> usize {
        self.buffer.len()
    }
}

/// Utility functions for audio processing
pub mod audio_utils {
    use super::*;

    /// Convert f32 samples to i16 PCM
    pub fn f32_to_i16(samples: &[f32]) -> Vec<i16> {
        samples
            .iter()
            .map(|&sample| (sample * i16::MAX as f32) as i16)
            .collect()
    }

    /// Convert i16 samples to f32 PCM
    pub fn i16_to_f32(samples: &[i16]) -> Vec<f32> {
        samples
            .iter()
            .map(|&sample| sample as f32 / i16::MAX as f32)
            .collect()
    }

    /// Resample audio from one sample rate to another
    pub fn resample(
        input_samples: &[f32],
        input_rate: u32,
        output_rate: u32,
    ) -> Vec<f32> {
        if input_rate == output_rate {
            return input_samples.to_vec();
        }

        let ratio = output_rate as f32 / input_rate as f32;
        let output_length = (input_samples.len() as f32 * ratio) as usize;
        let mut output = Vec::with_capacity(output_length);

        for i in 0..output_length {
            let input_index = (i as f32 / ratio) as usize;
            let sample = if input_index < input_samples.len() {
                input_samples[input_index]
            } else {
                0.0
            };
            output.push(sample);
        }

        output
    }

    /// Apply simple gain to audio samples
    pub fn apply_gain(samples: &mut [f32], gain: f32) {
        for sample in samples.iter_mut() {
            *sample *= gain;
            // Clamp to [-1.0, 1.0]
            *sample = sample.clamp(-1.0, 1.0);
        }
    }
}