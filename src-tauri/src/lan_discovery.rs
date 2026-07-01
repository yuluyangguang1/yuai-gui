use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Instant;

use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LanDevice {
    pub device_id: String,
    pub name: String,
    pub ip: String,
    pub port: u16,
    pub http_port: u16,
    pub endpoint_kind: String,
    pub last_seen_secs_ago: u64,
    pub is_online: bool,
    pub paired: bool,
    pub inbound: bool,
}

#[derive(Debug, Default)]
pub struct LanDiscoveryState {
    devices: HashMap<String, (LanDevice, Instant)>,
    seen_nonces: HashMap<String, Instant>,
    scanning: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct StartScanRequest {
    pub bind_port: Option<u16>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PairingRequest {
    pub device_id: String,
    pub pin: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PairingResponse {
    pub success: bool,
    pub message: String,
    pub device_id: Option<String>,
}

type AppState = Mutex<Option<LanDiscoveryState>>;

#[derive(Debug, Default)]
pub struct LanDiscoveryService {
    state: AppState,
}

impl LanDiscoveryService {
    #[allow(dead_code)]
    pub fn new() -> Self {
        Self::default()
    }

    pub fn devices(&self) -> Vec<LanDevice> {
        let guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        let Some(state) = guard.as_ref() else { return Vec::new() };
        let now = Instant::now();
        let mut out: Vec<LanDevice> = state.devices.iter().map(|(_, (dev, seen))| {
            let mut d = dev.clone();
            d.last_seen_secs_ago = now.duration_since(*seen).as_secs();
            d.is_online = d.last_seen_secs_ago < 90;
            d
        }).collect();
        out.sort_by(|a, b| b.is_online.cmp(&a.is_online).then(a.last_seen_secs_ago.cmp(&b.last_seen_secs_ago)));
        out
    }

    pub fn start_scan(&self) {
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        let state = guard.get_or_insert_with(LanDiscoveryState::default);
        state.scanning = true;
    }

    pub fn stop_scan(&self) {
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(state) = guard.as_mut() {
            state.scanning = false;
            state.devices.clear();
            state.seen_nonces.clear();
        }
    }

    #[allow(dead_code)]
    pub fn upsert_device(&self, device: LanDevice) {
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        let state = guard.get_or_insert_with(LanDiscoveryState::default);
        state.devices.entry(device.device_id.clone()).and_modify(|(d, t)| {
            *d = device.clone();
            *t = Instant::now();
        }).or_insert((device, Instant::now()));
    }

    pub fn pair_device(&self, req: &PairingRequest) -> PairingResponse {
        let devices = self.devices();
        let target = devices.iter().find(|d| d.device_id == req.device_id).cloned();

        let Some(dev) = target else {
            return PairingResponse {
                success: false,
                message: "未找到该设备".to_string(),
                device_id: None,
            };
        };

        let expected = dev.device_id.chars().rev().take(6).collect::<String>();
        if req.pin != expected {
            return PairingResponse {
                success: false,
                message: "配对码不正确".to_string(),
                device_id: Some(req.device_id.clone()),
            };
        }

        {
            let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
            if let Some(state) = guard.as_mut() {
                if let Some((d, _)) = state.devices.get_mut(&req.device_id) {
                    d.paired = true;
                }
            }
        }

        PairingResponse {
            success: true,
            message: format!("已配对：{}", dev.name),
            device_id: Some(req.device_id.clone()),
        }
    }
}

#[tauri::command]
pub fn lan_start_scan(service: State<LanDiscoveryService>) -> Result<(), String> {
    service.start_scan();
    Ok(())
}

#[tauri::command]
pub fn lan_stop_scan(service: State<LanDiscoveryService>) -> Result<(), String> {
    service.stop_scan();
    Ok(())
}

#[tauri::command]
pub fn lan_devices(service: State<LanDiscoveryService>) -> Result<Vec<LanDevice>, String> {
    Ok(service.devices())
}

#[tauri::command]
pub fn lan_pair_device(
    service: State<LanDiscoveryService>,
    req: PairingRequest,
) -> Result<PairingResponse, String> {
    Ok(service.pair_device(&req))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct LanEndpointInfo {
    pub kind: String,
    pub label: String,
}

#[allow(dead_code)]
pub fn infer_endpoint_kind(http_port: u16) -> LanEndpointInfo {
    match http_port {
        8648 => LanEndpointInfo { kind: "web".into(), label: "Web UI".into() },
        8748 => LanEndpointInfo { kind: "desktop".into(), label: "Desktop".into() },
        other => LanEndpointInfo { kind: "custom".into(), label: format!("Custom:{}", other) },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn infer_web_and_desktop() {
        assert_eq!(infer_endpoint_kind(8648).kind, "web");
        assert_eq!(infer_endpoint_kind(8748).kind, "desktop");
        assert_eq!(infer_endpoint_kind(9999).kind, "custom");
    }
}
