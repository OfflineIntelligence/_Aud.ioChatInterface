// apps/desktop/src/api/voice.ts
// Voice API client for communicating with Rust backend voice endpoints

const VOICE_API_BASE = 'http://127.0.0.1:8080';

interface VoiceHealthResponse {
  voice_engine_status: string;
  models_loaded?: {
    vad: boolean;
    stt: boolean;
    tts: boolean;
  };
  active_recordings: number;
  error?: string;
}

interface StartRecordingResponse {
  recording_id: string;
  status: string;
}

interface ProcessAudioResponse {
  success: boolean;
  transcription?: string;
  confidence?: number;
  is_speech?: boolean;
  error?: string;
}

interface SynthesizeResponse {
  success: boolean;
  audio_data?: string; // base64 encoded
  format?: string;
  duration_ms?: number;
  error?: string;
}

// Check if voice engine is healthy
export async function checkVoiceHealth(): Promise<VoiceHealthResponse> {
  try {
    const response = await fetch(`${VOICE_API_BASE}/voice/health`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Voice health check failed:', error);
    return {
      voice_engine_status: 'error',
      active_recordings: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Start a new voice recording session
export async function startRecording(sessionId?: string): Promise<StartRecordingResponse> {
  try {
    const response = await fetch(`${VOICE_API_BASE}/voice/start-recording`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id: sessionId
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Start recording failed:', error);
    throw error;
  }
}

// Process an audio chunk
export async function processAudioChunk(
  recordingId: string,
  audioChunk: ArrayBuffer,
  isFinal: boolean = false
): Promise<ProcessAudioResponse> {
  try {
    // Convert ArrayBuffer to base64
    const base64Chunk = arrayBufferToBase64(audioChunk);
    
    const response = await fetch(`${VOICE_API_BASE}/voice/process-audio`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recording_id: recordingId,
        audio_chunk: base64Chunk,
        is_final: isFinal
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Process audio chunk failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Stop recording and get final transcription
export async function stopRecording(recordingId: string): Promise<{ transcription: string; confidence: number }> {
  try {
    const response = await fetch(`${VOICE_API_BASE}/voice/stop-recording`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recording_id: recordingId
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    return {
      transcription: result.transcription,
      confidence: result.confidence
    };
  } catch (error) {
    console.error('Stop recording failed:', error);
    throw error;
  }
}

// Synthesize text to speech
export async function synthesizeSpeech(
  text: string,
  sessionId?: string,
  voiceMode: boolean = true
): Promise<SynthesizeResponse> {
  try {
    const response = await fetch(`${VOICE_API_BASE}/voice/synthesize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        session_id: sessionId,
        voice_mode: voiceMode
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Speech synthesis failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Play audio from base64 data
export function playAudioFromBase64(base64Data: string): void {
  try {
    const audioBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    const blob = new Blob([audioBytes], { type: 'audio/wav' });
    const audioUrl = URL.createObjectURL(blob);
    
    const audio = new Audio(audioUrl);
    audio.play().catch(error => {
      console.error('Audio playback failed:', error);
    });
    
    // Clean up URL when audio finishes
    audio.addEventListener('ended', () => {
      URL.revokeObjectURL(audioUrl);
    });
  } catch (error) {
    console.error('Failed to play audio:', error);
  }
}

// Utility function to convert ArrayBuffer to base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Audio recording utilities
export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private onAudioChunk?: (chunk: ArrayBuffer) => void;
  private onRecordingStop?: () => void;

  constructor(
    onAudioChunk?: (chunk: ArrayBuffer) => void,
    onRecordingStop?: () => void
  ) {
    this.onAudioChunk = onAudioChunk;
    this.onRecordingStop = onRecordingStop;
  }

  async start(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        } 
      });

      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
          
          // Convert to WAV format and send chunk
          this.convertAndSendChunk(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this.onRecordingStop?.();
      };

      this.audioChunks = [];
      this.mediaRecorder.start(1000); // Collect data every 1 second
    } catch (error) {
      console.error('Failed to start recording:', error);
      throw error;
    }
  }

  stop(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
      this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
  }

  private async convertAndSendChunk(blob: Blob): Promise<void> {
    try {
      // Convert WebM to WAV format (simplified - in practice you'd use a proper audio library)
      const arrayBuffer = await blob.arrayBuffer();
      this.onAudioChunk?.(arrayBuffer);
    } catch (error) {
      console.error('Failed to process audio chunk:', error);
    }
  }

  isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording';
  }
}