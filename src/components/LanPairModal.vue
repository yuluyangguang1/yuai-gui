<template>
  <div class="lan-modal-backdrop" @click.self="$emit('cancel')">
    <div class="lan-modal">
      <div class="lan-modal__title">配对设备</div>
      <div class="lan-modal__body">
        <div class="lan-spec">
          <div class="lan-spec__name">{{ device.name }}</div>
          <div class="lan-spec__meta">{{ device.ip }}:{{ device.http_port }}</div>
        </div>

        <form
          class="lan-form"
          @submit.prevent="$emit('done')"
        >
          <label class="lan-label">
            <span>配对码</span>
            <input
              v-model="pin"
              inputmode="numeric"
              pattern="[0-9]*"
              maxlength="6"
              placeholder="输入 6 位配对码"
            />
          </label>
          <p v-if="deviceError" class="lan-error-text">{{ deviceError }}</p>
        </form>
      </div>
      <footer class="lan-modal__foot">
        <button class="lan-btn" type="button" @click="$emit('cancel')">取消</button>
        <button class="lan-btn lan-btn--primary" :disabled="!valid" @click="onPair">
          {{ loading ? '配对上…' : '确认配对' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { LanDevice } from "@/stores/useLanStore";

const LAN_PIN_LEN = 6;

const props = defineProps<{
  device: LanDevice;
  loading: boolean;
}>();

defineEmits<{ cancel: []; done: [] }>();

const pin = ref("");
const deviceError = ref("");

const valid = computed(() => pin.value.trim().length === LAN_PIN_LEN);

async function onPair() {
  deviceError.value = "";
  if (!valid.value) {
    deviceError.value = "请输入 6 位配对码";
    return;
  }
  const lanStore = (await import("@/stores/useLanStore")).useLanStore();
  const resp = await lanStore.pairDevice(props.device.device_id, pin.value.trim());
  if (resp.success) {
    pin.value = "";
  }
}
</script>

<style scoped>
.lan-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 20, 20, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 90;
  padding: 16px;
}

.lan-modal {
  width: min(520px, calc(100vw - 24px));
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, 14px);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.25);
  padding: 18px;
  color: var(--text-primary);
}

.lan-modal__title {
  font-family: var(--font-brush);
  font-size: 1.2rem;
  color: var(--accent);
}

.lan-modal__body {
  margin-top: 14px;
}

.lan-spec {
  padding: 10px 12px;
  border-radius: var(--radius-sm, 8px);
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
}

.lan-spec__name {
  font-size: 0.8rem;
}

.lan-spec__meta {
  font-size: var(--text-sm);
  color: var(--text-muted);
  margin-top: 4px;
}

.lan-form {
  margin-top: 14px;
}

.lan-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.lan-label input {
  appearance: none;
  border: 1px solid var(--border);
  background: var(--bg-primary);
  color: var(--text-primary);
  border-radius: var(--radius-sm, 8px);
  padding: 9px 10px;
  font-size: 0.9rem;
}

.lan-error-text {
  color: var(--vermilion-glow, #c8442a);
  font-size: 0.75rem;
  margin-top: 6px;
}

.lan-modal__foot {
  margin-top: 18px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.lan-btn {
  appearance: none;
  border: 1px solid var(--border);
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border-radius: var(--radius-sm, 8px);
  padding: 8px 14px;
  font-size: 0.8rem;
}

.lan-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.lan-btn--primary {
  background: var(--accent);
  color: #00140f;
  border-color: var(--accent);
}
</style>
