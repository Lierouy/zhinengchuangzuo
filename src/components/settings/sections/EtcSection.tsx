import { App, Notice, normalizePath } from 'obsidian'

import { useSettings } from '../../../contexts/settings-context'
import { ROOT_DIR } from '../../../database/constants'
import ZhinengchuangzuoPlugin from '../../../main'
import { parseZhinengchuangzuoSettings } from '../../../settings/schema/settings'
import { reportError } from '../../../utils/reportError'
import { ObsidianButton } from '../../common/ObsidianButton'
import { ObsidianSetting } from '../../common/ObsidianSetting'
import { ConfirmModal } from '../../modals/ConfirmModal'

type EtcSectionProps = {
  app: App
  plugin: ZhinengchuangzuoPlugin
}

export function EtcSection({ app, plugin }: EtcSectionProps) {
  const { setSettings } = useSettings()

  const handleResetSettings = () => {
    new ConfirmModal(app, {
      title: '初始化',
      message: '确定要还原所有设置，并删除所有数据吗？此操作无法撤销！',
      ctaText: '确定',
      onConfirm: async () => {
        // Everything the plugin owns lives under user_data, config included.
        try {
          const userDataDir = normalizePath(ROOT_DIR)
          if (await app.vault.adapter.exists(userDataDir)) {
            await app.vault.adapter.rmdir(userDataDir, true)
          }
        } catch (error) {
          reportError('Failed to delete user data, nothing was reset', error)
          return
        }

        // Recreates the folder and a default config.json.
        const defaultSettings = parseZhinengchuangzuoSettings({})
        await setSettings(defaultSettings)

        // Open views still hold the deleted data in memory.
        plugin.emitDataReset()
        new Notice('Settings have been reset to their default values')
      },
    }).open()
  }

  return (
    <div className="zncz-settings-section">
      <div className="zncz-settings-header">其他</div>

      <ObsidianSetting
        name="初始化"
        desc="将所有设置还原为默认状态，并删除所有用户数据。"
      >
        <ObsidianButton text="重置" warning onClick={handleResetSettings} />
      </ObsidianSetting>
    </div>
  )
}
