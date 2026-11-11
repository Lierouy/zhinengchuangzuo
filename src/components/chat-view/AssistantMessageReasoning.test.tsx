// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import AssistantMessageReasoning from './AssistantMessageReasoning'

vi.mock('./ObsidianMarkdown', () => ({
  ObsidianMarkdown: ({ content }: { content: string }) => (
    <div data-testid="markdown">{content}</div>
  ),
}))

const headerOf = (container: HTMLElement): HTMLElement => {
  const header = container.querySelector<HTMLElement>(
    '.zncz-assistant-reasoning-header',
  )
  if (!header) throw new Error('reasoning header was not rendered')
  return header
}

describe('AssistantMessageReasoning', () => {
  it('hides the reasoning until the header is clicked', () => {
    const { container } = render(
      <AssistantMessageReasoning reasoning="deep thought" />,
    )

    expect(screen.queryByTestId('markdown')).toBeNull()

    fireEvent.click(headerOf(container))
    expect(screen.getByTestId('markdown')).toHaveTextContent('deep thought')

    fireEvent.click(headerOf(container))
    expect(screen.queryByTestId('markdown')).toBeNull()
  })

  it('renders updated reasoning while expanded', () => {
    const { container, rerender } = render(
      <AssistantMessageReasoning reasoning="first" />,
    )
    fireEvent.click(headerOf(container))

    rerender(<AssistantMessageReasoning reasoning="second" />)

    expect(screen.getByTestId('markdown')).toHaveTextContent('second')
  })
})
