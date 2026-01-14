// Server/src/api/mod.rs
//! API module - External interfaces for the memory system

pub mod memory_api;
pub mod search_api;
pub mod admin_api;
pub mod title_api;  // Title generation from first prompt

// Re-export API handlers
pub use memory_api::{memory_optimize, memory_stats, memory_cleanup};
pub use title_api::{generate_title, GenerateTitleRequest, GenerateTitleResponse};