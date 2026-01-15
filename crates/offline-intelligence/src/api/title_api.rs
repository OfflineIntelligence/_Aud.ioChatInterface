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

    // Improved instruction: prioritize clarity and let LLM naturally generate 1-5 word titles
    // rather than forcing truncation, which can create incomplete/nonsensical titles
    let title_instruction = format!(
        "User prompt: {}\n\n\
         Create a short, meaningful chat title using 1-5 words maximum that captures the essence of this prompt.",
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
                "content": "You are a title generator. Create concise, meaningful chat titles in 1-5 words maximum. Prioritize clarity and relevance. Respond with ONLY the title, nothing else."
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
                    let mut title = content
                        .lines()
                        .next()
                        .unwrap_or(content)
                        .trim()
                        .to_string();

                    // Post-process title: remove prefixes, quotes, and validate output
                    // Let model do the work of staying within 1-5 words naturally
                    let prefixes_to_remove = [
                        "Title: ",
                        "title: ",
                        "TITLE: ",
                        "Chat title: ",
                        "Short title: ",
                        "Answer: ",
                        "Response: ",
                    ];

                    for prefix in &prefixes_to_remove {
                        if title.starts_with(prefix) {
                            title = title[prefix.len()..].trim().to_string();
                            break;
                        }
                    }

                    // Remove surrounding quotes if present
                    if (title.starts_with('"') && title.ends_with('"')) ||
                       (title.starts_with('\'') && title.ends_with('\'')) {
                        title = title[1..title.len()-1].trim().to_string();
                    }

                    // Only log word count, let model generate natural 1-5 word titles
                    let word_count = title.split_whitespace().count();
                    info!("Generated title: '{}' ({} words)", title, word_count);
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
