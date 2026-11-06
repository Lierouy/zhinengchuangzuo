import { TextComponent } from 'obsidian'
import { useEffect, useRef } from 'react'

import {
  ObsidianComponentFactory,
  useObsidianComponent,
} from './useObsidianComponent'

const TEXT_INPUT_FACTORY: ObsidianComponentFactory<TextComponent> = {
  addToSetting: (setting, register) => setting.addText(register),
  create: (container) => new TextComponent(container),
  dispose: (text) => text.inputEl.remove(),
}

type ObsidianTextInputProps = {
  value: string
  placeholder?: string
  onChange: (value: string) => void
  type?: 'text' | 'number'
  maxLength?: number
}

export function ObsidianTextInput({
  value,
  placeholder,
  onChange,
  type,
  maxLength,
}: ObsidianTextInputProps) {
  const { containerRef, component: textInput } =
    useObsidianComponent(TEXT_INPUT_FACTORY)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!textInput) return
    textInput.onChange((v) => onChangeRef.current(v))
  }, [textInput])

  useEffect(() => {
    if (!textInput) return
    textInput.setValue(value)
    if (placeholder) textInput.setPlaceholder(placeholder)
    // Imperative Obsidian component: writing to its DOM element is the
    // intended API here, not a React state mutation.
    // eslint-disable-next-line react-hooks/immutability
    if (type) textInput.inputEl.type = type
    if (maxLength === undefined) {
      textInput.inputEl.removeAttribute('maxlength')
    } else {
      textInput.inputEl.maxLength = maxLength
    }
  }, [textInput, value, placeholder, type, maxLength])

  return <div ref={containerRef} />
}
