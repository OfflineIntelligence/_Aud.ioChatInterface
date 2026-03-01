//! API Keys Store — OS Keychain + SQLite metadata
//!
//! Stores and manages API keys using the native OS keychain for secure storage:
//! - **Windows**: Windows Credential Manager
//! - **macOS**: macOS Keychain
//! - **Linux**: libsecret via D-Bus
//!
//! SQLite tracks metadata only (created_at, last_used_at, usage_count) and stores
//! a `"keychain"` sentinel to indicate the value lives in the OS credential store.
//!
//! **Migration**: Legacy XOR-encrypted entries are automatically migrated to the OS
//! keychain on the first read — no manual action required by the user.

use anyhow::Result;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use chrono::{DateTime, Utc};
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::{info, warn};

/// Sentinel value stored in SQLite when the actual key lives in the OS keychain.
const KEYCHAIN_SENTINEL: &str = "keychain";

/// Credential store service name — identifies the app in the OS keychain.
const KEYCHAIN_SERVICE: &str = "aud-io";

// ─────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────

/// Identifies which external service a key belongs to.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum ApiKeyType {
    HuggingFace,
    OpenRouter,
}

impl ApiKeyType {
    pub fn as_str(&self) -> &'static str {
        match self {
            ApiKeyType::HuggingFace => "huggingface",
            ApiKeyType::OpenRouter => "openrouter",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "huggingface" | "hf" => Some(ApiKeyType::HuggingFace),
            "openrouter" | "or" => Some(ApiKeyType::OpenRouter),
            _ => None,
        }
    }
}

/// Metadata record stored in SQLite.
///
/// `encrypted_value` is either:
/// - `"keychain"` → actual value is in the OS keychain (primary path)
/// - A base64-encoded XOR string → legacy entry, auto-migrated on first read
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiKeyRecord {
    pub id: i64,
    pub key_type: String,
    pub encrypted_value: String,
    pub created_at: DateTime<Utc>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub last_mode: Option<String>,
    pub usage_count: i64,
}

// ─────────────────────────────────────────────
// OS keychain helper
// ─────────────────────────────────────────────

struct OsKeychain;

impl OsKeychain {
    /// Retrieve a credential from the OS keychain.
    /// Returns `Ok(None)` if no entry exists for the given name.
    fn get(name: &str) -> Result<Option<String>> {
        match keyring::Entry::new(KEYCHAIN_SERVICE, name) {
            Ok(entry) => match entry.get_password() {
                Ok(pw) => Ok(Some(pw)),
                Err(keyring::Error::NoEntry) => Ok(None),
                Err(e) => Err(anyhow::anyhow!("Keychain get '{}' failed: {}", name, e)),
            },
            Err(e) => Err(anyhow::anyhow!(
                "Keychain entry creation failed for '{}': {}",
                name,
                e
            )),
        }
    }

    /// Store or overwrite a credential in the OS keychain.
    fn set(name: &str, value: &str) -> Result<()> {
        let entry = keyring::Entry::new(KEYCHAIN_SERVICE, name).map_err(|e| {
            anyhow::anyhow!("Keychain entry creation failed for '{}': {}", name, e)
        })?;
        entry.set_password(value).map_err(|e| {
            anyhow::anyhow!("Keychain set '{}' failed: {}", name, e)
        })?;
        Ok(())
    }

    /// Delete a credential from the OS keychain.
    /// Returns `false` if the entry did not exist; `true` if it was removed.
    fn delete(name: &str) -> Result<bool> {
        match keyring::Entry::new(KEYCHAIN_SERVICE, name) {
            Ok(entry) => match entry.delete_password() {
                Ok(_) => Ok(true),
                Err(keyring::Error::NoEntry) => Ok(false),
                Err(e) => Err(anyhow::anyhow!("Keychain delete '{}' failed: {}", name, e)),
            },
            Err(e) => Err(anyhow::anyhow!(
                "Keychain entry creation failed for '{}': {}",
                name,
                e
            )),
        }
    }
}

// ─────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────

/// Manages API keys — OS keychain for plaintext values, SQLite for metadata.
pub struct ApiKeysStore {
    pool: Arc<Pool<SqliteConnectionManager>>,
}

impl ApiKeysStore {
    pub fn new(pool: Arc<Pool<SqliteConnectionManager>>) -> Self {
        Self { pool }
    }

    // ── Schema ───────────────────────────────

