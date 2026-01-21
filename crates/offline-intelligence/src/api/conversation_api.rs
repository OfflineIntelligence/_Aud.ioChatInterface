//! API endpoints for conversation/session management

use axum::{
    extract::{State, Path},
    response::{IntoResponse, Response},
    Json,
};
use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tracing::{info, error};

use crate::UnifiedAppState;
use crate::memory_db::schema::{Session, StoredMessage};

/// Response for fetching all conversations
#[derive(Debug, Serialize)]
pub struct ConversationsResponse {
    pub conversations: Vec<ConversationSummary>,
}

/// Summary of a conversation for the sidebar
#[derive(Debug, Serialize)]
pub struct ConversationSummary {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub last_accessed: String,
    pub message_count: usize,
}

/// Response for fetching a specific conversation's messages
#[derive(Debug, Serialize)]
pub struct ConversationDetailResponse {
    pub id: String,
    pub title: String,
    pub messages: Vec<MessageResponse>,
}

/// Message format for API response
#[derive(Debug, Serialize)]
pub struct MessageResponse {
    pub role: String,
    pub content: String,
}

/// Fetch all conversations/sessions from the database
pub async fn get_conversations(
    State(state): State<UnifiedAppState>,
) -> Result<Json<ConversationsResponse>, Response> {
    info!("Fetching all conversations");
    
    let orchestrator_lock = state.context_orchestrator.read().await;
    
    if let Some(ref orchestrator) = *orchestrator_lock {
        match orchestrator.database().conversations.get_all_sessions() {
            Ok(sessions) => {
                let mut conversations = Vec::new();
                
                for session in sessions {
                    // Only include sessions that have a title (completed chats)
                    // Skip sessions without titles - these are in-progress and not ready to show
                    if let Some(ref title) = session.metadata.title {
                        // Get message count for this session
                        let message_count = orchestrator.database().conversations
                            .get_session_messages(&session.id, None, None)
                            .map(|msgs| msgs.len())
                            .unwrap_or(0);
                        
                        conversations.push(ConversationSummary {
                            id: session.id.clone(),
                            title: title.clone(),
                            created_at: session.created_at.to_rfc3339(),
                            last_accessed: session.last_accessed.to_rfc3339(),
                            message_count,
                        });
                    }
                }
                
                info!("Found {} conversations", conversations.len());
                Ok(Json(ConversationsResponse { conversations }))
            }
            Err(e) => {
                error!("Failed to fetch conversations: {}", e);
                Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)).into_response())
            }
        }
    } else {
        error!("Context orchestrator not initialized");
        Err((StatusCode::SERVICE_UNAVAILABLE, "Memory system not available").into_response())
    }
}

/// Fetch a specific conversation's messages
pub async fn get_conversation(
    State(state): State<UnifiedAppState>,
    Path(session_id): Path<String>,
) -> Result<Json<ConversationDetailResponse>, Response> {
    info!("Fetching conversation: {}", session_id);
    
    let orchestrator_lock = state.context_orchestrator.read().await;
    
    if let Some(ref orchestrator) = *orchestrator_lock {
        // Get session metadata
        let session = match orchestrator.database().conversations.get_session(&session_id) {
            Ok(Some(s)) => s,
            Ok(None) => {
                return Err((StatusCode::NOT_FOUND, "Conversation not found").into_response());
            }
            Err(e) => {
                error!("Failed to fetch session: {}", e);
                return Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)).into_response());
            }
        };
        
        // Get messages
        let messages = match orchestrator.database().conversations.get_session_messages(&session_id, None, None) {
            Ok(msgs) => msgs.into_iter()
                .map(|msg| MessageResponse {
                    role: msg.role,
                    content: msg.content,
                })
                .collect(),
            Err(e) => {
                error!("Failed to fetch messages: {}", e);
                return Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)).into_response());
            }
        };
        
        Ok(Json(ConversationDetailResponse {
            id: session.id,
            title: session.metadata.title.unwrap_or_else(|| "New Chat".to_string()),
            messages,
        }))
    } else {
        error!("Context orchestrator not initialized");
        Err((StatusCode::SERVICE_UNAVAILABLE, "Memory system not available").into_response())
    }
}

/// Request to update a conversation's title
#[derive(Debug, Deserialize)]
pub struct UpdateTitleRequest {
    pub title: String,
}

/// Update a conversation's title
pub async fn update_conversation_title(
    State(state): State<UnifiedAppState>,
    Path(session_id): Path<String>,
    Json(req): Json<UpdateTitleRequest>,
) -> Result<Json<Value>, Response> {
    info!("Updating title for conversation: {}", session_id);
    
    if req.title.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Title cannot be empty").into_response());
    }
    
    let orchestrator_lock = state.context_orchestrator.read().await;
    
    if let Some(ref orchestrator) = *orchestrator_lock {
        match orchestrator.database().conversations.update_session_title(&session_id, &req.title) {
            Ok(_) => {
                info!("Successfully updated title for conversation: {}", session_id);
                Ok(Json(serde_json::json!({
                    "success": true,
                    "id": session_id,
                    "title": req.title
                })))
            }
            Err(e) => {
                error!("Failed to update conversation title: {}", e);
                Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)).into_response())
            }
        }
    } else {
        error!("Context orchestrator not initialized");
        Err((StatusCode::SERVICE_UNAVAILABLE, "Memory system not available").into_response())
    }
}

/// Delete a conversation permanently from the database
/// Called via DELETE /conversations/:id from frontend
/// Returns success JSON or error status code with message
pub async fn delete_conversation(
    State(state): State<UnifiedAppState>,
    Path(session_id): Path<String>,
) -> Result<Json<Value>, Response> {
    info!("Deleting conversation: {}", session_id);
    
    let orchestrator_lock = state.context_orchestrator.read().await;
    
    if let Some(ref orchestrator) = *orchestrator_lock {
        match orchestrator.database().conversations.delete_session(&session_id) {
            Ok(_) => {
                info!("Successfully deleted conversation: {}", session_id);
                Ok(Json(serde_json::json!({
                    "success": true,
                    "id": session_id
                })))
            }
            Err(e) => {
                error!("Failed to delete conversation: {}", e);
                // Return detailed error to help with debugging
                Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)).into_response())
            }
        }
    } else {
        error!("Context orchestrator not initialized");
        Err((StatusCode::SERVICE_UNAVAILABLE, "Memory system not available").into_response())
    }
}
