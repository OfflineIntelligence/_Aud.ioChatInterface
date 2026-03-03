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
import { fetchConversations, fetchConversation, deleteConversation, updateConversationPinned } from './api/chat'
import { getApiBaseSync } from './api/backendUrl'
import { useApiKeys } from './contexts/ApiKeyContext'
import './App.css'

function App() {
  return <MainApp />;
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
  const [conversationCount, setConversationCount] = useState<number>(() =>
    parseInt(localStorage.getItem('aud-io-conversation-count') ?? '0', 10)
  );
  const [feedbackGiven, setFeedbackGiven] = useState<boolean>(
    () => localStorage.getItem('aud-io-feedback-given') === 'true'
  );
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showFeedbackPopup, setShowFeedbackPopup] = useState(false);
  const [isOnlineMode, setIsOnlineMode] = useState(() =>
    localStorage.getItem('aud-io-online-mode') === 'true'
  );

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

  // API keys come from ApiKeyContext — the single source of truth shared by
  // ModelsPanel, SettingsPanel, ChatWindow, and any future consumer.
  const { openRouterApiKey, hfToken, setOpenRouterApiKey, setHfToken } = useApiKeys();

  const [shouldFocusApiKey, setShouldFocusApiKey] = useState(false);
  const [shouldFocusHfToken, setShouldFocusHfToken] = useState(false);

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
        const loadedChats: Chat[] = conversations.map(conv => ({
          id: conv.id,
          title: conv.title,
          messages: [],
          createdAt: new Date(conv.created_at),
          pinned: conv.pinned,
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

  // Show login prompt every 3 messages for unauthenticated users.
  useEffect(() => {
    if (questionCount > 0 && questionCount % 3 === 0 && !isLoggedIn) {
      setShowLoginModal(true);
    }
  }, [questionCount, isLoggedIn]);

  // Show feedback popup every 2 messages until user gives feedback.
  // Only show if the login modal isn't already open to avoid stacking prompts.
  useEffect(() => {
    if (questionCount > 0 && questionCount % 2 === 0 && !feedbackGiven && !showLoginModal) {
      setShowFeedbackPopup(true);
    }
  }, [questionCount, feedbackGiven, showLoginModal]);

  const handleTitleGenerated = (title: string, sessionIdArg: string) => {
    setCurrentChatTitle(title);
    const chatId = sessionIdArg;
    if (!chatId) return;

    // Count completed conversations for feedback trigger.
    setConversationCount(prev => {
      const next = prev + 1;
      localStorage.setItem('aud-io-conversation-count', String(next));
      return next;
    });

    // Update (or create) the entry and move it to the top of the sidebar list.
    //
    // IMPORTANT — preserve existing data:
    //   messages  : Keep whatever handleMessagesUpdate already stored during streaming.
    //               Resetting to [] would bust the in-memory cache, forcing a redundant
    //               DB fetch the next time the user selects this chat (fix for cache-hit
    //               condition in both offline and online mode).
    //   createdAt : Keep the original creation timestamp so sort order is stable.
    //               Using new Date() here would always push the chat to position 0 and
    //               would drift from the DB-persisted created_at value.
    //   pinned    : Keep the pin state — title generation must never unpin a chat.
    //
    // The deduplication (prev.filter) ensures we never get two entries with the same id,
    // which would cause React key collisions in the sidebar list.
    setChats(prev => {
      const existing = prev.find(c => c.id === chatId);
      const updatedChat: Chat = {
        id: chatId,
        title,
        // Prefer messages already cached by handleMessagesUpdate; fall back to [] only if
        // the entry doesn't exist yet (the [activeChatId, currentMessages] sync effect will
        // repopulate on the next render in that case).
        messages: existing?.messages ?? [],
        createdAt: existing?.createdAt ?? new Date(),
        pinned: existing?.pinned ?? false,
      };
      return [updatedChat, ...prev.filter(c => c.id !== chatId)];
    });
    setActiveChatId(chatId);
    setCurrentSessionId(chatId);
    setActiveSessionId(chatId);
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

    setActiveChatId(chat.id);
    setCurrentSessionId(chatId);
    setActiveSessionId(chatId);
    setCurrentChatTitle(chat.title);

    // "KV cache" fast path: in-memory messages are only considered complete when they
    // contain at least one assistant response (meaning the full Q+A was streamed and
    // synced into the chats array).  A cache that only has a system message or only
    // user messages is incomplete — go to the database instead.
    const hasFullConversation = chat.messages.some(m => m.role === 'assistant');

    if (hasFullConversation) {
      // Serve from in-memory cache (instant — no network/DB call needed)
      setCurrentMessages(chat.messages);
    } else {
      // Clear stale content immediately so the previous chat doesn't flash while loading
      setCurrentMessages([{ role: 'system' as const, content: 'You are a helpful assistant.' }]);
      // Load from database
      const conversation = await fetchConversation(chatId);
      if (conversation) {
        const messages = conversation.messages[0]?.role === 'system'
          ? conversation.messages
          : [{ role: 'system' as const, content: 'You are a helpful assistant.' }, ...conversation.messages];
        setCurrentMessages(messages);
        // Populate the in-memory cache so the next visit to this chat is instant
        setChats(prev => prev.map(c => c.id === chatId ? { ...c, messages } : c));
      }
    }
  };

  const handleMessagesUpdate = (messages: Message[]) => {
    setCurrentMessages(messages);
    if (activeChatId) {
      setChats(prev => prev.map(chat =>
        chat.id === activeChatId ? { ...chat, messages } : chat
      ));
    }
  };

  const handlePinChat = async (chatId: string) => {
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;
    const newPinnedState = !(chat.pinned ?? false);
    setChats(prev => prev.map(c => c.id === chatId ? { ...c, pinned: newPinnedState } : c));
    const success = await updateConversationPinned(chatId, newPinnedState);
    if (!success) {
      setChats(prev => prev.map(c => c.id === chatId ? { ...c, pinned: !newPinnedState } : c));
    }
  };

  const handleSaveChat = (chatId: string) => {
    setChats(prev => prev.map(c =>
      c.id === chatId ? { ...c, saved: !(c.saved ?? false) } : c
    ));
  };

  const handleDeleteChat = async (chatId: string) => {
    try {
      await deleteConversation(chatId);
    } catch (error) {
      // Log but still clean up the frontend — the session may already be gone from DB
      // (e.g. 404 when deleting a session that was never fully persisted).
      console.error(`Delete conversation [${chatId}] error:`, error);
    }
    setChats(prev => prev.filter(chat => chat.id !== chatId));
    if (activeChatId === chatId) handleNewChat();
  };

  const handleDeleteConversationActivity = (id: string) => {
    handleDeleteChat(id).catch(console.error);
  };

  const handleDeleteByAge = (olderThanDays: number) => {
    if (olderThanDays === 0) {
      chats.forEach(chat => {
        deleteConversation(chat.id).catch(console.error);
      });
      setChats([]);
      handleNewChat();
    } else {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - olderThanDays);
      const toDelete = chats.filter(c => new Date(c.createdAt) < cutoff);
      toDelete.forEach(chat => {
        deleteConversation(chat.id).catch(console.error);
      });
      setChats(prev => prev.filter(c => new Date(c.createdAt) >= cutoff));
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
            key={activeChatId || 'new-chat'}
            messages={currentMessages}
            chatTitle={currentChatTitle}
            chatId={activeChatId}
            sessionId={currentSessionId}
            onSessionIdChange={setCurrentSessionId}
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
        onSuccess={() => {
          // Mark feedback as given immediately so the trigger never fires again.
          // Do NOT close here — FeedbackPopup plays a 2-second success animation
          // then calls onClose() itself. Closing here would skip that animation.
          localStorage.setItem('aud-io-feedback-given', 'true');
          setFeedbackGiven(true);
        }}
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
