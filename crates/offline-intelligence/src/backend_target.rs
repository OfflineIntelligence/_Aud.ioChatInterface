// Server/src/backend_target.rs

use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{info, warn};

#[derive(Clone)]
pub struct BackendTarget {
    inner: Arc<RwLock<String>>,
}

impl BackendTarget {
    pub fn new(initial: String) -> Self {
        Self {
            inner: Arc::new(RwLock::new(initial)),
        }
    }

    pub async fn set(&self, new_target: String) {
        let mut lock = self.inner.write().await;
        
        // If current value is empty, always set it (no warning)
        if lock.is_empty() {
            info!("🔄 Setting initial backend target to: {}", new_target);
            *lock = new_target;
        } 
        // Only warn if we're changing from one non-empty value to another
        else if *lock != new_target {
            info!("🔄 Switching backend target from {} → {}", *lock, new_target);
            *lock = new_target;
        } else {
            warn!("backend target set() called, but no change (still {})", new_target);
        }
    }

    pub async fn get(&self) -> String {
        let lock = self.inner.read().await;
        lock.clone()
    }

    /// Check if backend target is properly initialized
    pub async fn is_initialized(&self) -> bool {
        let lock = self.inner.read().await;
        !lock.is_empty()
    }

    /// Main generation endpoint used by your Python code
    /// Your Python Core_engine.rs calls the root endpoint "/"
    pub async fn generate_url(&self) -> String {
        let base = self.get().await;
        if base.is_empty() {
            warn!("Backend target not initialized yet, returning empty URL");
        }
        format!("{}/", base)
    }

    /// Health check endpoint for connection testing
    pub async fn health_url(&self) -> String {
        let base = self.get().await;
        format!("{}/health", base)
    }

    /// Chat completions (OpenAI-compatible endpoint used by proxy)
    pub async fn chat_completions_url(&self) -> String {
        let base = self.get().await;
        format!("{}/v1/chat/completions", base)
    }

    /// NEW: Direct endpoint for your Python code's current structure
    /// This matches what your Core_engine.rs _post() method expects
    pub async fn direct_generation_url(&self) -> String {
        let base = self.get().await;
        if base.is_empty() {
            warn!("Backend target not initialized yet, returning empty URL");
        }
        format!("{}/", base)
    }
}