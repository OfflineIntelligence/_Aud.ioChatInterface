# Aud.io ChatInterface - Comprehensive System Design Report

**Document Version:** 1.0  
**Date:** March 3, 2026  
**Classification:** Technical Architecture Documentation  

---

## Executive Summary

Aud.io ChatInterface is a sophisticated **offline-first AI runtime platform** built with Rust and React/TypeScript, featuring a three-tier persistent memory system, multi-format model support, and hybrid local/cloud inference capabilities. The system processes all AI workloads locally on-device while maintaining infinite context through intelligent cache management and semantic retrieval.

### Core Value Proposition
- **Privacy-First**: Zero data leaves the user's hardware during local inference
- **Persistent Memory**: Three-tier system (Hot KV Cache → Warm Summaries → Cold Full History)
- **Multi-Format Support**: GGUF, ONNX, TensorRT, Safetensors, GGML, CoreML
- **Hybrid Mode**: Seamless fallback to cloud APIs (OpenRouter) when local resources are insufficient
- **Cross-Platform**: Windows, macOS (Intel + Apple Silicon), Linux

---

## 1. System Architecture Overview

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Tauri Desktop Application                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              React + TypeScript Frontend                  │  │
│  │  • Chat Interface      • Models Panel    • Settings       │  │
│  │  • Local Files         • Metrics         • Search Modal   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              ↕ Tauri IPC                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │         Rust Backend (offline-intelligence crate)         │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │          Axum HTTP Server (Port 9999)              │  │  │
│  │  │  /generate/stream  │  /conversations  │  /models   │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │                              ↕                             │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │  │
│  │  │ LLM Worker   │  │ Context      │  │ Cache        │   │  │
│  │  │              │  │ Orchestrator │  │ Manager      │   │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │  │
│  │                              ↕                             │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │         Model Runtime Abstraction Layer            │  │  │
│  │  │  GGUF │ ONNX │ TensorRT │ Safetensors │ GGML      │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              ↕                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              SQLite Database + WAL Mode                  │  │
│  │  • Conversations  • Summaries  • Embeddings  • Files    │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                ↕
                ┌───────────────┴───────────────┐
                │                               │
        ┌───────────────┐              ┌───────────────┐
        │ llama-server  │              │  OpenRouter   │
        │ (localhost)   │              │  (Cloud API)  │
        │  Port 8081    │              │               │
        └───────────────┘              └───────────────┘
```

### 1.2 Key Design Principles

1. **1-Hop Architecture**: All internal communication via shared memory (Arc<RwLock<T>>), only network call is to localhost llama-server
2. **Thread-Based Concurrency**: Dedicated worker threads for LLM, Context, Cache, and Database operations
3. **Graceful Degradation**: System starts without models/binaries, allows downloads later via registry
4. **Zero-Knowledge Privacy**: All inference happens on-device; cloud mode uses user's own API keys

---

## 2. Backend Architecture (Rust)

### 2.1 Core Modules

#### **`offline-intelligence` Crate Structure**

```
src/
├── api/                      # HTTP API Endpoints (Axum)
│   ├── stream_api.rs        # POST /generate/stream - Main inference
│   ├── conversation_api.rs  # GET/PUT/DELETE /conversations/*
│   ├── model_api.rs         # Model download/install/remove
│   ├── online_api.rs        # POST /online/stream - Cloud fallback
│   ├── memory_api.rs        # Memory optimization endpoints
│   ├── cache_management/    # KV cache operations
│   ├── files_api.rs         # Local file management
│   ├── auth_api.rs          # JWT + Google OAuth
│   └── ... (14 total modules)
│
├── context_engine/           # Memory Orchestration
│   ├── orchestrator.rs      # Main coordinator
│   ├── retrieval_planner.rs # Plans memory retrieval strategies
│   ├── tier_manager.rs      # Manages 3 memory tiers
│   ├── context_builder.rs   # Assembles final context
│   └── smart_retrieval.rs   # Keyword + Semantic search
│
├── cache_management/         # KV Cache System
│   ├── cache_manager.rs     # Core cache logic
│   ├── cache_extractor.rs   # Extracts KV entries from conversations
│   ├── cache_scorer.rs      # Scores entry importance
│   ├── cache_bridge.rs      # Cross-session context bridging
│   └── llama_cache_interface.rs
│
├── model_runtime/            # Multi-Format Runtime
│   ├── runtime_trait.rs     # Abstract ModelRuntime trait
│   ├── gguf_runtime.rs      # llama.cpp integration
│   ├── onnx_runtime.rs      # ONNX Runtime integration
│   ├── tensorrt_runtime.rs  # NVIDIA TensorRT
│   ├── safetensors_runtime.rs
│   ├── ggml_runtime.rs
│   ├── coreml_runtime.rs    # Apple CoreML
│   ├── format_detector.rs   # Auto-detect model format
│   └── runtime_manager.rs   # Manages active runtime
│
├── model_management/         # Model Registry & Downloads
│   ├── registry.rs          # Model metadata registry
│   ├── downloader.rs        # HuggingFace downloads
│   ├── installer.rs         # Model installation
│   └── recommendation.rs    # Hardware-based recommendations
│
├── engine_management/        # Engine Lifecycle
│   ├── engine_manager.rs    # Manages llama-server binaries
│   └── platform_detector.rs # Hardware capability detection
│
├── memory_db/                # SQLite Data Layer
│   ├── schema.rs            # Database schema
│   ├── migration.rs         # Schema migrations
│   ├── conversation_store.rs
│   ├── summary_store.rs
│   ├── embedding_store.rs   # Vector embeddings (Hora)
│   ├── local_files_store.rs
│   └── api_keys_store.rs    # Encrypted API keys (OS Keychain)
│
├── worker_threads/           # Async Workers
│   ├── llm_worker.rs        # Inference requests
│   ├── context_worker.rs    # Context assembly
│   ├── cache_worker.rs      # Cache maintenance
│   └── database_worker.rs   # DB operations
│
├── thread_pool.rs            # Thread Pool Management
├── thread_server.rs          # Server Startup & Routing
├── shared_state.rs           # Arc<RwLock<T>> State Container
├── config.rs                 # Configuration & Auto-Detection
└── lib.rs / main.rs          # Entry Points
```

### 2.2 Shared State Architecture

**`SharedSystemState`** - Thread-safe container using `Arc<RwLock<T>>`:

```rust
pub struct SharedSystemState {
    // Conversation Data
    pub conversations: Arc<ConversationHierarchy>,
    
