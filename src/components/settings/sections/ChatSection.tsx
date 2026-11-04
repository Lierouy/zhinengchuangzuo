import { useSettings } from '../../../contexts/settings-context'
import { ObsidianDropdown } from '../../common/ObsidianDropdown'
import { ObsidianNumberInput } from '../../common/ObsidianNumberInput'
import { ObsidianSetting } from '../../common/ObsidianSetting'
import { ObsidianToggle } from '../../common/ObsidianToggle'

export function ChatSection() {
  const { settings, setSettings } = useSettings()

  return (
    <div className="zncz-settings-section">
      <div className="zncz-settings-header">会话</div>

      <ObsidianSetting name="会话模型" desc="选择默认用于会话的模型。">
        <ObsidianDropdown
          value={settings.chatModelId}
          options={Object.fromEntries(
            settings.chatModels
              .filter(({ enable }) => enable ?? true)
              .map((chatModel) => [chatModel.model, chatModel.model]),
          )}
          onChange={async (value) => {
            await setSettings({
              ...settings,
              chatModelId: value,
            })
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name="自动提交当前文件"
        desc="将当前打开的文件内容包含在会话中，也可以在会话框中输入 @ 符号手动提交文件。"
      >
        <ObsidianToggle
          value={settings.chatOptions.includeCurrentFileContent}
          onChange={async (value) => {
            await setSettings({
              ...settings,
              chatOptions: {
                ...settings.chatOptions,
                includeCurrentFileContent: value,
              },
            })
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name="文件字数上限"
        desc="限制自动提交文件，手动提交文件和文件夹内容的总字数，留空使用默认值 100000。"
      >
        <ObsidianNumberInput
          value={settings.chatOptions.chatMaxFileChars}
          integer
          accept={(n) => n > 0}
          onChange={(n) =>
            setSettings({
              ...settings,
              chatOptions: { ...settings.chatOptions, chatMaxFileChars: n },
            })
          }
        />
      </ObsidianSetting>
    </div>
  )
}
