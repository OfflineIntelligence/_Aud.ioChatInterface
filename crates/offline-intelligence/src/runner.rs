// Server/src/runner.rs

use crate::config::Config;
use anyhow::{Context, Result};
use std::time::{Duration, Instant};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;
use tokio::time::sleep;
use tracing::{info, warn};
use std::sync::Arc;
use nvml_wrapper::Nvml;
use std::net::TcpListener;

pub struct Runner {
    pub cfg: Config,
    inner: Mutex<RunnerInner>,
}

struct BackendInfo {
    child: Child,
    model_path: String,
    port: u16,
    started: Instant,
    gpu_layers: u32,
}

struct RunnerInner {
    backend: Option<BackendInfo>,
}

fn is_port_in_use(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_err()
}

fn find_available_port(start: u16, end: u16) -> Result<u16> {
    for port in start..=end {
        if !is_port_in_use(port) {
            return Ok(port);
        }
    }
    Err(anyhow::anyhow!("No available ports in range {}-{}", start, end))
}

// NEW: Intelligent GPU allocation based on actual hardware with CPU fallback
fn calculate_optimal_gpu_allocation(nvml: &Nvml, gpu_layers: u32) -> Result<Option<String>> {
    let device_count = nvml.device_count()?;
    
    if device_count == 0 {
        return Ok(None); // No GPUs available - CPU only
    }
    
    // Check VRAM of first GPU to decide GPU/CPU split
    let first_gpu = nvml.device_by_index(0)?;
    let memory_info = first_gpu.memory_info()?;
    let vram_gb = memory_info.total / 1024 / 1024 / 1024; // Convert to GB
    
    info!("Primary GPU detected: {} GB VRAM", vram_gb);
    
    if device_count == 1 {
        // Single GPU - decide whether to use CPU fallback based on VRAM size
        if vram_gb <= 8 {
            // Small GPU (<= 8GB) - use 70% GPU + 30% CPU split
            let gpu_layers_alloc = (gpu_layers as f32 * 0.7).round() as u32;
            let cpu_layers = gpu_layers - gpu_layers_alloc;
            
            info!("Small GPU detected ({} GB), using GPU/CPU split: {} layers on GPU, {} layers on CPU", 
                  vram_gb, gpu_layers_alloc, cpu_layers);
            
            // For single GPU with CPU fallback, we use tensor split with GPU layers only
            // The remaining layers will automatically go to CPU
            return Ok(Some(format!("{}", gpu_layers_alloc)));
        } else {
            // Large GPU (> 8GB) - use 100% on GPU
            info!("Large GPU detected ({} GB), using 100% layers on GPU", vram_gb);
            return Ok(None); // No tensor split needed - all layers on GPU 0
        }
    }
    
    // Multiple GPUs - calculate based on VRAM capacity
    let mut vram_capacities = Vec::new();
    for i in 0..device_count {
        let device = nvml.device_by_index(i)?;
        let memory_info = device.memory_info()?;
        vram_capacities.push((i, memory_info.total));
        info!("GPU {}: {} GB VRAM", i, memory_info.total / 1024 / 1024 / 1024);
    }
    
    // Sort by VRAM capacity (descending)
    vram_capacities.sort_by(|a, b| b.1.cmp(&a.1));
    
    // Calculate proportional split based on VRAM
    let total_vram: u64 = vram_capacities.iter().map(|(_, vram)| vram).sum();
    let mut splits = Vec::new();
    
    for (gpu_index, vram) in &vram_capacities {
        let proportion = *vram as f64 / total_vram as f64;
        let layers_for_gpu = (gpu_layers as f64 * proportion).round() as u32;
        splits.push((*gpu_index, layers_for_gpu.max(1))); // At least 1 layer per GPU
    }
    
    // Adjust to ensure total equals gpu_layers
    let total_allocated: u32 = splits.iter().map(|(_, layers)| layers).sum();
    if total_allocated != gpu_layers {
        let diff = gpu_layers as i32 - total_allocated as i32;
        if diff > 0 {
            // Add to largest GPU
            if let Some((_, layers)) = splits.first_mut() {
                *layers += diff as u32;
            }
        } else {
            // Remove from smallest GPU (but keep at least 1)
            if let Some((_, layers)) = splits.last_mut() {
                *layers = (*layers as i32 + diff).max(1) as u32;
            }
        }
    }
    
    // Create tensor split string in correct GPU order
    let mut tensor_split = Vec::new();
    for i in 0..device_count {
        if let Some((_, layers)) = splits.iter().find(|(idx, _)| *idx == i) {
            tensor_split.push(layers.to_string());
        } else {
            tensor_split.push("0".to_string());
        }
    }
    
    Ok(Some(tensor_split.join(",")))
}

