import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

export default {
  moduleType: 'other',
  preferredModuleType: 'apiTools',
  typeFlag: 'mocktoon',
  label: 'Mocktoon',
  icon: import('../assets/mocktoon.svg?raw'),
  iconPadding: 4,
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 24,
  isService: true,
  isTray: true,
  isOnlyRunOne: true,
  platform: ['Windows', 'macOS', 'Linux']
} as AppModuleItem
