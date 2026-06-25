use base64::Engine;
use md5::Digest;
use std::io::Cursor;
use std::path::PathBuf;
use tauri::Manager;

// ═══════════════════════════════════════════
// Thumbnail Generation
// ═══════════════════════════════════════════

const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "bmp", "tiff"];
const MAX_CACHE_SIZE_BYTES: u64 = 200 * 1024 * 1024; // 200MB

/// Compute a simple hash for cache key: path + mtime + size.
fn cache_key(path: &str, mtime: u64, size: u64) -> String {
    let input = format!("{}:{}:{}", path, mtime, size);
    let mut hasher = md5::Md5::new();
    hasher.update(input.as_bytes());
    let result = hasher.finalize();
    format!("{:x}", result)
}

/// Get the thumbnail cache directory under app data.
fn cache_dir(app: &tauri::AppHandle) -> PathBuf {
    let base = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir());
    let dir = base.join("thumbnails");
    std::fs::create_dir_all(&dir).ok();
    dir
}

/// Prune cache to stay under MAX_CACHE_SIZE_BYTES. LRU by access time.
fn prune_cache(cache_dir: &PathBuf) {
    let mut entries: Vec<(std::time::SystemTime, u64, PathBuf)> = Vec::new();
    if let Ok(read) = std::fs::read_dir(cache_dir) {
        for entry in read.flatten() {
            if let Ok(meta) = entry.metadata() {
                let atime = meta.accessed().unwrap_or(std::time::SystemTime::UNIX_EPOCH);
                entries.push((atime, meta.len(), entry.path()));
            }
        }
    }
    let total: u64 = entries.iter().map(|(_, s, _)| *s).sum();
    if total <= MAX_CACHE_SIZE_BYTES {
        return;
    }
    // Sort by access time ascending (oldest first)
    entries.sort_by_key(|(t, _, _)| *t);
    let mut remaining = total;
    for (_, size, path) in &entries {
        if remaining <= MAX_CACHE_SIZE_BYTES {
            break;
        }
        if std::fs::remove_file(path).is_ok() {
            remaining -= size;
        }
    }
}

/// Check if a file extension is a supported image format.
pub fn is_image_file(name: &str) -> bool {
    let ext = name.rsplit('.').next().unwrap_or("").to_lowercase();
    IMAGE_EXTENSIONS.contains(&ext.as_str())
}

/// Generate a thumbnail for an image file and return as base64 JPEG string.
/// Returns None for non-images or on error.
#[tauri::command]
pub fn get_thumbnail(
    app: tauri::AppHandle,
    path: String,
    width: Option<u32>,
) -> Result<Option<String>, String> {
    let file_path = std::path::Path::new(&path);
    if !file_path.exists() || file_path.is_dir() {
        return Ok(None);
    }

    let name = file_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    if !is_image_file(&name) {
        return Ok(None);
    }

    let meta = std::fs::metadata(file_path).map_err(|e| e.to_string())?;
    let size = meta.len();
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let key = cache_key(&path, mtime, size);
    let cdir = cache_dir(&app);
    let cache_file = cdir.join(format!("{}.jpg", key));

    // Return cached thumbnail if it exists
    if cache_file.exists() {
        if let Ok(bytes) = std::fs::read(&cache_file) {
            let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
            // Touch the file to update access time for LRU
            let _ = std::fs::File::open(&cache_file)
                .and_then(|f| f.set_modified(std::time::SystemTime::now()));
            return Ok(Some(format!("data:image/jpeg;base64,{}", b64)));
        }
    }

    // Generate thumbnail using the image crate
    let max_w = width.unwrap_or(128);
    let img = image::open(file_path).map_err(|e| format!("image open: {}", e))?;

    let (orig_w, orig_h) = (img.width(), img.height());
    if orig_w == 0 || orig_h == 0 {
        return Ok(None);
    }

    let ratio = max_w as f32 / orig_w as f32;
    let new_h = (orig_h as f32 * ratio).max(1.0) as u32;

    let resized = img.resize(max_w, new_h, image::imageops::FilterType::Triangle);

    // Encode to JPEG into a buffer
    let mut buf: Vec<u8> = Vec::new();
    let cursor = Cursor::new(&mut buf);
    let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(cursor, 75);
    resized
        .write_with_encoder(encoder)
        .map_err(|e| format!("jpeg encode: {}", e))?;

    // Write to cache
    std::fs::write(&cache_file, &buf).ok();

    // Prune if needed
    prune_cache(&cdir);

    let b64 = base64::engine::general_purpose::STANDARD.encode(&buf);
    Ok(Some(format!("data:image/jpeg;base64,{}", b64)))
}
