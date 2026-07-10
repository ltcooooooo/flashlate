<script setup lang="ts">
const model = defineModel<boolean>({ required: true })
defineProps<{ disabled?: boolean }>()
</script>

<template>
  <label
    class="toggle"
    :class="{ disabled }"
    :data-state="model ? 'on' : 'off'"
    role="switch"
    :aria-checked="model"
    :aria-disabled="disabled || undefined"
  >
    <span class="track">
      <span class="thumb"></span>
    </span>
    <!-- 隐藏原生 checkbox：保留无障碍语义、可被 label 点击触发 v-model -->
    <input v-model="model" type="checkbox" :disabled="disabled" />
  </label>
</template>

<style scoped>
.toggle {
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
  flex-shrink: 0;
  cursor: pointer;
  -webkit-user-select: none;
  user-select: none;
}
.toggle.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
/* input 仅承载状态：完全不可见但仍可触发 v-model 切换 */
.toggle input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: inherit;
  z-index: 0;
}
.track {
  position: absolute;
  inset: 0;
  background: var(--c-border);
  border-radius: 20px;
  transition: background 0.2s ease;
  z-index: 1;
}
.thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background: #fff;
  border-radius: 50%;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.25);
  transition: transform 0.2s ease;
  z-index: 2;
}
.toggle[data-state='on'] .track {
  background: var(--c-primary);
}
.toggle[data-state='on'] .thumb {
  transform: translateX(16px);
}
</style>
