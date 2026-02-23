use std::path::Path;
use std::fs;
use std::io::{Read, Cursor};
use tracing::debug;
use anyhow::Result;

/// Extract text content from various file formats
pub async fn extract_file_content(file_path: &Path) -> Result<String> {
    let file_ext = file_path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_lowercase())
        .unwrap_or_default();

    match file_ext.as_str() {
        // Text and code files
        "txt" | "md" | "markdown" | "json" | "jsonc" | "yaml" | "yml" | "xml" | "csv" | "log" | "tsv" |
        "js" | "mjs" | "cjs" | "ts" | "jsx" | "tsx" | "py" | "pyw" | "java" | "cpp" | "cc" | "cxx" |
        "c" | "h" | "hpp" | "cs" | "html" | "htm" | "css" | "scss" | "sass" | "less" | "go" | "rs" |
        "php" | "rb" | "swift" | "kt" | "kts" | "scala" | "sql" | "sh" | "bash" | "zsh" | "fish" |
        "bat" | "cmd" | "ps1" | "psm1" | "psd1" | "dockerfile" | "env" | "rtf" | "toml" | "ini" |
        "cfg" | "conf" | "properties" | "gradle" | "cmake" | "makefile" | "mk" | "lua" | "r" | "m" |
        "vim" | "el" | "lisp" | "clj" | "cljs" | "hs" | "elm" | "ex" | "exs" | "erl" | "hrl" |
        "nim" | "zig" | "v" | "d" | "f" | "f90" | "jl" | "dart" | "groovy" | "pl" | "pm" |
        "tcl" | "awk" | "sed" | "vue" | "svelte" | "astro" | "graphql" | "gql" | "proto" |
        "tf" | "tfvars" | "hcl" | "nix" | "dhall" | "cabal" | "lock" | "sum" | "mod" => {
            extract_text_file(file_path).await
        },
        // Document files
        "pdf" => extract_pdf_content(file_path).await,
        "doc" | "docx" => extract_docx_content(file_path).await,
        "odt" => extract_odt_content(file_path).await,
        // Spreadsheet files
        "xls" | "xlsx" | "ods" => extract_xlsx_content(file_path).await,
        // Presentation files
        "ppt" | "pptx" | "odp" => extract_pptx_content(file_path).await,
        // Image files
        "ico" | "png" | "jpg" | "jpeg" | "gif" | "bmp" | "webp" | "svg" | "tiff" | "tif" |
        "heic" | "heif" | "avif" => {
            let name = file_path.file_name().and_then(|n| n.to_str()).unwrap_or("image");
            Ok(format!("[Image file: {} — binary content, text extraction not applicable]", name))
        },
        // Archive files
        "zip" | "tar" | "gz" | "bz2" | "xz" | "7z" | "rar" => {
            let name = file_path.file_name().and_then(|n| n.to_str()).unwrap_or("archive");
            Ok(format!("[Archive file: {} — cannot extract text from compressed archives]", name))
        },
        // Compiled/binary files
        "exe" | "dll" | "so" | "dylib" | "bin" | "obj" | "o" | "wasm" => {
            let name = file_path.file_name().and_then(|n| n.to_str()).unwrap_or("binary");
            Ok(format!("[Binary file: {} — cannot extract text from compiled binary]", name))
        },
        // Default to text extraction
        _ => {
            debug!("Unknown file type {}, attempting text extraction", file_ext);
            extract_text_file(file_path).await
        }
    }
}

