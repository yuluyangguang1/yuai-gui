/**
 * Stream Fetch — 参考 ChatGPT-Next-Web Tauri 流式桥
 * Rust reqwest + futures_util → event emitter → 前端 TransformStream
 */

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::{Emitter, Window};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StreamRequest {
    pub url: String,
    pub method: String,
    pub headers: HashMap<String, String>,
    pub body: Option<String>,
    pub request_id: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct ChunkPayload {
    pub request_id: String,
    pub chunk: Vec<u8>,
}

#[derive(Debug, Serialize, Clone)]
pub struct EndPayload {
    pub request_id: String,
    pub status: u16,
}

#[derive(Debug, Serialize, Clone)]
pub struct ErrorPayload {
    pub request_id: String,
    pub error: String,
}

/// Stream fetch command — makes HTTP request and emits chunks to frontend
#[tauri::command]
pub async fn stream_fetch(
    window: Window,
    request: StreamRequest,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    let event_name = "stream-response";
    let end_event = "stream-end";
    let error_event = "stream-error";

    let mut req_builder = match request.method.to_uppercase().as_str() {
        "post" => client.post(&request.url),
        "get" => client.get(&request.url),
        "put" => client.put(&request.url),
        "delete" => client.delete(&request.url),
        _ => client.get(&request.url),
    };

    // Add headers
    for (key, value) in &request.headers {
        req_builder = req_builder.header(key, value);
    }

    // Add body
    if let Some(body) = &request.body {
        req_builder = req_builder.body(body.clone());
    }

    // Execute request
    let response = req_builder.send().await.map_err(|e| {
        let err = format!("Request failed: {}", e);
        let _ = window.emit(error_event, ErrorPayload {
            request_id: request.request_id.clone(),
            error: err.clone(),
        });
        err
    })?;

    let status = response.status().as_u16();

    // Stream response body
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        match chunk {
            Ok(bytes) => {
                let _ = window.emit(event_name, ChunkPayload {
                    request_id: request.request_id.clone(),
                    chunk: bytes.to_vec(),
                });
            }
            Err(err) => {
                let _ = window.emit(error_event, ErrorPayload {
                    request_id: request.request_id.clone(),
                    error: format!("Stream error: {}", err),
                });
                return Err(format!("Stream error: {}", err));
            }
        }
    }

    // Signal end of stream
    let _ = window.emit(end_event, EndPayload {
        request_id: request.request_id,
        status,
    });

    Ok(())
}
