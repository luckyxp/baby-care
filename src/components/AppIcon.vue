<!-- =======================================================================
  统一图标入口：Lucide 24px 网格；只引入实际使用的图标，避免整库打包。
======================================================================= -->
<script setup lang="ts">
import { computed } from 'vue'
import {
  Baby, Bell, BookOpen, CalendarDays, ChartNoAxesColumn, Check, ChevronDown,
  ChevronLeft, ChevronRight, ChevronUp, ClipboardList, Copy, Droplets, Ellipsis,
  Eye, FileText, Footprints, Hand, Heart, House, Library, MessageCircle, Mic,
  Milk, Moon, Pencil, Pill, Plus, Repeat, Ruler, Sun, Thermometer, Toilet, Trash2,
  UserRound, UsersRound, Utensils, X,
} from '@lucide/vue'

const props = withDefaults(defineProps<{ name: string | null; size?: number | string; strokeWidth?: number }>(), { size: 22, strokeWidth: 1.8 })
const icons = {
  milk: Milk, solid: Utensils, diaper: Toilet, sleep: Moon, temp: Thermometer,
  medicine: Pill, supplement: Pill, water: Droplets, growth: Ruler, other: FileText,
  gross: Footprints, fine: Hand, sensory: Eye, language: MessageCircle, social: Heart,
  baby: Baby, sun: Sun, moon: Moon, voice: Mic, home: House, plan: CalendarDays,
  report: ClipboardList, stats: ChartNoAxesColumn, user: UserRound, bell: Bell,
  library: Library, template: FileText, book: BookOpen, more: Ellipsis, edit: Pencil,
  delete: Trash2, copy: Copy, plus: Plus, close: X, check: Check,
  repeat: Repeat,
  down: ChevronDown, up: ChevronUp, left: ChevronLeft, right: ChevronRight, family: UsersRound,
}
const icon = computed(() => icons[props.name as keyof typeof icons] ?? FileText)
</script>

<template>
  <component :is="icon" :size="Number(size)" :stroke-width="strokeWidth" aria-hidden="true" />
</template>
