// @vitest-environment happy-dom
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ObsidianNumberInput } from './ObsidianNumberInput'

const inputOf = (container: HTMLElement): HTMLInputElement => {
  const input = container.querySelector('input')
  if (!input) throw new Error('number input was not mounted')
  return input
}

/**
 * happy-dom sanitizes values typed into `type="number"` fields (invalid input
 * becomes ''), which would hide the component's own parsing guard. Switching the
 * field to text keeps the raw value so the guard itself is exercised.
 */
const typeRaw = (input: HTMLInputElement, value: string): void => {
  input.type = 'text'
  fireEvent.input(input, { target: { value } })
}

describe('ObsidianNumberInput', () => {
  it('renders an empty field for nullish values', () => {
    const { container } = render(
      <ObsidianNumberInput value={null} onChange={vi.fn()} />,
    )
    expect(inputOf(container).value).toBe('')

    const { container: second } = render(
      <ObsidianNumberInput value={undefined} onChange={vi.fn()} />,
    )
    expect(inputOf(second).value).toBe('')
  })

  it('emits undefined when the field is cleared', () => {
    const onChange = vi.fn()
    const { container } = render(
      <ObsidianNumberInput value={5} onChange={onChange} />,
    )

    typeRaw(inputOf(container), '   ')

    expect(onChange).toHaveBeenCalledWith(undefined)
  })

  it('parses numbers and trims whitespace', () => {
    const onChange = vi.fn()
    const { container } = render(
      <ObsidianNumberInput value={null} onChange={onChange} />,
    )

    typeRaw(inputOf(container), ' 42.5 ')

    expect(onChange).toHaveBeenCalledWith(42.5)
  })

  it('truncates to an integer when requested', () => {
    const onChange = vi.fn()
    const { container } = render(
      <ObsidianNumberInput value={null} integer onChange={onChange} />,
    )

    typeRaw(inputOf(container), '42.9')

    expect(onChange).toHaveBeenCalledWith(42)
  })

  it('ignores values that do not parse', () => {
    const onChange = vi.fn()
    const { container } = render(
      <ObsidianNumberInput value={null} onChange={onChange} />,
    )

    typeRaw(inputOf(container), 'not a number')

    expect(onChange).not.toHaveBeenCalled()
  })

  it('ignores values rejected by the accept predicate', () => {
    const onChange = vi.fn()
    const { container } = render(
      <ObsidianNumberInput
        value={null}
        accept={(value) => value > 0}
        onChange={onChange}
      />,
    )

    typeRaw(inputOf(container), '-1')
    expect(onChange).not.toHaveBeenCalled()

    typeRaw(inputOf(container), '1')
    expect(onChange).toHaveBeenCalledWith(1)
  })
})
