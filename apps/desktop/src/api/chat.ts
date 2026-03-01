// Chat API: stream SSE responses from local backend (127.0.0.1:9999)

export interface Message {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface ChatRequest {
    model: string;
    messages: Message[];
    max_tokens?: number;
    temperature?: number;
    stream?: boolean;
    attachments?: ChatAttachment[];
}

// File attachment for chat — references only, no content bytes sent over the wire.
// Backend reads files server-side and extracts text within a 64k-token budget.
export interface ChatAttachment {
    name: string;
    source: 'inline' | 'local_storage';
    // inline (paperclip): real OS path returned by Tauri file dialog
    file_path?: string;
    // local_storage (@filename / folder icon): database ID in all_files table
    all_files_id?: number;
    size_bytes?: number;
    // Legacy fields kept for backward compatibility — deprecated
    content_text?: string;
    content_base64?: string;
    mime_type?: string;
}

// Chat persistence: API response types for conversation management
export interface ConversationSummary {
    id: string;
    title: string;
    created_at: string;
    last_accessed: string;
    message_count: number;
    pinned: boolean;
}

export interface ConversationsResponse {
    conversations: ConversationSummary[];
}

export interface ConversationDetailResponse {
    id: string;
    title: string;
    messages: Message[];
}

import { getApiBaseSync } from './backendUrl';

// Check if backend is ready with retry logic
async function checkBackendReadiness(maxRetries = 3, delayMs = 500): Promise<boolean> {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(`${getApiBaseSync()}/healthz`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
            });
            if (response.ok) {
                // Try to parse JSON response (new format)
                try {
                    const data = await response.json();
                    // Accept "ready" or "degraded" as backend ready
                    return data.status === 'ready' || data.status === 'degraded';
                } catch {
                    // Fallback: try text format for backward compatibility
                    const text = await response.text();
                    return text === 'OK';
                }
            }
        } catch (error) {
            console.warn(`Backend readiness check attempt ${i + 1}/${maxRetries} failed:`, error);
        }

        if (i < maxRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, delayMs * Math.pow(2, i)));
        }
    }
    return false;
}

// Stream assistant tokens via Server-Sent Events (delta chunks)
export async function* streamChat(messages: Message[], sessionId?: string, _onlineMode?: boolean, modelId?: string, attachments?: ChatAttachment[], apiKey?: string): AsyncGenerator<string, void, unknown> {
    // Enforce session ID requirement for persistence - prevents orphaned conversations
    if (!sessionId) {
        throw new Error('Session ID is required for chat. This is a bug - ChatWindow should have generated one.');
    }
    
    // Check backend readiness before making request
    if (!(await checkBackendReadiness())) {
        throw new Error('Backend is not ready. Please ensure the offline-intelligence service is running.');
    }

    // Build request body
    const requestBody: any = {
        model: modelId || 'local-llm',
        model_source: _onlineMode ? 'openrouter' : 'local',
        messages: messages,
        session_id: sessionId,
        max_tokens: 2000,
        stream: true,
        temperature: 0.7,
        attachments: attachments && attachments.length > 0 ? attachments : undefined,
    };

    // Include API key for online mode
    if (_onlineMode && apiKey) {
        requestBody.api_key = apiKey;
    }

    const response = await fetch(`${getApiBaseSync()}/generate/stream`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
        // 422: attachment extraction failed — surface the backend's user-readable error directly
        if (response.status === 422) {
            const body = await response.text();
            throw new Error(body);
        }

        // Provide helpful error messages based on status code
        let errorMessage = `HTTP error! status: ${response.status}`;

        if (response.status === 502 || response.status === 503) {
            errorMessage = 'Model Not Ready: No model is currently loaded. Please go to the Models page and activate a model by clicking "Active Model".';
        } else if (response.status === 504) {
            errorMessage = 'Gateway Timeout: The model took too long to respond. It may be too large for your hardware.';
        } else if (response.status === 404) {
            errorMessage = 'Not Found: Model or engine binary not found. Please check your installation.';
        }

        throw new Error(errorMessage);
    }

    if (!response.body) {
        throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');

        // Keep the last incomplete line in the buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === '[DONE]') continue;

            if (trimmed.startsWith('data: ')) {
                try {
                    const jsonStr = trimmed.slice(6);
                    if (jsonStr === '[DONE]') continue;

                    const data = JSON.parse(jsonStr);
                    const content = data.choices?.[0]?.delta?.content;
                    if (content) {
                        yield content;
                    }
                } catch (e) {
                    console.error('Error parsing SSE line:', e);
                }
            }
        }
    }
}

