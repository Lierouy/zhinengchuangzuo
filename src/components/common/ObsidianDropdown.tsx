import { DropdownComponent } from 'obsidian'
import { useEffect, useRef } from 'react'

import {
  ObsidianComponentFactory,
  useObsidianComponent,
} from './useObsidianComponent'

const DROPDOWN_FACTORY: ObsidianComponentFactory<DropdownComponent> = {
  addToSetting: (setting, register) => setting.addDropdown(register),
  create: (container) => new DropdownComponent(container),
  dispose: (dropdown) => dropdown.selectEl.remove(),
}

type ObsidianDropdownProps<T extends string = string> = {
  value: T
  options: Record<string, string>
  onChange: (value: T) => void
}

export function ObsidianDropdown<T extends string = string>({
  value,
  options,
  onChange,
}: ObsidianDropdownProps<T>) {
  const { containerRef, component: dropdown } =
    useObsidianComponent(DROPDOWN_FACTORY)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!dropdown) return
    dropdown.onChange((v) => onChangeRef.current(v as T))
  }, [dropdown])

  useEffect(() => {
    if (!dropdown) return
    dropdown.selectEl.empty()
    dropdown.addOptions(options)
    dropdown.setValue(value)
  }, [dropdown, options, value])

  return <div ref={containerRef} />
}
