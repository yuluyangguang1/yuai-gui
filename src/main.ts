import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { preloadCommonIcons } from "./utils/tabler-icons";

// Styles
import "./styles/variables.css";
import "./styles/design-system.css";
import "./styles/skins.css";
import "./styles/effects.css";
import "./styles/patterns.css";
import "./styles/components.css";

// 预加载常用 Tabler 图标（异步，不阻塞首屏）
preloadCommonIcons();

const app = createApp(App);
app.use(createPinia());

// 全局错误处理
app.config.errorHandler = (err, instance, info) => {
  console.error('[Vue Error]', err, info);
};
window.addEventListener('unhandledrejection', (e) => {
  console.error('[Unhandled Rejection]', e.reason);
});

app.mount("#app");
