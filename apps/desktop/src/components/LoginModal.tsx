import React, { useState, useEffect, useRef } from 'react';
import { open } from '@tauri-apps/plugin-shell';
import { useAuth } from '../contexts/AuthContext';
import {
    getApiBaseSync,
    initiateGoogleLogin,
    pollGoogleStatus,
} from '../api/auth';

interface LoginModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose }) => {
    const { login, setToken, updateUser } = useAuth();
    const [isGoogleLoading, setIsGoogleLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);

    // Holds the setTimeout handle for the polling loop so we can clean it up
    const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Clean up polling when modal closes or component unmounts
    useEffect(() => {
        if (!isOpen) {
            stopPolling();
            setIsGoogleLoading(false);
            setError(null);
            setStatusMessage(null);
        }
        return () => stopPolling();
    }, [isOpen]);

    function stopPolling() {
        if (pollingRef.current) {
            clearTimeout(pollingRef.current);
            pollingRef.current = null;
        }
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    }

    const handleGoogleSignIn = async () => {
        setError(null);
        setStatusMessage(null);
        setIsGoogleLoading(true);

        try {
            // Extract port from the backend base URL (e.g. "http://127.0.0.1:8000" → 8000)
            const baseUrl = getApiBaseSync();
            const portMatch = baseUrl.match(/:(\d+)(?:\/|$)/);
            const port = portMatch ? parseInt(portMatch[1], 10) : 8000;

            // Ask the backend to generate a Google OAuth URL
            const result = await initiateGoogleLogin(port);
            if (!result) {
                setError(
                    'Could not start Google sign-in. Make sure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are configured.'
                );
                setIsGoogleLoading(false);
                return;
            }

            // Open the auth URL in the system browser (NOT the Tauri WebView)
            await open(result.auth_url);
            setStatusMessage('Waiting for Google authentication…');

            let attempts = 0;
            const MAX_ATTEMPTS = 200; // ~5 minutes at 1.5 s intervals

            const poll = async () => {
                if (attempts >= MAX_ATTEMPTS) {
                    setError('Sign-in timed out. Please try again.');
                    setIsGoogleLoading(false);
                    setStatusMessage(null);
                    return;
                }

                const status = await pollGoogleStatus(result.state);

                if (!status) {
                    // Network error — retry
                    attempts++;
                    pollingRef.current = setTimeout(poll, 1500);
                    return;
                }

                if (status.pending) {
                    attempts++;
                    pollingRef.current = setTimeout(poll, 1500);
                    return;
                }

                // Flow complete (success or failure)
                stopPolling();
                setStatusMessage(null);

                if (status.success && status.token && status.user) {
                    setToken(status.token);
                    login(status.user.name, status.user.email);
                    // Patch the user with the real id and avatar so they survive restarts.
                    // updateUser merges into the state created by login() above.
                    updateUser({
                        id: status.user.id,
                        avatar_url: status.user.avatar_url ?? undefined,
                    });
                    setIsGoogleLoading(false);
                    onClose();
                } else {
                    setError(status.message || 'Authentication failed. Please try again.');
                    setIsGoogleLoading(false);
                }
            };

            // First poll after 1.5 s to give the browser time to open
            pollingRef.current = setTimeout(poll, 1500);

        } catch (err) {
            console.error('Google sign-in error:', err);
            setError('An unexpected error occurred. Please try again.');
            setIsGoogleLoading(false);
            stopPolling();
        }
    };

    if (!isOpen) return null;