    // Inference
    pub llm_runtime: Arc<RwLock<Option<LLMRuntime>>>,
    pub runtime_manager: Arc<RwLock<Option<RuntimeManager>>>,
    
    // Memory System
    pub cache_manager: Arc<RwLock<Option<KVCacheManager>>>,
    pub context_orchestrator: Arc<RwLock<Option<ContextOrchestrator>>>,
    
    // Model Management
    pub model_manager: Arc<RwLock<Option<ModelManager>>>,
    pub engine_manager: Arc<RwLock<Option<EngineManager>>>,
    
    // Workers
    pub llm_worker: Arc<LLMWorker>,
    pub context_worker: Arc<ContextWorker>,
    pub cache_worker: Arc<CacheWorker>,
    pub database_worker: Arc<DatabaseWorker>,
    
    // Database Pool
    pub database_pool: Arc<MemoryDatabase>,
    
    // Pre-extracted Attachments
    pub pre_extracted: Arc<DashMap<String, PreExtracted>>,
}
```

**Thread Safety Strategy:**
- Fine-grained locking per component
- No global lock contention
- Workers communicate via message passing (mpsc channels)
- DashMap for concurrent hash maps

### 2.3 Configuration System (`config.rs`)

**Auto-Detection Capabilities:**

| Resource | Detection Method | Fallback |
|----------|-----------------|----------|
| **CPU Threads** | `num_cpus::get()` | 6 threads |
| **GPU Layers** | NVML (NVIDIA), nvidia-smi, Metal (macOS) | 0 (CPU-only) |
| **Context Size** | Model filename heuristics | 8192 tokens |
| **Batch Size** | Available RAM calculation | 256 |
| **Model Path** | MODEL_PATH env or embedded resources | Empty (download later) |
| **LLama Binary** | LLAMA_BIN env or Resources/bin/{OS}/ | Empty (download later) |

**Smart GPU Detection:**
- **NVIDIA**: NVML → VRAM-based layer allocation (4GB=12L, 8GB=20L, 12GB=32L, 16GB+=40L)
- **Apple Silicon**: Unified memory scaling (8GB=24L, 16GB=32L, 32GB+=40L)
- **Intel Mac**: CPU-only mode (0 GPU layers)

### 2.4 API Endpoint Taxonomy

**Core Inference:**
- `POST /generate/stream` - Main streaming generation (local)
- `POST /online/stream` - Online mode (OpenRouter API)
- `POST /generate/title` - Auto-generate chat titles

**Conversation Management:**
- `GET /conversations` - List all conversations
- `GET /conversations/:id` - Get specific conversation
- `PUT /conversations/:id/title` - Update title
- `POST /conversations/:id/pinned` - Pin/unpin
- `DELETE /conversations/:id` - Delete conversation
- `GET /conversations/db-stats` - Database statistics

**Model Management:**
- `GET /models` - List available models
- `GET /models/search` - Search HuggingFace
- `POST /models/install` - Download & install model
- `DELETE /models/:id` - Remove model
- `GET /models/download-progress` - Progress tracking
- `GET /models/hardware-info` - Hardware capabilities

**Memory & Cache:**
- `POST /memory/optimize` - Manual optimization
- `GET /memory/stats` - Memory statistics
- `POST /memory/cleanup` - Cleanup old data

**File Operations:**
- `GET /files` - List local files
- `POST /files/folder` - Create folder
- `POST /attachments/preprocess` - Pre-extract attachment text
- `GET /all-files` - Unlimited file storage listing

**Authentication:**
- `POST /auth/signup` - Email/password signup
- `POST /auth/login` - Login
- `POST /auth/google/init` - Google OAuth init
- `GET /auth/google/callback` - OAuth callback
- `POST /auth/me` - Get current user

**System:**
- `GET /healthz` - Health check
- `GET /metrics` - Prometheus metrics
- `POST /admin/shutdown` - Graceful shutdown

---

## 3. Memory System Architecture

### 3.1 Three-Tier Memory Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│                    Tier 1: Hot Memory                       │
│              Active KV Cache (Instant Recall)               │
│  • Current conversation context                            │
│  • Stored in: Moka cache + DashMap                         │
│  • Access time: <1ms                                       │
│  • Capacity: Configurable (default: 50 entries/session)    │
└─────────────────────────────────────────────────────────────┘
                            ↓ (Cache full → Snapshot)
┌─────────────────────────────────────────────────────────────┐
│                   Tier 2: Warm Memory                       │
│             Summarized Content + KV Snapshots               │
│  • Compressed conversation summaries                       │
│  • Stored in: SQLite (summaries table)                     │
│  • Access time: 10-100ms                                   │
│  • Retrieval: Keyword + Semantic search                    │
└─────────────────────────────────────────────────────────────┘
                            ↓ (Older content → Archive)
┌─────────────────────────────────────────────────────────────┐
│                   Tier 3: Cold Memory                       │
│              Full Conversation History (SQLite)             │
│  • Complete message history with embeddings                │
│  • Stored in: SQLite (conversations + embeddings tables)   │
│  • Access time: 100ms - 1s                                 │
│  • Search: Cross-session semantic search                   │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Cache Management Pipeline

**Processing Flow:**

1. **Message Arrival** → Extract KV entries via `CacheExtractor`
2. **Scoring** → `CacheEntryScorer` assigns importance (0.0-1.0)
3. **Storage** → Store in Moka cache with metadata
4. **Threshold Check** → If cache exceeds limits:
   - Trigger snapshot to Tier 2
   - Clear low-importance entries
   - Preserve high-importance entries (>0.4 threshold)
5. **Bridge Creation** → Generate context bridge messages for continuity

**Retrieval Strategy:**

```rust
pub enum RetrievalStrategy {
    KeywordOnly,
    SemanticOnly,
    KeywordThenSemantic,  // Default
    Hybrid,
}
```

**Smart Retrieval Decision Tree:**
- User asks question? → Retrieve from Tier 2/3
- Message contains code blocks? → Retrieve related code context
- Message >100 chars? → Cross-session search
- Contains "explain" or "how to"? → Retrieve educational content

### 3.3 Context Assembly Algorithm

**`ContextOrchestrator::assemble_context()` flow:**

```
Input: User query + session_id
  ↓
