import { ref } from 'vue'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: number
  message: string
  type: ToastType
  duration: number
}

const toasts = ref<Toast[]>([])
let nextId = 0

function show(message: string, type: ToastType = 'info', duration = 3000) {
  const id = nextId++
  const toast: Toast = { id, message, type, duration }
  toasts.value = [...toasts.value, toast]

  if (duration > 0) {
    setTimeout(() => {
      dismiss(id)
    }, duration)
  }

  return id
}

function dismiss(id: number) {
  toasts.value = toasts.value.filter((t) => t.id !== id)
}

function success(message: string, duration?: number) {
  return show(message, 'success', duration)
}

function error(message: string, duration?: number) {
  return show(message, 'error', duration ?? 5000)
}

function warning(message: string, duration?: number) {
  return show(message, 'warning', duration ?? 4000)
}

function info(message: string, duration?: number) {
  return show(message, 'info', duration)
}

export function useToast() {
  return {
    toasts,
    show,
    dismiss,
    success,
    error,
    warning,
    info,
  }
}
