// Root layout: sidebar + chat window with full-viewport container
import { useState, useEffect } from 'react'
import { ChatWindow } from './components/ChatWindow'
import { Sidebar } from './components/Sidebar'
import { SearchModal } from './components/SearchModal'
import type { Chat } from './components/ChatWindow'
import type { Message } from './api/chat'
// Chat persistence: Load conversations from database on mount
import { fetchConversations } from './api/chat'
import { fetchConversation } from './api/chat'
// Chat persistence: Delete conversations permanently from database
import { deleteConversation } from './api/chat'
// Chat persistence: Update pinned status in database
import { updateConversationPinned } from './api/chat'
import './App.css'

function App() {
  // Chat history: array of all chats
  const [chats, setChats] = useState<Chat[]>([]);
  
  // Active chat ID (null = new chat in progress, but we generate one when first message is sent)
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  
  // Session ID for backend persistence - generated on first message, used to link frontend chat with database session
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  
  // Current working messages (for active/new chat)
  const [currentMessages, setCurrentMessages] = useState<Message[]>([
    { role: 'system', content: 'You are a helpful assistant.' }
  ]);
  
  // Current chat title (null = not yet generated)
  const [currentChatTitle, setCurrentChatTitle] = useState<string | null>(null);

  // Search modal state for chat history search functionality
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Chat persistence: Load all saved conversations from database when app starts
  useEffect(() => {
    const loadConversations = async () => {
      const conversations = await fetchConversations();
      const loadedChats: Chat[] = conversations.map(conv => ({
        id: conv.id,
        title: conv.title,
        messages: [],  // Messages loaded on demand when chat is selected
        createdAt: new Date(conv.created_at),
        pinned: conv.pinned,
      }));
      setChats(loadedChats);
    };
    
    loadConversations();
  }, []);

  // Sync active chat's messages to history array for persistence
  // Updates chat transcript whenever user sends/receives messages
  useEffect(() => {
    if (!activeChatId) return;

    setChats(prev => prev.map(chat =>
      chat.id === activeChatId
        ? { ...chat, messages: currentMessages }
        : chat
    ));
  }, [activeChatId, currentMessages]);

  // Create new chat entry when title generated from first prompt
  // Adds chat to history and sets as active for continued conversation
  // Receives sessionId explicitly to avoid state race conditions
  const handleTitleGenerated = (title: string, sessionIdArg: string) => {
    setCurrentChatTitle(title);
    
    // Use the sessionId passed from ChatWindow to avoid React state timing issues
    const chatId = sessionIdArg;
    if (!chatId) {
      return;
    }
    
    // Create chat with title - messages will be synced via useEffect below
    const newChat: Chat = {
      id: chatId,
      title,
      messages: [], // Start empty, will be populated by the sync effect
      createdAt: new Date(),
      pinned: false
    };
    
    // Persist chat metadata immediately so the sidebar renders before messages sync
    setChats(prev => {
      return [newChat, ...prev];
    });
    setActiveChatId(chatId);
  };

  // Reset to blank conversation when "New chat" clicked
  const handleNewChat = () => {
    setActiveChatId(null);
    setCurrentSessionId(null);
    setCurrentChatTitle(null);
    setCurrentMessages([{ role: 'system', content: 'You are a helpful assistant.' }]);
  };
  
  // Load selected chat from sidebar into active view
  const handleSelectChat = async (chatId: string) => {
    const chat = chats.find(c => c.id === chatId);
    if (chat) {
      setActiveChatId(chat.id);
      setCurrentChatTitle(chat.title);
      
      // If messages not loaded yet, fetch from database
      if (chat.messages.length === 0) {
        const conversation = await fetchConversation(chatId);
        if (conversation) {
          // Add system message if not present
          const messages = conversation.messages[0]?.role === 'system' 
            ? conversation.messages 
            : [{ role: 'system' as const, content: 'You are a helpful assistant.' }, ...conversation.messages];
          
          setCurrentMessages(messages);
          
          // Update chat in state with loaded messages
          setChats(prev => prev.map(c => 
            c.id === chatId ? { ...c, messages } : c
          ));
        }
      } else {
        setCurrentMessages(chat.messages);
      }
    }
  };
  
  // Update message state and sync to history if chat saved
  const handleMessagesUpdate = (messages: Message[]) => {
    setCurrentMessages(messages);
    
    if (activeChatId) {
      setChats(prev => prev.map(chat => 
        chat.id === activeChatId 
          ? { ...chat, messages }
          : chat
      ));
    }
  };

  // Toggle pin status for a chat and persist to database
  const handlePinChat = async (chatId: string) => {
    // Get the current pinned state before optimistic update
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;
    
    // Explicit handling of undefined pinned property with ?? false
    const newPinnedState = !(chat.pinned ?? false);
    
    // Optimistically update UI first
    setChats(prev => prev.map(c =>
      c.id === chatId
        ? { ...c, pinned: newPinnedState }
        : c
    ));
    
    // Persist to database
    const success = await updateConversationPinned(chatId, newPinnedState);
    if (!success) {
      // Revert UI if persistence fails
      setChats(prev => prev.map(c =>
        c.id === chatId
          ? { ...c, pinned: !newPinnedState }
          : c
      ));
    }
  };

  // Delete a chat and reset to new chat if it was active
  // Now async to wait for database deletion before updating UI state
  const handleDeleteChat = async (chatId: string) => {
    // Delete from database first; surface failure to caller so UI can show feedback
    const success = await deleteConversation(chatId);

    if (!success) {
      // Throw error so ChatWindow can show user-facing alert
      throw new Error('Failed to delete conversation from database');
    }

    // Only remove from local state if database delete succeeded (prevents ghost chats)
    setChats(prev => prev.filter(chat => chat.id !== chatId));
    
    if (activeChatId === chatId) {
      handleNewChat();
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <Sidebar 
        chats={chats}
        activeChatId={activeChatId}
        onNewChat={handleNewChat}
        onSelectChat={handleSelectChat}
        onOpenSearch={() => setIsSearchOpen(true)} // Open search modal when sidebar search button clicked
      />
      <ChatWindow 
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
      />
      {/* Search modal for finding and navigating to past chats */}
      <SearchModal
        isOpen={isSearchOpen}
        chats={chats}
        onClose={() => setIsSearchOpen(false)}
        onSelectChat={handleSelectChat}
      />
    </div>
  )
}

export default App