1. Check Tier 1 (KV Cache)
   ├─ If sufficient → Return immediately
   └─ If insufficient → Continue
  ↓
2. Query Tier 2 (Summaries)
   ├─ Keyword search on summary text
   ├─ Semantic search on summary embeddings (if enabled)
   └─ Merge results (deduplication)
  ↓
3. Query Tier 3 (Full DB) [if cross_session enabled]
   ├─ Search across all sessions
   ├─ Filter by recency + relevance
   └─ Apply compression if needed
  ↓
4. Build Final Context
   ├─ Sort by relevance + temporal order
   ├─ Truncate to max_context_tokens
   └─ Add bridge messages for coherence
  ↓
Output: Vec<Message> ready for LLM
```

**Token Budgeting:**
- Default max: 8192 tokens
- Dynamic adjustment based on available RAM
- Compression ratio target: 3:1 for summaries

---

## 4. Model Runtime System

### 4.1 Multi-Format Abstraction

**`ModelRuntime` Trait:**

```rust
pub trait ModelRuntime {
    async fn load_model(&mut self, path: &str, config: RuntimeConfig) -> Result<()>;
    async fn generate(&self, request: InferenceRequest) -> Result<InferenceResponse>;
    async fn generate_embeddings(&self, texts: &[String]) -> Result<Vec<Vec<f32>>>;
    fn unload_model(&mut self) -> Result<()>;
    fn is_ready(&self) -> bool;
}
```

**Supported Formats:**

| Format | Runtime | Backend | Use Case |
|--------|---------|---------|----------|
| **GGUF** | `GGUFRuntime` | llama.cpp | General purpose (default) |
| **ONNX** | `ONNXRuntime` | Microsoft ONNX Runtime | Cross-platform, enterprise |
| **TensorRT** | `TensorRTRuntime` | NVIDIA TensorRT | High-performance NVIDIA GPUs |
| **Safetensors** | `SafetensorsRuntime` | PyTorch binding | Research models |
| **GGML** | `GGMLRuntime` | llama.cpp (legacy) | Older GGML models |
| **CoreML** | `CoreMLRuntime` | Apple Vision framework | macOS/iOS optimized |

### 4.2 Format Detection

**`FormatDetector::detect()` logic:**

```rust
match file_extension {
    ".gguf" | ".ggml" => ModelFormat::GGUF,
    ".onnx" => ModelFormat::ONNX,
    ".trt" | ".engine" | ".plan" => ModelFormat::TensorRT,
    ".safetensors" => ModelFormat::Safetensors,
    ".mlmodel" | ".mlpackage" => ModelFormat::CoreML,
    _ => Err("Unsupported format"),
}
```

### 4.3 Runtime Manager

**Responsibilities:**
- Track installed engines (GGUF, ONNX, etc.)
- Manage active runtime instance
- Handle hot-swapping between formats
- Monitor runtime health

**State Machine:**
```
Initializing → Ready → Loading Model → Active → Unloading
     ↑                                        ↓
     └────────────────────────────────────────┘
