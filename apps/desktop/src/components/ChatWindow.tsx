import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Message, ChatAttachment } from '../api/chat';
import { streamChat, updateConversationTitle } from '../api/chat';
import { open as tauriOpenDialog } from '@tauri-apps/plugin-dialog';
import { open as openInBrowser } from '@tauri-apps/plugin-shell';
import { getApiBaseSync } from '../api/backendUrl';
import { useChatTitle } from '../hooks/useChatTitle';
import { useAuth } from '../contexts/AuthContext';
import { SaveTranscriptDialog } from './SaveTranscriptDialog';
import { SaveTranscriptWebDialog } from './SaveTranscriptWebDialog';
import MessageContent from './MessageContent';
import { ModelPromptBanner } from './ModelPromptBanner';
import { ErrorNavigationBox } from './ErrorNavigationBox';

export interface Chat {
    id: string;
    title: string;
    messages: Message[];
    createdAt: Date;
    pinned?: boolean;
    saved?: boolean;
}

// Types for API responses used in model/file fetching
interface ModelApiEntry {
    id: string;
    name: string;
    status?: string;
    download_source?: string;
}

interface SimpleModel {
    id: string;
    name: string;
}

interface LocalFileEntry {
    id: number;
    name: string;
    path: string;
    is_directory: boolean;
    isDirectory?: boolean;
}

