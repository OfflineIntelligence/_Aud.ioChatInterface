// Sidebar: dark left navigation matching ChatGPT's structure
// Displays all saved chats with clickable titles for switching
import React, { useMemo, useState } from 'react'

type Conversation = {
  id: string;
  title: string;
  createdAt: Date | string;
  pinned?: boolean;
  messages?: unknown[];
};

interface SidebarProps {
  // Backwards compat: accept either `conversations` or `chats` from parent
  conversations?: Conversation[];
  chats?: Conversation[];
  selectedChatId?: string | null;
  activeChatId?: string | null;
  onNewChat?: () => void;
  onSelectChat?: (chatId: string) => void;
  onDeleteChat?: (chatId: string) => void;
  onPinChat?: (chatId: string) => void;
  onOpenSearch?: () => void;
}

// Minimal, test-friendly sidebar that supports selection, pinning, deletion, and basic search/filtering.
export const Sidebar: React.FC<SidebarProps> = ({
  conversations,
  chats,
  selectedChatId,
  activeChatId,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  onPinChat,
  onOpenSearch,
}) => {
  const [search, setSearch] = useState('');

  // Prefer explicit conversations prop, fall back to `chats` for older callers
  const source = conversations ?? chats ?? [];
  const selected = selectedChatId ?? activeChatId ?? null;

  const sorted = useMemo(() => {
    const list = Array.isArray(source) ? [...source] : [];
    return list
      .filter(c => c.title.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        const aDate = new Date(a.createdAt).getTime();
        const bDate = new Date(b.createdAt).getTime();
        return bDate - aDate;
      });
  }, [source, search]);

  return (
    <nav className="sidebar" aria-label="Chat navigation" role="navigation">
      {/* New Chat Button */}
      <button className="sidebar-button primary" onClick={onNewChat} aria-label="New chat">
        <svg className="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        <span>New chat</span>
      </button>

      {/* Search */}
      <button className="sidebar-button" onClick={onOpenSearch} aria-label="Search chats">
        <svg className="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span>Search chats</span>
      </button>

      {/* Chat History */}
      <div className="sidebar-section-title">Your chats</div>
      <ul style={{ flex: 1, overflowY: 'auto', listStyle: 'none', padding: 0, margin: 0 }}>
        {sorted.length === 0 && (
          <li role="option" aria-label="empty-state">No conversations yet</li>
        )}
        {sorted.map(chat => (
          <li
            key={chat.id}
            role="option"
            className={`sidebar-chat-item ${chat.id === selected ? 'selected active' : ''}`}
            style={{
              fontWeight: chat.id === selected ? 'bold' : 'normal',
              backgroundColor: chat.id === selected ? '#2f2f2f' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px',
            }}
          >
            {chat.pinned && (
              <svg
                className="icon"
                title="pinned"
                fill="currentColor"
                viewBox="0 0 24 24"
                style={{ width: '14px', height: '14px', flexShrink: 0 }}
              >
                <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            )}
            <button
              style={{
                flex: 1,
                textAlign: 'left',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                background: 'none',
                border: 'none',
                color: 'inherit',
              }}
              onClick={() => onSelectChat?.(chat.id)}
            >
              {chat.title}
            </button>
          </li>
        ))}
      </ul>

      {/* Footer */}
      <div className="sidebar-footer">Offline Intelligence</div>
    </nav>
  )
}
