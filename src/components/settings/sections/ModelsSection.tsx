import { Settings, Trash } from 'lucide-react'
import { App } from 'obsidian'

import { useSettings } from '../../../contexts/settings-context'
import ZhinengchuangzuoPlugin from '../../../main'
import { isChatModelEnabled } from '../../../utils/chat/chatModel'
import { ObsidianToggle } from '../../common/ObsidianToggle'
import { ConfirmModal } from '../../modals/ConfirmModal'
import {
  AddChatModelModal,
  EditChatModelModal,
} from '../modals/AddChatModelModal'

type ModelsSectionProps = {
  app: App
  plugin: ZhinengchuangzuoPlugin
}

export function ModelsSection({ app, plugin }: ModelsSectionProps) {
  // Only used for rendering. Writes below read `plugin.settings` at call time so
  // a render snapshot can never resurrect entries that were removed meanwhile.
  const { settings } = useSettings()

  const handleDeleteChatModel = async (modelId: string) => {
    const message = `确定要删除模型“ ${modelId} ”吗？`
    new ConfirmModal(app, {
      title: '删除模型',
      message: message,
      ctaText: '确定',
      onConfirm: async () => {
        const current = plugin.settings
        await plugin.setSettings({
          ...current,
          chatModels: current.chatModels.filter((v) => v.model !== modelId),
          chatModelId:
            current.chatModelId === modelId ? '' : current.chatModelId,
        })
      },
    }).open()
  }

  const handleToggleEnableChatModel = async (
    modelId: string,
    value: boolean,
  ) => {
    const current = plugin.settings
    await plugin.setSettings({
      ...current,
      chatModels: current.chatModels.map((v) =>
        v.model === modelId ? { ...v, enable: value } : v,
      ),
      ...(!value && modelId === current.chatModelId ? { chatModelId: '' } : {}),
    })
  }

  return (
    <div className="zncz-settings-section">
      <div className="zncz-settings-header">模型</div>
      <div className="zncz-settings-table-container">
        <table className="zncz-settings-table">
          <colgroup>
            <col width="45%" />
            <col width="30%" />
            <col width="15%" />
            <col width="10%" />
          </colgroup>
          <thead>
            <tr>
              <th>名称</th>
              <th>供应商</th>
              <th>启用</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {settings.chatModels.map((chatModel) => (
              <tr key={chatModel.model}>
                <td>{chatModel.model}</td>
                <td>{chatModel.providerId}</td>
                <td>
                  <ObsidianToggle
                    value={isChatModelEnabled(chatModel)}
                    onChange={(value: boolean) =>
                      handleToggleEnableChatModel(chatModel.model, value)
                    }
                  />
                </td>
                <td>
                  <div className="zncz-settings-actions">
                    <button
                      onClick={() =>
                        new EditChatModelModal(app, plugin, chatModel).open()
                      }
                      className="clickable-icon"
                    >
                      <Settings />
                    </button>
                    <button
                      onClick={() => handleDeleteChatModel(chatModel.model)}
                      className="clickable-icon"
                    >
                      <Trash />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>
                <button
                  onClick={() => {
                    new AddChatModelModal(app, plugin).open()
                  }}
                >
                  添加模型
                </button>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