// Updated spawn_llama_backend without multimodal detection
fn spawn_llama_backend(cfg: &Config, port: u16, model_path: String) -> Result<Child> {
    let mut args = vec![
        "--host".to_string(),
        cfg.llama_host.clone(),
        "--port".to_string(),
        port.to_string(),
        "-m".to_string(),
        model_path.clone(),
        "-n".to_string(),
        "-1".to_string(),
        "--keep".to_string(),
        "32".to_string(),
        "-c".to_string(),
        cfg.ctx_size.to_string(),
        "-b".to_string(),
        cfg.batch_size.to_string(),
        "-t".to_string(),
        cfg.threads.to_string(),
    ];

    if cfg.gpu_layers > 0 {
        info!("Using {} GPU layers + CPU fallback", cfg.gpu_layers);
        args.push("-ngl".to_string());
        args.push(cfg.gpu_layers.to_string());

        if let Ok(nvml) = Nvml::init() {
            match calculate_optimal_gpu_allocation(&nvml, cfg.gpu_layers) {
                Ok(Some(tensor_split)) => {
                    info!("Using optimized tensor split: {}", tensor_split);
                    args.push("--tensor-split".to_string());
                    args.push(tensor_split);
                }
                Ok(None) => {
                    info!("Large GPU detected - using 100% layers on GPU (no tensor split)");
                }
                Err(e) => {
                    warn!("Failed to calculate optimal GPU allocation: {}", e);
                    info!("Falling back to default GPU behavior");
                }
            }
        } else {
            warn!("NVML initialization failed - using default GPU allocation");
        }
    }

    let mut cmd = Command::new(&cfg.llama_bin);
    cmd.args(&args);
    cmd.stdin(std::process::Stdio::inherit());
    cmd.stdout(std::process::Stdio::inherit());
    cmd.stderr(std::process::Stdio::inherit());

    let child = cmd.spawn().context("Failed to spawn llama")?;
    info!("Spawned llama (pid={:?}) on port {} with {} gpu layers",
          child.id(), port, cfg.gpu_layers);
    Ok(child)
}

fn is_oom(err: &anyhow::Error) -> bool {
    format!("{err:?}").contains("CUDA out of memory") ||
    format!("{err:?}").contains("OOM") ||
    format!("{err:?}").contains("out of memory")
}

fn is_port_conflict(err: &anyhow::Error) -> bool {
    format!("{err:?}").contains("Address already in use") ||
    format!("{err:?}").contains("port") ||
    format!("{err:?}").contains("bind")
}

async fn probe(cfg: &Config, port: u16) -> bool {
    let url = format!("http://{}:{}/health", cfg.llama_host, port);
    match reqwest::get(&url).await {
        Ok(r) => r.status().is_success(),
        Err(_) => false,
    }
}

impl Runner {
    pub fn new(cfg: Config) -> Arc<Self> {
        Arc::new(Self {
            cfg,
            inner: Mutex::new(RunnerInner { backend: None }),
        })
    }

    pub async fn spawn_model(self: &Arc<Self>, model_path: String) -> Result<String> {
        let mut port = self.cfg.llama_port;

        if is_port_in_use(port) {
            warn!("Port {} is already in use, trying alternative port", port);
            port = find_available_port(port + 1, port + 100)?;
        }

        let child = spawn_llama_backend(&self.cfg, port, model_path.clone())?;

        let info = BackendInfo {
            child,
            model_path: model_path.clone(),
            port,
            started: Instant::now(),
            gpu_layers: self.cfg.gpu_layers,
        };

        let start = Instant::now();
        let timeout = Duration::from_secs(self.cfg.health_timeout_seconds);
        loop {
            if probe(&self.cfg, port).await {
                info!("Backend is healthy on port {}", port);
                break;
            }
            if start.elapsed() > timeout {
                return Err(anyhow::anyhow!("Backend did not start within timeout"));
            }
            sleep(Duration::from_millis(100)).await;
        }

        self.inner.lock().await.backend = Some(info);
        Ok(format!("http://{}:{}", self.cfg.llama_host, port))
    }

    pub async fn load_model_phased(self: &Arc<Self>, model_path: String) -> Result<String> {
        if self.current_model().await.is_some() {
            info!("Stopping current backend for hot-swap");
            self.stop().await?;
            sleep(Duration::from_secs(self.cfg.hot_swap_grace_seconds)).await;
        }

        self.spawn_model(model_path).await
    }

    pub async fn stop(&self) -> Result<()> {
        let mut inner = self.inner.lock().await;
        if let Some(mut backend) = inner.backend.take() {
            info!("Stopping backend on port {}...", backend.port);
            backend.child.kill().await.context("Failed to kill backend process")?;
            backend.child.wait().await?;
            info!("Backend process stopped.");
        }
        Ok(())
    }

    pub async fn current_model(&self) -> Option<(String, u16, u32)> {
        let inner = self.inner.lock().await;
        inner.backend.as_ref().map(|b| (b.model_path.clone(), b.port, b.gpu_layers))
    }

    pub async fn probe_active(&self) -> bool {
        let inner = self.inner.lock().await;
        if let Some(backend) = inner.backend.as_ref() {
            probe(&self.cfg, backend.port).await
        } else {
            false
        }
    }

    pub async fn get_uptime(&self) -> Option<u64> {
        let inner = self.inner.lock().await;
        inner.backend.as_ref().map(|b| b.started.elapsed().as_secs())
    }

    pub async fn stop_all(&self) -> Result<()> {
        self.stop().await
    }
}