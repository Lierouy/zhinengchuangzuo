import { Notice } from 'obsidian'
import { useState } from 'react'

/**
 * Inline add / edit / remove state for a list of non-empty strings.
 * `onChange` always receives the complete next list.
 */
export function useEditableList(
  items: string[],
  onChange: (items: string[]) => void,
  emptyMessage: string,
) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [newValue, setNewValue] = useState('')

  const startEdit = (index: number) => {
    setEditingIndex(index)
    setEditingValue(items[index])
    setIsAdding(false)
  }

  const commitEdit = () => {
    const trimmed = editingValue.trim()
    if (!trimmed) {
      new Notice(emptyMessage)
      return
    }
    onChange(items.map((item, i) => (i === editingIndex ? trimmed : item)))
    setEditingIndex(null)
  }

  const cancelEdit = () => setEditingIndex(null)

  const remove = (index: number) =>
    onChange(items.filter((_, i) => i !== index))

  const startAdd = () => {
    if (editingIndex !== null) return
    setIsAdding(true)
    setNewValue('')
  }

  const commitAdd = () => {
    const trimmed = newValue.trim()
    if (!trimmed) {
      new Notice(emptyMessage)
      return
    }
    onChange([...items, trimmed])
    setIsAdding(false)
    setNewValue('')
  }

  const cancelAdd = () => {
    setIsAdding(false)
    setNewValue('')
  }

  return {
    editingIndex,
    editingValue,
    setEditingValue,
    startEdit,
    commitEdit,
    cancelEdit,
    remove,
    isAdding,
    newValue,
    setNewValue,
    startAdd,
    commitAdd,
    cancelAdd,
  }
}
