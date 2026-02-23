//! Online mode API endpoints
//!
//! Handles online mode requests that connect directly to external APIs like OpenRouter.

use axum::{
    extract::State,
    response::{
        sse::{Event, Sse},
        IntoResponse, Response,
    },
    http::StatusCode,
    Json,
};
use futures_util::StreamExt;
use serde::Deserialize;
use std::convert::Infallible;
use tracing::{info, error, debug};
use reqwest;
use serde_json::Value;

use crate::memory::Message;
use crate::shared_state::UnifiedAppState;

/// Request body for online mode streaming
#[derive(Debug, Deserialize)]
pub struct OnlineStreamRequest {
    pub model: String,
    pub messages: Vec<Message>,
    pub session_id: String,
    #[serde(default = "default_max_tokens")]
    pub max_tokens: u32,
    #[serde(default = "default_temperature")]
    pub temperature: f32,
    #[serde(default = "default_stream")]
    pub stream: bool,
    pub api_key: Option<String>, // API key passed from frontend
}

fn default_max_tokens() -> u32 { 2000 }
fn default_temperature() -> f32 { 0.7 }
fn default_stream() -> bool { true }

/// POST /online/stream — Online mode streaming endpoint
/// Connects directly to OpenRouter API and persists messages to SQLite.
pub async fn online_stream(
    State(state): State<UnifiedAppState>,
    Json(req): Json<OnlineStreamRequest>,
) -> Response {
    info!("Online stream request for session: {}", req.session_id);

    debug!("Request api_key present: {}, length: {}",
        req.api_key.is_some(),
        req.api_key.as_ref().map(|k| k.len()).unwrap_or(0)
    );

    // Get OpenRouter API key - prioritize the one passed in request
    let api_key = req.api_key.clone().unwrap_or_else(|| {
        std::env::var("OPENROUTER_API_KEY").unwrap_or_else(|_| {
            state.shared_state.config.openrouter_api_key.clone()
        })
    });

    debug!("Final API key length: {}", api_key.len());

    if api_key.is_empty() {
        error!("OpenRouter API key is empty - request had key: {}", req.api_key.is_some());
        return (StatusCode::UNAUTHORIZED, "OpenRouter API key not configured").into_response();
    }

    // -------------------------------------------------------------------------
    // Database persistence: ensure session exists and store the user message.
    // The assistant message is stored after streaming completes (inside the SSE
    // stream generator so it runs before the HTTP response body is closed).
    // -------------------------------------------------------------------------
    let db = state.shared_state.database_pool.clone();
    let session_id = req.session_id.clone();
    let msg_count = req.messages.len() as i32; // used to derive message indices

    // Create session if it doesn't already exist (INSERT OR IGNORE equivalent)
    if let Err(e) = db.conversations.create_session_with_id(&session_id, None) {
        debug!("Session creation (may already exist): {}", e);
    }

    // Store the user message (last message in the request) in a background task
    let user_msg_content = req.messages.iter().rev()
        .find(|m| m.role == "user")
        .map(|m| m.content.clone());
    if let Some(ref content) = user_msg_content {
        let db_bg = db.clone();
        let sid_bg = session_id.clone();
        let content_bg = content.clone();
        let user_idx = msg_count - 1; // 0-based position of the current user message
        tokio::spawn(async move {
            if let Err(e) = db_bg.conversations.store_messages_batch(
                &sid_bg,
                &[("user".to_string(), content_bg, user_idx, 0, 0.5)],
            ) {
                error!("Failed to persist online user message: {}", e);
            }
        });
    }

    // Prepare messages in OpenRouter format
    let openrouter_messages = req.messages.iter().map(|m| {
        serde_json::json!({
            "role": m.role,
            "content": m.content
        })
    }).collect::<Vec<_>>();

    // Prepare OpenRouter request
    let openrouter_request = serde_json::json!({
        "model": req.model,
        "messages": openrouter_messages,
        "max_tokens": req.max_tokens,
        "temperature": req.temperature,
        "stream": req.stream,
    });

    // Make request to OpenRouter API
    let client = reqwest::Client::new();
    let response = client
        .post("https://openrouter.ai/api/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .header("HTTP-Referer", "https://aud.io")
        .header("X-Title", "Aud.io")
        .json(&openrouter_request)
        .send()
        .await;

    match response {
        Ok(resp) => {
            if !resp.status().is_success() {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                error!("OpenRouter API error ({}): {}", status, body);
                return (StatusCode::BAD_GATEWAY, format!("OpenRouter API error: {}", body)).into_response();
            }

            let byte_stream = resp.bytes_stream();

            // Clones moved into the stream generator for post-stream persistence
            let db_persist = db.clone();
            let sid_persist = session_id.clone();

            let sse_stream = async_stream::stream! {
                let mut buffer = String::new();
                let mut full_response = String::new(); // accumulate for DB persistence

                futures_util::pin_mut!(byte_stream);

                while let Some(chunk_result) = byte_stream.next().await {
                    match chunk_result {
                        Ok(chunk) => {
                            buffer.push_str(&String::from_utf8_lossy(&chunk));

                            while let Some(newline_pos) = buffer.find('\n') {
                                let line = buffer[..newline_pos].trim().to_string();
                                buffer = buffer[newline_pos + 1..].to_string();

                                if line.is_empty() {
                                    continue;
                                }

                                if line.starts_with("data: ") {
                                    let data = line[6..].to_string();

                                    if data == "[DONE]" {
                                        yield Ok::<_, Infallible>(Event::default().data("[DONE]"));
                                        // Don't return — break so the persistence code below runs
                                        break;
                                    }

                                    // Collect assistant content tokens for persistence
                                    if let Ok(parsed) = serde_json::from_str::<Value>(&data) {
                                        if let Some(content) = parsed
                                            .get("choices").and_then(|c| c.get(0))
                                            .and_then(|c| c.get("delta"))
                                            .and_then(|d| d.get("content"))
                                            .and_then(|c| c.as_str())
                                        {
                                            full_response.push_str(content);
                                        }
                                    }

                                    yield Ok(Event::default().data(data));
                                }
                            }
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

                // Persist the complete assistant response to SQLite once streaming is done.
                // This runs before the HTTP response body closes, so the frontend always
                // waits for this before reader.read() returns done=true.
                if !full_response.is_empty() {
                    let assistant_idx = msg_count; // slot immediately after all request messages
                    match db_persist.conversations.store_messages_batch(
                        &sid_persist,
                        &[("assistant".to_string(), full_response, assistant_idx, 0, 0.5)],
                    ) {
                        Ok(_) => debug!("Persisted online assistant response for session {}", sid_persist),
                        Err(e) => error!("Failed to persist online assistant message: {}", e),
                    }
                }
            };

            Sse::new(sse_stream)
                .keep_alive(
                    axum::response::sse::KeepAlive::new()
                        .interval(std::time::Duration::from_secs(15))
                )
                .into_response()
        }
        Err(e) => {
            error!("Failed to connect to OpenRouter: {}", e);
            (StatusCode::BAD_GATEWAY, format!("Failed to connect to OpenRouter: {}", e)).into_response()
        }
    }
}