interface ChatWindowProps {
    messages: Message[];
    chatTitle: string | null;
    chatId: string | null;
    sessionId: string | null;
    onSessionIdChange: (sessionId: string) => void;
    isPinned?: boolean;
    onMessagesUpdate: (messages: Message[]) => void;
    onTitleGenerated?: (title: string, sessionId: string) => void;
    onPinChat?: (chatId: string) => void;
    onDeleteChat?: (chatId: string) => Promise<void>;
    onQuestionAsked: () => void;
    isOnlineMode?: boolean;
    onToggleOnlineMode?: (mode: boolean) => void;
    selectedModel?: { id: string; name: string; source: 'local' | 'openrouter' } | null;
    openRouterApiKey?: string;
    onOpenRouterApiKeyChange?: (key: string) => void;
    onSelectedModelChange?: (model: { id: string; name: string; source: 'local' | 'openrouter' } | null) => void;
    onOpenModels?: (focusApiKey?: boolean, focusHfToken?: boolean) => void;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
    messages,
    chatTitle,
    chatId,
    sessionId,
    onSessionIdChange,
    isPinned = false,
    onMessagesUpdate,
    onTitleGenerated,
    onPinChat,
    onDeleteChat,
    onQuestionAsked,
    isOnlineMode = false,
    onToggleOnlineMode,
    selectedModel,
    openRouterApiKey,
    onOpenRouterApiKeyChange,
    onSelectedModelChange,
    onOpenModels,
}) => {
    const firstPromptSent = useRef(false);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
    const [openRouterModels, setOpenRouterModels] = useState<Array<{ id: string; name: string }>>([]);
    const [localModels, setLocalModels] = useState<Array<{ id: string; name: string }>>([]);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const modelDropdownRef = useRef<HTMLDivElement>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // ── OpenRouter API-key portal modal (replaces DOM-injected showOpenRouterApiKeyModal) ──
    const [orModalStep, setOrModalStep] = useState<'none' | 'choice' | 'input'>('none');
    const [orKeyInput, setOrKeyInput] = useState('');
    const [orKeyError, setOrKeyError] = useState(false);
    const [orKeyInputError, setOrKeyInputError] = useState('');
    const orKeyRef = useRef<HTMLInputElement>(null);
    // Callbacks stored in refs so they are always up-to-date when the modal saves
    const orOnKeySavedRef = useRef<((key: string) => void) | null>(null);
    const orOnCompleteRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        if (orModalStep === 'input') setTimeout(() => orKeyRef.current?.focus(), 50);
    }, [orModalStep]);

    const closeOrModal = () => { setOrModalStep('none'); setOrKeyInput(''); setOrKeyError(false); setOrKeyInputError(''); };

    const verifyApiKey = async (keyType: 'openrouter' | 'huggingface', apiKey: string): Promise<{ valid: boolean; message: string }> => {
        try {
            const response = await fetch(`${getApiBaseSync()}/api-keys/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key_type: keyType, api_key: apiKey }),
            });
            const data = await response.json();
            return { valid: data.valid, message: data.message };
        } catch (error) {
            return { valid: false, message: 'Failed to verify API key. Please check your internet connection.' };
        }
    };

    const saveOrKey = async () => {
        const key = orKeyInput.trim();
        if (!key) { setOrKeyError(true); setTimeout(() => setOrKeyError(false), 1000); return; }
        
        // Verify the key first
        const verification = await verifyApiKey('openrouter', key);
        if (!verification.valid) {
            setOrKeyError(true);
            setOrKeyInputError(verification.message);
            setTimeout(() => { setOrKeyError(false); setOrKeyInputError(''); }, 3000);
            return;
        }
        
        setApiKey?.('openrouter', key);
        orOnKeySavedRef.current?.(key);
        closeOrModal();
        orOnCompleteRef.current?.();
    };
    const [isDeleting, setIsDeleting] = useState(false);
    const [attachedFiles, setAttachedFiles] = useState<ChatAttachment[]>([]);
    const [localFileAttachments, setLocalFileAttachments] = useState<ChatAttachment[]>([]);
    const [removingFiles, setRemovingFiles] = useState<Set<string>>(new Set());
    const { generateTitle } = useChatTitle();
    const { setApiKey } = useAuth();



    // Backend readiness state
    const [backendReady, setBackendReady] = useState(false);
    
    // @filename autocomplete state — sourced exclusively from curated files
    const [localFiles, setLocalFiles] = useState<Array<{ id: number; name: string; path: string; is_directory: boolean }>>([]);
    const [showFileAutocomplete, setShowFileAutocomplete] = useState(false);
    const [fileAutocompleteQuery, setFileAutocompleteQuery] = useState('');
    const [fileAutocompleteIndex, setFileAutocompleteIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const fileAutocompleteRef = useRef<HTMLDivElement>(null);
    // Show curated files picker panel (separate from @autocomplete)
    const [showCuratedPicker, setShowCuratedPicker] = useState(false);
    const [curatedPickerFiles, setCuratedPickerFiles] = useState<Array<{ id: number; name: string; path: string; is_directory: boolean }>>([]);
    const [curatedPickerQuery, setCuratedPickerQuery] = useState('');
    const curatedPickerRef = useRef<HTMLDivElement>(null);
    
    // Ensure we're using the most current API key from localStorage
    useEffect(() => {
        if (!openRouterApiKey && localStorage.getItem('aud-io-openrouter-key')) {
            const storedKey = localStorage.getItem('aud-io-openrouter-key');
            if (storedKey) {
                onOpenRouterApiKeyChange?.(storedKey);
            }
        }
    }, [openRouterApiKey, onOpenRouterApiKeyChange]);

    const hasMessages = messages.filter(m => m.role !== 'system').length > 0;

    // Check backend readiness with retry logic
    useEffect(() => {
        let cancelled = false;
        let timeoutId: ReturnType<typeof setTimeout>;

        const checkBackendReadiness = async (attempt: number) => {
            if (cancelled) return;
            try {
                const response = await fetch(`${getApiBaseSync()}/healthz`);
                if (cancelled) return;
                if (response.ok) {
                    // Enhanced health check: Accept both "ready" and "degraded" states
                    try {
                        const healthData = await response.json();
                        // healthData = { status: "ready" | "initializing" | "degraded", runtime_ready: boolean, message?: string }

                        // For OLLAMA-style behavior: Accept "degraded" (no model) as backend ready
                        // User can download/activate models through UI
                        if (healthData.status === 'ready' || healthData.status === 'degraded') {
                            setBackendReady(true);
                            console.log('Backend ready:', healthData.status, healthData.runtime_ready ? '(model loaded)' : '(no model loaded yet)');
                        } else if (healthData.status === 'initializing') {
                            console.log('Backend still initializing...');
                            setBackendReady(false);
                            // Retry after delay
                            const delay = Math.min(10000, 500 * Math.pow(2, attempt + 1));
                            timeoutId = setTimeout(() => checkBackendReadiness(attempt + 1), delay);
                        } else {
                            // Unknown status - retry
                            setBackendReady(false);
                            const delay = Math.min(10000, 500 * Math.pow(2, attempt + 1));
                            timeoutId = setTimeout(() => checkBackendReadiness(attempt + 1), delay);
                        }
                    } catch (parseError) {
                        // Fallback if JSON parsing fails (backward compatibility)
                        console.warn('Health check response format unexpected, assuming ready');
                        setBackendReady(true);
                    }
                } else {
                    throw new Error(`Backend health check failed with status: ${response.status}`);
                }
            } catch {
                if (cancelled) return;
                console.warn('Backend not ready yet, attempt:', attempt + 1);
                setBackendReady(false);

                // Exponential backoff: retry after progressively longer delays (max 10s)
                const delay = Math.min(10000, 500 * Math.pow(2, attempt + 1));
                timeoutId = setTimeout(() => checkBackendReadiness(attempt + 1), delay);
            }
        };

        checkBackendReadiness(0);
        return () => {
            cancelled = true;
            clearTimeout(timeoutId);
        };
    }, []);

    useEffect(() => {
        if (!chatTitle) firstPromptSent.current = false;
    }, [chatTitle]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
            if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
                setIsModelDropdownOpen(false);
            }
        };
        if (isDropdownOpen || isModelDropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [isDropdownOpen, isModelDropdownOpen]);

    // Fetch all models from the model management system (pure async - no retries)
    useEffect(() => {
        const fetchAllModels = async () => {
            try {
                // Fetch models and active model in parallel for better performance
                const [modelsResponse, activeResponse] = await Promise.all([
                    fetch(`${getApiBaseSync()}/models`),
                    fetch(`${getApiBaseSync()}/models/active`).catch(() => null)
                ]);

                if (!modelsResponse.ok) {
                    console.warn('Failed to fetch models from backend (HTTP', modelsResponse.status, ')');
                    return;
                }

                const models = await modelsResponse.json();

                // Separate OpenRouter models for the dropdown
                const orModels = models.filter((model: ModelApiEntry) =>
                    model.download_source === 'openrouter'
                );

                // Separate local models for potential use
                const locModels = models.filter((model: ModelApiEntry) =>
                    model.status === 'Installed' && model.download_source !== 'openrouter'
                );

                // Update OpenRouter models for the dropdown
                setOpenRouterModels(orModels.map((model: ModelApiEntry) => ({
                    id: model.id.replace('openrouter:', ''),
                    name: model.name
                })));

                // Update local models for the dropdown, and also detect active running model
                let localModelsList: SimpleModel[] = locModels.map((model: ModelApiEntry) => ({
                    id: model.id,
                    name: model.name
                }));

                // Normalize a model name by stripping quantization/variant suffixes so that
                // "google_gemma-3-4b-it-Q4_K_M" and "google_gemma-3-4b-it" compare equal.
                const normalizeModelName = (name: string) =>
                    name
                        .replace(/[-_\.](Q[0-9]+[_-][KM]+[_-]?[MS]?[0-9]*|q[0-9]+_[0-9]+|[0-9]+bit|gguf)[\w.-]*/gi, '')
                        .replace(/[-_\s]+$/g, '')
                        .toLowerCase();

                // Check active model from parallel fetch (parse once, reuse below)
                let activeModelData: { status?: string; model_name?: string } | null = null;
                if (activeResponse?.ok) {
                    activeModelData = await activeResponse.json().catch(() => null);
                    if (activeModelData?.status === 'loaded' && activeModelData?.model_name) {
                        const activeId = `active:${activeModelData.model_name}`;
                        // Add active model only if not already represented (compare normalised names
                        // so "gemma-3-4b-it-Q4_K_M" matches installed "gemma-3-4b-it")
                        const activeNorm = normalizeModelName(activeModelData.model_name);
                        if (!localModelsList.some((m: SimpleModel) => normalizeModelName(m.name) === activeNorm)) {
                            localModelsList = [{ id: activeId, name: `${activeModelData.model_name} (running)` }, ...localModelsList];
                        }
                    }
                }

                // Deduplicate by normalised name — backend can return same model under two IDs
                // Also catches active "(running)" variant vs the catalog entry
                const seenModelNames = new Set<string>();
                localModelsList = localModelsList.filter(m => {
                    const key = normalizeModelName(m.name);
                    return seenModelNames.has(key) ? false : (seenModelNames.add(key), true);
                });

                setLocalModels(localModelsList);

                // Validate currently selected model still exists in available list
                if (selectedModel) {
                    const allAvailableIds = [
                        ...orModels.map((m: ModelApiEntry) => m.id.replace('openrouter:', '')),
                        ...localModelsList.map((m: SimpleModel) => m.id),
                    ];
                    if (!allAvailableIds.includes(selectedModel.id)) {
                        console.warn(`Selected model "${selectedModel.id}" no longer available`);
                        // Don't auto-switch - let user choose
                        onSelectedModelChange?.(null);
                    }
                }

                // If no selected model is set for offline mode, try to detect the active running model
                if (!selectedModel && !isOnlineMode) {
                    if (locModels.length > 0) {
                        // Use first installed local model from registry
                        onSelectedModelChange?.({
                            id: locModels[0].id,
                            name: locModels[0].name,
                            source: 'local' as const
                        });
                    } else if (activeModelData?.status === 'loaded' && activeModelData?.model_name) {
                        // Use active model from already-parsed response
                        onSelectedModelChange?.({
                            id: `active:${activeModelData.model_name}`,
                            name: activeModelData.model_name,
                            source: 'local' as const
                        });
                        setLocalModels([{ id: `active:${activeModelData.model_name}`, name: activeModelData.model_name }]);
                    }
                }
            } catch (error) {
                console.error('Failed to fetch models:', error);
            }
        };

        fetchAllModels();
    }, [isOnlineMode, selectedModel, onSelectedModelChange]);

    const scrollToBottom = () => {
        if (messagesEndRef.current && typeof messagesEndRef.current.scrollIntoView === 'function') {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    };

    useEffect(() => { scrollToBottom(); }, [messages]);

    // Fetch all_files for @filename autocomplete and curated picker
    // Uses /all-files/all — user-managed RAG files for context inclusion
    const fetchCuratedFiles = React.useCallback(async () => {
        try {
            const allFilesResponse = await fetch(`${getApiBaseSync()}/all-files/all`);
            
            if (allFilesResponse.ok) {
                const allFilesData = await allFilesResponse.json();
                const allFiles = Array.isArray(allFilesData) ? allFilesData : [];
                // Filter out directories - only show files
                const filesOnly = allFiles.filter((f: LocalFileEntry) => !f.isDirectory && !f.is_directory).map((f: any) => {
                    f.source = 'all_files';
                    return f;
                });
                setLocalFiles(filesOnly);
                // Also populate curated picker files
                setCuratedPickerFiles(filesOnly);
            }
        } catch (error) {
            console.error('Failed to fetch files:', error);
        }
    }, []);

    useEffect(() => {
        if (!backendReady) return;
        fetchCuratedFiles();
    }, [backendReady, fetchCuratedFiles]);

    // Handle click outside for file autocomplete dropdown
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (fileAutocompleteRef.current && !fileAutocompleteRef.current.contains(event.target as Node) &&
                inputRef.current && !inputRef.current.contains(event.target as Node)) {
                setShowFileAutocomplete(false);
            }
        };
        if (showFileAutocomplete) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [showFileAutocomplete]);

    // Handle click outside for curated files picker panel
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (curatedPickerRef.current && !curatedPickerRef.current.contains(event.target as Node)) {
                setShowCuratedPicker(false);
            }
        };
        if (showCuratedPicker) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [showCuratedPicker]);

    // Get filtered files for autocomplete
    const filteredLocalFiles = localFiles.filter(f => 
        f.name.toLowerCase().includes(fileAutocompleteQuery.toLowerCase())
    ).slice(0, 8);

    // Handle input change with @ detection
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setInput(value);
        
        // Detect @filename pattern
        const cursorPos = e.target.selectionStart || value.length;
        const textBeforeCursor = value.slice(0, cursorPos);
        const atMatch = textBeforeCursor.match(/@(\S*)$/);
        
        if (atMatch) {
            setFileAutocompleteQuery(atMatch[1]);
            setShowFileAutocomplete(true);
            setFileAutocompleteIndex(0);
        } else {
            setShowFileAutocomplete(false);
        }
    };

    // Handle keyboard navigation in autocomplete
    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (showFileAutocomplete && filteredLocalFiles.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setFileAutocompleteIndex(prev => Math.min(prev + 1, filteredLocalFiles.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setFileAutocompleteIndex(prev => Math.max(prev - 1, 0));
            } else if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                insertFileAsAttachment(filteredLocalFiles[fileAutocompleteIndex]);
            } else if (e.key === 'Escape') {
                setShowFileAutocomplete(false);
            }
        } else if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // Fire-and-forget: ask the backend to pre-extract the given attachments NOW,
    // while the user is still typing, so the content is cached by the time Send is pressed.
    // Errors are silently swallowed — extraction will fall back to the on-demand path.
    const triggerPreprocess = (attachments: ChatAttachment[]) => {
        if (attachments.length === 0) return;
        const apiBase = getApiBaseSync();
        if (!apiBase) return;
        fetch(`${apiBase}/attachments/preprocess`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ attachments }),
        }).catch(() => {});
    };

    // Insert local_storage file as attachment (from @autocomplete).
    // Sends only the database ID — backend reads content server-side (no fetch round-trip).
    const insertFileAsAttachment = (file: { id: number; name: string }) => {
        // Avoid duplicates
        if (!localFileAttachments.some(a => a.all_files_id === file.id)) {
            const newAttachment: ChatAttachment = {
                name: file.name,
                source: 'local_storage',
                all_files_id: file.id,
            };
            setLocalFileAttachments(prev => [...prev, newAttachment]);
            console.log('[DEBUG] Queued local_storage attachment:', file.name, '(id:', file.id, ')');
            // Pre-extract in background while user types.
            triggerPreprocess([newAttachment]);
        }

        // Remove the @ query from input
        const cursorPos = inputRef.current?.selectionStart || input.length;
        const textBeforeCursor = input.slice(0, cursorPos);
        const textAfterCursor = input.slice(cursorPos);
        const atIndex = textBeforeCursor.lastIndexOf('@');
        if (atIndex >= 0) {
            let endIndex = cursorPos;
            for (let i = 0; i < textAfterCursor.length; i++) {
                if (textAfterCursor[i] === ' ' || textAfterCursor[i] === '\n') {
                    endIndex = cursorPos + i;
                    break;
                }
            }
            const newText = textBeforeCursor.slice(0, atIndex) + input.slice(endIndex);
            setInput(newText.trim());
        }
        setShowFileAutocomplete(false);
        setTimeout(() => inputRef.current?.focus(), 50);
    };

    // Insert local_storage file from folder-icon picker.
    // Sends only the database ID — backend reads content server-side (no fetch round-trip).
    const insertCuratedFileAsAttachment = (file: { id: number; name: string; is_directory: boolean }) => {
        if (file.is_directory) return;

        if (!localFileAttachments.some(a => a.all_files_id === file.id)) {
            const newAttachment: ChatAttachment = {
                name: file.name,
                source: 'local_storage',
                all_files_id: file.id,
            };
            setLocalFileAttachments(prev => [...prev, newAttachment]);
            console.log('[DEBUG] Queued local_storage attachment from picker:', file.name, '(id:', file.id, ')');
            // Pre-extract in background while user types.
            triggerPreprocess([newAttachment]);
        }

        setShowCuratedPicker(false);
        fetchCuratedFiles();
        setTimeout(() => inputRef.current?.focus(), 50);
    };

    // Remove local file attachment
    const removeLocalFileAttachment = (name: string) => {
        setLocalFileAttachments(prev => prev.filter(f => f.name !== name));
    };

    // Filtered curated picker list
    const filteredCuratedPicker = curatedPickerFiles.filter(f =>
        f.name.toLowerCase().includes(curatedPickerQuery.toLowerCase())
    );

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;
        
        // Check backend readiness before sending message
        if (!backendReady) {
            console.log('Backend not ready');
            return;
        }

        let currentSessionId = sessionId;
        if (!currentSessionId) {
            currentSessionId = Date.now().toString();
            onSessionIdChange(currentSessionId);
        }

        // Build attachment list — references only (OS paths or DB IDs).
        // Backend reads and extracts all file content server-side, for BOTH
        // offline (local LLM) and online (OpenRouter) modes.
        // No base64 encoding, no content fetching here.
        const allAttachments: ChatAttachment[] = [...attachedFiles, ...localFileAttachments];
        console.log('[DEBUG] Attachments to send:', allAttachments.length,
            '(inline:', attachedFiles.length, 'local_storage:', localFileAttachments.length, ')');
        allAttachments.forEach((a, i) =>
            console.log('[DEBUG] Attachment', i, ':', a.name, 'source:', a.source,
                'file_path:', a.file_path || '-', 'all_files_id:', a.all_files_id ?? '-'));

        // Get all file names for display in the user message annotation
        const allFileNames = allAttachments.map(a => a.name);
        const fileContext = allFileNames.length > 0
            ? `\n[Attached files: ${allFileNames.join(', ')}]`
            : '';

        const firstPrompt = !firstPromptSent.current ? input.trim() : null;

        // Determine routing — same attachments array is used for BOTH modes.
        // Backend handles server-side file extraction for offline and online.
        const useOpenRouter = isOnlineMode && selectedModel?.source === 'openrouter' && openRouterApiKey;
        const userContent = input.trim() + fileContext;
        
        const userMsg: Message = { role: 'user', content: userContent };
        const newMessages = [...messages, userMsg];

        onMessagesUpdate(newMessages);
        setInput('');
        setAttachedFiles([]);
        setLocalFileAttachments([]);
        setIsLoading(true);
        onQuestionAsked();

        if (firstPrompt && !chatTitle) {
            firstPromptSent.current = true;
            // Use the first 50 chars of the user's message as the title — same pattern
            // as ChatGPT, Claude.ai, etc. Instant, no extra LLM call, always readable.
            const firstMsgTitle = firstPrompt.slice(0, 50) + (firstPrompt.length > 50 ? '...' : '');
            updateConversationTitle(currentSessionId!, firstMsgTitle)
                .catch(err => console.error('Failed to save title:', err));
            onTitleGenerated?.(firstMsgTitle, currentSessionId!);
        }

        try {
            onMessagesUpdate([...newMessages, { role: 'assistant' as const, content: '' }]);
            let fullContent = '';

            if (useOpenRouter) {
                // Route OpenRouter through /generate/stream so the backend handles
                // server-side file extraction before forwarding to OpenRouter.
                // Strip 'openrouter:' or 'openrouter/' prefix — OpenRouter expects 'provider/model'.
                let modelIdForOpenRouter = selectedModel!.id;
                if (modelIdForOpenRouter.startsWith('openrouter:')) {
                    modelIdForOpenRouter = modelIdForOpenRouter.slice(11);
                } else if (modelIdForOpenRouter.startsWith('openrouter/')) {
                    modelIdForOpenRouter = modelIdForOpenRouter.slice(11);
                }
                for await (const chunk of streamChat(
                    newMessages,
                    currentSessionId!,
                    true,
                    modelIdForOpenRouter,
                    allAttachments.length > 0 ? allAttachments : undefined,
                    openRouterApiKey || localStorage.getItem('aud-io-openrouter-key') || undefined
                )) {
                    fullContent += chunk;
                    onMessagesUpdate([...newMessages, { role: 'assistant' as const, content: fullContent }]);
                }
            } else {
                // Route to local llama-server — backend extracts content from attachments
                for await (const chunk of streamChat(
                    newMessages,
                    currentSessionId!,
                    isOnlineMode,
                    selectedModel?.id,
                    allAttachments.length > 0 ? allAttachments : undefined,
                    undefined
                )) {
                    fullContent += chunk;
                    onMessagesUpdate([...newMessages, { role: 'assistant' as const, content: fullContent }]);
                }
            }
        } catch (error: unknown) {
            console.error('Chat error:', error);
            const errMessage = error instanceof Error ? error.message : 'Unknown error';
            let errorMsg = `An error occurred: ${errMessage}`;

            if (errMessage.includes('OpenRouter')) {
                errorMsg = `OpenRouter error: ${errMessage}`;
            } else if (errMessage.includes('fetch')) {
                if (isOnlineMode && selectedModel?.source === 'openrouter') {
                    errorMsg = 'Could not connect to the OpenRouter API. Please check your API key and internet connection.';
                } else {
                    errorMsg = 'Could not connect to the LLM backend. Make sure the model is loaded and llama-server is running on port 8001.';
                }
            }
            
            onMessagesUpdate([...newMessages, { role: 'assistant' as const, content: errorMsg }]);

        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        handleSend();
    };

    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [showWebSaveDialog, setShowWebSaveDialog] = useState(false);
    const [pendingTranscript, setPendingTranscript] = useState<string>('');
    const [pendingDefaultName, setPendingDefaultName] = useState<string>('chat.txt');

    const handleSaveTranscript = async () => {
        if (messages.length === 0) return;
        try {
            let transcript = '';
            if (chatTitle) {
                transcript += `Chat: ${chatTitle}\n`;
                transcript += `Date: ${new Date().toLocaleString()}\n`;
                transcript += '='.repeat(60) + '\n\n';
            }
            messages.filter(m => m.role !== 'system').forEach(msg => {
                const sender = msg.role === 'user' ? 'User' : 'Aud.io';
                transcript += `${sender}:\n${msg.content}\n\n`;
            });
            setPendingTranscript(transcript);
            setPendingDefaultName(`${chatTitle || 'chat'}-${new Date().toISOString().slice(0, 10)}.txt`);
            setShowWebSaveDialog(true);
        } catch (error) {
            console.error('Error saving transcript:', error);
        }
    };

    // Open Tauri native file dialog — gets real OS paths, no base64 encoding.
    // Backend reads files server-side and extracts text within a 64k-token budget.
    const handleFileUpload = async () => {
        try {
            const selected = await tauriOpenDialog({
                multiple: true,
                filters: [{
                    name: 'Supported Files',
                    extensions: [
                        'pdf', 'doc', 'docx', 'txt', 'rtf', 'odt',
                        'xls', 'xlsx', 'csv', 'ods',
                        'ppt', 'pptx', 'odp',
                        'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'cs',
                        'html', 'css', 'scss', 'json', 'xml', 'yaml', 'yml', 'md',
                        'go', 'rs', 'php', 'rb', 'swift', 'kt', 'scala', 'sql',
                        'sh', 'bat', 'ps1', 'dockerfile', 'env',
                    ],
                }],
            });
            if (!selected) return;
            const paths = Array.isArray(selected) ? selected : [selected];

            const combined = [...attachedFiles];
            for (const p of paths) {
                const name = p.replace(/.*[\\/]/, '');
                // Skip duplicates
                if (combined.some(f => f.file_path === p)) continue;
                combined.push({ name, source: 'inline', file_path: p });
            }
            if (combined.length > 16) {
                alert('You can only attach up to 16 files at a time.');
                return;
            }
            setAttachedFiles(combined);
            // Pre-extract newly added files in background while user types.
            const newFiles = combined.filter(
                f => !attachedFiles.some(a => a.file_path === f.file_path)
            );
            triggerPreprocess(newFiles);
        } catch (err) {
            console.error('File dialog error:', err);
        }
    };

    const handleRemoveFile = (fileName: string) => {
        setRemovingFiles(prev => new Set(prev).add(fileName));
        setTimeout(() => {
            setAttachedFiles(prev => prev.filter(f => f.name !== fileName));
            setRemovingFiles(prev => {
                const next = new Set(prev);
                next.delete(fileName);
                return next;
            });
        }, 250); // matches chipSlideOut animation duration
    };

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const getFileIcon = (name: string) => {
        const ext = name.split('.').pop()?.toLowerCase() || '';
        if (['pdf'].includes(ext)) return '📄';
        if (['doc', 'docx', 'rtf', 'odt', 'txt'].includes(ext)) return '📝';
        if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return '📊';
        if (['ppt', 'pptx', 'odp'].includes(ext)) return '📽️';
        if (['py'].includes(ext)) return '🐍';
        if (['js', 'ts', 'jsx', 'tsx'].includes(ext)) return '⚡';
        if (['rs'].includes(ext)) return '🦀';
        if (['go'].includes(ext)) return '🔷';
        if (['html', 'css', 'scss'].includes(ext)) return '🌐';
        if (['json', 'xml', 'yaml', 'yml'].includes(ext)) return '📋';
        if (['md'].includes(ext)) return '📑';
        if (['sh', 'bat', 'ps1'].includes(ext)) return '⚙️';
        return '📎';
    };

    // ---------------------------------------------------------------------------
    // Attachment display helpers
    // ---------------------------------------------------------------------------
    //
    // The frontend appends "\n[Attached files: name1, name2]" to user message
    // content so the names are stored for history display.  The backend injects
    // the actual file text into processed_messages for LLM context — but since
    // that injected content is NOT stored in the DB anymore (fixed in stream_api),
    // old messages may still contain "--- Content of attached file ---" blocks.
    //
    // parseUserMessage strips both the annotation tag and any injected content
    // blocks so the rendered text is clean, and returns the file-name list for
    // rendering as visual chips inside the bubble.
    const parseUserMessage = (content: string): { text: string; fileNames: string[] } => {
        // Extract file names from "[Attached files: a.txt, b.pdf]" annotation
        const annotationMatch = content.match(/\n?\[Attached files?: ([^\]]+)\]/i);
        const fileNames = annotationMatch
            ? annotationMatch[1].split(',').map(s => s.trim()).filter(Boolean)
            : [];

        const text = content
            // Remove the [Attached files: ...] annotation
            .replace(/\n?\[Attached files?: [^\]]+\]/gi, '')
            // Strip legacy injected file content blocks (stored in old DB messages)
            .replace(/\n---\s*Content of attached file:[^\n]*---\n[\s\S]*?\n---\s*End of file\s*---\n?/gi, '')
            .trim();

        return { text, fileNames };
    };

    // Helper functions to determine user setup status
    const hasOnlineCapability = !!openRouterApiKey || !!localStorage.getItem('aud-io-openrouter-key');
    const hasOfflineCapability = localModels.length > 0;

    // Determine if we should show the model prompt banner based on user's setup status
    // Show banner if no model is selected and user hasn't set up the capability for the current mode
    const showModelPromptBanner = !selectedModel && (
        (isOnlineMode && !hasOnlineCapability) ||           // Show if in online mode but no API key set up
        (!isOnlineMode && !hasOfflineCapability)            // Show if in offline mode but no local models installed
    );

    return (
        <div className="chat-window">
            <SaveTranscriptDialog
                open={showSaveDialog}
                defaultFileName={pendingDefaultName}
                content={pendingTranscript}
                onClose={() => setShowSaveDialog(false)}
                onSaved={() => setShowSaveDialog(false)}
            />
            <SaveTranscriptWebDialog
                open={showWebSaveDialog}
                defaultFileName={pendingDefaultName}
                content={pendingTranscript}
                onClose={() => setShowWebSaveDialog(false)}
                onSaved={() => setShowWebSaveDialog(false)}
            />

            {/* Header */}
            <header className="chat-header">
                <div className="chat-header-bar centered">
                    {/* Left: Chat Title or empty - Kept empty for plain appearance */}
                    <div className="chat-header-left">
                    </div>

                    {/* Right: Model indicator + Online/Offline Toggle + Save Transcript + Actions */}
                    <div className="header-actions">
                        {/* Selected Model Indicator - only show if model matches current mode */}
                        {selectedModel && ((isOnlineMode && selectedModel.source === 'openrouter') || (!isOnlineMode && selectedModel.source === 'local')) && (
                            <div style={{ position: 'relative' }} ref={modelDropdownRef}>
                                <span
                                    style={{
                                        fontSize: '12px', marginRight: '4px',
                                        padding: '6px 12px', borderRadius: '9999px',
                                        backgroundColor: 'rgb(233,233,233)',
                                        color: 'black',
                                        cursor: 'pointer',
                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                        maxWidth: '280px',
                                        flexWrap: 'wrap',
                                    }}
                                    onClick={() => {
                                        setIsModelDropdownOpen(!isModelDropdownOpen);
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = '#000000';
                                        e.currentTarget.style.color = 'white';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = 'rgb(233,233,233)';
                                        e.currentTarget.style.color = 'black';
                                    }}
                                    title={`Click to change model (${isOnlineMode ? 'Online' : 'Offline'})`}
                                >
                                    <span style={{
                                        width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0,
                                        backgroundColor: isOnlineMode
                                            ? (hasOnlineCapability ? '#22C55E' : '#EF4444')
                                            : (hasOfflineCapability ? '#22C55E' : '#EF4444'),
                                        boxShadow: isOnlineMode
                                            ? (hasOnlineCapability ? '0 0 5px rgba(34,197,94,0.7)' : '0 0 5px rgba(239,68,68,0.7)')
                                            : (hasOfflineCapability ? '0 0 5px rgba(34,197,94,0.7)' : '0 0 5px rgba(239,68,68,0.7)'),
                                    }} />
                                    {selectedModel.name}
                                </span>
                                
                                {isModelDropdownOpen && (
                                    <div className="dropdown-menu" style={{ top: '100%', marginTop: '4px', minWidth: '220px' }}>
                                        {/* Show top-9 online models if in online mode */}
                                        {isOnlineMode && openRouterModels.length > 0 && (
                                            <>
                                                <div style={{ padding: '8px 12px', fontSize: '11px', color: '#5B21B6', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--bg-tertiary)' }}>
                                                    ● Top Online Models
                                                </div>
                                                {openRouterModels.slice(0, 9).map((model) => (
                                                    <button
                                                        key={model.id}
                                                        className="dropdown-item"
                                                        style={{
                                                            fontSize: '12px',
                                                            padding: '3px 10px',
                                                            borderRadius: '999px',
                                                            backgroundColor: selectedModel.id === model.id && selectedModel.source === 'openrouter' ? '#EDE9FE' : 'var(--bg-tertiary)',
                                                            color: selectedModel.id === model.id && selectedModel.source === 'openrouter' ? '#5B21B6' : 'var(--text-secondary)',
                                                            border: 'none',
                                                            cursor: 'pointer',
                                                            textAlign: 'left',
                                                            width: '100%',
                                                            marginBottom: '4px'
                                                        }}
                                                        onClick={() => {
                                                            onSelectedModelChange?.({ id: model.id, name: model.name, source: 'openrouter' });
                                                            setIsModelDropdownOpen(false);
                                                        }}
                                                    >
                                                        <span>{model.name}</span>
                                                    </button>
                                                ))}
                                                <button
                                                    onClick={() => { setIsModelDropdownOpen(false); onOpenModels?.(); }}
                                                    style={{ display: 'block', width: '100%', padding: '6px 12px', fontSize: '11px', color: '#5B21B6', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderTop: '1px solid var(--bg-tertiary)', marginTop: '2px' }}
                                                >
                                                    View all models →
                                                </button>
                                            </>
                                        )}

                                        {/* Show top-9 local/offline models if in offline mode */}
                                        {!isOnlineMode && localModels.length > 0 && (
                                            <>
                                                <div style={{ padding: '8px 12px', fontSize: '11px', color: 'var(--text-primary)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--bg-tertiary)' }}>
                                                    ● Offline Models
                                                </div>
                                                {localModels.slice(0, 9).map((model) => (
                                                    <button
                                                        key={model.id}
                                                        className="dropdown-item"
                                                        style={{
                                                            fontSize: '12px',
                                                            padding: '3px 10px',
                                                            borderRadius: '999px',
                                                            backgroundColor: selectedModel.id === model.id && selectedModel.source === 'local' ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                                                            color: selectedModel.id === model.id && selectedModel.source === 'local' ? 'var(--text-primary)' : 'var(--text-secondary)',
                                                            border: 'none',
                                                            cursor: 'pointer',
                                                            textAlign: 'left',
                                                            width: '100%',
                                                            marginBottom: '4px'
                                                        }}
                                                        onClick={() => {
                                                            onSelectedModelChange?.({ id: model.id, name: model.name, source: 'local' });
                                                            setIsModelDropdownOpen(false);
                                                        }}
                                                    >
                                                        <span>{model.name}</span>
                                                    </button>
                                                ))}
                                                {localModels.length > 9 && (
                                                    <button
                                                        onClick={() => { setIsModelDropdownOpen(false); onOpenModels?.(); }}
                                                        style={{ display: 'block', width: '100%', padding: '6px 12px', fontSize: '11px', color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderTop: '1px solid var(--bg-tertiary)', marginTop: '2px' }}
                                                    >
                                                        View all models →
                                                    </button>
                                                )}
                                            </>
                                        )}

                                        {/* Show message if no models available */}
                                        {isOnlineMode && openRouterModels.length === 0 && (
                                            <div style={{ padding: '12px', fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center' }}>
                                                <p style={{ margin: '0 0 8px 0' }}>No online models available.</p>
                                                <p style={{ margin: '0 0 8px 0', fontSize: '11px', color: 'var(--text-muted)' }}>Add an OpenRouter API key to use cloud models.</p>
                                                <button
                                                    onClick={() => { setIsModelDropdownOpen(false); onOpenModels?.(); }}
                                                    style={{ fontSize: '12px', padding: '6px 16px', borderRadius: '9999px', backgroundColor: '#1e40af', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 500 }}
                                                >
                                                    Browse Models
                                                </button>
                                            </div>
                                        )}
                                        {!isOnlineMode && localModels.length === 0 && (
                                            <div style={{ padding: '12px', fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center' }}>
                                                <p style={{ margin: '0 0 8px 0' }}>No offline models installed.</p>
                                                <p style={{ margin: '0 0 8px 0', fontSize: '11px', color: 'var(--text-muted)' }}>Download models to use them locally without internet.</p>
                                                <button
                                                    onClick={() => { setIsModelDropdownOpen(false); onOpenModels?.(); }}
                                                    style={{ fontSize: '12px', padding: '6px 16px', borderRadius: '9999px', backgroundColor: '#1e40af', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 500 }}
                                                >
                                                    Browse & Download
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                        
                        {/* Show capsule with dropdown when no model matches current mode */}
                        {(!selectedModel || (isOnlineMode && selectedModel?.source !== 'openrouter') || (!isOnlineMode && selectedModel?.source !== 'local')) && (
                            <div style={{ position: 'relative' }} ref={modelDropdownRef}>
                                <span
                                    style={{
                                        fontSize: '12px', marginRight: '4px',
                                        padding: '6px 12px', borderRadius: '9999px',
                                        backgroundColor: 'rgb(233,233,233)',
                                        color: 'black',
                                        cursor: 'pointer',
                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                    }}
                                    onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = '#000000';
                                        e.currentTarget.style.color = 'white';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = 'rgb(233,233,233)';
                                        e.currentTarget.style.color = 'black';
                                    }}
                                    title="Click to select a model"
                                >
                                    <span style={{
                                        width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0,
                                        backgroundColor: isOnlineMode
                                            ? (hasOnlineCapability ? '#22C55E' : '#EF4444')
                                            : (hasOfflineCapability ? '#22C55E' : '#EF4444'),
                                        boxShadow: isOnlineMode
                                            ? (hasOnlineCapability ? '0 0 5px rgba(34,197,94,0.7)' : '0 0 5px rgba(239,68,68,0.7)')
                                            : (hasOfflineCapability ? '0 0 5px rgba(34,197,94,0.7)' : '0 0 5px rgba(239,68,68,0.7)'),
                                    }} />
                                    Browse Models
                                </span>
                                {isModelDropdownOpen && (
                                    <div className="dropdown-menu" style={{ top: '100%', marginTop: '4px', minWidth: '220px' }}>
                                        {isOnlineMode && openRouterModels.length > 0 && (
                                            <>
                                                <div style={{ padding: '8px 12px', fontSize: '11px', color: '#5B21B6', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--bg-tertiary)' }}>
                                                    ● Top Online Models
                                                </div>
                                                {openRouterModels.slice(0, 9).map((model) => (
                                                    <button
                                                        key={model.id}
                                                        className="dropdown-item"
                                                        style={{ fontSize: '12px', padding: '6px 12px', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%', marginBottom: '2px' }}
                                                        onClick={() => {
                                                            onSelectedModelChange?.({ id: model.id, name: model.name, source: 'openrouter' });
                                                            setIsModelDropdownOpen(false);
                                                        }}
                                                    >
                                                        <span>{model.name}</span>
                                                    </button>
                                                ))}
                                                <button
                                                    onClick={() => { setIsModelDropdownOpen(false); onOpenModels?.(); }}
                                                    style={{ display: 'block', width: '100%', padding: '6px 12px', fontSize: '11px', color: '#5B21B6', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderTop: '1px solid var(--bg-tertiary)', marginTop: '2px' }}
                                                >
                                                    View all models →
                                                </button>
                                            </>
                                        )}
                                        {!isOnlineMode && localModels.length > 0 && (
                                            <>
                                                <div style={{ padding: '8px 12px', fontSize: '11px', color: 'var(--text-primary)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--bg-tertiary)' }}>
                                                    ● Offline Models
                                                </div>
                                                {localModels.slice(0, 9).map((model) => (
                                                    <button
                                                        key={model.id}
                                                        className="dropdown-item"
                                                        style={{ fontSize: '12px', padding: '6px 12px', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%', marginBottom: '2px' }}
                                                        onClick={() => {
                                                            onSelectedModelChange?.({ id: model.id, name: model.name, source: 'local' });
                                                            setIsModelDropdownOpen(false);
                                                        }}
                                                    >
                                                        <span>{model.name}</span>
                                                    </button>
                                                ))}
                                                {localModels.length > 9 && (
                                                    <button
                                                        onClick={() => { setIsModelDropdownOpen(false); onOpenModels?.(); }}
                                                        style={{ display: 'block', width: '100%', padding: '6px 12px', fontSize: '11px', color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderTop: '1px solid var(--bg-tertiary)', marginTop: '2px' }}
                                                    >
                                                        View all models →
                                                    </button>
                                                )}
                                            </>
                                        )}
                                        {((isOnlineMode && openRouterModels.length === 0) || (!isOnlineMode && localModels.length === 0)) && (
                                            <div style={{ padding: '12px', fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center' }}>
                                                <p style={{ margin: '0 0 8px 0' }}>{isOnlineMode ? 'No online models available.' : 'No offline models installed.'}</p>
                                                <button
                                                    onClick={() => { setIsModelDropdownOpen(false); onOpenModels?.(); }}
                                                    style={{ fontSize: '12px', padding: '6px 16px', borderRadius: '9999px', backgroundColor: isOnlineMode ? '#6366F1' : '#1e40af', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 500 }}
                                                >
                                                    {isOnlineMode ? 'Open Models Panel' : 'Browse & Download'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Online/Offline Toggle */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '8px' }}>
                            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                {isOnlineMode ? 'Online' : 'Offline'}
                            </span>
                            <button
                                type="button"
                                className={`activity-toggle ${isOnlineMode ? 'active' : ''}`}
                                onClick={() => {
                                    // Check if API key exists in localStorage but not in props
                                    const localStorageApiKey = localStorage.getItem('aud-io-openrouter-key');
                                    const hasApiKey = openRouterApiKey || localStorageApiKey;
                                    
                                    if (isOnlineMode) {
                                        // Switching to OFFLINE: auto-select a local model if currently using openrouter
                                        if (selectedModel?.source === 'openrouter' && localModels.length > 0) {
                                            onSelectedModelChange?.({
                                                id: localModels[0].id,
                                                name: localModels[0].name,
                                                source: 'local'
                                            });
                                        }
                                        onToggleOnlineMode?.(false);
                                        return;
                                    }

                                    if (!isOnlineMode && !hasApiKey) {
                                        // No API key — open the portal modal.
                                        // Callbacks are stored in refs so they stay current.
                                        orOnKeySavedRef.current = (newKey) => { onOpenRouterApiKeyChange?.(newKey); };
                                        orOnCompleteRef.current = () => {
                                            if (selectedModel?.source === 'local' && openRouterModels.length > 0) {
                                                onSelectedModelChange?.({
                                                    id: openRouterModels[0].id,
                                                    name: openRouterModels[0].name,
                                                    source: 'openrouter',
                                                });
                                            }
                                            onToggleOnlineMode?.(true);
                                        };
                                        setOrModalStep('choice');
                                    } else {
                                        // Switching to ONLINE with existing API key
                                        if (!openRouterApiKey && localStorage.getItem('aud-io-openrouter-key')) {
                                            const storedKey = localStorage.getItem('aud-io-openrouter-key');
                                            if (storedKey) {
                                                onOpenRouterApiKeyChange?.(storedKey);
                                            }
                                        }
                                        // Auto-select an OpenRouter model if currently using local
                                        if (selectedModel?.source === 'local' && openRouterModels.length > 0) {
                                            onSelectedModelChange?.({
                                                id: openRouterModels[0].id,
                                                name: openRouterModels[0].name,
                                                source: 'openrouter'
                                            });
                                        }
                                        onToggleOnlineMode?.(true);
                                    }
                                }}
                                title={isOnlineMode ? 'Switch to offline mode (local model)' : 'Switch to online mode (web search + APIs)'}
                                style={{ width: '36px', height: '20px', borderRadius: '10px' }}
                            >
                                <div className="activity-toggle-thumb" style={{ width: '16px', height: '16px', top: '2px', left: '2px', transform: isOnlineMode ? 'translateX(16px)' : 'none' }} />
                            </button>
                        </div>

                        {/* Download/Save Transcript Button */}
                        {hasMessages && (
                            <button
                                type="button"
                                className="header-capsule-btn"
                                onClick={handleSaveTranscript}
                                title="Save transcript"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                            >
                                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                <span>Save</span>
                            </button>
                        )}

                        {chatId && (
                            <div style={{ position: 'relative' }} ref={dropdownRef}>
                                <button
                                    type="button"
                                    className="header-capsule-btn"
                                    aria-label="More options"
                                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                >
                                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 8a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 8a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
                                    </svg>
                                </button>
                                {isDropdownOpen && (
                                    <div className="dropdown-menu">
                                        <button className="dropdown-item" onClick={() => { onPinChat?.(chatId); setIsDropdownOpen(false); }}>
                                            <svg className="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                                            </svg>
                                            <span>{isPinned ? 'Unpin chat' : 'Pin chat'}</span>
                                        </button>
                                        <button className="dropdown-item delete" onClick={() => setShowDeleteConfirm(true)}>
                                            <svg className="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                            <span>Delete</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* Body — flex wrapper so we can center messages+input together in welcome mode */}
            <div className={`chat-body${!hasMessages ? ' welcome-mode' : ''}`}>

            {/* Messages Area */}
            <main className="chat-messages">
                <div className="chat-messages-container">
                    {/* Welcome Screen */}
                    {!hasMessages && (
                        <div className="chat-welcome">
                            <h1 className="chat-welcome-title">
                                <svg width="32" height="32" viewBox="0 0 40 40" fill="none" className="chat-welcome-logo-inline">
                                    <polygon points="20,4 36,36 4,36" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinejoin="round" />
                                </svg>
                                <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>|</span> Chat Interface
                            </h1>
                            <p className="chat-welcome-subtitle">Ask anything to get started</p>


                        </div>
                    )}

                    {messages.filter(m => m.role !== 'system').map((msg, idx) => {
                        if (msg.role === 'user') {
                            const { text, fileNames } = parseUserMessage(msg.content);
                            return (
                                <div key={idx} className="message-wrapper user">
                                    <div className="message-user-group">
                                        {/* File attachment cards — shown above the message bubble, like Perplexity/DeepSeek */}
                                        {fileNames.length > 0 && (
                                            <div className="message-file-cards">
                                                {fileNames.map((name, i) => (
                                                    <div key={i} className="message-file-card">
                                                        <span className="message-file-card-icon">{getFileIcon(name)}</span>
                                                        <span className="message-file-card-name">{name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        <div className="message-bubble user">
                                            <MessageContent content={text} role="user" />
                                        </div>
                                    </div>
                                </div>
                            );
                        }
                        return (
                            <div key={idx} className="message-wrapper assistant">
                                <div className="message-content-plain">
                                    <MessageContent content={msg.content} role="assistant" />
                                </div>
                            </div>
                        );
                    })}
                    {isLoading && (
                        <div className="message-wrapper assistant">
                            <div className="loading-bubble">
                                <div className="loading-dot" />
                                <div className="loading-dot" />
                                <div className="loading-dot" />
                            </div>
                        </div>
                    )}
                    
                    <div ref={messagesEndRef} />
                </div>
            </main>

            {/* Input Bar - no footer compartment */}
            <div className="chat-input-bar" style={{ position: 'relative' }}>
                {/* Model Prompt Banner — in welcome mode this is ordered BELOW the form via CSS */}
                {showModelPromptBanner && (
                    <div className="model-prompt-banner-wrapper">
                        <ModelPromptBanner
                            isOnlineMode={isOnlineMode}
                            hasApiKey={!!(openRouterApiKey || localStorage.getItem('aud-io-openrouter-key'))}
                            hasLocalModel={hasOfflineCapability}
                            onOpenModels={(focusApiKey = false, focusHfToken = false) => onOpenModels?.(focusApiKey, focusHfToken)}
                            onToggleOnlineMode={onToggleOnlineMode}
                        />
                    </div>
                )}
                {/* Attachment Tray - above input box */}
                {(attachedFiles.length > 0 || localFileAttachments.length > 0) && (
                    <div className="attachment-tray-above-input">
                        {attachedFiles.map((file, index) => (
                            <div key={`${file.file_path || file.name}-${index}`} className="attachment-chip">
                                <span className="attachment-icon">{getFileIcon(file.name)}</span>
                                <span className="attachment-name" title={file.name}>{file.name}</span>
                                {file.size_bytes != null && (
                                    <span className="attachment-size">{formatFileSize(file.size_bytes)}</span>
                                )}
                                <button type="button" className="attachment-remove" onClick={() => handleRemoveFile(file.name)}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M18 6L6 18M6 6l12 12" /></svg>
                                </button>
                            </div>
                        ))}
                        {localFileAttachments.map((file, index) => (
                            <div key={`local-${file.all_files_id ?? file.name}-${index}`} className="attachment-chip">
                                <span className="attachment-icon">{getFileIcon(file.name)}</span>
                                <span className="attachment-name" title={file.name}>{file.name}</span>
                                {file.size_bytes != null && (
                                    <span className="attachment-size">{formatFileSize(file.size_bytes)}</span>
                                )}
                                <button type="button" className="attachment-remove" onClick={() => removeLocalFileAttachment(file.name)}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M18 6L6 18M6 6l12 12" /></svg>
                                </button>
                            </div>
                        ))}
                        <span className="attachment-count">{(attachedFiles.length + localFileAttachments.length)} file(s)</span>
                    </div>
                )}
                <form onSubmit={handleSubmit} className="chat-input-form">
                    <div className="chat-input-pill">
                        <button
                            type="button"
                            className="input-icon-btn"
                            onClick={handleFileUpload}
                            title="Attach file"
                        >
                            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                            </svg>
                        </button>
                        {/* Curated files picker button — always visible, opens picker panel */}
                        <button
                            type="button"
                            className={`input-icon-btn ${showCuratedPicker ? 'attach-btn-active' : ''}`}
                            onClick={() => {
                                setCuratedPickerQuery('');
                                fetchCuratedFiles();
                                setShowCuratedPicker(!showCuratedPicker);
                            }}
                            title="Insert from Local Storage Files"
                        >
                            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                            </svg>
                        </button>
                        <div style={{ position: 'relative', flex: 1 }}>
                            <input
                                ref={inputRef}
                                value={input}
                                onChange={handleInputChange}
                                onKeyDown={handleInputKeyDown}
                                placeholder="Ask anything (type @ for adding local storage files)"
                                className="chat-input"
                            />
                            {/* @filename autocomplete dropdown — curated files only */}
                            {showFileAutocomplete && filteredLocalFiles.length > 0 && (
                                <div ref={fileAutocompleteRef} className="file-autocomplete-dropdown">
                                    <div className="file-autocomplete-header">Curated Files</div>
                                    {filteredLocalFiles.map((file, idx) => (
                                        <div
                                            key={file.id}
                                            className={`file-autocomplete-item ${idx === fileAutocompleteIndex ? 'selected' : ''}`}
                                            onClick={() => insertFileAsAttachment(file)}
                                            onMouseEnter={() => setFileAutocompleteIndex(idx)}
                                        >
                                            <span className="file-autocomplete-icon">{getFileIcon(file.name)}</span>
                                            <span className="file-autocomplete-name">{file.name}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {/* Curated files picker panel - dropdown above input */}
                            {showCuratedPicker && (
                                <div ref={curatedPickerRef} className="file-autocomplete-dropdown" style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: '8px', maxHeight: '300px' }}>
                                    <div className="file-autocomplete-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span>Local Storage Files</span>
                                        <span style={{ fontSize: '11px', fontWeight: 400, opacity: 0.7 }}>Click to insert @filename</span>
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Search files..."
                                        value={curatedPickerQuery}
                                        onChange={(e) => setCuratedPickerQuery(e.target.value)}
                                        style={{ width: 'calc(100% - 24px)', margin: '8px 12px', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-primary)', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '13px', outline: 'none' }}
                                        autoFocus
                                    />
                                    <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                        {filteredCuratedPicker.length === 0 ? (
                                            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                                                {curatedPickerFiles.length === 0 ? 'No files in Local Storage' : 'No matching files'}
                                            </div>
                                        ) : (
                                            filteredCuratedPicker.map((file, idx) => (
                                                <div
                                                    key={file.id}
                                                    className="file-autocomplete-item"
                                                    onClick={() => insertCuratedFileAsAttachment(file)}
                                                    style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                                                >
                                                    <span className="file-autocomplete-icon">{getFileIcon(file.name)}</span>
                                                    <span className="file-autocomplete-name">{file.name}</span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                    {curatedPickerFiles.length > 0 && (
                                        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border-primary)', fontSize: '11px', color: 'var(--text-muted)' }}>
                                            {curatedPickerFiles.length} file(s) available in Local Storage
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        <button type="submit" disabled={isLoading || !input.trim()} className="input-send-btn">
                            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                            </svg>
                        </button>
                    </div>
                    <p className="chat-disclaimer">AI can make mistakes. Please verify important information.</p>
                </form>
            </div>
            {/* End chat-body */}
            </div>

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <svg className="modal-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4v2m0 4v2m0-14a9 9 0 110 18 9 9 0 010-18zm0 0a9 9 0 110 18 9 9 0 010-18z" />
                            </svg>
                        </div>
                        <h2 className="modal-title">Delete Chat</h2>
                        <p className="modal-message">Are you sure you want to delete this chat?</p>
                        <div className="modal-buttons">
                            <button className="modal-button cancel" onClick={() => { setShowDeleteConfirm(false); setIsDropdownOpen(false); }}>Cancel</button>
                            <button
                                className="modal-button delete"
                                disabled={!chatId || isDeleting}
                                onClick={() => {
                                    const deleteChat = async () => {
                                        try {
                                            if (!chatId || !onDeleteChat) return;
                                            setIsDeleting(true);
                                            await onDeleteChat(chatId);
                                            setShowDeleteConfirm(false);
                                            setIsDropdownOpen(false);
                                        } catch (error) {
                                            console.error('Error deleting chat:', error);
                                            alert('Failed to delete chat: ' + (error instanceof Error ? error.message : String(error)));
                                        } finally {
                                            setIsDeleting(false);
                                        }
                                    };
                                    deleteChat();
                                }}
                            >
                                {isDeleting ? 'Deleting...' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── OpenRouter API Key Modal (React portal — always inside Tauri webview) ── */}
            {orModalStep !== 'none' && createPortal(
                <div
                    style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.55)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000, fontFamily: 'sans-serif' }}
                    onClick={(e) => { if (e.target === e.currentTarget) closeOrModal(); }}
                >
                    <div style={{ background: 'white', padding: '24px', borderRadius: '12px', width: '500px', maxWidth: '90vw', boxShadow: '0 10px 30px rgba(0,0,0,0.25)', color: 'black', position: 'relative' }}>
                        {/* Close */}
                        <button onClick={closeOrModal} style={{ position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: '50%', background: '#E5E7EB', color: '#374151', border: 'none', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>×</button>
                        {orModalStep === 'choice' && (
                            <>
                                <h3 style={{ color: 'black', marginTop: 0, marginBottom: 12, textAlign: 'center', fontSize: 18 }}>OpenRouter API Key Needed</h3>
                                <p style={{ color: '#374151', textAlign: 'center', fontSize: 14, marginBottom: 20 }}>Access powerful AI models by adding your OpenRouter API key.</p>
                                <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                                    <button
                                        onClick={() => { openInBrowser('https://openrouter.ai/keys'); closeOrModal(); }}
                                        style={{ width: '42%', padding: '10px 16px', background: 'rgb(233,233,233)', color: 'black', border: 'none', borderRadius: 9999, cursor: 'pointer', fontWeight: 500, transition: 'all 0.15s' }}
                                        onMouseOver={(e) => { e.currentTarget.style.background = '#000'; e.currentTarget.style.color = '#fff'; }}
                                        onMouseOut={(e) => { e.currentTarget.style.background = 'rgb(233,233,233)'; e.currentTarget.style.color = 'black'; }}
                                    >Create API Key</button>
                                    <button
                                        onClick={() => setOrModalStep('input')}
                                        style={{ width: '42%', padding: '10px 16px', background: 'rgb(233,233,233)', color: 'black', border: 'none', borderRadius: 9999, cursor: 'pointer', fontWeight: 500, transition: 'all 0.15s' }}
                                        onMouseOver={(e) => { e.currentTarget.style.background = '#000'; e.currentTarget.style.color = '#fff'; }}
                                        onMouseOut={(e) => { e.currentTarget.style.background = 'rgb(233,233,233)'; e.currentTarget.style.color = 'black'; }}
                                    >Enter Existing Key</button>
                                </div>
                            </>
                        )}
                        {orModalStep === 'input' && (
                            <>
                                {/* Back */}
                                <button onClick={() => setOrModalStep('choice')} style={{ position: 'absolute', top: 8, left: 8, width: 30, height: 30, borderRadius: '50%', background: '#E5E7EB', color: '#374151', border: 'none', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>←</button>
                                <h3 style={{ color: 'black', marginTop: 0, marginBottom: 10, textAlign: 'center', fontSize: 18 }}>Enter OpenRouter API Key</h3>
                                <p style={{ color: '#374151', textAlign: 'center', fontSize: 13, marginBottom: 16 }}>
                                    Paste your key below. Get one at{' '}
                                    <a href="#" onClick={(e) => { e.preventDefault(); openInBrowser('https://openrouter.ai/keys'); }} style={{ color: '#2563eb', textDecoration: 'none' }}>openrouter.ai/keys</a>
                                </p>
                                <input
                                    ref={orKeyRef}
                                    type="password"
                                    placeholder="sk-or-v1-..."
                                    value={orKeyInput}
                                    onChange={(e) => setOrKeyInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && saveOrKey()}
                                    style={{ width: '100%', padding: '12px 16px', borderRadius: 8, border: `1px solid ${orKeyError ? '#ef4444' : '#d1d5db'}`, fontSize: 14, boxSizing: 'border-box', marginBottom: 6, outline: 'none' }}
                                />
                                {orKeyInputError && (
                                    <p style={{ color: '#ef4444', fontSize: '12px', marginBottom: 12, textAlign: 'center' }}>{orKeyInputError}</p>
                                )}
                                <button
                                    onClick={saveOrKey}
                                    style={{ width: '100%', padding: '11px 16px', background: '#000', color: 'white', border: 'none', borderRadius: 9999, cursor: 'pointer', fontWeight: 600, fontSize: 14 }}
                                    onMouseOver={(e) => { e.currentTarget.style.background = '#1e40af'; }}
                                    onMouseOut={(e) => { e.currentTarget.style.background = '#000'; }}
                                >Save API Key</button>
                            </>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
