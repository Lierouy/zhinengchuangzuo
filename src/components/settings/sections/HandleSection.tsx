import { SerializedEditorState } from 'lexical'
import { App } from 'obsidian'

import { useSettings } from '../../../contexts/settings-context'
import { ObsidianButton } from '../../common/ObsidianButton'
import { ObsidianSetting } from '../../common/ObsidianSetting'
import { ObsidianTextInput } from '../../common/ObsidianTextInput'
import { HandlePromptEditorModal } from '../../modals/HandlePromptEditorModal'

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

  const handleSavePrompt = async (newPrompt: SerializedEditorState) => {
    await setSettings({
      ...settings,
      handlePrompt: newPrompt,
    })
  }

  return (
    <div className="zncz-settings-section">
      <div className="zncz-settings-header">单独处理</div>
      <div className="zncz-settings-desc">
        脱离所有上下文，单独调用模型处理当前打开的文件，还会解析文件中的内部链接。
      </div>

      <ObsidianSetting
        name="处理提示"
        desc="用于单独处理文件的系统提示，可以使用预设提示。"
        required={showRequired}
      >
        <ObsidianButton
          text="编辑"
          onClick={() => {
            new HandlePromptEditorModal(
              app,
              settings.handlePrompt as SerializedEditorState | string,
              handleSavePrompt,
            ).open()
          }}
          cta
        />
      </ObsidianSetting>

      <ObsidianSetting
        name="有效链接数量"
        desc="限制被链接附加的文件数量，留空使用默认值 20。"
      >
        <div style={{ marginTop: '3px' }} />
        <ObsidianTextInput
          type="number"
          value={settings.handleMaxLinks ? String(settings.handleMaxLinks) : ''}
          onChange={async (v: string) => {
            if (v === '') {
              await setSettings({
                ...settings,
                handleMaxLinks: undefined,
              })
            } else {
              const n = Number(v)
              await setSettings({
                ...settings,
                handleMaxLinks: Number.isNaN(n)
                  ? undefined
                  : Math.max(0, Math.trunc(n)),
              })
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
          value={settings.handleMaxChars ? String(settings.handleMaxChars) : ''}
          onChange={async (v: string) => {
            if (v === '') {
              await setSettings({
                ...settings,
                handleMaxChars: undefined,
              })
            } else {
              const n = Number(v)
              await setSettings({
                ...settings,
                handleMaxChars: Number.isNaN(n)
                  ? undefined
                  : Math.max(0, Math.trunc(n)),
              })
            }
          }}
        />
      </ObsidianSetting>
    </div>
  )
}
