// Server/src/api/mod.rs
//! API module - External interfaces for the memory system

pub mod memory_api;
pub mod search_api;
pub mod admin_api;
pub mod title_api;  // Title generation from first prompt
pub mod conversation_api;  // Chat persistence: REST API for conversation CRUD operations

// Re-export API handlers
pub use memory_api::{memory_optimize, memory_stats, memory_cleanup};
pub use title_api::{generate_title, GenerateTitleRequest, GenerateTitleResponse};
// Chat persistence: Export conversation management handlers for REST routes (CRUD operations)
pub use conversation_api::{get_conversations, get_conversation, update_conversation_title, delete_conversation};