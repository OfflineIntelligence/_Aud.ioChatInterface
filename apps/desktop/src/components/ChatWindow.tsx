// Chat window: message bubbles, streaming responses, and top action bar
// Receives messages/title from parent, notifies parent of updates
import React, { useState, useRef, useEffect } from 'react';
import type { Message } from '../api/chat';
// Chat persistence: Import title update function to save generated titles to database
import { streamChat, updateConversationTitle } from '../api/chat';
import { useChatTitle } from '../hooks/useChatTitle';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';

export interface Chat {
    id: string;
    title: string;
    messages: Message[];
    createdAt: Date;
    pinned?: boolean;
}

interface ChatWindowProps {
    messages: Message[];
    chatTitle: string | null;
    chatId: string | null;
    sessionId: string | null;
    onSessionIdChange: (sessionId: string) => void;
    isPinned?: boolean;
    onMessagesUpdate: (messages: Message[]) => void;
    onTitleGenerated?: (title: string) => void;
    onPinChat?: (chatId: string) => void;
    onDeleteChat?: (chatId: string) => void;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({ 
    messages, 
    chatTitle,
    chatId,
    sessionId,
    onSessionIdChange,
    isPinned = false,
    onMessagesUpdate,
    onTitleGenerated,
    onPinChat,
    onDeleteChat
}) => {
    // Track if first prompt has been sent (for title generation)
    const firstPromptSent = useRef(false);

    // Compact input bar state
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    
    // Dropdown menu state
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    
    // Delete confirmation modal state
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // Title generation hook
    const { generateTitle } = useChatTitle();

    // Reset title generation flag when new chat started
    useEffect(() => {
        if (!chatTitle) {
            firstPromptSent.current = false;
        }
    }, [chatTitle]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };

        if (isDropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [isDropdownOpen]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        // Generate unique session ID on first message (timestamp-based) for backend persistence
        let currentSessionId = sessionId;
        if (!currentSessionId) {
            currentSessionId = Date.now().toString();
            onSessionIdChange(currentSessionId);
        }

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
                    // Persist generated title to database for cross-session recovery
                    updateConversationTitle(currentSessionId, title).then(success => {
                        if (success) {
                            console.log('Title saved to database:', title);
                        }
                    }).catch(err => console.error('Failed to save title to database:', err));
                    
                    // Update UI
                    onTitleGenerated?.(title);
                }
            }).catch(err => console.error('Title generation failed:', err));
        }

        try {
            // Placeholder assistant message to stream into
            onMessagesUpdate([...newMessages, { role: 'assistant' as const, content: '' }]);

            let fullContent = '';
            for await (const chunk of streamChat(newMessages, currentSessionId)) {
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

    // Download chat transcript as text file - works in both Tauri and browser
    const handleSaveTranscript = async () => {
        console.log('Save button clicked. Messages count:', messages.length);
        
        if (messages.length === 0) {
            console.warn('No messages to save');
            alert('No messages to save yet. Start a conversation first.');
            return;
        }

        try {
            // Format messages for export
            let transcript = '';
            if (chatTitle) {
                transcript += `Chat: ${chatTitle}\n`;
                transcript += `Date: ${new Date().toLocaleString()}\n`;
                transcript += '='.repeat(60) + '\n\n';
            }

            // Process messages (skip system messages)
            const filteredMessages = messages.filter(m => m.role !== 'system');
            console.log('Filtered messages count:', filteredMessages.length);
            
            filteredMessages.forEach(msg => {
                const sender = msg.role === 'user' ? 'User' : 'Offline Intelligence';
                transcript += `${sender}:\n`;
                transcript += `${msg.content}\n\n`;
            });

            console.log('Transcript generated, length:', transcript.length);

            // Check if running in Tauri
            const isTauri = '__TAURI__' in window;
            
            if (isTauri) {
                // Use Tauri's native file dialog and file system
                const defaultFileName = `${chatTitle || 'chat'}-${new Date().toISOString().slice(0, 10)}.txt`;
                const filePath = await save({
                    defaultPath: defaultFileName,
                    filters: [{
                        name: 'Text',
                        extensions: ['txt']
                    }]
                });

                if (filePath) {
                    await writeTextFile(filePath, transcript);
                    console.log('File saved via Tauri:', filePath);
                    alert(`Chat saved successfully!`);
                }
            } else {
                // Use browser's download API
                const blob = new Blob([transcript], { type: 'text/plain;charset=utf-8' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = `${chatTitle || 'chat'}-${new Date().toISOString().slice(0, 10)}.txt`;
                
                console.log('Downloading file:', link.download);
                
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                // Clean up URL
                setTimeout(() => URL.revokeObjectURL(link.href), 100);
                
                console.log('Download completed');
                alert(`Chat saved as: ${link.download}`);
            }
        } catch (error) {
            console.error('Error saving transcript:', error);
            alert(`Error saving transcript:\n${error}`);
        }
    };

    return (
        <div className="chat-window">
            {/* Header */}
            <header className="chat-header">
                <div className="chat-header-bar">
                    {/* Display generated title or app name as fallback */}
                    <div className="chat-title">{chatTitle || 'Aud.io'}</div>
                    <div className="header-actions">
                        {/* Save button for exporting chat transcript to local device */}
                        <button type="button" className="header-button" onClick={handleSaveTranscript} title="Download transcript as text file">
                            <svg className="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            <span>Save</span>
                        </button>
                        <div style={{ position: 'relative' }} ref={dropdownRef}>
                            <button 
                                type="button" 
                                className="header-icon-button" 
                                aria-label="More options"
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                            >
                                <svg className="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 8a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 8a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
                                </svg>
                            </button>
                            
                            {/* Dropdown Menu */}
                            {isDropdownOpen && chatId && (
                                <div className="dropdown-menu">
                                    <button 
                                        className="dropdown-item"
                                        onClick={() => {
                                            onPinChat?.(chatId);
                                            setIsDropdownOpen(false);
                                        }}
                                    >
                                        <svg className="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                                        </svg>
                                        <span>{isPinned ? 'Unpin chat' : 'Pin chat'}</span>
                                    </button>
                                    <button 
                                        className="dropdown-item delete"
                                        onClick={() => {
                                            // Open confirmation modal before any delete happens
                                            setShowDeleteConfirm(true);
                                        }}
                                    >
                                        <svg className="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                        <span>Delete</span>
                                    </button>
                                </div>
                            )}
                        </div>
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
            
            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <svg className="modal-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4v2m0 4v2m0-14a9 9 0 110 18 9 9 0 010-18zm0 0a9 9 0 110 18 9 9 0 010-18z" />
                            </svg>
                        </div>
                        <h2 className="modal-title">Delete Chat</h2>
                        <p className="modal-message">Are you sure you want to delete this chat?</p>
                        <div className="modal-buttons">
                            <button 
                                className="modal-button cancel"
                                onClick={() => {
                                    setShowDeleteConfirm(false);
                                    setIsDropdownOpen(false);
                                }}
                            >
                                Cancel
                            </button>
                            <button 
                                className="modal-button delete"
                                onClick={() => {
                                    // Final confirm: delete the active chat
                                    onDeleteChat?.(chatId!);
                                    setShowDeleteConfirm(false);
                                    setIsDropdownOpen(false);
                                }}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
