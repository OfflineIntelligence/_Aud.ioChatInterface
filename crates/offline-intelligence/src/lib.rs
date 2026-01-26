// _Aud.io/offline-intelligence/crates/src/lib.rs

pub mod admin;
pub mod api;
pub mod backend_target;
pub mod config;
pub mod context_engine;
pub mod memory;
pub mod memory_db;
pub mod metrics;
pub mod proxy;
pub mod resources;
pub mod runner;
pub mod cache_management;
pub mod telemetry;
pub mod utils;

pub use admin::*;
pub use backend_target::*;
pub use config::*;
pub use metrics::*;
pub use proxy::*;
pub use runner::*;
pub use cache_management::*;

use axum::{
    Router,
    routing::{get, post, put, delete},
    extract::{State, FromRef, Path},  // Added FromRef here
    response::IntoResponse,
    Json,
};
use axum::http::Method;
use std::{path::Path as StdPath, sync::Arc, time::Duration};
use tokio::sync::RwLock;
use tower::limit::ConcurrencyLimitLayer;
use tower_http::{
    cors::{Any, CorsLayer},
    trace::TraceLayer,
    timeout::TimeoutLayer,
};
use tracing::{info, warn, error};

use context_engine::ContextOrchestrator;
use memory_db::MemoryDatabase;

#[derive(Clone)]
pub struct UnifiedAppState {
    pub proxy: proxy::AppState,
    pub admin: admin::AdminState,
    pub context_orchestrator: Arc<RwLock<Option<ContextOrchestrator>>>,
    pub cache_manager: Arc<RwLock<Option<Arc<cache_management::KVCacheManager>>>>,
}

impl FromRef<UnifiedAppState> for proxy::AppState {
    fn from_ref(state: &UnifiedAppState) -> Self {
        state.proxy.clone()
    }
}

impl FromRef<UnifiedAppState> for admin::AdminState {
    fn from_ref(state: &UnifiedAppState) -> Self {
        state.admin.clone()
    }
}

impl FromRef<UnifiedAppState> for Arc<RwLock<Option<ContextOrchestrator>>> {
    fn from_ref(state: &UnifiedAppState) -> Self {
        state.context_orchestrator.clone()
    }
}

impl FromRef<UnifiedAppState> for Arc<RwLock<Option<Arc<KVCacheManager>>>> {
    fn from_ref(state: &UnifiedAppState) -> Self {
        state.cache_manager.clone()
    }
}

async fn health_check() -> &'static str {
    "OK"
}

async fn ready_check() -> &'static str {
    "READY"
}

async fn get_status_wrapper(
    State(state): State<UnifiedAppState>,
) -> impl IntoResponse {
    admin::get_status(State(state.admin)).await
}

async fn load_model_wrapper(
    State(state): State<UnifiedAppState>,
    Json(req): Json<admin::LoadModelRequest>,
) -> impl IntoResponse {
    admin::load_model(State(state.admin), Json(req)).await
}

async fn stop_backend_wrapper(
    State(state): State<UnifiedAppState>,
) -> impl IntoResponse {
    admin::stop_backend(State(state.admin)).await
}

async fn memory_stats_wrapper(
    State(state): State<UnifiedAppState>,
    Path(session_id): Path<String>,
) -> impl IntoResponse {
    api::memory_stats(State(state), Path(session_id)).await
}

async fn memory_optimize_wrapper(
    State(state): State<UnifiedAppState>,
    Json(req): Json<api::memory_api::MemoryOptimizeRequest>,
) -> impl IntoResponse {
    api::memory_optimize(State(state), Json(req)).await
}

async fn memory_cleanup_wrapper(
    State(state): State<UnifiedAppState>,
    Json(req): Json<api::memory_api::MemoryCleanupRequest>,
) -> impl IntoResponse {
    api::memory_cleanup(State(state), Json(req)).await
}

async fn search_wrapper(
    State(state): State<UnifiedAppState>,
    Json(req): Json<api::search_api::SearchRequest>,
) -> impl IntoResponse {
    api::search_api::search(State(state), Json(req)).await
}

// Wrapper to extract proxy state for title generation endpoint
async fn generate_title_wrapper(
    State(state): State<UnifiedAppState>,
    Json(req): Json<api::GenerateTitleRequest>,
) -> impl IntoResponse {
    api::generate_title(State(state.proxy), Json(req)).await
}

async fn init_cache_manager(
    memory_database: Arc<MemoryDatabase>,
) -> anyhow::Result<Option<Arc<KVCacheManager>>> {
    let cache_config = cache_management::KVCacheConfig::default();
    
    match KVCacheManager::new(cache_config, memory_database) {
        Ok(manager) => {
            info!("Cache manager initialized successfully");
            Ok(Some(Arc::new(manager)))
        }
        Err(e) => {
            warn!("Failed to initialize cache manager: {}, cache features disabled", e);
            Ok(None)
        }
    }
}

