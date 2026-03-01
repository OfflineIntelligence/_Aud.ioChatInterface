import React, { useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useApiKeys } from '../contexts/ApiKeyContext';
import { getApiBaseSync } from '../api/backendUrl';
import { ArrowLeft, Send, CheckCircle, MessageSquare, HardDrive, Key, Eye, EyeOff } from 'lucide-react';

const SettingsPanel: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onOpenModels?: (focusApiKey?: boolean, focusHfToken?: boolean) => void;
  onOpenStorage?: () => void;
}> = ({ isOpen, onClose, onOpenModels, onOpenStorage }) => {
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();

  // Single source of truth — any key saved here is immediately reflected in
  // ModelsPanel (and vice versa) without polling or setTimeout.
  const { openRouterApiKey, hfToken, setOpenRouterApiKey, setHfToken } = useApiKeys();

  // Badge state is derived directly from context — zero-latency, always accurate.
  const apiKeyStatus = {
    openrouter: !!openRouterApiKey,
    huggingface: !!hfToken,
  };

  // Feedback form state
  const [feedbackName, setFeedbackName] = useState(user?.name || '');
  const [feedbackEmail, setFeedbackEmail] = useState(user?.email || '');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');

  // API key popup modal state
  const [keyModal, setKeyModal] = useState<'openrouter' | 'huggingface' | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);

  const openKeyModal = (type: 'openrouter' | 'huggingface') => {
    setKeyInput(type === 'openrouter' ? openRouterApiKey : hfToken);
    setShowKey(false);
    setKeyModal(type);
  };

  const saveKey = () => {
    const trimmed = keyInput.trim();
    if (keyModal === 'openrouter') setOpenRouterApiKey(trimmed);
    else setHfToken(trimmed);
    setKeyModal(null);
  };

  const removeKey = () => {
    if (keyModal === 'openrouter') setOpenRouterApiKey('');
    else setHfToken('');
    setKeyModal(null);
  };

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!feedbackMessage.trim()) {
      setFeedbackError('Please enter your feedback');
      return;
    }

    if (!feedbackEmail.trim()) {
      setFeedbackError('Please enter your email');
      return;
    }

    setIsSubmittingFeedback(true);
    setFeedbackError('');

    try {
      const response = await fetch(`${getApiBaseSync()}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: feedbackEmail,
          message: `Name: ${feedbackName || 'Anonymous'}\nEmail: ${feedbackEmail}\n\nFeedback:\n${feedbackMessage}`,
        }),
      });

      if (response.ok) {
        localStorage.setItem('aud-io-feedback-given', 'true');
        setFeedbackSubmitted(true);
        setTimeout(() => {
          setFeedbackSubmitted(false);
          setFeedbackMessage('');
        }, 3000);
      } else {
        throw new Error('Failed to submit feedback');
      }
    } catch (err) {
      setFeedbackError('Failed to send feedback. Please try again.');
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', backgroundColor: 'var(--bg-chat)' }}>
      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-bar centered">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button className="header-icon-btn" onClick={onClose} title="Back to chat">
              <ArrowLeft size={18} />
            </button>
            <h1 className="chat-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Settings
            </h1>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 16px' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          {/* Appearance Section */}
          <div className="settings-section">
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>Appearance</h2>

            {/* Theme Toggle */}
            <div className="activity-setting-row">
              <div className="activity-setting-info">
                <h3>Theme</h3>
                <p>Switch between dark and light mode</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  {theme === 'dark' ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                      </svg>
                      Dark
                    </span>
                  ) : (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                      Light
                    </span>
                  )}
                </span>
                <button
                  className={`activity-toggle ${theme === 'dark' ? 'active' : ''}`}
                  onClick={toggleTheme}
                  aria-label="Toggle theme"
                >
                  <div className="activity-toggle-thumb" />
                </button>
              </div>
            </div>
          </div>

          {/* General Section */}
            <div className="settings-section" style={{ marginTop: '32px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>General</h2>

            {/* API Key Management */}
            <div className="activity-setting-row" style={{ marginTop: '16px' }}>
              <div className="activity-setting-info">
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Key size={14} style={{ flexShrink: 0 }} />
                  OpenRouter API Key
                  {/* Live status badge — driven by context, zero latency */}
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    fontSize: '11px', fontWeight: 600, padding: '2px 8px',
                    borderRadius: '9999px',
                    backgroundColor: apiKeyStatus.openrouter ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.12)',
                    color: apiKeyStatus.openrouter ? '#16a34a' : '#dc2626',
                  }}>
                    <span style={{
                      width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0,
                      backgroundColor: apiKeyStatus.openrouter ? '#22c55e' : '#ef4444',
                    }} />
                    {apiKeyStatus.openrouter ? 'Configured' : 'Not set'}
                  </span>
                </h3>
                <p>
                  {apiKeyStatus.openrouter
                    ? 'Your OpenRouter key is active. Online models are available.'
                    : 'Add your API key to enable online AI models via OpenRouter.'}
                </p>
              </div>
              <button className="header-button" onClick={() => openKeyModal('openrouter')}>
                {apiKeyStatus.openrouter ? 'Change' : 'Add Key'}
              </button>
            </div>

            {/* HuggingFace API Key Management */}
            <div className="activity-setting-row" style={{ marginTop: '16px' }}>
              <div className="activity-setting-info">
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Key size={14} style={{ flexShrink: 0 }} />
                  HuggingFace API Token
                  {/* Live status badge */}
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    fontSize: '11px', fontWeight: 600, padding: '2px 8px',
                    borderRadius: '9999px',
                    backgroundColor: apiKeyStatus.huggingface ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.12)',
                    color: apiKeyStatus.huggingface ? '#16a34a' : '#dc2626',
                  }}>
                    <span style={{
                      width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0,
                      backgroundColor: apiKeyStatus.huggingface ? '#22c55e' : '#ef4444',
                    }} />
                    {apiKeyStatus.huggingface ? 'Configured' : 'Not set'}
                  </span>
                </h3>
                <p>
                  {apiKeyStatus.huggingface
                    ? 'Your HuggingFace token is active. Gated models can be downloaded.'
                    : 'Add your token to download gated or private HuggingFace models.'}
                </p>
              </div>
              <button className="header-button" onClick={() => openKeyModal('huggingface')}>
                {apiKeyStatus.huggingface ? 'Change' : 'Add Token'}
              </button>
            </div>
          </div>

          {/* Storage Section */}
          <div className="settings-section" style={{ marginTop: '32px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>Storage</h2>

            <div className="activity-setting-row">
              <div className="activity-setting-info">
                <h3>Local Storage</h3>
                <p>View downloaded models, storage usage, and system paths</p>
              </div>
              <button
                className="header-button"
                onClick={() => {
                  if (onOpenStorage) {
                    onOpenStorage();
                  }
                }}
              >
                View Storage
              </button>
            </div>
          </div>

          {/* About Section */}
          <div className="settings-section" style={{ marginTop: '32px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>About</h2>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
              <p>_Aud.io Chat Interface v0.1.0</p>
              <p>Offline-first AI assistant with local model support.</p>
            </div>
          </div>

          {/* Feedback Section */}
          <div className="settings-section" style={{ marginTop: '32px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MessageSquare size={18} />
              Feedback
            </h2>

            {feedbackSubmitted ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 16px',
                  }}
                >
                  <CheckCircle size={24} color="white" />
                </div>
                <h4 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  Thank you!
                </h4>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Your feedback has been sent successfully.
                </p>
              </div>
            ) : (
              <form onSubmit={handleFeedbackSubmit}>
                {/* Name Field */}
                <div style={{ marginBottom: '16px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 500,
                      color: 'var(--text-secondary)',
                      marginBottom: '6px',
                    }}
                  >
                    Name
                  </label>
                  <input
                    type="text"
                    value={feedbackName}
                    onChange={(e) => setFeedbackName(e.target.value)}
                    placeholder="Your name"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-primary)',
                      backgroundColor: 'var(--bg-input)',
                      color: 'var(--text-primary)',
                      fontSize: '14px',
                      outline: 'none',
                    }}
                  />
                </div>

                {/* Email Field */}
                <div style={{ marginBottom: '16px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 500,
                      color: 'var(--text-secondary)',
                      marginBottom: '6px',
                    }}
                  >
                    Email *
                  </label>
                  <input
                    type="email"
                    value={feedbackEmail}
                    onChange={(e) => setFeedbackEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-primary)',
                      backgroundColor: 'var(--bg-input)',
                      color: 'var(--text-primary)',
                      fontSize: '14px',
                      outline: 'none',
                    }}
                  />
                </div>

                {/* Feedback Field */}
                <div style={{ marginBottom: '16px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 500,
                      color: 'var(--text-secondary)',
                      marginBottom: '6px',
                    }}
                  >
                    Your Feedback *
                  </label>
                  <textarea
                    value={feedbackMessage}
                    onChange={(e) => setFeedbackMessage(e.target.value)}
                    placeholder="Tell us what you think..."
                    rows={4}
                    required
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${feedbackError ? '#ef4444' : 'var(--border-primary)'}`,
                      backgroundColor: 'var(--bg-input)',
                      color: 'var(--text-primary)',
                      fontSize: '14px',
                      outline: 'none',
                      resize: 'vertical',
                      fontFamily: 'inherit',
                    }}
                  />
                  {feedbackError && (
                    <span style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px', display: 'block' }}>
                      {feedbackError}
                    </span>
                  )}
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isSubmittingFeedback}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: isSubmittingFeedback ? 'var(--bg-tertiary)' : 'var(--accent)',
                    color: 'white',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: isSubmittingFeedback ? 'not-allowed' : 'pointer',
                    opacity: isSubmittingFeedback ? 0.7 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  {isSubmittingFeedback ? (
                    <>
                      <div
                        style={{
                          width: '16px',
                          height: '16px',
                          border: '2px solid rgba(255, 255, 255, 0.3)',
                          borderTop: '2px solid white',
                          borderRadius: '50%',
                          animation: 'spin 0.8s linear infinite',
                        }}
                      />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send size={16} />
                      Send Feedback
                    </>
                  )}
                </button>

                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '12px', textAlign: 'center' }}>
                  Your feedback will be sent to product@offlineintelligence.io
                </p>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* ── API Key popup modal ── */}
      {keyModal && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setKeyModal(null); }}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div style={{
            background: 'var(--bg-modal, var(--bg-secondary))',
            border: '1px solid var(--border-primary)',
            borderRadius: '16px', padding: '28px 28px 24px',
            width: '420px', maxWidth: '92vw',
            boxShadow: '0 24px 48px rgba(0,0,0,0.35)',
            position: 'relative',
          }}>
            {/* Close */}
            <button
              onClick={() => setKeyModal(null)}
              style={{
                position: 'absolute', top: '14px', right: '14px',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', fontSize: '20px', lineHeight: 1,
                padding: '4px 8px', borderRadius: '6px',
              }}
              aria-label="Close"
            >×</button>

            {/* Title */}
            <h3 style={{ margin: '0 0 6px', fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {keyModal === 'openrouter' ? 'OpenRouter API Key' : 'HuggingFace Token'}
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: '13px', color: 'var(--text-muted)' }}>
              {keyModal === 'openrouter'
                ? 'Enter your OpenRouter API key to enable online AI models.'
                : 'Enter your HuggingFace token to access gated and private models.'}
            </p>

            {/* Input */}
            <div style={{ position: 'relative' }}>
              <input
                type={showKey ? 'text' : 'password'}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveKey(); if (e.key === 'Escape') setKeyModal(null); }}
                placeholder={keyModal === 'openrouter' ? 'sk-or-v1-...' : 'hf_...'}
                autoFocus
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '10px 40px 10px 12px',
                  background: 'var(--bg-input, var(--bg-primary))',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '8px', fontSize: '14px',
                  color: 'var(--text-primary)', outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={() => setShowKey(v => !v)}
                style={{
                  position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
                  display: 'flex', alignItems: 'center', padding: 0,
                }}
                aria-label={showKey ? 'Hide key' : 'Show key'}
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '20px', justifyContent: 'flex-end' }}>
              {(keyModal === 'openrouter' ? openRouterApiKey : hfToken) && (
                <button
                  onClick={removeKey}
                  style={{
                    padding: '9px 16px', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.4)',
                    background: 'rgba(239,68,68,0.08)', color: '#ef4444',
                    fontSize: '13px', fontWeight: 600, cursor: 'pointer', marginRight: 'auto',
                  }}
                >
                  Remove
                </button>
              )}
              <button
                onClick={() => setKeyModal(null)}
                style={{
                  padding: '9px 18px', borderRadius: '8px',
                  border: '1px solid var(--border-primary)',
                  background: 'transparent', color: 'var(--text-secondary)',
                  fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={saveKey}
                disabled={!keyInput.trim()}
                style={{
                  padding: '9px 20px', borderRadius: '8px', border: 'none',
                  background: keyInput.trim() ? 'var(--accent-primary, #00d4aa)' : 'var(--bg-secondary)',
                  color: keyInput.trim() ? '#fff' : 'var(--text-muted)',
                  fontSize: '13px', fontWeight: 600,
                  cursor: keyInput.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPanel;
