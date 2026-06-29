import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";

export interface LanDevice {
  device_id: string;
  name: string;
  ip: string;
  port: number;
  http_port: number;
  endpoint_kind: string;
  last_seen_secs_ago: number;
  is_online: boolean;
  paired: boolean;
  inbound: boolean;
}

export interface PairingResponse {
  success: boolean;
  message: string;
  device_id?: string;
}

export const useLanStore = defineStore("lan", () => {
  const devices = ref<LanDevice[]>([]);
  const scanning = ref(false);
  const error = ref<string | null>(null);
  const pairingTargetId = ref<string | null>(null);

  const onlineDevices = computed(() =>
    devices.value.filter((d) => d.is_online && !d.paired)
  );
  const pairedDevices = computed(() =>
    devices.value.filter((d) => d.paired)
  );
  const offlineDevices = computed(() =>
    devices.value.filter((d) => !d.is_online && !d.paired)
  );

  async function startScan() {
    error.value = null;
    try {
      await invoke("lan_start_scan");
      scanning.value = true;
    } catch (e: unknown) {
      error.value = typeof e === "string" ? e : (e as Error)?.message ?? "启动扫描失败";
      scanning.value = false;
    }
  }

  async function stopScan() {
    error.value = null;
    try {
      await invoke("lan_stop_scan");
    } catch (e: unknown) {
      error.value = typeof e === "string" ? e : (e as Error)?.message ?? "停止扫描失败";
    } finally {
      scanning.value = false;
      devices.value = [];
    }
  }

  async function refreshDevices() {
    error.value = null;
    try {
      const list = (await invoke<LanDevice[]>("lan_devices")) as LanDevice[];
      devices.value = list ?? [];
    } catch (e: unknown) {
      error.value = typeof e === "string" ? e : (e as Error)?.message ?? "获取设备列表失败";
    }
  }

  async function pairDevice(deviceId: string, pin: string) {
    error.value = null;
    pairingTargetId.value = deviceId;
    try {
      const resp = (await invoke<PairingResponse>("lan_pair_device", {
        deviceId,
        pin,
      })) as PairingResponse;
      if (!resp.success) {
        error.value = resp.message ?? "配对失败";
      }
      await refreshDevices();
      return resp;
    } catch (e: unknown) {
      error.value = typeof e === "string" ? e : (e as Error)?.message ?? "请求配对失败";
      return {
        success: false as const,
        message: error.value,
        device_id: deviceId,
      };
    } finally {
      pairingTargetId.value = null;
    }
  }

  return {
    devices,
    scanning,
    error,
    pairingTargetId,
    onlineDevices,
    pairedDevices,
    offlineDevices,
    startScan,
    stopScan,
    refreshDevices,
    pairDevice,
  };
});
