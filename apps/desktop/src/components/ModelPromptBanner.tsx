// ModelPromptBanner.tsx
// Displays a prompt banner when no model is selected, guiding users to select a model

import { useTheme } from '../contexts/ThemeContext';

interface ModelPromptBannerProps {
    isOnlineMode: boolean;
    hasApiKey: boolean;
    /** True when at least one local model is installed (offline readiness). */
    hasLocalModel?: boolean;
    onOpenModels: (focusApiKey?: boolean, focusHfToken?: boolean) => void;
    onToggleOnlineMode?: (online: boolean) => void;
    onOpenRouterApiKeyChange?: (key: string) => void;
    setApiKey?: (provider: 'openrouter' | 'huggingface', key: string) => void;
}

export function ModelPromptBanner({
    isOnlineMode,
    hasApiKey,
    hasLocalModel = false,
    onOpenModels,
    onToggleOnlineMode,
    onOpenRouterApiKeyChange,
    setApiKey,
}: ModelPromptBannerProps) {
    const { theme } = useTheme();
    const isLightMode = theme === 'light';

    // Theme-aware hover colors
    const hoverBgColor = isLightMode ? '#000000' : '#ffffff';
    const hoverTextColor = isLightMode ? '#ffffff' : '#000000';

    return (
        <div
            className="model-prompt-banner"
            style={{
                position: 'absolute',
                bottom: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                marginBottom: '12px',
                width: 'calc(100% - 32px)',
                maxWidth: '600px',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: '12px',
                padding: '16px',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
                zIndex: 100,
                animation: 'slideUp 0.3s ease-out',
            }}
        >
            {/* Header with mode indicator */}
            {(() => {
                // Dot is green only when the current mode is fully ready.
                // Online → green if API key exists; red otherwise.
                // Offline → green if at least one local model is installed; red otherwise.
                const isReady  = isOnlineMode ? hasApiKey : hasLocalModel;
                const dotColor = isReady ? '#22C55E' : '#EF4444';
                const glowRgba = isReady
                    ? 'rgba(34, 197, 94, 0.65)'
                    : 'rgba(239, 68, 68, 0.65)';
                return (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span
                                style={{
                                    width: '10px',
                                    height: '10px',
                                    borderRadius: '50%',
                                    backgroundColor: dotColor,
                                    boxShadow: `0 0 8px ${glowRgba}`,
                                    flexShrink: 0,
                                }}
                            />
                            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                {isOnlineMode ? 'Online Mode' : 'Offline Mode'}. No Model Selected
                            </span>
                        </div>
                    </div>
                );
            })()}

            {/* Content based on mode */}
            {isOnlineMode ? (
                // Online Mode Content
                <div>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 12px 0', lineHeight: '1.5' }}>
                        {hasApiKey
                            ? 'Select a cloud model from OpenRouter to start chatting.'
                            : 'You need an OpenRouter API key to use OpenRouter models. Get one for free to access GPT-5, Kimi, and more.'}
                    </p>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                            onClick={() => onToggleOnlineMode?.(false)}
                            style={{
                                fontSize: '12px',
                                padding: '10px 14px',
                                borderRadius: '9999px', /* Capsule shape */
                                backgroundColor: 'transparent',
                                color: 'var(--text-secondary)',
                                border: '1px solid var(--border-primary)',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.backgroundColor = hoverBgColor;
                                e.currentTarget.style.color = hoverTextColor;
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                                e.currentTarget.style.color = 'var(--text-secondary)';
                            }}
                        >
                            Switch to Offline
                        </button>
                        <button
                            onClick={() => onOpenModels(true, false)}
                            style={{
                                flex: '1 1 auto',
                                fontSize: '13px',
                                padding: '10px 16px',
                                borderRadius: '9999px', /* Capsule shape */
                                backgroundColor: '#1e40af', /* Dark blue color */
                                color: 'white',
                                border: 'none',
                                cursor: 'pointer',
                                fontWeight: 500,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                transition: 'all 0.2s',
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.backgroundColor = hoverBgColor;
                                e.currentTarget.style.color = hoverTextColor;
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.backgroundColor = '#1e40af';
                                e.currentTarget.style.color = 'white';
                            }}
                        >
                            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            {hasApiKey ? 'Browse OpenRouter Models' : 'Browse Models & Get API key'}
                        </button>
                    </div>
                </div>
            ) : (
                // Offline Mode Content
                <div>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 12px 0', lineHeight: '1.5' }}>
                        Download a local model to run AI privately on your device. No internet required after download.
                    </p>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                            onClick={() => onToggleOnlineMode?.(true)}
                            style={{
                                fontSize: '12px',
                                padding: '10px 14px',
                                borderRadius: '9999px', /* Capsule shape */
                                backgroundColor: 'transparent',
                                color: 'var(--text-secondary)',
                                border: '1px solid var(--border-primary)',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.backgroundColor = hoverBgColor;
                                e.currentTarget.style.color = hoverTextColor;
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                                e.currentTarget.style.color = 'var(--text-secondary)';
                            }}
                        >
                            Try Online Mode
                        </button>
                        <button
                            onClick={() => onOpenModels(false, true)}
                            style={{
                                flex: '1 1 auto',
                                fontSize: '13px',
                                padding: '10px 16px',
                                borderRadius: '9999px', /* Capsule shape */
                                backgroundColor: '#1e40af',
                                color: 'white',
                                border: 'none',
                                cursor: 'pointer',
                                fontWeight: 500,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                transition: 'all 0.2s',
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.backgroundColor = hoverBgColor;
                                e.currentTarget.style.color = hoverTextColor;
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.backgroundColor = '#1e40af';
                                e.currentTarget.style.color = 'white';
                            }}
                        >
                            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Download & Install Models
                        </button>
                    </div>
                </div>
            )}

            {/* Subtle hint about model registry */}
            <div style={{
                marginTop: '12px',
                paddingTop: '12px',
                borderTop: '1px solid var(--border-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
            }}>
                <svg width="14" height="14" fill="none" stroke="var(--text-muted)" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Not sure what to pick? The Model Registry has recommendations based on your hardware.
                </span>
            </div>

            {/* CSS Animation */}
            <style>{`
                @keyframes slideUp {
                    from {
                        opacity: 0;
                        transform: translateX(-50%) translateY(10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateX(-50%) translateY(0);
                    }
                }
            `}</style>
        </div>
    );
}

export default ModelPromptBanner;
