// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Notice } from '../../test/mocks/obsidian'

import { useEditableList } from './useEditableList'

const EMPTY_MESSAGE = 'Item cannot be empty'

const setup = (items: string[] = ['first', 'second']) => {
  const onChange = vi.fn()
  const hook = renderHook(() => useEditableList(items, onChange, EMPTY_MESSAGE))
  return { onChange, ...hook }
}

describe('useEditableList', () => {
  beforeEach(() => {
    Notice.messages.length = 0
  })

  it('starts an edit with the current value', () => {
    const { result } = setup()

    act(() => result.current.startEdit(1))

    expect(result.current.editingIndex).toBe(1)
    expect(result.current.editingValue).toBe('second')
    expect(result.current.isAdding).toBe(false)
  })

  it('commits a trimmed edit for that index only', () => {
    const { result, onChange } = setup()
    act(() => result.current.startEdit(1))
    act(() => result.current.setEditingValue('  updated  '))
    act(() => result.current.commitEdit())

    expect(onChange).toHaveBeenCalledWith(['first', 'updated'])
    expect(result.current.editingIndex).toBeNull()
  })

  it('refuses an empty edit and keeps the row open', () => {
    const { result, onChange } = setup()
    act(() => result.current.startEdit(0))
    act(() => result.current.setEditingValue('   '))
    act(() => result.current.commitEdit())

    expect(onChange).not.toHaveBeenCalled()
    expect(Notice.messages).toEqual([EMPTY_MESSAGE])
    expect(result.current.editingIndex).toBe(0)
  })

  it('cancels an edit without reporting a change', () => {
    const { result, onChange } = setup()
    act(() => result.current.startEdit(0))
    act(() => result.current.setEditingValue('ignored'))
    act(() => result.current.cancelEdit())

    expect(result.current.editingIndex).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('removes an item by index', () => {
    const { result, onChange } = setup()

    act(() => result.current.remove(0))

    expect(onChange).toHaveBeenCalledWith(['second'])
  })

  it('appends a trimmed new item', () => {
    const { result, onChange } = setup()
    act(() => result.current.startAdd())
    expect(result.current.isAdding).toBe(true)

    act(() => result.current.setNewValue('  third  '))
    act(() => result.current.commitAdd())

    expect(onChange).toHaveBeenCalledWith(['first', 'second', 'third'])
    expect(result.current.isAdding).toBe(false)
    expect(result.current.newValue).toBe('')
  })

  it('refuses an empty new item and keeps the form open', () => {
    const { result, onChange } = setup()
    act(() => result.current.startAdd())
    act(() => result.current.setNewValue('   '))
    act(() => result.current.commitAdd())

    expect(onChange).not.toHaveBeenCalled()
    expect(Notice.messages).toEqual([EMPTY_MESSAGE])
    expect(result.current.isAdding).toBe(true)
  })

  it('cancels the add form', () => {
    const { result } = setup()
    act(() => result.current.startAdd())
    act(() => result.current.setNewValue('draft'))
    act(() => result.current.cancelAdd())

    expect(result.current.isAdding).toBe(false)
    expect(result.current.newValue).toBe('')
  })

  it('does not open the add form while editing', () => {
    const { result } = setup()
    act(() => result.current.startEdit(0))
    act(() => result.current.startAdd())

    expect(result.current.isAdding).toBe(false)
  })
})
