import { APP_ICONS, type AppIcon, type SqlDriver } from '@fixnote/core'
import { kvStore } from './kv'
import { platform } from './platform'

/** The icon picked on this device (kv, per device); orange is the installed one. */
export const APP_ICON = 'appIcon'

const isAppIcon = (v: string | null): v is AppIcon => APP_ICONS.includes(v as AppIcon)

export async function appIconOf(db: SqlDriver): Promise<AppIcon> {
  const v = await kvStore(db).get(APP_ICON)
  return isAppIcon(v) ? v : 'orange'
}

/** Picks the icon: stored on this device and set on the running app. */
export async function setAppIcon(db: SqlDriver, icon: AppIcon) {
  await kvStore(db).set(APP_ICON, icon)
  await platform.appIcon?.(icon)
}

/** At launch: the installed icon is orange, so another choice is set again each time. */
export async function restoreAppIcon(db: SqlDriver) {
  if (!platform.appIcon) return
  const icon = await appIconOf(db)
  if (icon !== 'orange') await platform.appIcon(icon).catch(() => undefined)
}
