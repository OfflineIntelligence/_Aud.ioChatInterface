//! Thread-based server implementation
//!
//! This module provides the server startup that uses thread-based
//! shared memory architecture. All API handlers access state through
//! Arc-wrapped shared memory (UnifiedAppState) — zero network hops
//! between components. The only network call is to the localhost llama-server.

use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{info, warn, debug, error};
use anyhow::anyhow;

use crate::{
    config::Config,
    shared_state::{SharedState, UnifiedAppState},
    thread_pool::{ThreadPool, ThreadPoolConfig},
    worker_threads::{ContextWorker, CacheWorker, DatabaseWorker, LLMWorker},
    memory_db::MemoryDatabase,
    model_management::ModelManager,
};

/// Thread-based unified application state (internal, used during initialization)
#[derive(Clone)]
pub struct ThreadBasedAppState {
    pub shared_state: Arc<SharedState>,
    pub thread_pool: Arc<RwLock<Option<ThreadPool>>>,
    pub context_worker: Arc<ContextWorker>,
    pub cache_worker: Arc<CacheWorker>,
    pub database_worker: Arc<DatabaseWorker>,
    pub llm_worker: Arc<LLMWorker>,
}

/// Run server with thread-based architecture
/// 
/// # Arguments
/// * `cfg` - Server configuration
/// * `port_tx` - Optional channel to communicate the selected port back to caller
///               This is used when the configured port is unavailable and a random port is selected
pub async fn run_thread_server(cfg: Config, port_tx: Option<std::sync::mpsc::Sender<u16>>) -> anyhow::Result<()> {
    crate::telemetry::init_tracing();
    crate::metrics::init_metrics();
    cfg.print_config();

    info!("Starting thread-based server architecture");

    // Initialize database - use user data directory for persistence across updates
    // This ensures data survives app updates and works on Windows where Program Files is read-only
    let memory_db_path = dirs::data_dir()
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default())
        .join("Aud.io")
        .join("data")
        .join("memory.db");

    // Ensure the data directory exists
    if let Some(parent) = memory_db_path.parent() {
        if let Err(e) = std::fs::create_dir_all(parent) {
            warn!("Failed to create data directory {:?}: {}", parent, e);
        } else {
            info!("Created data directory: {:?}", parent);
        }
    }

    let memory_database = match MemoryDatabase::new(&memory_db_path) {
        Ok(db) => {
            info!("Memory database initialized at: {}", memory_db_path.display());
            Arc::new(db)
        }
        Err(e) => {
            warn!("Failed to initialize memory database at {}: {}. Falling back to in-memory.", memory_db_path.display(), e);
            Arc::new(MemoryDatabase::new_in_memory()?)
        }
    };

    // Initialize shared state (creates LLM worker internally with backend_url)
    let mut shared_state = SharedState::new(cfg.clone(), memory_database.clone())?;

    // Initialize Model Manager
    info!("📦 Initializing Model Manager");
    match ModelManager::new() {
        Ok(model_manager) => {
            let model_manager_arc = Arc::new(model_manager);
            // Initialize the model manager with hardware-aware compatibility scoring
            if let Err(e) = model_manager_arc.initialize(&cfg).await {
                warn!("⚠️  Model manager initialization failed: {}", e);
                // Still add the model manager even if initialization fails to have default catalog
                shared_state.model_manager = Some(model_manager_arc);
            } else {
                info!("✅ Model manager initialized successfully");
                shared_state.model_manager = Some(model_manager_arc);
            }
        }
        Err(e) => {
            warn!("⚠️  Failed to create model manager: {}", e);
        }
    }

    // Initialize Engine Manager
    info!("⚙️  Initializing Engine Manager");
    match crate::engine_management::EngineManager::new() {
        Ok(engine_manager) => {
            let engine_manager_arc = Arc::new(engine_manager);

            match engine_manager_arc.initialize(&cfg).await {
                Ok(true) => {
                    info!("✅ Engine manager initialized with engine ready");
                    shared_state.engine_manager = Some(engine_manager_arc.clone());
                    shared_state.engine_available.store(true, std::sync::atomic::Ordering::Relaxed);
                }
                Ok(false) => {
                    info!("⚠️  Engine manager initialized but no engine available yet");
                    shared_state.engine_manager = Some(engine_manager_arc.clone());
                    shared_state.engine_available.store(false, std::sync::atomic::Ordering::Relaxed);

                    // Spawn background task to retry engine download
                    let engine_mgr = engine_manager_arc.clone();
                    let engine_available = shared_state.engine_available.clone();
                    tokio::spawn(async move {
                        // Retry every 30 seconds with exponential backoff up to 5 minutes
                        let mut retry_interval = 30u64;
                        loop {
                            tokio::time::sleep(std::time::Duration::from_secs(retry_interval)).await;

                            info!("Retrying engine download (background task)...");
                            match engine_mgr.ensure_engine_available().await {
                                Ok(true) => {
                                    info!("✅ Engine downloaded successfully in background");
                                    engine_available.store(true, std::sync::atomic::Ordering::Relaxed);
                                    break;
                                }
                                Ok(false) | Err(_) => {
                                    warn!("Engine download retry failed, will try again in {} seconds", retry_interval);
                                    retry_interval = std::cmp::min(retry_interval * 2, 300); // Cap at 5 minutes
                                }
                            }
                        }
                    });
                }
                Err(e) => {
                    warn!("⚠️  Engine manager scan failed: {}", e);
                    shared_state.engine_manager = Some(engine_manager_arc);
                    shared_state.engine_available.store(false, std::sync::atomic::Ordering::Relaxed);
                }
            }
        }
        Err(e) => {
            error!("❌ Failed to create engine manager: {}", e);
            shared_state.engine_available.store(false, std::sync::atomic::Ordering::Relaxed);
        }
    }

    let shared_state = Arc::new(shared_state);

    // Initialize Runtime Manager for multi-format model support
    info!("🚀 Initializing Runtime Manager for multi-format model support");
    let runtime_manager = Arc::new(crate::model_runtime::RuntimeManager::new());

    // CRITICAL: Wait for runtime initialization BEFORE starting HTTP server
    // This prevents 502 errors by ensuring llama-server is ready to accept requests
    info!("⏳ Waiting for runtime initialization to complete...");
    
    // Configure the runtime based on detected model format
    let runtime_config = crate::model_runtime::RuntimeConfig {
        model_path: std::path::PathBuf::from(&cfg.model_path),
        format: crate::model_runtime::ModelFormat::GGUF, // Will be auto-detected
        host: cfg.llama_host.clone(),
        port: cfg.llama_port,
        context_size: cfg.ctx_size,
        batch_size: cfg.batch_size,
        threads: cfg.threads,
        gpu_layers: cfg.gpu_layers,
        runtime_binary: if cfg.llama_bin.is_empty() { None } else { Some(std::path::PathBuf::from(&cfg.llama_bin)) },
        extra_config: serde_json::json!({}),
    };

    // BLOCKING runtime initialization - wait for engine to be ready before starting HTTP server
    // This prevents race conditions and ensures llama-server is available when UI loads
    info!("⏳ Waiting for runtime to be ready...");

    let mut runtime_initialized = false;

    if let Some(ref engine_manager) = shared_state.engine_manager {
        // Check if there's a default engine installed
        let registry = engine_manager.registry.read().await;
        if let Some(default_engine) = registry.get_default_engine_binary_path() {
            drop(registry); // Release the read lock
            info!("✅ Default engine found: {}", default_engine.display());

            // Store runtime manager before initialization
            if let Err(e) = shared_state.set_runtime_manager(runtime_manager.clone()) {
                error!("❌ Failed to set runtime manager in shared state: {}", e);
            }

            // CRITICAL: Link runtime manager to LLM worker IMMEDIATELY
            // This allows health check to properly report engine status even without a model loaded
            shared_state.llm_worker.set_runtime_manager(runtime_manager.clone());
            info!("🔗 LLM worker linked to runtime manager");

            // Try to load last used model instead of config model (which is often empty)
            let should_auto_load = if cfg.model_path.is_empty() {
                // Try to load last used model from persistent storage
                if let Some(data_dir) = dirs::data_dir() {
                    let last_model_path = data_dir.join("Aud.io").join("last_model.txt");
                    if let Ok(last_model_id) = std::fs::read_to_string(&last_model_path) {
                        let last_model_id = last_model_id.trim();
                        info!("🔄 Found last used model: {}", last_model_id);

                        // Attempt to load this model automatically
                        if let Some(ref model_manager) = shared_state.model_manager {
                            // Get model info from registry
                            let registry = model_manager.registry.read().await;
                            if let Some(model_info) = registry.get_model(last_model_id) {
                                // Check if model is installed
                                if model_info.status == crate::model_management::registry::ModelStatus::Installed {
                                    // Get model path
                                    if let Some(ref filename) = model_info.filename {
                                        let model_path_for_runtime = model_manager.storage.model_path(last_model_id, filename);

                                        if model_path_for_runtime.exists() {
                                            info!("✅ Auto-loading last used model from: {}", model_path_for_runtime.display());
                                            drop(registry); // Release lock before async operations

                                            // Update runtime config with the last used model
                                            let mut updated_config = runtime_config.clone();
                                            updated_config.model_path = model_path_for_runtime;
                                            updated_config.runtime_binary = Some(default_engine.clone());

                                            // Store runtime manager and link to LLM worker before initialization
                                            if let Err(e) = shared_state.set_runtime_manager(runtime_manager.clone()) {
                                                error!("❌ Failed to set runtime manager: {}", e);
                                            }
                                            shared_state.llm_worker.set_runtime_manager(runtime_manager.clone());

                                            // Initialize with last used model
                                            match runtime_manager.initialize_auto(updated_config).await {
                                                Ok(base_url) => {
                                                    info!("✅ Last used model auto-loaded at {}", base_url);
                                                    match runtime_manager.health_check().await {
                                                        Ok(status) => {
                                                            info!("✅ Runtime health check passed: {}", status);
                                                            runtime_initialized = true;
                                                        }
                                                        Err(e) => {
                                                            warn!("⚠️  Runtime health check failed after auto-load: {}", e);
                                                        }
                                                    }
                                                }
                                                Err(e) => {
                                                    warn!("⚠️  Failed to auto-load last used model: {}", e);
                                                }
                                            }

                                            // Skip the manual load block below
                                            false
                                        } else {
                                            drop(registry);
                                            warn!("⚠️  Last used model file not found: {}", model_path_for_runtime.display());
                                            false
                                        }
                                    } else {
                                        drop(registry);
                                        warn!("⚠️  Last used model has no filename in registry");
                                        false
                                    }
                                } else {
                                    drop(registry);
                                    info!("ℹ️  Last used model is not installed - user will need to activate a model");
                                    false
                                }
                            } else {
                                drop(registry);
                                warn!("⚠️  Last used model not found in registry: {}", last_model_id);
                                false
                            }
                        } else {
                            info!("ℹ️  Model manager not available - skipping auto-load");
                            false
                        }
                    } else {
                        info!("ℹ️  No last used model found - user will need to activate a model");
                        false
                    }
                } else {
                    false
                }
            } else {
                // Config has a model path - try to use it
                true
            };

            if !should_auto_load {
                info!("⏩ Skipping manual load - either auto-loaded or will wait for user activation");
                // Don't initialize runtime - either already done via auto-load or waiting for user
            } else {
                // Update the runtime config to use the default engine binary
                let mut updated_config = runtime_config.clone();
                updated_config.runtime_binary = Some(default_engine);

                // BLOCKING initialization with 120 second timeout for llama-server health check
                info!("🚀 Initializing runtime (this may take up to 2 minutes)...");
                match runtime_manager.initialize_auto(updated_config).await {
                Ok(base_url) => {
                    info!("✅ Runtime initialized at {}", base_url);

                    // Verify runtime is actually ready by performing health check
                    match runtime_manager.health_check().await {
                        Ok(status) => {
                            info!("✅ Runtime health check passed: {}", status);

                            // Link runtime manager to LLM worker
                            shared_state.llm_worker.set_runtime_manager(runtime_manager.clone());
                            info!("🔗 LLM worker linked to runtime");

                            runtime_initialized = true;
                        }
                        Err(e) => {
                            warn!("⚠️  Runtime health check failed: {}", e);
                            warn!("   App will continue without runtime (online-only mode)");
                        }
                    }
                }
                Err(e) => {
                    warn!("⚠️  Runtime initialization failed: {}", e);
                    warn!("   App will continue without runtime (online-only mode)");
                }
            }
            } // End of should_auto_load else block
        } else {
            drop(registry); // Release the read lock
            info!("⏳ No engine found - app will start in online-only mode");
            info!("   Users can download an engine from the Engines panel");
        }
    } else {
        info!("⏳ Engine manager not available - app will start in online-only mode");
    }

    // Mark initialization complete now that runtime check is done
    shared_state.mark_initialization_complete();

    if runtime_initialized {
        info!("✅ Backend initialization complete with runtime ready");
    } else {
        info!("✅ Backend initialization complete (online-only mode)");
    }

    // Initialize workers
    let _context_worker: Arc<ContextWorker> = Arc::new(ContextWorker::new(shared_state.clone()));
    let _cache_worker: Arc<CacheWorker> = Arc::new(CacheWorker::new(shared_state.clone()));
    let _database_worker: Arc<DatabaseWorker> = Arc::new(DatabaseWorker::new(shared_state.clone()));
    let _llm_worker = shared_state.llm_worker.clone();

    // Initialize cache manager
    let cache_manager = match crate::cache_management::create_default_cache_manager(
        crate::cache_management::KVCacheConfig::default(),
        memory_database.clone(),
    ) {
        Ok(manager) => {
            info!("Cache manager initialized successfully");
            Some(Arc::new(manager))
        }
        Err(e) => {
            warn!("Failed to initialize cache manager: {}, cache features disabled", e);
            None
        }
    };

    // Initialize context orchestrator
    let context_orchestrator = match crate::context_engine::create_default_orchestrator(
        memory_database.clone(),
    ).await {
        Ok(mut orchestrator) => {
            // Inject LLM worker so the orchestrator can generate query embeddings
            // for semantic search when the hot KV cache doesn't have the answer.
            orchestrator.set_llm_worker(shared_state.llm_worker.clone());
            info!("Context orchestrator initialized with semantic search support");
            Some(orchestrator)
        }
        Err(e) => {
            warn!("Failed to initialize context orchestrator: {}. Memory features disabled.", e);
            None
        }
    };

    // Initialize thread pool
    let thread_pool_config = ThreadPoolConfig::new(&cfg);
    let mut thread_pool = ThreadPool::new(thread_pool_config, shared_state.clone());
    thread_pool.start().await?;

    // Update shared state with initialized components
    {
        let mut cache_guard = shared_state.cache_manager.write()
            .map_err(|_| anyhow::anyhow!("Failed to acquire cache manager write lock"))?;
        *cache_guard = cache_manager;

        // LLM runtime is now managed by RuntimeManager, no need to initialize here
        // shared_state.initialize_llm_runtime()?;  // Removed - handled by RuntimeManager
    }

    // Initialize embedding HNSW index from any previously stored embeddings
    // This makes semantic search available immediately on startup.
    if let Err(e) = shared_state.database_pool.embeddings.initialize_index("llama-server") {
        debug!("Embedding index init: {} (will build on first embedding store)", e);
    } else {
        info!("Embedding HNSW index loaded from existing data");
    }

    // Set context orchestrator (tokio RwLock for async access from handlers)
    {
        let mut orch_guard = shared_state.context_orchestrator.write().await;
        *orch_guard = context_orchestrator;
    }

    // Build the unified app state for the router
    let unified_state = UnifiedAppState::new(shared_state.clone());

    // Runtime initialization moved to background task above
    // Server starts immediately - runtime will become ready asynchronously
    info!("✅ Backend HTTP server starting (runtime may still be initializing)...");

    // Try to bind to the configured port, fall back to random port if in use
    let (listener, selected_port) = match try_bind_port(&cfg.api_host, cfg.api_port).await {
        Ok(listener) => {
            let local_addr = listener.local_addr()?;
            let port = local_addr.port();
            info!("✅ HTTP server bound to {}:{}", local_addr.ip(), port);
            // Communicate the port back to main thread
            if let Some(ref tx) = port_tx {
                let _ = tx.send(port);
            }
            (listener, port)
        }
        Err(e) => {
            warn!("⚠️ Failed to bind to port {}: {}", cfg.api_port, e);
            warn!("🔄 Attempting to find available port...");
            
            // Try random ports in range 8002-8999 to avoid conflicts with llama-server (8001) and prometheus (9000)
            let mut last_error = None;
            let mut found_listener = None;
            let mut found_port = 0;
            for attempt in 0..100 {
                let random_port = 8002 + (rand::random::<u16>() % 997);
                match try_bind_port(&cfg.api_host, random_port).await {
                    Ok(listener) => {
                        let local_addr = listener.local_addr()?;
                        found_port = local_addr.port();
                        info!("✅ HTTP server bound to alternative port {}:{}", local_addr.ip(), found_port);
                        // Store the selected port in shared state for discovery
                        if let Ok(mut port_guard) = shared_state.http_port.write() {
                            *port_guard = found_port;
                        }
                        // Communicate the port back to main thread
                        if let Some(ref tx) = port_tx {
                            let _ = tx.send(found_port);
                        }
                        found_listener = Some(listener);
                        break;
                    }
                    Err(e) => {
                        last_error = Some(e);
                        if attempt >= 99 {
                            // Provide more detailed error information for firewall issues
                            let error_msg = format!("Failed to find available port after 100 attempts. This may be due to:\n  - Firewall blocking local connections\n  - Antivirus software interference\n  - Another instance already running\n  - Insufficient permissions\n\nPlease check:\n  - Disable firewall temporarily to test\n  - Close any other Aud.io applications\n  - Run as Administrator if on Windows\n\nLast error: {:?}", last_error);
                            return Err(anyhow!("{}", error_msg));
                        }
                    }
                }
            }
            let listener = found_listener.ok_or_else(|| anyhow::anyhow!("No available port found. This may be due to firewall restrictions. Please check that the application has permission to bind to local ports."))?;
            (listener, found_port)
        }
    };

    info!("🌐 Server will accept connections on port {}", selected_port);

    // CRITICAL: Send the selected port back to the main thread
    // The main thread is waiting for this to know what port to connect to
    if let Some(tx) = port_tx {
        if let Err(e) = tx.send(selected_port) {
            warn!("Failed to send port to main thread: {}", e);
        } else {
            info!("✅ Port {} communicated to main thread", selected_port);
        }
    }

    info!("Building Axum router...");
    let app = build_compatible_router(unified_state);
    
    info!("Starting Axum server on port {}...", selected_port);
    
    // Start server - this blocks
    if let Err(e) = axum::serve(listener, app).await {
        error!("Axum server error: {}", e);
    }
    
    info!("Axum server stopped");
    Ok(())
}

