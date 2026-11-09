import { useCallback, useEffect, useMemo, useState } from 'react'

import { useSettings } from '../../../contexts/settings-context'
import { TemplateMetadata } from '../../../database/template/types'
import { useTemplateManager } from '../../../hooks/useJsonManagers'
import ZhinengchuangzuoPlugin from '../../../main'
import { ObsidianDropdown } from '../../common/ObsidianDropdown'
import { ObsidianNumberInput } from '../../common/ObsidianNumberInput'
import { ObsidianSetting } from '../../common/ObsidianSetting'

const isPositive = (n: number) => n > 0

type HandleSectionProps = {
  plugin: ZhinengchuangzuoPlugin
  showRequired?: boolean
}

export function HandleSection({
  plugin,
  showRequired = false,
}: HandleSectionProps) {
  const { settings, setSettings } = useSettings()
  const templateManager = useTemplateManager()
  const [templateList, setTemplateList] = useState<TemplateMetadata[]>([])

  const fetchTemplateList = useCallback(async () => {
    try {
      setTemplateList(await templateManager.listTemplates())
    } catch (error) {
      console.error('Failed to fetch template list', error)
    }
  }, [templateManager])

  useEffect(() => {
    void fetchTemplateList()
  }, [fetchTemplateList])

  // A reset deletes every template file, so reload the list for the dropdown.
  useEffect(() => {
    return plugin.onDataReset(() => {
      void fetchTemplateList()
    })
  }, [plugin, fetchTemplateList])

  const templateOptions = useMemo(() => {
    return Object.fromEntries(templateList.map((t) => [t.id, t.name]))
  }, [templateList])

  return (
    <div className="zncz-settings-section">
      <div className="zncz-settings-header">单独处理</div>
      <div className="zncz-settings-desc">
        隔离其他上下文，单独调用模型处理当前展示的文件，还会解析文件中的内部链接。
      </div>

      <ObsidianSetting
        name="处理提示"
        desc="使用预设提示作为处理文件内容的系统提示。"
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
        desc="限制被解析的链接内容数量，留空使用默认值 30。"
      >
        <div style={{ marginTop: '3px' }} />
        <ObsidianNumberInput
          value={settings.handleMaxLinks}
          integer
          accept={isPositive}
          onChange={(n) => setSettings({ ...settings, handleMaxLinks: n })}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name="处理字数上限"
        desc="当前文件和链接内容的总字数上限，留空使用默认值 300000。"
      >
        <div style={{ marginTop: '3px' }} />
        <ObsidianNumberInput
          value={settings.handleMaxChars}
          integer
          accept={isPositive}
          onChange={(n) => setSettings({ ...settings, handleMaxChars: n })}
        />
      </ObsidianSetting>
    </div>
  )
}
