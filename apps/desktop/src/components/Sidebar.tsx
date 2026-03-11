import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import LoginModal from './LoginModal';

type Conversation = {
  id: string;
  title: string;
  createdAt: Date | string;
  pinned?: boolean;
  saved?: boolean;
  messages?: unknown[];
};

interface SidebarProps {
  conversations?: Conversation[];
  chats?: Conversation[];
  selectedChatId?: string | null;
  activeChatId?: string | null;
  onNewChat?: () => void;
  onSelectChat?: (chatId: string) => void;
  onDeleteChat?: (chatId: string) => void;
  onPinChat?: (chatId: string) => void;
  onSaveChat?: (chatId: string) => void;
  onOpenModels?: () => void;

  onOpenSettings?: () => void;
  onOpenActivity?: () => void;
  onOpenHelp?: () => void;
  onOpenHome?: () => void;
  onOpenLocalFiles?: () => void;
  onOpenMetrics?: () => void;
  activeView?: string;
  isOpen: boolean;
  onToggle: () => void;
  userName?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  conversations,
  chats,
  selectedChatId,
  activeChatId,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  onPinChat,
  onSaveChat,
  onOpenModels,
  onOpenSettings,
  onOpenActivity,
  onOpenHelp,
  onOpenHome,
  onOpenLocalFiles,
  onOpenMetrics,
  activeView,
  isOpen,
  onToggle,
  userName = '',
}) => {
  const { user, isLoggedIn, logout } = useAuth();
  const [showLoginModal, setShowLoginModal] = useState(false);
  
  // Suppress unused variable warning
  const _ = user;
  const [search, setSearch] = useState('');
  const [profilePopup, setProfilePopup] = useState(false);
  const [hoveredChat, setHoveredChat] = useState<string | null>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const source = useMemo(() => conversations ?? chats ?? [], [conversations, chats, activeView]);
  const selected = selectedChatId ?? activeChatId ?? null;

  // Get initials from user name
  const initials = useMemo(() => {
    if (!userName) return 'U';
    const parts = userName.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0][0]?.toUpperCase() || 'U';
  }, [userName]);

  // Sort: pinned first, then by date
  const sorted = useMemo(() => {
    const list = Array.isArray(source) ? [...source] : [];
    return list
      .filter(c => c.title.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [source, search]);

  const pinnedChats = sorted.filter(c => c.pinned);
  const otherChats = sorted.filter(c => !c.pinned);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfilePopup(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Fixed toggle button (always visible at same position)
  return (
    <>
      <button className="sidebar-toggle-btn" onClick={onToggle} aria-label={isOpen ? "Close sidebar" : "Open sidebar"} title={isOpen ? "Close sidebar" : "Open sidebar"}>
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      
      {isOpen && (
        <nav className="sidebar" aria-label="Chat navigation" role="navigation">
          {/* Top row - empty */}
          <div className="sidebar-top-row">
            {/* Home button removed */}
          </div>

      {/* New Chat */}
      <button className="sidebar-nav-btn" onClick={() => onNewChat?.()} aria-label="New chat">
        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
        <span>New Chat</span>
      </button>

      {/* Models - Box icon */}
      <button className="sidebar-nav-btn" onClick={onOpenModels} aria-label="Manage models">
        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
        <span>Models</span>
      </button>

      {/* Local Storage */}
      <button className="sidebar-nav-btn" onClick={onOpenLocalFiles} aria-label="Local storage">
        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
        </svg>
        <span>Local Storage</span>
      </button>

      {/* Metrics */}
      <button className="sidebar-nav-btn" onClick={onOpenMetrics} aria-label="System metrics">
        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <span>Metrics</span>
      </button>

      {/* Settings */}
      <button className="sidebar-nav-btn" onClick={onOpenSettings} aria-label="Settings">
        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <span>Settings</span>
      </button>

      {/* Search filter */}
      {source.length > 0 && (
        <div style={{ padding: '4px 8px 0', position: 'relative' }}>
          <svg
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            style={{
              position: 'absolute',
              left: '16px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
              pointerEvents: 'none',
            }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            className="sidebar-search-input"
            type="text"
            placeholder="Search chats..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Filter conversations"
            style={{ paddingLeft: '28px' }}
          />
        </div>
      )}

      {/* Pinned Section */}
      {pinnedChats.length > 0 && (
        <>
          <div className="sidebar-section-title">Pinned</div>
          <ul className="sidebar-chat-list">
            {pinnedChats.map(chat => (
              <ChatItem
                key={chat.id}
                chat={chat}
                isSelected={chat.id === selected}
                isHovered={hoveredChat === chat.id}
                onMouseEnter={() => setHoveredChat(chat.id)}
                onMouseLeave={() => setHoveredChat(null)}
                onSelect={() => onSelectChat?.(chat.id)}
                onPin={() => onPinChat?.(chat.id)}
                onSave={() => onSaveChat?.(chat.id)}
                onDelete={() => onDeleteChat?.(chat.id)}
              />
            ))}
          </ul>
        </>
      )}

      {/* Other Chats */}
      <div className="sidebar-section-title">
        {pinnedChats.length > 0 ? 'Recent' : 'Your chats'}
      </div>
      <ul className="sidebar-chat-list" style={{ flex: 1, overflowY: 'auto' }}>
        {otherChats.length === 0 && pinnedChats.length === 0 && (
          <li className="sidebar-empty-state">No conversations yet</li>
        )}
        {otherChats.map(chat => (
          <ChatItem
            key={chat.id}
            chat={chat}
            isSelected={chat.id === selected}
            isHovered={hoveredChat === chat.id}
            onMouseEnter={() => setHoveredChat(chat.id)}
            onMouseLeave={() => setHoveredChat(null)}
            onSelect={() => onSelectChat?.(chat.id)}
            onPin={() => onPinChat?.(chat.id)}
            onSave={() => onSaveChat?.(chat.id)}
            onDelete={() => onDeleteChat?.(chat.id)}
          />
        ))}
      </ul>

      {/* Footer: Profile (logged-in) or Google Sign-In (logged-out) */}
      <div className="sidebar-footer-section">
        {!isLoggedIn ? (
          /* ── Not logged in: show prominent Google sign-in button ── */
          <button
            className="sidebar-google-signin-btn"
            onClick={() => setShowLoginModal(true)}
            title="Sign in with Google"
          >
            {/* Google "G" logo */}
            <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ flexShrink: 0 }}>
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            <span>Sign in with Google</span>
          </button>
        ) : (
          /* ── Logged in: show profile row with popup ── */
          <div ref={profileRef} style={{ position: 'relative' }}>
            <div className="sidebar-profile-row" onClick={() => setProfilePopup(!profilePopup)}>
              {/* Avatar: Google profile picture if available, else initials */}
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.name}
                  className="sidebar-profile-avatar"
                  style={{ borderRadius: '50%', width: '32px', height: '32px', objectFit: 'cover' }}
                />
              ) : (
                <div className="sidebar-profile-avatar">{initials}</div>
              )}
              <span className="sidebar-profile-name">{user?.name || userName || 'User'}</span>
              <button
                className="sidebar-icon-btn-sm"
                aria-label="More options"
                onClick={(e) => { e.stopPropagation(); setProfilePopup(!profilePopup); }}
              >
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="5" r="1.5" />
                  <circle cx="12" cy="12" r="1.5" />
                  <circle cx="12" cy="19" r="1.5" />
                </svg>
              </button>
            </div>

            {profilePopup && (
              <div className="sidebar-profile-popup">
                <button className="sidebar-dropdown-item" onClick={() => { onOpenSettings?.(); setProfilePopup(false); }}>
                  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>Settings</span>
                </button>
                <button className="sidebar-dropdown-item" onClick={() => { onOpenHelp?.(); setProfilePopup(false); }}>
                  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Help & Feedback</span>
                </button>
                <button className="sidebar-dropdown-item" onClick={() => { onOpenActivity?.(); setProfilePopup(false); }}>
                  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Activity</span>
                </button>
                <button className="sidebar-dropdown-item sidebar-dropdown-item--danger" onClick={() => { logout(); setProfilePopup(false); }}>
                  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
      )}
      <LoginModal 
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
      />
    </>
  );
};

// Individual chat item with hover actions
const ChatItem: React.FC<{
  chat: Conversation;
  isSelected: boolean;
  isHovered: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onSelect: () => void;
  onPin: () => void;
  onSave: () => void;
  onDelete: () => void;
}> = ({ chat, isSelected, isHovered, onMouseEnter, onMouseLeave, onSelect, onPin, onSave, onDelete }) => {
  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete();
  };

  return (
    <li
      className={`sidebar-chat-item ${isSelected ? 'selected' : ''}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="sidebar-chat-row">
        {/* Indicators */}
        <div className="sidebar-chat-indicators">
          {chat.pinned && (
            <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24" className="sidebar-pin-icon" aria-label="Pinned">
              <path d="M16 4a1 1 0 01.117 1.993L16 6v4.26l1.527 1.527.097.112a2 2 0 01.369 1.014L18 13v1h-5v6l-1 2-1-2v-6H6v-1a2 2 0 01.883-1.662l.144-.078L8 10.26V6a1 1 0 01-.117-1.993L8 4h8z" />
            </svg>
          )}
          {chat.saved && (
            <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24" className="sidebar-save-icon" aria-label="Saved">
              <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          )}
        </div>

        {/* Title */}
        <button className="sidebar-chat-title" onClick={onSelect}>
          {chat.title}
        </button>

        {/* Hover Actions */}
        {isHovered && (
          <div className="sidebar-chat-actions">
            <button
              className="sidebar-icon-btn-xs"
              onClick={(e) => { e.stopPropagation(); onPin(); }}
              title={chat.pinned ? 'Unpin' : 'Pin'}
            >
              <svg width="14" height="14" fill={chat.pinned ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 4a1 1 0 01.117 1.993L16 6v4.26l1.527 1.527.097.112a2 2 0 01.369 1.014L18 13v1h-5v6l-1 2-1-2v-6H6v-1a2 2 0 01.883-1.662l.144-.078L8 10.26V6a1 1 0 01-.117-1.993L8 4h8z" />
              </svg>
            </button>
            <button
              className="sidebar-icon-btn-xs"
              onClick={(e) => { e.stopPropagation(); onSave(); }}
              title={chat.saved ? 'Unsave' : 'Save'}
            >
              <svg width="14" height="14" fill={chat.saved ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </button>
            <button
              className="sidebar-icon-btn-xs"
              onClick={handleDeleteClick}
              title="Delete"
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </li>
  );
};
