<script setup lang="ts">
import { ref, shallowRef, computed, nextTick, onBeforeUnmount } from 'vue'
import Icon from './Icon.vue'

export interface SelectOption {
  value: string
  label: string
}

const props = withDefaults(
  defineProps<{
    options: SelectOption[]
    size?: 'sm' | 'md'
    ariaLabel?: string
  }>(),
  { size: 'md' }
)

const model = defineModel<string>({ required: true })

const open = ref(false)
const activeIndex = ref(-1)
const triggerRef = shallowRef<HTMLButtonElement | null>(null)
const menuRef = shallowRef<HTMLUListElement | null>(null)
const menuStyle = ref<Record<string, string>>({})

const selectedLabel = computed(
  () => props.options.find((o) => o.value === model.value)?.label ?? ''
)
const selectedIndex = computed(() => props.options.findIndex((o) => o.value === model.value))

function position(): void {
  const el = triggerRef.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const gap = 4
  const margin = 12
  const vh = window.innerHeight
  const spaceBelow = vh - r.bottom - margin
  const spaceAbove = r.top - margin
  const below = spaceBelow >= 160 || spaceBelow >= spaceAbove
  const maxH = Math.min(280, Math.max(96, below ? spaceBelow : spaceAbove))
  const minW = props.size === 'sm' ? 148 : r.width
  const width = Math.max(r.width, minW)
  let left = r.left
  if (left + width > window.innerWidth - margin) left = window.innerWidth - margin - width
  menuStyle.value = {
    position: 'fixed',
    left: `${Math.max(margin, left)}px`,
    width: `${width}px`,
    maxHeight: `${maxH}px`,
    ...(below ? { top: `${r.bottom + gap}px` } : { top: 'auto', bottom: `${vh - r.top + gap}px` })
  }
}

async function openMenu(): Promise<void> {
  if (open.value) return
  open.value = true
  activeIndex.value = selectedIndex.value >= 0 ? selectedIndex.value : 0
  await nextTick()
  position()
  scrollActiveIntoView()
  window.addEventListener('scroll', onScroll, true)
  window.addEventListener('resize', position)
  document.addEventListener('pointerdown', onDocPointer, true)
}

function closeMenu(): void {
  if (!open.value) return
  open.value = false
  window.removeEventListener('scroll', onScroll, true)
  window.removeEventListener('resize', position)
  document.removeEventListener('pointerdown', onDocPointer, true)
  triggerRef.value?.focus()
}

// 外部容器滚动时跟随触发按钮重新定位；菜单自身内部滚动忽略。
// 触发按钮被滚出可视区域才关闭。
function onScroll(e: Event): void {
  const t = e.target as Node
  if (menuRef.value && (menuRef.value === t || menuRef.value.contains(t))) return
  const r = triggerRef.value?.getBoundingClientRect()
  if (r && (r.bottom < 0 || r.top > window.innerHeight)) {
    closeMenu()
    return
  }
  position()
}

function toggle(): void {
  open.value ? closeMenu() : void openMenu()
}

function choose(i: number): void {
  const opt = props.options[i]
  if (!opt) return
  model.value = opt.value
  closeMenu()
}

function onDocPointer(e: PointerEvent): void {
  const t = e.target as Node
  if (triggerRef.value?.contains(t) || menuRef.value?.contains(t)) return
  closeMenu()
}

function scrollActiveIntoView(): void {
  nextTick(() => {
    const menu = menuRef.value
    if (!menu) return
    const item = menu.children[activeIndex.value] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  })
}

