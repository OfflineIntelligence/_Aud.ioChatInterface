import { useState, useEffect } from 'react';
import { getApiBase } from '../api/backendUrl';
import './LoadingScreen.css';

interface LoadingScreenProps {
  children: React.ReactNode;
}

type InitStage = 'checking' | 'initializing-engine' | 'starting-backend' | 'ready' | 'error' | 'online-only';

export function LoadingScreen({ children }: LoadingScreenProps) {
  const [isReady, setIsReady] = useState(false);
  const [stage, setStage] = useState<InitStage>('checking');
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [onlineMode, setOnlineMode] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>('');

  const startHealthCheck = (isRetry: boolean = false) => {
    if (isRetry) {
      setStage('checking');
      setError(null);
      setAttempts(0);
    }

    let interval: ReturnType<typeof setInterval> | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const start = async () => {
      console.log('[LoadingScreen] Starting health check...');
      
      // Resolve the backend port first (from Tauri managed state)
      const apiBase = await getApiBase();
      console.log(`[LoadingScreen] API base resolved to: ${apiBase}`);
      setDebugInfo(`Backend: ${apiBase}`);

      setStage('initializing-engine');

      const checkBackend = async () => {
        try {
          const url = `${apiBase}/healthz`;
          console.log(`[LoadingScreen] Checking: ${url}`);
          
          const response = await fetch(url, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
          });

          console.log(`[LoadingScreen] Response status: ${response.status}`);

          if (response.ok && response.status === 200) {
            // Fix: read the body once as text, then parse — avoids the
            // "body already consumed" bug where response.text() returns ""
            // after a failed response.json() call.
            try {
              const text = await response.text();
              let accepted = false;
              try {
                const data = JSON.parse(text);
                console.log(`[LoadingScreen] Health data:`, data);
                // Health check returns: {status: "ready"|"initializing"|"degraded", runtime_ready: boolean}
                // "initializing" means Phase 3 (model auto-load) is still running — keep waiting.
                // Only proceed once the backend has finished initializing:
                //   "ready"   → model loaded and running, chat is available immediately.
                //   "degraded" → Phase 3 complete but no model loaded (user is in online mode,
                //                or has no downloaded model, or auto-load failed).
                if (data.status === 'ready' || data.status === 'degraded') {
                  accepted = true;
                }
              } catch {
                // Not JSON — check plain text (backward compat with older backend)
                console.log(`[LoadingScreen] Response text: ${text}`);
                if (text.trim() === 'OK') {
                  accepted = true;
                }
              }
              if (accepted) {
                // Backend is up — proceed immediately, no artificial delay
                setStage('ready');
                setIsReady(true);
                if (interval) clearInterval(interval);
                if (timeout) clearTimeout(timeout);
                return;
              }
            } catch (readError) {
              console.warn('[LoadingScreen] Error reading response body:', readError);
            }
          }

          setAttempts(prev => prev + 1);

          // Update stage based on attempts
          if (attempts < 30) {
            setStage('initializing-engine');
          } else {
            setStage('starting-backend');
          }
        } catch (fetchError) {
          console.error('[LoadingScreen] Fetch error:', fetchError);
          setAttempts(prev => prev + 1);
        }
      };

      // Check immediately, then every 100ms — fast enough to catch a ready
      // backend within one poll cycle without flooding the process with requests.
      checkBackend();
      interval = setInterval(checkBackend, 100);

      // Increased timeout to 180 seconds to accommodate engine initialization
      timeout = setTimeout(() => {
        if (interval) clearInterval(interval);
        setStage('error');
        setError('Backend initialization timed out. The engine may still be initializing on slow systems.');
      }, 180000);
    };

    start();
  };

  useEffect(() => {
    startHealthCheck();
  }, []);

  const handleRetry = () => {
    startHealthCheck(true);
  };

  const handleContinueOnline = () => {
    setOnlineMode(true);
    setStage('online-only');
    setIsReady(true);
  };

  if (isReady && !onlineMode) {
    return <>{children}</>;
  }

  if (isReady && onlineMode) {
    // Pass online-mode flag to children (would need context or props drilling)
    return <>{children}</>;
  }

  if (stage === 'error') {
    return (
      <div className="loading-screen error">
        <div className="loading-content">
          <div className="error-icon">⚠</div>
          <h2>Engine Initialization Issue</h2>
          <p className="error-message">{error}</p>
          <p className="debug-info" style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: '0.5rem' }}>
            {debugInfo}
          </p>
          <p className="error-hint">
            This may happen on first install or slow systems. The engine might still be downloading or initializing.
          </p>
          <div className="error-actions">
            <button
              className="retry-button primary"
              onClick={handleRetry}
            >
              Retry Initialization
            </button>
            <button
              className="online-button secondary"
              onClick={handleContinueOnline}
            >
              Continue in Online Mode
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render loading states
  return (
    <div className="loading-screen">
      <div className="loading-content">
        <div className="spinner"></div>
        <h2>Aud.io</h2>

        {stage === 'checking' && (
          <p className="loading-text">
            Checking for engine...
          </p>
        )}

        {stage === 'initializing-engine' && (
          <>
            <p className="loading-text">
              Initializing engine...
            </p>
            <p className="loading-subtext">
              This may take up to 2 minutes on first launch
            </p>
          </>
        )}

        {stage === 'starting-backend' && (
          <p className="loading-text">
            Starting backend services...
          </p>
        )}

        {stage === 'ready' && (
          <p className="loading-text">
            Ready!
          </p>
        )}

        <p className="attempts-text">
          {attempts > 0 && `Attempt ${attempts}`}
        </p>
        
        <p className="debug-info" style={{ fontSize: '0.75rem', opacity: 0.5, marginTop: '1rem' }}>
          {debugInfo}
        </p>

        <div className="loading-dots">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    </div>
  );
}
