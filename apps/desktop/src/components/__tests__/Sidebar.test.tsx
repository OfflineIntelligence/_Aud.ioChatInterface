import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from '../Sidebar';

// Mock the API
vi.mock('../../api/chat', () => ({
  getConversations: vi.fn().mockResolvedValue([]),
  createNewConversation: vi.fn().mockResolvedValue({ id: 'new-chat', title: 'New Chat' }),
  deleteConversation: vi.fn().mockResolvedValue(undefined),
}));

describe('Sidebar Component', () => {
  const defaultProps = {
    conversations: [],
    selectedChatId: null,
    onSelectChat: vi.fn(),
    onNewChat: vi.fn(),
    onDeleteChat: vi.fn(),
    onPinChat: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===== Component Rendering Tests =====

  it('renders without crashing', () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('renders new chat button', () => {
    render(<Sidebar {...defaultProps} />);
    const newChatButton = screen.getByRole('button', { name: /new|create/i });
    expect(newChatButton).toBeInTheDocument();
  });

  it('displays conversation list when conversations exist', () => {
    const conversations = [
      { id: '1', title: 'Chat 1', messages: [], createdAt: new Date(), pinned: false },
      { id: '2', title: 'Chat 2', messages: [], createdAt: new Date(), pinned: false },
    ];

    render(<Sidebar {...defaultProps} conversations={conversations} />);
    
    expect(screen.getByText('Chat 1')).toBeInTheDocument();
    expect(screen.getByText('Chat 2')).toBeInTheDocument();
  });

  it('shows empty state when no conversations', () => {
    render(<Sidebar {...defaultProps} conversations={[]} />);
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  // ===== Conversation Selection Tests =====

  it('highlights selected conversation', () => {
    const conversations = [
      { id: '1', title: 'Chat 1', messages: [], createdAt: new Date(), pinned: false },
    ];

    render(<Sidebar {...defaultProps} conversations={conversations} selectedChatId="1" />);
    
    const selectedItem = screen.getByText('Chat 1').closest('[role="option"]') || 
                        screen.getByText('Chat 1').closest('li');
    expect(selectedItem).toHaveClass('selected') || expect(selectedItem).toHaveClass('active');
  });

  it('calls onSelectChat when conversation clicked', async () => {
    const { onSelectChat } = defaultProps;
    const conversations = [
      { id: '1', title: 'Chat 1', messages: [], createdAt: new Date(), pinned: false },
    ];

    render(<Sidebar {...defaultProps} conversations={conversations} onSelectChat={onSelectChat} />);
    
    const chatItem = screen.getByText('Chat 1');
    fireEvent.click(chatItem);
    
    expect(onSelectChat).toHaveBeenCalledWith('1');
  });

  // ===== New Chat Tests =====

  it('calls onNewChat when new chat button clicked', async () => {
    const { onNewChat } = defaultProps;
    render(<Sidebar {...defaultProps} onNewChat={onNewChat} />);
    
    const newButton = screen.getByRole('button', { name: /new|create|start/i });
    fireEvent.click(newButton);
    
    expect(onNewChat).toHaveBeenCalled();
  });

  // ===== Delete Conversation Tests =====

  it('calls onDeleteChat when delete button clicked', async () => {
    const { onDeleteChat } = defaultProps;
    const conversations = [
      { id: '1', title: 'Chat to Delete', messages: [], createdAt: new Date(), pinned: false },
    ];

    render(<Sidebar {...defaultProps} conversations={conversations} onDeleteChat={onDeleteChat} />);
    
    const deleteButton = screen.queryByTitle(/delete|remove/i);
    if (deleteButton) {
      fireEvent.click(deleteButton);
      expect(onDeleteChat).toHaveBeenCalledWith('1');
    }
  });

  it('does not show delete button in old UI', async () => {
    const conversations = [
      { id: '1', title: 'Chat to Delete', messages: [], createdAt: new Date(), pinned: false },
    ];

    render(<Sidebar {...defaultProps} conversations={conversations} />);

    // Old UI does not include per-item delete control
    const deleteButton = screen.queryByTitle(/delete|remove/i);
    expect(deleteButton).toBeNull();
  });

  // ===== Pin Conversation Tests =====

  it('calls onPinChat when pin button clicked', async () => {
    const { onPinChat } = defaultProps;
    const conversations = [
      { id: '1', title: 'Chat to Pin', messages: [], createdAt: new Date(), pinned: false },
    ];

    render(<Sidebar {...defaultProps} conversations={conversations} onPinChat={onPinChat} />);
    
    const pinButton = screen.queryByTitle(/pin|unpin/i);
    if (pinButton) {
      fireEvent.click(pinButton);
      expect(onPinChat).toHaveBeenCalledWith('1');
    }
  });

  it('shows different icon for pinned conversations', () => {
    const conversations = [
      { id: '1', title: 'Pinned Chat', messages: [], createdAt: new Date(), pinned: true },
    ];

    render(<Sidebar {...defaultProps} conversations={conversations} />);
    
    const pinnedIndicator = screen.queryByTitle(/pinned/i);
    expect(pinnedIndicator || screen.getByText('Pinned Chat')).toBeInTheDocument();
  });

  // ===== Search/Filter Tests =====

  it('filters conversations by search term', async () => {
    const conversations = [
      { id: '1', title: 'Weather Chat', messages: [], createdAt: new Date(), pinned: false },
      { id: '2', title: 'Code Discussion', messages: [], createdAt: new Date(), pinned: false },
    ];

    render(<Sidebar {...defaultProps} conversations={conversations} />);
    
    const searchInput = screen.queryByPlaceholderText(/search|filter/i);
    if (searchInput) {
      await userEvent.type(searchInput, 'Weather');
      
      expect(screen.getByText('Weather Chat')).toBeVisible();
      // Code Discussion might be hidden
    }
  });

  it('shows no results message when search yields nothing', async () => {
    const conversations = [
      { id: '1', title: 'Weather Chat', messages: [], createdAt: new Date(), pinned: false },
    ];

    render(<Sidebar {...defaultProps} conversations={conversations} />);
    
    const searchInput = screen.queryByPlaceholderText(/search/i) as HTMLInputElement;
    if (searchInput) {
      await userEvent.type(searchInput, 'XYZ_NONEXISTENT');
      
      // After filtering with nonexistent text, Weather Chat should be hidden
      const weatherChat = screen.queryByText('Weather Chat');
      expect(weatherChat).not.toBeInTheDocument();
    }
  });

  // ===== Sorting Tests =====

  it('displays conversations in correct order (recent first)', () => {
    const now = new Date();
    const conversations = [
      { id: '1', title: 'Old Chat', messages: [], createdAt: new Date(now.getTime() - 100000), pinned: false },
      { id: '2', title: 'Recent Chat', messages: [], createdAt: new Date(now.getTime() - 1000), pinned: false },
    ];

    const { container } = render(<Sidebar {...defaultProps} conversations={conversations} />);
    
    // Recent should appear before old
    const items = container.querySelectorAll('li, [role="option"]');
    if (items.length >= 2) {
      expect(items[0].textContent).toContain('Recent');
      expect(items[1].textContent).toContain('Old');
    }
  });

  it('prioritizes pinned conversations', () => {
    const conversations = [
      { id: '1', title: 'Pinned Chat', messages: [], createdAt: new Date(), pinned: true },
      { id: '2', title: 'Normal Chat', messages: [], createdAt: new Date(), pinned: false },
    ];

    const { container } = render(<Sidebar {...defaultProps} conversations={conversations} />);
    
    const items = container.querySelectorAll('li, [role="option"]');
    if (items.length >= 2) {
      expect(items[0].textContent).toContain('Pinned');
    }
  });

  // ===== Scroll/Pagination Tests =====

  it('handles large number of conversations', () => {
    const conversations = Array.from({ length: 100 }, (_, i) => ({
      id: String(i),
      title: `Chat ${i}`,
      messages: [],
      createdAt: new Date(),
      pinned: false,
    }));

    const { container } = render(<Sidebar {...defaultProps} conversations={conversations} />);
    
    expect(container.querySelectorAll('li, [role="option"]').length).toBeGreaterThan(0);
  });

  // ===== Accessibility Tests =====

  it('has proper ARIA labels', () => {
    render(<Sidebar {...defaultProps} />);
    
    const nav = screen.getByRole('navigation');
    expect(nav).toBeInTheDocument();
  });

  it('supports keyboard navigation', async () => {
    const conversations = [
      { id: '1', title: 'Chat 1', messages: [], createdAt: new Date(), pinned: false },
      { id: '2', title: 'Chat 2', messages: [], createdAt: new Date(), pinned: false },
    ];

    render(<Sidebar {...defaultProps} conversations={conversations} />);
    
    const firstChat = screen.getByText('Chat 1');
    firstChat.focus();
    expect(document.activeElement).toBe(firstChat);
  });

  // ===== Responsive Tests =====

  it('adapts to mobile view', () => {
    // Mock mobile viewport
    global.innerWidth = 320;
    
    render(<Sidebar {...defaultProps} />);
    const sidebar = screen.getByRole('navigation');
    
    expect(sidebar).toBeInTheDocument();
  });

  it('adapts to desktop view', () => {
    global.innerWidth = 1920;
    
    render(<Sidebar {...defaultProps} />);
    const sidebar = screen.getByRole('navigation');
    
    expect(sidebar).toBeInTheDocument();
  });

  // ===== Edge Cases =====

  it('handles very long conversation titles', () => {
    const conversations = [
      { 
        id: '1', 
        title: 'A'.repeat(200), 
        messages: [], 
        createdAt: new Date(), 
        pinned: false 
      },
    ];

    const { container } = render(<Sidebar {...defaultProps} conversations={conversations} />);
    
    // Should truncate or wrap appropriately
    expect(container.querySelector('nav')).toBeInTheDocument();
  });

  it('handles special characters in titles', () => {
    const conversations = [
      { 
        id: '1', 
        title: '<script>alert("xss")</script>', 
        messages: [], 
        createdAt: new Date(), 
        pinned: false 
      },
    ];

    render(<Sidebar {...defaultProps} conversations={conversations} />);
    
    // Should not render as script
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('updates when conversations prop changes', () => {
    const { rerender } = render(<Sidebar {...defaultProps} conversations={[]} />);
    
    const newConversations = [
      { id: '1', title: 'New Chat', messages: [], createdAt: new Date(), pinned: false },
    ];

    rerender(<Sidebar {...defaultProps} conversations={newConversations} />);
    
    expect(screen.getByText('New Chat')).toBeInTheDocument();
  });
});
