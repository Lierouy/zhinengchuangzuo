// @vitest-environment happy-dom
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ObsidianSetting } from './ObsidianSetting'
import { ObsidianTextInput } from './ObsidianTextInput'

const inputOf = (container: HTMLElement): HTMLInputElement => {
  const input = container.querySelector('input')
  if (!input) throw new Error('text input was not mounted')
  return input
}

describe('ObsidianTextInput', () => {
  it('applies the controlled value and input attributes', () => {
    const { container } = render(
      <ObsidianTextInput
        value="initial"
        placeholder="Type here"
        type="number"
        maxLength={12}
        onChange={vi.fn()}
      />,
    )

    const input = inputOf(container)
    expect(input.value).toBe('initial')
    expect(input.placeholder).toBe('Type here')
    expect(input.type).toBe('number')
    expect(input.maxLength).toBe(12)
  })

  it('reports typed values', () => {
    const onChange = vi.fn()
    const { container } = render(
      <ObsidianTextInput value="" onChange={onChange} />,
    )

    fireEvent.input(inputOf(container), { target: { value: 'next' } })

    expect(onChange).toHaveBeenCalledWith('next')
  })

  it('follows value updates from the parent', () => {
    const { container, rerender } = render(
      <ObsidianTextInput value="first" onChange={vi.fn()} />,
    )
    expect(inputOf(container).value).toBe('first')

    rerender(<ObsidianTextInput value="second" onChange={vi.fn()} />)

    expect(inputOf(container).value).toBe('second')
  })

  it('removes maxlength when the limit is cleared', () => {
    const { container, rerender } = render(
      <ObsidianTextInput value="" maxLength={5} onChange={vi.fn()} />,
    )
    expect(inputOf(container).hasAttribute('maxlength')).toBe(true)

    rerender(<ObsidianTextInput value="" onChange={vi.fn()} />)

    expect(inputOf(container).hasAttribute('maxlength')).toBe(false)
  })

  it('mounts inside an Obsidian Setting row', () => {
    const { container } = render(
      <ObsidianSetting name="Field">
        <ObsidianTextInput value="nested" onChange={vi.fn()} />
      </ObsidianSetting>,
    )

    const input = inputOf(container)
    expect(input.value).toBe('nested')
    // It must live in the Setting's control container, not the wrapper div.
    expect(input.closest('.setting-item')).not.toBeNull()
  })
})
