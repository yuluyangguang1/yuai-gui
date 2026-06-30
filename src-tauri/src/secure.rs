use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use aes_gcm::aead::rand_core::RngCore;
use aes_gcm::aead::rand_core::OsRng;
use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;

static KEY_PATH: &str = "secure.key";
static DATA_PATH: &str = "secure.secrets.json";

#[derive(Debug, Serialize, Deserialize, Clone)]


#[derive(Debug, thiserror::Error)]
pub enum SecureError {
    #[error("密钥文件不存在，请重新初始化")]
    #[allow(dead_code)]
    KeyMissing,
    #[error("加解密失败: {0}")]
    CryptoError(String),
    #[error("IO 失败: {0}")]
    IoError(String),
    #[error("其它错误: {0}")]
    Other(String),
}

impl From<std::io::Error> for SecureError {
    fn from(e: std::io::Error) -> Self {
        SecureError::IoError(e.to_string())
    }
}

impl From<serde_json::Error> for SecureError {
    fn from(e: serde_json::Error) -> Self {
        SecureError::Other(e.to_string())
    }
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct SecretsJson {
    pub secrets: std::collections::BTreeMap<String, String>,
}

fn app_data_root() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_default()
        .join(".yuai")
}

fn key_path() -> PathBuf {
    app_data_root().join(KEY_PATH)
}

fn data_path() -> PathBuf {
    app_data_root().join(DATA_PATH)
}

pub fn load_or_create_key() -> Result<[u8; 32], SecureError> {
    let p = key_path();
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent)?;
    }
    if p.exists() {
        let mut buf = Vec::new();
        fs::File::open(p)?.read_to_end(&mut buf)?;
        if buf.len() != 32 {
            return Err(SecureError::CryptoError(format!(
                "key len {} != 32",
                buf.len()
            )));
        }
        let mut k = [0u8; 32];
        k.copy_from_slice(&buf);
        Ok(k)
    } else {
        let mut k = [0u8; 32];
        OsRng.fill_bytes(&mut k);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            fs::OpenOptions::new()
                .mode(0o600)
                .write(true)
                .create(true)
                .open(p)?
                .write_all(&k)?;
        }
        #[cfg(not(unix))]
        {
            fs::File::create(p)?.write_all(&k)?;
        }
        Ok(k)
    }
}

pub fn open_cipher() -> Result<Aes256Gcm, SecureError> {
    let k = load_or_create_key()?;
    let key = aes_gcm::Key::<Aes256Gcm>::from_slice(&k);
    Ok(Aes256Gcm::new(key))
}

#[tauri::command]
pub fn seal(plaintext: &str) -> Result<String, String> {
    let cipher = open_cipher().map_err(|e| e.to_string())?;
    // Manual nonce to avoid rand_core version conflict between rand 0.9 and aes-gcm 0.10
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| format!("加密失败: {}", e))?;
    let mut combined = nonce_bytes.to_vec();
    combined.extend(ciphertext);
    Ok(general_purpose::STANDARD.encode(combined))
}

#[tauri::command]
pub fn unseal(b64: &str) -> Result<String, String> {
    let raw = general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| format!("解码失败: {}", e))?;
    if raw.len() < 12 {
        return Err("数据太短".into());
    }
    let (nonce_bytes, body) = raw.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);
    let cipher = open_cipher().map_err(|e| e.to_string())?;
    let pt = cipher
        .decrypt(nonce, body.as_ref())
        .map_err(|e| format!("解密失败: {}", e))?;
    String::from_utf8(pt).map_err(|e| format!("UTF-8 解析失败: {}", e))
}

pub fn load_secrets() -> std::collections::BTreeMap<String, String> {
    match fs::read_to_string(data_path()) {
        Ok(raw) => match serde_json::from_str::<SecretsJson>(&raw) {
            Ok(json) => json.secrets,
            Err(_) => std::collections::BTreeMap::new(),
        },
        Err(_) => std::collections::BTreeMap::new(),
    }
}

pub fn save_secrets(
    secrets: std::collections::BTreeMap<String, String>,
) -> Result<(), SecureError> {
    let json = SecretsJson { secrets };
    let raw = serde_json::to_string_pretty(&json)?;
    let mut tmp = data_path();
    tmp.set_extension("json.tmp");
    fs::write(&tmp, raw)?;
    fs::rename(&tmp, data_path())?;
    Ok(())
}

#[tauri::command]
pub fn save_secret(key: String, value: String) -> Result<(), String> {
    let mut secrets = load_secrets();
    let encrypted = seal(&value)?;
    secrets.insert(key, encrypted);
    save_secrets(secrets).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_secret(key: String) -> Result<Option<String>, String> {
    let secrets = load_secrets();
    match secrets.get(&key) {
        Some(enc) => Ok(Some(unseal(enc)?)),
        None => Ok(None),
    }
}

#[tauri::command]
pub fn remove_secret(key: String) -> Result<(), String> {
    let mut secrets = load_secrets();
    secrets.remove(&key);
    save_secrets(secrets).map_err(|e| e.to_string())
}
