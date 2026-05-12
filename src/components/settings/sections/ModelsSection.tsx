import { Settings, Trash } from 'lucide-react'
import { App } from 'obsidian'

import { DEFAULT_CHAT_MODELS } from '../../../constants'
import { useSettings } from '../../../contexts/settings-context'
import ZhinengchuangzuoPlugin from '../../../main'
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

const isEnabled = (enable: boolean | undefined | null) => enable ?? true

export function ModelsSection({ app, plugin }: ModelsSectionProps) {
  const { settings, setSettings } = useSettings()

  const handleDeleteChatModel = async (modelId: string) => {
    const message = `确定要删除模型“ ${modelId} ”吗？`
    new ConfirmModal(app, {
      title: '删除模型',
      message: message,
      ctaText: '确定',
      onConfirm: async () => {
        await setSettings({
          ...settings,
          chatModels: [...settings.chatModels].filter(
            (v) => v.model !== modelId,
          ),
          chatModelId:
            settings.chatModelId === modelId ? '' : settings.chatModelId,
        })
      },
    }).open()
  }

  const handleToggleEnableChatModel = async (
    modelId: string,
    value: boolean,
  ) => {
    await setSettings({
      ...settings,
      chatModels: [...settings.chatModels].map((v) =>
        v.model === modelId ? { ...v, enable: value } : v,
      ),
      ...(!value && modelId === settings.chatModelId
        ? { chatModelId: '' }
        : {}),
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
                    value={isEnabled(chatModel.enable)}
                    onChange={(value: boolean) =>
                      handleToggleEnableChatModel(chatModel.model, value)
                    }
                  />
                </td>
                <td>
                  <div className="zncz-settings-actions">
                    {!DEFAULT_CHAT_MODELS.some(
                      (v) => v.model === chatModel.model,
                    ) && (
                      <>
                        <button
                          onClick={() =>
                            new EditChatModelModal(
                              app,
                              plugin,
                              chatModel,
                            ).open()
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
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5}>
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
