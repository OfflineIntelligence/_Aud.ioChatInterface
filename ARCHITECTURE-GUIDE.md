# Offline Intelligence Architecture Guide

## Two Approaches to Running the Application

### Approach 1: Embedded Backend (RECOMMENDED)
**Script**: `complete-start.bat`

**How it works**:
- Tauri desktop app (`offline-intelligence-desktop.exe`) embeds the `offline-intelligence` library
- The library contains the backend server logic (`run_server` function)
- Single process handles both desktop UI and backend services
- No port conflicts since everything runs in one process

**Advantages**:
- ✅ No port conflicts
- ✅ Simpler process management  
- ✅ Automatic coordination between UI and backend
- ✅ Proven working approach

### Approach 2: Standalone + Embedded (PROBLEMATIC)
**Script**: `manual-start.bat`

**How it works**:
- Starts standalone backend server (`offline-intelligence.exe`) on port 8000
- Starts Tauri app which ALSO tries to start embedded backend on port 8000
- Results in port binding conflicts

**Issues**:
- ❌ Port 8000 conflict between standalone and embedded backend
- ❌ Tauri app crashes when it can't bind to port
- ❌ Resource contention and confusion

## Why This Happens

Looking at `apps/desktop/src-tauri/src/main.rs`:
```rust
// Tauri app imports the offline-intelligence library
use offline_intelligence::{Config, run_server};

fn main() {
    // Spawns embedded backend server in a thread
    std::thread::spawn(|| {
        let mut config = Config::from_env().unwrap();
        config.api_port = 8000; // Same port as standalone!
        run_server(config).await; // This starts the backend
    });
    
    // Runs the Tauri desktop app
    tauri::Builder::default().run(...);
}
```

When you run `manual-start.bat`, you get:
1. `offline-intelligence.exe` binding to port 8000 ✅
2. `offline-intelligence-desktop.exe` trying to bind to port 8000 ❌ (conflict!)

## Recommendation

**Use `complete-start.bat`** - it's the correct architectural approach that:
- Leverages the library-as-backend design
- Avoids port conflicts entirely
- Has been proven to work successfully
- Matches the intended monorepo architecture

The manual approach was useful for understanding the system, but the embedded approach is the production-ready solution.