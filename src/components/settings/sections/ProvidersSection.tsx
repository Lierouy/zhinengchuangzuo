import { Settings, Trash } from 'lucide-react'
import { App } from 'obsidian'

import { DEFAULT_PROVIDERS, PROVIDER_TYPES_INFO } from '../../../constants'
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
  const { settings, setSettings } = useSettings()
  const apiProviders = settings.providers.filter(
    (p) => !String(p.type).endsWith('-plan'),
  )

  const handleDeleteProvider = async (provider: LLMProvider) => {
    // Get associated models
    const associatedChatModels = settings.chatModels.filter(
      (m) => m.providerId === provider.id,
    )

    const message =
      `确定要删除供应商“ ${provider.id} ”吗？\n` +
      `同时也会删除 ${associatedChatModels.length} 个模型。`

    new ConfirmModal(app, {
      title: '删除供应商',
      message: message,
      ctaText: '确定',
      onConfirm: async () => {
        await setSettings({
          ...settings,
          providers: [...settings.providers].filter(
            (v) => v.id !== provider.id,
          ),
          chatModels: [...settings.chatModels].filter(
            (v) => v.providerId !== provider.id,
          ),
        })
      },
    }).open()
  }

  return (
    <div className="zncz-settings-section">
      <div className="zncz-settings-header">供应商</div>

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
            {apiProviders.map((provider) => (
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
                    {!DEFAULT_PROVIDERS.some((v) => v.id === provider.id) && (
                      <button
                        onClick={() => handleDeleteProvider(provider)}
                        className="clickable-icon"
                      >
                        <Trash />
                      </button>
                    )}
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
                    new AddProviderModal(app, plugin).open()
                  }}
                >
                  添加供应商
                </button>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
