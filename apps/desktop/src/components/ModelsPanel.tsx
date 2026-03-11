// Models Panel Component
// Full-page model management view with source logos, inline download progress,
// pause/stop/resume controls, sort/filter, and download notification bubble.

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, Download, Trash2, HardDrive, Cpu, Monitor, Database, ArrowLeft, RefreshCw, Pause, Play, Square, ChevronDown } from 'lucide-react';
import { useNotificationHelpers } from '../contexts/NotificationContext';
import { saveInterruptedDownload, removeInterruptedDownload } from '../api/models';
import { useAuth } from '../contexts/AuthContext';
import { open } from '@tauri-apps/plugin-shell';
import { getApiBaseSync } from '../api/backendUrl';
import { useApiKeys } from '../contexts/ApiKeyContext';

// Helper function to check if backend is ready
async function checkBackendReadiness(): Promise<boolean> {
  try {
    const response = await fetch(`${getApiBaseSync()}/healthz`);
    return response.ok;
  } catch (error) {
    console.warn('Backend readiness check failed:', error);
    return false;
  }
}

// Helper function to show the HuggingFace API Key modal with two-step flow
export function showHuggingFaceApiKeyModal(
  onHfTokenChange?: (token: string) => void,
  setApiKey?: (provider: 'openrouter' | 'huggingface', key: string) => void,
  onComplete?: () => void
) {
  // Create initial modal HTML
  const createInitialModalHTML = () => `
    <div id="huggingface-modal-model" style="
        position: fixed; 
        top: 0; 
        left: 0; 
        width: 100%; 
        height: 100%; 
        background: rgba(0,0,0,0.5); 
        display: flex; 
        justify-content: center; 
        align-items: center; 
        z-index: 10000;
        font-family: sans-serif;
    ">
        <div id="huggingface-modal-content" style="
            background: white; 
            padding: 20px; 
            border-radius: 12px; 
            width: 560px; 
            max-width: 90vw; 
            box-shadow: 0 10px 25px rgba(0,0,0,0.2);
            color: black;
            position: relative;
        " data-theme="light">
            <button id="close-hf-modal" style="
                position: absolute;
                top: 8px;
                right: 8px;
                width: 30px;
                height: 30px;
                border-radius: 50%;
                background: #E5E7EB;
                color: #374151;
                border: none;
                cursor: pointer;
                font-size: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
            ">×</button>
            <h3 style="color: black; margin-top: 0; margin-bottom: 15px; text-align: center;">HuggingFace Token Needed</h3>
            <p style="color: black; text-align: center;">Access gated models by adding your HuggingFace token.</p>
            <div style="display: flex; gap: 10px; margin-top: 20px; justify-content: center;">
                <button id="get-hf-token-btn-model" class="capsule-btn-gray" style="
                    width: 40%; 
                    padding: 10px 16px; 
                    background: rgb(233,233,233); 
                    color: black; 
                    border: none; 
                    border-radius: 9999px; 
                    cursor: pointer;
                    font-weight: 500;
                    transition: background-color 0.2s, color 0.2s;
                ">Create API Key</button>
                <button id="enter-hf-token-btn-model" class="capsule-btn-gray" style="
                    width: 40%; 
                    padding: 10px 16px; 
                    background: rgb(233,233,233); 
                    color: black; 
                    border: none; 
                    border-radius: 9999px; 
                    cursor: pointer;
                    font-weight: 500;
                    transition: background-color 0.2s, color 0.2s;
                ">Enter Existing Key</button>
            </div>
        </div>
    </div>
  `;

  // Create API key input modal HTML
  const createTokenInputHTML = () => `
    <div id="huggingface-modal-model" style="
        position: fixed; 
        top: 0; 
        left: 0; 
        width: 100%; 
        height: 100%; 
        background: rgba(0,0,0,0.5); 
        display: flex; 
        justify-content: center; 
        align-items: center; 
        z-index: 10000;
        font-family: sans-serif;
    ">
        <div id="huggingface-modal-content" style="
            background: white; 
            padding: 20px; 
            border-radius: 12px; 
            width: 560px; 
            max-width: 90vw; 
            box-shadow: 0 10px 25px rgba(0,0,0,0.2);
            color: black;
            position: relative;
        " data-theme="light">
            <button id="close-hf-modal" style="
                position: absolute;
                top: 8px;
                right: 8px;
                width: 30px;
                height: 30px;
                border-radius: 50%;
                background: #E5E7EB;
                color: #374151;
                border: none;
                cursor: pointer;
                font-size: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
            ">×</button>
            <button id="back-btn-hf-model" style="
                position: absolute;
                top: 8px;
                left: 8px;
                width: 30px;
                height: 30px;
                border-radius: 50%;
                background: #E5E7EB;
                color: #374151;
                border: none;
                cursor: pointer;
                font-size: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
            ">←</button>
            <h3 style="color: black; margin-top: 0; margin-bottom: 15px; text-align: center;">Enter HuggingFace Token</h3>
            <p style="color: black; text-align: center; font-size: 13px; margin-bottom: 15px;">Paste your HuggingFace token below. You can get one at <a href="https://huggingface.co/settings/tokens" target="_blank" style="color: #2563eb; text-decoration: none;">huggingface.co/settings/tokens</a></p>
            <div style="margin-top: 20px;">
                <input 
                    id="hf-token-input-model" 
                    type="password" 
                    placeholder="hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" 
                    style="
                        width: 100%;
                        padding: 12px 16px;
                        border-radius: 8px;
                        border: 1px solid #d1d5db;
                        font-size: 14px;
                        box-sizing: border-box;
                        margin-bottom: 12px;
                    "
                />
                <button id="save-hf-token-btn-model" class="capsule-btn-black" style="
                    width: 100%; 
                    padding: 10px 16px; 
                    background: #000000; 
                    color: white; 
                    border: none; 
                    border-radius: 9999px; 
                    cursor: pointer;
                    font-weight: 500;
                    transition: background-color 0.2s;
                ">Save Token</button>
            </div>
        </div>
    </div>
  `;

  // Function to setup hover effects
  const setupHoverEffects = (modalElement: HTMLElement) => {
    const capsuleButtons = modalElement.querySelectorAll('.capsule-btn-gray, .capsule-btn-black');
    
    const handleMouseEnter = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('capsule-btn-gray')) {
        target.style.backgroundColor = '#000000';
        target.style.color = 'white';
      }
    };
    
    const handleMouseLeave = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('capsule-btn-gray')) {
        target.style.backgroundColor = 'rgb(233,233,233)';
        target.style.color = 'black';
      }
    };
    
    capsuleButtons.forEach(btn => {
      btn.addEventListener('mouseenter', handleMouseEnter);
      btn.addEventListener('mouseleave', handleMouseLeave);
    });
  };

  // Function to show initial modal
  const showInitialModal = () => {
    // Remove any existing modal
    const existingModal = document.getElementById('huggingface-modal-model');
    if (existingModal && existingModal.parentNode) {
      existingModal.parentNode.removeChild(existingModal);
    }

    // Add modal to DOM
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = createInitialModalHTML();
    const modalElement = tempDiv.firstElementChild as HTMLElement;
    document.body.appendChild(modalElement);

    setupHoverEffects(modalElement);

    // Handle Close button (X button)
    const closeBtn = document.getElementById('close-hf-modal') as HTMLButtonElement;
    closeBtn?.addEventListener('click', () => {
      if (modalElement.parentNode) {
        modalElement.parentNode.removeChild(modalElement);
      }
      document.removeEventListener('keydown', handleEscape);
    });

    // Handle "Create API Key" button - Open HuggingFace in browser
    const getTokenBtn = document.getElementById('get-hf-token-btn-model') as HTMLButtonElement;
    getTokenBtn?.addEventListener('click', async () => {
      // Open HuggingFace token page in default browser
      await open('https://huggingface.co/settings/tokens');
      // Close modal
      if (modalElement.parentNode) {
        modalElement.parentNode.removeChild(modalElement);
      }
      document.removeEventListener('keydown', handleEscape);
    });

    // Handle "Enter Existing Key" button - Show input form
    const enterTokenBtn = document.getElementById('enter-hf-token-btn-model') as HTMLButtonElement;
    enterTokenBtn?.addEventListener('click', () => {
      showTokenInputModal();
    });

    // Close modal on clicking outside
    modalElement.addEventListener('click', (e) => {
      if (e.target === modalElement) {
        if (modalElement.parentNode) {
          modalElement.parentNode.removeChild(modalElement);
        }
        document.removeEventListener('keydown', handleEscape);
      }
    });

    // Handle Escape key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (modalElement.parentNode) {
          modalElement.parentNode.removeChild(modalElement);
        }
        document.removeEventListener('keydown', handleEscape);
      }
    };
    
    document.addEventListener('keydown', handleEscape);
  };

  // Function to show token input modal
  const showTokenInputModal = () => {
    // Remove existing modal
    const existingModal = document.getElementById('huggingface-modal-model');
    if (existingModal && existingModal.parentNode) {
      existingModal.parentNode.removeChild(existingModal);
    }

    // Add modal to DOM
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = createTokenInputHTML();
    const modalElement = tempDiv.firstElementChild as HTMLElement;
    document.body.appendChild(modalElement);

    // Focus the input field
    setTimeout(() => {
      const inputField = document.getElementById('hf-token-input-model') as HTMLInputElement;
      inputField?.focus();
    }, 100);

    // Handle Close button (X button)
    const closeBtn = document.getElementById('close-hf-modal') as HTMLButtonElement;
    closeBtn?.addEventListener('click', () => {
      if (modalElement.parentNode) {
        modalElement.parentNode.removeChild(modalElement);
      }
      document.removeEventListener('keydown', handleEscape);
    });

    // Handle Back button - Return to initial modal
    const backBtn = document.getElementById('back-btn-hf-model') as HTMLButtonElement;
    backBtn?.addEventListener('click', () => {
      if (modalElement.parentNode) {
        modalElement.parentNode.removeChild(modalElement);
      }
      document.removeEventListener('keydown', handleEscape);
      showInitialModal();
    });

    // Handle Save button - Save the token
    const saveBtn = document.getElementById('save-hf-token-btn-model') as HTMLButtonElement;
    const inputField = document.getElementById('hf-token-input-model') as HTMLInputElement;

    const saveToken = () => {
      const token = inputField?.value.trim();
      if (token) {
        // The callback (onHfTokenChange) IS the ApiKeyContext setter when called from
        // ModelsPanel/SettingsPanel — it handles OS keychain persistence, localStorage sync,
        // and React state update all at once.
        if (onHfTokenChange) {
          onHfTokenChange(token);
        }

        // Close modal
        if (modalElement.parentNode) {
          modalElement.parentNode.removeChild(modalElement);
        }
        document.removeEventListener('keydown', handleEscape);

        // Call onComplete callback if provided
        if (onComplete) {
          onComplete();
        }
      } else {
        // Show error or shake animation
        if (inputField) {
          inputField.style.borderColor = '#ef4444';
          setTimeout(() => {
            inputField.style.borderColor = '#d1d5db';
          }, 1000);
        }
      }
    };

    saveBtn?.addEventListener('click', saveToken);
    
    // Handle Enter key in input field
    inputField?.addEventListener('keypress', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        saveToken();
      }
    });

    // Close modal on clicking outside
    modalElement.addEventListener('click', (e) => {
      if (e.target === modalElement) {
        if (modalElement.parentNode) {
          modalElement.parentNode.removeChild(modalElement);
        }
        document.removeEventListener('keydown', handleEscape);
      }
    });

    // Handle Escape key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (modalElement.parentNode) {
          modalElement.parentNode.removeChild(modalElement);
        }
        document.removeEventListener('keydown', handleEscape);
      }
    };
    
    document.addEventListener('keydown', handleEscape);
  };

  // Show the initial modal
  showInitialModal();
}

// Helper function to show the Gated Model Access modal
export function showGatedModelModal(
  repoId: string,
  onRetry?: () => void
) {
  // Create modal HTML
  const modalHtml = `
    <div id="gated-model-modal" style="
        position: fixed; 
        top: 0; 
        left: 0; 
        width: 100%; 
        height: 100%; 
        background: rgba(0,0,0,0.5); 
        display: flex; 
        justify-content: center; 
        align-items: center; 
        z-index: 10000;
        font-family: sans-serif;
    ">
        <div id="gated-modal-content" style="
            background: white; 
            padding: 24px; 
            border-radius: 12px; 
            width: 520px; 
            max-width: 90vw; 
            box-shadow: 0 10px 25px rgba(0,0,0,0.2);
            color: black;
            position: relative;
        " data-theme="light">
            <button id="close-gated-modal" style="
                position: absolute;
                top: 8px;
                right: 8px;
                width: 30px;
                height: 30px;
                border-radius: 50%;
                background: #E5E7EB;
                color: #374151;
                border: none;
                cursor: pointer;
                font-size: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
            ">×</button>
            <h3 style="color: black; margin-top: 0; margin-bottom: 15px; text-align: center; font-size: 18px;">Model Access Required</h3>
            <p style="color: #374151; text-align: center; font-size: 14px; line-height: 1.5; margin-bottom: 20px;">
                This model requires explicit access approval from HuggingFace.
            </p>
            <div style="background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 12px; margin-bottom: 20px; border-radius: 4px;">
                <p style="color: #92400E; font-size: 13px; margin: 0;">
                    <strong>Repository:</strong> ${repoId}<br/>
                    You need to visit the model page and click "Request Access" to download this model.
                </p>
            </div>
            <div style="display: flex; gap: 10px; justify-content: center;">
                <button id="visit-hf-page-btn" class="capsule-btn-gray" style="
                    flex: 1;
                    padding: 12px 20px; 
                    background: #2563EB; 
                    color: white; 
                    border: none; 
                    border-radius: 9999px; 
                    cursor: pointer;
                    font-weight: 500;
                    font-size: 14px;
                    transition: background-color 0.2s, color 0.2s;
                ">Visit Model Page</button>
                <button id="retry-download-btn" class="capsule-btn-gray" style="
                    flex: 1;
                    padding: 12px 20px; 
                    background: rgb(233,233,233); 
                    color: black; 
                    border: none; 
                    border-radius: 9999px; 
                    cursor: pointer;
                    font-weight: 500;
                    font-size: 14px;
                    transition: background-color 0.2s, color 0.2s;
                ">Retry Download</button>
            </div>
            <p style="color: #6B7280; text-align: center; font-size: 12px; margin-top: 16px; margin-bottom: 0;">
                After requesting access on HuggingFace, click "Retry Download" to try again.
            </p>
        </div>
    </div>
  `;

  // Add modal to DOM
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = modalHtml;
  const modalElement = tempDiv.firstElementChild as HTMLElement;
  document.body.appendChild(modalElement);

  // Setup hover effects
  const capsuleButtons = modalElement.querySelectorAll('.capsule-btn-gray');
  
  const handleMouseEnter = (e: Event) => {
    const target = e.target as HTMLElement;
    if (target.id === 'visit-hf-page-btn') {
      target.style.backgroundColor = '#1D4ED8';
    } else if (target.id === 'retry-download-btn') {
      target.style.backgroundColor = '#000000';
      target.style.color = 'white';
    }
  };
  
  const handleMouseLeave = (e: Event) => {
    const target = e.target as HTMLElement;
    if (target.id === 'visit-hf-page-btn') {
      target.style.backgroundColor = '#2563EB';
    } else if (target.id === 'retry-download-btn') {
      target.style.backgroundColor = 'rgb(233,233,233)';
      target.style.color = 'black';
    }
  };
  
  capsuleButtons.forEach(btn => {
    btn.addEventListener('mouseenter', handleMouseEnter);
    btn.addEventListener('mouseleave', handleMouseLeave);
  });

  // Handle "Visit Model Page" button
  const visitBtn = document.getElementById('visit-hf-page-btn') as HTMLButtonElement;
  visitBtn?.addEventListener('click', async () => {
    await open(`https://huggingface.co/${repoId}`);
  });

  // Handle "Retry Download" button
  const retryBtn = document.getElementById('retry-download-btn') as HTMLButtonElement;
  retryBtn?.addEventListener('click', () => {
    if (modalElement.parentNode) {
      modalElement.parentNode.removeChild(modalElement);
    }
    document.removeEventListener('keydown', handleEscape);
    if (onRetry) {
      onRetry();
    }
  });

  // Handle Close button
  const closeBtn = document.getElementById('close-gated-modal') as HTMLButtonElement;
  closeBtn?.addEventListener('click', () => {
    if (modalElement.parentNode) {
      modalElement.parentNode.removeChild(modalElement);
    }
    document.removeEventListener('keydown', handleEscape);
  });

  // Close modal on clicking outside
  modalElement.addEventListener('click', (e) => {
    if (e.target === modalElement) {
      if (modalElement.parentNode) {
        modalElement.parentNode.removeChild(modalElement);
      }
      document.removeEventListener('keydown', handleEscape);
    }
  });

  // Handle Escape key
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (modalElement.parentNode) {
        modalElement.parentNode.removeChild(modalElement);
      }
      document.removeEventListener('keydown', handleEscape);
    }
  };
  
  document.addEventListener('keydown', handleEscape);
}

