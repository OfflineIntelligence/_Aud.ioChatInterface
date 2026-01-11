//! Search API endpoints
//! 
//! This module provides search functionality across conversations and embeddings.
//! Currently a placeholder for future implementation.

use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use tracing::{info, warn, debug};

use crate::UnifiedAppState;
use crate::memory_db::StoredMessage;

/// Search request payload
#[derive(Debug, Deserialize)]
pub struct SearchRequest {
    pub query: String,
    pub session_id: Option<String>,
    pub limit: Option<i32>,
}

/// Search response
#[derive(Debug, Serialize)]
pub struct SearchResponse {
    pub results: Vec<SearchResult>,
    pub total: usize,
}

/// Individual search result
#[derive(Debug, Serialize)]
pub struct SearchResult {
    pub session_id: String,
    pub message_id: i64,
    pub content: String,
    pub relevance_score: f32,
}

/// Search endpoint handler
pub async fn search(
    State(state): State<UnifiedAppState>,
    Json(payload): Json<SearchRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    info!("Search request received: query={}, session={:?}, limit={:?}", 
          payload.query, payload.session_id, payload.limit);
    
    // Validate input
    if payload.query.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Query cannot be empty".to_string()));
    }
    
    let limit = payload.limit.unwrap_or(10).max(1).min(100) as usize;
    
    // Extract keywords from query
    let keywords: Vec<String> = payload.query
        .split_whitespace()
        .filter(|word| word.len() > 2)
        .map(|s| s.to_lowercase())
        .collect();
    
    if keywords.is_empty() {
        return Ok(Json(SearchResponse {
            results: vec![],
            total: 0,
        }));
    }
    
    // Access the context orchestrator to get database
    let orchestrator_guard = state.context_orchestrator.read().await;
    
    if let Some(orchestrator) = &*orchestrator_guard {
        // Search in database using keywords
        match orchestrator.search_messages(
            payload.session_id.as_deref(),
            &keywords,
            limit
        ).await {
            Ok(stored_messages) => {
                let results: Vec<SearchResult> = stored_messages
                    .into_iter()
                    .map(|msg| {
                        let session_id = msg.session_id;
                        let message_id = msg.id;
                        let content = msg.content;
                        SearchResult {
                            session_id,
                            message_id,
                            content: content.clone(),
                            relevance_score: calculate_relevance(&content, &keywords),
                        }
                    })
                    .collect();
                
                let total = results.len();
                debug!("Search completed: found {} results", total);
                
                Ok(Json(SearchResponse { results, total }))
            }
            Err(e) => {
                warn!("Search failed: {}", e);
                Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Search failed: {}", e)))
            }
        }
    } else {
        warn!("Context orchestrator not available for search");
        Ok(Json(SearchResponse {
            results: vec![],
            total: 0,
        }))
    }
}

/// Calculate relevance score based on keyword matches
fn calculate_relevance(content: &str, keywords: &[String]) -> f32 {
    let content_lower = content.to_lowercase();
    let mut score = 0.0;
    
    for keyword in keywords {
        let matches = content_lower.matches(keyword).count();
        if matches > 0 {
            // Higher score for exact matches, lower for partial
            score += matches as f32 * (keyword.len() as f32 / content.len() as f32);
        }
    }
    
    // Normalize score (0.0 to 1.0)
    score.min(1.0)
}
