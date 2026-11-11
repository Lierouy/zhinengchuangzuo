// @vitest-environment happy-dom
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ObsidianButton } from './ObsidianButton'

const buttonOf = (container: HTMLElement): HTMLButtonElement => {
  const button = container.querySelector('button')
  if (!button) throw new Error('button was not mounted')
  return button
}

describe('ObsidianButton', () => {
  it('applies text, icon, tooltip and variants', () => {
    const { container } = render(
      <ObsidianButton
        text="Send"
        icon="send"
        tooltip="Send message"
        cta
        onClick={vi.fn()}
      />,
    )

    const button = buttonOf(container)
    expect(button).toHaveTextContent('Send')
    expect(button).toHaveAttribute('data-icon', 'send')
    expect(button).toHaveAttribute('aria-label', 'Send message')
    expect(button).toHaveClass('mod-cta')
  })

  it('triggers the click handler', () => {
    const onClick = vi.fn()
    const { container } = render(
      <ObsidianButton text="Send" onClick={onClick} />,
    )

    fireEvent.click(buttonOf(container))

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('always calls the latest handler without remounting', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { container, rerender } = render(
      <ObsidianButton text="Send" onClick={first} />,
    )

    rerender(<ObsidianButton text="Send" onClick={second} />)
    fireEvent.click(buttonOf(container))

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('mirrors the disabled flag onto the element', () => {
    const { container, rerender } = render(
      <ObsidianButton text="Send" disabled onClick={vi.fn()} />,
    )
    expect(buttonOf(container).disabled).toBe(true)

    rerender(<ObsidianButton text="Send" onClick={vi.fn()} />)

    expect(buttonOf(container).disabled).toBe(false)
  })

  it('passes a warning variant through', () => {
    const { container } = render(
      <ObsidianButton text="Delete" warning onClick={vi.fn()} />,
    )

    expect(buttonOf(container)).toHaveClass('mod-warning')
  })
})
