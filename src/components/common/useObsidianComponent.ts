import { Setting } from 'obsidian'
import { useEffect, useRef, useState } from 'react'

import { useObsidianSetting } from './ObsidianSetting'

/**
 * Describes how to mount an Obsidian UI component `C`, either inside the
 * surrounding `Setting` row or standalone in the wrapper element.
 */
export type ObsidianComponentFactory<C> = {
  addToSetting: (setting: Setting, register: (component: C) => void) => void
  create: (container: HTMLElement) => C
  dispose: (component: C) => void
}

/**
 * Mounts an Obsidian component and exposes it once it is ready.
 * Attach `containerRef` to the wrapper element (used in standalone mode).
 */
export function useObsidianComponent<C>(factory: ObsidianComponentFactory<C>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { setting } = useObsidianSetting()
  const [component, setComponent] = useState<C | null>(null)
  // Stored in a ref so callers may pass a new object literal on every render
  // without re-mounting the underlying component.
  const factoryRef = useRef(factory)

  useEffect(() => {
    const { addToSetting, create, dispose } = factoryRef.current
    const created: { current: C | null } = { current: null }
    if (setting) {
      addToSetting(setting, (component) => {
        created.current = component
      })
    } else if (containerRef.current) {
      created.current = create(containerRef.current)
    }

    const target = created.current
    if (!target) return

    setComponent(target)
    return () => dispose(target)
  }, [setting])

  return { containerRef, component }
}
