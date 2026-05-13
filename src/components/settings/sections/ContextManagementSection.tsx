import { ArrowDown, ArrowUp, Edit, Trash } from 'lucide-react'
import { App, Notice } from 'obsidian'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { useSettings } from '../../../contexts/settings-context'
import { ContextManager } from '../../../database/context/ContextManager'
import {
  PromptGroupMetadata,
  PromptItem,
} from '../../../database/context/types'
import ZhinengchuangzuoPlugin from '../../../main'
import { ObsidianButton } from '../../common/ObsidianButton'
import { ObsidianDropdown } from '../../common/ObsidianDropdown'
import { ObsidianSetting } from '../../common/ObsidianSetting'
import { ObsidianTextInput } from '../../common/ObsidianTextInput'
import { ObsidianToggle } from '../../common/ObsidianToggle'
import { ConfirmModal } from '../../modals/ConfirmModal'
import { PromptGroupManageModal } from '../../modals/PromptGroupManageModal'
import { PromptItemFormModal } from '../../modals/PromptItemFormModal'

type ContextManagementSectionProps = {
  app: App
  plugin: ZhinengchuangzuoPlugin
  showRequired?: boolean
}

export function ContextManagementSection({
  app,
  plugin,
  showRequired = false,
}: ContextManagementSectionProps) {
  const { settings, setSettings } = useSettings()
  const contextManager = useMemo(() => new ContextManager(app), [app])

  const [groupList, setGroupList] = useState<PromptGroupMetadata[]>([])
  const [currentPrompts, setCurrentPrompts] = useState<PromptItem[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const selectedGroupId = settings.selectedPromptGroupId

  const fetchGroupList = useCallback(async () => {
    try {
      const groups = await contextManager.listGroups()
      setGroupList(groups)
    } catch (error) {
      console.error('Failed to fetch prompt groups:', error)
      setGroupList([])
    }
  }, [contextManager])

  const fetchCurrentPrompts = useCallback(async () => {
    if (!selectedGroupId) {
      setCurrentPrompts([])
      return
    }
    try {
      const group = await contextManager.findById(selectedGroupId)
      setCurrentPrompts(group?.prompts ?? [])
    } catch (error) {
      console.error('Failed to fetch prompts:', error)
      setCurrentPrompts([])
    }
  }, [contextManager, selectedGroupId])

  useEffect(() => {
    setIsLoading(true)
    Promise.all([fetchGroupList(), fetchCurrentPrompts()]).finally(() =>
      setIsLoading(false),
    )
  }, [fetchGroupList, fetchCurrentPrompts])

  const handleOpenManageModal = useCallback(() => {
    new PromptGroupManageModal({
      app,
      plugin,
      onSubmit: async () => {
        await fetchGroupList()
        // If the selected group was deleted, clear selection
        const groups = await contextManager.listGroups()
        if (selectedGroupId && !groups.some((g) => g.id === selectedGroupId)) {
          await setSettings({
            ...settings,
            selectedPromptGroupId: '',
          })
        }
        await fetchCurrentPrompts()
      },
    }).open()
  }, [
    app,
    plugin,
    fetchGroupList,
    fetchCurrentPrompts,
    selectedGroupId,
    settings,
    setSettings,
    contextManager,
  ])

  const handleSelectGroup = useCallback(
    async (value: string) => {
      await setSettings({
        ...settings,
        selectedPromptGroupId: value,
      })
    },
    [settings, setSettings],
  )

  const handleTogglePrompt = useCallback(
    async (itemId: string, enabled: boolean) => {
      if (!selectedGroupId) return
      await contextManager.updatePromptItem(selectedGroupId, itemId, {
        enabled,
      })
      await fetchCurrentPrompts()
    },
    [contextManager, selectedGroupId, fetchCurrentPrompts],
  )

  const handleEditPrompt = useCallback(
    (item: PromptItem) => {
      if (!selectedGroupId) return
      new PromptItemFormModal({
        app,
        groupId: selectedGroupId,
        promptItem: item,
        allPrompts: currentPrompts,
        onSubmit: fetchCurrentPrompts,
      }).open()
    },
    [app, selectedGroupId, currentPrompts, fetchCurrentPrompts],
  )

  const handleDeletePrompt = useCallback(
    (item: PromptItem) => {
      if (!selectedGroupId) return
      new ConfirmModal(app, {
        title: '删除系统提示',
        message: `确定要删除提示“ ${item.name} ”吗？`,
        ctaText: '确定',
        onConfirm: async () => {
          try {
            await contextManager.deletePromptItem(selectedGroupId, item.id)
            await fetchCurrentPrompts()
          } catch (error) {
            console.error('Failed to delete prompt:', error)
            new Notice('Failed to delete prompt')
          }
        },
      }).open()
    },
    [app, contextManager, selectedGroupId, fetchCurrentPrompts],
  )

  const handleAddPrompt = useCallback(() => {
    if (!selectedGroupId) {
      new Notice('Please select a prompt group first')
      return
    }
    new PromptItemFormModal({
      app,
      groupId: selectedGroupId,
      allPrompts: currentPrompts,
      onSubmit: fetchCurrentPrompts,
    }).open()
  }, [app, selectedGroupId, currentPrompts, fetchCurrentPrompts])

  const handleMovePrompt = useCallback(
    async (index: number, direction: 'up' | 'down') => {
      if (!selectedGroupId) return
      try {
        const group = await contextManager.findById(selectedGroupId)
        if (!group) return
        const prompts = [...group.prompts]
        const targetIndex = direction === 'up' ? index - 1 : index + 1
        if (targetIndex < 0 || targetIndex >= prompts.length) return
        ;[prompts[index], prompts[targetIndex]] = [
          prompts[targetIndex],
          prompts[index],
        ]
        await contextManager.updateGroup(selectedGroupId, { prompts })
        await fetchCurrentPrompts()
      } catch (error) {
        console.error('Failed to reorder prompt:', error)
        new Notice('Move prompt failed')
      }
    },
    [contextManager, selectedGroupId, fetchCurrentPrompts],
  )

  const groupOptions = useMemo(() => {
    return Object.fromEntries(groupList.map((g) => [g.id, g.name]))
  }, [groupList])

  return (
    <div className="zncz-settings-section">
      <div className="zncz-settings-header">上下文系统</div>
      <div className="zncz-settings-desc">
        根据匹配条件动态拼接内容的系统提示。
      </div>

      <ObsidianSetting
        name="激活提示数量"
        desc="限制激活的总提示数量，留空使用默认值 50。"
      >
        <ObsidianTextInput
          value={
            settings.promptActivationLimit == null
              ? ''
              : String(settings.promptActivationLimit)
          }
          onChange={(value: string) => {
            const trimmed = value.trim()
            if (trimmed === '') {
              setSettings({ ...settings, promptActivationLimit: null })
            } else {
              const num = Number(trimmed)
              if (!Number.isNaN(num) && num > 0) {
                setSettings({ ...settings, promptActivationLimit: num })
              }
            }
          }}
        />
      </ObsidianSetting>
      <div style={{ marginTop: '4px' }} />
      <ObsidianSetting
        name="提示组"
        desc="创建和选择当前生效的提示组。"
        required={showRequired}
      >
        <ObsidianButton text="管理" onClick={handleOpenManageModal} cta />
        <ObsidianDropdown
          value={selectedGroupId}
          options={groupOptions}
          onChange={handleSelectGroup}
        />
      </ObsidianSetting>

      <div className="zncz-settings-table-container">
        <table className="zncz-settings-table">
          <colgroup>
            <col width="45%" />
            <col width="30%" />
            <col width="15%" />
            <col width="10%" />
          </colgroup>
          <thead>
            <tr>
              <th>名称</th>
              <th>排序</th>
              <th>启用</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {!isLoading &&
              currentPrompts.length > 0 &&
              currentPrompts.map((item, idx) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>
                    <div className="zncz-settings-actions">
                      <button
                        onClick={() => handleMovePrompt(idx, 'up')}
                        className="clickable-icon"
                        disabled={idx === 0}
                      >
                        <ArrowUp size={16} />
                      </button>
                      <button
                        onClick={() => handleMovePrompt(idx, 'down')}
                        className="clickable-icon"
                        disabled={idx === currentPrompts.length - 1}
                      >
                        <ArrowDown size={16} />
                      </button>
                    </div>
                  </td>
                  <td>
                    <ObsidianToggle
                      value={item.enabled}
                      onChange={(value: boolean) =>
                        handleTogglePrompt(item.id, value)
                      }
                    />
                  </td>
                  <td>
                    <div className="zncz-settings-actions">
                      <button
                        onClick={() => handleEditPrompt(item)}
                        className="clickable-icon"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => handleDeletePrompt(item)}
                        className="clickable-icon"
                      >
                        <Trash size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>
                <button onClick={handleAddPrompt}>添加系统提示</button>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
