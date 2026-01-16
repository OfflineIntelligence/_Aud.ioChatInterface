// Server/src/proxy.rs

use axum::{
    body::Body,
    extract::State,
    http::{StatusCode, HeaderValue},
    response::{IntoResponse, Response},
    Json,
};
use serde_json::{json, Value};
use std::time::Duration;
use futures::{StreamExt, Stream};
use tracing::{debug, error, info, warn};
use std::sync::Arc;
use tokio::sync::RwLock;
use bytes::Bytes;
use std::pin::Pin;
use std::task::{Context, Poll};

// Import Message from memory module
use crate::memory::Message;

#[derive(Clone)]
pub struct AppState {
    pub client: reqwest::Client,
    pub cfg: crate::config::Config,
    pub context_orchestrator: Arc<RwLock<Option<crate::context_engine::ContextOrchestrator>>>,
}

/// Helper to optimize conversation history using the Context Engine
async fn optimize_context(
    state: &AppState,
    messages: Vec<Message>,
    session_id: &str,
    user_query: Option<&str>,
) -> Vec<Message> {
    let orchestrator_guard = state.context_orchestrator.read().await;
    
    // Let context orchestrator process the conversation
    if let Some(orchestrator) = &*orchestrator_guard {
        match orchestrator.process_conversation(session_id, &messages, user_query).await {
            Ok(optimized) => {
                debug!("Context optimized: {} -> {} messages", messages.len(), optimized.len());
                optimized
            }
            Err(e) => {
                warn!("Context optimization failed: {}, using original", e);
                messages
            }
        }
    } else {
        warn!("Context orchestrator not available, using original messages");
        messages
    }
}

/// A wrapper stream that captures the assistant's response as it flows through
struct ConversationCapturer<S> {
    inner: S,
    state: AppState,
    session_id: String,
    original_context: Vec<Message>,
    accumulated_response: String,
}

impl<S> Stream for ConversationCapturer<S>
where
    S: Stream<Item = Result<Bytes, std::io::Error>> + Unpin,
{
    type Item = Result<Bytes, std::io::Error>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        match Pin::new(&mut self.inner).poll_next(cx) {
            Poll::Ready(Some(Ok(bytes))) => {
                // Try to parse the chunk to extract content for our DB save
                // OpenAI SSE format usually looks like: data: {"choices":[{"delta":{"content":"..."}}]}
                let chunk_str = String::from_utf8_lossy(&bytes);
                for line in chunk_str.lines() {
                    if line.starts_with("data: ") && !line.contains("[DONE]") {
                        if let Ok(val) = serde_json::from_str::<Value>(&line[6..]) {
                            if let Some(content) = val["choices"][0]["delta"]["content"].as_str() {
                                self.accumulated_response.push_str(content);
                            }
                        }
                    }
                }
                Poll::Ready(Some(Ok(bytes)))
            }
            Poll::Ready(None) => {
                // Stream finished - Save assistant response to DB
                let state = self.state.clone();
                let session_id = self.session_id.clone();
                let assistant_content = self.accumulated_response.clone();

                // Spawn a background task so we don't block the stream closing
                tokio::spawn(async move {
                    if !assistant_content.is_empty() {
                        let orchestrator_guard = state.context_orchestrator.read().await;
                        if let Some(orchestrator) = &*orchestrator_guard {
                            // Save ONLY the assistant response (not the entire conversation)
                            if let Err(e) = orchestrator.save_assistant_response(&session_id, &assistant_content).await {
                                warn!("Failed to save assistant response to database: {}", e);
                            } else {
                                info!("✅ Assistant response saved to database for session: {}", session_id);
                            }
                        } else {
                            warn!("Context orchestrator not available, skipping assistant response save");
                        }
                    }
                });

                Poll::Ready(None)
            }
            other => other,
        }
    }
}

