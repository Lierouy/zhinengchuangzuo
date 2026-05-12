import { App, Notice } from 'obsidian'
import { useEffect, useMemo, useRef, useState } from 'react'

import { DuplicateTemplateException } from '../../database/exception'
import { TemplateManager } from '../../database/template/TemplateManager'
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
      Component: TemplateFormComponentWrapper,
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
      Component: TemplateFormComponentWrapper,
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

function TemplateFormComponentWrapper({
  app,
  templateId,
  onSubmit,
  onClose,
}: TemplateFormComponentProps) {
  return (
    <TemplateFormComponent
      app={app}
      templateId={templateId}
      onSubmit={onSubmit}
      onClose={onClose}
    />
  )
}

function TemplateFormComponent({
  app,
  templateId,
  onSubmit,
  onClose,
}: TemplateFormComponentProps) {
  const templateManager = useMemo(() => new TemplateManager(app), [app])

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
      if (error instanceof DuplicateTemplateException) {
        new Notice('A template with this name already exists')
      } else {
        console.error(error)
        new Notice('Failed to create template')
      }
    }
  }

  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true

    async function fetchExistingTemplate(templateId: string) {
      try {
        const existingTemplate = await templateManager.findById(templateId)
        if (existingTemplate && isMountedRef.current) {
          setTemplateName(existingTemplate.name)
          setTemplateContent(existingTemplate.content)
        }
      } catch (error) {
        console.error('Failed to fetch existing template:', error)
        new Notice('Failed to load template')
      }
    }
    if (templateId) {
      fetchExistingTemplate(templateId)
    }

    return () => {
      isMountedRef.current = false
    }
  }, [templateId, templateManager])

  return (
    <>
      <ObsidianSetting name="名称" required>
        <ObsidianTextInput
          value={templateName}
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