function onKeydown(e: KeyboardEvent): void {
  if (!open.value) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      void openMenu()
    }
    return
  }
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      activeIndex.value = Math.min(props.options.length - 1, activeIndex.value + 1)
      scrollActiveIntoView()
      break
    case 'ArrowUp':
      e.preventDefault()
      activeIndex.value = Math.max(0, activeIndex.value - 1)
      scrollActiveIntoView()
      break
    case 'Home':
      e.preventDefault()
      activeIndex.value = 0
      scrollActiveIntoView()
      break
    case 'End':
      e.preventDefault()
      activeIndex.value = props.options.length - 1
      scrollActiveIntoView()
      break
    case 'Enter':
    case ' ':
      e.preventDefault()
      choose(activeIndex.value)
      break
    case 'Escape':
      e.preventDefault()
      closeMenu()
      break
    case 'Tab':
      closeMenu()
      break
  }
}

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll, true)
  window.removeEventListener('resize', position)
  document.removeEventListener('pointerdown', onDocPointer, true)
})
</script>

<template>
  <div class="select" :class="`size-${size}`">
    <button
      ref="triggerRef"
      type="button"
      class="select-trigger"
      role="combobox"
      :aria-label="ariaLabel"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="toggle"
      @keydown="onKeydown"
    >
      <span class="select-value">{{ selectedLabel }}</span>
      <Icon
        name="chevronDown"
        :size="size === 'sm' ? 13 : 14"
        class="select-chevron"
        :class="{ rotated: open }"
      />
    </button>

    <Teleport to="body">
      <Transition name="select-pop">
        <ul
          v-if="open"
          ref="menuRef"
          class="select-menu"
          :class="`size-${size}`"
          role="listbox"
          :style="menuStyle"
        >
          <li
            v-for="(o, i) in options"
            :key="o.value"
            class="select-option"
            :class="{ active: i === activeIndex, selected: o.value === model }"
            role="option"
            :aria-selected="o.value === model"
            @click="choose(i)"
            @pointermove="activeIndex = i"
          >
            <span class="select-option-label">{{ o.label }}</span>
            <Icon v-if="o.value === model" name="check" :size="14" class="select-tick" />
          </li>
        </ul>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.select {
  display: inline-flex;
}
.size-md {
  flex: 1;
}

.select-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  font-family: var(--font);
  color: var(--c-text);
  background: var(--c-bg);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  outline: none;
  text-align: left;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}
.select-trigger:hover {
  border-color: var(--c-primary);
}
.select-trigger:focus-visible {
  border-color: var(--c-primary);
  box-shadow: 0 0 0 3px var(--c-primary-ring);
}
.select-value {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.select-chevron {
  flex-shrink: 0;
  color: var(--c-text-tertiary);
  transition: transform 0.18s ease;
}
.select-chevron.rotated {
  transform: rotate(180deg);
}

.size-sm .select-trigger {
  padding: 4px 6px 4px 8px;
  font-size: 12px;
  max-width: 104px;
}
.size-md .select-trigger {
  padding: 6px 8px 6px 10px;
  font-size: 13px;
}
</style>

<!-- 浮层菜单被 Teleport 到 body，须用全局样式 -->
<style>
.select-menu {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 50;
  list-style: none;
  margin: 0;
  padding: 4px;
  background: var(--c-bg);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-sm);
  box-shadow: var(--c-shadow);
  overflow-y: auto;
  overscroll-behavior: contain;
}
.select-menu.size-sm {
  font-size: 12px;
}
.select-menu.size-md {
  font-size: 13px;
}
.select-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 9px;
  border-radius: var(--radius-sm);
  color: var(--c-text);
  cursor: pointer;
}
.select-option-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.select-option.active {
  background: var(--c-bg-hover);
}
.select-option.selected {
  color: var(--c-primary);
  font-weight: 600;
}
.select-option.selected.active {
  background: var(--c-primary-light);
}
.select-tick {
  flex-shrink: 0;
  color: var(--c-primary);
}
.select-menu::-webkit-scrollbar {
  width: 6px;
}
.select-menu::-webkit-scrollbar-thumb {
  background: var(--c-border-strong);
  border-radius: 3px;
}

.select-pop-enter-active,
.select-pop-leave-active {
  transition:
    opacity 0.14s ease,
    transform 0.14s ease;
}
.select-pop-enter-from,
.select-pop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
@media (prefers-reduced-motion: reduce) {
  .select-pop-enter-active,
  .select-pop-leave-active {
    transition: none;
  }
}
</style>
