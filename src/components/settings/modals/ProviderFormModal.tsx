import { App, Notice } from 'obsidian'
import { useState } from 'react'

import { PROVIDER_TYPES_INFO } from '../../../constants'
import { DuplicateProviderException } from '../../../database/exception'
import ZhinengchuangzuoPlugin from '../../../main'
import {
  LLMProvider,
  LLMProviderType,
  llmProviderSchema,
} from '../../../types/provider.types'
import { ObsidianButton } from '../../common/ObsidianButton'
import { ObsidianDropdown } from '../../common/ObsidianDropdown'
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
        title: '添加供应商',
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
        title: `编辑供应商：${provider.id}`,
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

  const handleSubmit = async () => {
    try {
      if (provider) {
        const newProviders = [...plugin.settings.providers]
        const currentProviderIndex = newProviders.findIndex(
          (v) => v.id === provider.id,
        )

        if (currentProviderIndex === -1) {
          new Notice(`This ID has no supplier`)
          return
        }

        const validationResult = llmProviderSchema.safeParse(formData)
        if (!validationResult.success) {
          new Notice(
            validationResult.error.issues.map((v) => v.message).join('\n'),
          )
          return
        }

        await plugin.setSettings({
          ...plugin.settings,
          providers: [
            ...plugin.settings.providers.slice(0, currentProviderIndex),
            formData,
            ...plugin.settings.providers.slice(currentProviderIndex + 1),
          ],
        })
      } else {
        if (
          plugin.settings.providers.some(
            (p: LLMProvider) => p.id === formData.id,
          )
        ) {
          throw new DuplicateProviderException(formData.id)
        }

        const validationResult = llmProviderSchema.safeParse(formData)
        if (!validationResult.success) {
          new Notice(
            validationResult.error.issues.map((v) => v.message).join('\n'),
          )
          return
        }

        await plugin.setSettings({
          ...plugin.settings,
          providers: [...plugin.settings.providers, formData],
        })
      }

      onClose()
    } catch (error) {
      if (error instanceof DuplicateProviderException) {
        new Notice(error.message)
      } else {
        throw error
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
              onChange={(value: string) =>
                setFormData((prev) => ({ ...prev, id: value }))
              }
            />
          </ObsidianSetting>
        </>
      )}

      {!String(formData.type).endsWith('-plan') && (
        <>
          <ObsidianSetting name="供应商类型" required>
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
            <ObsidianTextInput
              value={formData.apiKey ?? ''}
              onChange={(value: string) =>
                setFormData((prev) => ({ ...prev, apiKey: value }))
              }
            />
          </ObsidianSetting>
        </>
      )}

      <ObsidianSetting
        name="模型思考字段"
        desc="如果会话中无法显示思考过程，可以浏览供应商官方文档查找并填写思考字段，留空使用默认字段。"
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
        <ObsidianButton
          text={provider ? '保存' : '添加'}
          onClick={handleSubmit}
          cta
        />
        <ObsidianButton text="取消" onClick={onClose} />
      </ObsidianSetting>
    </>
  )
}