pub async fn run_server(cfg: Config) -> anyhow::Result<()> {
    telemetry::init_tracing();
    metrics::init_metrics();
    cfg.print_config();
    
    let runner = runner::Runner::new(cfg.clone());
    let backend_target = backend_target::BackendTarget::new("".to_string());
    
    let runner_clone = Arc::clone(&runner);
    let backend_target_clone = backend_target.clone();
    let initial_model_path = cfg.model_path.clone();
    
    // FIXED: Spawn model loading in a background task using tokio::spawn() instead of awaiting it directly.
    // This allows the HTTP server to start immediately on port 8000 while the model loads asynchronously.
    // Previously, the server startup was blocked until model loading completed, causing "connection refused" errors.
    tokio::spawn(async move {
        info!("🚀 Starting automatic model loading in background...");
        match runner_clone.spawn_model(initial_model_path.clone()).await {
            Ok(url) => {
                info!("✅ Model loaded successfully: {}", initial_model_path);
                backend_target_clone.set(url).await;
            }
            Err(e) => {
                error!("❌ Failed to load initial model: {}", e);
            }
        }
    });
    
    let admin_state = admin::AdminState {
        cfg: cfg.clone(),
        backend_target: backend_target.clone(),
        runner: runner.clone(),
    };
    
    let memory_db_path = StdPath::new("./data/conversations.db");
    let memory_database = match MemoryDatabase::new(memory_db_path) {
        Ok(db) => {
            info!("Memory database initialized at: {}", memory_db_path.display());
            Arc::new(db)
        }
        Err(e) => {
            warn!("Failed to initialize memory database: {}. Falling back to in-memory.", e);
            Arc::new(MemoryDatabase::new_in_memory()?)
        }
    };

    let cache_manager = Arc::new(RwLock::new(init_cache_manager(memory_database.clone()).await?));

    let context_orchestrator = match context_engine::create_default_orchestrator(memory_database.clone()).await {
        Ok(orchestrator) => {
            info!("Context orchestrator initialized successfully");
            Arc::new(RwLock::new(Some(orchestrator)))
        }
        Err(e) => {
            warn!("Failed to initialize context orchestrator: {}. Memory features disabled.", e);
            Arc::new(RwLock::new(None))
        }
    };

    let proxy_state_with_context = proxy::AppState {
        client: reqwest::Client::new(),
        cfg: cfg.clone(),
        context_orchestrator: context_orchestrator.clone(),
    };

    let unified_state = UnifiedAppState {
        proxy: proxy_state_with_context,
        admin: admin_state,
        context_orchestrator,
        cache_manager,
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        // Allow DELETE method for conversation removal, PUT for title updates (fixes CORS blocking browser requests)
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
        .allow_headers(Any);

    let app = Router::new()
        .route("/generate/stream", post(proxy::generate_stream_endpoint))
        .route("/generate/title", post(generate_title_wrapper))  // Chat title generation
        // Chat persistence: REST API routes for conversation management
        .route("/conversations", get(api::get_conversations))  // List all saved conversations
        .route("/conversations/:id", get(api::get_conversation))  // Get full conversation with messages
        .route("/conversations/:id/title", put(api::update_conversation_title))  // Update conversation title
        .route("/conversations/:id/pinned", post(api::update_conversation_pinned))  // Update conversation pinned status
        .route("/conversations/:id", delete(api::delete_conversation))  // Delete conversation from database
        .route("/healthz", get(health_check))
        .route("/readyz", get(ready_check))
        .route("/metrics", get(metrics::get_metrics))
        .route("/admin/status", get(get_status_wrapper))
        .route("/admin/load", post(load_model_wrapper))
        .route("/admin/stop", post(stop_backend_wrapper))
        .route("/memory/optimize", post(memory_optimize_wrapper))
        .route("/memory/stats/:session_id", get(memory_stats_wrapper))
        .route("/memory/cleanup", post(memory_cleanup_wrapper))
        .route("/search", post(search_wrapper))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .layer(ConcurrencyLimitLayer::new(cfg.max_concurrent_streams as usize))
        .layer(TimeoutLayer::new(Duration::from_secs(cfg.generate_timeout_seconds)))
        .with_state(unified_state);

    info!("Starting server on {}:{}", cfg.api_host, cfg.api_port);
    let listener = tokio::net::TcpListener::bind(format!("{}:{}", cfg.api_host, cfg.api_port)).await?;
    
    axum::serve(listener, app).await?;
    
    Ok(())
}