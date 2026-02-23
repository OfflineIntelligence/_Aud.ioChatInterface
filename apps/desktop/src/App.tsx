import { useState, useEffect, useRef } from 'react'
import { ChatWindow } from './components/ChatWindow'
import { Sidebar } from './components/Sidebar'
import { SearchModal } from './components/SearchModal'
import NotificationsContainer from './components/Notifications'
import ModelsPanel from './components/ModelsPanel'

import SettingsPanel from './components/SettingsPanel'
import HelpFeedbackPanel from './components/HelpFeedbackPanel'
import ActivityPanel from './components/ActivityPanel'
import LocalFilesPanel from './components/LocalFilesPanel'
import MetricsPanel from './components/MetricsPanel'
import LoginModal from './components/LoginModal'
import FeedbackPopup from './components/FeedbackPopup'
import { useAuth } from './contexts/AuthContext'
import type { Chat } from './components/ChatWindow'
import type { Message } from './api/chat'
import { fetchConversations, fetchConversation, deleteConversation } from './api/chat'
import { getApiBaseSync } from './api/backendUrl'
import { getAllApiKeys, migrateKeysFromLocalStorage } from './api/apiKeys'
import './App.css'

function App() {
  return <MainApp />;
}

// ---------------------------------------------------------------------------
// Sidebar-only pin/save state — persisted in localStorage, never in SQLite.
// The SQLite `pinned` column is no longer written; only these helpers drive
// the sidebar's pinned/saved sections.
// ---------------------------------------------------------------------------
const PINNED_KEY = 'aud-io-pinned-sessions';
const SAVED_KEY  = 'aud-io-saved-sessions';

function getPinnedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(PINNED_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}

function getSavedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}

function setPinnedIds(ids: Set<string>): void {
  localStorage.setItem(PINNED_KEY, JSON.stringify([...ids]));
}

function setSavedIds(ids: Set<string>): void {
  localStorage.setItem(SAVED_KEY, JSON.stringify([...ids]));
}