/// Extract text from bytes with file extension
pub async fn extract_content_from_bytes(bytes: &[u8], filename: &str) -> Result<String> {
    let ext = filename.split('.').last().unwrap_or("").to_lowercase();
    
    match ext.as_str() {
        // Text/code files - direct UTF-8 decoding
        "txt" | "md" | "markdown" | "json" | "jsonc" | "yaml" | "yml" | "xml" | "csv" | "log" | "tsv" |
        "js" | "mjs" | "cjs" | "ts" | "jsx" | "tsx" | "py" | "pyw" | "java" | "cpp" | "cc" | "cxx" |
        "c" | "h" | "hpp" | "cs" | "html" | "htm" | "css" | "scss" | "sass" | "less" | "go" | "rs" |
        "php" | "rb" | "swift" | "kt" | "kts" | "scala" | "sql" | "sh" | "bash" | "zsh" | "fish" |
        "bat" | "cmd" | "ps1" | "psm1" | "psd1" | "dockerfile" | "env" | "rtf" | "toml" | "ini" |
        "cfg" | "conf" | "properties" | "gradle" | "cmake" | "makefile" | "mk" | "lua" | "r" | "m" |
        "vim" | "el" | "lisp" | "clj" | "cljs" | "hs" | "elm" | "ex" | "exs" | "erl" | "hrl" |
        "nim" | "zig" | "v" | "d" | "f" | "f90" | "jl" | "dart" | "groovy" | "pl" | "pm" |
        "tcl" | "awk" | "sed" | "vue" | "svelte" | "astro" | "graphql" | "gql" | "proto" |
        "tf" | "tfvars" | "hcl" | "nix" | "dhall" | "cabal" | "lock" | "sum" | "mod" => {
            Ok(String::from_utf8_lossy(bytes).to_string())
        },
        // PDF files
        "pdf" => Ok(extract_pdf_from_bytes(bytes)),
        // Word documents
        "doc" | "docx" => Ok(extract_docx_from_bytes(bytes)),
        "odt" => Ok(extract_odt_from_bytes(bytes)),
        // Spreadsheets
        "xls" | "xlsx" | "ods" => Ok(extract_xlsx_from_bytes(bytes, &ext)),
        // Presentations
        "ppt" | "pptx" | "odp" => Ok(extract_pptx_from_bytes(bytes)),
        // Image files - return descriptive note (binary, not text-extractable)
        "ico" | "png" | "jpg" | "jpeg" | "gif" | "bmp" | "webp" | "svg" | "tiff" | "tif" |
        "heic" | "heif" | "avif" => {
            Ok(format!("[Image file: {} — binary content, text extraction not applicable]", filename))
        },
        // Archive files
        "zip" | "tar" | "gz" | "bz2" | "xz" | "7z" | "rar" => {
            Ok(format!("[Archive file: {} — cannot extract text from compressed archives]", filename))
        },
        // Compiled/binary files
        "exe" | "dll" | "so" | "dylib" | "bin" | "obj" | "o" | "wasm" => {
            Ok(format!("[Binary file: {} — cannot extract text from compiled binary]", filename))
        },
        // Default - attempt UTF-8 text extraction (handles most source/config files)
        _ => {
            debug!("Unknown file type {}, attempting text extraction", ext);
            Ok(String::from_utf8_lossy(bytes).to_string())
        }
    }
}

/// Extract content from text-based files
async fn extract_text_file(file_path: &Path) -> Result<String> {
    let content = fs::read_to_string(file_path)?;
    Ok(content)
}

/// Extract content from PDF files
async fn extract_pdf_content(file_path: &Path) -> Result<String> {
    let bytes = fs::read(file_path)?;
    Ok(extract_pdf_from_bytes(&bytes))
}

fn extract_pdf_from_bytes(bytes: &[u8]) -> String {
    match pdf_extract::extract_text_from_mem(bytes) {
        Ok(text) => {
            let cleaned = text.trim().to_string();
            if cleaned.is_empty() {
                "[PDF file appears to be empty or contains only images]".to_string()
            } else {
                cleaned
            }
        }
        Err(e) => {
            debug!("PDF extraction failed: {}", e);
            format!("[Could not extract PDF content: {}]", e)
        }
    }
}

/// Extract content from DOCX files
async fn extract_docx_content(file_path: &Path) -> Result<String> {
    let bytes = fs::read(file_path)?;
    Ok(extract_docx_from_bytes(&bytes))
}

fn extract_docx_from_bytes(bytes: &[u8]) -> String {
    let cursor = Cursor::new(bytes);
    match zip::ZipArchive::new(cursor) {
        Ok(mut archive) => {
            let mut text = String::new();
            
            if let Ok(mut file) = archive.by_name("word/document.xml") {
                let mut xml_content = String::new();
                if file.read_to_string(&mut xml_content).is_ok() {
                    let re = regex::Regex::new(r"<w:t[^>]*>([^<]*)</w:t>").unwrap();
                    for cap in re.captures_iter(&xml_content) {
                        if let Some(t) = cap.get(1) {
                            text.push_str(t.as_str());
                            text.push(' ');
                        }
                    }
                    let text = text.replace("</w:p>", "\n").trim().to_string();
                    if text.is_empty() {
                        "[DOCX file appears to be empty]".to_string()
                    } else {
                        text
                    }
                } else {
                    "[Could not read DOCX content]".to_string()
                }
            } else {
                "[Could not find document content in DOCX file]".to_string()
            }
        }
        Err(e) => {
            debug!("DOCX extraction failed: {}", e);
            format!("[Could not extract DOCX content: {}]", e)
        }
    }
}

/// Extract content from XLSX files
async fn extract_xlsx_content(file_path: &Path) -> Result<String> {
    use calamine::{Reader, open_workbook_auto};
    
    match open_workbook_auto(file_path) {
        Ok(mut workbook) => {
            let mut text = String::new();
            for sheet_name in workbook.sheet_names().to_vec() {
                if let Ok(range) = workbook.worksheet_range(&sheet_name) {
                    text.push_str(&format!("\n=== Sheet: {} ===\n", sheet_name));
                    for row in range.rows() {
                        let row_text: Vec<String> = row.iter().map(|c| c.to_string()).collect();
                        text.push_str(&row_text.join("\t"));
                        text.push('\n');
                    }
                }
            }
            if text.trim().is_empty() {
                Ok("[Spreadsheet appears to be empty]".to_string())
            } else {
                Ok(text)
            }
        }
        Err(e) => {
            debug!("XLSX extraction failed: {}", e);
            Ok(format!("[Could not extract spreadsheet content: {}]", e))
        }
    }
}

