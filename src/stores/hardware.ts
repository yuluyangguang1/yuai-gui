import { defineStore } from "pinia";
import { ref, computed } from "vue";

export interface GpuInfo {
  vendor: string;
  renderer: string;
  name: string;
}

export const useHardwareStore = defineStore("hardware", () => {
  const gpu = ref<GpuInfo>({ vendor: "", renderer: "", name: "" });
  const cpuCores = ref(0);
  const ramGB = ref(0);
  const detected = ref(false);
  const detecting = ref(false);

  const gpuName = computed(() => gpu.value.name || gpu.value.renderer || "未知");
  const ramDisplay = computed(() =>
    ramGB.value > 0 ? `${ramGB.value} GB` : "未知"
  );
  const cpuDisplay = computed(() =>
    cpuCores.value > 0 ? `${cpuCores.value} 核` : "未知"
  );

  function detect() {
    if (detected.value || detecting.value) return;
    detecting.value = true;

    try {
      // GPU detection via WebGL
      try {
        const canvas = document.createElement("canvas");
        const gl = canvas.getContext("webgl") as WebGLRenderingContext | null;
        if (gl) {
          const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
          if (debugInfo) {
            gpu.value.vendor =
              gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || "";
            gpu.value.renderer =
              gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || "";
            gpu.value.name = gpu.value.renderer;
          } else {
            gpu.value.renderer = gl.getParameter(gl.RENDERER) || "";
            gpu.value.vendor = gl.getParameter(gl.VENDOR) || "";
            gpu.value.name = gpu.value.renderer;
          }
        }
      } catch {
        // WebGL not available
      }

      // CPU cores
      if (typeof navigator !== "undefined" && navigator.hardwareConcurrency) {
        cpuCores.value = navigator.hardwareConcurrency;
      }

      // RAM (approximate, Chromium only)
      if (typeof navigator !== "undefined" && "deviceMemory" in navigator) {
        ramGB.value = (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 0;
      }

      detected.value = true;
    } finally {
      detecting.value = false;
    }
  }

  return {
    gpu,
    cpuCores,
    ramGB,
    detected,
    detecting,
    gpuName,
    cpuDisplay,
    ramDisplay,
    detect,
  };
});