/// Try to bind to a specific port, returning the listener if successful
async fn try_bind_port(host: &str, port: u16) -> anyhow::Result<tokio::net::TcpListener> {
    let addr = format!("{}:{}", host, port);
    match tokio::net::TcpListener::bind(&addr).await {
        Ok(listener) => Ok(listener),
        Err(e) if e.kind() == std::io::ErrorKind::AddrInUse => {
            Err(anyhow::anyhow!("Port {} is already in use", port))
        }
        Err(e) => Err(anyhow::anyhow!("Failed to bind to {}: {}", addr, e)),
    }
}

/// Health response structure with detailed runtime status
#[derive(serde::Serialize)]
struct HealthResponse {
    status: String,  // "ready", "initializing", "degraded"
    runtime_ready: bool,
    message: Option<String>,
}

/// Health check handler that verifies backend is fully initialized AND runtime is ready
async fn health_check(axum::extract::State(state): axum::extract::State<UnifiedAppState>) -> axum::response::Response {
    use axum::Json;
    use axum::response::IntoResponse;

    // Check if backend initialization is complete
    if !state.shared_state.is_initialization_complete() {
        return Json(HealthResponse {
            status: "initializing".to_string(),
            runtime_ready: false,
            message: Some("Backend initializing...".to_string()),
        })
        .into_response();
    }

    // Check if runtime is actually ready for inference
    let runtime_ready = state.shared_state.llm_worker.is_runtime_ready().await;

    let (status, message) = if runtime_ready {
        ("ready", None)
    } else {
        (
            "degraded",
            Some("No model loaded. Please activate a model from the Models page.".to_string())
        )
    };

    Json(HealthResponse {
        status: status.to_string(),
        runtime_ready,
        message,
    })
    .into_response()
}

