import { App, Notice } from 'obsidian'
import { useState } from 'react'

import { MAX_NAME_LENGTH, PROVIDER_TYPES_INFO } from '../../../constants'
import { duplicateProvider, isDatabaseError } from '../../../database/exception'
import ZhinengchuangzuoPlugin from '../../../main'
import {
  LLMProvider,
  LLMProviderType,
  llmProviderSchema,
} from '../../../types/provider.types'
import { syncModelsProviderType } from '../../../utils/chat/chatModel'
import { CONSOLE_HINT, reportError } from '../../../utils/reportError'
import { ObsidianButton } from '../../common/ObsidianButton'
import { ObsidianDropdown } from '../../common/ObsidianDropdown'
import { ObsidianSecretPicker } from '../../common/ObsidianSecretPicker'
import { ObsidianSetting } from '../../common/ObsidianSetting'
import { ObsidianTextInput } from '../../common/ObsidianTextInput'
import { ObsidianToggle } from '../../common/ObsidianToggle'
import { ReactModal } from '../../common/ReactModal'

type ProviderFormComponentProps = {
  plugin: ZhinengchuangzuoPlugin
  provider: LLMProvider | null // null for new provider
  onClose: () => void
}

export class AddProviderModal extends ReactModal<ProviderFormComponentProps> {
  constructor(app: App, plugin: ZhinengchuangzuoPlugin) {
    super({
      app: app,
      Component: ProviderFormComponent,
      props: { plugin, provider: null },
      options: {
        title: '添加提供商',
      },
    })
  }
}

export class EditProviderModal extends ReactModal<ProviderFormComponentProps> {
  constructor(app: App, plugin: ZhinengchuangzuoPlugin, provider: LLMProvider) {
    super({
      app: app,
      Component: ProviderFormComponent,
      props: { plugin, provider },
      options: {
        title: `编辑提供商：${provider.id}`,
      },
    })
  }
}

