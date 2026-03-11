// Notification Context
// Provides global notification state management for the application

import React, { createContext, useContext, useReducer, useCallback } from 'react';

// Notification types
export type NotificationType = 'success' | 'error' | 'warning' | 'info' | 'download';

// Notification interface
export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  duration?: number; // milliseconds, 0 for persistent
  timestamp: Date;
  actions?: Array<{ label: string; onClick: () => void; isPrimary?: boolean }>;
}

// Action types
type NotificationAction =
  | { type: 'ADD_NOTIFICATION'; payload: Notification }
  | { type: 'REMOVE_NOTIFICATION'; payload: string }
  | { type: 'CLEAR_ALL' };

// State interface
interface NotificationState {
  notifications: Notification[];
}

// Initial state
const initialState: NotificationState = {
  notifications: [],
};

// Reducer
function notificationReducer(state: NotificationState, action: NotificationAction): NotificationState {
  switch (action.type) {
    case 'ADD_NOTIFICATION': {
      return {
        ...state,
        notifications: [...state.notifications, action.payload],
      };
    }
    case 'REMOVE_NOTIFICATION':
      return {
        ...state,
        notifications: state.notifications.filter(n => n.id !== action.payload),
      };
    case 'CLEAR_ALL':
      return {
        ...state,
        notifications: [],
      };
    default:
      return state;
  }
}

// Context interface
interface NotificationContextType {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp'>) => void;
  removeNotification: (id: string) => void;
  clearAllNotifications: () => void;
}

// Create context
const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

// Provider component
export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(notificationReducer, initialState);

  const addNotification = useCallback((notification: Omit<Notification, 'id' | 'timestamp'>) => {
    // Generate ID here so we can reference it in the auto-dismiss timeout
    const id = Math.random().toString(36).substring(2, 11);
    const fullNotification: Notification = {
      ...notification,
      id,
      timestamp: new Date(),
    };
    dispatch({ type: 'ADD_NOTIFICATION', payload: fullNotification });

    // Auto-remove after duration if specified
    if (notification.duration && notification.duration > 0) {
      setTimeout(() => {
        dispatch({ type: 'REMOVE_NOTIFICATION', payload: id });
      }, notification.duration);
    }
  }, []);

  const removeNotification = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_NOTIFICATION', payload: id });
  }, []);

  const clearAllNotifications = useCallback(() => {
    dispatch({ type: 'CLEAR_ALL' });
  }, []);

  const value: NotificationContextType = {
    notifications: state.notifications,
    addNotification,
    removeNotification,
    clearAllNotifications,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

// Hook to use notifications
// eslint-disable-next-line react-refresh/only-export-components
export const useNotifications = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

// Helper functions for common notification types
// eslint-disable-next-line react-refresh/only-export-components
export const useNotificationHelpers = () => {
  const { addNotification } = useNotifications();

  const showSuccess = (title: string, message: string, duration = 5000) => {
    addNotification({
      type: 'success',
      title,
      message,
      duration,
    });
  };

  const showError = (title: string, message: string, duration = 0) => {
    addNotification({
      type: 'error',
      title,
      message,
      duration,
    });
  };

  const showWarning = (title: string, message: string, duration = 7000) => {
    addNotification({
      type: 'warning',
      title,
      message,
      duration,
    });
  };

  const showInfo = (title: string, message: string, duration = 5000) => {
    addNotification({
      type: 'info',
      title,
      message,
      duration,
    });
  };

  const showDownload = (title: string, message: string, duration = 6000) => {
    addNotification({
      type: 'download',
      title,
      message,
      duration,
    });
  };

  return {
    showSuccess,
    showError,
    showWarning,
    showInfo,
    showDownload,
  };
};