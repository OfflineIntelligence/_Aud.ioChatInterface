// Notification Component
// Futuristic B&W notifications with #b07dce / #f5c2e7 accent traces

import React, { useState, useEffect, useCallback } from 'react';
import { useNotifications, type Notification } from '../contexts/NotificationContext';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info, Download } from 'lucide-react';

// Per-type accent colours — everything else is B&W via CSS vars
const notificationConfig = {
  success: {
    icon: CheckCircle,
    accentBar: 'linear-gradient(180deg, #b07dce 0%, #f5c2e7 100%)',
    iconColor: '#b07dce',
  },
  error: {
    icon: AlertCircle,
    accentBar: 'var(--text-primary)',
    iconColor: 'var(--text-primary)',
  },
  warning: {
    icon: AlertTriangle,
    accentBar: '#f5c2e7',
    iconColor: '#b07dce',
  },
  info: {
    icon: Info,
    accentBar: '#b07dce',
    iconColor: '#b07dce',
  },
  download: {
    icon: Download,
    accentBar: 'linear-gradient(180deg, #b07dce 0%, #f5c2e7 100%)',
    iconColor: '#b07dce',
  },
};

const NotificationBubble: React.FC<{
  notification: Notification;
  onDismiss: (id: string) => void;
}> = ({ notification, onDismiss }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [progress, setProgress] = useState(100);

  const handleClose = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => {
      onDismiss(notification.id);
    }, 300);
  }, [notification.id, onDismiss]);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (notification.duration && notification.duration > 0) {
      const startTime = Date.now();
      const duration = notification.duration;
      const progressInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
        setProgress(remaining);
        if (remaining <= 0) {
          clearInterval(progressInterval);
          handleClose();
        }
      }, 50);
      return () => clearInterval(progressInterval);
    }
  }, [notification.duration, handleClose]);

  const config = notificationConfig[notification.type as keyof typeof notificationConfig] || notificationConfig.info;
  const Icon = config.icon;

  return (
    <div
      style={{
        position: 'relative',
        width: '320px',
        marginBottom: '10px',
        borderRadius: '12px',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.08)',
        overflow: 'hidden',
        transform: isVisible && !isExiting
          ? 'translateX(0) scale(1)'
          : isExiting
            ? 'translateX(110%) scale(0.95)'
            : 'translateX(100%) scale(0.95)',
        opacity: isVisible && !isExiting ? 1 : 0,
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        cursor: 'pointer',
      }}
      onClick={handleClose}
    >
      {/* Left accent stripe */}
      <div style={{
        position: 'absolute',
        left: 0, top: 0, bottom: 0,
        width: '3px',
        background: config.accentBar,
        borderRadius: '12px 0 0 12px',
      }} />

      {/* Content row */}
      <div style={{ padding: '12px 12px 12px 16px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>

        {/* Icon — small, borderless, just coloured */}
        <div style={{
          width: '32px', height: '32px', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: '8px',
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border-primary)',
        }}>
          <Icon size={15} color={config.iconColor} strokeWidth={2} />
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 600,
            fontSize: '13px',
            color: 'var(--text-primary)',
            marginBottom: '2px',
            lineHeight: 1.3,
            letterSpacing: '0.01em',
          }}>
            {notification.title}
          </div>
          <div style={{
            fontSize: '12px',
            color: 'var(--text-secondary)',
            lineHeight: 1.45,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}>
            {notification.message}
          </div>
          <div style={{
            fontSize: '10px',
            color: 'var(--text-muted)',
            marginTop: '5px',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            fontWeight: 500,
          }}>
            {notification.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
          {notification.actions && notification.actions.length > 0 && (
            <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}
              onClick={e => e.stopPropagation()}>
              {notification.actions.map((action, i) => (
                <button
                  key={i}
                  onClick={(e) => { e.stopPropagation(); action.onClick(); handleClose(); }}
                  style={{
                    padding: '4px 12px',
                    borderRadius: '9999px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: '1px solid var(--border-primary)',
                    background: action.isPrimary ? 'var(--text-primary)' : 'transparent',
                    color: action.isPrimary ? 'var(--bg-primary)' : 'var(--text-secondary)',
                    transition: 'opacity 0.15s',
                    letterSpacing: '0.02em',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '0.75'; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Close button */}
        <button
          onClick={(e) => { e.stopPropagation(); handleClose(); }}
          style={{
            background: 'transparent',
            border: '1px solid var(--border-primary)',
            borderRadius: '6px',
            width: '24px', height: '24px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            flexShrink: 0,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-tertiary)';
            e.currentTarget.style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--text-muted)';
          }}
        >
          <X size={12} strokeWidth={2.5} />
        </button>
      </div>

      {/* Progress bar — uses accent colour */}
      {notification.duration && notification.duration > 0 && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: '2px', background: 'var(--bg-tertiary)',
        }}>
          <div style={{
            height: '100%',
            width: `${progress}%`,
            background: config.accentBar,
            transition: 'width 0.1s linear',
          }} />
        </div>
      )}
    </div>
  );
};

const NotificationsContainer: React.FC = () => {
  const { notifications, removeNotification } = useNotifications();

  return (
    <div style={{
      position: 'fixed',
      top: '16px',
      right: '20px',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      gap: '6px',
      pointerEvents: 'none',
      maxHeight: 'calc(100vh - 32px)',
      overflowY: 'auto',
      overflowX: 'visible',
      scrollbarWidth: 'none',
    }}>
      {notifications.map((notification) => (
        <div key={notification.id} style={{ pointerEvents: 'auto' }}>
          <NotificationBubble notification={notification} onDismiss={removeNotification} />
        </div>
      ))}
    </div>
  );
};

export default NotificationsContainer;
