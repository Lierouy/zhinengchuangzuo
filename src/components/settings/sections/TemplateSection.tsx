import { ArrowDown, ArrowUp, Edit, Trash } from 'lucide-react'
import { App, Notice } from 'obsidian'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { TemplateManager } from '../../../database/template/TemplateManager'
import { TemplateMetadata } from '../../../database/template/types'
import { ObsidianButton } from '../../common/ObsidianButton'
import { ConfirmModal } from '../../modals/ConfirmModal'
import {
  CreateTemplateModal,
  EditTemplateModal,
} from '../../modals/TemplateFormModal'

type TemplateSectionProps = {
  app: App
}

export function TemplateSection({ app }: TemplateSectionProps) {
  const templateManager = useMemo(() => new TemplateManager(app), [app])

  const [templateList, setTemplateList] = useState<TemplateMetadata[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const fetchTemplateList = useCallback(async () => {
    setIsLoading(true)
    try {
      setTemplateList(await templateManager.listTemplates())
    } catch (error) {
      console.error('Failed to fetch template list:', error)
      new Notice('Failed to load templates')
      setTemplateList([])
    } finally {
      setIsLoading(false)
    }
  }, [templateManager])

  const handleCreate = useCallback(() => {
    new CreateTemplateModal({
      app,
      onSubmit: fetchTemplateList,
    }).open()
  }, [fetchTemplateList, app])

  const handleEdit = useCallback(
    (template: TemplateMetadata) => {
      new EditTemplateModal({
        app,
        templateId: template.id,
        onSubmit: fetchTemplateList,
      }).open()
    },
    [fetchTemplateList, app],
  )

  const handleDelete = useCallback(
    (template: TemplateMetadata) => {
      const message = `确定要删除预设“ ${template.name} ”吗？`
      new ConfirmModal(app, {
        title: '删除预设提示',
        message: message,
        ctaText: '确定',
        onConfirm: async () => {
          try {
            await templateManager.deleteTemplate(template.id)
            fetchTemplateList()
          } catch (error) {
            console.error('Failed to delete template:', error)
            new Notice('Failed to delete template')
          }
        },
      }).open()
    },
    [templateManager, fetchTemplateList, app],
  )

  const handleMoveTemplate = useCallback(
    async (index: number, direction: 'up' | 'down') => {
      const targetIndex = direction === 'up' ? index - 1 : index + 1
      if (targetIndex < 0 || targetIndex >= templateList.length) return

      const reordered = [...templateList]
      ;[reordered[index], reordered[targetIndex]] = [
        reordered[targetIndex],
        reordered[index],
      ]
      setTemplateList(reordered)

      try {
        await templateManager.reorderTemplates(reordered.map((t) => t.id))
      } catch (error) {
        console.error('Failed to reorder templates:', error)
        fetchTemplateList()
      }
    },
    [templateList, templateManager, fetchTemplateList],
  )

  useEffect(() => {
    fetchTemplateList()
  }, [fetchTemplateList])

  return (
    <div className="zncz-settings-section">
      <div className="zncz-settings-header">预设提示</div>

      <div className="zncz-settings-desc">
        创建和编辑预设的提示内容，在会话框中输入 / 符号快速使用提示。
      </div>

      <div className="zncz-templates-container">
        <div className="zncz-templates-header">
          <div>名称</div>
          <div>排序</div>
          <div>操作</div>
        </div>
        {!isLoading &&
          templateList.length > 0 &&
          templateList.map((template, idx) => (
            <TemplateItem
              key={template.id}
              template={template}
              isFirst={idx === 0}
              isLast={idx === templateList.length - 1}
              onMoveUp={() => handleMoveTemplate(idx, 'up')}
              onMoveDown={() => handleMoveTemplate(idx, 'down')}
              onDelete={() => {
                handleDelete(template)
              }}
              onEdit={() => {
                handleEdit(template)
              }}
            />
          ))}
      </div>
      <div
        style={{
          margin: 'var(--size-2-2)',
          display: 'flex',
          justifyContent: 'flex-end',
        }}
      >
        <ObsidianButton text="添加预设提示" onClick={handleCreate} />
      </div>
    </div>
  )
}

function TemplateItem({
  template,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onEdit,
  onDelete,
}: {
  template: TemplateMetadata
  isFirst: boolean
  isLast: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="zncz-template">
      <div className="zncz-template-row">
        <div className="zncz-template-name">{template.name}</div>
        <div className="zncz-template-actions">
          <button
            className="clickable-icon"
            onClick={onMoveUp}
            disabled={isFirst}
          >
            <ArrowUp size={16} />
          </button>
          <button
            className="clickable-icon"
            onClick={onMoveDown}
            disabled={isLast}
          >
            <ArrowDown size={16} />
          </button>
        </div>
        <div className="zncz-template-actions">
          <button className="clickable-icon" onClick={onEdit}>
            <Edit size={16} />
          </button>
          <button className="clickable-icon" onClick={onDelete}>
            <Trash size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
