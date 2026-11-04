import { ButtonComponent } from 'obsidian'
import { useEffect, useRef } from 'react'

import {
  ObsidianComponentFactory,
  useObsidianComponent,
} from './useObsidianComponent'

const BUTTON_FACTORY: ObsidianComponentFactory<ButtonComponent> = {
  addToSetting: (setting, register) => setting.addButton(register),
  create: (container) => new ButtonComponent(container),
  dispose: (button) => button.buttonEl.remove(),
}

type ObsidianButtonProps = {
  text?: string
  icon?: string
  tooltip?: string
  onClick: () => void
  cta?: boolean
  warning?: boolean
  disabled?: boolean
}

export function ObsidianButton({
  text,
  icon,
  tooltip,
  onClick,
  cta,
  warning,
  disabled,
}: ObsidianButtonProps) {
  const { containerRef, component: button } =
    useObsidianComponent(BUTTON_FACTORY)
  const onClickRef = useRef(onClick)

  useEffect(() => {
    onClickRef.current = onClick
  }, [onClick])

  useEffect(() => {
    if (!button) return
    button.onClick(() => onClickRef.current())
  }, [button])

  useEffect(() => {
    if (!button) return
    if (text) button.setButtonText(text)
    if (icon) button.setIcon(icon)
    if (tooltip) button.setTooltip(tooltip)
    if (cta) button.setCta()
    if (warning) button.setWarning()
    button.setDisabled(!!disabled)
  }, [button, text, icon, tooltip, cta, warning, disabled])

  return <div ref={containerRef} />
}