/// Build router for 1-hop architecture
fn build_compatible_router(mut state: UnifiedAppState) -> axum::Router {
    use axum::{
        Router,
        routing::{get, post, put, delete},
        extract::DefaultBodyLimit,
    };
    use tower_http::{
        cors::{Any, CorsLayer},
        trace::TraceLayer,
        timeout::TimeoutLayer,
    };
    use std::time::Duration;

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([axum::http::Method::GET, axum::http::Method::POST, axum::http::Method::PUT, axum::http::Method::DELETE])
        .allow_headers(Any);

    // Get JWT secret from environment or generate a default
    let jwt_secret = std::env::var("JWT_SECRET")
        .unwrap_or_else(|_| "aud-io-default-secret-change-in-production".to_string());

    // Get users store from database
    let users_store = state.shared_state.database_pool.users.clone();
    
    // Create and set auth state
    state.auth_state = Some(Arc::new(crate::api::auth_api::AuthState {
        users: users_store,
        jwt_secret,
    }));

    Router::new()
        // Auth routes (email/password with SMTP verification)
        .route("/auth/signup", post(crate::api::auth_api::signup))
        .route("/auth/login", post(crate::api::auth_api::login))
        .route("/auth/verify-email", post(crate::api::auth_api::verify_email))
        .route("/auth/me", post(crate::api::auth_api::get_current_user))
        // Core 1-hop streaming endpoint
        .route("/generate/stream", post(crate::api::stream_api::generate_stream))
        // Online mode streaming endpoint
        .route("/online/stream", post(crate::api::online_api::online_stream))
        // Title generation via shared memory -> LLM worker
        .route("/generate/title", post(crate::api::title_api::generate_title))
        // Conversation CRUD via shared memory -> database
        .route("/conversations", get(crate::api::conversation_api::get_conversations))
        .route("/conversations/db-stats", get(crate::api::conversation_api::get_conversations_db_stats))
        .route("/conversations/:id", get(crate::api::conversation_api::get_conversation))
        .route("/conversations/:id/title", put(crate::api::conversation_api::update_conversation_title))
        .route("/conversations/:id/pinned", post(crate::api::conversation_api::update_conversation_pinned))
        .route("/conversations/:id", delete(crate::api::conversation_api::delete_conversation))
        // Model management endpoints
        .route("/models", get(crate::api::model_api::list_models))
        .route("/models/by-mode", get(crate::api::model_api::list_models_by_mode))
        .route("/models/active", get(crate::api::model_api::get_active_model))
        .route("/models/search", get(crate::api::model_api::search_models))
        .route("/models/install", post(crate::api::model_api::install_model))
        .route("/models/remove", delete(crate::api::model_api::remove_model))
        .route("/models/progress", get(crate::api::model_api::get_download_progress))
        .route("/models/downloads", get(crate::api::model_api::get_active_downloads))
        .route("/models/downloads/cancel", post(crate::api::model_api::cancel_download))
        .route("/models/downloads/pause", post(crate::api::model_api::pause_download))
        .route("/models/downloads/resume", post(crate::api::model_api::resume_download))
        .route("/models/recommendations", get(crate::api::model_api::get_recommended_models))
        .route("/models/preferences", post(crate::api::model_api::update_preferences))
        .route("/models/refresh", post(crate::api::model_api::refresh_models))
        .route("/models/switch", post(crate::api::model_api::switch_model))
        .route("/hardware/recommendations", get(crate::api::model_api::get_hardware_recommendations))
        .route("/hardware/info", get(crate::api::model_api::get_hardware_info))
        .route("/metrics/system", get(crate::api::model_api::get_system_metrics))
        .route("/storage/metadata", get(crate::api::model_api::get_storage_metadata))
        // API Keys management endpoints
        .route("/api-keys", post(crate::api::api_keys_api::save_api_key))
        .route("/api-keys", get(crate::api::api_keys_api::get_api_key))
        .route("/api-keys/all", get(crate::api::api_keys_api::get_all_api_keys))
        .route("/api-keys", delete(crate::api::api_keys_api::delete_api_key))
        .route("/api-keys/mark-used", post(crate::api::api_keys_api::mark_key_used))
        // Mode management endpoints (online/offline)
        .route("/mode/switch", post(crate::api::mode_api::switch_mode))
        .route("/mode/status", get(crate::api::mode_api::get_mode_status))
        // Files API endpoints (database-backed with nested folder support)
        .route("/files", get(crate::api::files_api::get_files))
        .route("/files/all", get(crate::api::files_api::get_all_files))
        .route("/files/search", get(crate::api::files_api::search_files))
        .route("/files/folder", post(crate::api::files_api::create_folder))
        .route("/files/upload", post(crate::api::files_api::upload_file))
        .route("/files/sync", post(crate::api::files_api::sync_files))
        .route("/files/resync", post(crate::api::files_api::resync_files))
        .route("/files/:id", get(crate::api::files_api::get_file_by_id))
        .route("/files/:id/content", get(crate::api::files_api::get_file_content))
        .route("/files/:id", delete(crate::api::files_api::delete_file_by_id))
        .route("/files", delete(crate::api::files_api::delete_file))
        // All Files API endpoints (unlimited storage for all file formats)
        .route("/all-files", get(crate::api::all_files_api::get_all_files))
        .route("/all-files/all", get(crate::api::all_files_api::get_all_files_flat))
        .route("/all-files/search", get(crate::api::all_files_api::search_all_files))
        .route("/all-files/folder", post(crate::api::all_files_api::create_all_files_folder))
        .route("/all-files/upload", post(crate::api::all_files_api::upload_all_file))
        .route("/all-files/upload-structure", post(crate::api::all_files_api::upload_all_files_structure))
        .route("/all-files/:id", get(crate::api::all_files_api::get_all_file_by_id))
        .route("/all-files/:id/content", get(crate::api::all_files_api::get_all_file_content))
        .route("/all-files/:id", delete(crate::api::all_files_api::delete_all_file_by_id))
        .route("/all-files", delete(crate::api::all_files_api::delete_all_file))
        // Feedback endpoint
        .route("/feedback", post(crate::api::feedback_api::submit_feedback))
        // Login notification endpoint
        .route("/notify-login", post(crate::api::login_notification_api::notify_user_login))
        // Metrics endpoint
        .route("/metrics", get(crate::metrics::get_metrics))
        .route("/healthz", get(health_check))
        .route("/admin/shutdown", post(crate::admin::stop_backend))
.layer(cors)
        .layer(TraceLayer::new_for_http())
        .layer(TimeoutLayer::new(Duration::from_secs(600)))
        .layer(DefaultBodyLimit::max(50 * 1024 * 1024))
        .with_state(state)
}
