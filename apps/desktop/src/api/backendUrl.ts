// Centralized backend URL management
// Resolves the dynamic port from the Tauri backend on startup

import { invoke } from '@tauri-apps/api/core';

let _backendPort: number | null = null;
let _initPromise: Promise<number> | null = null;

/** Resolve the backend port from Tauri managed state (async, cached) */
export async function getBackendPort(): Promise<number> {
    if (_backendPort !== null) {
        console.log('[backendUrl] Returning cached port:', _backendPort);
        return _backendPort;
    }
    if (_initPromise) {
        console.log('[backendUrl] Waiting for existing promise...');
        return _initPromise;
    }

    _initPromise = (async () => {
        console.log('[backendUrl] Starting port resolution...');
        
        // First, check for port override from any source
        const override = (window as any).BACKEND_PORT_OVERRIDE;
        if (override) {
            console.log(`[backendUrl] Using override from window: ${override}`);
            _backendPort = override;
            return override;
        }

        // Try Tauri IPC first
        try {
            console.log('[backendUrl] Trying Tauri IPC...');
            const port = await invoke<number>('get_backend_port');
            console.log(`[backendUrl] Got port from Tauri: ${port}`);
            _backendPort = port;
            return port;
        } catch (error) {
            console.warn('[backendUrl] Tauri IPC failed:', error);
        }

        // Fallback to default port
        console.log('[backendUrl] Using fallback port: 9999');
        _backendPort = 9999;
        return 9999;
    })();

    return _initPromise;
}

/** Get the full API base URL (async, for initial setup) */
export async function getApiBase(): Promise<string> {
    const port = await getBackendPort();
    const url = `http://localhost:${port}`;
    console.log('[backendUrl] API base:', url);
    return url;
}

/**
 * Synchronous API base getter - valid after LoadingScreen resolves the port.
 */
export function getApiBaseSync(): string {
    const port = _backendPort ?? 9999;
    return `http://localhost:${port}`;
}