```

### 4.4 LLM Worker Request Flow

**`LLMWorker::generate_response_stream()`:**

```
1. Check runtime readiness
   ├─ runtime_manager.ready()? 
   └─ Return error if not ready ("Load a model first")
  ↓
2. Build ChatCompletionRequest
   ├─ Convert Vec<Message> to OpenAI format
   ├─ Apply max_tokens, temperature
   └─ Set stream=true
  ↓
3. POST to llama-server
   ├─ URL: http://127.0.0.1:{port}/v1/chat/completions
   ├─ Content-Type: application/json
   └─ Stream response chunks
  ↓
4. Parse SSE stream
   ├─ Buffer partial JSON
   ├─ Extract delta content
   ├─ Yield format!("data: {}\n\n", data)
   └─ End with "data: [DONE]\n\n"
  ↓
5. Error handling
   ├─ Connection errors → User-friendly message
   ├─ HTTP errors → Status + body
   └─ Parse errors → Raw data passthrough
```

---

## 5. Database Schema

### 5.1 SQLite Schema Overview

**Tables:**

```sql
-- Conversations (Tier 3 storage)
CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    title TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    pinned BOOLEAN DEFAULT FALSE,
    session_id TEXT UNIQUE
);

-- Messages
CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT REFERENCES conversations(id),
    role TEXT NOT NULL,  -- 'user', 'assistant', 'system'
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Summaries (Tier 2)
CREATE TABLE summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT REFERENCES conversations(id),
    summary_text TEXT,
    compression_ratio REAL,
    created_at TIMESTAMP
);

-- Embeddings (Vector Search)
CREATE TABLE embeddings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER REFERENCES messages(id),
    embedding BLOB,  -- Hora vector storage
    dimension INTEGER
);

-- KV Cache Snapshots
CREATE TABLE kv_cache_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    message_id INTEGER,
    snapshot_type TEXT,  -- 'full', 'delta'
    size_bytes INTEGER,
    created_at TIMESTAMP
);

-- Local Files (Limited formats: txt, pdf, docx, xlsx, pptx)
CREATE TABLE local_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id INTEGER REFERENCES local_files(id),
    name TEXT NOT NULL,
    path TEXT UNIQUE,
    file_type TEXT,  -- 'file', 'folder'
    size_bytes INTEGER,
    created_at TIMESTAMP
);

-- All Files (Unlimited formats)
CREATE TABLE all_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id INTEGER,
    name TEXT,
    path TEXT UNIQUE,
    file_type TEXT,
    size_bytes INTEGER,
    created_at TIMESTAMP
);

-- API Keys (Encrypted in OS Keychain, metadata here)
CREATE TABLE api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_type TEXT UNIQUE,  -- 'huggingface', 'openrouter'
    last_used_at TIMESTAMP,
    last_mode TEXT,
    usage_count INTEGER DEFAULT 0
);

-- Users (Auth)
CREATE TABLE users (
    id TEXT PRIMARY KEY,  -- UUID
    email TEXT UNIQUE,
    password_hash TEXT,
    google_id TEXT UNIQUE,
    verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP
);
```

### 5.2 Connection Pool Configuration

```rust
let manager = SqliteConnectionManager::file(db_path)
    .with_flags(
        SQLITE_OPEN_READ_WRITE
        | SQLITE_OPEN_CREATE
        | SQLITE_OPEN_FULL_MUTEX,
    );

let pool = Pool::builder()
    .max_size(10)  // Concurrent connections
    .build(manager)?;

