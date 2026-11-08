import { App, Notice } from 'obsidian'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { MAX_NAME_LENGTH } from '../../constants'
import { SettingsProvider, useSettings } from '../../contexts/settings-context'
import { PromptGroupMetadata } from '../../database/context/types'
import { isDatabaseError } from '../../database/exception'
import { useContextManager } from '../../hooks/useJsonManagers'
import ZhinengchuangzuoPlugin from '../../main'
import { reportError } from '../../utils/reportError'
import { InlineEditTable } from '../common/InlineEditTable'
import { ObsidianButton } from '../common/ObsidianButton'
import { ObsidianSetting } from '../common/ObsidianSetting'
import { ObsidianTextInput } from '../common/ObsidianTextInput'
import { ReactModal } from '../common/ReactModal'

import { ConfirmModal } from './ConfirmModal'
import {
  EMPTY_GROUP_NAME_MESSAGE,
  GroupOp,
  GroupRow,
  applyOps,
  findGroupNameError,
  replayOps,
} from './promptGroupOps'

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
  const contextManager = useContextManager()

  // Groups as they are on disk; local edits never mutate this list.
  const [initialGroups, setInitialGroups] = useState<PromptGroupMetadata[]>([])
  // Everything the user did while the modal was open. Nothing touches the disk
  // before 保存, and 取消 simply throws the log away.
  const [ops, setOps] = useState<GroupOp[]>([])
  const [loaded, setLoaded] = useState(false)

  const rows = useMemo(() => applyOps(initialGroups, ops), [initialGroups, ops])

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')

  // Local key for groups that only exist in the op log.
  const tempKeyCounterRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const groups = await contextManager.listGroups()
        if (!cancelled) {
          setInitialGroups(groups)
          setLoaded(true)
        }
      } catch (error) {
        console.error('Failed to fetch groups', error)
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [contextManager])

  // ── Local-only operations (no disk writes) ──

  const handleStartEdit = useCallback((row: GroupRow) => {
    setEditingId(row.key)
    setEditingValue(row.name)
    setIsAdding(false)
  }, [])

  const handleCancelEdit = useCallback(() => {
    setEditingId(null)
    setEditingValue('')
  }, [])

  const handleSaveEdit = useCallback(
    (row: GroupRow) => {
      const trimmed = editingValue.trim()
      if (!trimmed) {
        new Notice(EMPTY_GROUP_NAME_MESSAGE)
        return
      }

      if (row.id === null) {
        // Still pending creation: rename the create operation itself.
        setOps((prev) =>
          prev.map((op) =>
            op.kind === 'create' && op.tempKey === row.key
              ? { ...op, name: trimmed }
              : op,
          ),
        )
      } else {
        const id = row.id
        setOps((prev) => {
          const index = prev.findIndex(
            (op) => op.kind === 'rename' && op.id === id,
          )
          if (index === -1) {
            return [...prev, { kind: 'rename', id, name: trimmed }]
          }
          const next = [...prev]
          next[index] = { kind: 'rename', id, name: trimmed }
          return next
        })
      }

      setEditingId(null)
      setEditingValue('')
    },
    [editingValue],
  )

  const handleDelete = useCallback(
    (row: GroupRow) => {
      void (async () => {
        // Only for the confirmation wording: how many prompts go with it.
        let promptCount = 0
        if (row.id !== null) {
          try {
            const group = await contextManager.findById(row.id)
            promptCount = group?.prompts.length ?? 0
          } catch (error) {
            console.error('Failed to load prompt group', error)
          }
        }

        new ConfirmModal(app, {
          title: '删除提示组',
          message:
            `确定要删除提示组“ ${row.name} ”吗？\n` +
            `同时也会删除 ${promptCount} 个提示。`,
          ctaText: '确定',
          onConfirm: () => {
            if (row.id === null) {
              setOps((prev) =>
                prev.filter(
                  (op) => op.kind !== 'create' || op.tempKey !== row.key,
                ),
              )
              return
            }
            const id = row.id
            setOps((prev) => [
              ...prev.filter((op) => op.kind !== 'rename' || op.id !== id),
              { kind: 'delete', id, name: row.name },
            ])
          },
        }).open()
      })()
    },
    [app, contextManager],
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
      new Notice(EMPTY_GROUP_NAME_MESSAGE)
      return
    }
    const tempKey = `temp:${++tempKeyCounterRef.current}`
    setOps((prev) => [...prev, { kind: 'create', tempKey, name: trimmed }])
    setIsAdding(false)
    setNewGroupName('')
  }, [newGroupName])

  // ── Save / Cancel ──

  const handleSave = useCallback(async () => {
    // Reject everything before the first disk write, so a bad name cannot leave
    // the repository half updated.
    const nameError = findGroupNameError(rows)
    if (nameError) {
      new Notice(nameError)
      return
    }

    // Replayed in the order the user made the edits; an edit that collides with
    // a name only freed up later in the same batch is reported and kept.
    const { deletedIds, failed, remaining } = await replayOps(
      contextManager,
      ops,
    )

    // If the currently selected group was deleted, clear selection
    if (deletedIds.includes(settings.selectedPromptGroupId)) {
      await setSettings({
        ...settings,
        selectedPromptGroupId: '',
      })
    }

    if (!failed) {
      onSubmit?.()
      onClose()
      return
    }

    if (isDatabaseError(failed.error, 'duplicate-prompt-group')) {
      new Notice(failed.error.message)
    } else {
      reportError('Failed to save the prompt group changes', failed.error)
    }

    // Keep what could not be applied so the user can retry, and re-read the
    // groups so the table matches what the disk actually holds now.
    try {
      setInitialGroups(await contextManager.listGroups())
    } catch (error) {
      console.error('Failed to reload prompt groups', error)
    }
    setOps(remaining)
  }, [rows, ops, contextManager, settings, setSettings, onSubmit, onClose])

  const handleCancel = useCallback(() => {
    onClose()
  }, [onClose])

  if (!loaded) {
    return <div style={{ padding: '16px', textAlign: 'center' }}>加载中...</div>
  }

  return (
    <>
      <InlineEditTable
        rows={rows.map((row) => ({
          key: row.key,
          isEditing: editingId === row.key,
          content:
            editingId === row.key ? (
              <ObsidianTextInput
                value={editingValue}
                maxLength={MAX_NAME_LENGTH}
                onChange={(v: string) => setEditingValue(v)}
              />
            ) : (
              <div>{row.name}</div>
            ),
          onStartEdit: () => handleStartEdit(row),
          onSaveEdit: () => handleSaveEdit(row),
          onCancelEdit: handleCancelEdit,
          onDelete: () => handleDelete(row),
        }))}
        adding={
          isAdding
            ? {
                content: (
                  <ObsidianTextInput
                    value={newGroupName}
                    maxLength={MAX_NAME_LENGTH}
                    onChange={(v: string) => setNewGroupName(v)}
                  />
                ),
                onSave: handleConfirmAdd,
                onCancel: handleCancelAdd,
              }
            : null
        }
        addLabel="添加提示组"
        onStartAdd={handleStartAdd}
      />
      <ObsidianSetting>
        <ObsidianButton text="保存" onClick={handleSave} cta />
        <ObsidianButton text="取消" onClick={handleCancel} />
      </ObsidianSetting>
    </>
  )
}
