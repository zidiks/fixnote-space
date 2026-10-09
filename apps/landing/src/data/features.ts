import CalendarCheck from '@lucide/astro/icons/calendar-check'
import FilePenLine from '@lucide/astro/icons/file-pen-line'
import FolderInput from '@lucide/astro/icons/folder-input'
import FolderTree from '@lucide/astro/icons/folder-tree'
import Headphones from '@lucide/astro/icons/headphones'
import Link from '@lucide/astro/icons/link'
import ListChecks from '@lucide/astro/icons/list-checks'
import Lock from '@lucide/astro/icons/lock'
import Mic from '@lucide/astro/icons/mic'
import Plug from '@lucide/astro/icons/plug'
import RefreshCw from '@lucide/astro/icons/refresh-cw'
import ScanText from '@lucide/astro/icons/scan-text'
import Search from '@lucide/astro/icons/search'
import Send from '@lucide/astro/icons/send'
import Sparkles from '@lucide/astro/icons/sparkles'
import Users from '@lucide/astro/icons/users'
import WandSparkles from '@lucide/astro/icons/wand-sparkles'
import WifiOff from '@lucide/astro/icons/wifi-off'

/**
 * Every feature page, in the order of the features index, with what is the same in every language:
 * its group, icon, colours, picture and plan. The words are in src/content/features/<lang>/<slug>.md.
 */
export const GROUPS = ['ai', 'capture', 'find', 'organize', 'together', 'privacy'] as const
export type Group = (typeof GROUPS)[number]

export interface FeatureInfo {
  group: Group
  icon: typeof Mic
  /** The icon square's gradient, top to bottom. */
  from: string
  to: string
  /** The picture on the page: a name in src/assets/shots/<lang>/. */
  media: string
  /** Free: works on the device. Pro: goes through our server. Both: works either way. */
  plan: 'free' | 'pro' | 'both'
}

export const FEATURES = {
  'ask-your-notes': {
    group: 'ai',
    icon: Sparkles,
    from: '#ff8a3d',
    to: '#e2531c',
    media: 'ai-dark',
    plan: 'both',
  },
  'ai-edits': {
    group: 'ai',
    icon: FilePenLine,
    from: '#bf5af2',
    to: '#8944ab',
    media: 'note-trip',
    plan: 'both',
  },
  'tidy-up': {
    group: 'ai',
    icon: WandSparkles,
    from: '#bf5af2',
    to: '#8944ab',
    media: 'tidy',
    plan: 'both',
  },
  mcp: {
    group: 'ai',
    icon: Plug,
    from: '#636366',
    to: '#3a3a3c',
    media: 'settings-ai',
    plan: 'free',
  },
  'voice-notes': {
    group: 'capture',
    icon: Mic,
    from: '#ff9f0a',
    to: '#ff6a00',
    media: 'voice',
    plan: 'free',
  },
  'call-summaries': {
    group: 'capture',
    icon: Headphones,
    from: '#ff9f0a',
    to: '#ff6a00',
    media: 'note-call',
    plan: 'both',
  },
  telegram: {
    group: 'capture',
    icon: Send,
    from: '#40a9ff',
    to: '#1c7ed6',
    media: 'settings-integrations',
    plan: 'pro',
  },
  'import-export': {
    group: 'capture',
    icon: FolderInput,
    from: '#8e8e93',
    to: '#48484a',
    media: 'settings-data',
    plan: 'free',
  },
  search: {
    group: 'find',
    icon: Search,
    from: '#40a9ff',
    to: '#1c7ed6',
    media: 'search',
    plan: 'free',
  },
  'text-in-images': {
    group: 'find',
    icon: ScanText,
    from: '#40a9ff',
    to: '#1c7ed6',
    media: 'search',
    plan: 'free',
  },
  'daily-notes': {
    group: 'organize',
    icon: CalendarCheck,
    from: '#34c759',
    to: '#248a3d',
    media: 'note-daily',
    plan: 'free',
  },
  folders: {
    group: 'organize',
    icon: FolderTree,
    from: '#8e8e93',
    to: '#48484a',
    media: 'folder',
    plan: 'free',
  },
  'checklists-and-tables': {
    group: 'organize',
    icon: ListChecks,
    from: '#34c759',
    to: '#248a3d',
    media: 'note-repair',
    plan: 'free',
  },
  sync: {
    group: 'together',
    icon: RefreshCw,
    from: '#40a9ff',
    to: '#1c7ed6',
    media: 'settings-general',
    plan: 'pro',
  },
  'shared-notes': {
    group: 'together',
    icon: Users,
    from: '#ff8a3d',
    to: '#e2531c',
    media: 'note-trip',
    plan: 'pro',
  },
  'share-links': {
    group: 'together',
    icon: Link,
    from: '#ff8a3d',
    to: '#e2531c',
    media: 'note-trip',
    plan: 'pro',
  },
  encryption: {
    group: 'privacy',
    icon: Lock,
    from: '#34c759',
    to: '#248a3d',
    media: 'settings-general',
    plan: 'both',
  },
  offline: {
    group: 'privacy',
    icon: WifiOff,
    from: '#636366',
    to: '#3a3a3c',
    media: 'settings-advanced',
    plan: 'free',
  },
} as const satisfies Record<string, FeatureInfo>

export type FeatureSlug = keyof typeof FEATURES
export const FEATURE_SLUGS = Object.keys(FEATURES) as FeatureSlug[]
