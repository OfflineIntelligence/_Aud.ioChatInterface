// Chat window: message bubbles, streaming responses, and top action bar
// Receives messages/title from parent, notifies parent of updates
import React, { useState, useRef, useEffect } from 'react';
import type { Message } from '../api/chat';
import { streamChat } from '../api/chat';
import { useChatTitle } from '../hooks/useChatTitle';

export interface Chat {
    id: string;
    title: string;
    messages: Message[];
    createdAt: Date;
}

interface ChatWindowProps {
    messages: Message[];
    chatTitle: string | null;
    onMessagesUpdate: (messages: Message[]) => void;
    onTitleGenerated?: (title: string) => void;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({ 
    messages, 
    chatTitle,
    onMessagesUpdate,
    onTitleGenerated 
}) => {
    // Track if first prompt has been sent (for title generation)
    const firstPromptSent = useRef(false);

    // Compact input bar state
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Title generation hook
    const { generateTitle } = useChatTitle();

    // Reset title generation flag when new chat started
    useEffect(() => {
        if (!chatTitle) {
            firstPromptSent.current = false;
        }
    }, [chatTitle]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMsg: Message = { role: 'user', content: input };
        const firstPrompt = !firstPromptSent.current ? input.trim() : null;
        const newMessages = [...messages, userMsg];

        onMessagesUpdate(newMessages);
        setInput('');
        setIsLoading(true);

        // Generate title asynchronously in background (non-blocking)
        if (firstPrompt && !chatTitle) {
            firstPromptSent.current = true;
            generateTitle(firstPrompt).then(title => {
                if (title) {
                    onTitleGenerated?.(title);
                }
            }).catch(err => console.error('Title generation failed:', err));
        }

        try {
            // Placeholder assistant message to stream into
            onMessagesUpdate([...newMessages, { role: 'assistant' as const, content: '' }]);

            let fullContent = '';
            for await (const chunk of streamChat(newMessages)) {
                fullContent += chunk;
                const updated = [...newMessages, { role: 'assistant' as const, content: fullContent }];
                onMessagesUpdate(updated);
            }
        } catch (error) {
            console.error('Chat error:', error);
            onMessagesUpdate([...newMessages, { role: 'assistant' as const, content: 'Sorry, an error occurred.' }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        handleSend();
    };

    return (
        <div className="chat-window">
            {/* Header */}
            <header className="chat-header">
                <div className="chat-header-bar">
                    <div className="chat-title">{chatTitle || 'Local LLM'}</div>
                    <div className="header-actions">
                        <button type="button" className="header-button">
                            <svg className="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9l9-6m0 0h-5m5 0v5M5 7v11a2 2 0 002 2h10a2 2 0 002-2v-6" />
                            </svg>
                            <span>Share</span>
                        </button>
                        <button type="button" className="header-icon-button" aria-label="More options">
                            <svg className="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 8a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 8a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
                            </svg>
                        </button>
                    </div>
                </div>
            </header>

            {/* Messages Area */}
            <main className="chat-messages">
                <div className="chat-messages-container">
                    {messages.filter(m => m.role !== 'system').map((msg, idx) => (
                        <div key={idx} className={`message-wrapper ${msg.role}`}>
                            <div className={`message-bubble ${msg.role}`}>
                                <p className="message-text">{msg.content}</p>
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="message-wrapper assistant">
                            <div className="loading-bubble">
                                <div className="loading-dot" />
                                <div className="loading-dot" />
                                <div className="loading-dot" />
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
            </main>

            {/* Input Footer */}
            <footer className="chat-footer">
                <form onSubmit={handleSubmit} className="chat-input-container">
                    <div className="chat-input-wrapper">
                        <button type="button" className="input-button">
                            <svg className="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                        </button>
                        <input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Ask anything"
                            className="chat-input"
                        />
                        <button type="button" className="input-button">
                            <svg className="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                            </svg>
                        </button>
                        <button 
                            type="submit" 
                            disabled={isLoading || !input.trim()}
                            className="input-button send"
                        >
                            <svg className="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                            </svg>
                        </button>
                    </div>
                    <p className="chat-footer-text">AI can make mistakes. Please verify important information.</p>
                </form>
            </footer>
        </div>
    );
}
