import { App, SecretComponent } from 'obsidian'
import { useEffect, useMemo, useRef } from 'react'

import { useApp } from '../../contexts/app-context'

import {
  ObsidianComponentFactory,
  useObsidianComponent,
} from './useObsidianComponent'

/**
 * Wraps Obsidian's own secret picker so the value written to the settings is the
 * id of a storage entry instead of the secret itself. It is mounted through
 * `setting.addComponent` so its elements join the row's control area directly and
 * Obsidian lays them out exactly like any other settings control.
 */
export function createSecretPickerFactory(
  app: App,
): ObsidianComponentFactory<SecretComponent> {
  // `SecretComponent` builds its own children in the constructor, so the nodes it
  // added are recorded and removed on dispose. Without that the first instance
  // (created before the surrounding `Setting` exists, see `useObsidianComponent`)
  // would stay behind as a stray control in the row above.
  const created = new WeakMap<SecretComponent, Element[]>()

  const nodeSnapshot = (parent: HTMLElement) =>
    new Set<Element>(Array.from(parent.children))

  /** Records only the nodes the constructor added on top of `before`. */
  const track = (
    component: SecretComponent,
    parent: HTMLElement,
    before: Set<Element>,
  ) => {
    created.set(
      component,
      Array.from(parent.children).filter((node) => !before.has(node)),
    )
    return component
  }

  return {
    addToSetting: (setting, register) => {
      setting.addComponent((el) => {
        const before = nodeSnapshot(el)
        const component = new SecretComponent(app, el)
        track(component, el, before)
        register(component)
        return component
      })
    },
    create: (container) => {
      const before = nodeSnapshot(container)
      return track(new SecretComponent(app, container), container, before)
    },
    dispose: (component) => {
      for (const node of created.get(component) ?? []) node.remove()
      created.delete(component)
    },
  }
}

type ObsidianSecretPickerProps = {
  value: string
  onChange: (value: string) => void
}

export function ObsidianSecretPicker({
  value,
  onChange,
}: ObsidianSecretPickerProps) {
  const app = useApp()
  const factory = useMemo(() => createSecretPickerFactory(app), [app])
  const { containerRef, component } = useObsidianComponent(factory)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!component) return
    component.onChange((v) => onChangeRef.current(v ?? ''))
  }, [component])

  useEffect(() => {
    if (!component) return
    component.setValue(value)
  }, [component, value])

  return <div ref={containerRef} />
}