pub async fn generate_stream_endpoint(
    State(state): State<AppState>,
    Json(payload): Json<Value>,
) -> Result<Response, (StatusCode, String)> {
    info!("📥 Received generate_stream request");
    
    // Chat persistence: Enforce session_id requirement - no fallback to prevent orphaned data
    let session_id = payload.get("session_id")
        .and_then(Value::as_str)
        .map(|s| s.to_string())
        .ok_or_else(|| {
            (StatusCode::BAD_REQUEST, "Missing required field: session_id".to_string())
        })?;

    // Chat persistence: Create session BEFORE processing to prevent race with title updates
    // Title generation happens async in frontend while streaming, needs session to exist first
    {
        let orchestrator_guard = state.context_orchestrator.read().await;
        if let Some(orchestrator) = &*orchestrator_guard {
            let tier_manager = orchestrator.tier_manager().read().await;
            if let Err(e) = tier_manager.ensure_session_exists(&session_id, None).await {
                warn!("Failed to create session {}: {}", session_id, e);
            } else {
                info!("✅ Ensured session {} exists in database", session_id);
            }
        }
    }

    let raw_messages = payload.get("messages")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let messages: Vec<Message> = match serde_json::from_value::<Vec<Message>>(Value::Array(raw_messages)) {
        Ok(msgs) => {
            if msgs.len() > 1000 {
                return Err((StatusCode::BAD_REQUEST, "Too many messages (max 1000)".into()));
            }
            msgs
        }
        Err(e) => {
            warn!("❌ Invalid messages format: {}", e);
            return Err((StatusCode::BAD_REQUEST, format!("Invalid messages format: {}", e)));
        }
    };

    let user_query = messages.last().map(|m| m.content.as_str());

    // 2. OPTIMIZE CONTEXT
    info!("🔧 Starting context optimization...");
    let optimized_messages = optimize_context(&state, messages.clone(), &session_id, user_query).await;
    
    // 3. Prepare payload for Backend
    let mut openai_payload = payload.clone();
    if let Ok(optimized_val) = serde_json::to_value(optimized_messages) {
        openai_payload["messages"] = optimized_val;
    }

    let target = format!("{}/v1/chat/completions", state.cfg.backend_url);
    info!("🚀 Forwarding to backend: {}", target);

    let response = match state.client.post(&target)
        .timeout(Duration::from_secs(state.cfg.generate_timeout_seconds))
        .header("content-type", "application/json")
        .json(&openai_payload)
        .send()
        .await
    {
        Ok(resp) => resp,
        Err(e) => {
            let status = if e.is_timeout() { StatusCode::GATEWAY_TIMEOUT } else { StatusCode::BAD_GATEWAY };
            error!("❌ Backend request failed: {}", e);
            return Err((status, format!("Backend request failed: {}", e)));
        }
    };

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err((StatusCode::BAD_GATEWAY, format!("backend status {}: {}", status, body)));
    }

    // 5. Wrap stream to capture response and save to DB
    let inner_stream = response
        .bytes_stream()
        .map(|result| result.map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e)));

    let captured_stream = ConversationCapturer {
        inner: inner_stream,
        state: state.clone(),
        session_id,
        original_context: messages, // We save the original context + the new assistant reply
        accumulated_response: String::new(),
    };

    crate::metrics::inc_request("generate_stream", "ok");

    let response_builder = Response::builder()
        .status(StatusCode::OK)
        .header("content-type", "text/event-stream")
        .header("cache-control", "no-cache")
        .header("x-accel-buffering", "no")
        .header("access-control-allow-origin", "*")
        .header("access-control-allow-methods", "POST, OPTIONS")
        .header("access-control-allow-headers", "content-type");

    let body = Body::from_stream(captured_stream);
    
    match response_builder.body(body) {
        Ok(response) => Ok(response),
        Err(e) => {
            error!("❌ Failed to build streaming response: {}", e);
            Err((StatusCode::INTERNAL_SERVER_ERROR, "Failed to create stream".into()))
        }
    }
}

// --- Helper Functions ---

pub fn extract_openai_content(openai_response: &Value) -> String {
    openai_response["choices"][0]["message"]["content"]
        .as_str()
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            openai_response["choices"][0]["text"]
                .as_str()
                .map(|s| s.to_string())
                .unwrap_or_else(|| "No response content found".to_string())
        })
}

pub fn extract_thinking(openai_response: &Value) -> Option<String> {
    let content = extract_openai_content(openai_response);
    if content.contains("<thoughts>") && content.contains("</thoughts>") {
        if let Some(start) = content.find("<thoughts>") {
            if let Some(end) = content.find("</thoughts>") {
                let thinking = content[start + 10..end].trim().to_string();
                if !thinking.is_empty() { return Some(thinking); }
            }
        }
    }
    None
}