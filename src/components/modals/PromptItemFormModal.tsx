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
    const options: Record<string, string> = { '': '(无)' }
    if (!allPrompts) return options

    // 先把“谁指向谁”列成一张反向表（一遍即可）
    const referrers = new Map<string, string[]>()
    for (const prompt of allPrompts) {
      const target = prompt.chainActivation
      if (!target) continue
      const list = referrers.get(target)
      if (list) {
        list.push(prompt.id)
      } else {
        referrers.set(target, [prompt.id])
      }
    }

    const selfId = promptItem?.id

    // 从自己往回找：所有能走到自己的提示都不能选，否则会形成 A→B→A
    const cyclicIds = new Set<string>()
    if (selfId) {
      const stack = [...(referrers.get(selfId) ?? [])]
      while (stack.length > 0) {
        const id = stack.pop() as string
        if (id === selfId || cyclicIds.has(id)) continue
        cyclicIds.add(id)
        stack.push(...(referrers.get(id) ?? []))
      }
    }

    for (const p of allPrompts) {
      if (selfId && p.id === selfId) continue
      if (cyclicIds.has(p.id)) continue
      // 排除始终激活或被禁用的提示
      if (!p.conditionalActivation || !p.enabled) continue
      options[p.id] = p.name
    }
    return options
  }, [allPrompts, promptItem])

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

      if (promptItem) {
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
            desc="匹配后进行额外逻辑判断，词之间用空格分隔，留空则无过滤。"
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
            desc="如果本提示激活则同时激活其他提示。"
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
