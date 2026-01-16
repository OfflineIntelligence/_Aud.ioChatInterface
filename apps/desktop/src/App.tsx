// Root layout: sidebar + chat window with full-viewport container
import { useState, useEffect } from 'react'
import { ChatWindow } from './components/ChatWindow'
import { Sidebar } from './components/Sidebar'
import { SearchModal } from './components/SearchModal'
import type { Chat } from './components/ChatWindow'
import type { Message } from './api/chat'
import './App.css'

function App() {
  // Chat history: array of all chats
  const [chats, setChats] = useState<Chat[]>([]);
  
  // Active chat ID (null = new chat in progress)
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  
  // Current working messages (for active/new chat)
  const [currentMessages, setCurrentMessages] = useState<Message[]>([
    { role: 'system', content: 'You are a helpful assistant.' }
  ]);
  
  // Current chat title (null = not yet generated)
  const [currentChatTitle, setCurrentChatTitle] = useState<string | null>(null);

  // Search modal state for chat history search functionality
  const [isSearchOpen, setIsSearchOpen] = useState(false);

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
  const handleTitleGenerated = (title: string) => {
    setCurrentChatTitle(title);
    
    const newChat: Chat = {
      id: Date.now().toString(),
      title,
      messages: currentMessages,
      createdAt: new Date()
    };
    
    setChats(prev => [newChat, ...prev]);
    setActiveChatId(newChat.id);
  };

  // Reset to blank conversation when "New chat" clicked
  const handleNewChat = () => {
    setActiveChatId(null);
    setCurrentChatTitle(null);
    setCurrentMessages([{ role: 'system', content: 'You are a helpful assistant.' }]);
  };
  
  // Load selected chat from sidebar into active view
  const handleSelectChat = (chatId: string) => {
    const chat = chats.find(c => c.id === chatId);
    if (chat) {
      setActiveChatId(chat.id);
      setCurrentChatTitle(chat.title);
      setCurrentMessages(chat.messages);
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

  // Toggle pin status for a chat
  const handlePinChat = (chatId: string) => {
    setChats(prev => prev.map(chat =>
      chat.id === chatId
        ? { ...chat, pinned: !chat.pinned }
        : chat
    ));
  };

  // Delete a chat and reset to new chat if it was active
  const handleDeleteChat = (chatId: string) => {
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
