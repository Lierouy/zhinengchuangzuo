// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppProvider } from '../../contexts/app-context'
import { createFakeApp } from '../../test/fakes/fakeApp'
import type { ChatAssistantMessage, ChatUserMessage } from '../../types/chat'

import UserMessageItem from './UserMessageItem'

vi.mock('./ObsidianMarkdown', () => ({
  ObsidianMarkdown: ({ content }: { content: string }) => (
    <div data-testid="markdown">{content}</div>
  ),
}))

const writeText = vi.fn<() => Promise<void>>(async () => {})

const assistantMessage: ChatAssistantMessage = {
  role: 'assistant',
  content: 'an answer',
  id: 'a1',
}

const userMessage: ChatUserMessage = {
  role: 'user',
  content: null,
  promptContent: 'a question',
  id: 'u1',
  mentionables: [],
}

function renderItem(
  message: ChatAssistantMessage | ChatUserMessage,
  isLoading: boolean,
) {
  const { app } = createFakeApp()
  const onDelete = vi.fn<(id: string) => void>()
  const view = render(
    <AppProvider app={app}>
      <UserMessageItem
        message={message}
        isLoading={isLoading}
        onDelete={onDelete}
      />
    </AppProvider>,
  )
  return { ...view, onDelete }
}

const button = (label: string) =>
  screen.getByLabelText<HTMLButtonElement>(label)

const detailWrapper = (container: HTMLElement): HTMLElement => {
  const wrapper = container.querySelector<HTMLElement>('[aria-label="详情"]')
  if (!wrapper) throw new Error('the detail popover wrapper was not rendered')
  return wrapper
}

describe('UserMessageItem action buttons', () => {
  beforeEach(() => {
    writeText.mockClear()
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
  })

  it('leaves every action usable for a finished message', () => {
    const { container, onDelete } = renderItem(assistantMessage, false)

    expect(button('追加').disabled).toBe(false)
    expect(detailWrapper(container).style.pointerEvents).toBe('')
    expect(button('删除').disabled).toBe(false)
    expect(button('复制').disabled).toBe(false)

    fireEvent.click(button('删除'))
    expect(onDelete).toHaveBeenCalledWith('a1')

    fireEvent.click(button('复制'))
    expect(writeText).toHaveBeenCalledWith('an answer')
  })

  it('locks every action while the message is streaming', () => {
    const { container } = renderItem(assistantMessage, true)

    expect(button('追加').disabled).toBe(true)
    expect(button('删除').disabled).toBe(true)
    expect(button('复制').disabled).toBe(true)
    // The popover has no `disabled` prop, so it is neutralised with CSS instead.
    expect(detailWrapper(container).style.pointerEvents).toBe('none')

    fireEvent.click(button('复制'))
    expect(writeText).not.toHaveBeenCalled()
  })

  it('offers only delete and copy on a user message', () => {
    renderItem(userMessage, false)

    expect(screen.queryByLabelText('追加')).toBeNull()
    expect(screen.queryByLabelText('详情')).toBeNull()
    expect(button('删除').disabled).toBe(false)
    expect(button('复制').disabled).toBe(false)
  })
})