function ProviderFormComponent({
  plugin,
  provider,
  onClose,
}: ProviderFormComponentProps) {
  const [formData, setFormData] = useState<LLMProvider>(
    provider
      ? { ...provider }
      : {
          type: 'openai-compatible',
          id: '',
          apiKey: '',
          baseUrl: '',
        },
  )

  const apiKeyId = formData.apiKey ?? ''

  const handleSubmit = async () => {
    try {
      const validationResult = llmProviderSchema.safeParse({
        ...formData,
        // The name is fixed while editing, so it can never be blanked by a
        // stale form value.
        id: provider?.id ?? formData.id,
      })
      if (!validationResult.success) {
        new Notice(
          validationResult.error.issues.map((v) => v.message).join('\n'),
        )
        return
      }
      // Save the parsed value, not the form state: the schema is what strips
      // unknown keys and applies defaults, so persisting `formData` would keep
      // whatever the form happened to hold.
      const providerData = validationResult.data

      const providers = plugin.settings.providers
      const editIndex = provider
        ? providers.findIndex((v) => v.id === provider.id)
        : -1

      if (provider && editIndex === -1) {
        new Notice('This provider was deleted in the meantime')
        return
      }
      if (editIndex === -1 && providers.some((p) => p.id === providerData.id)) {
        throw duplicateProvider(providerData.id)
      }

      // Models carry their own copy of the provider type, so changing it here
      // has to propagate or every model under this provider would fail the
      // client's type guard on its next request.
      const chatModels = syncModelsProviderType(
        plugin.settings.chatModels,
        providerData.id,
        providerData.type,
      )

      await plugin.setSettings({
        ...plugin.settings,
        providers:
          editIndex === -1
            ? [...providers, providerData]
            : [
                ...providers.slice(0, editIndex),
                providerData,
                ...providers.slice(editIndex + 1),
              ],
        chatModels,
      })

      onClose()
    } catch (error) {
      if (isDatabaseError(error, 'duplicate-provider')) {
        new Notice(error.message)
      } else {
        reportError(`Failed to save the provider, ${CONSOLE_HINT}`, error)
      }
    }
  }

  const providerTypeInfo = PROVIDER_TYPES_INFO[formData.type]

  return (
    <>
      {!provider && (
        <>
          <ObsidianSetting name="名称" required>
            <ObsidianTextInput
              value={formData.id}
              maxLength={MAX_NAME_LENGTH}
              onChange={(value: string) =>
                setFormData((prev) => ({ ...prev, id: value }))
              }
            />
          </ObsidianSetting>
        </>
      )}

      <>
        <ObsidianSetting name="提供商类型" required>
          <div style={{ marginTop: '8px' }}></div>
          <ObsidianDropdown
            value={formData.type}
            options={Object.fromEntries(
              Object.entries(PROVIDER_TYPES_INFO).map(([key, info]) => [
                key,
                info.label,
              ]),
            )}
            onChange={(value: LLMProviderType) =>
              setFormData(
                (prev) =>
                  ({
                    ...prev,
                    type: value,
                    additionalSettings: {},
                  }) as LLMProvider,
              )
            }
          />
        </ObsidianSetting>

        <ObsidianSetting name="URL 地址" required>
          <div style={{ marginTop: '8px' }}></div>
          <ObsidianTextInput
            value={formData.baseUrl ?? ''}
            onChange={(value: string) =>
              setFormData((prev) => ({ ...prev, baseUrl: value }))
            }
          />
        </ObsidianSetting>

        <ObsidianSetting name="API 密钥" required>
          <div style={{ marginTop: '8px' }}></div>
          <ObsidianSecretPicker
            value={apiKeyId}
            onChange={(value: string) =>
              setFormData((prev) => ({ ...prev, apiKey: value }))
            }
          />
        </ObsidianSetting>
      </>

      <ObsidianSetting
        name="模型思考字段"
        desc="如果消息中没有思考内容，可以浏览提供商文档查找并填写思考字段，留空使用默认字段。"
      >
        <div style={{ marginTop: '8px' }}></div>
        <ObsidianTextInput
          value={formData.customReasoningField ?? ''}
          onChange={(value: string) =>
            setFormData((prev) => ({
              ...prev,
              customReasoningField: value.trim() || undefined,
            }))
          }
        />
      </ObsidianSetting>

      {providerTypeInfo.additionalSettings.map((setting) => (
        <ObsidianSetting
          key={setting.key}
          name={setting.label}
          desc={'description' in setting ? setting.description : undefined}
          required={setting.required}
        >
          <div style={{ marginTop: '3px' }}></div>
          {setting.type === 'toggle' ? (
            <ObsidianToggle
              value={
                (formData.additionalSettings as Record<string, boolean>)?.[
                  setting.key
                ] ?? false
              }
              onChange={(value: boolean) =>
                setFormData((prev) => ({
                  ...prev,
                  additionalSettings: {
                    ...(prev.additionalSettings ?? {}),
                    [setting.key]: value,
                  },
                }))
              }
            />
          ) : (
            <ObsidianTextInput
              value={
                (formData.additionalSettings as Record<string, string>)?.[
                  setting.key
                ] ?? ''
              }
              placeholder={
                (setting as { placeholder?: string }).placeholder ?? ''
              }
              onChange={(value: string) =>
                setFormData(
                  (prev) =>
                    ({
                      ...prev,
                      additionalSettings: {
                        ...(prev.additionalSettings ?? {}),
                        [setting.key]: value,
                      },
                    }) as unknown as LLMProvider,
                )
              }
            />
          )}
        </ObsidianSetting>
      ))}

      <ObsidianSetting>
        <div style={{ marginTop: '3px' }}></div>
        {/* Cancel on the left, action on the right — same order as Obsidian's
            own modals. */}
        <ObsidianButton text="取消" onClick={onClose} />
        <ObsidianButton
          text={provider ? '保存' : '添加'}
          onClick={handleSubmit}
          cta
        />
      </ObsidianSetting>
    </>
  )
}
