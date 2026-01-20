// apps/desktop/src/components/ChatWindow.tsx
import React, { useState, useRef, useEffect } from 'react';
import type { Message } from '../api/chat';
import { streamChat } from '../api/chat';
import { 
  checkVoiceHealth, 
  startRecording, 
  processAudioChunk, 
  stopRecording, 
  synthesizeSpeech, 
  playAudioFromBase64,
  AudioRecorder 
} from '../api/voice';

export const ChatWindow: React.FC = () => {
    const [messages, setMessages] = useState<Message[]>([
        { role: 'system', content: 'You are a helpful, concise, and direct assistant. Answer questions clearly and specifically. Be brief but informative. Focus on providing useful information rather than generic responses.' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [voiceMode, setVoiceMode] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingId, setRecordingId] = useState<string | null>(null);
    const [transcription, setTranscription] = useState('');
    const [voiceEngineStatus, setVoiceEngineStatus] = useState<'unknown' | 'healthy' | 'degraded' | 'error'>('unknown');
    
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const audioRecorderRef = useRef<AudioRecorder | null>(null);
    const sessionIdRef = useRef<string>(Date.now().toString());

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Initialize voice engine check
    useEffect(() => {
        const checkVoiceStatus = async () => {
            try {
                const health = await checkVoiceHealth();
                setVoiceEngineStatus(health.voice_engine_status as any);
            } catch (error) {
                setVoiceEngineStatus('error');
            }
        };
        
        checkVoiceStatus();
        const interval = setInterval(checkVoiceStatus, 30000); // Check every 30 seconds
        
        return () => clearInterval(interval);
    }, []);

    const handleSend = async () => {
        if ((!input.trim() && !transcription.trim()) || isLoading) return;

        const userMsg: Message = { 
            role: 'user', 
            content: transcription.trim() || input 
        };
        const newMessages = [...messages, userMsg];

        setMessages(newMessages);
        setInput('');
        setTranscription('');
        setIsLoading(true);

        try {
            // Append a placeholder for assistant response
            setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

            let fullContent = '';
            for await (const chunk of streamChat(newMessages)) {
                fullContent += chunk;
                setMessages(prev => {
                    const updated = [...prev];
                    const lastMsg = updated[updated.length - 1];
                    if (lastMsg.role === 'assistant') {
                        lastMsg.content = fullContent;
                    }
                    return updated;
                });
            }

            // If voice mode is enabled, synthesize the response
            if (voiceMode && fullContent.trim()) {
                try {
                    const synthesisResult = await synthesizeSpeech(
                        fullContent.trim(),
                        sessionIdRef.current,
                        true
                    );
                    
                    if (synthesisResult.success && synthesisResult.audio_data) {
                        playAudioFromBase64(synthesisResult.audio_data);
                    }
                } catch (synthesisError) {
                    console.error('Voice synthesis failed:', synthesisError);
                }
            }
        } catch (error) {
            console.error('Chat error:', error);
            setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, an error occurred.' }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!isRecording) {
                handleSend();
            }
        }
    };

    const toggleVoiceMode = () => {
        setVoiceMode(!voiceMode);
    };

    const toggleRecording = async () => {
        if (isRecording) {
            // Stop recording
            if (audioRecorderRef.current) {
                audioRecorderRef.current.stop();
                setIsRecording(false);
                
                if (recordingId) {
                    try {
                        const result = await stopRecording(recordingId);
                        if (result.transcription.trim()) {
                            setTranscription(result.transcription);
                            setInput(result.transcription);
                            // Auto-send if transcription is good
                            setTimeout(handleSend, 500);
                        }
                    } catch (error) {
                        console.error('Failed to stop recording:', error);
                    }
                }
            }
        } else {
            // Start recording
            if (voiceEngineStatus !== 'healthy') {
                alert('Voice engine is not available. Please check if the voice service is running.');
                return;
            }

            try {
                const recordingResponse = await startRecording(sessionIdRef.current);
                setRecordingId(recordingResponse.recording_id);
                
                const audioRecorder = new AudioRecorder(
                    async (chunk: ArrayBuffer) => {
                        if (recordingId) {
                            try {
                                const result = await processAudioChunk(
                                    recordingId,
                                    chunk,
                                    false
                                );
                                
                                if (result.success && result.transcription) {
                                    setTranscription(prev => prev + result.transcription);
                                }
                            } catch (error) {
                                console.error('Audio processing failed:', error);
                            }
                        }
                    },
                    () => {
                        // Recording stopped callback
                        setIsRecording(false);
                    }
                );
                
                await audioRecorder.start();
                audioRecorderRef.current = audioRecorder;
                setIsRecording(true);
                setTranscription('');
            } catch (error) {
                console.error('Failed to start recording:', error);
                alert('Failed to start voice recording. Please check microphone permissions.');
            }
        }
    };

    const getVoiceModeIndicator = () => {
        if (voiceMode) {
            return (
                <span className="px-2 py-1 rounded bg-blue-600 text-white text-xs font-medium">
                    Voice Mode ON
                </span>
            );
        }
        return (
            <span className="px-2 py-1 rounded bg-gray-700 text-gray-300 text-xs">
                Voice Mode OFF
            </span>
        );
    };

    const getRecordingIndicator = () => {
        if (isRecording) {
            return (
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                    <span className="text-red-400 text-sm font-medium">Recording...</span>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="flex flex-col h-screen bg-gray-900 text-gray-100 font-sans">
            {/* Header */}
            <header className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900/50 backdrop-blur-sm sticky top-0 z-10">
                <h1 className="text-xl font-semibold bg-gradient-to-r from-blue-400 to-teal-400 bg-clip-text text-transparent">
                    Offline Intelligence
                </h1>
                <div className="flex gap-3 items-center">
                    {getVoiceModeIndicator()}
                    {getRecordingIndicator()}
                    <span className="px-2 py-1 rounded bg-gray-800 border border-gray-700 text-xs">
                        Local LLM
                    </span>
                </div>
            </header>

            {/* Messages Area */}
            <main className="flex-1 overflow-y-auto p-4 space-y-6">
                {messages.filter(m => m.role !== 'system').map((msg, idx) => (
                    <div
                        key={idx}
                        className={`group flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                        <div
                            className={`max-w-[80%] rounded-2xl px-5 py-3 shadow-sm ${msg.role === 'user'
                                    ? 'bg-blue-600 text-white rounded-br-sm'
                                    : 'bg-gray-800 text-gray-100 rounded-bl-sm border border-gray-700'
                                }`}
                        >
                            <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                        </div>
                    </div>
                ))}

                {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
                    <div className="flex justify-start animate-pulse">
                        <div className="bg-gray-800 rounded-2xl px-5 py-4 border border-gray-700">
                            <div className="flex gap-1.5">
                                <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </main>

            {/* Voice Input Display */}
            {transcription && (
                <div className="px-4 py-2 bg-gray-800/50 border-t border-gray-700">
                    <div className="text-sm text-gray-400 mb-1">Voice Input:</div>
                    <div className="text-gray-200 bg-gray-700/50 rounded-lg p-3">
                        {transcription}
                    </div>
                </div>
            )}

            {/* Input Area */}
            <footer className="p-4 border-t border-gray-800 bg-gray-900">
                <div className="max-w-4xl mx-auto relative cursor-text">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={isRecording ? "Listening..." : "Ask anything..."}
                        className="w-full bg-gray-800 text-gray-100 border border-gray-700 rounded-xl px-4 py-4 pr-32 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 resize-none max-h-48 overflow-y-auto transition-all placeholder:text-gray-500"
                        rows={1}
                        style={{ minHeight: '56px' }}
                        disabled={isRecording}
                    />

                    {/* Voice Controls */}
                    <div className="absolute right-3 bottom-3 flex items-center gap-2">
                        {/* Voice Mode Toggle */}
                        <button
                            onClick={toggleVoiceMode}
                            className={`p-2 rounded-lg transition-colors ${
                                voiceMode 
                                    ? 'bg-blue-600 text-white hover:bg-blue-500' 
                                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            }`}
                            title={voiceMode ? "Disable voice responses" : "Enable voice responses"}
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                            </svg>
                        </button>

                        {/* Microphone Button */}
                        <button
                            onClick={toggleRecording}
                            disabled={voiceEngineStatus !== 'healthy' || isLoading}
                            className={`p-2 rounded-lg transition-colors ${
                                isRecording
                                    ? 'bg-red-600 text-white animate-pulse hover:bg-red-500'
                                    : voiceEngineStatus === 'healthy'
                                        ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                        : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                            }`}
                            title={
                                voiceEngineStatus !== 'healthy' 
                                    ? "Voice engine unavailable" 
                                    : isRecording 
                                        ? "Stop recording" 
                                        : "Start voice recording"
                            }
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                            </svg>
                        </button>

                        {/* Send Button */}
                        <button
                            onClick={handleSend}
                            disabled={isLoading || (!input.trim() && !transcription.trim()) || isRecording}
                            className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 transition-colors"
                        >
                            <svg className="w-5 h-5 transform rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div className="text-center mt-2 text-xs text-gray-600">
                    AI can make mistakes. Please verify important information.
                </div>
            </footer>
        </div>
    );
};