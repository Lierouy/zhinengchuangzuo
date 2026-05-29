import { Check, Edit, Trash, X } from 'lucide-react'
import { App, Notice } from 'obsidian'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { SettingsProvider, useSettings } from '../../contexts/settings-context'
import { ContextManager } from '../../database/context/ContextManager'
import { PromptGroupMetadata } from '../../database/context/types'
import { DuplicatePromptGroupException } from '../../database/exception'
import ZhinengchuangzuoPlugin from '../../main'
import { ObsidianButton } from '../common/ObsidianButton'
import { ObsidianSetting } from '../common/ObsidianSetting'
import { ObsidianTextInput } from '../common/ObsidianTextInput'
import { ReactModal } from '../common/ReactModal'

import { ConfirmModal } from './ConfirmModal'

type PromptGroupManageModalComponentProps = {
  app: App
  plugin: ZhinengchuangzuoPlugin
  onSubmit?: () => void
  onClose: () => void
}

export class PromptGroupManageModal extends ReactModal<PromptGroupManageModalComponentProps> {
  constructor({
    app,
    plugin,
    onSubmit,
  }: {
    app: App
    plugin: ZhinengchuangzuoPlugin
    onSubmit?: () => void
  }) {
    super({
      app: app,
      Component: PromptGroupManageModalWrapper,
      props: {
        app,
        plugin,
        onSubmit,
      },
      options: {
        title: '管理提示组',
      },
    })
    this.modalEl.style.width = '600px'
  }
}

function PromptGroupManageModalWrapper({
  app,
  plugin,
  onSubmit,
  onClose,
}: PromptGroupManageModalComponentProps) {
  return (
    <SettingsProvider
      settings={plugin.settings}
      setSettings={(newSettings) => plugin.setSettings(newSettings)}
      addSettingsChangeListener={(listener) =>
        plugin.addSettingsChangeListener(listener)
      }
    >
      <PromptGroupManageModalComponent
        app={app}
        onSubmit={onSubmit}
        onClose={onClose}
      />
    </SettingsProvider>
  )
}

