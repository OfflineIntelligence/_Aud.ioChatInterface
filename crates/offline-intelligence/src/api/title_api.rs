// Title generation API: summarize first prompt into 1-5 word chat title via model inference
// Uses OpenAI-compatible /v1/chat/completions endpoint with low temperature for consistency
use axum::{
    extract::{State, Json},
    http::StatusCode,
};
use serde::{Deserialize, Serialize};
use crate::proxy::AppState;
use tracing::info;

#[derive(Debug, Deserialize)]
pub struct GenerateTitleRequest {
    pub prompt: String,
    #[serde(default = "default_max_tokens")]
    pub max_tokens: u32,
}

fn default_max_tokens() -> u32 {
    20
}

#[derive(Debug, Serialize)]
pub struct GenerateTitleResponse {
    pub title: String,
}

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

/// Generate a concise chat title (1-5 words) from a user prompt using the LLM.
/// Uses temperature 0.3 for consistent results, caps output at 20 tokens
pub async fn generate_title(
    State(state): State<AppState>,
    Json(req): Json<GenerateTitleRequest>,
) -> Result<Json<GenerateTitleResponse>, (StatusCode, Json<ErrorResponse>)> {
    info!("Generating title for prompt: {:?}", req.prompt);

    if req.prompt.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Prompt cannot be empty".to_string(),
            }),
        ));
    }

    let title_instruction = format!(
        "Summarize the following user prompt in 1-5 words as a concise chat title. \
         Return only the title, nothing else.\n\n\
         Prompt: {}",
        req.prompt
    );

    let backend_url = state.cfg.backend_url.clone();
    let client = reqwest::Client::new();

    // Use OpenAI-compatible /v1/chat/completions endpoint (compatible with llama-server)
    let request_body = serde_json::json!({
        "model": "local-llm",
        "messages": [
            {
                "role": "system",
                "content": "You are a helpful assistant that generates short, concise chat titles. Always respond with only the title, no explanation."
            },
            {
                "role": "user",
                "content": title_instruction
            }
        ],
        "max_tokens": req.max_tokens.min(20),
        "temperature": 0.3,
        "stream": false
    });

    match client
        .post(format!("{}/v1/chat/completions", backend_url))
        .json(&request_body)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
    {
        Ok(response) => match response.json::<serde_json::Value>().await {
            Ok(body) => {
                if let Some(content) = body
                    .get("choices")
                    .and_then(|c| c.get(0))
                    .and_then(|c| c.get("message"))
                    .and_then(|m| m.get("content"))
                    .and_then(|c| c.as_str())
                {
                    let title = content
                        .lines()
                        .next()
                        .unwrap_or(content)
                        .trim()
                        .to_string();

                    // Limit to ~50 chars (roughly 5 words)
                    let title = if title.len() > 50 {
                        format!("{}...", &title[..47])
                    } else {
                        title
                    };

                    info!("Generated title: {}", title);
                    Ok(Json(GenerateTitleResponse { title }))
                } else {
                    Err((
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(ErrorResponse {
                            error: "Invalid response format from backend".to_string(),
                        }),
                    ))
                }
            }
            Err(e) => {
                info!("Failed to parse backend response: {}", e);
                Err((
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: format!("Failed to parse response: {}", e),
                    }),
                ))
            }
        },
        Err(e) => {
            info!("Backend request failed: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("Backend request failed: {}", e),
                }),
            ))
        }
    }
}