fn extract_xlsx_from_bytes(bytes: &[u8], ext: &str) -> String {
    use calamine::{Reader, Xlsx, Ods};
    
    let cursor = Cursor::new(bytes);
    let mut text = String::new();
    
    match ext {
        "ods" => {
            if let Ok(mut workbook) = Ods::new(cursor) {
                for sheet_name in workbook.sheet_names().to_vec() {
                    if let Ok(range) = workbook.worksheet_range(&sheet_name) {
                        text.push_str(&format!("\n=== Sheet: {} ===\n", sheet_name));
                        for row in range.rows() {
                            let row_text: Vec<String> = row.iter().map(|c| c.to_string()).collect();
                            text.push_str(&row_text.join("\t"));
                            text.push('\n');
                        }
                    }
                }
            }
        }
        _ => {
            if let Ok(mut workbook) = Xlsx::new(cursor) {
                for sheet_name in workbook.sheet_names().to_vec() {
                    if let Ok(range) = workbook.worksheet_range(&sheet_name) {
                        text.push_str(&format!("\n=== Sheet: {} ===\n", sheet_name));
                        for row in range.rows() {
                            let row_text: Vec<String> = row.iter().map(|c| c.to_string()).collect();
                            text.push_str(&row_text.join("\t"));
                            text.push('\n');
                        }
                    }
                }
            }
        }
    }
    
    if text.trim().is_empty() {
        "[Spreadsheet appears to be empty or could not be read]".to_string()
    } else {
        text
    }
}

/// Extract content from PPTX files
async fn extract_pptx_content(file_path: &Path) -> Result<String> {
    let bytes = fs::read(file_path)?;
    Ok(extract_pptx_from_bytes(&bytes))
}

fn extract_pptx_from_bytes(bytes: &[u8]) -> String {
    let cursor = Cursor::new(bytes);
    match zip::ZipArchive::new(cursor) {
        Ok(mut archive) => {
            let mut text = String::new();
            let mut slide_num = 1;
            
            loop {
                let slide_path = format!("ppt/slides/slide{}.xml", slide_num);
                match archive.by_name(&slide_path) {
                    Ok(mut file) => {
                        let mut xml_content = String::new();
                        if file.read_to_string(&mut xml_content).is_ok() {
                            text.push_str(&format!("\n=== Slide {} ===\n", slide_num));
                            let re = regex::Regex::new(r"<a:t>([^<]*)</a:t>").unwrap();
                            for cap in re.captures_iter(&xml_content) {
                                if let Some(t) = cap.get(1) {
                                    text.push_str(t.as_str());
                                    text.push('\n');
                                }
                            }
                        }
                        slide_num += 1;
                    }
                    Err(_) => break,
                }
            }
            
            if text.trim().is_empty() {
                "[Presentation appears to be empty]".to_string()
            } else {
                text
            }
        }
        Err(e) => {
            debug!("PPTX extraction failed: {}", e);
            format!("[Could not extract presentation content: {}]", e)
        }
    }
}

/// Extract content from ODT files
async fn extract_odt_content(file_path: &Path) -> Result<String> {
    let bytes = fs::read(file_path)?;
    Ok(extract_odt_from_bytes(&bytes))
}

fn extract_odt_from_bytes(bytes: &[u8]) -> String {
    let cursor = Cursor::new(bytes);
    match zip::ZipArchive::new(cursor) {
        Ok(mut archive) => {
            if let Ok(mut file) = archive.by_name("content.xml") {
                let mut xml_content = String::new();
                if file.read_to_string(&mut xml_content).is_ok() {
                    let re = regex::Regex::new(r"<text:[^>]+>([^<]*)</text:").unwrap();
                    let mut text = String::new();
                    for cap in re.captures_iter(&xml_content) {
                        if let Some(t) = cap.get(1) {
                            let content = t.as_str().trim();
                            if !content.is_empty() {
                                text.push_str(content);
                                text.push(' ');
                            }
                        }
                    }
                    if text.trim().is_empty() {
                        "[ODT file appears to be empty]".to_string()
                    } else {
                        text.trim().to_string()
                    }
                } else {
                    "[Could not read ODT content]".to_string()
                }
            } else {
                "[Could not find content in ODT file]".to_string()
            }
        }
        Err(e) => {
            debug!("ODT extraction failed: {}", e);
            format!("[Could not extract ODT content: {}]", e)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::NamedTempFile;

    #[tokio::test]
    async fn test_extract_text_file() {
        let temp_file = NamedTempFile::new().unwrap();
        let content = "Test file content\nwith multiple lines";
        fs::write(&temp_file.path(), content).unwrap();

        let result = extract_text_file(temp_file.path()).await.unwrap();
        assert_eq!(result, content);
    }

    #[tokio::test]
    async fn test_extract_unknown_file_type() {
        let temp_file = NamedTempFile::new().unwrap();
        let content = "Unknown file content";
        fs::write(&temp_file.path(), content).unwrap();

        let result = extract_file_content(temp_file.path()).await.unwrap();
        assert_eq!(result, content);
    }
}