// Stream chat via OpenRouter API through backend (OpenAI-compatible SSE format)
export async function* streamChatOpenRouter(
    messages: Message[],
    modelId: string,
    apiKey: string,
    sessionId?: string,
): AsyncGenerator<string, void, unknown> {
    // Send the request to our backend's online endpoint instead of directly to OpenRouter
    // This avoids CORS issues and allows backend to manage API keys
    // Debug: Log API key presence (not the actual key for security)
    console.log('[Chat API] Sending request to /online/stream:', {
        hasApiKey: !!apiKey,
        apiKeyLength: apiKey?.length || 0,
        modelId,
        sessionId,
    });

    const response = await fetch(`${getApiBaseSync()}/online/stream`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: modelId,
            messages: messages,
            session_id: sessionId || `openrouter-${Date.now()}`,
            max_tokens: 2000,
            stream: true,
            temperature: 0.7,
            api_key: apiKey,  // Pass the API key to the backend
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`OpenRouter API error (${response.status}): ${errorBody}`);
    }

    if (!response.body) {
        throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === '[DONE]') continue;

            if (trimmed.startsWith('data: ')) {
                try {
                    const jsonStr = trimmed.slice(6);
                    if (jsonStr === '[DONE]') continue;
                    const data = JSON.parse(jsonStr);
                    const content = data.choices?.[0]?.delta?.content;
                    if (content) {
                        yield content;
                    }
                } catch {
                    // Skip parse errors on SSE lines
                }
            }
        }
    }
}

// Chat persistence: Fetch all saved conversations for sidebar display
export async function fetchConversations(): Promise<ConversationSummary[]> {
    if (!(await checkBackendReadiness())) {
        throw new Error('Backend is not ready. Please ensure the offline-intelligence service is running.');
    }
    const response = await fetch(`${getApiBaseSync()}/conversations`);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data: ConversationsResponse = await response.json();
    return data.conversations;
}

// Test-friendly alias
export const getConversations = fetchConversations;

// Chat persistence: Load full conversation history from database when user clicks a chat
export async function fetchConversation(id: string): Promise<ConversationDetailResponse | null> {
    try {
        if (!(await checkBackendReadiness())) {
            throw new Error('Backend is not ready. Please ensure the offline-intelligence service is running.');
        }
        const response = await fetch(`${getApiBaseSync()}/conversations/${id}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Failed to fetch conversation:', error);
        return null;
    }
}

// Chat persistence: Save auto-generated title to database after first message
export async function updateConversationTitle(id: string, title: string): Promise<{ id: string; title: string }> {
    try {
        if (!(await checkBackendReadiness())) {
            throw new Error('Backend is not ready. Please ensure the offline-intelligence service is running.');
        }
        const response = await fetch(`${getApiBaseSync()}/conversations/${id}/title`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ title }),
        });
        if (!response.ok) {
            // Surface backend response body to help debug failed title updates
            const errorData = await response.text();
            console.error(`Failed to update conversation title [${id}]: HTTP ${response.status} - ${errorData}`);
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        console.log(`Title saved successfully for conversation [${id}]: "${title}"`);
        return { id, title };
    } catch (error) {
        console.error(`Failed to update conversation title [${id}]:`, error);
        throw error;
    }
}

// Create new conversation
export async function createNewConversation(): Promise<{ id: string; title: string }> {
    try {
        if (!(await checkBackendReadiness())) {
            throw new Error('Backend is not ready. Please ensure the offline-intelligence service is running.');
        }
        const response = await fetch(`${getApiBaseSync()}/conversations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({}),
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Failed to create conversation:', error);
        throw error;
    }
}

// Delete conversation
export async function deleteConversation(id: string): Promise<boolean> {
    try {
        if (!(await checkBackendReadiness())) {
            throw new Error('Backend is not ready. Please ensure the offline-intelligence service is running.');
        }
        const response = await fetch(`${getApiBaseSync()}/conversations/${id}`, {
            method: 'DELETE',
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return true;
    } catch (error) {
        console.error(`Failed to delete conversation [${id}]:`, error);
        throw error;
    }
}

// Chat persistence: Update pinned status of a conversation in the database
export async function updateConversationPinned(id: string, pinned: boolean): Promise<boolean> {
    try {
        if (!(await checkBackendReadiness())) {
            throw new Error('Backend is not ready. Please ensure the offline-intelligence service is running.');
        }
        const response = await fetch(`${getApiBaseSync()}/conversations/${id}/pinned`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ pinned }),
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return true;
    } catch (error) {
        console.error('Failed to update conversation pinned status:', error);
        return false;
    }
}
