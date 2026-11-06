import { App, Notice } from 'obsidian'
import { useEffect, useState } from 'react'

import { MAX_NAME_LENGTH } from '../../constants'
import { isDatabaseError } from '../../database/exception'
import { useTemplateManager } from '../../hooks/useJsonManagers'
import { ObsidianButton } from '../common/ObsidianButton'
import { ObsidianSetting } from '../common/ObsidianSetting'
import { ObsidianTextArea } from '../common/ObsidianTextArea'
import { ObsidianTextInput } from '../common/ObsidianTextInput'
import { ReactModal } from '../common/ReactModal'

type TemplateFormComponentProps = {
  app: App
  templateId?: string
  onSubmit?: () => void
  onClose: () => void
}

export class CreateTemplateModal extends ReactModal<TemplateFormComponentProps> {
  constructor({ app, onSubmit }: { app: App; onSubmit?: () => void }) {
    super({
      app: app,
      Component: TemplateFormComponent,
      props: {
        app,
        onSubmit,
      },
      options: {
        title: '添加预设提示',
      },
    })
  }
}

export class EditTemplateModal extends ReactModal<TemplateFormComponentProps> {
  constructor({
    app,
    templateId,
    onSubmit,
  }: {
    app: App
    templateId?: string
    onSubmit?: () => void
  }) {
    super({
      app: app,
      Component: TemplateFormComponent,
      props: {
        app,
        templateId,
        onSubmit,
      },
      options: {
        title: '编辑预设提示',
      },
    })
  }
}

function TemplateFormComponent({
  templateId,
  onSubmit,
  onClose,
}: TemplateFormComponentProps) {
  const templateManager = useTemplateManager()

  const [templateName, setTemplateName] = useState('')
  const [templateContent, setTemplateContent] = useState('')

  const handleSubmit = async () => {
    try {
      const content = templateContent.trim()
      if (!content) {
        new Notice('Please enter a content for your template')
        return
      }
      if (templateName.trim().length === 0) {
        new Notice('Please enter a name for your template')
        return
      }

      if (templateId === undefined) {
        await templateManager.createTemplate({
          name: templateName,
          content,
        })
      } else {
        await templateManager.updateTemplate(templateId, {
          name: templateName,
          content,
        })
      }

      onSubmit?.()
      onClose()
    } catch (error) {
      if (isDatabaseError(error, 'duplicate-template')) {
        new Notice('A template with this name already exists')
      } else {
        console.error(error)
        new Notice('Failed to create template')
      }
    }
  }

  useEffect(() => {
    if (!templateId) return

    // React ignores state updates after unmount, so only a cancellation flag is
    // needed to keep a slow read from overwriting newer input.
    let cancelled = false
    templateManager
      .findById(templateId)
      .then((existingTemplate) => {
        if (cancelled || !existingTemplate) return
        setTemplateName(existingTemplate.name)
        setTemplateContent(existingTemplate.content)
      })
      .catch((error: unknown) => {
        console.error('Failed to fetch existing template', error)
        new Notice('Failed to load template')
      })

    return () => {
      cancelled = true
    }
  }, [templateId, templateManager])

  return (
    <>
      <ObsidianSetting name="名称" required>
        <ObsidianTextInput
          value={templateName}
          maxLength={MAX_NAME_LENGTH}
          onChange={(value) => setTemplateName(value)}
        />
      </ObsidianSetting>
      <div
        style={{
          marginTop: '8px',
          marginBottom: '16px',
          borderBottom: '1px solid var(--background-modifier-border)',
        }}
      />

      <ObsidianSetting
        name="提示内容"
        desc="输入到会话框中的文本内容。"
        required
      />
      <div className="zncz-settings-textarea">
        <ObsidianTextArea
          value={templateContent}
          onChange={(value) => setTemplateContent(value)}
        />
      </div>

      <ObsidianSetting>
        <div style={{ marginTop: '4px' }}></div>
        <ObsidianButton text="保存" onClick={handleSubmit} cta />
        <ObsidianButton text="取消" onClick={onClose} />
      </ObsidianSetting>
    </>
  )
}
