import { TextAreaComponent } from 'obsidian'
import { useEffect, useRef } from 'react'

import {
  ObsidianComponentFactory,
  useObsidianComponent,
} from './useObsidianComponent'

const TEXT_AREA_FACTORY: ObsidianComponentFactory<TextAreaComponent> = {
  addToSetting: (setting, register) => setting.addTextArea(register),
  create: (container) => new TextAreaComponent(container),
  dispose: (textArea) => textArea.inputEl.remove(),
}

type ObsidianTextAreaProps = {
  value: string
  placeholder?: string
  onChange: (value: string) => void
}

export function ObsidianTextArea({
  value,
  placeholder,
  onChange,
}: ObsidianTextAreaProps) {
  const { containerRef, component: textArea } =
    useObsidianComponent(TEXT_AREA_FACTORY)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!textArea) return
    textArea.onChange((v) => onChangeRef.current(v))
  }, [textArea])

  useEffect(() => {
    if (!textArea) return
    if (placeholder) textArea.setPlaceholder(placeholder)
    textArea.setValue(value)
  }, [textArea, value, placeholder])

  return <div ref={containerRef} />
}
