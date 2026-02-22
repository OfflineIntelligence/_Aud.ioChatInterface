import React, { useState, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { getApiBaseSync } from '../api/backendUrl';
import { ArrowLeft, Send, CheckCircle, MessageSquare, HardDrive, Key } from 'lucide-react';
import { showOpenRouterApiKeyModal, showHuggingFaceApiKeyModal } from './ModelsPanel';
import { getAllApiKeys } from '../api/apiKeys';

const SettingsPanel: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onOpenModels?: (focusApiKey?: boolean, focusHfToken?: boolean) => void;
  onOpenRouterApiKeyChange?: (key: string) => void;
  onHuggingFaceTokenChange?: (token: string) => void;
  onOpenStorage?: () => void;
}> = ({ isOpen, onClose, onOpenModels, onOpenRouterApiKeyChange, onHuggingFaceTokenChange, onOpenStorage }) => {
  const { theme, toggleTheme } = useTheme();
  const { user, setApiKey } = useAuth();

  // Live API key presence indicators
  const [apiKeyStatus, setApiKeyStatus] = useState<{ openrouter: boolean; huggingface: boolean }>({
    openrouter: !!(localStorage.getItem('aud-io-openrouter-key')),
    huggingface: !!(localStorage.getItem('aud-io-hf-token')),
  });

  const refreshApiKeyStatus = () => {
    // Immediately reflect localStorage (set synchronously by the modal's save handler)
    // so the badge updates before the async backend call resolves.
    setApiKeyStatus({
      openrouter: !!(localStorage.getItem('aud-io-openrouter-key')),
      huggingface: !!(localStorage.getItem('aud-io-hf-token')),
    });
    // Then confirm with the backend DB (slight delay to let the fire-and-forget write settle)
    setTimeout(() => {
      getAllApiKeys().then(keys => {
        setApiKeyStatus({
          openrouter: keys.some(k => k.key_type === 'openrouter' && !!k.value),
          huggingface: keys.some(k => k.key_type === 'huggingface' && !!k.value),
        });
      }).catch(() => {
        // Backend not ready — localStorage snapshot is already shown, keep it
      });
    }, 400);
  };

  useEffect(() => {
    refreshApiKeyStatus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Feedback form state
  const [feedbackName, setFeedbackName] = useState(user?.name || '');
  const [feedbackEmail, setFeedbackEmail] = useState(user?.email || '');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');

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
          name: feedbackName,
          email: feedbackEmail,
          message: feedbackMessage,
          subject: `FEEDBACK from ${feedbackName || 'Anonymous'}`,
          to_email: 'product@offlineintelligence.io',
        }),
      });

      if (response.ok) {
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
                  {/* Live status badge */}
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
              <button
                className="header-button"
                onClick={() => {
                  showOpenRouterApiKeyModal(onOpenRouterApiKeyChange, setApiKey, refreshApiKeyStatus);
                }}
              >
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
              <button
                className="header-button"
                onClick={() => {
                  showHuggingFaceApiKeyModal(onHuggingFaceTokenChange, setApiKey, refreshApiKeyStatus);
                }}
              >
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
    </div>
  );
};

export default SettingsPanel;
