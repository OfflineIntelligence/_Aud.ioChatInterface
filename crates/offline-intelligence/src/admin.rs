// Server/src/admin.rs

use axum::extract::{State, Json};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use crate::config::Config;
use crate::backend_target::BackendTarget;
use crate::runner::Runner;
use crate::metrics;
use serde::{Deserialize, Serialize};
use tracing::{info, error};
use std::sync::Arc;
use sysinfo::System;


#[allow(dead_code)]
#[derive(Clone)]
pub struct AdminState {
    pub cfg: Config,
    pub backend_target: BackendTarget,
    pub runner: Arc<Runner>,
}

#[derive(Deserialize)]
pub struct LoadModelRequest {
    pub model_path: String,
    pub ctx_size: Option<u32>,
    pub gpu_layers: Option<u32>,
    pub batch_size: Option<u32>,
}

#[derive(Serialize)]
pub struct StatusResponse {
    pub current_model: Option<String>,
    pub current_port: Option<u16>,
    pub gpu_layers: Option<u32>,
    pub ctx_size: Option<u32>,        // Add context size
    pub batch_size: Option<u32>,      // Add batch size
    pub is_healthy: bool,
    pub uptime_seconds: Option<u64>,
    pub memory_usage: Option<String>, // Add memory info
}

pub async fn get_status(
    State(state): State<AdminState>,  // Remove the `admin::` prefix
) -> impl IntoResponse {
    let current_model = state.runner.current_model().await;
    let is_healthy = state.runner.probe_active().await;
    
    let (current_model_path, current_port, gpu_layers) = current_model.unwrap_or_else(|| (String::new(), 0, 0));
    let current_model = if current_model_path.is_empty() { None } else { Some(current_model_path) };
    let current_port = if current_port == 0 { None } else { Some(current_port) };
    let gpu_layers = if gpu_layers == 0 { None } else { Some(gpu_layers) };

    let uptime_seconds = state.runner.get_uptime().await;
    
    // Add memory info
    let memory_usage = {
        let mut sys = System::new_all();
        sys.refresh_memory();
        let used = sys.used_memory();
        let total = sys.total_memory();
        Some(format!("{}/{} MB", used / 1024 / 1024, total / 1024 / 1024))
    };

    // Get current config values for ctx_size and batch_size
    let ctx_size = Some(state.cfg.ctx_size);
    let batch_size = Some(state.cfg.batch_size);
    
    let response = StatusResponse {
        current_model,
        current_port,
        gpu_layers,
        ctx_size,
        batch_size,
        is_healthy,
        uptime_seconds,
        memory_usage,
    };
    
    metrics::inc_request("admin_status", "ok");
    (StatusCode::OK, Json(response))
}

pub async fn load_model(
    State(state): State<AdminState>,
    Json(req): Json<LoadModelRequest>,
) -> impl IntoResponse {
    info!("Received load model request for: {} with ctx_size: {:?}, gpu_layers: {:?}", 
          req.model_path, req.ctx_size, req.gpu_layers);
    
    // Create a modified config for this specific request
    let mut modified_cfg = state.cfg.clone();
    if let Some(ctx_size) = req.ctx_size {
        modified_cfg.ctx_size = ctx_size;
    }
    if let Some(gpu_layers) = req.gpu_layers {
        modified_cfg.gpu_layers = gpu_layers;
    }
    if let Some(batch_size) = req.batch_size {
        modified_cfg.batch_size = batch_size;
    }
    
    match state.runner.load_model_phased(req.model_path.clone()).await {
        Ok(url) => {
            state.backend_target.set(url.clone()).await;
            metrics::inc_request("admin_load", "ok");
            (StatusCode::OK, format!("Model loaded successfully: {}", req.model_path))
        }
        Err(e) => {
            error!("Failed to load model: {}", e);
            metrics::inc_request("admin_load", "error");
            (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to load model: {}", e))
        }
    }
}

pub async fn stop_backend(
    State(state): State<AdminState>,
) -> impl IntoResponse {
    info!("Received stop backend request");
    
    match state.runner.stop().await {
        Ok(_) => {
            metrics::inc_request("admin_stop", "ok");
            (StatusCode::OK, "Backend stopped successfully".to_string())
        }
        Err(e) => {
            error!("Failed to stop backend: {}", e);
            metrics::inc_request("admin_stop", "error");
            (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to stop backend: {}", e))
        }
    }
}

