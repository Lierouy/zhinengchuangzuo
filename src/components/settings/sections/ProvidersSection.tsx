import { Settings, Trash } from 'lucide-react'
import { App } from 'obsidian'

import { PROVIDER_TYPES_INFO } from '../../../constants'
import { useSettings } from '../../../contexts/settings-context'
import ZhinengchuangzuoPlugin from '../../../main'
import { LLMProvider } from '../../../types/provider.types'
import { ConfirmModal } from '../../modals/ConfirmModal'
import {
  AddProviderModal,
  EditProviderModal,
} from '../modals/ProviderFormModal'

type ProvidersSectionProps = {
  app: App
  plugin: ZhinengchuangzuoPlugin
}

export function ProvidersSection({ app, plugin }: ProvidersSectionProps) {
  // Only used for rendering. Writes below read `plugin.settings` at call time so
  // a render snapshot can never resurrect entries that were removed meanwhile.
  const { settings } = useSettings()

  const handleDeleteProvider = async (provider: LLMProvider) => {
    // Get associated models
    const associatedChatModels = plugin.settings.chatModels.filter(
      (m) => m.providerId === provider.id,
    )

    const message =
      `确定要删除提供商“ ${provider.id} ”吗？\n` +
      `同时也会删除 ${associatedChatModels.length} 个模型。`

    new ConfirmModal(app, {
      title: '删除提供商',
      message: message,
      ctaText: '确定',
      onConfirm: async () => {
        const current = plugin.settings
        const removedModels = current.chatModels.filter(
          (m) => m.providerId === provider.id,
        )
        const removedModelNames = new Set(removedModels.map((m) => m.model))

        await plugin.setSettings({
          ...current,
          providers: current.providers.filter((v) => v.id !== provider.id),
          chatModels: current.chatModels.filter(
            (m) => m.providerId !== provider.id,
          ),
          // Dropping the models without this would leave `chatModelId` pointing
          // at a model that no longer exists.
          chatModelId: removedModelNames.has(current.chatModelId)
            ? ''
            : current.chatModelId,
        })
      },
    }).open()
  }

  return (
    <div className="zncz-settings-section">
      <div className="zncz-settings-header">提供商</div>

      <div className="zncz-settings-table-container">
        <table className="zncz-settings-table">
          <colgroup>
            <col width="50%" />
            <col width="40%" />
            <col width="10%" />
          </colgroup>
          <thead>
            <tr>
              <th>名称</th>
              <th>类型</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {settings.providers.map((provider) => (
              <tr key={provider.id}>
                <td>{provider.id}</td>
                <td>{PROVIDER_TYPES_INFO[provider.type].label}</td>
                <td>
                  <div className="zncz-settings-actions">
                    <button
                      onClick={() => {
                        new EditProviderModal(app, plugin, provider).open()
                      }}
                      className="clickable-icon"
                    >
                      <Settings />
                    </button>
                    <button
                      onClick={() => handleDeleteProvider(provider)}
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
              <td colSpan={3}>
                <button
                  onClick={() => {
                    new AddProviderModal(app, plugin).open()
                  }}
                >
                  添加提供商
                </button>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
