// @vitest-environment happy-dom
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ObsidianDropdown } from './ObsidianDropdown'

const selectOf = (container: HTMLElement): HTMLSelectElement => {
  const select = container.querySelector('select')
  if (!select) throw new Error('dropdown was not mounted')
  return select
}

describe('ObsidianDropdown', () => {
  it('renders the options and the controlled value', () => {
    const { container } = render(
      <ObsidianDropdown
        value="a"
        options={{ a: 'Alpha', b: 'Beta' }}
        onChange={vi.fn()}
      />,
    )

    const select = selectOf(container)
    expect(select.options).toHaveLength(2)
    expect(select.options[0].textContent).toBe('Alpha')
    expect(select.value).toBe('a')
  })

  it('reports the selected option', () => {
    const onChange = vi.fn()
    const { container } = render(
      <ObsidianDropdown
        value="a"
        options={{ a: 'Alpha', b: 'Beta' }}
        onChange={onChange}
      />,
    )

    fireEvent.change(selectOf(container), { target: { value: 'b' } })

    expect(onChange).toHaveBeenCalledWith('b')
  })

  it('replaces the option list instead of appending to it', () => {
    const { container, rerender } = render(
      <ObsidianDropdown
        value="a"
        options={{ a: 'Alpha', b: 'Beta' }}
        onChange={vi.fn()}
      />,
    )

    rerender(
      <ObsidianDropdown
        value="c"
        options={{ c: 'Gamma' }}
        onChange={vi.fn()}
      />,
    )

    const select = selectOf(container)
    expect(select.options).toHaveLength(1)
    expect(select.options[0].value).toBe('c')
  })

  it('always calls the latest handler', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { container, rerender } = render(
      <ObsidianDropdown value="a" options={{ a: 'A' }} onChange={first} />,
    )

    rerender(
      <ObsidianDropdown value="a" options={{ a: 'A' }} onChange={second} />,
    )
    fireEvent.change(selectOf(container), { target: { value: 'a' } })

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith('a')
  })
})
