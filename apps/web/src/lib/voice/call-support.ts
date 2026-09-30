import { useEffect, useState } from 'react'
import { usePlatform } from '../platform'

/** Whether this computer can record a call (the desktop app; macOS 14.2 or later). */
export function useCallSupport(): boolean {
  const platform = usePlatform()
  const [supported, setSupported] = useState(false)
  useEffect(() => {
    let live = true
    void platform.systemAudio
      ?.supported()
      .then((s) => live && setSupported(s))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [platform])
  return supported
}