// PRAGMA optimizations
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;      -- Write-Ahead Logging
PRAGMA synchronous = NORMAL;    -- Balance safety/speed
PRAGMA busy_timeout = 5000;     -- 5s timeout for locks
```

### 5.3 Migration System

**`MigrationManager`** handles schema versioning:
- Automatic migration on startup
- Rollback support
- Version tracking in `schema_versions` table

---

## 6. Frontend Architecture (React/TypeScript)

### 6.1 Component Hierarchy

```
App.tsx (Main Container)
├── Sidebar.tsx
│   ├── Conversation list
│   ├── Search trigger
│   └── View switcher
│
├── ChatWindow.tsx (Active View)
│   ├── MessageList
│   │   └── MessageContent.tsx (Markdown rendering)
│   ├── InputArea
│   │   ├── Attachment uploader
│   │   └── Send button
│   └── Typing indicator
│
├── ModelsPanel.tsx
│   ├── Model browser
│   ├── Download progress
│   ├── Installed models
│   └── API key configuration
│
├── SettingsPanel.tsx
│   ├── Theme toggle
│   ├── Context size slider
│   ├── GPU layers control
│   └── Advanced settings
│
├── LocalFilesPanel.tsx
│   ├── File tree view
│   ├── Folder management
│   └── File preview
│
├── MetricsPanel.tsx
│   ├── System stats
│   ├── Model performance
│   └── Memory usage
│
├── SearchModal.tsx
│   └── Cross-conversation search
│
├── LoginModal.tsx
│   └── Auth forms (Email + Google)
│
└── NotificationsContainer
    └── Toast notifications
```

### 6.2 State Management

**Context Providers:**
- `AuthContext` - User authentication state
- `ApiKeyContext` - HuggingFace/OpenRouter keys
- `NotificationContext` - Toast notifications
- `ThemeContext` - Dark/light theme

**Local State Patterns:**
```typescript
// Active session persistence
const [activeSessionId, setActiveSessionId] = useState(() => {
  return localStorage.getItem('aud-io-active-session');
});

// Model selection
const [selectedModel, setSelectedModel] = useState(() => {
  const saved = localStorage.getItem('aud-io-selected-model');
  return saved ? JSON.parse(saved) : null;
});

// Online mode toggle
const [isOnlineMode, setIsOnlineMode] = useState(() => {
  return localStorage.getItem('aud-io-online-mode') === 'true';
});
```

### 6.3 API Communication

**Backend URL Discovery:**
```typescript
// apps/desktop/src/api/backendUrl.ts
export function getApiBaseSync(): string {
  if (typeof window !== 'undefined' && 'tauri' in window) {
    const port = window.__TAURI__.invoke<number>('get_backend_port');
    return `http://127.0.0.1:${port}`;
  }
  return import.meta.env.VITE_API_URL || 'http://127.0.0.1:9999';
}
```

**Fetch with Timeout:**
```typescript
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 30000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}
```

### 6.4 Chat Title Generation

**`useChatTitle.ts` Hook:**
```typescript
const generateTitle = async (prompt: string): Promise<string | null> => {
  const response = await fetch(`${getApiBaseSync()}/generate/title`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: prompt.trim(),
      max_tokens: 20,
    }),
  });
  
  const data: GenerateTitleResponse = await response.json();
  return data.title;
};
```

**Backend Processing (`title_api.rs`):**
1. Receive user's first message
2. Send to LLM worker with prompt: "Generate a concise 3-5 word title for this conversation: {message}"
3. Return generated title
4. Frontend updates conversation list

---

## 7. Authentication System

### 7.1 Dual Auth Modes

**Email/Password (Legacy):**
- Argon2id password hashing
- JWT token-based sessions
- Email verification flow

**Google OAuth (Preferred):**
- OAuth 2.0 PKCE flow
- No password storage
- Automatic email verification

### 7.2 JWT Token Structure

```rust
pub struct Claims {
    pub sub: String,  // User ID
    pub email: String,
    pub exp: usize,   // Expiration (Unix timestamp)
    pub iat: usize,   // Issued at
}
```

**Token Lifecycle:**
- Access token: 7 days
- Refresh token: 30 days (stored in HTTP-only cookie)
- Auto-refresh on expiry

### 7.3 API Key Storage

**Security Architecture:**
```
User enters API key
        ↓
Frontend sends plaintext over localhost HTTPS
        ↓
Backend receives in /api/keys/save
        ↓
Store in OS Keychain:
  • Windows: Credential Manager
  • macOS: Keychain Service
  • Linux: libsecret (GNOME Keyring/KWallet)
        ↓
DB stores only metadata (last_used, usage_count)
```

**Key Types:**
- `huggingface` - Model downloads (gated/private models)
- `openrouter` - Online mode inference

---

## 8. Model Management System

### 8.1 Model Registry

**`ModelInfo` Structure:**
```rust
pub struct ModelInfo {
    pub id: String,           // Unique identifier
    pub name: String,         // Display name
    pub description: String,
    pub size_bytes: u64,
    pub format: String,       // "GGUF", "ONNX", etc.
    pub status: ModelStatus,  // NotDownloaded, Downloading, Installed
    pub source: ModelSource,  // HuggingFace, Local, Bundled
    pub quantization: Option<String>,  // "Q4_K_M", "FP16", etc.
    pub recommended_ram_gb: u32,
    pub recommended_vram_gb: u32,
}
```

### 8.2 Download Pipeline

**`ModelDownloader::download()` flow:**

```
1. Validate HuggingFace model ID
   ├─ Check if gated model
   └─ Verify HF token from keychain
  ↓
2. Fetch model info from HF API
   ├─ Get file size
   ├─ Check quantization options
   └─ Determine best variant
  ↓
