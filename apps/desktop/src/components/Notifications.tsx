// Notification Component
// Displays modern bubble-style notifications in the bottom-right corner

import React, { useState, useEffect, useCallback } from 'react';
import { useNotifications, type Notification } from '../contexts/NotificationContext';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info, Download } from 'lucide-react';

// Notification type configuration
const notificationConfig = {
  success: {
    icon: CheckCircle,
    bgGradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    iconBg: 'rgba(255, 255, 255, 0.2)',
    accentColor: '#10b981',
  },
  error: {
    icon: AlertCircle,
    bgGradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
    iconBg: 'rgba(255, 255, 255, 0.2)',
    accentColor: '#ef4444',
  },
  warning: {
    icon: AlertTriangle,
    bgGradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    iconBg: 'rgba(255, 255, 255, 0.2)',
    accentColor: '#f59e0b',
  },
  info: {
    icon: Info,
    bgGradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
    iconBg: 'rgba(255, 255, 255, 0.2)',
    accentColor: '#3b82f6',
  },
  download: {
    icon: Download,
    bgGradient: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
    iconBg: 'rgba(255, 255, 255, 0.2)',
    accentColor: '#8b5cf6',
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

  // Animate in on mount
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // Handle auto-dismiss with progress bar
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
        width: '340px',
        marginBottom: '12px',
        borderRadius: '16px',
        background: 'rgba(47, 47, 47, 0.75)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05)',
        overflow: 'hidden',
        transform: isVisible && !isExiting
          ? 'translateX(0) scale(1)'
          : isExiting
            ? 'translateX(120%) scale(0.9)'
            : 'translateX(100%) scale(0.9)',
        opacity: isVisible && !isExiting ? 1 : 0,
        transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
        cursor: 'pointer',
      }}
      onClick={handleClose}
    >
      {/* Accent bar on left */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: '4px',
          background: config.bgGradient,
          borderRadius: '16px 0 0 16px',
        }}
      />

      {/* Content */}
      <div style={{ padding: '14px 14px 14px 18px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        {/* Icon container */}
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: config.bgGradient,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: `0 4px 12px ${config.accentColor}40`,
          }}
        >
          <Icon size={18} color="white" strokeWidth={2.5} />
        </div>

        {/* Text content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 600,
            fontSize: '14px',
            color: 'var(--text-primary)',
            marginBottom: '4px',
            lineHeight: 1.3,
          }}>
            {notification.title}
          </div>
          <div style={{
            fontSize: '13px',
            color: 'var(--text-secondary)',
            lineHeight: 1.4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}>
            {notification.message}
          </div>
          <div style={{
            fontSize: '11px',
            color: 'var(--text-muted)',
            marginTop: '6px',
          }}>
            {notification.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>

        {/* Close button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleClose();
          }}
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: 'none',
            borderRadius: '8px',
            width: '28px',
            height: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            flexShrink: 0,
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
            e.currentTarget.style.color = 'var(--text-muted)';
          }}
        >
          <X size={14} strokeWidth={2.5} />
        </button>
      </div>

      {/* Progress bar */}
      {notification.duration && notification.duration > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '3px',
            background: 'var(--bg-tertiary)',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progress}%`,
              background: config.bgGradient,
              transition: 'width 0.1s linear',
              borderRadius: '0 2px 2px 0',
            }}
          />
        </div>
      )}
    </div>
  );
};

const NotificationsContainer: React.FC = () => {
  const { notifications, removeNotification } = useNotifications();

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        pointerEvents: 'none',
        maxHeight: 'calc(100vh - 48px)',
        overflowY: 'auto',
        overflowX: 'visible',
        scrollbarWidth: 'none',
      }}
    >
      {notifications.map((notification) => (
        <div key={notification.id} style={{ pointerEvents: 'auto' }}>
          <NotificationBubble
            notification={notification}
            onDismiss={removeNotification}
          />
        </div>
      ))}
    </div>
  );
};

export default NotificationsContainer;
