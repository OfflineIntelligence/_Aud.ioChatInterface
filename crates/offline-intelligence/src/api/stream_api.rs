//! Streaming chat endpoint — the core 1-hop architecture handler.
//!
//! Flow: Client POST → SharedState (session + cache lookup) → LLM Worker (HTTP to llama-server) → SSE stream back
//! All state access is in-process via Arc/shared memory. The only network hop is to localhost llama-server.

use axum::{
    extract::State,
    response::{
        sse::{Event, Sse},
        IntoResponse, Response,
    },
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use std::convert::Infallible;
use tracing::{info, error, debug, warn};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use serde_json::Value;
use reqwest;
use std::sync::Arc;

use crate::memory::Message;
use crate::memory_db::schema::Embedding;
use crate::shared_state::UnifiedAppState;
use crate::utils::extract_content_from_bytes;
use regex::Regex;

/// Inline file attachment sent with the request (temporary, in-memory only)
#[derive(Debug, Clone, Deserialize)]
pub struct ChatAttachment {
    pub name: String,
    #[serde(default)]
    pub content_base64: Option<String>,
    #[serde(default)]
    pub content_text: Option<String>,
    #[serde(default)]
    pub mime_type: Option<String>,
}

/// Request body matching what the frontend sends
#[derive(Debug, Deserialize)]
pub struct StreamChatRequest {
    pub model: Option<String>,
    pub model_source: Option<String>, // "local" or "openrouter"
    pub messages: Vec<Message>,
    pub session_id: String,
    #[serde(default = "default_max_tokens")]
    pub max_tokens: u32,
    #[serde(default = "default_temperature")]
    pub temperature: f32,
    #[serde(default = "default_stream")]
    pub stream: bool,
    /// Inline file attachments (temporary, session-scoped)
    #[serde(default)]
    pub attachments: Option<Vec<ChatAttachment>>,
    /// API key for OpenRouter (passed from frontend)
    #[serde(default)]
    pub api_key: Option<String>,
}

fn default_max_tokens() -> u32 { 2000 }
fn default_temperature() -> f32 { 0.7 }
fn default_stream() -> bool { true }

/// Process inline attachments and inject their content into the message
async fn process_inline_attachments(messages: &mut Vec<Message>, attachments: &[ChatAttachment]) {
    if attachments.is_empty() {
        debug!("No attachments to process");
        return;
    }
    
    info!("Processing {} inline attachments", attachments.len());
    
    // Build attachment content block
    let mut attachment_content = String::new();
    for attach in attachments {
        info!("Processing attachment: {} (has_text: {}, has_base64: {})", 
            attach.name, 
            attach.content_text.is_some(), 
            attach.content_base64.is_some());
        
        let content = if let Some(ref text) = attach.content_text {
            // Plain text content
            info!("Using text content for {}, length: {}", attach.name, text.len());
            text.clone()
        } else if let Some(ref b64) = attach.content_base64 {
            // Base64 encoded content - decode and extract based on file type
            info!("Decoding base64 for {}, length: {}", attach.name, b64.len());
            match BASE64.decode(b64) {
                Ok(bytes) => {
                    info!("Decoded {} bytes for {}", bytes.len(), attach.name);
                    // Use the content extractor for proper file type handling
                    match extract_content_from_bytes(&bytes, &attach.name).await {
                        Ok(extracted) => {
                            info!("Extracted {} chars from {}", extracted.len(), attach.name);
                            // Check if the extracted content indicates an error
                            if extracted.starts_with("[Could not extract") || extracted.starts_with("[PDF file appears to be empty") {
                                warn!("File extraction warning for {}: {}", attach.name, extracted);
                                // For PDF files that couldn't be processed, provide more helpful message
                                if attach.name.to_lowercase().ends_with(".pdf") {
                                    format!("[PDF file attached: {} - Content could not be extracted. The PDF may be password-protected, scanned images only, or corrupted.]", attach.name)
                                } else {
                                    extracted
                                }
                            } else {
                                extracted
                            }
                        }
                        Err(e) => {
                            debug!("Failed to extract content from {}: {}", attach.name, e);
                            // For PDF files that failed to process, provide more specific error message
                            if attach.name.to_lowercase().ends_with(".pdf") {
                                format!("[PDF file attached: {} - Could not extract text content: {}]", attach.name, e)
                            } else {
                                // Fallback to UTF-8 lossy for unknown formats
                                String::from_utf8_lossy(&bytes).to_string()
                            }
                        }
                    }
                }
                Err(e) => {
                    debug!("Base64 decode failed for {}: {}", attach.name, e);
                    format!("[Could not decode file: {}]", attach.name)
                }
            }
        } else {
            info!("Attachment {} has no content", attach.name);
            continue;
        };
        
        attachment_content.push_str(&format!(
            "\n--- Content of attached file: {} ---\n{}\n--- End of file ---\n",
            attach.name, content
        ));
    }
    
    // Append to last user message
    if let Some(last_user) = messages.iter_mut().rev().find(|m| m.role == "user") {
        info!("Appending {} chars of attachment content to user message", attachment_content.len());
        last_user.content = format!("{}\n{}", last_user.content, attachment_content);
    } else {
        error!("No user message found to append attachments!");
    }
}

/// Process file attachments in messages by replacing [Attached: filename] or [@filename] markers with actual file content
/// This handles references to persistent local files stored in the database
async fn process_file_attachments(
    messages: &mut Vec<Message>,
    state: &UnifiedAppState,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Match both [Attached: filename] and @filename patterns
    let attached_re = Regex::new(r"\[Attached: ([^\]]+)\]").unwrap();
    let at_re = Regex::new(r"@(\S+\.\w+)").unwrap();

    let local_files = &state.shared_state.database_pool.local_files;
    let all_files = &state.shared_state.database_pool.all_files;

    for msg in messages.iter_mut() {
        if msg.role == "user" {
            let mut updated_content = msg.content.clone();

            // Process [Attached: filename] patterns
            for cap in attached_re.captures_iter(&msg.content) {
                if let Some(filename_match) = cap.get(1) {
                    let filename = filename_match.as_str();
                    updated_content = replace_file_reference(
                        &updated_content,
                        &format!("[Attached: {}]", filename),
                        filename,
                        local_files,
                        all_files,
                    ).await;
                }
            }

            // Process @filename patterns (reference to local files)
            for cap in at_re.captures_iter(&msg.content) {
                if let Some(filename_match) = cap.get(1) {
                    let filename = filename_match.as_str();
                    updated_content = replace_file_reference(
                        &updated_content,
                        &format!("@{}", filename),
                        filename,
                        local_files,
                        all_files,
                    ).await;
                }
            }

            msg.content = updated_content;
        }
    }

    Ok(())
}

/// Helper to replace a file reference with actual content.
/// Tries all_files first (user local storage), then local_files, then filesystem fallback.
async fn replace_file_reference(
    content: &str,
    marker: &str,
    filename: &str,
    local_files: &crate::memory_db::LocalFilesStore,
    all_files: &crate::memory_db::AllFilesStore,
) -> String {
    // 1. Try all_files store first (primary user local storage)
    if let Ok(file) = all_files.get_file_by_name(filename) {
        match all_files.get_file_content_string(file.id) {
            Ok(file_content) => {
                let _ = all_files.record_access(file.id);
                let attachment_text = format!(
                    "\n--- Content of file: {} ---\n{}\n--- End of file ---\n",
                    filename, file_content
                );
                return content.replace(marker, &attachment_text);
            }
            Err(_) => {}
        }
    }

    // 2. Try local_files store (legacy small-files store)
    if let Ok(file) = local_files.get_file_by_name(filename) {
        match local_files.get_file_content_string(file.id) {
            Ok(file_content) => {
                let attachment_text = format!(
                    "\n--- Content of file: {} ---\n{}\n--- End of file ---\n",
                    filename, file_content
                );
                return content.replace(marker, &attachment_text);
            }
            Err(_) => {}
        }
    }

    // 3. Filesystem fallback for backward compatibility
    let app_data_dir = dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("Aud.io");
    let file_path = app_data_dir.join(filename);

    match crate::utils::extract_file_content(&file_path).await {
        Ok(file_content) => {
            let attachment_text = format!(
                "\n--- Content of file: {} ---\n{}\n--- End of file ---\n",
                filename, file_content
            );
            content.replace(marker, &attachment_text)
        }
        Err(_) => {
            let error_text = format!("\n[Note: File '{}' not found. Upload it to Local Storage first.]", filename);
            content.replace(marker, &error_text)
        }
    }
}

/// POST /generate/stream — Main streaming chat endpoint
///
/// 1. Validates request and gets/creates session in shared memory
/// 2. Persists user message to database
/// 3. Streams LLM response back via SSE
/// 4. Persists assistant response to database after completion
pub async fn generate_stream(
    State(state): State<UnifiedAppState>,
    Json(req): Json<StreamChatRequest>,
) -> Response {
    let request_num = state.shared_state.counters.inc_total_requests();
    info!("Stream request #{} for session: {}", request_num, req.session_id);
    
    // Debug: Log attachment info
    if let Some(ref attachments) = req.attachments {
        info!("Request has {} attachments", attachments.len());
        for (i, att) in attachments.iter().enumerate() {
            info!("  Attachment {}: name={}, has_text={}, has_base64={}", 
                i, att.name, att.content_text.is_some(), att.content_base64.is_some());
        }
    } else {
        info!("Request has NO attachments (None)");
    }

    if req.messages.is_empty() {
        return (StatusCode::BAD_REQUEST, "Messages array cannot be empty").into_response();
    }

    let session_id = req.session_id.clone();

    // 1. Process file attachments in the messages
    let mut processed_messages = req.messages.clone();
    
    // 1a. Process inline attachments (temporary, in-memory)
    if let Some(ref attachments) = req.attachments {
        process_inline_attachments(&mut processed_messages, attachments).await;
    }
    
    // 1b. Process file references (@filename, [Attached: filename]) from local files
    if let Err(e) = process_file_attachments(&mut processed_messages, &state).await {
        error!("Error processing file attachments: {}", e);
        // Continue with current messages if file processing fails
    }

    // 2. Get or create session in shared memory (zero-cost Arc lookup)
    let session = state.shared_state.get_or_create_session(&session_id).await;

    // 3. Update in-memory session with the processed messages
    {
        if let Ok(mut session_data) = session.write() {
            session_data.last_accessed = std::time::Instant::now();
            session_data.messages = processed_messages.clone();
        }
    }

    // 4. Ensure session exists in database and persist user message
    //    CRITICAL: This must complete BEFORE title updates can happen, so we do it synchronously
    //    to avoid race conditions where title update happens before session creation completes
    let user_msg_content = processed_messages.iter().rev().find(|m| m.role == "user").map(|m| m.content.clone());
    if let Some(ref content) = user_msg_content {
        let db = state.shared_state.database_pool.clone();
        let sid = session_id.clone();
        let content = content.clone();
        let msg_count = processed_messages.len() as i32;
        
        // Create session synchronously to ensure it exists before streaming starts
        // This prevents race condition with title updates
        if let Err(e) = db.conversations.create_session_with_id(&sid, None) {
            // Ignore "already exists" errors - session may have been created by a previous request
            debug!("Session creation result (may already exist): {}", e);
        }
        
        // Persist user message in background (this can be async)
        tokio::spawn(async move {
            if let Err(e) = db.conversations.store_messages_batch(
                &sid,
                &[("user".to_string(), content, msg_count - 1, 0, 0.5)],
            ) {
                error!("Failed to persist user message: {}", e);
            }
        });
    }

    // 4. Context Engine: Retrieve past context via semantic search when KV cache misses.
    //    Always let the retrieval planner decide — even a brand-new session can trigger
    //    cross-session search if the user asks "what did we discuss yesterday?".
    //    The planner + orchestrator handle the "nothing to search" case internally
    //    (checks has_embeddings > 0 before hitting llama-server, returns early if no past refs).
    let context_messages = {
        let orchestrator_guard = state.context_orchestrator.read().await;
        if let Some(ref orchestrator) = *orchestrator_guard {
            let user_query = user_msg_content.as_deref();
            match orchestrator.process_conversation(&session_id, &processed_messages, user_query).await {
                Ok(optimized) => {
                    if optimized.len() != processed_messages.len() {
                        info!("Context engine optimized: {} → {} messages (retrieved past context)",
                            processed_messages.len(), optimized.len());
                    }
                    optimized
                }
                Err(e) => {
                    error!("Context engine error (falling back to raw messages): {}", e);
                    processed_messages.clone()
                }
            }
        } else {
            debug!("Context orchestrator not initialized, using raw messages");
            processed_messages.clone()
        }
    };

    // 5. Determine routing based on model source
    let max_tokens = req.max_tokens;
    let temperature = req.temperature;
    let db_for_persist = state.shared_state.database_pool.clone();
    let session_id_for_persist = session_id.clone();
    let msg_index = req.messages.len() as i32;

    // Clones for background embedding generation after stream completes
    let db_for_embed_persist = state.shared_state.database_pool.clone();
    let session_id_for_embed = session_id.clone();
    let user_msg_for_embed = user_msg_content.clone();

    // Check if this is an online model (OpenRouter)
    let is_online_model = req.model_source.as_deref() == Some("openrouter");
    
    if is_online_model {
        // Handle OpenRouter API call directly
        // First check if API key was passed in the request (from frontend)
        let api_key = req.api_key.clone().unwrap_or_else(|| {
            std::env::var("OPENROUTER_API_KEY").unwrap_or_else(|_| {
                // Try to get from state or config
                state.shared_state.config.openrouter_api_key.clone()
            })
        });
        
        if api_key.is_empty() {
            return (StatusCode::UNAUTHORIZED, "OpenRouter API key not configured").into_response();
        }
        
        let model_id = req.model.unwrap_or_else(|| "openrouter/auto".to_string());
        let openrouter_messages = context_messages.iter().map(|m| {
            serde_json::json!({
                "role": m.role,
                "content": m.content
            })
        }).collect::<Vec<_>>();
        
        let openrouter_request = serde_json::json!({
            "model": model_id,
            "messages": openrouter_messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": true,
        });
        
        match stream_openrouter_response(api_key, openrouter_request, session_id_for_persist.clone(), db_for_persist.clone(), context_messages.clone(), user_msg_for_embed.clone(), db_for_embed_persist.clone(), session_id_for_embed.clone()).await {
            Ok(openrouter_stream) => {
                // Wrap the OpenRouter stream to collect the full response for DB persistence
                let output_stream = async_stream::stream! {
                    let mut full_response = String::new();
                    
                    futures_util::pin_mut!(openrouter_stream);
                    
                    while let Some(item) = tokio_stream::StreamExt::next(&mut openrouter_stream).await {
                        match item {
                            Ok(sse_line) => {
                                // Extract content from SSE data for persistence
                                if sse_line.starts_with("data: ") && !sse_line.contains("[DONE]") {
                                    if let Ok(chunk) = serde_json::from_str::<serde_json::Value>(&sse_line[6..].trim()) {
                                        if let Some(content) = chunk
                                            .get("choices")
                                            .and_then(|c| c.get(0))
                                            .and_then(|c| c.get("delta"))
                                            .and_then(|d| d.get("content"))
                                            .and_then(|c| c.as_str())
                                        {
                                            full_response.push_str(content);
                                        }
                                    }
                                }
                                
                                // Yield SSE event to client
                                let data = sse_line.trim_start_matches("data: ").trim_end().to_string();
                                yield Ok::<_, Infallible>(Event::default().data(data));
                            }
                            Err(e) => {
                                error!("OpenRouter stream error: {}", e);
                                yield Ok(Event::default().data(
                                    format!("{{\"error\": \"{}\"}}", e)
                                ));
                                break;
                            }
                        }
                    }
                    
                    // Persist assistant response to database after stream completes
                    if !full_response.is_empty() {
                        match db_for_persist.conversations.store_messages_batch(
                            &session_id_for_persist,
                            &[("assistant".to_string(), full_response.clone(), msg_index, 0, 0.5)],
                        ) {
                            Ok(stored_msgs) => {
                                debug!("Persisted assistant response ({} chars) for session {}",
                                    full_response.len(), session_id_for_persist);
                            }
                            Err(e) => {
                                error!("Failed to persist assistant message: {}", e);
                            }
                        }
                    }
                };
                
                Sse::new(output_stream)
                    .keep_alive(
                        axum::response::sse::KeepAlive::new()
                            .interval(std::time::Duration::from_secs(15))
                    )
                    .into_response()
            }
            Err(e) => {
                error!("Failed to start OpenRouter stream: {}", e);
                (StatusCode::BAD_GATEWAY, format!("OpenRouter API error: {}", e)).into_response()
            }
        }
    } else {
        // Handle local model (existing logic)
        // First check if the runtime is ready before attempting to stream
        if !state.llm_worker.is_runtime_ready().await {
            return (StatusCode::SERVICE_UNAVAILABLE, 
                "Model Not Ready: No local model is currently loaded. Please go to the Models page and activate a model by clicking \"Active Model\".").into_response();
        }
        
        let llm_worker = state.llm_worker.clone();
        let llm_worker_for_embed = state.llm_worker.clone();
        
        match llm_worker.stream_response(context_messages, max_tokens, temperature).await {
            Ok(llm_stream) => {
                // Wrap the LLM stream to collect the full response for DB persistence
                let output_stream = async_stream::stream! {
                    let mut full_response = String::new();

                    futures_util::pin_mut!(llm_stream);

                    while let Some(item) = tokio_stream::StreamExt::next(&mut llm_stream).await {
                        match item {
                            Ok(sse_line) => {
                                // Extract content from SSE data for persistence
                                if sse_line.starts_with("data: ") && !sse_line.contains("[DONE]") {
                                    if let Ok(chunk) = serde_json::from_str::<serde_json::Value>(&sse_line[6..].trim()) {
                                        if let Some(content) = chunk
                                            .get("choices")
                                            .and_then(|c| c.get(0))
                                            .and_then(|c| c.get("delta"))
                                            .and_then(|d| d.get("content"))
                                            .and_then(|c| c.as_str())
                                        {
                                            full_response.push_str(content);
                                        }
                                    }
                                }

                                // Yield SSE event to client
                                let data = sse_line.trim_start_matches("data: ").trim_end().to_string();
                                yield Ok::<_, Infallible>(Event::default().data(data));
                            }
                            Err(e) => {
                                error!("Stream error: {}", e);
                                yield Ok(Event::default().data(
                                    format!("{{\"error\": \"{}\"}}", e)
                                ));
                                break;
                            }
                        }
                    }

                    // Persist assistant response to database after stream completes
                    if !full_response.is_empty() {
                        match db_for_persist.conversations.store_messages_batch(
                            &session_id_for_persist,
                            &[("assistant".to_string(), full_response.clone(), msg_index, 0, 0.5)],
                        ) {
                            Ok(_stored_msgs) => {
                                debug!("Persisted assistant response ({} chars) for session {}",
                                    full_response.len(), session_id_for_persist);

                                // Background: Generate and store embeddings for the new messages
                                // This captures the vectors llama.cpp computes via /v1/embeddings
                                // enabling semantic search for future KV cache misses.
                                let llm_for_embed = llm_worker_for_embed.clone();
                                let db_for_embed = db_for_embed_persist.clone();
                                let assistant_content = full_response.clone();
                                let user_content_for_embed = user_msg_for_embed.clone();
                                let stored = _stored_msgs;

                                tokio::spawn(async move {
                                    // Collect texts + their message IDs for embedding
                                    let mut texts = Vec::new();
                                    let mut message_ids = Vec::new();

                                    // User message embedding (get ID from DB)
                                    if let Some(ref user_text) = user_content_for_embed {
                                        // The user message was stored one index before the assistant
                                        // We need its DB ID — query by session + content
                                        if let Ok(msgs) = db_for_embed.search_messages_by_keywords(
                                            &session_id_for_embed,
                                            &[user_text.clone()],
                                            1,
                                        ).await {
                                            if let Some(user_stored) = msgs.first() {
                                                texts.push(user_text.clone());
                                                message_ids.push(user_stored.id);
                                            }
                                        }
                                    }

                                    // Assistant message embedding
                                    if let Some(assistant_stored) = stored.first() {
                                        texts.push(assistant_content);
                                        message_ids.push(assistant_stored.id);
                                    }

                                    if texts.is_empty() {
                                        return;
                                    }

                                    // Call llama-server /v1/embeddings
                                    match llm_for_embed.generate_embeddings(texts).await {
                                        Ok(embeddings) => {
                                            let now = chrono::Utc::now();
                                            for (embedding_vec, msg_id) in embeddings.into_iter().zip(message_ids.iter()) {
                                                let emb = Embedding {
                                                    id: 0, // auto-assigned by DB
                                                    message_id: *msg_id,
                                                    embedding: embedding_vec,
                                                    embedding_model: "llama-server".to_string(),
                                                    generated_at: now,
                                                };
                                                if let Err(e) = db_for_embed.embeddings.store_embedding(&emb) {
                                                    debug!("Failed to store embedding for msg {}: {}", msg_id, e);
                                                }
                                            }
                                            // Mark messages as having embeddings
                                            for msg_id in &message_ids {
                                                let _ = db_for_embed.conversations.mark_embedding_generated(*msg_id);
                                            }
                                            debug!("Stored {} embeddings for session {}", message_ids.len(), session_id_for_embed);
                                        }
                                        Err(e) => {
                                            debug!("Embedding generation skipped (llama-server may not support /v1/embeddings): {}", e);
                                        }
                                    }
                                });
                            }
                            Err(e) => {
                                error!("Failed to persist assistant message: {}", e);
                            }
                        }
                    }
                };

                return Sse::new(output_stream)
                    .keep_alive(
                        axum::response::sse::KeepAlive::new()
                            .interval(std::time::Duration::from_secs(15))
                    )
                    .into_response();
            }
            Err(e) => {
                let error_msg = format!("{}", e);
                error!("Failed to start LLM stream: {}", error_msg);
                
                // Provide clear, actionable error messages based on error type
                let (status_code, user_message) = if error_msg.contains("Cannot connect") || error_msg.contains("Connection refused") {
                    (
                        StatusCode::SERVICE_UNAVAILABLE,
                        "Local LLM server is not running. Please ensure:\\n\\n1. An engine is installed (Settings > Engines)\\n2. A model is downloaded and loaded (Settings > Models)\\n3. The engine has finished initializing".to_string()
                    )
                } else if error_msg.contains("not found") || error_msg.contains("No such file") {
                    (
                        StatusCode::NOT_FOUND,
                        "Model or engine binary not found. Please:\\n\\n1. Download an engine (Settings > Engines)\\n2. Download a model (Settings > Models)\\n3. Wait for initialization to complete".to_string()
                    )
                } else if error_msg.contains("timeout") || error_msg.contains("timed out") {
                    (
                        StatusCode::GATEWAY_TIMEOUT,
                        "LLM server connection timed out. The engine may be still initializing. Please wait a moment and try again.".to_string()
                    )
                } else {
                    (
                        StatusCode::BAD_GATEWAY,
                        format!("LLM backend error: {}\\n\\nPlease check that:\\n1. Engine is installed\\n2. Model is loaded\\n3. Engine is running", error_msg)
                    )
                };
                
                return (status_code, user_message).into_response();
            }
        }
    }
}

/// Helper function to stream OpenRouter responses
async fn stream_openrouter_response(
    api_key: String,
    request_body: Value,
    session_id: String,
    _db_for_persist: Arc<crate::memory_db::MemoryDatabase>,
    _context_messages: Vec<crate::memory::Message>,
    _user_msg_for_embed: Option<String>,
    _db_for_embed_persist: Arc<crate::memory_db::MemoryDatabase>,
    _session_id_for_embed: String,
) -> Result<
    std::pin::Pin<Box<dyn futures_util::Stream<Item = Result<String, anyhow::Error>> + Send>>, 
    anyhow::Error
> {
    let client = reqwest::Client::new();
    
    let response = client
        .post("https://openrouter.ai/api/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .header("HTTP-Referer", "https://aud.io")
        .header("X-Title", "Aud.io")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| anyhow::anyhow!("OpenRouter request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(anyhow::anyhow!("OpenRouter returned {}: {}", status, body));
    }

    let byte_stream = response.bytes_stream();

    let sse_stream = async_stream::try_stream! {
        let mut buffer = String::new();

        futures_util::pin_mut!(byte_stream);

        while let Some(chunk_result) = tokio_stream::StreamExt::next(&mut byte_stream).await {
            let chunk: bytes::Bytes = chunk_result
                .map_err(|e| anyhow::anyhow!("Stream read error: {}", e))?;

            buffer.push_str(&String::from_utf8_lossy(&chunk));

            while let Some(newline_pos) = buffer.find('\n') {
                let line = buffer[..newline_pos].trim().to_string();
                buffer = buffer[newline_pos + 1..].to_string();

                if line.is_empty() {
                    continue;
                }

                if line.starts_with("data: ") {
                    let data = &line[6..];

                    if data == "[DONE]" {
                        yield "data: [DONE]\n\n".to_string();
                        return;
                    }

                    match serde_json::from_str::<Value>(data) {
                        Ok(chunk) => {
                            let finished = chunk
                                .get("choices")
                                .and_then(|c| c.as_array())
                                .map(|arr| arr.iter().any(|choice| {
                                    choice.get("finish_reason")
                                        .and_then(|fr| fr.as_str())
                                        .map(|fr| fr != "stop" && fr != "length")
                                        .unwrap_or(false)
                                }))
                                .unwrap_or(false);

                            yield format!("data: {}\n\n", data);

                            if finished {
                                yield "data: [DONE]\n\n".to_string();
                                return;
                            }
                        }
                        Err(_) => {
                            yield format!("data: {}\n\n", data);
                        }
                    }
                }
            }
        }

        yield "data: [DONE]\n\n".to_string();
    };

    Ok(Box::pin(sse_stream))
}
