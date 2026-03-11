// ShareModal.tsx — Social share dialog, portal-rendered at document.body.
// Buttons: Copy (conversation text), X / LinkedIn / Reddit (social share URLs).

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { open as shellOpen } from '@tauri-apps/plugin-shell';

interface ShareModalProps {
    /** The assistant message text to share */
    content: string;
    onClose: () => void;
}

export function ShareModal({ content, onClose }: ShareModalProps) {
    const [copyLabel, setCopyLabel] = useState<'Copy' | 'Copied!'>('Copy');

    // Truncate to 280 chars for social previews; full text for clipboard
    const excerpt = content.length > 280 ? content.slice(0, 277) + '…' : content;
    const enc = encodeURIComponent(excerpt);

    const handleCopy = () => {
        navigator.clipboard.writeText(content).catch(console.error);
        setCopyLabel('Copied!');
        setTimeout(() => setCopyLabel('Copy'), 2000);
    };

    const socialButtons: { icon: React.ReactNode; label: string; onClick: () => void }[] = [
        {
            icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.742l7.73-8.835L1.254 2.25H8.08l4.259 5.629 5.905-5.629Zm-1.161 17.52h1.833L7.084 4.126H5.117Z" />
                </svg>
            ),
            label: 'X (Twitter)',
            onClick: () => shellOpen(`https://twitter.com/intent/tweet?text=${enc}`),
        },
        {
            icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
            ),
            label: 'LinkedIn',
            onClick: () =>
                shellOpen(
                    `https://www.linkedin.com/sharing/share-offsite/?summary=${enc}&title=AI+Response`
                ),
        },
        {
            icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
                </svg>
            ),
            label: 'Reddit',
            onClick: () =>
                shellOpen(
                    `https://www.reddit.com/submit?title=AI+Response&text=${enc}`
                ),
        },
    ];

    return createPortal(
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                style={{
                    position: 'fixed',
                    inset: 0,
                    backgroundColor: 'rgba(0,0,0,0.45)',
                    zIndex: 9998,
                }}
            />

            {/* Modal */}
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Share"
                style={{
                    position: 'fixed',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%,-50%)',
                    zIndex: 9999,
                    width: 'min(420px, 92vw)',
                    backgroundColor: 'var(--bg-modal, var(--bg-secondary))',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '16px',
                    padding: '24px',
                    boxShadow: '0 8px 40px rgba(0,0,0,0.3)',
                }}
            >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Share
                    </span>
                    <button
                        onClick={onClose}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '20px', lineHeight: 1, borderRadius: '4px' }}
                    >
                        ×
                    </button>
                </div>

                {/* Copy button — full width, prominent */}
                <button
                    onClick={handleCopy}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        width: '100%',
                        padding: '12px',
                        marginBottom: '16px',
                        borderRadius: '10px',
                        border: '1px solid var(--border-primary)',
                        backgroundColor: copyLabel === 'Copied!' ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: 600,
                        transition: 'background 0.15s',
                    }}
                >
                    {/* Link icon */}
                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round"
                            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    {copyLabel === 'Copied!' ? '✓ Copied to clipboard' : 'Copy'}
                </button>

                {/* Divider */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-primary)' }} />
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Share to</span>
                    <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-primary)' }} />
                </div>

                {/* Social buttons */}
                <div style={{ display: 'flex', gap: '10px' }}>
                    {socialButtons.map((btn) => (
                        <button
                            key={btn.label}
                            onClick={btn.onClick}
                            title={btn.label}
                            style={{
                                flex: 1,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '12px 8px',
                                borderRadius: '10px',
                                border: '1px solid var(--border-primary)',
                                backgroundColor: 'var(--bg-secondary)',
                                color: 'var(--text-primary)',
                                cursor: 'pointer',
                                fontSize: '11px',
                                fontWeight: 500,
                                transition: 'background 0.15s',
                            }}
                            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)')}
                            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')}
                        >
                            {btn.icon}
                            {btn.label}
                        </button>
                    ))}
                </div>
            </div>
        </>,
        document.body
    );
}
