// Sidebar: dark left navigation matching ChatGPT's structure
import React from 'react'

export const Sidebar: React.FC = () => {
  return (
    <div className="sidebar">
      {/* New Chat Button */}
      <button className="sidebar-button primary">
        <svg className="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        <span>New chat</span>
      </button>

      {/* Navigation Items */}
      <button className="sidebar-button">
        <svg className="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span>Search chats</span>
      </button>
      
      <button className="sidebar-button">
        <svg className="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span>Images</span>
      </button>

      {/* Chat History */}
      <div className="sidebar-section-title">Your chats</div>
      <div style={{flex: 1, overflowY: 'auto'}}>
        <button className="sidebar-chat-item">
          Offline Intelligence – Welcome
        </button>
        <button className="sidebar-chat-item">
          Prompt examples
        </button>
        <button className="sidebar-chat-item">
          Local LLM quick test
        </button>
      </div>

      {/* Footer */}
      <div className="sidebar-footer">
        Offline Intelligence
      </div>
    </div>
  )
}
