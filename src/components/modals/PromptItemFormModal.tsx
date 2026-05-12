import { App, Notice } from 'obsidian'
import { useMemo, useState } from 'react'

import { ContextManager } from '../../database/context/ContextManager'
import { FilterLogic, PromptItem } from '../../database/context/types'
import { DuplicatePromptItemException } from '../../database/exception'
import { ObsidianButton } from '../common/ObsidianButton'
import { ObsidianDropdown } from '../common/ObsidianDropdown'
import { ObsidianSetting } from '../common/ObsidianSetting'
import { ObsidianTextArea } from '../common/ObsidianTextArea'
import { ObsidianTextInput } from '../common/ObsidianTextInput'
import { ObsidianToggle } from '../common/ObsidianToggle'
import { ReactModal } from '../common/ReactModal'

type PromptItemFormComponentProps = {
  app: App
  groupId: string
  promptItem?: PromptItem // if provided, we are editing
  allPrompts?: PromptItem[] // all prompts in the same group, for chain activation dropdown
  onSubmit?: () => void
  onClose: () => void
}

export class PromptItemFormModal extends ReactModal<PromptItemFormComponentProps> {
  constructor({
    app,
    groupId,
    promptItem,
    allPrompts,
    onSubmit,
  }: {
    app: App
    groupId: string
    promptItem?: PromptItem
    allPrompts?: PromptItem[]
    onSubmit?: () => void
  }) {
    super({
      app: app,
      Component: PromptItemFormComponent,
      props: {
        app,
        groupId,
        promptItem,
        allPrompts,
        onSubmit,
      },
      options: {
        title: promptItem ? '编辑系统提示' : '添加系统提示',
      },
    })
    this.modalEl.style.width = '640px'
  }
}

