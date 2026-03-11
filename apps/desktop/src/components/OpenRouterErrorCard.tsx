// OpenRouterErrorCard.tsx
// Modal overlay shown when an OpenRouter API call fails with a known error type.
// Appears centered on screen with a backdrop — impossible to miss.
// Error types: insufficient_credits, context_exceeded, rate_limit, invalid_key, model_restriction, generic

import { open as shellOpen } from '@tauri-apps/plugin-shell';

interface OpenRouterErrorCardProps {
    errorType: string;
    errorMessage: string;
    onOpenModels: (focusApiKey?: boolean) => void;
    onDismiss: () => void;
}

interface ActionConfig {
    label: string;
    isPrimary: boolean;
    onClick: (props: OpenRouterErrorCardProps) => void;
}

interface ErrorConfig {
    icon: string;
    title: string;
    /** Static description shown below the title.
     *  When empty the `errorMessage` prop is used as fallback. */
    description: string;
    actions: ActionConfig[];
}

const ERROR_CONFIGS: Record<string, ErrorConfig> = {
    context_exceeded: {
        icon: '📏',
        title: 'Context Limit Exceeded',
        description:
            "This conversation exceeds the model's maximum context window. " +
            'Try a shorter message or switch to a model with a larger context window.',
        actions: [
            { label: 'Change Model', isPrimary: true, onClick: (p) => p.onOpenModels() },
        ],
    },
    insufficient_credits: {
        icon: '💳',
        title: 'Insufficient Credits',
        description:
            "Your OpenRouter account doesn't have enough credits for this model. " +
            'Add credits to continue, or switch to a free model.',
        actions: [
            {
                label: 'Add Credits',
                isPrimary: true,
                onClick: () => shellOpen('https://openrouter.ai/credits'),
            },
            { label: 'Change Model', isPrimary: false, onClick: (p) => p.onOpenModels() },
        ],
    },
    rate_limit: {
        icon: '⏱',
        title: 'Rate Limit Exceeded',
        description:
            "You've hit the rate limit for this model. " +
            'Add your own API key to get higher limits, or switch to a different model.',
        actions: [
            {
                label: 'Update API Key',
                isPrimary: true,
                onClick: (p) => p.onOpenModels(true),
            },
            { label: 'Change Model', isPrimary: false, onClick: (p) => p.onOpenModels() },
        ],
    },
    model_restriction: {
        icon: '🚫',
        title: 'Model Not Available',
        description:
            'This model has a restriction that prevents it from being used with this request. ' +
            'Try switching to a different model.',
        actions: [
            { label: 'Change Model', isPrimary: true, onClick: (p) => p.onOpenModels() },
        ],
    },
    invalid_key: {
        icon: '🔑',
        title: 'Invalid API Key',
        description:
            'Your OpenRouter API key is invalid or expired. ' +
            'Update it in the Models panel to continue.',
        actions: [
            {
                label: 'Update API Key',
                isPrimary: true,
                onClick: (p) => p.onOpenModels(true),
            },
        ],
    },
    generic: {
        icon: '⚠️',
        title: 'OpenRouter Error',
        description: '', // falls back to the errorMessage prop
        actions: [
            {
                label: 'Add Credits',
                isPrimary: true,
                onClick: () => shellOpen('https://openrouter.ai/credits'),
            },
            { label: 'Change Model', isPrimary: false, onClick: (p) => p.onOpenModels() },
        ],
    },
};

export function OpenRouterErrorCard(props: OpenRouterErrorCardProps) {
    const { errorType, errorMessage, onDismiss } = props;
    const config = ERROR_CONFIGS[errorType] ?? ERROR_CONFIGS.generic;
    const description = config.description || errorMessage;

    return (
        <>
            {/* ── Backdrop ─────────────────────────────────────────────── */}
            <div
                onClick={onDismiss}
                style={{
                    position: 'fixed',
                    inset: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.45)',
                    zIndex: 9998,
                    animation: 'orBackdropFadeIn 0.2s ease-out',
                }}
            />

            {/* ── Modal card ───────────────────────────────────────────── */}
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="or-error-title"
                style={{
                    position: 'fixed',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    zIndex: 9999,
                    width: 'min(440px, 90vw)',
                    backgroundColor: 'var(--bg-modal, var(--bg-secondary))',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '16px',
                    padding: '24px',
                    boxShadow: '0 8px 40px rgba(0,0,0,0.3)',
                    animation: 'orModalSlideIn 0.25s ease-out',
                }}
            >
                {/* ── Header ─────────────────────────────────────────────── */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        marginBottom: '12px',
                        gap: '12px',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '24px', lineHeight: 1 }}>{config.icon}</span>
                        <span
                            id="or-error-title"
                            style={{
                                fontSize: '16px',
                                fontWeight: 700,
                                color: 'var(--text-primary)',
                                lineHeight: '1.3',
                            }}
                        >
                            {config.title}
                        </span>
                    </div>

                    {/* Dismiss × */}
                    <button
                        onClick={onDismiss}
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '2px 6px',
                            color: 'var(--text-muted)',
                            fontSize: '20px',
                            lineHeight: 1,
                            borderRadius: '4px',
                            transition: 'color 0.15s',
                            flexShrink: 0,
                        }}
                        onMouseOver={(e) =>
                            (e.currentTarget.style.color = 'var(--text-primary)')
                        }
                        onMouseOut={(e) =>
                            (e.currentTarget.style.color = 'var(--text-muted)')
                        }
                        title="Dismiss"
                        aria-label="Dismiss"
                    >
                        ×
                    </button>
                </div>

                {/* ── Description ────────────────────────────────────────── */}
                <p
                    style={{
                        fontSize: '13px',
                        color: 'var(--text-secondary)',
                        margin: '0 0 20px 0',
                        lineHeight: '1.6',
                    }}
                >
                    {description}
                </p>

                {/* ── Action buttons ─────────────────────────────────────── */}
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {config.actions.map((action) => (
                        <button
                            key={action.label}
                            onClick={() => action.onClick(props)}
                            style={{
                                flex: '1 1 auto',
                                minWidth: '130px',
                                fontSize: '14px',
                                fontWeight: 600,
                                padding: '11px 20px',
                                borderRadius: '9999px',
                                backgroundColor: action.isPrimary
                                    ? 'var(--text-primary)'
                                    : 'transparent',
                                color: action.isPrimary
                                    ? 'var(--bg-primary)'
                                    : 'var(--text-secondary)',
                                border: action.isPrimary
                                    ? 'none'
                                    : '1px solid var(--border-primary)',
                                cursor: 'pointer',
                                transition: 'opacity 0.15s',
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.opacity = '0.8';
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.opacity = '1';
                            }}
                        >
                            {action.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Animations ─────────────────────────────────────────── */}
            <style>{`
                @keyframes orBackdropFadeIn {
                    from { opacity: 0; }
                    to   { opacity: 1; }
                }
                @keyframes orModalSlideIn {
                    from { opacity: 0; transform: translate(-50%, calc(-50% - 16px)); }
                    to   { opacity: 1; transform: translate(-50%, -50%); }
                }
            `}</style>
        </>
    );
}