function PromptGroupManageModalComponent({
  app,
  onSubmit,
  onClose,
}: Omit<PromptGroupManageModalComponentProps, 'plugin'>) {
  const { settings, setSettings } = useSettings()
  const contextManager = useMemo(() => new ContextManager(app), [app])

  // Local working copy of groups — all edits happen here, not on disk
  const [groupList, setGroupList] = useState<PromptGroupMetadata[]>([])
  // Snapshot at mount time for diff computation on save
  const initialGroupListRef = useRef<PromptGroupMetadata[]>([])
  const [loaded, setLoaded] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')

  // Generate temporary IDs for new groups (will be replaced with real UUIDs on save)
  const tempIdCounterRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const groups = await contextManager.listGroups()
        if (!cancelled) {
          setGroupList(groups)
          initialGroupListRef.current = groups
          setLoaded(true)
        }
      } catch (error) {
        console.error('Failed to fetch groups:', error)
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [contextManager])

  // ── Local-only operations (no disk writes) ──

  const handleStartEdit = useCallback((group: PromptGroupMetadata) => {
    setEditingId(group.id)
    setEditingValue(group.name)
    setIsAdding(false)
  }, [])

  const handleCancelEdit = useCallback(() => {
    setEditingId(null)
    setEditingValue('')
  }, [])

  const handleSaveEdit = useCallback(
    (groupId: string) => {
      const trimmed = editingValue.trim()
      if (!trimmed) {
        new Notice('Prompt group name cannot be empty')
        return
      }
      setGroupList((prev) =>
        prev.map((g) => (g.id === groupId ? { ...g, name: trimmed } : g)),
      )
      setEditingId(null)
      setEditingValue('')
    },
    [editingValue],
  )

  const handleDelete = useCallback(
    (group: PromptGroupMetadata) => {
      new ConfirmModal(app, {
        title: '删除提示组',
        message: `确定要删除提示组“ ${group.name} ”吗？组内的所有提示都将删除。`,
        ctaText: '确定',
        onConfirm: () => {
          setGroupList((prev) => prev.filter((g) => g.id !== group.id))
        },
      }).open()
    },
    [app],
  )

  const handleStartAdd = useCallback(() => {
    setIsAdding(true)
    setNewGroupName('')
    setEditingId(null)
  }, [])

  const handleCancelAdd = useCallback(() => {
    setIsAdding(false)
    setNewGroupName('')
  }, [])

  const handleConfirmAdd = useCallback(() => {
    const trimmed = newGroupName.trim()
    if (!trimmed) {
      new Notice('The prompt group name cannot be empty')
      return
    }
    const tempId = `__new_${++tempIdCounterRef.current}`
    setGroupList((prev) => [
      ...prev,
      { id: tempId, name: trimmed, schemaVersion: 0 },
    ])
    setIsAdding(false)
    setNewGroupName('')
  }, [newGroupName])

  // ── Save / Cancel ──

  const handleSave = useCallback(async () => {
    const initial = initialGroupListRef.current
    const current = groupList

    // Build lookup maps
    const initialIds = new Set(initial.map((g) => g.id))
    const currentIds = new Set(current.map((g) => g.id))

    // New groups: in current but not in initial
    const newGroups = current.filter((g) => !initialIds.has(g.id))
    // Deleted groups: in initial but not in current
    const deletedIds = initial
      .filter((g) => !currentIds.has(g.id))
      .map((g) => g.id)
    // Renamed groups: same id, different name
    const renamedGroups = current.filter((g) => {
      const orig = initial.find((o) => o.id === g.id)
      return orig && orig.name !== g.name
    })

    let hasError = false

    // Delete first (so rename conflicts don't matter)
    for (const id of deletedIds) {
      try {
        await contextManager.deleteGroup(id)
      } catch (error) {
        console.error('Failed to delete group:', error)
        new Notice('Failed to delete the prompt group')
        hasError = true
      }
    }

    // Rename
    for (const g of renamedGroups) {
      try {
        await contextManager.updateGroup(g.id, { name: g.name })
      } catch (error) {
        if (error instanceof DuplicatePromptGroupException) {
          new Notice(error.message)
        } else {
          console.error('Failed to rename group:', error)
          new Notice('Rename failed')
        }
        hasError = true
      }
    }

    // Create new
    for (const g of newGroups) {
      try {
        await contextManager.createGroup({ name: g.name, prompts: [] })
      } catch (error) {
        if (error instanceof DuplicatePromptGroupException) {
          new Notice(error.message)
        } else {
          console.error('Failed to create group:', error)
          new Notice('Failed to create prompt group')
        }
        hasError = true
      }
    }

    // If the currently selected group was deleted, clear selection
    if (deletedIds.includes(settings.selectedPromptGroupId)) {
      await setSettings({
        ...settings,
        selectedPromptGroupId: '',
      })
    }

    if (!hasError) {
      onSubmit?.()
      onClose()
    }
  }, [groupList, contextManager, settings, setSettings, onSubmit, onClose])

  const handleCancel = useCallback(() => {
    onClose()
  }, [onClose])

  if (!loaded) {
    return <div style={{ padding: '16px', textAlign: 'center' }}>加载中...</div>
  }

  return (
    <>
      <div className="zncz-settings-table-container">
        <table className="zncz-settings-table">
          <colgroup>
            <col width="90%" />
            <col width="10%" />
          </colgroup>
          <tbody>
            {groupList.map((group) => (
              <tr key={group.id}>
                <td>
                  {editingId === group.id ? (
                    <ObsidianTextInput
                      value={editingValue}
                      onChange={(v: string) => setEditingValue(v)}
                    />
                  ) : (
                    <div>{group.name}</div>
                  )}
                </td>
                <td>
                  <div className="zncz-settings-actions">
                    {editingId === group.id ? (
                      <>
                        <button
                          onClick={() => handleSaveEdit(group.id)}
                          className="clickable-icon"
                        >
                          <Check size={16} />
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="clickable-icon"
                        >
                          <X size={16} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => handleStartEdit(group)}
                          className="clickable-icon"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(group)}
                          className="clickable-icon"
                        >
                          <Trash size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {isAdding && (
              <tr>
                <td>
                  <ObsidianTextInput
                    value={newGroupName}
                    onChange={(v: string) => setNewGroupName(v)}
                  />
                </td>
                <td>
                  <div className="zncz-settings-actions">
                    <button
                      onClick={handleConfirmAdd}
                      className="clickable-icon"
                    >
                      <Check size={16} />
                    </button>
                    <button
                      onClick={handleCancelAdd}
                      className="clickable-icon"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>
                <button onClick={handleStartAdd} disabled={isAdding}>
                  添加提示组
                </button>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <ObsidianSetting>
        <ObsidianButton text="保存" onClick={handleSave} cta />
        <ObsidianButton text="取消" onClick={handleCancel} />
      </ObsidianSetting>
    </>
  )
}
