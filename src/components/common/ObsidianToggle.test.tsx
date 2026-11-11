// @vitest-environment happy-dom
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ObsidianToggle } from './ObsidianToggle'

const toggleOf = (container: HTMLElement): HTMLInputElement => {
  const input = container.querySelector('input')
  if (!input) throw new Error('toggle was not mounted')
  return input
}

describe('ObsidianToggle', () => {
  it('reflects the controlled value', () => {
    const { container, rerender } = render(
      <ObsidianToggle value={false} onChange={vi.fn()} />,
    )
    expect(toggleOf(container).checked).toBe(false)

    rerender(<ObsidianToggle value onChange={vi.fn()} />)

    expect(toggleOf(container).checked).toBe(true)
  })

  it('reports the next value on change', () => {
    const onChange = vi.fn()
    const { container } = render(
      <ObsidianToggle value={false} onChange={onChange} />,
    )

    fireEvent.change(toggleOf(container), { target: { checked: true } })

    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('always calls the latest handler', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { container, rerender } = render(
      <ObsidianToggle value={false} onChange={first} />,
    )

    rerender(<ObsidianToggle value={false} onChange={second} />)
    fireEvent.change(toggleOf(container), { target: { checked: true } })

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith(true)
  })
})