3. Download to temp directory
   ├─ Stream with progress tracking
   ├─ Resume support (Range header)
   └─ SHA256 checksum verification
  ↓
4. Install to user data directory
   ├─ Move to ~/.aud.io/models/
   ├─ Update registry metadata
   └─ Mark as Installed
  ↓
5. Notify Runtime Manager
   └─ Trigger auto-load if configured
```

**Progress Tracking:**
```rust
pub struct DownloadProgress {
    pub model_id: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub speed_bytes_per_sec: f64,
    pub eta_seconds: u64,
    pub status: DownloadStatus,  // Pending, InProgress, Complete, Failed
}
```

### 8.3 Hardware Recommendations

**`ModelRecommender` Algorithm:**

```rust
pub fn recommend_models(hardware: &HardwareInfo) -> Vec<ModelInfo> {
    let total_ram_gb = hardware.total_memory / 1024 / 1024 / 1024;
    let vram_gb = hardware.vram.map(|v| v / 1024).unwrap_or(0);
    
    // Rule-based filtering
    models.iter().filter(|model| {
        model.recommended_ram_gb <= total_ram_gb
        && (model.recommended_vram_gb <= vram_gb || vram_gb == 0)
    }).collect()
}
```

**Hardware Detection:**
- **RAM**: `sysinfo::System::total_memory()`
- **VRAM**: NVML (NVIDIA), Metal (macOS), ROCm (AMD - future)
- **CPU Cores**: `num_cpus::get()`
- **GPU Model**: `sysinfo::Components` → GPU detection

---

## 9. File Attachment System

### 9.1 Two-Tier File Storage

**Local Files (Limited):**
- Supported formats: `.txt`, `.pdf`, `.docx`, `.xlsx`, `.pptx`
- Stored in: `~/.aud.io/local_files/`
- Metadata in SQLite `local_files` table
- Used for quick access common documents

**All Files (Unlimited):**
- All formats supported
- Stored in: `~/.aud.io/all_files/`
- Metadata in `all_files` table
- Used for research papers, codebases, archives

### 9.2 Text Extraction Pipeline

**Preprocessing Flow (`attachment_api.rs`):**

```
POST /attachments/preprocess
        ↓
1. Receive file upload (multipart/form-data)
        ↓
2. Detect file type by extension + magic bytes
        ↓
3. Extract text based on format:
   ├─ PDF: Windows.Data.Pdf / CGPDFDocument
   ├─ DOCX: docx crate (XML parsing)
   ├─ XLSX: calamine crate
   ├─ PPTX: XML parsing
   ├─ Images (future): OCR via Windows.Media.Ocr / Vision framework
   └─ Plain text: Direct read
        ↓
4. Cache result in DashMap<String, PreExtracted>
   ├─ Key: UUID
   ├─ Value: extracted text + timestamp
   └─ TTL: 5 minutes
        ↓
5. Return { attachment_id: UUID, text_preview: String }
```

**Usage in Generation:**
```
User sends message with attachment
        ↓
Frontend includes attachment_id in /generate/stream request
        ↓
Backend retrieves pre-extracted text from DashMap
        ↓
Inject into system prompt:
"Use the following document content as context: {extracted_text}"
        ↓
Generate response with document-aware context
```

---

## 10. Metrics & Observability

### 10.1 Prometheus Metrics

**Exported on `GET /metrics` (Port 9000):**

```rust
// Counter metrics
processed_messages_total
inference_requests_total
cache_hits_total
cache_misses_total
errors_total

// Gauge metrics
active_sessions
queue_depth
cache_memory_usage_bytes
model_loaded (0/1)

// Histogram metrics
inference_duration_seconds
response_time_seconds
retrieval_latency_seconds

// Custom metrics
context_tokens_used
compression_ratio_achieved
gpu_memory_allocated_bytes
```

### 10.2 Structured Logging

**Tracing Subscriber Setup:**
```rust
tracing_subscriber::fmt()
    .with_env_filter(
        EnvFilter::from_default_env()
            .add_directive(Level::INFO.into())
            .add_directive("offline_intelligence=debug".parse().unwrap())
    )
    .with_timer(Uptime::new())  // Custom uptime formatter
    .init();
```

**Log Fields:**
- `session_id` - Trace conversation context
- `span` - Operation context (e.g., "generate", "retrieve")
- `duration_ms` - Operation timing
- `tokens` - Token counts

### 10.3 Error Handling Strategy

**API Error Types:**
```rust
pub struct ApiError {
    pub status: StatusCode,
    pub message: String,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(json!({
                "error": self.message,
                "code": self.status.as_u16(),
            })),
        ).into_response()
    }
}
```

**Error Codes:**
- `400` - Bad request (validation failed)
- `401` - Unauthorized (invalid JWT)
- `404` - Not found (conversation/model missing)
- `408` - Request timeout
- `409` - Conflict (duplicate resource)
- `422` - Unprocessable entity (model loading failed)
- `429` - Rate limited
- `500` - Internal server error
- `503` - Service unavailable (runtime not ready)

---

## 11. Security Considerations

### 11.1 Attack Surface Analysis

**Network Exposure:**
- All APIs bound to `127.0.0.1` only (not `0.0.0.0`)
- No external network access except:
  - HuggingFace API (model downloads)
  - OpenRouter API (online mode)
  - Google OAuth (authentication)

**CORS Configuration:**
```rust
CorsLayer::new()
    .allow_origin("tauri://localhost".parse::<Any>().unwrap())
    .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
    .allow_headers([CONTENT_TYPE, AUTHORIZATION])
