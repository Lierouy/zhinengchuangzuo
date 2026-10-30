import { ArrowDown, ArrowUp, Edit, Trash } from 'lucide-react'
import { App, Notice } from 'obsidian'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { TemplateManager } from '../../../database/template/TemplateManager'
import { TemplateMetadata } from '../../../database/template/types'
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

      <div className="zncz-settings-table-container">
        <table className="zncz-settings-table">
          <colgroup>
            <col width="50%" />
            <col width="40%" />
            <col width="10%" />
          </colgroup>
          <thead>
            <tr>
              <th>名称</th>
              <th>排序</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
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
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>
                <button onClick={handleCreate}>添加预设提示</button>
              </td>
            </tr>
          </tfoot>
        </table>
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
    <tr>
      <td>{template.name}</td>
      <td>
        <div className="zncz-settings-actions">
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
      </td>
      <td>
        <div className="zncz-settings-actions">
          <button className="clickable-icon" onClick={onEdit}>
            <Edit size={16} />
          </button>
          <button className="clickable-icon" onClick={onDelete}>
            <Trash size={16} />
          </button>
        </div>
      </td>
    </tr>
  )
}