function MainApp() {
  const { user, isLoggedIn } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [currentMessages, setCurrentMessages] = useState<Message[]>([
    { role: 'system', content: 'You are a helpful assistant.' }
  ]);
  const [currentChatTitle, setCurrentChatTitle] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    // Restore active session from localStorage on app load
    return localStorage.getItem('aud-io-active-session');
  });
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [activeView, setActiveView] = useState<'chat' | 'models' | 'settings' | 'help' | 'localfiles' | 'metrics'>('chat');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activityOpen, setActivityOpen] = useState(false);
  const [questionCount, setQuestionCount] = useState(0);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showFeedbackPopup, setShowFeedbackPopup] = useState(false);
  const [isOnlineMode, setIsOnlineMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('aud-io-online-mode');
      return saved === 'true';
    } catch { return false; }
  });

  const [selectedModel, setSelectedModel] = useState<{
    id: string;
    name: string;
    source: 'local' | 'openrouter';
  } | null>(() => {
    try {
      const saved = localStorage.getItem('aud-io-selected-model');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  const [openRouterApiKey, setOpenRouterApiKey] = useState<string>(() => {
    return user?.apiKeys?.openrouter || localStorage.getItem('aud-io-openrouter-key') || '';
  });

  const [hfToken, setHfToken] = useState<string>(() => {
    // Get from localStorage first
    const storedToken = localStorage.getItem('aud-io-hf-token');
    if (storedToken) return storedToken;
    // Then try from user context
    return user?.apiKeys?.huggingface || '';
  });

  const [shouldFocusApiKey, setShouldFocusApiKey] = useState(false);
  const [shouldFocusHfToken, setShouldFocusHfToken] = useState(false);

  // Sync API keys with auth context
  useEffect(() => {
    if (user?.apiKeys?.openrouter) {
      setOpenRouterApiKey(user.apiKeys.openrouter);
    }
    if (user?.apiKeys?.huggingface) {
      setHfToken(user.apiKeys.huggingface);
    }
  }, [user]);

  // Sync hfToken to auth context when it changes
  useEffect(() => {
    if (user && hfToken !== user.apiKeys?.huggingface) {
      // Update auth context with new hfToken
      // We need to call setApiKey but it's not available here directly
      // So we rely on components to update the context when values change
    }
  }, [user, hfToken]);

  useEffect(() => {
    localStorage.setItem('aud-io-online-mode', String(isOnlineMode));
  }, [isOnlineMode]);

  // Persist active session to localStorage
  useEffect(() => {
    if (activeSessionId) {
      localStorage.setItem('aud-io-active-session', activeSessionId);
    }
  }, [activeSessionId]);

  useEffect(() => {
    localStorage.setItem('aud-io-selected-model', JSON.stringify(selectedModel));
  }, [selectedModel]);

  useEffect(() => {
    localStorage.setItem('aud-io-openrouter-key', openRouterApiKey);
  }, [openRouterApiKey]);

  useEffect(() => {
    localStorage.setItem('aud-io-hf-token', hfToken);
  }, [hfToken]);

  // Sync currentSessionId to localStorage when it changes
  useEffect(() => {
    if (currentSessionId) {
      localStorage.setItem('aud-io-active-session', currentSessionId);
      setActiveSessionId(currentSessionId);
      
      // Get title from first user message if no title generated yet
      const firstUserMessage = currentMessages.find(m => m.role === 'user');
      const chatTitle = firstUserMessage 
        ? firstUserMessage.content.slice(0, 50) + (firstUserMessage.content.length > 50 ? '...' : '')
        : (currentChatTitle || 'New conversation');
      
      // Also add to chats if not already there (for sessions without titles)
      setChats(prev => {
        if (!prev.find(c => c.id === currentSessionId)) {
          return [...prev, {
            id: currentSessionId,
            title: chatTitle,
            messages: currentMessages,
            createdAt: new Date(),
            pinned: false,
          }];
        }
        return prev;
      });
    }
  }, [currentSessionId, currentMessages]);

  // On first mount: migrate any localStorage keys to the backend, then load backend
  // keys into component state so keys saved in previous sessions are available immediately.
  useEffect(() => {
    const syncKeysFromBackend = async () => {
      try {
        // One-time migration: move localStorage keys → encrypted backend DB
        await migrateKeysFromLocalStorage();
        // Pull all stored keys from backend (decrypted) into component state
        const keys = await getAllApiKeys();
        keys.forEach(k => {
          if (k.key_type === 'openrouter' && k.value) {
            setOpenRouterApiKey(prev => prev || k.value!);
          }
          if (k.key_type === 'huggingface' && k.value) {
            setHfToken(prev => prev || k.value!);
          }
        });
      } catch {
        // Non-fatal: backend may not be ready yet; user can re-enter keys manually
      }
    };
    syncKeysFromBackend();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-switch online/offline mode when user selects a model from a different source.
  // This is an intentional state-sync: model source drives online mode state.
  const prevModelSourceRef = useRef(selectedModel?.source);
  useEffect(() => {
    const source = selectedModel?.source;
    if (source && source !== prevModelSourceRef.current) {
      prevModelSourceRef.current = source;
      if (source === 'openrouter') {
        setIsOnlineMode(true); // eslint-disable-line react-hooks/set-state-in-effect
      } else if (source === 'local') {
        setIsOnlineMode(false);
      }
    }
  }, [selectedModel]);

  // Global download progress tracking for notification bubble
  const [globalDownloads, setGlobalDownloads] = useState<{ download_id: string; model_name: string; status: string; percentage: number; bytes_downloaded: number; total_bytes?: number; speed_bps: number }[]>([]);
  const [showDownloadBubble, setShowDownloadBubble] = useState(true);

  useEffect(() => {
    const pollDownloads = async () => {
      try {
        const res = await fetch(`${getApiBaseSync()}/models/downloads`);
        if (res.ok) {
          const data = await res.json();
          setGlobalDownloads(data);
        }
      } catch { /* ignore */ }
    };
    const interval = setInterval(pollDownloads, 3000);
    pollDownloads();
    return () => clearInterval(interval);
  }, []);


  const activeGlobalDownloads = globalDownloads.filter(d => d.status === 'Downloading' || d.status === 'Starting');

  // Activity settings (persisted in localStorage)
  const [activityEnabled, setActivityEnabled] = useState(() => {
    return localStorage.getItem('aud-io-activity-enabled') !== 'false';
  });
  const [autoDeletePeriod, setAutoDeletePeriod] = useState(() => {
    return localStorage.getItem('aud-io-auto-delete') || '540d';
  });

  useEffect(() => {
    localStorage.setItem('aud-io-activity-enabled', String(activityEnabled));
  }, [activityEnabled]);

  useEffect(() => {
    localStorage.setItem('aud-io-auto-delete', autoDeletePeriod);
  }, [autoDeletePeriod]);

  // Load conversations on mount (pure async - no retries)
  useEffect(() => {
    const loadConversations = async () => {
      try {
        const conversations = await fetchConversations();
        // Pin/save live in localStorage only — ignore the SQLite `pinned` field.
        const pinnedIds = getPinnedIds();
        const savedIds  = getSavedIds();
        const loadedChats: Chat[] = conversations.map(conv => ({
          id: conv.id,
          title: conv.title,
          messages: [],
          createdAt: new Date(conv.created_at),
          pinned: pinnedIds.has(conv.id),
          saved:  savedIds.has(conv.id),
        }));
        setChats(loadedChats);
        
        // Restore active session if we have one saved
        const savedSessionId = localStorage.getItem('aud-io-active-session');
        if (savedSessionId) {
          const existingChat = loadedChats.find(c => c.id === savedSessionId);
          if (existingChat) {
            // Load the saved session's messages
            const conversation = await fetchConversation(savedSessionId);
            if (conversation && conversation.messages.length > 0) {
              const messages = conversation.messages[0]?.role === 'system'
                ? conversation.messages
                : [{ role: 'system' as const, content: 'You are a helpful assistant.' }, ...conversation.messages];
              setCurrentMessages(messages);
              setActiveChatId(savedSessionId);
              setCurrentSessionId(savedSessionId);
              setActiveSessionId(savedSessionId);
              setCurrentChatTitle(existingChat.title);
              // Update the chat with loaded messages
              setChats(prev => prev.map(c => c.id === savedSessionId ? { ...c, messages } : c));
            }
          } else {
            // Saved session no longer exists, clear it
            localStorage.removeItem('aud-io-active-session');
          }
        }
      } catch (error) {
        console.error('Failed to load conversations:', error);
        // User can refresh or conversations will load when backend is ready
      }
    };
    loadConversations();
  }, []);

  // Sync messages to the chats array so sidebar shows up-to-date message counts.
  useEffect(() => {
    if (!activeChatId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChats(prev => prev.map(chat =>
      chat.id === activeChatId ? { ...chat, messages: currentMessages } : chat
    ));
  }, [activeChatId, currentMessages]);

  // Show login prompt every 5 questions for unauthenticated users.
  useEffect(() => {
    if (questionCount > 0 && questionCount % 5 === 0 && !isLoggedIn) {
      setShowLoginModal(true);
    }
  }, [questionCount, isLoggedIn]);

  // Show feedback popup every 5 queries
  useEffect(() => {
    if (questionCount > 0 && questionCount % 5 === 0) {
      setShowFeedbackPopup(true);
    }
  }, [questionCount]);

  const handleTitleGenerated = (title: string, sessionIdArg: string) => {
    setCurrentChatTitle(title);
    const chatId = sessionIdArg;
    if (!chatId) return;

    // Only update the title in the chats list.
    // DO NOT call setActiveChatId / setCurrentSessionId / setActiveSessionId here —
    // title generation is fire-and-forget and may complete *after* the user has already
    // switched to a different session, which would corrupt the active-session state.
    setChats(prev => {
      const existing = prev.find(c => c.id === chatId);
      if (existing) {
        // Chat already in the list (added by handleSessionIdChange effect) — just update the title
        return prev.map(c => c.id === chatId ? { ...c, title } : c);
      }
      // Not yet in list — add it (should rarely happen, but handle gracefully)
      return [...prev, {
        id: chatId,
        title,
        messages: [],
        createdAt: new Date(),
        pinned: false,
      }];
    });
  };

  // Called by ChatWindow the moment it generates a session ID (first message send).
  // Setting BOTH currentSessionId and activeChatId here ensures that:
  //   • handleMessagesUpdate can update chats[session].messages during streaming
  //   • the useEffect([activeChatId, currentMessages]) sync fires correctly
  // Previously only setCurrentSessionId was called (via onSessionIdChange={setCurrentSessionId}),
  // leaving activeChatId null until handleTitleGenerated fired — which could be seconds later.
  const handleSessionIdChange = (sessionId: string) => {
    setCurrentSessionId(sessionId);
    setActiveChatId(sessionId);
    setActiveSessionId(sessionId);
    localStorage.setItem('aud-io-active-session', sessionId);
  };

  const handleNewChat = () => {
    setActiveChatId(null);
    setCurrentSessionId(null);
    setActiveSessionId(null);
    setCurrentChatTitle(null);
    setCurrentMessages([{ role: 'system', content: 'You are a helpful assistant.' }]);
    // Clear from localStorage
    localStorage.removeItem('aud-io-active-session');
  };



  const handleSelectChat = async (chatId: string) => {
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;

    // Set all active-session state immediately so the UI responds at once
    setCurrentSessionId(chatId);
    setActiveChatId(chatId);
    setActiveSessionId(chatId);
    setCurrentChatTitle(chat.title);
    localStorage.setItem('aud-io-active-session', chatId);

    // ALWAYS fetch from SQLite — the in-memory cache is unreliable because:
    //   • It is populated at session-start with only [system + user_question]
    //   • The assistant reply is added later (during/after streaming) so the cache
    //     may never have been updated with the full conversation.
    try {
      const conversation = await fetchConversation(chatId);
      if (conversation && conversation.messages.length > 0) {
        const messages = conversation.messages[0]?.role === 'system'
          ? conversation.messages
          : [{ role: 'system' as const, content: 'You are a helpful assistant.' }, ...conversation.messages];
        setCurrentMessages(messages);
        // Also update the in-memory cache so subsequent reads are fast
        setChats(prev => prev.map(c => c.id === chatId ? { ...c, messages } : c));
      } else if (chat.messages && chat.messages.length > 0) {
        // SQLite returned nothing — fall back to whatever is cached (best-effort)
        setCurrentMessages(chat.messages);
      } else {
        setCurrentMessages([{ role: 'system', content: 'You are a helpful assistant.' }]);
      }
    } catch (error) {
      console.error('Failed to fetch conversation from SQLite:', error);
      // On network/backend error fall back to the in-memory cache
      if (chat.messages && chat.messages.length > 0) {
        setCurrentMessages(chat.messages);
      }
    }
  };

  const handleMessagesUpdate = (messages: Message[]) => {
    setCurrentMessages(messages);
    // Use currentSessionId as primary — it's set by handleSessionIdChange at the moment
    // the first message is sent, BEFORE streaming begins, so it's always available.
    // Fall back to activeChatId for the restore-on-startup path.
    const sessionId = currentSessionId || activeChatId;
    if (sessionId) {
      setChats(prev => prev.map(chat =>
        chat.id === sessionId ? { ...chat, messages } : chat
      ));
    }
  };

  const handlePinChat = (chatId: string) => {
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;
    const newPinnedState = !(chat.pinned ?? false);
    // Update React state (sidebar re-renders immediately)
    setChats(prev => prev.map(c => c.id === chatId ? { ...c, pinned: newPinnedState } : c));
    // Persist to localStorage — no SQLite write
    const ids = getPinnedIds();
    if (newPinnedState) ids.add(chatId); else ids.delete(chatId);
    setPinnedIds(ids);
  };

  const handleSaveChat = (chatId: string) => {
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;
    const newSavedState = !(chat.saved ?? false);
    // Update React state (sidebar re-renders immediately)
    setChats(prev => prev.map(c => c.id === chatId ? { ...c, saved: newSavedState } : c));
    // Persist to localStorage — no SQLite write
    const ids = getSavedIds();
    if (newSavedState) ids.add(chatId); else ids.delete(chatId);
    setSavedIds(ids);
  };

  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);
  const deletingChatIdRef = useRef<string | null>(null);

  const handleDeleteChat = async (chatId: string) => {
    // Prevent concurrent deletions using ref for immediate check
    if (deletingChatIdRef.current === chatId) {
      console.log('Already deleting chat:', chatId);
      return;
    }
    if (deletingChatIdRef.current) {
      console.log('Another delete in progress:', deletingChatIdRef.current);
      return;
    }

    deletingChatIdRef.current = chatId;
    setDeletingChatId(chatId);

    // Helper: remove deleted chat from localStorage pin/save state
    const cleanupPinSave = () => {
      const pIds = getPinnedIds(); pIds.delete(chatId); setPinnedIds(pIds);
      const sIds = getSavedIds();  sIds.delete(chatId); setSavedIds(sIds);
    };

    try {
      const success = await deleteConversation(chatId);
      if (success) {
        // 1. Remove from sidebar
        setChats(prev => prev.filter(chat => chat.id !== chatId));
        // 2. Clear chat window if this was the active conversation
        if (activeChatId === chatId) handleNewChat();
        // 3. Clean up pin/save localStorage entries
        cleanupPinSave();
      }
    } catch (error) {
      console.error('Delete chat error:', error);
      // On error, still remove from UI to keep frontend in sync
      setChats(prev => prev.filter(chat => chat.id !== chatId));
      if (activeChatId === chatId) handleNewChat();
      cleanupPinSave();
    } finally {
      deletingChatIdRef.current = null;
      setDeletingChatId(null);
    }
  };

  const handleDeleteConversationActivity = (id: string) => {
    handleDeleteChat(id).catch(console.error);
  };

  const handleDeleteByAge = (olderThanDays: number) => {
    if (olderThanDays === 0) {
      // Delete all conversations: SQLite, sidebar, and localStorage pin/save
      chats.forEach(chat => {
        deleteConversation(chat.id).catch(console.error);
      });
      setChats([]);
      handleNewChat();
      setPinnedIds(new Set());
      setSavedIds(new Set());
    } else {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - olderThanDays);
      const toDelete = chats.filter(c => new Date(c.createdAt) < cutoff);
      toDelete.forEach(chat => {
        deleteConversation(chat.id).catch(console.error);
      });
      setChats(prev => prev.filter(c => new Date(c.createdAt) >= cutoff));
      // Clean up localStorage pin/save for every deleted chat
      const deletedIds = new Set(toDelete.map(c => c.id));
      const pIds = getPinnedIds();
      deletedIds.forEach(id => pIds.delete(id));
      setPinnedIds(pIds);
      const sIds = getSavedIds();
      deletedIds.forEach(id => sIds.delete(id));
      setSavedIds(sIds);
    }
  };

  const openModelsWithFocus = (focusApiKey = false, focusHfToken = false) => {
    setActiveView('models');
    if (focusApiKey) {
      setShouldFocusApiKey(true);
      // Reset the focus flag after a brief moment to ensure it works correctly
      setTimeout(() => setShouldFocusApiKey(false), 300);
    }
    if (focusHfToken) {
      setShouldFocusHfToken(true);
      // Reset the focus flag after a brief moment to ensure it works correctly
      setTimeout(() => setShouldFocusHfToken(false), 300);
    }
  };

  const renderMainContent = () => {
    switch (activeView) {
      case 'models':
        return <ModelsPanel
          isOpen={activeView === 'models'}
          onClose={() => setActiveView('chat')}
          selectedModel={selectedModel}
          onSelectModel={(model) => { setSelectedModel(model); if (model) setActiveView('chat'); }}
          openRouterApiKey={openRouterApiKey}
          onOpenRouterApiKeyChange={setOpenRouterApiKey}
          onToggleOnlineMode={setIsOnlineMode}
          focusApiKeyInput={shouldFocusApiKey}
          focusHfTokenInput={shouldFocusHfToken}
        />;

      case 'settings':
        return <SettingsPanel
          isOpen={true}
          onClose={() => setActiveView('chat')}
          onOpenModels={(focusApiKey = false, focusHfToken = false) => {
            openModelsWithFocus(focusApiKey, focusHfToken);
          }}
          onOpenRouterApiKeyChange={setOpenRouterApiKey}
          onHuggingFaceTokenChange={setHfToken}
          onOpenStorage={() => setActiveView('localfiles')}
        />;
      case 'help':
        return (
          <HelpFeedbackPanel
            isOpen={true}
            onClose={() => setActiveView('chat')}
            isLoggedIn={isLoggedIn}
          />
        );
      case 'localfiles':
        return <LocalFilesPanel isOpen={true} onClose={() => setActiveView('chat')} />;
      case 'metrics':
        return <MetricsPanel isOpen={true} onClose={() => setActiveView('chat')} />;
      default:
        return (
          <ChatWindow
            key={currentSessionId || 'new-chat'}
            messages={currentMessages}
            chatTitle={currentChatTitle}
            chatId={activeChatId}
            sessionId={currentSessionId}
            onSessionIdChange={handleSessionIdChange}
            isPinned={chats.find(c => c.id === activeChatId)?.pinned}
            onMessagesUpdate={handleMessagesUpdate}
            onTitleGenerated={handleTitleGenerated}
            onPinChat={handlePinChat}
            onDeleteChat={handleDeleteChat}
            onQuestionAsked={() => setQuestionCount(prev => prev + 1)}
            isOnlineMode={isOnlineMode}
            onToggleOnlineMode={setIsOnlineMode}
            selectedModel={selectedModel}
            openRouterApiKey={openRouterApiKey}
            onOpenRouterApiKeyChange={setOpenRouterApiKey}
            onSelectedModelChange={setSelectedModel}
            onOpenModels={(focusApiKey = false, focusHfToken = false) => {
              openModelsWithFocus(focusApiKey, focusHfToken);
            }}
          />
        );
    }
  };

  return (
    <div className="app-root" data-sidebar={sidebarOpen ? 'open' : 'closed'}>
      <Sidebar
        chats={chats}
        activeChatId={activeChatId}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        onNewChat={() => { handleNewChat(); setActiveView('chat'); }}
        onSelectChat={(id) => { handleSelectChat(id); setActiveView('chat'); }}
        onOpenModels={() => {
          setActiveView('models');
          // Reset the focus flag when navigating from sidebar
          setShouldFocusApiKey(false);
          setShouldFocusHfToken(false);
        }}
        onPinChat={handlePinChat}
        onSaveChat={handleSaveChat}
        deletingChatId={deletingChatId}
        onDeleteChat={(id) => handleDeleteChat(id).catch(console.error)}
        onOpenSettings={() => setActiveView('settings')}
        onOpenActivity={() => setActivityOpen(true)}
        onOpenHelp={() => setActiveView('help')}
        onOpenHome={() => { handleNewChat(); setActiveView('chat'); }}
        onOpenLocalFiles={() => setActiveView('localfiles')}
        onOpenMetrics={() => setActiveView('metrics')}
        activeView={activeView}
        userName={user?.name || 'User'}
      />
      {renderMainContent()}
      <SearchModal
        isOpen={isSearchOpen}
        chats={chats}
        onClose={() => setIsSearchOpen(false)}
        onSelectChat={(chatId) => { handleSelectChat(chatId); setActiveView('chat'); }}
      />
      <ActivityPanel
        isOpen={activityOpen}
        onClose={() => setActivityOpen(false)}
        conversations={chats.map(c => ({ id: c.id, title: c.title, created_at: c.createdAt.toISOString?.() || new Date(c.createdAt).toISOString() }))}
        onDeleteConversation={handleDeleteConversationActivity}
        onDeleteByAge={handleDeleteByAge}
        activityEnabled={activityEnabled}
        onToggleActivity={setActivityEnabled}
        autoDeletePeriod={autoDeletePeriod}
        onAutoDeletePeriodChange={setAutoDeletePeriod}
      />
      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
      />
      <FeedbackPopup
        isOpen={showFeedbackPopup}
        onClose={() => setShowFeedbackPopup(false)}
      />
      {/* Global download notification bubble - shows on all pages except models */}
      {activeView !== 'models' && activeGlobalDownloads.length > 0 && showDownloadBubble && (
        <div className="download-bubble">
          <div className="download-bubble-header">
            <span className="download-bubble-title">
              {activeGlobalDownloads.length} download{activeGlobalDownloads.length > 1 ? 's' : ''} in progress
            </span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button className="download-bubble-close" onClick={() => setActiveView('models')} style={{ fontSize: '12px' }}>
                View
              </button>
              <button className="download-bubble-close" onClick={() => setShowDownloadBubble(false)}>
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          {activeGlobalDownloads.slice(0, 3).map(dl => (
            <div key={dl.download_id} style={{ marginBottom: '6px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '3px' }}>{dl.model_name}</div>
              <div style={{ width: '100%', height: '4px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(dl.percentage, 100)}%`, height: '100%', backgroundColor: 'var(--accent)', borderRadius: '2px', transition: 'width 0.3s' }} />
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                {dl.percentage.toFixed(1)}%{dl.speed_bps > 0 ? ` - ${(dl.speed_bps / (1024 * 1024)).toFixed(1)} MB/s` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
      <NotificationsContainer />
    </div>
  );
}

export default App