```

### 11.2 Input Validation

**Session ID Sanitization:**
```rust
fn validate_session_id(session_id: &str) -> Result<(), ApiError> {
    if session_id.is_empty() {
        return Err(ApiError::bad_request("Session ID cannot be empty"));
    }
    if session_id.len() > 256 {
        return Err(ApiError::bad_request("Session ID too long"));
    }
    if !session_id.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
        return Err(ApiError::bad_request("Invalid session ID characters"));
    }
    Ok(())
}
```

**Rate Limiting:**
```rust
RateLimitLayer::new()
    .per_second(24)  // Configurable
    .burst(100)
```

### 11.3 Data Protection

**At Rest:**
- API keys: OS Keychain encryption
- Conversations: SQLite (unencrypted, local-only)
- JWT secret: Generated per-session, stored in memory

**In Transit:**
- Localhost HTTP (trusted boundary)
- External calls: HTTPS only (HuggingFace, OpenRouter)

---

## 12. Performance Optimization

### 12.1 Caching Strategies

**Multi-Level Cache:**
1. **L1**: In-memory Moka cache (hot KV entries)
2. **L2**: SQLite with WAL mode (warm summaries)
3. **L3**: Full DB with index optimization (cold history)

**Cache Scoring Algorithm:**
```rust
pub fn score_entry(entry: &KVEntry) -> f32 {
    let recency_score = (1.0 - entry.age_hours / 24.0).max(0.0);
    let length_score = (entry.token_count as f32 / 1000.0).min(1.0);
    let keyword_boost = if entry.contains_keywords(&["important", "remember"]) {
        0.3
    } else {
        0.0
    };
    
    recency_score * 0.5 + length_score * 0.3 + keyword_boost * 0.2
}
```

### 12.2 Batch Processing

**Embedding Generation:**
```rust
// Batch multiple texts into single GPU call
pub async fn generate_embeddings_batch(
    &self,
    texts: Vec<String>,
) -> Result<Vec<Vec<f32>>> {
    // Process in batches of 32 (configurable)
    let batch_size = 32;
    let mut all_embeddings = Vec::new();
    
    for chunk in texts.chunks(batch_size) {
        let batch_result = self.runtime.generate_embeddings(chunk).await?;
        all_embeddings.extend(batch_result);
    }
    
    Ok(all_embeddings)
}
```

### 12.3 Memory-Efficient Streaming

**SSE Stream Processing:**
```rust
let byte_stream = response.bytes_stream();
let mut buffer = String::new();

for await chunk in byte_stream {
    buffer.push_str(&chunk?);
    
    // Process complete SSE messages immediately
    while let Some(newline_pos) = buffer.find('\n') {
        let line = buffer[..newline_pos].trim();
        buffer.drain(..=newline_pos);
        
        if line.starts_with("data: ") {
            yield format!("data: {}\n\n", &line[6..]);
        }
    }
}
```

---

## 13. Deployment Architecture

### 13.1 Tauri Bundle Structure

```
Aud.io.app/
├── Contents/
│   ├── MacOS/
│   │   └── offline-intelligence-desktop  # Main binary
│   ├── Resources/
│   │   ├── bin/
│   │   │   ├── MacOS/
│   │   │   │   └── llama-server  # Bundled binary
│   │   ├── models/
│   │   │   └── default.gguf  # Optional embedded model
│   │   ├── public/
│   │   │   └── index.html  # React app
│   │   └── .env  # Default config
│   └── Info.plist
```

### 13.2 User Data Directory

**Platform-Specific Paths:**

| OS | Base Path | Example |
|----|-----------|---------|
| **Windows** | `%APPDATA%\Aud.io` | `C:\Users\Alice\AppData\Roaming\Aud.io` |
| **macOS** | `~/Library/Application Support/Aud.io` | `/Users/Alice/Library/Application Support/Aud.io` |
| **Linux** | `~/.config/aud.io` | `/home/alice/.config/aud.io` |

**Subdirectory Structure:**
```
Aud.io/
├── data/
│   ├── conversations.db      # SQLite DB
│   ├── conversations.db-wal  # WAL file
│   └── feedback.db           # Feedback DB
├── models/
│   ├── llama-3.2-3b.Q4_K_M.gguf
│   └── mistral-7b.Q5_K_M.gguf
├── registry/
│   └── models.json           # Installed models metadata
├── downloads/
│   └── tmp_*                 # Temporary download cache
├── logs/
│   ├── startup.log           # Crash diagnostics
│   └── app.log               # Runtime logs
└── app.lock                  # Single-instance lock
```

### 13.3 Single-Instance Lock

**Implementation (`main.rs`):**
```rust
let lock_file = base_dir.join("app.lock");

