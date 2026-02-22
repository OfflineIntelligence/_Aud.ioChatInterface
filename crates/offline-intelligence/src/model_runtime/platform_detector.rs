//! Platform and Hardware Detection
//!
//! Detects the appropriate runtime binary based on the platform (Windows, Linux, macOS)
//! and hardware capabilities (Intel, Apple Silicon, NVIDIA CUDA).

use std::path::PathBuf;
use std::sync::OnceLock;
use tracing::info;

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub enum Platform {
    Windows,
    Linux,
    MacOS,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub enum HardwareArchitecture {
    X86_64,
    Aarch64, // Apple Silicon, ARM
    Other(String),
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct HardwareCapabilities {
    pub platform: Platform,
    pub architecture: HardwareArchitecture,
    pub has_cuda: bool,
    pub has_metal: bool, // For Apple GPUs
    pub has_vulkan: bool,
}

// Static cache for hardware capabilities to avoid repeated detection
static HARDWARE_CACHE: OnceLock<HardwareCapabilities> = OnceLock::new();

impl Default for HardwareCapabilities {
    fn default() -> Self {
        Self::detect()
    }
}

impl HardwareCapabilities {
    /// Detect hardware capabilities automatically (cached)
    pub fn detect() -> Self {
        // Return cached result if available
        if let Some(cached) = HARDWARE_CACHE.get() {
            return cached.clone();
        }

        // Perform detection
        let platform = Self::detect_platform();
        let architecture = Self::detect_architecture();
        let has_cuda = Self::detect_cuda_support();
        let has_metal = Self::detect_metal_support();
        let has_vulkan = Self::detect_vulkan_support();

        info!(
            "Detected platform: {:?}, architecture: {:?}, CUDA: {}, Metal: {}, Vulkan: {}",
            platform, architecture, has_cuda, has_metal, has_vulkan
        );

        let capabilities = Self {
            platform,
            architecture,
            has_cuda,
            has_metal,
            has_vulkan,
        };

        // Cache the result (ignore if already set by another thread)
        let _ = HARDWARE_CACHE.set(capabilities.clone());

        capabilities
    }

    fn detect_platform() -> Platform {
        if cfg!(target_os = "windows") {
            Platform::Windows
        } else if cfg!(target_os = "linux") {
            Platform::Linux
        } else if cfg!(target_os = "macos") {
            Platform::MacOS
        } else {
            // Default to current platform if unknown
            #[cfg(target_os = "windows")]
            return Platform::Windows;
            #[cfg(target_os = "linux")]
            return Platform::Linux;
            #[cfg(target_os = "macos")]
            return Platform::MacOS;
            #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
            return Platform::Linux; // Default fallback
        }
    }

    fn detect_architecture() -> HardwareArchitecture {
        if cfg!(target_arch = "x86_64") {
            HardwareArchitecture::X86_64
        } else if cfg!(target_arch = "aarch64") {
            HardwareArchitecture::Aarch64
        } else {
            HardwareArchitecture::Other(std::env::consts::ARCH.to_string())
        }
    }

    fn detect_cuda_support() -> bool {
        // Check for NVIDIA GPU via nvidia-smi with a timeout to prevent hangs
        // on systems with broken driver installations
        use std::process::{Command, Stdio};

        // Create command with hidden window on Windows
        #[cfg(target_os = "windows")]
        let child = {
            use std::os::windows::process::CommandExt;
            Command::new("nvidia-smi")
                .arg("--query-gpu=name")
                .arg("--format=csv,noheader,nounits")
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                .creation_flags(0x08000000) // CREATE_NO_WINDOW
                .spawn()
        };

        #[cfg(not(target_os = "windows"))]
        let child = Command::new("nvidia-smi")
            .arg("--query-gpu=name")
            .arg("--format=csv,noheader,nounits")
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn();

        match child {
            Ok(mut process) => {
                // Wait up to 5 seconds for nvidia-smi to respond
                let start = std::time::Instant::now();
                loop {
                    match process.try_wait() {
                        Ok(Some(status)) => return status.success(),
                        Ok(None) => {
                            if start.elapsed() > std::time::Duration::from_secs(5) {
                                let _ = process.kill();
                                let _ = process.wait();
                                return false;
                            }
                            std::thread::sleep(std::time::Duration::from_millis(50));
                        }
                        Err(_) => return false,
                    }
                }
            }
            Err(_) => false,
        }
    }

    fn detect_metal_support() -> bool {
        // Metal is available on Apple Silicon and newer Intel Macs
        cfg!(target_os = "macos")
    }

    fn detect_vulkan_support() -> bool {
        // Check for vulkan libraries or validation layers
        // This is a simplified check - in practice, you'd want to check for the actual Vulkan loader
        false // For now, default to false until properly implemented
    }

    /// Get the appropriate runtime binary path based on platform and hardware
    pub fn get_runtime_binary_path(&self) -> Option<PathBuf> {
        let resources_dir = self.get_resources_dir()?;
        let platform_dir = resources_dir.join(self.platform.to_string().to_lowercase());

        match &self.platform {
            Platform::Windows => {
                // On Windows, prefer CUDA if available, otherwise use CPU
                if self.has_cuda {
                    Some(
                        platform_dir
                            .join("llama-b6970-bin-win-cuda-12.4-x64")
                            .join("llama-server.exe"),
                    )
                } else {
                    Some(platform_dir.join("llama-cpu").join("llama-server.exe"))
                }
            }
            Platform::Linux => {
                // On Linux, we'll need to add appropriate paths when implemented
                // For now, return None to use default/fallback behavior
                None
            }
            Platform::MacOS => {
                // On macOS, use Metal-compatible binary if available, otherwise CPU
                if self.has_metal {
                    // Would use Metal-optimized binary when available
                    Some(platform_dir.join("llama-metal").join("llama-server"))
                } else {
                    Some(platform_dir.join("llama-cpu").join("llama-server"))
                }
            }
        }
    }

    /// Get the resources directory path
    fn get_resources_dir(&self) -> Option<PathBuf> {
        // Try to find the resources directory relative to the executable
        if let Ok(current_exe) = std::env::current_exe() {
            if let Some(parent) = current_exe.parent() {
                let resources_path = parent.join("..").join("Resources").join("bin");
                if resources_path.exists() {
                    return Some(resources_path);
                }
            }
        }

        // Fallback: try relative to current working directory
        let resources_path = std::path::PathBuf::from("Resources").join("bin");
        if resources_path.exists() {
            return Some(resources_path);
        }

        // Try the development path
        let dev_resources_path = std::path::PathBuf::from("crates")
            .join("offline-intelligence")
            .join("Resources")
            .join("bin");
        if dev_resources_path.exists() {
            return Some(dev_resources_path);
        }

        None
    }
}

impl std::fmt::Display for Platform {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Platform::Windows => write!(f, "Windows"),
            Platform::Linux => write!(f, "Linux"),
            Platform::MacOS => write!(f, "MacOS"),
        }
    }
}

impl std::fmt::Display for HardwareArchitecture {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            HardwareArchitecture::X86_64 => write!(f, "x86_64"),
            HardwareArchitecture::Aarch64 => write!(f, "aarch64"),
            HardwareArchitecture::Other(s) => write!(f, "{}", s),
        }
    }
}
