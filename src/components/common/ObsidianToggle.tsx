import { ToggleComponent } from 'obsidian'
import { useEffect, useRef } from 'react'

import {
  ObsidianComponentFactory,
  useObsidianComponent,
} from './useObsidianComponent'

const TOGGLE_FACTORY: ObsidianComponentFactory<ToggleComponent> = {
  addToSetting: (setting, register) => setting.addToggle(register),
  create: (container) => new ToggleComponent(container),
  dispose: (toggle) => toggle.toggleEl.remove(),
}

type ObsidianToggleProps = {
  value: boolean
  onChange: (value: boolean) => void
}

export function ObsidianToggle({ value, onChange }: ObsidianToggleProps) {
  const { containerRef, component: toggle } =
    useObsidianComponent(TOGGLE_FACTORY)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!toggle) return
    toggle.onChange((v) => onChangeRef.current(v))
  }, [toggle])

  useEffect(() => {
    if (!toggle) return
    toggle.setValue(value)
  }, [toggle, value])

  return <div ref={containerRef} style={{ display: 'contents' }} />
}
