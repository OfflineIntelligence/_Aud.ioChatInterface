// apps/desktop/src-tauri/src/main.rs

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]


use offline_intelligence::{Config, run_server};
use std::sync::{Arc, atomic::{AtomicBool, Ordering}};
use tokio::time::{sleep, Duration};



#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

async fn wait_for_server_ready(host: &str, port: u16, timeout_seconds: u64) -> Result<(), Box<dyn std::error::Error>> {
    let url = format!("http://{}:{}/healthz", host, port);
    let start = std::time::Instant::now();
    let timeout = Duration::from_secs(timeout_seconds);
    
    println!("⏳ Waiting for server to be ready at {}...", url);
    
    while start.elapsed() < timeout {
        match reqwest::get(&url).await {
            Ok(response) => {
                if response.status().is_success() {
                    println!("✅ Server is ready!");
                    return Ok(());
                }
            }
            Err(_) => {
                // Server not ready yet, continue waiting
                sleep(Duration::from_millis(500)).await;
            }
        }
    }
    
    Err(format!("Server failed to become ready within {} seconds", timeout_seconds).into())
}

fn main() {
    
    // Create a flag to signal when server is ready
    let server_ready = Arc::new(AtomicBool::new(false));
    let server_ready_clone = server_ready.clone();
    
    // Start server in background thread
    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().expect("Failed to create Tokio runtime");
        rt.block_on(async {
            let mut config = Config::from_env()
                .expect("Unable to build Config from environment. Check .env and required vars.");

            config.api_host = "127.0.0.1".to_string();
            config.api_port = 8080; // different from the stand-alone server
            config.max_concurrent_streams = 4;
            config.generate_timeout_seconds = 300;

            println!("🚀 Starting backend server...");
            if let Err(e) = run_server(config).await {
                eprintln!("❌ Server failed to start: {}", e);
            }
        });
    });

    // Wait for server to be ready before launching Tauri
    let rt = tokio::runtime::Runtime::new().expect("Failed to create Tokio runtime for readiness check");
    rt.block_on(async {
        match wait_for_server_ready("127.0.0.1", 8080, 120).await {
            Ok(_) => {
                server_ready_clone.store(true, Ordering::Relaxed);
                println!("🎯 Server readiness confirmed, launching Tauri application...");
            }
            Err(e) => {
                eprintln!("❌ Server failed to become ready: {}", e);
                std::process::exit(1);
            }
        }
    });

    // Launch Tauri application
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())

        .invoke_handler(tauri::generate_handler![
            greet
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}