    return (
        <div
            className="login-modal-overlay"
            style={{
                position: 'fixed',
                top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                backdropFilter: 'blur(4px)',
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                className="login-modal"
                style={{
                    backgroundColor: 'var(--bg-modal)',
                    borderRadius: '16px',
                    padding: '36px 32px 28px',
                    width: '90%',
                    maxWidth: '380px',
                    boxShadow: '0 24px 48px rgba(0, 0, 0, 0.4)',
                    border: '1px solid var(--border-primary)',
                    position: 'relative',
                }}
            >
                {/* Close button */}
                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute',
                        top: '16px', right: '16px',
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                        fontSize: '20px',
                        cursor: 'pointer',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        lineHeight: 1,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    aria-label="Close"
                >
                    ×
                </button>

                {/* App branding */}
                <div style={{ textAlign: 'center', marginBottom: '28px' }}>
                    <div style={{
                        width: '52px', height: '52px',
                        background: 'linear-gradient(135deg, #00d4aa, #0099ff)',
                        borderRadius: '14px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 16px',
                        fontSize: '24px',
                        fontWeight: 700,
                        color: '#fff',
                    }}>
                        A
                    </div>
                    <h2 style={{
                        margin: '0 0 8px',
                        fontSize: '22px',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                    }}>
                        Sign in to Aud.io
                    </h2>
                    <p style={{
                        margin: 0,
                        fontSize: '14px',
                        color: 'var(--text-muted)',
                        lineHeight: 1.5,
                    }}>
                        Sync your conversations and preferences across sessions.
                    </p>
                </div>

                {/* Error message */}
                {error && (
                    <div style={{
                        padding: '12px 14px',
                        marginBottom: '16px',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '10px',
                        color: '#fca5a5',
                        fontSize: '13px',
                        lineHeight: 1.5,
                    }}>
                        {error}
                    </div>
                )}

                {/* Status message (while waiting) */}
                {statusMessage && !error && (
                    <div style={{
                        padding: '12px 14px',
                        marginBottom: '16px',
                        backgroundColor: 'rgba(0, 153, 255, 0.1)',
                        border: '1px solid rgba(0, 153, 255, 0.25)',
                        borderRadius: '10px',
                        color: '#93c5fd',
                        fontSize: '13px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                    }}>
                        {/* Spinner */}
                        <div style={{
                            width: '14px', height: '14px',
                            border: '2px solid rgba(147, 197, 253, 0.3)',
                            borderTopColor: '#93c5fd',
                            borderRadius: '50%',
                            animation: 'spin 0.8s linear infinite',
                            flexShrink: 0,
                        }} />
                        {statusMessage}
                    </div>
                )}

                {/* Google Sign-In Button */}
                <button
                    onClick={handleGoogleSignIn}
                    disabled={isGoogleLoading}
                    className="google-signin-btn"
                    style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '12px',
                        padding: '13px 20px',
                        borderRadius: '10px',
                        border: '1px solid var(--border-primary)',
                        backgroundColor: isGoogleLoading
                            ? 'var(--bg-hover)'
                            : 'var(--bg-input)',
                        color: 'var(--text-primary)',
                        fontSize: '15px',
                        fontWeight: 500,
                        cursor: isGoogleLoading ? 'not-allowed' : 'pointer',
                        opacity: isGoogleLoading ? 0.7 : 1,
                        transition: 'background-color 0.15s, opacity 0.15s',
                        marginBottom: '16px',
                    }}
                    onMouseEnter={(e) => {
                        if (!isGoogleLoading)
                            e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                    }}
                    onMouseLeave={(e) => {
                        if (!isGoogleLoading)
                            e.currentTarget.style.backgroundColor = 'var(--bg-input)';
                    }}
                >
                    {/* Official Google "G" SVG logo */}
                    <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                        aria-hidden="true"
                    >
                        <path
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                            fill="#4285F4"
                        />
                        <path
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                            fill="#34A853"
                        />
                        <path
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                            fill="#FBBC05"
                        />
                        <path
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                            fill="#EA4335"
                        />
                    </svg>

                    {isGoogleLoading ? 'Opening Google…' : 'Continue with Google'}
                </button>

                <p style={{
                    textAlign: 'center',
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                    margin: 0,
                    lineHeight: 1.5,
                }}>
                    By signing in you agree to our{' '}
                    <span style={{ color: 'var(--accent)' }}>Terms of Service</span>
                    {' '}and{' '}
                    <span style={{ color: 'var(--accent)' }}>Privacy Policy</span>.
                </p>
            </div>
            {/* Inline spinner keyframe */}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
};

export default LoginModal;
