import { App, Notice } from 'obsidian'

import { useSettings } from '../../../contexts/settings-context'
import {
  CHAT_DIR,
  CONTEXT_DIR,
  ROOT_DIR,
  TEMPLATE_DIR,
} from '../../../database/constants'
import ZhinengchuangzuoPlugin from '../../../main'
import { parseZhinengchuangzuoSettings } from '../../../settings/schema/settings'
import { ObsidianButton } from '../../common/ObsidianButton'
import { ObsidianSetting } from '../../common/ObsidianSetting'
import { ConfirmModal } from '../../modals/ConfirmModal'

type EtcSectionProps = {
  app: App
  plugin: ZhinengchuangzuoPlugin
}

export function EtcSection({ app }: EtcSectionProps) {
  const { setSettings } = useSettings()

  const handleResetSettings = () => {
    new ConfirmModal(app, {
      title: '初始化',
      message: '确定要还原所有设置，并删除所有数据吗？此操作无法撤销。',
      ctaText: '确定',
      onConfirm: async () => {
        // 清除数据文件
        const dataDirs = [CHAT_DIR, CONTEXT_DIR, TEMPLATE_DIR]
        for (const dir of dataDirs) {
          const dirPath = `${ROOT_DIR}/${dir}`
          try {
            if (await app.vault.adapter.exists(dirPath)) {
              const files = await app.vault.adapter.list(dirPath)
              for (const file of files.files) {
                await app.vault.adapter.remove(file)
              }
            }
          } catch (error) {
            console.error(`Failed to clean up ${dir}:`, error)
          }
        }

        // 重置配置
        const defaultSettings = parseZhinengchuangzuoSettings({})
        await setSettings(defaultSettings)
        new Notice('Settings have been reset to their default values')
      },
    }).open()
  }

  return (
    <div className="zncz-settings-section">
      <div className="zncz-settings-header">其它</div>

      <ObsidianSetting
        name="初始化"
        desc="将所有设置还原为默认状态，并删除所有用户数据。"
      >
        <ObsidianButton text="重置" warning onClick={handleResetSettings} />
      </ObsidianSetting>
    </div>
  )
}