if lock_file.exists() {
    if let Ok(pid_str) = std::fs::read_to_string(&lock_file) {
        if let Ok(existing_pid) = pid_str.trim().parse::<u32>() {
            // Check if process is actually running
            #[cfg(target_os = "windows")]
            {
                let output = Command::new("tasklist")
                    .args(&["/FI", &format!("PID eq {}", existing_pid), "/NH"])
                    .output();
                
                if output_str.contains(&existing_pid.to_string()) {
                    fatal_error("Another instance is already running");
                } else {
                    // Stale lock - remove it
                    let _ = std::fs::remove_file(&lock_file);
                }
            }
        }
    }
}

// Create new lock
std::fs::write(&lock_file, format!("{}", std::process::id()))?;
```

---

## 14. Testing Strategy

### 14.1 Test Categories

**Unit Tests:**
- Configuration parsing (`config.rs` tests)
- Cache scoring algorithms
- Format detection logic
- Database CRUD operations

**Integration Tests:**
- End-to-end inference pipeline
- Cache manager workflows
- Model download/install
- Authentication flows

**Property-Based Tests:**
```rust
proptest! {
    #[test]
    fn test_ctx_size_adjustment(ctx in 1024u32..65536) {
        let adjusted = Config::adjust_ctx_size_for_system(ctx);
        prop_assert!(adjusted <= ctx);
        prop_assert!(adjusted >= 2048);
    }
}
```

### 14.2 Test Coverage Targets

| Module | Target | Actual |
|--------|--------|--------|
| `config.rs` | 90% | 95% (57 tests) |
| `cache_management/` | 85% | TBD |
| `context_engine/` | 80% | TBD |
| `api/` | 75% | TBD |
| **Overall** | **80%** | **TBD** |

---

## 15. Known Limitations & Future Work

### 15.1 Current Limitations

1. **No Distributed Inference**: Single-device only, no multi-GPU spanning
2. **Limited OCR**: Image text extraction not yet implemented
3. **No Real-Time Collaboration**: Single-user per instance
4. **SQLite Scalability**: Tested up to ~1M messages, untested beyond
5. **No Model Training**: Inference-only, no fine-tuning support

### 15.2 Roadmap Items

**Phase 2 (Q3-Q4 2026):**
- Mobile apps (iOS/Android) via React Native
- Real-time collaboration (WebSocket sync)
- Advanced OCR (multi-language support)
- Voice input/output (Whisper integration)

**Phase 3 (2027):**
- Multi-GPU distributed inference
- Federated learning (privacy-preserving model updates)
- Enterprise SSO (SAML, OIDC)
- Audit logging (SOC2 compliance)

**Phase 4 (2028+):**
- Edge device support (Raspberry Pi, Jetson)
- Custom model training UI
- Marketplace for community models

---

## 16. Conclusion

Aud.io ChatInterface represents a **production-ready, privacy-first AI runtime** with sophisticated memory management, multi-format model support, and seamless hybrid local/cloud operation. The architecture prioritizes:

1. **Performance**: Sub-millisecond hot memory access, efficient batching
2. **Privacy**: Zero-knowledge local inference, encrypted key storage
3. **Flexibility**: 6 model formats, online fallback, extensible plugin system
4. **Reliability**: Graceful degradation, comprehensive error handling, single-instance safety

The system successfully balances cutting-edge AI capabilities with enterprise-grade security and compliance requirements, positioning it uniquely in the market as both a consumer tool and enterprise solution.

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| **KV Cache** | Key-Value cache storing attention states for fast context recall |
| **GGUF** | GGML Universal Format (llama.cpp model format) |
| **SSE** | Server-Sent Events (streaming protocol) |
| **WAL** | Write-Ahead Logging (SQLite durability mode) |
| **PKCE** | Proof Key for Code Exchange (OAuth 2.0 extension) |
| **Quantization** | Model compression technique (e.g., Q4_K_M = 4-bit quantized) |

## Appendix B: Configuration Reference

**.env Variables:**

```bash
# Model Configuration
MODEL_PATH=/path/to/model.gguf
LLAMA_BIN=/path/to/llama-server

# Resource Allocation
THREADS=auto          # Auto-detect or manual
GPU_LAYERS=auto       # Auto-detect or manual
CTX_SIZE=auto         # Auto-detect from model
BATCH_SIZE=auto       # Auto-calculate

# Network
API_HOST=127.0.0.1
API_PORT=9999
LLAMA_HOST=127.0.0.1
LLAMA_PORT=8081

# Limits
MAX_CONCURRENT_STREAMS=4
REQUESTS_PER_SECOND=24
GENERATE_TIMEOUT_SECONDS=300

# Features
OPENROUTER_API_KEY=sk-or-...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

---

**Document End**

*This report was generated through comprehensive codebase analysis. For questions or clarifications, refer to the source code in the respective module files.*