// Helper function to show the OpenRouter API Key modal with two-step flow
export function showOpenRouterApiKeyModal(
  onOpenRouterApiKeyChange?: (key: string) => void,
  setApiKey?: (provider: 'openrouter' | 'huggingface', key: string) => void,
  onComplete?: () => void
) {
  // Create initial modal HTML
  const createInitialModalHTML = () => `
    <div id="openrouter-modal-model" style="
        position: fixed; 
        top: 0; 
        left: 0; 
        width: 100%; 
        height: 100%; 
        background: rgba(0,0,0,0.5); 
        display: flex; 
        justify-content: center; 
        align-items: center; 
        z-index: 10000;
        font-family: sans-serif;
    ">
        <div id="openrouter-modal-content" style="
            background: white; 
            padding: 20px; 
            border-radius: 12px; 
            width: 560px; 
            max-width: 90vw; 
            box-shadow: 0 10px 25px rgba(0,0,0,0.2);
            color: black;
            position: relative;
        " data-theme="light">
            <button id="close-openrouter-modal" style="
                position: absolute;
                top: 8px;
                right: 8px;
                width: 30px;
                height: 30px;
                border-radius: 50%;
                background: #E5E7EB;
                color: #374151;
                border: none;
                cursor: pointer;
                font-size: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
            ">×</button>
            <h3 style="color: black; margin-top: 0; margin-bottom: 15px; text-align: center;">OpenRouter API Key Needed</h3>
            <p style="color: black; text-align: center;">Access powerful AI models by adding your OpenRouter API key.</p>
            <div style="display: flex; gap: 10px; margin-top: 20px; justify-content: center;">
                <button id="get-api-key-btn-model" class="capsule-btn-gray" style="
                    width: 40%; 
                    padding: 10px 16px; 
                    background:rgb(233, 233, 233); 
                    color: black; 
                    border: none; 
                    border-radius: 9999px; 
                    cursor: pointer;
                    font-weight: 500;
                    transition: background-color 0.2s, color 0.2s;
                ">Create API Key</button>
                <button id="enter-api-key-btn-model" class="capsule-btn-gray" style="
                    width: 40%; 
                    padding: 10px 16px; 
                    background: rgb(233,233,233); 
                    color: black; 
                    border: none; 
                    border-radius: 9999px; 
                    cursor: pointer;
                    font-weight: 500;
                    transition: background-color 0.2s, color 0.2s;
                ">Enter Existing Key</button>
            </div>
        </div>
    </div>
  `;

  // Create API key input modal HTML
  const createApiKeyInputHTML = () => `
    <div id="openrouter-modal-model" style="
        position: fixed; 
        top: 0; 
        left: 0; 
        width: 100%; 
        height: 100%; 
        background: rgba(0,0,0,0.5); 
        display: flex; 
        justify-content: center; 
        align-items: center; 
        z-index: 10000;
        font-family: sans-serif;
    ">
        <div id="openrouter-modal-content" style="
            background: white; 
            padding: 20px; 
            border-radius: 12px; 
            width: 560px; 
            max-width: 90vw; 
            box-shadow: 0 10px 25px rgba(0,0,0,0.2);
            color: black;
            position: relative;
        " data-theme="light">
            <button id="close-openrouter-modal" style="
                position: absolute;
                top: 8px;
                right: 8px;
                width: 30px;
                height: 30px;
                border-radius: 50%;
                background: #E5E7EB;
                color: #374151;
                border: none;
                cursor: pointer;
                font-size: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
            ">×</button>
            <button id="back-btn-model" style="
                position: absolute;
                top: 8px;
                left: 8px;
                width: 30px;
                height: 30px;
                border-radius: 50%;
                background: #E5E7EB;
                color: #374151;
                border: none;
                cursor: pointer;
                font-size: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
            ">←</button>
            <h3 style="color: black; margin-top: 0; margin-bottom: 15px; text-align: center;">Enter OpenRouter API Key</h3>
            <p style="color: black; text-align: center; font-size: 13px; margin-bottom: 15px;">Paste your OpenRouter API key below. You can get one at <a href="https://openrouter.ai/keys" target="_blank" style="color: #2563eb; text-decoration: none;">openrouter.ai/keys</a></p>
            <div style="margin-top: 20px;">
                <input 
                    id="api-key-input-model" 
                    type="password" 
                    placeholder="sk-or-v1-..." 
                    style="
                        width: 100%;
                        padding: 12px 16px;
                        border-radius: 8px;
                        border: 1px solid #d1d5db;
                        font-size: 14px;
                        box-sizing: border-box;
                        margin-bottom: 12px;
                    "
                />
                <button id="save-api-key-btn-model" class="capsule-btn-black" style="
                    width: 100%; 
                    padding: 10px 16px; 
                    background: #000000; 
                    color: white; 
                    border: none; 
                    border-radius: 9999px; 
                    cursor: pointer;
                    font-weight: 500;
                    transition: background-color 0.2s;
                ">Save API Key</button>
            </div>
        </div>
    </div>
  `;

  // Function to setup hover effects
  const setupHoverEffects = (modalElement: HTMLElement) => {
    const capsuleButtons = modalElement.querySelectorAll('.capsule-btn-gray, .capsule-btn-black');
    
    const handleMouseEnter = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('capsule-btn-gray')) {
        target.style.backgroundColor = '#000000';
        target.style.color = 'white';
      }
    };
    
    const handleMouseLeave = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('capsule-btn-gray')) {
        target.style.backgroundColor = 'rgb(233,233,233)';
        target.style.color = 'black';
      }
    };
    
    capsuleButtons.forEach(btn => {
      btn.addEventListener('mouseenter', handleMouseEnter);
      btn.addEventListener('mouseleave', handleMouseLeave);
    });
  };

  // Function to show initial modal
  const showInitialModal = () => {
    // Remove any existing modal
    const existingModal = document.getElementById('openrouter-modal-model');
    if (existingModal && existingModal.parentNode) {
      existingModal.parentNode.removeChild(existingModal);
    }

    // Add modal to DOM
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = createInitialModalHTML();
    const modalElement = tempDiv.firstElementChild as HTMLElement;
    document.body.appendChild(modalElement);

    setupHoverEffects(modalElement);

    // Handle Close button (X button)
    const closeBtn = document.getElementById('close-openrouter-modal') as HTMLButtonElement;
    closeBtn?.addEventListener('click', () => {
      if (modalElement.parentNode) {
        modalElement.parentNode.removeChild(modalElement);
      }
      document.removeEventListener('keydown', handleEscape);
    });

    // Handle "Create API Key" button - Open OpenRouter in browser
    const getApiKeyBtn = document.getElementById('get-api-key-btn-model') as HTMLButtonElement;
    getApiKeyBtn?.addEventListener('click', async () => {
      // Open OpenRouter keys page in default browser
      await open('https://openrouter.ai/keys');
      // Close modal
      if (modalElement.parentNode) {
        modalElement.parentNode.removeChild(modalElement);
      }
      document.removeEventListener('keydown', handleEscape);
    });

    // Handle "Enter Existing Key" button - Show input form
    const enterApiKeyBtn = document.getElementById('enter-api-key-btn-model') as HTMLButtonElement;
    enterApiKeyBtn?.addEventListener('click', () => {
      showApiKeyInputModal();
    });

    // Close modal on clicking outside
    modalElement.addEventListener('click', (e) => {
      if (e.target === modalElement) {
        if (modalElement.parentNode) {
          modalElement.parentNode.removeChild(modalElement);
        }
        document.removeEventListener('keydown', handleEscape);
      }
    });

    // Handle Escape key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (modalElement.parentNode) {
          modalElement.parentNode.removeChild(modalElement);
        }
        document.removeEventListener('keydown', handleEscape);
      }
    };
    
    document.addEventListener('keydown', handleEscape);
  };

  // Function to show API key input modal
  const showApiKeyInputModal = () => {
    // Remove existing modal
    const existingModal = document.getElementById('openrouter-modal-model');
    if (existingModal && existingModal.parentNode) {
      existingModal.parentNode.removeChild(existingModal);
    }

    // Add modal to DOM
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = createApiKeyInputHTML();
    const modalElement = tempDiv.firstElementChild as HTMLElement;
    document.body.appendChild(modalElement);

    // Focus the input field
    setTimeout(() => {
      const inputField = document.getElementById('api-key-input-model') as HTMLInputElement;
      inputField?.focus();
    }, 100);

    // Handle Close button (X button)
    const closeBtn = document.getElementById('close-openrouter-modal') as HTMLButtonElement;
    closeBtn?.addEventListener('click', () => {
      if (modalElement.parentNode) {
        modalElement.parentNode.removeChild(modalElement);
      }
      document.removeEventListener('keydown', handleEscape);
    });

    // Handle Back button - Return to initial modal
    const backBtn = document.getElementById('back-btn-model') as HTMLButtonElement;
    backBtn?.addEventListener('click', () => {
      if (modalElement.parentNode) {
        modalElement.parentNode.removeChild(modalElement);
      }
      document.removeEventListener('keydown', handleEscape);
      showInitialModal();
    });

    // Handle Save button - Save the API key
    const saveBtn = document.getElementById('save-api-key-btn-model') as HTMLButtonElement;
    const inputField = document.getElementById('api-key-input-model') as HTMLInputElement;

    const saveApiKeyHandler = () => {
      const apiKey = inputField?.value.trim();
      if (apiKey) {
        // The callback IS the ApiKeyContext setter — it handles OS keychain persistence,
        // localStorage sync, and React state update across all panels simultaneously.
        if (onOpenRouterApiKeyChange) {
          onOpenRouterApiKeyChange(apiKey);
        }

        // Close modal
        if (modalElement.parentNode) {
          modalElement.parentNode.removeChild(modalElement);
        }
        document.removeEventListener('keydown', handleEscape);

        // Notify caller that key was saved (e.g. to enable online mode).
        onComplete?.();
      } else {
        // Show error shake animation
        if (inputField) {
          inputField.style.borderColor = '#ef4444';
          setTimeout(() => {
            inputField.style.borderColor = '#d1d5db';
          }, 1000);
        }
      }
    };

    saveBtn?.addEventListener('click', saveApiKeyHandler);

    // Handle Enter key in input field
    inputField?.addEventListener('keypress', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        saveApiKeyHandler();
      }
    });

    // Close modal on clicking outside
    modalElement.addEventListener('click', (e) => {
      if (e.target === modalElement) {
        if (modalElement.parentNode) {
          modalElement.parentNode.removeChild(modalElement);
        }
        document.removeEventListener('keydown', handleEscape);
      }
    });

    // Handle Escape key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (modalElement.parentNode) {
          modalElement.parentNode.removeChild(modalElement);
        }
        document.removeEventListener('keydown', handleEscape);
      }
    };
    
    document.addEventListener('keydown', handleEscape);
  };

  // Show the initial modal
  showInitialModal();
}

// Types
interface ModelPricing {
  prompt: string;
  completion: string;
}

interface Model {
  id: string;
  name: string;
  description?: string;
  author?: string;
  status: string;
  size_bytes: number;
  format: string;
  download_source?: string;
  installed_version?: string;
  last_updated?: string;
  tags: string[];
  compatibility_score?: number;
  parameters?: string; // e.g., "7B", "13B", "70B", "671B"
  context_length?: number; // e.g., 4096, 8192, 128000
  provider?: string; // For OpenRouter: the provider name
  filename?: string; // Specific filename for HuggingFace models
  /** Whether this HuggingFace model requires access approval */
  is_gated?: boolean;
  /** Pricing info for OpenRouter models */
  pricing?: ModelPricing;
}

interface DownloadProgress {
  download_id: string;
  model_id: string;
  model_name: string;
  status: string;
  bytes_downloaded: number;
  total_bytes?: number;
  percentage: number;
  speed_bps: number;
  elapsed_time: number;
  estimated_time_remaining?: number;
  error_message?: string;
}

interface HardwareInfo {
  total_ram_gb: number;
  available_ram_gb: number;
  cpu_cores: number;
  gpu_available: boolean;
  gpu_vram_gb?: number;
  storage_used_bytes: number;
  storage_available_bytes: number;
}

type SortOption =
  | 'free_first'    // Free models first, then paid (default in online mode)
  | 'compatibility' // Best hardware match (default in offline mode)
  | 'name'          // Name A–Z
  | 'name_desc'     // Name Z–A
  | 'provider_az'   // Provider / Company A–Z
  | 'context_desc'  // Longest context window first
  | 'size_asc'      // Smallest model first (local)
  | 'size_desc'     // Largest model first (local)
  | 'source'
  | 'trending'
  | 'popularity';





interface ActiveModelInfo {
  model_path: string;
  model_name: string;
}

interface SelectedModel {
  id: string;
  name: string;
  source: 'local' | 'openrouter';
  pricing?: { prompt: string; completion: string };
}