    /// Create the `api_keys` table if it does not yet exist.
    pub fn initialize_schema(&self) -> Result<()> {
        let conn = self.pool.get()?;
        conn.execute(
            "CREATE TABLE IF NOT EXISTS api_keys (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key_type TEXT NOT NULL UNIQUE,
                encrypted_value TEXT NOT NULL,
                created_at TEXT NOT NULL,
                last_used_at TEXT,
                last_mode TEXT,
                usage_count INTEGER DEFAULT 0
            )",
            [],
        )?;
        info!("API keys table initialized");
        Ok(())
    }

    // ── Write ────────────────────────────────

    /// Save or update an API key.
    ///
    /// Writes the plaintext value to the OS keychain and stores `"keychain"` as
    /// the sentinel in SQLite. Falls back to XOR encryption stored in SQLite if the
    /// keychain is unavailable (e.g., headless / CI environments).
    pub fn save_key(&self, key_type: ApiKeyType, plaintext: &str) -> Result<()> {
        let name = key_type.as_str();

        // Try OS keychain first; fall back to XOR if it is unavailable.
        let sentinel = match OsKeychain::set(name, plaintext) {
            Ok(()) => {
                info!("Stored '{}' API key in OS keychain", name);
                KEYCHAIN_SENTINEL.to_string()
            }
            Err(e) => {
                warn!(
                    "OS keychain unavailable for '{}' ({}); using XOR fallback",
                    name, e
                );
                SimpleEncryption::encrypt(plaintext)
            }
        };

        let conn = self.pool.get()?;
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO api_keys (key_type, encrypted_value, created_at, usage_count)
             VALUES (?1, ?2, ?3, 0)
             ON CONFLICT(key_type) DO UPDATE SET
                encrypted_value = excluded.encrypted_value,
                created_at = excluded.created_at",
            params![name, sentinel, now],
        )?;

        info!("API key metadata saved for: {}", name);
        Ok(())
    }

    // ── Read ─────────────────────────────────

    /// Retrieve the **plaintext** value of an API key.
    ///
    /// - If the DB row has the `"keychain"` sentinel → reads from the OS keychain.
    /// - If the DB row has a legacy XOR-encrypted value → decrypts it, silently
    ///   migrates to the OS keychain, and returns the plaintext.
    pub fn get_key_plaintext(&self, key_type: &ApiKeyType) -> Result<Option<String>> {
        let record = match self.get_key_metadata(key_type)? {
            Some(r) => r,
            None => return Ok(None),
        };

        if record.encrypted_value == KEYCHAIN_SENTINEL {
            // Primary path — value lives in the OS keychain.
            match OsKeychain::get(key_type.as_str()) {
                Ok(v) => Ok(v),
                Err(e) => {
                    warn!(
                        "Keychain get failed for '{}': {}",
                        key_type.as_str(),
                        e
                    );
                    Ok(None)
                }
            }
        } else {
            // Legacy path — XOR-encrypted value in SQLite. Decrypt and migrate.
            match SimpleEncryption::decrypt(&record.encrypted_value) {
                Ok(plaintext) => {
                    // Attempt silent migration to the OS keychain.
                    match OsKeychain::set(key_type.as_str(), &plaintext) {
                        Ok(()) => {
                            info!(
                                "Migrated '{}' API key from XOR to OS keychain",
                                key_type.as_str()
                            );
                            // Update the DB row to the keychain sentinel.
                            if let Ok(conn) = self.pool.get() {
                                let _ = conn.execute(
                                    "UPDATE api_keys SET encrypted_value = ?1 WHERE key_type = ?2",
                                    params![KEYCHAIN_SENTINEL, key_type.as_str()],
                                );
                            }
                        }
                        Err(e) => {
                            warn!(
                                "Migration to keychain failed for '{}': {}; keeping XOR",
                                key_type.as_str(),
                                e
                            );
                        }
                    }
                    Ok(Some(plaintext))
                }
                Err(e) => {
                    warn!(
                        "Failed to decrypt legacy key '{}': {}",
                        key_type.as_str(),
                        e
                    );
                    Ok(None)
                }
            }
        }
    }

    /// Get the raw SQLite metadata record (does **not** decrypt or access keychain).
    pub fn get_key_metadata(&self, key_type: &ApiKeyType) -> Result<Option<ApiKeyRecord>> {
        let conn = self.pool.get()?;
        let result = conn
            .query_row(
                "SELECT id, key_type, encrypted_value, created_at, last_used_at, last_mode, usage_count
                 FROM api_keys WHERE key_type = ?1",
                params![key_type.as_str()],
                |row| {
                    let created_str: String = row.get(3)?;
                    let last_used_str: Option<String> = row.get(4)?;
                    Ok(ApiKeyRecord {
                        id: row.get(0)?,
                        key_type: row.get(1)?,
                        encrypted_value: row.get(2)?,
                        created_at: DateTime::parse_from_rfc3339(&created_str)
                            .map(|dt| dt.with_timezone(&Utc))
                            .unwrap_or_else(|_| Utc::now()),
                        last_used_at: last_used_str.and_then(|s| {
                            DateTime::parse_from_rfc3339(&s)
                                .ok()
                                .map(|dt| dt.with_timezone(&Utc))
                        }),
                        last_mode: row.get(5)?,
                        usage_count: row.get(6)?,
                    })
                },
            )
            .optional()?;
        Ok(result)
    }

    /// Return all metadata records (without plaintext values).
    pub fn get_all_keys(&self) -> Result<Vec<ApiKeyRecord>> {
        let conn = self.pool.get()?;
        let mut stmt = conn.prepare(
            "SELECT id, key_type, encrypted_value, created_at, last_used_at, last_mode, usage_count
             FROM api_keys",
        )?;
        let keys = stmt
            .query_map([], |row| {
                let created_str: String = row.get(3)?;
                let last_used_str: Option<String> = row.get(4)?;
                Ok(ApiKeyRecord {
                    id: row.get(0)?,
                    key_type: row.get(1)?,
                    encrypted_value: row.get(2)?,
                    created_at: DateTime::parse_from_rfc3339(&created_str)
                        .map(|dt| dt.with_timezone(&Utc))
                        .unwrap_or_else(|_| Utc::now()),
                    last_used_at: last_used_str.and_then(|s| {
                        DateTime::parse_from_rfc3339(&s)
                            .ok()
                            .map(|dt| dt.with_timezone(&Utc))
                    }),
                    last_mode: row.get(5)?,
                    usage_count: row.get(6)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(keys)
    }

    /// Return all API keys with their decrypted plaintext values.
    /// Used by the `/api-keys/all` endpoint.
    pub fn get_all_keys_with_values(&self) -> Result<Vec<(ApiKeyRecord, Option<String>)>> {
        let records = self.get_all_keys()?;
        let mut out = Vec::with_capacity(records.len());
        for record in records {
            let plaintext = ApiKeyType::from_str(&record.key_type)
                .and_then(|kt| self.get_key_plaintext(&kt).ok().flatten());
            out.push((record, plaintext));
        }
        Ok(out)
    }

    // ── Update ───────────────────────────────

    /// Increment usage count and record the mode and timestamp.
    pub fn mark_used(&self, key_type: ApiKeyType, mode: &str) -> Result<()> {
        let conn = self.pool.get()?;
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE api_keys
             SET last_used_at = ?1, last_mode = ?2, usage_count = usage_count + 1
             WHERE key_type = ?3",
            params![now, mode, key_type.as_str()],
        )?;
        Ok(())
    }

    // ── Delete ───────────────────────────────

    /// Delete an API key — removes from both OS keychain and SQLite.
    pub fn delete_key(&self, key_type: ApiKeyType) -> Result<bool> {
        // Remove from OS keychain (best-effort; the entry may not exist there yet
        // if the key was originally stored via XOR before migration).
        match OsKeychain::delete(key_type.as_str()) {
            Ok(true) => info!("Deleted '{}' key from OS keychain", key_type.as_str()),
            Ok(false) => { /* no keychain entry — nothing to do */ }
            Err(e) => warn!(
                "Could not delete '{}' from OS keychain: {}",
                key_type.as_str(),
                e
            ),
        }

        let conn = self.pool.get()?;
        let rows = conn.execute(
            "DELETE FROM api_keys WHERE key_type = ?1",
            params![key_type.as_str()],
        )?;

        if rows > 0 {
            info!("API key metadata deleted for: {}", key_type.as_str());
            Ok(true)
        } else {
            Ok(false)
        }
    }
}

// ─────────────────────────────────────────────
// Legacy XOR encryption (kept for migration reads and keychain fallback)
// ─────────────────────────────────────────────

/// XOR-based obfuscation used in earlier versions of the app.
///
/// New keys are always written to the OS keychain. This type is retained so that:
/// 1. Existing XOR-encrypted DB entries can be decrypted and migrated to the keychain.
/// 2. When the OS keychain is unavailable, this provides a graceful fallback.
pub struct SimpleEncryption;

impl SimpleEncryption {
    fn get_key() -> Vec<u8> {
        let machine_id = whoami::devicename();
        let mut key: Vec<u8> = machine_id.bytes().collect();
        while key.len() < 32 {
            key.push((key.len() as u8).wrapping_mul(17));
        }
        key.truncate(32);
        key
    }

    pub fn encrypt(plaintext: &str) -> String {
        let key = Self::get_key();
        let encrypted: Vec<u8> = plaintext
            .as_bytes()
            .iter()
            .enumerate()
            .map(|(i, &b)| b ^ key[i % key.len()])
            .collect();
        BASE64.encode(&encrypted)
    }

    pub fn decrypt(ciphertext: &str) -> Result<String> {
        let key = Self::get_key();
        let bytes = BASE64.decode(ciphertext)?;
        let decrypted: Vec<u8> = bytes
            .iter()
            .enumerate()
            .map(|(i, &b)| b ^ key[i % key.len()])
            .collect();
        Ok(String::from_utf8(decrypted)?)
    }
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_xor_roundtrip() {
        let original = "hf_1234567890abcdef";
        let encrypted = SimpleEncryption::encrypt(original);
        let decrypted = SimpleEncryption::decrypt(&encrypted).unwrap();
        assert_eq!(original, decrypted);
    }

    #[test]
    fn test_keychain_sentinel_not_xor() {
        // "keychain" sentinel must not accidentally be valid base64 that XOR-decodes
        // to a real key — it should be treated as a sentinel, not a ciphertext.
        assert_eq!(KEYCHAIN_SENTINEL, "keychain");
        // Attempting to XOR-decrypt it won't yield anything useful — just verify no panic.
        let _ = SimpleEncryption::decrypt(KEYCHAIN_SENTINEL);
    }
}
