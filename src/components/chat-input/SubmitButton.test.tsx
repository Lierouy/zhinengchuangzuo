// @vitest-environment happy-dom
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SubmitButton } from './SubmitButton'

const buttonOf = (container: HTMLElement): HTMLElement => {
  const button = container.querySelector<HTMLElement>(
    '.zncz-chat-user-input-submit-button',
  )
  if (!button) throw new Error('submit button was not rendered')
  return button
}

describe('SubmitButton', () => {
  it('submits on click', () => {
    const onClick = vi.fn()
    const { container } = render(<SubmitButton onClick={onClick} />)

    expect(buttonOf(container)).toHaveTextContent('发送')
    fireEvent.click(buttonOf(container))

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('aborts instead of submitting while loading', () => {
    const onClick = vi.fn()
    const onAbort = vi.fn()
    const { container } = render(
      <SubmitButton onClick={onClick} onAbort={onAbort} isLoading />,
    )

    expect(buttonOf(container)).toHaveTextContent('停止')
    fireEvent.click(buttonOf(container))

    expect(onAbort).toHaveBeenCalledTimes(1)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('does nothing while loading without an abort handler', () => {
    const onClick = vi.fn()
    const { container } = render(<SubmitButton onClick={onClick} isLoading />)

    fireEvent.click(buttonOf(container))

    expect(onClick).not.toHaveBeenCalled()
  })

  it('activates with Enter and Space', () => {
    const onClick = vi.fn()
    const { container } = render(<SubmitButton onClick={onClick} />)

    fireEvent.keyDown(buttonOf(container), { key: 'Enter' })
    fireEvent.keyDown(buttonOf(container), { key: ' ' })

    expect(onClick).toHaveBeenCalledTimes(2)
  })

  it('ignores other keys', () => {
    const onClick = vi.fn()
    const { container } = render(<SubmitButton onClick={onClick} />)

    fireEvent.keyDown(buttonOf(container), { key: 'a' })

    expect(onClick).not.toHaveBeenCalled()
  })
})
