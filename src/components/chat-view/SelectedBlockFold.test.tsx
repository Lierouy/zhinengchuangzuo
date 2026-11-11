// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { makeTFile } from '../../test/fakes/fakeApp'
import type { MentionableBlock } from '../../types/mentionable'

import { SelectedBlockFold } from './SelectedBlockFold'

vi.mock('./ObsidianMarkdown', () => ({
  ObsidianMarkdown: ({ content }: { content: string }) => (
    <div data-testid="markdown">{content}</div>
  ),
}))

const blockOf = (
  overrides: Partial<MentionableBlock> = {},
): MentionableBlock => ({
  type: 'block',
  content: 'excerpt text',
  file: makeTFile('notes/a.md'),
  path: 'notes/a.md',
  startLine: 2,
  endLine: 4,
  ...overrides,
})

const headerOf = (container: HTMLElement): HTMLElement => {
  const header = container.querySelector<HTMLElement>(
    '.zncz-selected-block-header',
  )
  if (!header) throw new Error('block header was not rendered')
  return header
}

describe('SelectedBlockFold', () => {
  it('shows the file name and the line range', () => {
    render(<SelectedBlockFold block={blockOf()} />)

    expect(screen.getByText('a.md')).toBeInTheDocument()
    expect(screen.getByText('(2-4)')).toBeInTheDocument()
  })

  it('collapses a single-line range', () => {
    render(<SelectedBlockFold block={blockOf({ endLine: 2 })} />)

    expect(screen.getByText('(2)')).toBeInTheDocument()
  })

  it('expands and collapses the excerpt', () => {
    const { container } = render(<SelectedBlockFold block={blockOf()} />)
    expect(screen.queryByTestId('markdown')).toBeNull()

    fireEvent.click(headerOf(container))
    expect(screen.getByTestId('markdown')).toHaveTextContent('excerpt text')

    fireEvent.click(headerOf(container))
    expect(screen.queryByTestId('markdown')).toBeNull()
  })

  it('does not expand an empty excerpt', () => {
    const { container } = render(
      <SelectedBlockFold block={blockOf({ content: '' })} />,
    )

    fireEvent.click(headerOf(container))

    expect(screen.queryByTestId('markdown')).toBeNull()
  })

  it('falls back to the path when the file is gone', () => {
    render(
      <SelectedBlockFold
        block={blockOf({ file: null, path: 'folder/gone.md' })}
      />,
    )

    expect(screen.getByText('gone.md')).toBeInTheDocument()
  })
})
