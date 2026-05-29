import { App } from 'obsidian'
import { useEffect, useMemo, useState } from 'react'

import { useSettings } from '../../../contexts/settings-context'
import { TemplateManager } from '../../../database/template/TemplateManager'
import { TemplateMetadata } from '../../../database/template/types'
import { ObsidianDropdown } from '../../common/ObsidianDropdown'
import { ObsidianSetting } from '../../common/ObsidianSetting'
import { ObsidianTextInput } from '../../common/ObsidianTextInput'

type HandleSectionProps = {
  app: App
  showRequired?: boolean
  onClose?: () => void
}

export function HandleSection({
  app,
  showRequired = false,
}: HandleSectionProps) {
  const { settings, setSettings } = useSettings()
  const templateManager = useMemo(() => new TemplateManager(app), [app])
  const [templateList, setTemplateList] = useState<TemplateMetadata[]>([])

  useEffect(() => {
    templateManager.listTemplates().then(setTemplateList)
  }, [templateManager])

  const templateOptions = useMemo(() => {
    return Object.fromEntries(templateList.map((t) => [t.id, t.name]))
  }, [templateList])

  return (
    <div className="zncz-settings-section">
      <div className="zncz-settings-header">单独处理</div>
      <div className="zncz-settings-desc">
        脱离所有上下文，单独调用模型处理当前打开的文件，还会解析文件中的内部链接。
      </div>

      <ObsidianSetting
        name="处理提示"
        desc="使用预设提示作为单独处理文件的系统提示。"
        required={showRequired}
      >
        <ObsidianDropdown
          value={settings.handlePromptId}
          options={templateOptions}
          onChange={async (v: string) => {
            await setSettings({
              ...settings,
              handlePromptId: v,
            })
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name="有效链接数量"
        desc="限制被链接附加的文件数量，留空使用默认值 20。"
      >
        <div style={{ marginTop: '3px' }} />
        <ObsidianTextInput
          type="number"
          value={
            settings.handleMaxLinks == null
              ? ''
              : String(settings.handleMaxLinks)
          }
          onChange={async (v: string) => {
            const trimmed = v.trim()
            if (trimmed === '') {
              await setSettings({
                ...settings,
                handleMaxLinks: undefined,
              })
            } else {
              const n = Number(trimmed)
              if (!Number.isNaN(n) && n > 0) {
                await setSettings({
                  ...settings,
                  handleMaxLinks: Math.trunc(n),
                })
              }
            }
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name="处理字数上限"
        desc="所有提交文件的总字数上限，留空使用默认值 300000。"
      >
        <div style={{ marginTop: '3px' }} />
        <ObsidianTextInput
          type="number"
          value={
            settings.handleMaxChars == null
              ? ''
              : String(settings.handleMaxChars)
          }
          onChange={async (v: string) => {
            const trimmed = v.trim()
            if (trimmed === '') {
              await setSettings({
                ...settings,
                handleMaxChars: undefined,
              })
            } else {
              const n = Number(trimmed)
              if (!Number.isNaN(n) && n > 0) {
                await setSettings({
                  ...settings,
                  handleMaxChars: Math.trunc(n),
                })
              }
            }
          }}
        />
      </ObsidianSetting>
    </div>
  )
}
