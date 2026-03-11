import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getApiBaseSync } from '../api/backendUrl';
import { X, Send, MessageSquare } from 'lucide-react';

interface FeedbackPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const FeedbackPopup: React.FC<FeedbackPopupProps> = ({ isOpen, onClose, onSuccess }) => {
  const { user } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedback.trim()) { setError('Please enter your feedback'); return; }
    setIsSubmitting(true);
    setError('');
    try {
      const response = await fetch(`${getApiBaseSync()}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Name: ${name}\nEmail: ${email}\n\nFeedback:\n${feedback}`, email }),
      });
      if (response.ok) {
        setIsSubmitted(true);
        onSuccess?.();
        setTimeout(() => {
          onClose();
          setTimeout(() => { setIsSubmitted(false); setFeedback(''); }, 300);
        }, 2000);
      } else { throw new Error('Failed'); }
    } catch {
      setError('Failed to send feedback. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '9px 11px',
    borderRadius: '8px',
    border: '1px solid var(--border-primary)',
    background: 'var(--bg-tertiary)',
    color: 'var(--text-primary)',
    fontSize: '13px',
    outline: 'none',
    transition: 'border-color 0.15s ease',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  };

  return (
    <div style={{
      position: 'fixed',
      top: '50%',
      right: '24px',
      transform: 'translateY(-50%)',
      zIndex: 9999,
      maxWidth: '360px',
      width: '100%',
    }}>
      <div style={{
        background: 'var(--bg-secondary)',
        borderRadius: '16px',
        border: '1px solid var(--border-primary)',
        boxShadow: '0 16px 48px rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.08)',
        overflow: 'hidden',
        animation: 'feedbackSlideIn 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>

        {/* Header */}
        <div style={{
          padding: '14px 16px',
          borderBottom: '1px solid var(--border-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-tertiary)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '30px', height: '30px',
              borderRadius: '8px',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <MessageSquare size={14} color="var(--text-primary)" />
            </div>
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0, letterSpacing: '0.01em' }}>
                We value your feedback!
              </h3>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '1px 0 0 0' }}>
                Help us improve Aud.io
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-primary)',
              borderRadius: '6px',
              width: '26px', height: '26px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-primary)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px' }}>
          {isSubmitted ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{
                width: '44px', height: '44px', borderRadius: '50%',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 14px',
              }}>
                <Send size={20} color="var(--text-primary)" />
              </div>
              <h4 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                Thank you!
              </h4>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Your feedback has been sent successfully.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              {/* Name */}
              <div style={{ marginBottom: '10px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  style={inputStyle}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--text-primary)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-primary)'; }}
                />
              </div>

              {/* Email */}
              <div style={{ marginBottom: '10px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  style={inputStyle}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--text-primary)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-primary)'; }}
                />
              </div>

              {/* Feedback */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Your Feedback *
                </label>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Tell us what you think..."
                  rows={3}
                  style={{
                    ...inputStyle,
                    resize: 'none',
                    borderColor: error ? 'var(--danger, #ef4444)' : 'var(--border-primary)',
                  }}
                  onFocus={(e) => { if (!error) e.currentTarget.style.borderColor = 'var(--text-primary)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = error ? 'var(--danger, #ef4444)' : 'var(--border-primary)'; }}
                />
                {error && (
                  <span style={{ fontSize: '11px', color: 'var(--danger, #ef4444)', marginTop: '4px', display: 'block' }}>
                    {error}
                  </span>
                )}
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '9999px',
                  border: '1px solid var(--text-primary)',
                  background: isSubmitting ? 'transparent' : 'var(--text-primary)',
                  color: isSubmitting ? 'var(--text-muted)' : 'var(--bg-primary)',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
                  letterSpacing: '0.01em',
                }}
                onMouseEnter={(e) => { if (!isSubmitting) e.currentTarget.style.opacity = '0.85'; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
              >
                {isSubmitting ? (
                  <>
                    <div style={{
                      width: '14px', height: '14px',
                      border: '2px solid var(--border-primary)',
                      borderTop: '2px solid var(--text-primary)',
                      borderRadius: '50%',
                      animation: 'feedbackSpin 0.8s linear infinite',
                    }} />
                    Sending...
                  </>
                ) : (
                  <><Send size={14} /> Send Feedback</>
                )}
              </button>
            </form>
          )}
        </div>
      </div>

      <style>{`
        @keyframes feedbackSlideIn {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)   scale(1);    }
        }
        @keyframes feedbackSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default FeedbackPopup;
