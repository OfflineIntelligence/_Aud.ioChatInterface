import React, { useState, useRef, useEffect } from 'react';
import type { Message } from '../api/chat';
import { streamChat, updateConversationTitle } from '../api/chat';

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
  onTitleGenerated?: (title: string, sessionId: string) => void;
  onPinChat?: (chatId: string) => void;
  onDeleteChat?: (chatId: string) => Promise<void>;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  messages = [],
  chatTitle = null,
  chatId = null,
  sessionId = null,
  onSessionIdChange,
  isPinned = false,
  onMessagesUpdate,
  onTitleGenerated,
  onPinChat,
  onDeleteChat,
}) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView?.({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    let currentSessionId = sessionId;
    if (!currentSessionId) {
      currentSessionId = `session-${Date.now()}`;
      onSessionIdChange(currentSessionId);
    }

    const userMsg: Message = { role: 'user', content: input };
    const newMessages = [...messages, userMsg];
    onMessagesUpdate(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const assistantMsg: Message = { role: 'assistant', content: '' };
      let fullResponse = '';

      for await (const chunk of streamChat(newMessages, currentSessionId)) {
        fullResponse += chunk;
        assistantMsg.content = fullResponse;
        onMessagesUpdate([...newMessages, { ...assistantMsg }]);
      }

      // Generate title if first message
      if (!chatTitle && onTitleGenerated) {
        const title = await generateTitle(input);
        onTitleGenerated(title, currentSessionId);
      }
    } catch (error) {
      console.error('Chat error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const generateTitle = async (prompt: string): Promise<string> => {
    return `Chat about ${prompt.substring(0, 30)}...`;
  };

  const handleDeleteChat = async () => {
    if (chatId && onDeleteChat) {
      try {
        await onDeleteChat(chatId);
      } catch (error) {
        console.error('Delete error:', error);
      }
    }
  };

  return (
    <div className="chat-window" role="main">
      <div className="chat-header">
        <h1 aria-label="chat-title">{chatTitle || 'New Chat'}</h1>
        {chatId && (
          <>
            <button onClick={() => onPinChat?.(chatId)} aria-label="pin-chat">
              {isPinned ? '📌' : '📍'}
            </button>
            <button onClick={handleDeleteChat} aria-label="delete-chat">
              🗑️
            </button>
          </>
        )}
      </div>

      <div className="messages" role="log" aria-label="messages">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`message message-${msg.role}`}
            data-testid={`message-${idx}`}
            aria-label={`message-${msg.role}`}
          >
            <span className="role">{msg.role}:</span>
            <span className="content">{msg.content}</span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="input-area">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Type a message..."
          disabled={isLoading}
          aria-label="message-input"
        />
        <button
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
          aria-label="send-button"
        >
          {isLoading ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  );
};