const ModelsPanel: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  selectedModel?: SelectedModel | null;
  onSelectModel?: (model: SelectedModel | null) => void;
  openRouterApiKey?: string;
  onOpenRouterApiKeyChange?: (key: string) => void;
  onToggleOnlineMode?: (isOnline: boolean) => void;
  focusApiKeyInput?: boolean; // Add prop to control focusing API key input
  focusHfTokenInput?: boolean; // Add prop to control focusing HuggingFace token input
  initialTab?: 'installed' | 'available' | 'downloads';
}> = ({ isOpen, onClose, selectedModel, onSelectModel, openRouterApiKey, onOpenRouterApiKeyChange, onToggleOnlineMode, focusApiKeyInput, focusHfTokenInput, initialTab }) => {
  const [models, setModels] = useState<Model[]>([]);
  const [downloads, setDownloads] = useState<DownloadProgress[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'installed' | 'available' | 'downloads'>(initialTab ?? 'available');
  const [hardwareInfo, setHardwareInfo] = useState<HardwareInfo | null>(null);
  const [activeModelInfo, setActiveModelInfo] = useState<ActiveModelInfo | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('free_first');
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [showHfTokenInput, setShowHfTokenInput] = useState(false);
  const [engineAutoDownloading, setEngineAutoDownloading] = useState(false);
  const { showSuccess, showError, showDownload } = useNotificationHelpers();
  const { user } = useAuth();
  // API keys come from the shared context — changes here are immediately visible
  // in SettingsPanel (and vice versa).
  const { hfToken, setHfToken, openRouterApiKey: ctxOpenRouterApiKey, setOpenRouterApiKey: ctxSetOpenRouterApiKey } = useApiKeys();

  // State for model removal confirmation
  const [showRemoveConfirmation, setShowRemoveConfirmation] = useState(false);
  const [modelToRemove, setModelToRemove] = useState<Model | null>(null);

  // OpenRouter quota state
  const [orQuota, setOrQuota] = useState<{ usage_usd: number; limit_usd: number | null; is_free_tier: boolean; remaining_usd: number | null } | null>(null);

  // Available-tab filter state (OR catalog)
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [freeOnlyFilter, setFreeOnlyFilter] = useState(false);

  // Sync active tab when initialTab prop changes (e.g. when "View" is clicked)
  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  // Fetch data when panel opens and cleanup when closes
  useEffect(() => {
    if (isOpen) {
      // Immediate fetch
      fetchModels();
      fetchDownloads();
      fetchHardwareInfo();
      fetchActiveModel();
      fetchOrQuota();

      // Refresh again after a short delay to ensure backend is fully ready
      // This helps catch any models that might have been missed in initial load
      const refreshTimer = setTimeout(() => {
        fetchModels();
        fetchDownloads();
      }, 500);
      
      return () => clearTimeout(refreshTimer);
    } else {
      // Reset state when closed to prevent stale data
      setModels([]);
      setDownloads([]);
      setHardwareInfo(null);
      setFetchError(null);
    }
  }, [isOpen]);

  // Effect to handle focusing API key input when requested
  useEffect(() => {
    if (focusApiKeyInput) {
      // If the API key input should be focused, make sure it's visible first
      if (!showApiKeyInput) {
        setShowApiKeyInput(true);
      }
      
      // Wait for the input to be rendered, then focus it
      const timer = setTimeout(() => {
        const apiKeyInput = document.getElementById('openrouter-api-key-input') as HTMLInputElement;
        if (apiKeyInput) {
          apiKeyInput.focus();
        }
      }, 100); // Small delay to ensure DOM is updated
      
      return () => clearTimeout(timer);
    }
  }, [focusApiKeyInput, showApiKeyInput]);
  
  // Effect to handle focusing HuggingFace token input when requested
  useEffect(() => {
    if (focusHfTokenInput) {
      // If the HuggingFace token input should be focused, make sure it's visible first
      if (!showHfTokenInput) {
        setShowHfTokenInput(true);
      }
      
      // Wait for the input to be rendered, then focus it
      const timer = setTimeout(() => {
        const hfTokenInput = document.getElementById('hf-token-input') as HTMLInputElement;
        if (hfTokenInput) {
          hfTokenInput.focus();
        }
      }, 100); // Small delay to ensure DOM is updated
      
      return () => clearTimeout(timer);
    }
  }, [focusHfTokenInput, showHfTokenInput]);

  useEffect(() => {
    if (isOpen && downloads.some(d => d.status === 'Downloading' || d.status === 'Starting' || d.status === 'Queued')) {
      const interval = setInterval(fetchDownloads, 2000); // Poll every 2 seconds for active downloads
      return () => clearInterval(interval);
    }
    // If no active downloads, return empty cleanup function
    return () => {};
  }, [isOpen, downloads]);

  // Detect completed downloads and refresh model list
  useEffect(() => {
    const completedDownloads = downloads.filter(d => d.status === 'Completed');

    if (completedDownloads.length > 0) {
      // Refresh the model list to pick up the new "Installed" status from backend
      fetchModels();

      // Clean up completed downloads after a short delay to show success state
      const timer = setTimeout(() => {
        setDownloads(prev => prev.filter(d => d.status !== 'Completed'));
      }, 2000); // 2 second delay to let user see 100% completion

      return () => clearTimeout(timer);
    }
  }, [downloads]);

  const fetchModels = async () => {
    try {
      setIsLoading(true);
      setFetchError(null);
      
      // Check backend readiness before making request
      if (!(await checkBackendReadiness())) {
        setFetchError(`Backend is not ready. Please ensure the offline-intelligence service is started on ${getApiBaseSync()}.`);
        setModels([]);
        return;
      }
      
      const response = await fetch(`${getApiBaseSync()}/models`);
      if (response.ok) {
        const data: typeof models = await response.json();
        // Deduplicate by model id — the registry can return the same entry
        // multiple times after a restart (catalog + disk scan overlap).
        const seen = new Set<string>();
        const unique = data.filter(m => { if (seen.has(m.id)) return false; seen.add(m.id); return true; });
        // Also deduplicate installed models by name — backend can return the same
        // physical file under two different IDs (catalog entry + disk-scan entry).
        const seenInstalledNames = new Set<string>();
        const finalUnique = unique.filter(m => {
          if (m.status !== 'Installed') return true;
          const key = m.name.toLowerCase();
          if (seenInstalledNames.has(key)) return false;
          seenInstalledNames.add(key);
          return true;
        });
        setModels(finalUnique);
        // Do nothing if backend returns empty list, keep the models as received
      } else {
        setFetchError(`Backend returned HTTP ${response.status}. Make sure the backend is running.`);
      }
    } catch (error) {
      console.error('Failed to fetch models:', error);
      // Provide a more helpful error message with troubleshooting steps
      setFetchError(`Cannot connect to backend. The backend may not be running. Please ensure the offline-intelligence service is started on ${getApiBaseSync()}.`);
      // Set empty models when backend is unreachable
      setModels([]);
    } finally {
      setIsLoading(false);
    }
  };

  /** Fetch OpenRouter account quota/usage — silently ignored if no key stored */
  const fetchOrQuota = async () => {
    try {
      const resp = await fetch(`${getApiBaseSync()}/models/openrouter/quota`);
      if (resp.ok) {
        const data = await resp.json();
        setOrQuota(data);
        // Always show all models; free ones appear first via 'free_first' sort.
        // The free-only filter toggle is still available for the user to enable manually.
        setSortBy('free_first');
      }
    } catch {
      // Quota unavailable — not critical, ignore silently
    }
  };

  const fetchDownloads = async () => {
    try {
      // Check backend readiness before making request
      if (!(await checkBackendReadiness())) {
        console.warn('Backend not ready for download fetch');
        return;
      }
      
      const response = await fetch(`${getApiBaseSync()}/models/downloads`);
      if (response.ok) {
        setDownloads(await response.json());
      } else {
        console.warn('Downloads endpoint returned non-200 status:', response.status);
      }
    } catch (error) {
      console.error('Failed to fetch downloads:', error);
      // Don't show an error for downloads as it's not critical to main functionality
    }
  };

  const fetchHardwareInfo = async () => {
    try {
      // Check backend readiness before making request
      if (!(await checkBackendReadiness())) {
        console.warn('Backend not ready for hardware info fetch');
        return;
      }
      
      const response = await fetch(`${getApiBaseSync()}/hardware/info`);
      if (response.ok) {
        setHardwareInfo(await response.json());
      } else {
        console.warn('Hardware info endpoint returned non-200 status:', response.status);
      }
    } catch (error) {
      console.error('Failed to fetch hardware info:', error);
      // Don't show an error for hardware info as it's not critical
    }
  };

  const fetchActiveModel = async () => {
    try {
      // Check backend readiness before making request
      if (!(await checkBackendReadiness())) {
        console.warn('Backend not ready for active model fetch');
        return;
      }
      
      const response = await fetch(`${getApiBaseSync()}/models/active`);
      if (response.ok) {
        const activeModel = await response.json();
        setActiveModelInfo(activeModel);
      } else {
        console.warn('Active model endpoint returned non-200 status:', response.status);
      }
    } catch (error) {
      console.error('Failed to fetch active model:', error);
      // Don't show an error for active model as it's not critical
    }
  };

  const refreshCatalog = async () => {
    try {
      // Check backend readiness before making request
      if (!(await checkBackendReadiness())) {
        showError('Backend Not Ready', `Please ensure the offline-intelligence service is started on ${getApiBaseSync()}.`);
        return;
      }
      
      const payload: { source: string; openrouter_api_key?: string } = { source: 'all' };
      if (openRouterApiKey) {
        payload.openrouter_api_key = openRouterApiKey;
      }

      const response = await fetch(`${getApiBaseSync()}/models/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.error('Failed to refresh model catalog:', response.status);
      }
    } catch (error) {
      console.error('Failed to refresh model catalog:', error);
    } finally {
      await fetchModels();
      await fetchHardwareInfo();
    }
  };

  const buildSourcePayload = (model: Model) => {
    const source = model.download_source || 'huggingface';
    if (source === 'ollama') {
      const modelName = model.id.startsWith('ollama:') ? model.id.slice(7) : model.id;
      return { type: 'Ollama', model_name: modelName };
    } else if (source === 'openrouter') {
      const modelId = model.id.startsWith('openrouter:') ? model.id.slice(11) : model.id;
      return { type: 'OpenRouter', model_id: modelId };
    } else {
      // Use filename from model info if available, otherwise construct a guess
      const filename = model.filename || (() => {
        const parts = model.id.split('/');
        return parts.length > 1
          ? `${parts[parts.length - 1].toLowerCase().replace(/-gguf$/i, '')}.Q4_K_M.gguf`
          : `${model.id}.gguf`;
      })();
      return { type: 'HuggingFace', repo_id: model.id, filename };
    }
  };

  const handleInstallModel = async (model: Model) => {
    try {
      // Check backend readiness before making request
      if (!(await checkBackendReadiness())) {
        showError('Backend Not Ready', `Please ensure the offline-intelligence service is started on ${getApiBaseSync()}.`);
        return;
      }
      
      const response = await fetch(`${getApiBaseSync()}/models/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_id: model.id,
          model_name: model.name,
          source: buildSourcePayload(model),
          description: model.description,
          size_bytes: model.size_bytes,
          format: model.format,
          hf_token: hfToken || undefined
        })
      });
      if (response.ok) {
        showDownload('Download Started', `Downloading ${model.name}`);
        // Persist download info so it can be resumed if the app closes mid-download
        saveInterruptedDownload({
          model_id: model.id,
          model_name: model.name,
          source: buildSourcePayload(model),
          size_bytes: model.size_bytes,
          format: model.format,
          description: model.description,
        });
        // Immediately fetch downloads to get the new entry
        await fetchDownloads();
        // Switch to downloads tab to show progress
        setActiveTab('downloads');
        // Fetch again after a short delay to ensure we have fresh data
        setTimeout(fetchDownloads, 500);
      } else {
        const errorText = await response.text();
        if (errorText.includes('401 Unauthorized') && model.download_source === 'huggingface') {
          // Check if this is a gated model that requires access request
          const repoIdMatch = errorText.match(/REPO_ID:([^\s]+)/);
          const repoId = repoIdMatch ? repoIdMatch[1] : null;
          
          if (repoId) {
            // Show gated model modal with option to visit HuggingFace page
            showGatedModelModal(repoId, () => {
              // Retry the download when user clicks "Retry Download"
              handleInstallModel(model);
            });
          } else {
            // Create a custom modal for HuggingFace token
          const modalHtml = `
            <div id="huggingface-modal-model" style="
                position: fixed; 
                top: 0; 
                left: 0; 
                width: 100%; 
                height: 100%; 
                background: rgba(0,0,0,0.5); 
                display: flex; 
                justify-content: center; 
                align-items: center; 
                z-index: 10000;
                font-family: sans-serif;
            ">
                <div style="
                    background: white; 
                    padding: 20px; 
                    border-radius: 12px; 
                    width: 560px; 
                    max-width: 90vw; 
                    box-shadow: 0 10px 25px rgba(0,0,0,0.2);
                    color: black;
                    position: relative;
                " data-theme="light">
                    <button id="close-hf-modal" style="
                        position: absolute;
                        top: 8px;
                        right: 8px;
                        width: 30px;
                        height: 30px;
                        border-radius: 50%;
                        background: #E5E7EB;
                        color: #374151;
                        border: none;
                        cursor: pointer;
                        font-size: 16px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-weight: bold;
                    ">×</button>
                    <h3 style="color: black; margin-top: 0; margin-bottom: 15px; text-align: center;">HuggingFace Token Needed</h3>
                    <p style="color: black; text-align: center;">Access gated models by adding your HuggingFace token.</p>
                    <div style="display: flex; gap: 10px; margin-top: 20px; justify-content: center;">
                        <button id="get-hf-token-btn-model" class="capsule-btn-gray" style="
                            width: 40%; 
                            padding: 10px 16px; 
                            background: rgb(233,233,233); 
                            color: black; 
                            border: none; 
                            border-radius: 9999px; 
                            cursor: pointer;
                            font-weight: 500;
                            transition: background-color 0.2s, color 0.2s;
                        ">Create API Key</button>
                        <button id="enter-hf-token-btn-model" class="capsule-btn-gray" style="
                            width: 40%; 
                            padding: 10px 16px; 
                            background: rgb(233,233,233); 
                            color: black; 
                            border: none; 
                            border-radius: 9999px; 
                            cursor: pointer;
                            font-weight: 500;
                            transition: background-color 0.2s, color 0.2s;
                        ">Enter Existing Key</button>
                    </div>
                </div>
            </div>
          `;
          
          // Add modal to DOM
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = modalHtml;
          const modalElement = tempDiv.firstElementChild as HTMLElement;
          document.body.appendChild(modalElement);
          
          // When removing modal, also clean up event listeners
          const removeModalHF = () => {
              cleanupModalHF();
              document.body.removeChild(modalElement);
          };
          
          // Clean up event listeners when modal is closed
          const cleanupModalHF = () => {
              document.removeEventListener('keydown', handleEscape);
          };
          
          // Close modal on pressing Escape key
          const handleEscape = (e: KeyboardEvent) => {
              if (e.key === 'Escape') {
                  removeModalHF();
              }
          };
          
          document.addEventListener('keydown', handleEscape);
          
          // Get buttons from the modal
          const getHfTokenBtn = document.getElementById('get-hf-token-btn-model') as HTMLButtonElement;
          const enterHfTokenBtn = document.getElementById('enter-hf-token-btn-model') as HTMLButtonElement;
          const closeHfModalBtn = document.getElementById('close-hf-modal') as HTMLButtonElement;
          
          // Handle "Get Token" button
          const handleGetHfToken = async () => {
              // Open HuggingFace token page in default browser
              await open('https://huggingface.co/settings/tokens');
              // Remove modal
              removeModalHF();
          };
          
          // Handle Close button (X button)
          closeHfModalBtn?.addEventListener('click', () => {
              document.body.removeChild(modalElement);
          });
          
          // Handle "Enter Token" button
          const handleEnterHfToken = () => {
              // Close any existing modals first
              const existingModals = document.querySelectorAll('[id$="-modal"]');
              existingModals.forEach(modal => {
                  // Check if it's an element before removing to avoid errors
                  if (modal.parentNode) {
                      modal.parentNode.removeChild(modal);
                  }
              });
              
              // Create a modal with input field instead of using prompt
              const tokenModalHtml = `
                <div id="hf-token-input-modal" style="
                  position: fixed; 
                  top: 0; 
                  left: 0; 
                  width: 100%; 
                  height: 100%; 
                  background: rgba(0,0,0,0.5); 
                  display: flex; 
                  justify-content: center; 
                  align-items: center; 
                  z-index: 10002;
                  font-family: sans-serif;
                ">
                  <div style="
                    background: white; 
                    padding: 20px; 
                    border-radius: 12px; 
                    width: 400px; 
                    max-width: 90vw; 
                    box-shadow: 0 10px 25px rgba(0,0,0,0.2);
                    color: black;
                    text-align: center;
                    position: relative;
                  ">
                    <button id="close-hf-token-modal" style="
                      position: absolute;
                      top: 8px;
                      right: 8px;
                      width: 30px;
                      height: 30px;
                      border-radius: 50%;
                      background: #E5E7EB;
                      color: #374151;
                      border: none;
                      cursor: pointer;
                      font-size: 16px;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      font-weight: bold;
                    ">×</button>
                    <h3 style="color: black; margin-top: 0; margin-bottom: 15px; text-align: center; font-size: 16px; font-weight: 600;">Enter HuggingFace Token</h3>
                    <input 
                      type="password" 
                      id="hf-token-input" 
                      placeholder="hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      style="
                        width: 100%;
                        padding: 10px;
                        margin: 10px 0;
                        border: 1px solid #ccc;
                        border-radius: 8px;
                        font-size: 14px;
                        outline: none;
                      "
                    />
                    <div style="display: flex; gap: 8px; margin-top: 15px; justify-content: center;">
                      <button id="save-hf-token-btn" class="capsule-btn-gray" style="
                        flex: 1;
                        padding: 8px 16px;
                        background: #1e40af;
                        color: white;
                        border: none;
                        border-radius: 9999px;
                        cursor: pointer;
                        font-weight: 500;
                        font-size: 14px;
                        transition: background-color 0.2s, color 0.2s;
                      ">Save Token</button>
                      <button id="cancel-hf-token-btn" class="capsule-btn-gray" style="
                        flex: 1;
                        padding: 8px 16px;
                        background: #E5E7EB;
                        color: #1e40af;
                        border: none;
                        border-radius: 9999px;
                        cursor: pointer;
                        font-weight: 500;
                        font-size: 14px;
                        transition: background-color 0.2s, color 0.2s;
                      ">Cancel</button>
                    </div>
                  </div>
                </div>
              `;
              
              // Add modal to DOM
              const tempDiv = document.createElement('div');
              tempDiv.innerHTML = tokenModalHtml;
              const tokenModalElement = tempDiv.firstElementChild as HTMLElement;
              document.body.appendChild(tokenModalElement);
              
              const inputElement = document.getElementById('hf-token-input') as HTMLInputElement;
              const saveBtn = document.getElementById('save-hf-token-btn') as HTMLButtonElement;
              const cancelBtn = document.getElementById('cancel-hf-token-btn') as HTMLButtonElement;
              const closeBtn = document.getElementById('close-hf-token-modal') as HTMLButtonElement;
              
              // Add hover event listeners for capsule buttons
              const capsuleButtons = tokenModalElement.querySelectorAll('.capsule-btn-gray');
              
              const handleMouseEnter = (e: { target: any }) => {
                  (e.target as HTMLElement).style.backgroundColor = '#000000';
                  (e.target as HTMLElement).style.color = 'white';
              };
              
              const handleMouseLeave = (e: { target: any }) => {
                  const target = e.target as HTMLElement;
                  if (target.id === 'save-hf-token-btn') {
                      target.style.backgroundColor = '#1e40af';
                  } else if (target.id === 'cancel-hf-token-btn') {
                      target.style.backgroundColor = '#E5E7EB';
                      target.style.color = '#374151';
                  }
              };
              
              capsuleButtons.forEach(btn => {
                  btn.addEventListener('mouseenter', handleMouseEnter);
                  btn.addEventListener('mouseleave', handleMouseLeave);
              });
              
              // Handle Save button
              saveBtn?.addEventListener('click', () => {
                  const newToken = inputElement?.value;
                  if (newToken && newToken.trim()) {
                      // Persist via context — syncs to OS keychain, localStorage, and React state.
                      setHfToken(newToken.trim());
                      // Remove modals
                      document.body.removeChild(tokenModalElement);
                      removeModalHF();
                  }
              });
              
              // Handle Cancel button
              cancelBtn?.addEventListener('click', () => {
                  document.body.removeChild(tokenModalElement);
              });
              
              // Handle Close button (X button)
              closeBtn?.addEventListener('click', () => {
                  document.body.removeChild(tokenModalElement);
              });
              
              // Close modal on clicking outside
              tokenModalElement.addEventListener('click', (e) => {
                  if (e.target === tokenModalElement) {
                      document.body.removeChild(tokenModalElement);
                  }
              });
              
              // Close modal on pressing Escape key
              const handleEscape = (e: KeyboardEvent) => {
                  if (e.key === 'Escape') {
                      document.body.removeChild(tokenModalElement);
                  }
              };
              
              document.addEventListener('keydown', handleEscape);
              
              // Focus the input field
              setTimeout(() => {
                  inputElement?.focus();
              }, 100);
          };
          
          // Attach event listener
          getHfTokenBtn?.addEventListener('click', handleGetHfToken);
          
          // Attach event listener
          enterHfTokenBtn?.addEventListener('click', handleEnterHfToken);
          
          // Add hover event listeners for capsule buttons
          const capsuleButtons = modalElement.querySelectorAll('.capsule-btn-gray');
          
          const handleMouseEnter = (e: { target: any }) => {
              (e.target as HTMLElement).style.backgroundColor = '#000000';
              (e.target as HTMLElement).style.color = 'white';
          };
          
          const handleMouseLeave = (e: { target: any }) => {
              (e.target as HTMLElement).style.backgroundColor = 'rgb(233,233,233)';
              (e.target as HTMLElement).style.color = 'black';
          };
          
          capsuleButtons.forEach(btn => {
              btn.addEventListener('mouseenter', handleMouseEnter);
              btn.addEventListener('mouseleave', handleMouseLeave);
          });
          
          // Close modal on clicking outside
          modalElement.addEventListener('click', (e) => {
              if (e.target === modalElement) {
                  removeModalHF();
              }
          });
          }
        } else if (errorText.includes('401 Unauthorized') && model.download_source === 'ollama') {
          // Create a custom modal for Ollama
          const modalHtml = `
            <div id="ollama-modal-model" style="
                position: fixed; 
                top: 0; 
                left: 0; 
                width: 100%; 
                height: 100%; 
                background: rgba(0,0,0,0.5); 
                display: flex; 
                justify-content: center; 
                align-items: center; 
                z-index: 10000;
                font-family: sans-serif;
            ">
                <div style="
                    background: white; 
                    padding: 20px; 
                    border-radius: 12px; 
                    width: 560px; 
                    max-width: 90vw; 
                    box-shadow: 0 10px 25px rgba(0,0,0,0.2);
                    color: black;
                    position: relative;
                " data-theme="light">
                    <button id="close-ollama-modal" style="
                        position: absolute;
                        top: 8px;
                        right: 8px;
                        width: 30px;
                        height: 30px;
                        border-radius: 50%;
                        background: #E5E7EB;
                        color: #374151;
                        border: none;
                        cursor: pointer;
                        font-size: 16px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-weight: bold;
                    ">×</button>
                    <h3 style="color: black; margin-top: 0; margin-bottom: 15px; text-align: center;">Ollama Server Required</h3>
                    <p style="color: black; text-align: center;">Connect to your Ollama server to access models.</p>
                    <div style="display: flex; gap: 10px; margin-top: 20px; justify-content: center;">
                        <button id="setup-ollama-btn-model" class="capsule-btn-gray" style="
                            width: 40%; 
                            padding: 10px 16px; 
                            background: rgb(233,233,233); 
                            color: black; 
                            border: none; 
                            border-radius: 9999px; 
                            cursor: pointer;
                            font-weight: 500;
                            transition: background-color 0.2s, color 0.2s;
                        ">Setup Guide</button>
                        <button id="connect-ollama-btn-model" class="capsule-btn-gray" style="
                            width: 40%; 
                            padding: 10px 16px; 
                            background: rgb(233,233,233); 
                            color: black; 
                            border: none; 
                            border-radius: 9999px; 
                            cursor: pointer;
                            font-weight: 500;
                            transition: background-color 0.2s, color 0.2s;
                        ">Connect</button>
                    </div>
                </div>
            </div>
          `;
          
          // Add modal to DOM
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = modalHtml;
          const modalElement = tempDiv.firstElementChild as HTMLElement;
          document.body.appendChild(modalElement);
          
          // When removing modal, also clean up event listeners
          const removeModalOllama = () => {
              cleanupModalOllama();
              document.body.removeChild(modalElement);
          };
          
          // Clean up event listeners when modal is closed
          const cleanupModalOllama = () => {
              document.removeEventListener('keydown', handleEscape);
          };
          
          // Close modal on pressing Escape key
          const handleEscape = (e: KeyboardEvent) => {
              if (e.key === 'Escape') {
                  removeModalOllama();
              }
          };
          
          document.addEventListener('keydown', handleEscape);
          
          // Get buttons from the modal
          const setupOllamaBtn = document.getElementById('setup-ollama-btn-model') as HTMLButtonElement;
          const connectOllamaBtn = document.getElementById('connect-ollama-btn-model') as HTMLButtonElement;
          const closeOllamaModalBtn = document.getElementById('close-ollama-modal') as HTMLButtonElement;
          
          // Handle "Setup Guide" button
          const handleSetupOllama = async () => {
              // Open Ollama setup page in default browser
              await open('https://ollama.com/download');
              // Remove modal
              removeModalOllama();
          };
          
          // Handle Close button (X button)
          closeOllamaModalBtn?.addEventListener('click', () => {
              document.body.removeChild(modalElement);
          });
          
          // Handle "Connect" button
          const handleConnectOllama = () => {
              // Prompt for the Ollama server URL
              const ollamaUrl = prompt('Please enter your Ollama server URL (e.g., http://localhost:11434):', 'http://localhost:11434');
              if (ollamaUrl && ollamaUrl.trim()) {
                  // Store the Ollama URL in localStorage
                  localStorage.setItem('ollama-url', ollamaUrl.trim());
                  alert('Ollama server URL saved successfully! Please restart the app for changes to take effect.');
                  // Remove modal
                  removeModalOllama();
              }
          };
          
          // Attach event listener
          setupOllamaBtn?.addEventListener('click', handleSetupOllama);
          
          // Attach event listener
          connectOllamaBtn?.addEventListener('click', handleConnectOllama);
          
          // Add hover event listeners for capsule buttons
          const capsuleButtons = modalElement.querySelectorAll('.capsule-btn-gray');
          
          const handleMouseEnter = (e: { target: any }) => {
              (e.target as HTMLElement).style.backgroundColor = '#000000';
              (e.target as HTMLElement).style.color = 'white';
          };
          
          const handleMouseLeave = (e: { target: any }) => {
              (e.target as HTMLElement).style.backgroundColor = 'rgb(233,233,233)';
              (e.target as HTMLElement).style.color = 'black';
          };
          
          capsuleButtons.forEach(btn => {
              btn.addEventListener('mouseenter', handleMouseEnter);
              btn.addEventListener('mouseleave', handleMouseLeave);
          });
          
          // Close modal on clicking outside
          modalElement.addEventListener('click', (e) => {
              if (e.target === modalElement) {
                  removeModalOllama();
              }
          });
        } else {
          showError('Installation Failed', `Failed to start download for ${model.name}`);
        }
      }
    } catch (error) {
      console.error('Failed to install model:', error);
      showError('Installation Error', `Failed to install ${model.name}`);
    }
  };

  const handleRemoveModel = async (modelId: string) => {
    // Find the model to be removed to show details in confirmation
    const model = models.find(m => m.id === modelId);
    if (model) {
      setModelToRemove(model);
      setShowRemoveConfirmation(true);
    }
  };
  
  const confirmRemoveModel = async () => {
    if (!modelToRemove) return;
    
    try {
      // Check backend readiness before making request
      if (!(await checkBackendReadiness())) {
        showError('Backend Not Ready', `Please ensure the offline-intelligence service is started on ${getApiBaseSync()}.`);
        return;
      }
      
      const response = await fetch(`${getApiBaseSync()}/models/remove?model_id=${modelToRemove.id}`, { method: 'DELETE' });
      if (response.ok) {
        showSuccess('Model Removed', 'Model successfully removed');
        fetchModels();
      } else {
        showError('Removal Failed', 'Failed to remove model');
      }
    } catch (error) {
      console.error('Failed to remove model:', error);
      showError('Removal Error', 'Failed to remove model');
    } finally {
      // Close the confirmation modal
      setShowRemoveConfirmation(false);
      setModelToRemove(null);
    }
  };
  
  const cancelRemoveModel = () => {
    setShowRemoveConfirmation(false);
    setModelToRemove(null);
  };

  const handleSwitchModel = async (modelId: string, modelName: string) => {
    // Signal ChatWindow (already mounted by the time this async function runs) that
    // a model switch is in progress.  Uses a window custom-event so no prop-threading
    // is needed across the ModelsPanel → App → ChatWindow component tree.
    window.dispatchEvent(new CustomEvent('aud-io:model-loading', { detail: { loading: true } }));
    try {
      // Background model switch — navigation has already happened instantly on button click.
      // No readiness check needed here; this runs fire-and-forget while the user is in chat.
      const response = await fetch(`${getApiBaseSync()}/models/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: modelId }),
      });

      if (response.ok) {
        const data = await response.json();

        // Check if this is a retry_required response
        if (data.model_path === 'retry_required') {
          // Engine was downloaded, user should retry
          showSuccess('Engine Ready', 'Inference engine has been downloaded. Please try switching models again.');
          return;
        }

        // Check for engine download failure responses
        if (data.model_path === 'engine_download_failed' || data.model_path === 'engine_download_error' || data.model_path === 'no_engine_manager') {
          showError(
            'Engine Download Failed',
            data.message || 'Failed to download the inference engine. Please check your internet connection and try again.'
          );
          return;
        }

        // Navigation already happened instantly — just confirm the model is ready
        showSuccess('Model Ready', `${modelName} is ready`);
      } else if (response.status === 500) {
        // Check if backend is attempting automatic engine download
        const errorData = await response.json().catch(() => ({}));
        showError('Switch Failed', errorData.message || errorData.error || `Failed to switch to ${modelName}`);
      } else {
        const errorData = await response.json().catch(() => ({}));
        showError('Switch Failed', errorData.message || errorData.error || `Failed to switch to ${modelName}`);
      }
    } catch (error) {
      console.error('Failed to switch model:', error);
      showError('Switch Error', `Failed to switch to ${modelName}`);
    } finally {
      // Always clear the loading indicator, even if an error occurred.
      window.dispatchEvent(new CustomEvent('aud-io:model-loading', { detail: { loading: false } }));
    }
  };

  const handlePauseDownload = async (downloadId: string) => {
    try {
      // Check backend readiness before making request
      if (!(await checkBackendReadiness())) {
        showError('Backend Not Ready', `Please ensure the offline-intelligence service is started on ${getApiBaseSync()}.`);
        return;
      }
      
      await fetch(`${getApiBaseSync()}/models/downloads/pause?download_id=${downloadId}`, { method: 'POST' });
      fetchDownloads();
    } catch (e) { console.error('Pause failed:', e); }
  };

  const handleResumeDownload = async (downloadId: string) => {
    try {
      // Check backend readiness before making request
      if (!(await checkBackendReadiness())) {
        showError('Backend Not Ready', `Please ensure the offline-intelligence service is started on ${getApiBaseSync()}.`);
        return;
      }
      
      await fetch(`${getApiBaseSync()}/models/downloads/resume?download_id=${downloadId}`, { method: 'POST' });
      fetchDownloads();
    } catch (e) { console.error('Resume failed:', e); }
  };

  const handleCancelDownload = async (downloadId: string) => {
    try {
      // Check backend readiness before making request
      if (!(await checkBackendReadiness())) {
        showError('Backend Not Ready', `Please ensure the offline-intelligence service is started on ${getApiBaseSync()}.`);
        return;
      }

      // Remove from interrupted-downloads persistence so we don't prompt to resume
      const dl = downloads.find(d => d.download_id === downloadId);
      if (dl) removeInterruptedDownload(dl.model_name);

      await fetch(`${getApiBaseSync()}/models/downloads/cancel?download_id=${downloadId}`, { method: 'POST' });
      fetchDownloads();
    } catch (e) { console.error('Cancel failed:', e); }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const isInstalled = (model: Model) => model.status === 'Installed';


  const isAvailable = (model: Model) => model.status === 'Available' || (typeof model.status === 'object');

  // Find download progress for a model
  const getDownloadForModel = (modelId: string) =>
    downloads.find(d => d.model_id === modelId && (d.status === 'Downloading' || d.status === 'Starting' || d.status === 'Paused' || d.status === 'Queued'));

  // Priority companies order (first priority)
  const priorityCompanies = [
    'google', 'google deepmind', 'deepmind', 'deepseek', 'anthropic', 'moonshot ai', 'meta',
    'openai', 'zlm', 'microsoft', 'x ai', 'xai', 'mistral', 'inflection ai', 'amazon'
  ];

  // Get company priority score (lower = higher priority)
  const getCompanyPriority = (model: Model): number => {
    const provider = (model.provider || model.author || '').toLowerCase();
    const name = model.name.toLowerCase();
    
    for (let i = 0; i < priorityCompanies.length; i++) {
      if (provider.includes(priorityCompanies[i]) || name.includes(priorityCompanies[i])) {
        return i;
      }
    }
    return priorityCompanies.length; // Others come after priority companies
  };

  /** Returns true when an OpenRouter model is free (prompt price == "0" or ""). */
  const isModelFree = (model: Model): boolean => {
    if (model.download_source !== 'openrouter') return false;
    if (model.pricing) {
      return (model.pricing.prompt === '0' || model.pricing.prompt === '') &&
             (model.pricing.completion === '0' || model.pricing.completion === '');
    }
    return model.tags.includes('free') || model.id.includes(':free');
  };

  const sortModels = (list: Model[]) => {
    return [...list].sort((a, b) => {
      switch (sortBy) {
        // ── Free First — free OR models before paid, then HF, alphabetical within ──
        case 'free_first': {
          const aFree = isModelFree(a);
          const bFree = isModelFree(b);
          if (aFree !== bFree) return aFree ? -1 : 1;
          // Within same tier: company priority then name
          const pA = getCompanyPriority(a);
          const pB = getCompanyPriority(b);
          return pA !== pB ? pA - pB : a.name.localeCompare(b.name);
        }

        // ── Name A–Z ──────────────────────────────────────────────────────────
        case 'name':
          return a.name.localeCompare(b.name);

        // ── Name Z–A ──────────────────────────────────────────────────────────
        case 'name_desc':
          return b.name.localeCompare(a.name);

        // ── Provider / Company A–Z ────────────────────────────────────────────
        case 'provider_az': {
          const provA = (a.provider || a.author || 'zzz').toLowerCase();
          const provB = (b.provider || b.author || 'zzz').toLowerCase();
          if (provA !== provB) return provA.localeCompare(provB);
          return a.name.localeCompare(b.name);
        }

        // ── Context window — longest first ────────────────────────────────────
        case 'context_desc': {
          const ctxA = a.context_length ?? 0;
          const ctxB = b.context_length ?? 0;
          if (ctxB !== ctxA) return ctxB - ctxA;
          return a.name.localeCompare(b.name);
        }

        // ── Local model size ──────────────────────────────────────────────────
        case 'size_asc':
          if (a.size_bytes === 0 && b.size_bytes === 0) return a.name.localeCompare(b.name);
          if (a.size_bytes === 0) return 1;
          if (b.size_bytes === 0) return -1;
          return a.size_bytes - b.size_bytes;

        case 'size_desc':
          if (a.size_bytes === 0 && b.size_bytes === 0) return a.name.localeCompare(b.name);
          if (a.size_bytes === 0) return 1;
          if (b.size_bytes === 0) return -1;
          return b.size_bytes - a.size_bytes;

        // ── Best hardware match (local models) ────────────────────────────────
        case 'compatibility': {
          const scoreA = a.compatibility_score ?? (a.download_source === 'openrouter' ? 0.5 : 0);
          const scoreB = b.compatibility_score ?? (b.download_source === 'openrouter' ? 0.5 : 0);
          if (scoreB !== scoreA) return scoreB - scoreA;
          const pA = getCompanyPriority(a);
          const pB = getCompanyPriority(b);
          return pA !== pB ? pA - pB : a.name.localeCompare(b.name);
        }

        // ── Default / Trending ────────────────────────────────────────────────
        default: {
          const pA = getCompanyPriority(a);
          const pB = getCompanyPriority(b);
          if (pA !== pB) return pA - pB;
          return a.name.localeCompare(b.name);
        }
      }
    });
  };

  // Interleave models so each row has both HuggingFace and OpenRouter models
  const interleaveModels = (models: Model[]): Model[] => {
    const hfModels = models.filter(m => m.download_source === 'huggingface');
    const orModels = models.filter(m => m.download_source === 'openrouter');
    const otherModels = models.filter(m => m.download_source !== 'huggingface' && m.download_source !== 'openrouter');
    
    const result: Model[] = [];
    const maxLen = Math.max(hfModels.length, orModels.length);
    
    // Interleave: OR, HF, OR, HF pattern (2 per row assumption)
    for (let i = 0; i < maxLen; i++) {
      if (orModels[i]) result.push(orModels[i]);
      if (hfModels[i]) result.push(hfModels[i]);
    }
    
    // Append remaining models from whichever source has more
    // and other sources at the end
    return [...result, ...otherModels];
  };

  const filteredModels = interleaveModels(sortModels(models.filter(model => {
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = searchQuery === '' ||
      model.name.toLowerCase().includes(searchLower) ||
      model.id.toLowerCase().includes(searchLower) ||
      model.description?.toLowerCase().includes(searchLower) ||
      model.provider?.toLowerCase().includes(searchLower) ||
      model.author?.toLowerCase().includes(searchLower) ||
      model.tags.some(tag => tag.toLowerCase().includes(searchLower));
    if (activeTab === 'installed') return matchesSearch && isInstalled(model);
    if (activeTab === 'available') {
      if (!matchesSearch || !isAvailable(model)) return false;
      // Provider chip filter (OR models only)
      if (providerFilter !== 'all' && model.download_source === 'openrouter') {
        const prov = (model.provider || model.author || '').toLowerCase();
        if (!prov.includes(providerFilter.toLowerCase())) return false;
      }
      // Free-only toggle (OR models only)
      if (freeOnlyFilter && model.download_source === 'openrouter') {
        const isFree = model.pricing
          ? (model.pricing.prompt === '0' || model.pricing.prompt === '') &&
            (model.pricing.completion === '0' || model.pricing.completion === '')
          : model.tags.includes('free');
        if (!isFree) return false;
      }
      return true;
    }
    return matchesSearch;
  })));

  // Derive list of distinct OR providers for filter chips
  const orProviders: string[] = Array.from(
    new Set(
      models
        .filter(m => m.download_source === 'openrouter' && isAvailable(m) && (m.provider || m.author))
        .map(m => (m.provider || m.author || '').toLowerCase())
        .filter(Boolean)
    )
  ).sort();

  if (!isOpen) return null;

  const activeDownloadCount = downloads.filter(d => d.status === 'Downloading' || d.status === 'Starting').length;

  type SortGroup = { group: string; options: { value: SortOption; label: string; description: string }[] };
  const sortGroups: SortGroup[] = [
    {
      group: 'General',
      options: [
        { value: 'free_first',   label: 'Free First',        description: 'Free models before paid' },
        { value: 'compatibility',label: 'Best Match',        description: 'Hardware compatibility' },
        { value: 'provider_az',  label: 'Provider A–Z',      description: 'Sorted by company name' },
      ],
    },
    {
      group: 'Name',
      options: [
        { value: 'name',      label: 'Name A–Z',  description: 'Alphabetical ascending' },
        { value: 'name_desc', label: 'Name Z–A',  description: 'Alphabetical descending' },
      ],
    },
    {
      group: 'Capabilities',
      options: [
        { value: 'context_desc', label: 'Context Length ↓', description: 'Longest context window first' },
        { value: 'size_asc',     label: 'Local: Smallest',  description: 'Smallest local models first' },
        { value: 'size_desc',    label: 'Local: Largest',   description: 'Largest local models first' },
      ],
    },
  ];

  const currentSortLabel = sortGroups
    .flatMap(g => g.options)
    .find(o => o.value === sortBy)?.label ?? 'Sort';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', backgroundColor: 'var(--bg-primary)' }}>
      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-bar centered">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button className="header-icon-button" onClick={onClose} title="Back to chat">
              <ArrowLeft size={18} />
            </button>
            <h1 className="chat-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              Model Management
            </h1>
          </div>
        </div>
      </div>

      {/* Hardware Info Bar */}
      {hardwareInfo && (
        <div style={{
          display: 'flex', justifyContent: 'center', gap: '24px', padding: '10px 16px',
          backgroundColor: 'var(--bg-secondary)',
          fontSize: '13px', color: 'var(--text-secondary)',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Database size={14} />
            RAM: {hardwareInfo.available_ram_gb.toFixed(1)} GB free / {hardwareInfo.total_ram_gb.toFixed(1)} GB
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Cpu size={14} />
            CPU: {hardwareInfo.cpu_cores} cores
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Cpu size={14} />
            GPU: {hardwareInfo.gpu_available
              ? `${hardwareInfo.gpu_vram_gb?.toFixed(1) ?? '?'} GB VRAM`
              : 'Not detected'}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <HardDrive size={14} />
            Storage: {formatBytes(hardwareInfo.storage_used_bytes)} used / {formatBytes(hardwareInfo.storage_available_bytes)} free
          </span>
        </div>
      )}

      {/* Search + Tabs */}
      <div style={{ padding: '16px 16px 0', maxWidth: '960px', margin: '0 auto', width: '100%' }}>
        {/* Search Bar */}
        <div style={{ position: 'relative', marginBottom: '16px' }}>
          <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search by model name, company (Google, Meta, OpenAI...), or tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%', padding: '10px 14px 10px 40px',
              border: '1px solid var(--border-primary)', borderRadius: '12px',
              fontSize: '14px', outline: 'none', backgroundColor: 'var(--bg-input)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        {/* Tabs + Sort/Refresh */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-primary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0' }}>
            {(['available', 'downloads', 'installed'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '10px 20px', fontSize: '14px', fontWeight: 500,
                  border: 'none', background: 'none', cursor: 'pointer',
                  color: activeTab === tab ? 'var(--accent)' : 'var(--text-secondary)',
                  borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                  position: 'relative',
                }}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                {tab === 'downloads' && activeDownloadCount > 0 && (
                  <span style={{
                    position: 'absolute', top: '4px', right: '2px',
                    backgroundColor: '#ef4444', color: '#fff', fontSize: '11px',
                    borderRadius: '50%', width: '18px', height: '18px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {activeDownloadCount}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '2px' }}>
            {/* Sort dropdown */}
            <div style={{ position: 'relative' }}>
              <button
                className="header-button"
                onClick={() => setShowSortDropdown(!showSortDropdown)}
                style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 500 }}
              >
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Sort:</span>
                <span>{currentSortLabel}</span>
                <ChevronDown size={13} />
              </button>
              {showSortDropdown && (
                <div
                  className="dropdown-menu"
                  style={{ right: 0, top: '100%', minWidth: '220px', padding: '4px 0' }}
                >
                  {sortGroups.map((grp, gi) => (
                    <div key={grp.group}>
                      {gi > 0 && (
                        <div style={{
                          height: '1px', backgroundColor: 'var(--border-primary)',
                          margin: '4px 8px',
                        }} />
                      )}
                      <div style={{
                        padding: '4px 12px 2px',
                        fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em',
                        color: 'var(--text-muted)', textTransform: 'uppercase',
                      }}>
                        {grp.group}
                      </div>
                      {grp.options.map(opt => (
                        <button
                          key={opt.value}
                          className="dropdown-item"
                          style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                            padding: '6px 12px',
                            background: sortBy === opt.value ? 'var(--bg-tertiary)' : 'transparent',
                          }}
                          onClick={() => { setSortBy(opt.value); setShowSortDropdown(false); }}
                        >
                          <span style={{ fontSize: '13px', fontWeight: sortBy === opt.value ? 600 : 400 }}>
                            {sortBy === opt.value ? '✓ ' : ''}{opt.label}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>
                            {opt.description}
                          </span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button className="header-button" onClick={refreshCatalog}>
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* API Keys Section */}
      <div style={{ padding: '16px', maxWidth: '960px', margin: '0 auto', width: '100%' }}>
        <div style={{
          padding: '14px 16px', marginBottom: '0',
          backgroundColor: 'var(--bg-secondary)', borderRadius: '12px',
          border: '1px solid var(--border-primary)',
        }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>
            API Keys
          </div>
          
          {/* HuggingFace Token */}
          <div style={{ marginBottom: showHfTokenInput ? '12px' : '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showHfTokenInput ? '10px' : '0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  backgroundColor: hfToken ? '#166534' : '#ef4444',
                  boxShadow: hfToken ? '0 0 8px #166534' : '0 0 8px #ef4444',
                  marginRight: '8px'
                }} />
                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>HuggingFace Token</span>
              </div>
              <button
                onClick={() => setShowHfTokenInput(!showHfTokenInput)}
                style={{
                  padding: '4px 16px', borderRadius: '6px', fontSize: '12px',
                  border: '1px solid var(--border-primary)', backgroundColor: '#fff',
                  color: '#000', cursor: 'pointer', fontWeight: 500,
                }}
              >
                {showHfTokenInput ? 'Hide' : hfToken ? 'Change' : 'Add'}
              </button>
            </div>
            {showHfTokenInput && (
              <div>
                <input
                  id="hf-token-input"
                  type="password"
                  placeholder="hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  value={hfToken || ''}
                  onChange={(e) => {
                    // Context setter handles persistence (keychain + localStorage) for all listeners.
                    setHfToken(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setHfToken((e.target as HTMLInputElement).value.trim());
                    }
                  }}
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: '8px',
                    border: '1px solid var(--border-primary)', fontSize: '13px',
                    backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)',
                    outline: 'none',
                  }}
                />
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                  Required for gated models (Gemma, Llama-2, etc.). Get a token at{' '}
                  <a href="#" onClick={async (e) => {
                    e.preventDefault();
                    await open('https://huggingface.co/settings/tokens');
                  }} style={{ color: 'var(--accent)', textDecoration: 'none', cursor: 'pointer' }}>huggingface.co/settings/tokens</a>
                </p>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  <strong>Note:</strong> After adding your token, you may need to restart the application for it to take effect.
                </p>
              </div>
            )}
          </div>
          
          {/* OpenRouter API Key */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showApiKeyInput ? '10px' : '0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  backgroundColor: openRouterApiKey ? '#166534' : '#ef4444',
                  boxShadow: openRouterApiKey ? '0 0 8px #166534' : '0 0 8px #ef4444',
                  marginRight: '8px'
                }} />
                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>OpenRouter API</span>
              </div>
              <button
                onClick={() => setShowApiKeyInput(!showApiKeyInput)}
                style={{
                  padding: '4px 16px', borderRadius: '6px', fontSize: '12px',
                  border: '1px solid var(--border-primary)', backgroundColor: '#fff',
                  color: '#000', cursor: 'pointer', fontWeight: 500,
                }}
              >
                {showApiKeyInput ? 'Hide' : openRouterApiKey ? 'Change' : 'Add'}
              </button>
            </div>
            {showApiKeyInput && (
              <div>
                <input
                  id="openrouter-api-key-input"
                  type="password"
                  placeholder="sk-or-v1-..."
                  value={openRouterApiKey || ''}
                  onChange={(e) => {
                    // Context setter handles persistence (keychain + localStorage) for all listeners.
                    // Also call the prop callback so ChatWindow / App keeps its value in sync.
                    ctxSetOpenRouterApiKey(e.target.value);
                    onOpenRouterApiKeyChange?.(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = (e.target as HTMLInputElement).value.trim();
                      ctxSetOpenRouterApiKey(val);
                      onOpenRouterApiKeyChange?.(val);
                    }
                  }}
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: '8px',
                    border: '1px solid var(--border-primary)', fontSize: '13px',
                    backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)',
                    outline: 'none',
                  }}
                />
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                  Required for OpenRouter models. Get a key at{' '}
                  <a href="#" onClick={async (e) => {
                    e.preventDefault();
                    await open('https://openrouter.ai/keys');
                  }} style={{ color: 'var(--accent)', textDecoration: 'none', cursor: 'pointer' }}>openrouter.ai/keys</a>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content Area - Scrollable */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', backgroundColor: 'var(--bg-primary)' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          {fetchError && !isLoading && (
            <div style={{
              padding: '14px 16px', marginBottom: '16px',
              backgroundColor: '#fef2f2', borderRadius: '12px',
              border: '1px solid #fca5a5', color: '#991b1b', fontSize: '13px',
            }}>
              {fetchError}
            </div>
          )}

          {isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
              <div style={{
                width: '32px', height: '32px', border: '3px solid var(--border-primary)',
                borderTop: '3px solid var(--accent)', borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }} />
            </div>
          ) : activeTab === 'downloads' ? (
            /* Downloads Tab */
            <div>
              {downloads.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
                  <Download size={40} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                  <p>No active downloads</p>
                  <p style={{ marginTop: '8px', fontSize: '13px' }}>
                    Go to the <button onClick={() => setActiveTab('available')} style={{ color: 'var(--accent)', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px' }}>Available</button> tab to browse and download models.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {downloads.map(download => (
                    <DownloadCard
                      key={download.download_id}
                      download={download}
                      onPause={handlePauseDownload}
                      onResume={handleResumeDownload}
                      onCancel={handleCancelDownload}
                      formatBytes={formatBytes}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Installed / Available Tab */
            <div>
              {/* ── OpenRouter quota bar (available tab, OR key present) ──────── */}
              {activeTab === 'available' && orQuota && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '10px 14px', marginBottom: '14px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '10px', fontSize: '12px',
                }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                    OpenRouter Credits
                  </span>
                  <div style={{ flex: 1, height: '6px', background: 'var(--bg-tertiary)', borderRadius: '9999px', overflow: 'hidden' }}>
                    {orQuota.limit_usd != null && orQuota.limit_usd > 0 ? (
                      <div style={{
                        height: '100%', borderRadius: '9999px',
                        background: 'var(--text-primary)',
                        width: `${Math.min(100, ((orQuota.limit_usd - (orQuota.usage_usd ?? 0)) / orQuota.limit_usd) * 100)}%`,
                        transition: 'width 0.4s ease',
                      }} />
                    ) : (
                      <div style={{ height: '100%', borderRadius: '9999px', background: 'var(--text-primary)', width: '100%', opacity: 0.2 }} />
                    )}
                  </div>
                  <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {orQuota.is_free_tier ? 'Free tier' :
                      orQuota.limit_usd != null
                        ? `$${(orQuota.remaining_usd ?? 0).toFixed(2)} left`
                        : `$${(orQuota.usage_usd ?? 0).toFixed(4)} used`}
                  </span>
                  <button
                    onClick={() => open('https://openrouter.ai/credits')}
                    style={{
                      padding: '3px 10px', borderRadius: '9999px',
                      border: '1px solid var(--border-primary)',
                      background: 'transparent', color: 'var(--text-primary)',
                      fontSize: '11px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                  >
                    Add Credits
                  </button>
                </div>
              )}

              {/* ── Curated company filter chips (available tab) ─────────────── */}
              {activeTab === 'available' && (() => {
                const COMPANIES: Array<{ label: string; filter: string }> = [
                  { label: 'All',          filter: 'all' },
                  { label: 'Free only',    filter: 'free' },
                  { label: 'Google',       filter: 'google' },
                  { label: 'Anthropic',    filter: 'anthropic' },
                  { label: 'Moonshot AI',  filter: 'moonshot' },
                  { label: 'OpenAI',       filter: 'openai' },
                  { label: 'Nvidia',       filter: 'nvidia' },
                  { label: 'Kimi',         filter: 'kimi' },
                  { label: 'DeepSeek',     filter: 'deepseek' },
                  { label: 'Qwen',         filter: 'qwen' },
                ];
                return (
                  <div style={{
                    display: 'flex', flexWrap: 'wrap', gap: '6px',
                    marginBottom: '16px', justifyContent: 'center', alignItems: 'center',
                  }}>
                    {COMPANIES.map(({ label, filter }) => {
                      const isActive = filter === 'free'
                        ? freeOnlyFilter
                        : filter === 'all'
                          ? providerFilter === 'all' && !freeOnlyFilter
                          : providerFilter === filter;
                      return (
                        <button
                          key={filter}
                          onClick={() => {
                            if (filter === 'free') {
                              setFreeOnlyFilter(f => !f);
                              setProviderFilter('all');
                            } else if (filter === 'all') {
                              setProviderFilter('all');
                              setFreeOnlyFilter(false);
                            } else {
                              setProviderFilter(providerFilter === filter ? 'all' : filter);
                              setFreeOnlyFilter(false);
                            }
                          }}
                          style={{
                            padding: '4px 14px', borderRadius: '9999px', fontSize: '11px', fontWeight: 600,
                            border: `1px solid ${isActive ? 'var(--text-primary)' : 'var(--border-primary)'}`,
                            background: isActive ? 'var(--text-primary)' : 'transparent',
                            color: isActive ? 'var(--bg-primary)' : 'var(--text-secondary)',
                            cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                );
              })()}

              {filteredModels.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
                  <Download size={40} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                  <p>{searchQuery ? 'No models match your search' : `No ${activeTab} models`}</p>
                  {activeTab === 'installed' && !searchQuery && (
                    <p style={{ marginTop: '8px', fontSize: '13px' }}>
                      Go to the <button onClick={() => setActiveTab('available')} style={{ color: 'var(--accent)', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px' }}>Available</button> tab to browse and install models.
                    </p>
                  )}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
                  {filteredModels.map(model => {
                    const dl = getDownloadForModel(model.id);
                    return (
                      <ModelCard
                        key={model.id}
                        model={model}
                        download={dl}
                        isInstalled={isInstalled(model)}
                        isAvailable={isAvailable(model)}
                        onInstall={handleInstallModel}
                        onRemove={handleRemoveModel}
                        onPauseDownload={handlePauseDownload}
                        onResumeDownload={handleResumeDownload}
                        onCancelDownload={handleCancelDownload}
                        formatBytes={formatBytes}
                        selectedModel={selectedModel}
                        onSelectModel={onSelectModel}
                        onToggleOnlineMode={onToggleOnlineMode}
                        hasApiKey={!!(ctxOpenRouterApiKey || openRouterApiKey)}
                        activeModelInfo={activeModelInfo}
                        onSwitchModel={handleSwitchModel}
                        onOpenRouterApiKeyChange={onOpenRouterApiKeyChange}
                        onRefreshModels={fetchModels}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Download notification bubble (shown on other pages via App-level, but also here for context) */}
      {activeTab !== 'downloads' && activeDownloadCount > 0 && (
        <div className="download-bubble">
          <div className="download-bubble-header">
            <span className="download-bubble-title">
              {activeDownloadCount} download{activeDownloadCount > 1 ? 's' : ''} in progress
            </span>
            <button className="download-bubble-close" onClick={() => setActiveTab('downloads')}>
              View
            </button>
          </div>
          {downloads.filter(d => d.status === 'Downloading').slice(0, 2).map(dl => (
            <div key={dl.download_id} style={{ marginBottom: '6px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '3px' }}>{dl.model_name}</div>
              <div style={{ width: '100%', height: '4px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(dl.percentage ?? 0, 100)}%`, height: '100%', backgroundColor: 'var(--accent)', borderRadius: '2px', transition: 'width 0.3s' }} />
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                {(dl.percentage ?? 0).toFixed(1)}% - {formatBytes(dl.bytes_downloaded ?? 0)} / {dl.total_bytes ? formatBytes(dl.total_bytes) : '?'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Engine auto-download overlay */}
      {engineAutoDownloading && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: '12px',
          padding: '24px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
          zIndex: 9999,
          minWidth: '400px',
        }}>
          <h3 style={{ margin: '0 0 12px 0' }}>Preparing Inference Engine</h3>
          <p style={{ margin: '0 0 16px 0', color: 'var(--text-secondary)' }}>
            Downloading the inference engine automatically. This is a one-time setup.
          </p>
          <div style={{
            width: '100%',
            height: '4px',
            backgroundColor: 'var(--bg-tertiary)',
            borderRadius: '2px',
            overflow: 'hidden',
          }}>
            <div style={{
              width: '50%',
              height: '100%',
              backgroundColor: 'var(--accent)',
              animation: 'indeterminate 1.5s infinite',
            }} />
          </div>
        </div>
      )}

      {/* Model Removal Confirmation Modal */}
      {showRemoveConfirmation && modelToRemove && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 10000,
        }}>
          <div style={{
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)',
          }}>
            <h3 style={{ margin: '0 0 16px 0', color: 'var(--text-primary)', fontSize: '18px' }}>Confirm Model Removal</h3>
            <p style={{ margin: '0 0 16px 0', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Are you sure you want to permanently remove this model? This action cannot be undone.
            </p>
            
            {/* Model Details */}
            <div style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '16px',
            }}>
              <h4 style={{ margin: '0 0 12px 0', color: 'var(--text-primary)', fontSize: '16px' }}>{modelToRemove.name}</h4>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Format</div>
                  <div style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 500 }}>{modelToRemove.format.toUpperCase()}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Size</div>
                  <div style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 500 }}>{formatBytes(modelToRemove.size_bytes)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Parameters</div>
                  <div style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 500 }}>
                    {modelToRemove.parameters || 'N/A'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Source</div>
                  <div style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 500 }}>
                    {modelToRemove.download_source ? modelToRemove.download_source.charAt(0).toUpperCase() + modelToRemove.download_source.slice(1) : 'Local'}
                  </div>
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {(modelToRemove.tags || []).slice(0, 5).map((tag, index) => (
                  <span key={index} style={{
                    fontSize: '11px',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    color: 'var(--accent)',
                    padding: '4px 8px',
                    borderRadius: '6px',
                  }}>
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={cancelRemoveModel}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-primary)',
                  backgroundColor: 'transparent',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmRemoveModel}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#ef4444',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Remove Model
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Model Card Component with inline download progress
const ModelCard: React.FC<{
  model: Model;
  download?: DownloadProgress;
  isInstalled: boolean;
  isAvailable: boolean;
  onInstall: (m: Model) => void;
  onRemove: (id: string) => void;
  onPauseDownload: (id: string) => void;
  onResumeDownload: (id: string) => void;
  onCancelDownload: (id: string) => void;
  formatBytes: (b: number) => string;
  selectedModel?: SelectedModel | null;
  onSelectModel?: (model: SelectedModel | null) => void;
  onToggleOnlineMode?: (isOnline: boolean) => void;
  hasApiKey?: boolean;
  activeModelInfo?: ActiveModelInfo | null;
  onSwitchModel?: (modelId: string, modelName: string) => void;
  onOpenRouterApiKeyChange?: (key: string) => void;
  setApiKey?: (provider: 'openrouter' | 'huggingface', key: string) => void;
  onRefreshModels?: () => void;
}> = ({ model, download, isInstalled, isAvailable, onInstall, onRemove, onPauseDownload, onResumeDownload, onCancelDownload, formatBytes, selectedModel, onSelectModel, onToggleOnlineMode, hasApiKey, activeModelInfo, onSwitchModel, onOpenRouterApiKeyChange, setApiKey, onRefreshModels }) => {
  // Read from context so this card is always in sync with the shared key state.
  const {
    hfToken: ctxHfToken,
    setHfToken: ctxSetHfToken,
    setOpenRouterApiKey: ctxSetOpenRouterApiKey,
  } = useApiKeys();

  // Inline React modal state (replaces DOM-injected showOpenRouterApiKeyModal / showHuggingFaceApiKeyModal)
  const [orModalStep, setOrModalStep] = useState<'none' | 'choice' | 'input'>('none');
  const [orKeyInput, setOrKeyInput] = useState('');
  const [orKeyError, setOrKeyError] = useState(false);
  const [orKeyInputError, setOrKeyInputError] = useState('');
  const orKeyRef = useRef<HTMLInputElement>(null);

  const [hfModalStep, setHfModalStep] = useState<'none' | 'choice' | 'input'>('none');
  const [hfTokenInput, setHfTokenInput] = useState('');
  const [hfTokenError, setHfTokenError] = useState(false);
  const [hfTokenInputError, setHfTokenInputError] = useState('');
  const hfTokenRef = useRef<HTMLInputElement>(null);

  // Gated model access polling state
  const [gatedAccessStatus, setGatedAccessStatus] = useState<'idle' | 'checking' | 'approved' | 'not_approved' | 'error'>('idle');
  const gatedPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Set to true when requestGatedAccess opens the HF token modal so saveHfToken
  // knows to continue the gated-access flow instead of calling onInstall.
  const pendingGatedRequestRef = useRef(false);

  // Focus input when switching to the input step
  useEffect(() => {
    if (orModalStep === 'input') setTimeout(() => orKeyRef.current?.focus(), 50);
  }, [orModalStep]);
  useEffect(() => {
    if (hfModalStep === 'input') setTimeout(() => hfTokenRef.current?.focus(), 50);
  }, [hfModalStep]);

  // Clear gated poll on unmount
  useEffect(() => {
    return () => {
      if (gatedPollRef.current) clearInterval(gatedPollRef.current);
    };
  }, []);

  const closeOrModal = () => { setOrModalStep('none'); setOrKeyInput(''); setOrKeyError(false); };
  const closeHfModal = () => { setHfModalStep('none'); setHfTokenInput(''); setHfTokenError(false); pendingGatedRequestRef.current = false; };

  /** Start polling the backend for HF gated-model access approval. */
  const startGatedAccessPolling = async (token: string) => {
    const repoId = model.id;
    const filename = model.filename || '';
    await open(`https://huggingface.co/${repoId}`);
    setGatedAccessStatus('checking');
    let attempts = 0;
    const maxAttempts = 30; // 30 × 10 s = 5 minutes
    gatedPollRef.current = setInterval(async () => {
      attempts++;
      try {
        const params = new URLSearchParams({ repo_id: repoId, filename });
        if (token) params.append('hf_token', token);
        const resp = await fetch(`${getApiBaseSync()}/models/hf/access?${params}`);
        if (resp.ok) {
          const data = await resp.json();
          if (data.can_download) {
            clearInterval(gatedPollRef.current!);
            gatedPollRef.current = null;
            setGatedAccessStatus('approved');
            return;
          }
        }
      } catch {
        // Network hiccup — keep polling
      }
      if (attempts >= maxAttempts) {
        clearInterval(gatedPollRef.current!);
        gatedPollRef.current = null;
        setGatedAccessStatus('error');
      }
    }, 10_000);
  };

  /**
   * Handle "Request Access" click on a gated HuggingFace model.
   * If the user has no HF token yet, open the token modal first; the modal's
   * save handler will automatically continue the access-check flow.
   */
  const requestGatedAccess = async () => {
    if (!ctxHfToken) {
      // No token — prompt the user to add one before polling starts.
      // Without a token every poll would return "not approved" endlessly.
      pendingGatedRequestRef.current = true;
      setHfModalStep('choice');
      return;
    }
    await startGatedAccessPolling(ctxHfToken);
  };

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
    
    ctxSetOpenRouterApiKey(key);
    onOpenRouterApiKeyChange?.(key);
    closeOrModal();
    onRefreshModels?.();
  };

  const saveHfToken = async () => {
    const token = hfTokenInput.trim();
    if (!token) { setHfTokenError(true); setTimeout(() => setHfTokenError(false), 1000); return; }

    // Verify the token first
    const verification = await verifyApiKey('huggingface', token);
    if (!verification.valid) {
      setHfTokenError(true);
      setHfTokenInputError(verification.message);
      setTimeout(() => { setHfTokenError(false); setHfTokenInputError(''); }, 3000);
      return;
    }

    ctxSetHfToken(token);
    closeHfModal();

    if (pendingGatedRequestRef.current) {
      // The modal was opened because "Request Access" was clicked without a token.
      // Now that we have one, automatically continue the gated-access flow.
      pendingGatedRequestRef.current = false;
      await startGatedAccessPolling(token);
    } else {
      onInstall(model);
    }
  };

  const isOpenRouter = model.download_source === 'openrouter';
  const modelIdClean = isOpenRouter
    ? (model.id.startsWith('openrouter:') ? model.id.slice(11) : model.id)
    : model.id;
  const isSelected = selectedModel?.id === modelIdClean;
  
  const isActiveModel = () => {
    return activeModelInfo && activeModelInfo.model_path && 
      (activeModelInfo.model_path.includes(model.id) || 
       (model.filename && activeModelInfo.model_path.includes(model.filename)) ||
       activeModelInfo.model_name.includes(model.name));
  };
  
  // Define helper function locally to ensure availability
  const getSourceLabel = (source?: string): string => {
    switch (source) {
      case 'huggingface': return 'HuggingFace';
      case 'ollama': return 'Ollama';
      case 'openrouter': return 'OpenRouter';
      default: return 'Local';
    }
  };
  
  return (
    <>
    <div style={{
      background: 'var(--bg-secondary)',
      border: isSelected ? '2px solid var(--text-primary)' : '1px solid var(--border-primary)',
      borderRadius: '16px', padding: isSelected ? '15px' : '16px',
      transition: 'all 0.2s ease',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
      display: 'flex',
      flexDirection: 'column',
      minHeight: '180px',
    }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-1px)';
        e.currentTarget.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.1)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.06)';
      }}
    >
      {/* Card Header - source badge without logo */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <h3 style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)', flex: 1, marginRight: '8px' }}>{model.name}</h3>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
          {model.is_gated && (
            <span title="Requires HuggingFace access approval" style={{
              fontSize: '11px', padding: '4px 8px', borderRadius: '999px',
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border-primary)',
            }}>Gated</span>
          )}
          {model.download_source === 'openrouter' && model.pricing && (
            <span style={{
              fontSize: '11px', padding: '4px 8px', borderRadius: '999px',
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border-primary)',
            }}>
              {(model.pricing.prompt === '0' || model.pricing.prompt === '')
                ? 'Free' : `$${parseFloat(model.pricing.prompt).toExponential(0)}/tok`}
            </span>
          )}
          <span style={{
            fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '999px',
            backgroundColor: 'var(--bg-tertiary)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-primary)',
            whiteSpace: 'nowrap',
          }}>
            {getSourceLabel(model.download_source)}
          </span>
        </div>
      </div>

      {/* Description */}
      {model.description && (
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {model.description}
        </p>
      )}

      {/* Meta badges - Format, Provider, Parameters, Size (last) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
        <span style={{ fontSize: '12px', backgroundColor: 'rgba(255, 255, 255, 0.1)', padding: '2px 8px', borderRadius: '6px', color: 'var(--text-secondary)' }}>
          {model.format.toUpperCase()}
        </span>
        {(model.author || model.provider) && (
          <span style={{ fontSize: '12px', backgroundColor: 'rgba(255, 255, 255, 0.1)', padding: '2px 8px', borderRadius: '6px', color: 'var(--text-secondary)' }}>
            {model.provider || model.author}
          </span>
        )}
        {model.parameters && (
          <span style={{ fontSize: '12px', backgroundColor: 'var(--bg-tertiary)', padding: '2px 8px', borderRadius: '6px', color: 'var(--text-primary)', fontWeight: 600 }}>
            {model.parameters}
          </span>
        )}
        {/* Extract parameters from name if not explicitly set */}
        {!model.parameters && (() => {
          const paramMatch = model.name.match(/(\d+(?:\.\d+)?[BMK]?)(?:\s*params?|\s*parameters?|$)/i) ||
                             model.name.match(/(\d+(?:\.\d+)?B)\b/i);
          return paramMatch ? (
            <span style={{ fontSize: '12px', backgroundColor: 'var(--bg-tertiary)', padding: '2px 8px', borderRadius: '6px', color: 'var(--text-primary)', fontWeight: 600 }}>
              {paramMatch[1].toUpperCase()}
            </span>
          ) : null;
        })()}
        {model.size_bytes > 0 && (
          <span style={{ fontSize: '12px', backgroundColor: 'rgba(255, 255, 255, 0.1)', padding: '2px 8px', borderRadius: '6px', color: 'var(--text-secondary)' }}>
            {formatBytes(model.size_bytes)}
          </span>
        )}
      </div>

      {/* Tags */}
      {model.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '12px' }}>
          {model.tags.slice(0, 5).map(tag => (
            <span key={tag} style={{ fontSize: '11px', color: 'var(--text-muted)' }}>#{tag}</span>
          ))}
          {model.tags.length > 5 && (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>+{model.tags.length - 5}</span>
          )}
        </div>
      )}

      {/* Inline download progress */}
      {download && (
        <div style={{ marginBottom: '12px', padding: '12px', backgroundColor: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
          {/* Progress bar */}
          <div style={{ width: '100%', backgroundColor: 'var(--bg-tertiary)', borderRadius: '9999px', height: '10px', marginBottom: '10px', overflow: 'hidden' }}>
            <div style={{
              width: `${Math.min(download.percentage ?? 0, 100)}%`,
              backgroundColor: 'var(--text-primary)',
              opacity: download.status === 'Paused' ? 0.4 : download.status === 'Queued' ? 0.3 : 1,
              height: '10px', borderRadius: '9999px',
              transition: 'width 0.3s ease',
            }} />
          </div>

          {/* Metrics Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '8px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Progress</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{(download.percentage ?? 0).toFixed(1)}%</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Downloaded</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {formatBytes(download.bytes_downloaded ?? 0)}
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '2px' }}>
                  / {download.total_bytes ? formatBytes(download.total_bytes) : '?'}
                </span>
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Speed</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {download.speed_bps > 0 ? formatBytes(download.speed_bps) + '/s' : '--'}
              </div>
            </div>
          </div>
          
          {/* ETA */}
          {download.speed_bps > 0 && download.estimated_time_remaining != null && download.estimated_time_remaining > 0 && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              gap: '6px',
              padding: '6px',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: '6px',
              marginBottom: '8px'
            }}>
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--text-muted)' }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                <strong style={{ color: 'var(--text-primary)' }}>
                  {Math.round(download.estimated_time_remaining / 60)}m {Math.round(download.estimated_time_remaining % 60)}s
                </strong> remaining
              </span>
            </div>
          )}
          {/* Pause / Resume / Stop buttons */}
          <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
            {download.status === 'Downloading' && (
              <button onClick={() => onPauseDownload(download.download_id)} style={{
                display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 12px',
                borderRadius: '9999px', border: '1px solid var(--border-primary)', backgroundColor: 'transparent',
                color: 'var(--text-primary)', fontSize: '12px', cursor: 'pointer', fontWeight: 500,
              }}>
                <Pause size={12} /> Pause
              </button>
            )}
            {download.status === 'Paused' && (
              <button onClick={() => onResumeDownload(download.download_id)} style={{
                display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 12px',
                borderRadius: '9999px', border: '1px solid var(--text-primary)', backgroundColor: 'var(--text-primary)',
                color: 'var(--bg-primary)', fontSize: '12px', cursor: 'pointer', fontWeight: 500,
              }}>
                <Play size={12} /> Resume
              </button>
            )}
            <button onClick={() => onCancelDownload(download.download_id)} style={{
              display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 12px',
              borderRadius: '9999px', border: '1px solid var(--border-primary)', backgroundColor: 'transparent',
              color: 'var(--text-primary)', fontSize: '12px', cursor: 'pointer', fontWeight: 500,
            }}>
              <Square size={12} /> Stop
            </button>
          </div>
        </div>
      )}

      {/* Spacer to push buttons to bottom */}
      <div style={{ flex: 1 }} />

      {/* Action Buttons - bottom right */}
      {!download && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', marginTop: 'auto' }}>
          {/* Use button for installed local models */}
          {isInstalled && (
            <>
              <button
                onClick={() => {
                  // Switch to offline mode since we're selecting a local model
                  onToggleOnlineMode?.(false);
                  // Navigate to chat instantly — model initialises in the background
                  onSelectModel?.({ id: model.id, name: model.name, source: 'local' });
                  // Fire-and-forget: kick off backend model loading while user is already in chat
                  onSwitchModel?.(model.id, model.name);
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '8px 16px', borderRadius: '9999px',
                  border: '1px solid var(--text-primary)',
                  backgroundColor: isSelected || isActiveModel() ? 'transparent' : 'var(--text-primary)',
                  color: isSelected || isActiveModel() ? 'var(--text-primary)' : 'var(--bg-primary)',
                  fontSize: '12px', cursor: 'pointer', fontWeight: 600,
                  height: '34px',
                }}
              >
                {isSelected || isActiveModel() ? '✓ Active' : 'Use Model'}
              </button>
              <button
                onClick={() => onRemove(model.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '8px 14px', borderRadius: '9999px', border: '1px solid var(--border-primary)',
                  backgroundColor: 'transparent', color: 'var(--text-secondary)', fontSize: '12px',
                  cursor: 'pointer', fontWeight: 500, height: '34px',
                }}
              >
                <Trash2 size={14} /> Remove
              </button>
            </>
          )}
          {/* OpenRouter models: Use Model directly (no download needed) */}
          {isOpenRouter && isAvailable && (
            <button
              onClick={() => {
                if (!hasApiKey) {
                  setOrModalStep('choice');
                  return;
                }
                onSelectModel?.({ id: modelIdClean, name: model.name, source: 'openrouter', pricing: model.pricing });
                // Switch to online mode since we're selecting an OpenRouter model
                onToggleOnlineMode?.(true);
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 16px', borderRadius: '9999px',
                border: '1px solid var(--text-primary)',
                backgroundColor: isSelected ? 'transparent' : 'var(--text-primary)',
                color: isSelected ? 'var(--text-primary)' : 'var(--bg-primary)',
                fontSize: '12px', cursor: 'pointer', fontWeight: 600, textAlign: 'center',
                height: '34px',
              }}
            >
              {isSelected ? '✓ In Use' : !hasApiKey ? 'Get API Key' : 'Use Model'}
            </button>
          )}
          {/* Non-OpenRouter available models: Install / gated flow */}
          {!isOpenRouter && isAvailable && (() => {
            const isHf = model.download_source === 'huggingface';
            const isGated = !!model.is_gated;

            // ── Gated: approved after polling → show Install Now ──
            if (isGated && gatedAccessStatus === 'approved') {
              return (
                <button
                  onClick={() => onInstall(model)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '8px 16px', borderRadius: '9999px', border: '1px solid var(--text-primary)',
                    backgroundColor: 'var(--text-primary)', color: 'var(--bg-primary)', fontSize: '12px',
                    cursor: 'pointer', fontWeight: 600, height: '34px',
                  }}
                >
                  <Download size={14} /> Install Now
                </button>
              );
            }

            // ── Gated: polling in progress ──
            if (isGated && gatedAccessStatus === 'checking') {
              return (
                <button
                  disabled
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '8px 16px', borderRadius: '9999px', border: '1px solid var(--border-primary)',
                    backgroundColor: 'transparent', color: 'var(--text-muted)', fontSize: '12px',
                    cursor: 'not-allowed', fontWeight: 500, height: '34px', opacity: 0.7,
                  }}
                >
                  <div style={{
                    width: '12px', height: '12px',
                    border: '2px solid var(--border-primary)',
                    borderTop: '2px solid var(--text-primary)',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }} />
                  Checking…
                </button>
              );
            }

            // ── Gated: request access ──
            if (isGated) {
              return (
                <button
                  onClick={requestGatedAccess}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '8px 16px', borderRadius: '9999px', border: '1px solid var(--border-primary)',
                    backgroundColor: 'transparent', color: 'var(--text-primary)', fontSize: '12px',
                    cursor: 'pointer', fontWeight: 600, height: '34px',
                  }}
                >
                  Request Access
                </button>
              );
            }

            // ── Normal HuggingFace install ──
            return (
              <button
                onClick={() => {
                  if (isHf && !ctxHfToken) {
                    setHfModalStep('choice');
                  } else {
                    onInstall(model);
                  }
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '8px 16px', borderRadius: '9999px', border: '1px solid var(--text-primary)',
                  backgroundColor: 'var(--text-primary)', color: 'var(--bg-primary)', fontSize: '12px',
                  cursor: 'pointer', fontWeight: 600, height: '34px',
                }}
              >
                <Download size={14} /> Install
              </button>
            );
          })()}
        </div>
      )}

      {/* Show Installing... button when download is active */}
      {download && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', marginTop: 'auto' }}>
          <button
            disabled
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 16px', borderRadius: '9999px', border: '1px solid var(--border-primary)',
              backgroundColor: 'transparent',
              color: 'var(--text-muted)', fontSize: '12px',
              cursor: 'not-allowed', fontWeight: 500, opacity: 0.7,
              height: '34px',
            }}
          >
            {download.status === 'Queued' ? 'Queued...' : `Installing... ${(download.percentage ?? 0).toFixed(0)}%`}
          </button>
        </div>
      )}
    </div>

      {/* ── OpenRouter API Key Modal (React portal — always inside Tauri webview) ── */}
      {orModalStep !== 'none' && createPortal(
        <div
          style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.55)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000, fontFamily: 'sans-serif' }}
          onClick={(e) => { if (e.target === e.currentTarget) closeOrModal(); }}
        >
          <div style={{ background: 'var(--bg-modal)', padding: '24px', borderRadius: '12px', width: '500px', maxWidth: '90vw', boxShadow: '0 10px 30px rgba(0,0,0,0.25)', color: 'var(--text-primary)', position: 'relative' }}>
            {/* Close */}
            <button onClick={closeOrModal} style={{ position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: '50%', background: 'var(--bg-hover)', color: 'var(--text-primary)', border: 'none', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>×</button>
            {orModalStep === 'choice' && (
              <>
                <h3 style={{ color: 'var(--text-primary)', marginTop: 0, marginBottom: 12, textAlign: 'center', fontSize: 18 }}>OpenRouter API Key Needed</h3>
                <p style={{ color: 'var(--text-secondary)', textAlign: 'center', fontSize: 14, marginBottom: 20 }}>Access powerful AI models by adding your OpenRouter API key.</p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                  <button
                    onClick={() => { open('https://openrouter.ai/keys'); closeOrModal(); }}
                    style={{ width: '42%', padding: '10px 16px', background: 'var(--bg-hover)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', borderRadius: 9999, cursor: 'pointer', fontWeight: 500, transition: 'all 0.15s' }}
                    onMouseOver={(e) => { e.currentTarget.style.background = 'var(--text-primary)'; e.currentTarget.style.color = 'var(--bg-modal)'; }}
                    onMouseOut={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                  >Create API Key</button>
                  <button
                    onClick={() => setOrModalStep('input')}
                    style={{ width: '42%', padding: '10px 16px', background: 'var(--bg-hover)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', borderRadius: 9999, cursor: 'pointer', fontWeight: 500, transition: 'all 0.15s' }}
                    onMouseOver={(e) => { e.currentTarget.style.background = 'var(--text-primary)'; e.currentTarget.style.color = 'var(--bg-modal)'; }}
                    onMouseOut={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                  >Enter Existing Key</button>
                </div>
              </>
            )}
            {orModalStep === 'input' && (
              <>
                {/* Back */}
                <button onClick={() => setOrModalStep('choice')} style={{ position: 'absolute', top: 8, left: 8, width: 30, height: 30, borderRadius: '50%', background: 'var(--bg-hover)', color: 'var(--text-primary)', border: 'none', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>←</button>
                <h3 style={{ color: 'var(--text-primary)', marginTop: 0, marginBottom: 10, textAlign: 'center', fontSize: 18 }}>Enter OpenRouter API Key</h3>
                <p style={{ color: 'var(--text-secondary)', textAlign: 'center', fontSize: 13, marginBottom: 16 }}>
                  Paste your key below. Get one at{' '}
                  <a href="#" onClick={(e) => { e.preventDefault(); open('https://openrouter.ai/keys'); }} style={{ color: '#2563eb', textDecoration: 'none' }}>openrouter.ai/keys</a>
                </p>
                <input
                  ref={orKeyRef}
                  type="password"
                  placeholder="sk-or-v1-..."
                  value={orKeyInput}
                  onChange={(e) => setOrKeyInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveOrKey()}
                  style={{ width: '100%', padding: '12px 16px', borderRadius: 8, border: `1px solid ${orKeyError ? '#ef4444' : 'var(--border-primary)'}`, background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box', marginBottom: 6, outline: 'none' }}
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

      {/* ── HuggingFace Token Modal (React portal — always inside Tauri webview) ── */}
      {hfModalStep !== 'none' && createPortal(
        <div
          style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.55)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000, fontFamily: 'sans-serif' }}
          onClick={(e) => { if (e.target === e.currentTarget) closeHfModal(); }}
        >
          <div style={{ background: 'var(--bg-modal)', padding: '24px', borderRadius: '12px', width: '500px', maxWidth: '90vw', boxShadow: '0 10px 30px rgba(0,0,0,0.25)', color: 'var(--text-primary)', position: 'relative' }}>
            {/* Close */}
            <button onClick={closeHfModal} style={{ position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: '50%', background: 'var(--bg-hover)', color: 'var(--text-primary)', border: 'none', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>×</button>
            {hfModalStep === 'choice' && (
              <>
                <h3 style={{ color: 'var(--text-primary)', marginTop: 0, marginBottom: 12, textAlign: 'center', fontSize: 18 }}>HuggingFace Token Needed</h3>
                <p style={{ color: 'var(--text-secondary)', textAlign: 'center', fontSize: 14, marginBottom: 20 }}>Access gated models by adding your HuggingFace token.</p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                  <button
                    onClick={() => { open('https://huggingface.co/settings/tokens'); closeHfModal(); }}
                    style={{ width: '42%', padding: '10px 16px', background: 'var(--bg-hover)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', borderRadius: 9999, cursor: 'pointer', fontWeight: 500, transition: 'all 0.15s' }}
                    onMouseOver={(e) => { e.currentTarget.style.background = 'var(--text-primary)'; e.currentTarget.style.color = 'var(--bg-modal)'; }}
                    onMouseOut={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                  >Create API Key</button>
                  <button
                    onClick={() => setHfModalStep('input')}
                    style={{ width: '42%', padding: '10px 16px', background: 'var(--bg-hover)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', borderRadius: 9999, cursor: 'pointer', fontWeight: 500, transition: 'all 0.15s' }}
                    onMouseOver={(e) => { e.currentTarget.style.background = 'var(--text-primary)'; e.currentTarget.style.color = 'var(--bg-modal)'; }}
                    onMouseOut={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                  >Enter Existing Key</button>
                </div>
              </>
            )}
            {hfModalStep === 'input' && (
              <>
                {/* Back */}
                <button onClick={() => setHfModalStep('choice')} style={{ position: 'absolute', top: 8, left: 8, width: 30, height: 30, borderRadius: '50%', background: 'var(--bg-hover)', color: 'var(--text-primary)', border: 'none', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>←</button>
                <h3 style={{ color: 'var(--text-primary)', marginTop: 0, marginBottom: 10, textAlign: 'center', fontSize: 18 }}>Enter HuggingFace Token</h3>
                <p style={{ color: 'var(--text-secondary)', textAlign: 'center', fontSize: 13, marginBottom: 16 }}>
                  Paste your token below. Get one at{' '}
                  <a href="#" onClick={(e) => { e.preventDefault(); open('https://huggingface.co/settings/tokens'); }} style={{ color: '#2563eb', textDecoration: 'none' }}>huggingface.co/settings/tokens</a>
                </p>
                <input
                  ref={hfTokenRef}
                  type="password"
                  placeholder="hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  value={hfTokenInput}
                  onChange={(e) => setHfTokenInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveHfToken()}
                  style={{ width: '100%', padding: '12px 16px', borderRadius: 8, border: `1px solid ${hfTokenError ? '#ef4444' : 'var(--border-primary)'}`, background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box', marginBottom: 6, outline: 'none' }}
                />
                {hfTokenInputError && (
                  <p style={{ color: '#ef4444', fontSize: '12px', marginBottom: 12, textAlign: 'center' }}>{hfTokenInputError}</p>
                )}
                <button
                  onClick={saveHfToken}
                  style={{ width: '100%', padding: '11px 16px', background: '#000', color: 'white', border: 'none', borderRadius: 9999, cursor: 'pointer', fontWeight: 600, fontSize: 14 }}
                  onMouseOver={(e) => { e.currentTarget.style.background = '#1e40af'; }}
                  onMouseOut={(e) => { e.currentTarget.style.background = '#000'; }}
                >Save Token</button>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

// Download Card for the Downloads tab
const DownloadCard: React.FC<{
  download: DownloadProgress;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
  formatBytes: (b: number) => string;
}> = ({ download, onPause, onResume, onCancel, formatBytes }) => {
  return (
    <div style={{
      backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)',
      borderRadius: '12px', padding: '16px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <h3 style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)' }}>{download.model_name}</h3>
        <span style={{
          fontSize: '12px', padding: '3px 10px', borderRadius: '9999px', fontWeight: 500,
          backgroundColor: 'var(--bg-tertiary)',
          color: 'var(--text-secondary)',
          border: '1px solid var(--border-primary)',
        }}>
          {download.status}
        </span>
      </div>

      {/* Progress bar */}
      {(download.status === 'Downloading' || download.status === 'Starting' || download.status === 'Paused' || download.status === 'Queued') && (
        <>
          <div style={{ width: '100%', backgroundColor: 'var(--bg-tertiary)', borderRadius: '9999px', height: '10px', marginBottom: '10px', overflow: 'hidden' }}>
            <div style={{
              width: `${Math.min(download.percentage ?? 0, 100)}%`,
              backgroundColor: 'var(--text-primary)',
              opacity: download.status === 'Paused' ? 0.4 : download.status === 'Queued' ? 0.3 : 1,
              height: '10px', borderRadius: '9999px',
              transition: 'width 0.3s ease',
            }} />
          </div>

          {/* Download Metrics Grid */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(3, 1fr)', 
            gap: '8px', 
            marginBottom: '10px',
            padding: '10px',
            backgroundColor: 'var(--bg-primary)',
            borderRadius: '8px',
            border: '1px solid var(--border-subtle)'
          }}>
            {/* Progress */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>Progress</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {(download.percentage ?? 0).toFixed(1)}%
              </div>
            </div>
            
            {/* Downloaded / Total */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>Downloaded</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {formatBytes(download.bytes_downloaded ?? 0)}
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '2px' }}>
                  / {download.total_bytes ? formatBytes(download.total_bytes) : '?'}
                </span>
              </div>
            </div>
            
            {/* Speed */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>Speed</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {download.speed_bps > 0 ? `${formatBytes(download.speed_bps)}/s` : '--'}
              </div>
            </div>
          </div>
          
          {/* ETA */}
          {download.speed_bps > 0 && download.estimated_time_remaining != null && download.estimated_time_remaining > 0 && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              gap: '6px',
              padding: '6px 12px',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: '6px',
              marginBottom: '10px'
            }}>
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--text-muted)' }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                ETA: <strong style={{ color: 'var(--text-primary)' }}>
                  {Math.round(download.estimated_time_remaining / 60)}m {Math.round(download.estimated_time_remaining % 60)}s
                </strong> remaining
              </span>
            </div>
          )}

          {/* Controls */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            {download.status === 'Downloading' && (
              <button onClick={() => onPause(download.download_id)} style={{
                display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 14px',
                borderRadius: '9999px', border: '1px solid var(--border-primary)', backgroundColor: 'transparent',
                color: 'var(--text-primary)', fontSize: '12px', cursor: 'pointer', fontWeight: 500,
              }}>
                <Pause size={14} /> Pause
              </button>
            )}
            {download.status === 'Paused' && (
              <button onClick={() => onResume(download.download_id)} style={{
                display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 14px',
                borderRadius: '9999px', border: '1px solid var(--text-primary)', backgroundColor: 'var(--text-primary)',
                color: 'var(--bg-primary)', fontSize: '12px', cursor: 'pointer', fontWeight: 500,
              }}>
                <Play size={14} /> Resume
              </button>
            )}
            <button onClick={() => onCancel(download.download_id)} style={{
              display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 14px',
              borderRadius: '9999px', border: '1px solid var(--border-primary)', backgroundColor: 'transparent',
              color: 'var(--text-primary)', fontSize: '12px', cursor: 'pointer', fontWeight: 500,
            }}>
              <Square size={14} /> Stop
            </button>
          </div>
        </>
      )}
      {download.status === 'Failed' && download.error_message && (
        <p style={{ color: 'var(--danger)', fontSize: '13px', marginTop: '8px' }}>{download.error_message}</p>
      )}
    </div>
  );
};

export default ModelsPanel;
