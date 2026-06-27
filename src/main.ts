import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";

// Styles
import "./styles/variables.css";
import "./styles/design-system.css";
import "./styles/skins.css";
import "./styles/effects.css";
import "./styles/patterns.css";
import "./styles/components.css";

const app = createApp(App);
app.use(createPinia());
app.mount("#app");
