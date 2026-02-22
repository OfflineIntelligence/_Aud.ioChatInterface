// ErrorNavigationBox.tsx
// Displays a navigation box below error messages to help users fix model/API issues

import { useState } from 'react';

interface ErrorNavigationBoxProps {
    isOnlineMode: boolean;
    hasApiKey: boolean;
    onOpenModels: (focusApiKey?: boolean, focusHfToken?: boolean) => void;
    onToggleOnlineMode?: (online: boolean) => void;
    onDismiss: () => void;
    onApiKeyChange?: (apiKey: string) => void; // Added callback prop for API key updates
}

export function ErrorNavigationBox({
    isOnlineMode,
    hasApiKey,
    onOpenModels,
    onToggleOnlineMode,
    onDismiss,
    onApiKeyChange, // Added prop destructuring
}: ErrorNavigationBoxProps) {
    const [showApiKeyInput, setShowApiKeyInput] = useState(false);
    const [apiKeyValue, setApiKeyValue] = useState('');

    const handleApiKeySubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (apiKeyValue.trim()) {
            onApiKeyChange?.(apiKeyValue.trim());
            setApiKeyValue('');
            setShowApiKeyInput(false);
        }
    };


    return (
        <div
            className="error-navigation-box"
            style={{
                margin: '12px auto',
                maxWidth: '500px',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: '12px',
                padding: '16px',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
                animation: 'errorNavSlideIn 0.3s ease-out',
            }}
        >
            {/* Header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '12px',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '18px' }}>💡</span>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        Quick Fix
                    </span>
                </div>
                <button
                    onClick={onDismiss}
                    style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px',
                        color: 'var(--text-muted)',
                        fontSize: '18px',
                        lineHeight: 1,
                        borderRadius: '4px',
                        transition: 'color 0.2s',
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
                    onMouseOut={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                    title="Dismiss"
                >
                    ×
                </button>
            </div>

            {/* Content based on mode */}
            {isOnlineMode ? (
                // Online Mode - needs API key or model selection
                <div>
                    <p style={{
                        fontSize: '13px',
                        color: 'var(--text-secondary)',
                        margin: '0 0 14px 0',
                        lineHeight: '1.5',
                    }}>
                        {hasApiKey
                            ? 'Select a model from OpenRouter to start chatting with cloud AI.'
                            : 'Set up your OpenRouter API key to use cloud models, or try offline mode.'}
                    </p>
                    
                    {!hasApiKey && showApiKeyInput ? (
                        // Show API key input field instead of buttons
                        <form onSubmit={handleApiKeySubmit} style={{ marginBottom: '14px' }}>
                            <div style={{ position: 'relative', marginBottom: '10px' }}>
                                <input
                                    type="password"
                                    value={apiKeyValue}
                                    onChange={(e) => setApiKeyValue(e.target.value)}
                                    placeholder="Enter your OpenRouter API key..."
                                    autoFocus
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        borderRadius: '9999px', // Capsule shape
                                        border: '1px solid var(--border-primary)',
                                        backgroundColor: 'var(--bg-input)',
                                        color: 'var(--text-primary)',
                                        fontSize: '14px',
                                        outline: 'none',
                                        transition: 'all 0.2s',
                                    }}
                                    onFocus={(e) => {
                                        e.currentTarget.style.borderColor = 'var(--accent)';
                                        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.1)';
                                    }}
                                    onBlur={(e) => {
                                        e.currentTarget.style.borderColor = 'var(--border-primary)';
                                        e.currentTarget.style.boxShadow = 'none';
                                    }}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                    type="submit"
                                    disabled={!apiKeyValue.trim()}
                                    style={{
                                        flex: 1,
                                        fontSize: '13px',
                                        padding: '10px 16px',
                                        borderRadius: '9999px', // Capsule shape
                                        backgroundColor: apiKeyValue.trim() ? '#1e40af' : 'var(--bg-tertiary)',
                                        color: apiKeyValue.trim() ? 'white' : 'var(--text-muted)',
                                        border: 'none',
                                        cursor: apiKeyValue.trim() ? 'pointer' : 'not-allowed',
                                        fontWeight: 500,
                                        transition: 'background-color 0.2s',
                                    }}
                                    onMouseOver={(e) => {
                                        if (apiKeyValue.trim()) {
                                            e.currentTarget.style.backgroundColor = '#000000';
                                            e.currentTarget.style.color = 'white';
                                        }
                                    }}
                                    onMouseOut={(e) => {
                                        if (apiKeyValue.trim()) {
                                            e.currentTarget.style.backgroundColor = '#1e40af';
                                            e.currentTarget.style.color = 'white';
                                        }
                                    }}
                                >
                                    Save Key
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowApiKeyInput(false);
                                        setApiKeyValue('');
                                    }}
                                    style={{
                                        flex: 1,
                                        fontSize: '13px',
                                        padding: '10px 16px',
                                        borderRadius: '9999px', // Capsule shape
                                        backgroundColor: 'transparent',
                                        color: 'var(--text-secondary)',
                                        border: '1px solid var(--border-primary)',
                                        cursor: 'pointer',
                                        fontWeight: 500,
                                        transition: 'all 0.2s',
                                    }}
                                    onMouseOver={(e) => {
                                        e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
                                        e.currentTarget.style.color = 'var(--text-primary)';
                                    }}
                                    onMouseOut={(e) => {
                                        e.currentTarget.style.backgroundColor = 'transparent';
                                        e.currentTarget.style.color = 'var(--text-secondary)';
                                    }}
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    ) : (
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            {!hasApiKey && (
                                <button
                                    onClick={() => onOpenModels(true, false)} // Navigate to models panel with API key input focused
                                    style={{
                                        flex: '1 1 auto',
                                        minWidth: '140px',
                                        fontSize: '13px',
                                        padding: '10px 16px',
                                        borderRadius: '9999px', // Capsule shape
                                        backgroundColor: '#1e40af',
                                        color: 'white',
                                        border: 'none',
                                        cursor: 'pointer',
                                        fontWeight: 500,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px',
                                        transition: 'background-color 0.2s',
                                    }}
                                    onMouseOver={(e) => {
                                        e.currentTarget.style.backgroundColor = '#000000';
                                        e.currentTarget.style.color = 'white';
                                    }}
                                    onMouseOut={(e) => {
                                        e.currentTarget.style.backgroundColor = '#1e40af';
                                        e.currentTarget.style.color = 'white';
                                    }}
                                >
                                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                    Browse Models & Set Up API Key
                                </button>
                            )}
                            
                            {hasApiKey ? (
                                <button
                                    onClick={() => onOpenModels(false, false)} // Navigate to models panel without focusing
                                    style={{
                                        flex: '1 1 auto',
                                        minWidth: '140px',
                                        fontSize: '13px',
                                        padding: '10px 16px',
                                        borderRadius: '9999px', // Capsule shape
                                        backgroundColor: '#8B5CF6',
                                        color: 'white',
                                        border: 'none',
                                        cursor: 'pointer',
                                        fontWeight: 500,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px',
                                        transition: 'background-color 0.2s',
                                    }}
                                    onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#7C3AED')}
                                    onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#8B5CF6')}
                                >
                                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                                    </svg>
                                    Select Model
                                </button>
                            ) : (
                                <button
                                    onClick={() => onToggleOnlineMode?.(false)}
                                    style={{
                                        flex: '1 1 auto',
                                        minWidth: '140px',
                                        fontSize: '13px',
                                        padding: '10px 16px',
                                        borderRadius: '9999px', // Capsule shape
                                        backgroundColor: 'transparent',
                                        color: 'var(--text-secondary)',
                                        border: '1px solid var(--border-primary)',
                                        cursor: 'pointer',
                                        fontWeight: 500,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px',
                                        transition: 'all 0.2s',
                                    }}
                                    onMouseOver={(e) => {
                                        e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
                                        e.currentTarget.style.color = 'var(--text-primary)';
                                    }}
                                    onMouseOut={(e) => {
                                        e.currentTarget.style.backgroundColor = 'transparent';
                                        e.currentTarget.style.color = 'var(--text-secondary)';
                                    }}
                                >
                                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                    </svg>
                                    Try Offline Mode
                                </button>
                            )}
                        </div>
                    )}
                </div>
            ) : (
                // Offline Mode - needs model download
                <div>
                    <p style={{
                        fontSize: '13px',
                        color: 'var(--text-secondary)',
                        margin: '0 0 14px 0',
                        lineHeight: '1.5',
                    }}>
                        Download a model to run AI locally on your device, or switch to online mode for instant access.
                    </p>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <button
                            onClick={() => onOpenModels(false, false)} // Navigate to models panel without focusing
                            style={{
                                flex: '1 1 auto',
                                minWidth: '140px',
                                fontSize: '13px',
                                padding: '10px 16px',
                                borderRadius: '9999px', // Capsule shape
                                backgroundColor: '#1e40af',
                                color: 'white',
                                border: 'none',
                                cursor: 'pointer',
                                fontWeight: 500,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                transition: 'background-color 0.2s',
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.backgroundColor = '#000000';
                                e.currentTarget.style.color = 'white';
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.backgroundColor = '#1e40af';
                                e.currentTarget.style.color = 'white';
                            }}
                        >
                            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Get Models
                        </button>
                        <button
                            onClick={() => onToggleOnlineMode?.(true)}
                            style={{
                                flex: '1 1 auto',
                                minWidth: '140px',
                                fontSize: '13px',
                                padding: '10px 16px',
                                borderRadius: '9999px', // Capsule shape
                                backgroundColor: 'transparent',
                                color: 'var(--text-secondary)',
                                border: '1px solid var(--border-primary)',
                                cursor: 'pointer',
                                fontWeight: 500,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                transition: 'all 0.2s',
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
                                e.currentTarget.style.color = 'var(--text-primary)';
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                                e.currentTarget.style.color = 'var(--text-secondary)';
                            }}
                        >
                            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Try Online Mode
                        </button>
                    </div>
                </div>
            )}

            {/* CSS Animation */}
            <style>{`
                @keyframes errorNavSlideIn {
                    from {
                        opacity: 0;
                        transform: translateY(-10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
            `}</style>
        </div>
    );
}