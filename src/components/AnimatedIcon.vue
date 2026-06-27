<template>
  <span
    class="animated-icon"
    :data-animation="animation"
    :style="{ width: size + 'px', height: size + 'px' }"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <svg
      :viewBox="icon.viewBox"
      :width="size"
      :height="size"
      fill="none"
      :stroke="color"
      :stroke-width="strokeWidth"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M0 0h24v24H0z" stroke="none" />
      <path
        v-for="(p, i) in icon.paths"
        :key="i"
        :d="p.d"
        :stroke="p.stroke"
        :fill="p.fill"
        :stroke-linecap="p.strokeLinecap"
        :stroke-linejoin="p.strokeLinejoin"
        :class="p.classes"
        :style="{ transformOrigin: 'center' }"
      />
    </svg>
  </span>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ANIMATED_ICONS, type AnimatedIconName } from '../utils/animatedIcons';

const props = withDefaults(defineProps<{
  name: AnimatedIconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}>(), {
  size: 20,
  color: 'currentColor',
  strokeWidth: 2,
});

const isHovered = ref(false);
const icon = ANIMATED_ICONS[props.name];
const animation = icon.animation;
</script>

<style scoped>
.animated-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.animated-icon svg {
  transition: all 0.3s ease;
}

/* Arrow Back */
.animated-icon[data-animation="arrow-back"]:hover svg {
  transform: translateX(-3px);
}

/* Arrow Forward */
.animated-icon[data-animation="arrow-forward"]:hover svg {
  transform: translateX(3px);
}

/* Star */
.animated-icon[data-animation="star"] .star-fill {
  opacity: 0;
  transform: scale(0.8);
  transform-origin: center;
  transition: all 0.3s ease;
}

.animated-icon[data-animation="star"]:hover .star-fill {
  opacity: 1;
  transform: scale(1);
}

.animated-icon[data-animation="star"]:hover .star-outline {
  transform: scale(1.1) rotate(-5deg);
  transform-origin: center;
  transition: all 0.3s ease;
}

/* Search */
.animated-icon[data-animation="search"]:hover svg {
  transform: scale(1.1);
}

/* Settings */
.animated-icon[data-animation="settings"]:hover svg {
  transform: rotate(90deg);
  transform-origin: center;
}

/* Close */
.animated-icon[data-animation="close"]:hover svg {
  transform: rotate(90deg);
  transform-origin: center;
}

/* Check */
.animated-icon[data-animation="check"]:hover svg {
  transform: scale(1.2);
  transform-origin: center;
}

/* Refresh */
.animated-icon[data-animation="refresh"]:hover svg {
  transform: rotate(180deg);
  transform-origin: center;
}

/* Loader */
.animated-icon[data-animation="loader"] svg {
  animation: icon-spin 1s linear infinite;
}

.animated-icon[data-animation="loader"]:hover svg {
  animation-duration: 0.5s;
}

@keyframes icon-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Folder */
.animated-icon[data-animation="folder"]:hover svg {
  transform: translateY(-2px);
}

/* File */
.animated-icon[data-animation="file"]:hover svg {
  transform: translateY(-2px) rotate(-3deg);
  transform-origin: center;
}
</style>
