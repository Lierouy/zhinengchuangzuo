// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { SettingsProvider } from '../../contexts/settings-context'
import type { ZhinengchuangzuoSettings } from '../../settings/schema/setting.types'
import { makeTFile } from '../../test/fakes/fakeApp'
import type { Mentionable } from '../../types/mentionable'

import MentionableBadge from './MentionableBadge'

const settings: ZhinengchuangzuoSettings = {
  version: 17,
  providers: [],
  chatModels: [],
  chatModelId: '',
  selectedPromptGroupId: '',
  promptActivationLimit: null,
  handlePromptId: '',
  chatOptions: { includeCurrentFileContent: true },
}

const withSettings = (
  children: ReactNode,
  setSettings: (next: ZhinengchuangzuoSettings) => void = vi.fn(),
) => (
  <SettingsProvider
    settings={settings}
    setSettings={setSettings}
    addSettingsChangeListener={() => () => {}}
  >
    {children}
  </SettingsProvider>
)

const badgeOf = (container: HTMLElement): HTMLElement => {
  const badge = container.querySelector<HTMLElement>(
    '.zncz-chat-user-input-file-badge',
  )
  if (!badge) throw new Error('badge was not rendered')
  return badge
}

const renderBadge = (mentionable: Mentionable) => {
  const onDelete = vi.fn()
  const onClick = vi.fn()
  const utils = render(
    withSettings(
      <MentionableBadge
        mentionable={mentionable}
        onDelete={onDelete}
        onClick={onClick}
      />,
    ),
  )
  return { ...utils, onDelete, onClick }
}

describe('MentionableBadge', () => {
  it('shows a file badge and forwards clicks', () => {
    const { container, onClick } = renderBadge({
      type: 'file',
      file: makeTFile('notes/a.md'),
      path: 'notes/a.md',
    })

    expect(screen.getByText('a.md')).toBeInTheDocument()
    fireEvent.click(badgeOf(container))

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('deletes without also triggering the badge click', () => {
    const { container, onClick, onDelete } = renderBadge({
      type: 'file',
      file: makeTFile('notes/a.md'),
      path: 'notes/a.md',
    })

    const deleteButton = container.querySelector<HTMLElement>(
      '.zncz-chat-user-input-file-badge-delete',
    )
    if (!deleteButton) throw new Error('delete control was not rendered')
    fireEvent.click(deleteButton)

    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('marks the focused badge', () => {
    const { container } = render(
      withSettings(
        <MentionableBadge
          mentionable={{
            type: 'file',
            file: makeTFile('notes/a.md'),
            path: 'notes/a.md',
          }}
          isFocused
          onDelete={vi.fn()}
          onClick={vi.fn()}
        />,
      ),
    )

    expect(badgeOf(container)).toHaveClass(
      'zncz-chat-user-input-file-badge-focused',
    )
  })

  it('renders block excerpts with their line range', () => {
    renderBadge({
      type: 'block',
      content: 'excerpt',
      file: makeTFile('notes/a.md'),
      path: 'notes/a.md',
      startLine: 2,
      endLine: 4,
    })

    expect(screen.getByText('a.md')).toBeInTheDocument()
    expect(screen.getByText('(2-4)')).toBeInTheDocument()
  })

  it('renders image badges by name', () => {
    renderBadge({
      type: 'image',
      name: 'cat.png',
      mimeType: 'image/png',
      data: 'AAA',
    })

    expect(screen.getByText('cat.png')).toBeInTheDocument()
  })

  it('falls back to the path for a missing folder', () => {
    renderBadge({ type: 'folder', folder: null, path: 'notes/sub' })

    expect(screen.getByText('sub')).toBeInTheDocument()
  })

  it('toggles whether the current file is included', () => {
    const setSettings = vi.fn()
    const onClick = vi.fn()
    const { container } = render(
      withSettings(
        <MentionableBadge
          mentionable={{ type: 'current-file', file: makeTFile('note.md') }}
          onDelete={vi.fn()}
          onClick={onClick}
        />,
        setSettings,
      ),
    )

    expect(screen.getByText('note.md')).toBeInTheDocument()
    expect(screen.getByText(/自动/)).toBeInTheDocument()

    const eye = container.querySelector<HTMLElement>(
      '.zncz-chat-user-input-file-badge-eye',
    )
    if (!eye) throw new Error('current-file toggle was not rendered')
    fireEvent.click(eye)

    expect(setSettings).toHaveBeenCalledWith({
      ...settings,
      chatOptions: { includeCurrentFileContent: false },
    })
    expect(onClick).not.toHaveBeenCalled()
  })

  it('renders nothing when there is no current file', () => {
    const { container } = render(
      withSettings(
        <MentionableBadge
          mentionable={{ type: 'current-file', file: null }}
          onDelete={vi.fn()}
          onClick={vi.fn()}
        />,
      ),
    )

    expect(
      container.querySelector('.zncz-chat-user-input-file-badge'),
    ).toBeNull()
  })
})