function PromptItemFormComponent({
  app,
  groupId,
  promptItem,
  allPrompts,
  onSubmit,
  onClose,
}: PromptItemFormComponentProps) {
  const contextManager = useMemo(() => new ContextManager(app), [app])
  const isEditing = !!promptItem

  const [name, setName] = useState(promptItem?.name ?? '')
  const [content, setContent] = useState(promptItem?.content ?? '')

  // 新增字段
  const [conditionalActivation, setConditionalActivation] = useState(
    promptItem?.conditionalActivation ?? false,
  )
  const [keywords, setKeywords] = useState(
    (promptItem?.keywords ?? []).join(' '),
  )
  const [filterWords, setFilterWords] = useState(
    (promptItem?.filterWords ?? []).join(' '),
  )
  const [filterLogic, setFilterLogic] = useState<FilterLogic>(
    promptItem?.filterLogic ?? 'AND_ANY',
  )
  const [chainActivation, setChainActivation] = useState<string | null>(
    promptItem ? (promptItem.chainActivation ?? null) : null,
  )

  // 连带激活的下拉选项（排除自身和会形成循环的选项）
  const chainOptions = useMemo(() => {
    const options: Record<string, string> = { '': '无' }
    if (!allPrompts) return options

    // 收集所有会形成循环的提示 ID
    const cyclicIds = new Set<string>()
    const editingItem = promptItem
    if (isEditing && editingItem) {
      // 如果其他提示引用了当前提示，选择它会导致 A→B→A 循环
      const selfId = editingItem.id
      for (const p of allPrompts) {
        if (p.id === selfId) continue
        // B 引用了 A（当前），那当前提示就不能引用 B
        const visited = new Set<string>()
        let current: string | undefined = p.id
        while (current && !visited.has(current)) {
          visited.add(current)
          const target = allPrompts.find((x) => x.id === current)
          if (target?.chainActivation === selfId) {
            cyclicIds.add(p.id)
            break
          }
          current = target?.chainActivation ?? undefined
        }
      }
    }

    for (const p of allPrompts) {
      if (isEditing && editingItem && p.id === editingItem.id) continue
      if (cyclicIds.has(p.id)) continue
      // 排除始终激活或被禁用的提示
      if (!p.conditionalActivation || !p.enabled) continue
      options[p.id] = p.name
    }
    return options
  }, [allPrompts, isEditing, promptItem])

  const handleSubmit = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      new Notice('Name cannot be empty')
      return
    }
    const trimmedContent = content.trim()
    if (!trimmedContent) {
      new Notice('The prompt content cannot be empty')
      return
    }

    // 解析关键词和过滤词（空格分隔）
    const parsedKeywords = conditionalActivation
      ? keywords
          .split(/\s+/)
          .map((k: string) => k.trim())
          .filter((k: string) => k.length > 0)
      : []
    const parsedFilterWords = conditionalActivation
      ? filterWords
          .split(/\s+/)
          .map((f: string) => f.trim())
          .filter((f: string) => f.length > 0)
      : []

    try {
      const updates: Partial<PromptItem> = {
        name: trimmedName,
        content: trimmedContent,
        conditionalActivation,
        keywords: parsedKeywords,
        filterWords: parsedFilterWords,
        filterLogic,
        chainActivation: conditionalActivation ? chainActivation : null,
      }

      if (isEditing && promptItem) {
        await contextManager.updatePromptItem(groupId, promptItem.id, updates)
      } else {
        await contextManager.addPromptItem(groupId, {
          name: trimmedName,
          content: trimmedContent,
          enabled: true,
          conditionalActivation,
          keywords: parsedKeywords,
          filterWords: parsedFilterWords,
          filterLogic,
          chainActivation: conditionalActivation ? chainActivation : null,
        })
      }
      onSubmit?.()
      onClose()
    } catch (error) {
      if (error instanceof DuplicatePromptItemException) {
        new Notice(error.message)
      } else {
        console.error('Failed to save prompt item:', error)
        new Notice('Failed to save prompt')
      }
    }
  }

  return (
    <>
      <ObsidianSetting name="名称" required>
        <ObsidianTextInput value={name} onChange={(value) => setName(value)} />
      </ObsidianSetting>
      <div
        style={{
          marginTop: '8px',
          marginBottom: '16px',
          borderBottom: '1px solid var(--background-modifier-border)',
        }}
      />

      <ObsidianSetting name="提示内容" required />
      <div className="zncz-settings-textarea">
        <ObsidianTextArea
          value={content}
          onChange={(value: string) => setContent(value)}
        />
      </div>

      {/* 根据条件激活 */}
      <ObsidianSetting
        name="根据条件激活"
        desc="当符合条件时激活本提示，关闭则始终激活。"
      >
        <div style={{ marginTop: '4px' }} />
        <ObsidianToggle
          value={conditionalActivation}
          onChange={(value: boolean) => setConditionalActivation(value)}
        />
      </ObsidianSetting>

      {conditionalActivation && (
        <>
          {/* 关键词 */}
          <ObsidianSetting
            name="关键词"
            desc="用于匹配本提示的关键词，词之间用空格分隔，留空只能被连带激活。"
          >
            <div style={{ marginTop: '3px' }} />
            <ObsidianTextInput
              value={keywords}
              onChange={(value) => setKeywords(value)}
            />
          </ObsidianSetting>

          {/* 过滤词 */}
          <ObsidianSetting
            name="过滤词"
            desc="进行额外逻辑判定，词之间用空格分隔，留空则不会过滤。"
          >
            <div style={{ marginTop: '3px' }} />
            <ObsidianDropdown<FilterLogic>
              value={filterLogic}
              options={{
                AND_ANY: '与任何',
                AND_ALL: '与全部',
                NOT_ALL: '非全部',
                NOT_ANY: '非任何',
              }}
              onChange={(value) => setFilterLogic(value)}
            />
            <ObsidianTextInput
              value={filterWords}
              onChange={(value) => setFilterWords(value)}
            />
          </ObsidianSetting>

          {/* 连带激活 */}
          <ObsidianSetting
            name="连带激活"
            desc="如果本提示激活则同时激活其它提示。"
          >
            <div style={{ marginTop: '3px' }} />
            <ObsidianDropdown
              value={chainActivation ?? ''}
              options={chainOptions}
              onChange={(value) =>
                setChainActivation(value === '' ? null : value)
              }
            />
          </ObsidianSetting>
        </>
      )}
      <div style={{ marginTop: '3px' }} />
      <ObsidianSetting>
        <ObsidianButton text="保存" onClick={handleSubmit} cta />
        <ObsidianButton text="取消" onClick={onClose} />
      </ObsidianSetting>
    </>
  )
}
