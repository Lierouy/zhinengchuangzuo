import { Check, Edit, Trash, X } from 'lucide-react'
import { App, Notice } from 'obsidian'
import { useState } from 'react'

import { DuplicateChatModelException } from '../../../database/exception'
import ZhinengchuangzuoPlugin from '../../../main'
import { ChatModel, chatModelSchema } from '../../../types/chat-model.types'
import { sanitizeModelSettings } from '../../../utils/model-settings'
import { ObsidianButton } from '../../common/ObsidianButton'
import { ObsidianDropdown } from '../../common/ObsidianDropdown'
import { ObsidianNumberInput } from '../../common/ObsidianNumberInput'
import { ObsidianSetting } from '../../common/ObsidianSetting'
import { ObsidianTextInput } from '../../common/ObsidianTextInput'
import { ObsidianToggle } from '../../common/ObsidianToggle'
import { ReactModal } from '../../common/ReactModal'
import { useEditableList } from '../../common/useEditableList'

type ChatModelFormComponentProps = {
  plugin: ZhinengchuangzuoPlugin
  chatModel: ChatModel | null // null for new model
  onClose: () => void
}

export class AddChatModelModal extends ReactModal<ChatModelFormComponentProps> {
  constructor(app: App, plugin: ZhinengchuangzuoPlugin) {
    super({
      app: app,
      Component: ChatModelFormComponent,
      props: { plugin, chatModel: null },
      options: {
        title: '添加模型',
      },
    })
  }
}

export class EditChatModelModal extends ReactModal<ChatModelFormComponentProps> {
  constructor(app: App, plugin: ZhinengchuangzuoPlugin, chatModel: ChatModel) {
    super({
      app: app,
      Component: ChatModelFormComponent,
      props: { plugin, chatModel },
      options: {
        title: `编辑模型：${chatModel.model}`,
      },
    })
  }
}

function ChatModelFormComponent({
  plugin,
  chatModel,
  onClose,
}: ChatModelFormComponentProps) {
  const [formData, setFormData] = useState<{
    providerId: string
    providerType: string
    id: string
    model: string
    settings?: {
      temperature?: number
      topP?: number
      contextCount?: number
      maxTokens?: number
      streamOutput?: boolean
      customParameters?: string[]
    }
  }>(
    chatModel
      ? { ...chatModel }
      : {
          providerId: '',
          providerType: 'openai-compatible',
          id: '',
          model: '',
          settings: {
            streamOutput: true,
            customParameters: [],
          },
        },
  )
  const customParameters = formData.settings?.customParameters ?? []
  const paramList = useEditableList(
    customParameters,
    (next) =>
      setFormData((prev) => ({
        ...prev,
        settings: { ...prev.settings, customParameters: next },
      })),
    'The parameter content cannot be empty',
  )

  const updateNumericSetting = (
    key: 'temperature' | 'topP' | 'maxTokens' | 'contextCount',
    value: number | undefined,
  ) => {
    setFormData((prev) => ({
      ...prev,
      settings: { ...prev.settings, [key]: value },
    }))
  }

  const handleSubmit = async () => {
    try {
      const { chatModels, providers } = plugin.settings
      const editIndex = chatModel
        ? chatModels.findIndex((v) => v.model === chatModel.model)
        : -1

      if (!chatModel && chatModels.some((p) => p.model === formData.model)) {
        throw new DuplicateChatModelException(formData.model)
      }
      if (chatModel && editIndex === -1) {
        new Notice(`This model has no model`)
        return
      }
      if (!providers.some((provider) => provider.id === formData.providerId)) {
        new Notice('Provider with this ID does not exist')
        return
      }

      const completeData = {
        ...formData,
        settings: formData.settings
          ? sanitizeModelSettings(formData.settings)
          : undefined,
        enable: chatModel ? chatModel.enable : true,
      } as ChatModel

      const validationResult = chatModelSchema.safeParse(completeData)
      if (!validationResult.success) {
        new Notice(
          validationResult.error.issues.map((v) => v.message).join('\n'),
        )
        return
      }

      if (chatModel) {
        await plugin.setSettings({
          ...plugin.settings,
          chatModels: [
            ...chatModels.slice(0, editIndex),
            completeData,
            ...chatModels.slice(editIndex + 1),
          ],
          chatModelId:
            plugin.settings.chatModelId === chatModel.model
              ? formData.model
              : plugin.settings.chatModelId,
        })
      } else {
        await plugin.setSettings({
          ...plugin.settings,
          chatModels: [...chatModels, completeData],
        })
      }

      onClose()
    } catch (error) {
      if (error instanceof DuplicateChatModelException) {
        new Notice(error.message)
      } else {
        throw error
      }
    }
  }

  return (
    <>
      {!chatModel && (
        <ObsidianSetting name="名称" required>
          <ObsidianTextInput
            value={formData.model}
            onChange={(value: string) =>
              setFormData((prev) => ({ ...prev, model: value }))
            }
          />
        </ObsidianSetting>
      )}

      <ObsidianSetting name="供应商" required>
        <div style={{ marginTop: '8px' }}>
          <ObsidianDropdown
            value={formData.providerId}
            options={Object.fromEntries(
              plugin.settings.providers.map((provider) => [
                provider.id,
                provider.id,
              ]),
            )}
            onChange={(value: string) => {
              const provider = plugin.settings.providers.find(
                (p) => p.id === value,
              )
              if (!provider) {
                new Notice(`Provider with ID ${value} not found`)
                return
              }
              setFormData((prev) => ({
                ...prev,
                providerId: value,
                providerType: provider.type,
              }))
            }}
          />
        </div>
      </ObsidianSetting>

      <ObsidianSetting
        name="模型 ID"
        desc="填写供应商提供的模型 ID 调用对应的模型。"
        required
      >
        <div style={{ marginTop: '8px' }}>
          <ObsidianTextInput
            value={formData.id}
            onChange={(value: string) =>
              setFormData((prev) => ({ ...prev, id: value }))
            }
          />
        </div>
      </ObsidianSetting>

      {/* --- API Tunable Settings --- */}
      <ObsidianSetting name="采样温度">
        <div style={{ marginTop: '4px' }}>
          <ObsidianNumberInput
            value={formData.settings?.temperature}
            onChange={(n) => updateNumericSetting('temperature', n)}
          />
        </div>
      </ObsidianSetting>

      <ObsidianSetting name="核心采样">
        <div style={{ marginTop: '8px' }}>
          <ObsidianNumberInput
            value={formData.settings?.topP}
            onChange={(n) => updateNumericSetting('topP', n)}
          />
        </div>
      </ObsidianSetting>

      <ObsidianSetting name="输出词元数量">
        <div style={{ marginTop: '8px' }}>
          <ObsidianNumberInput
            value={formData.settings?.maxTokens}
            onChange={(n) => updateNumericSetting('maxTokens', n)}
          />
        </div>
      </ObsidianSetting>

      <ObsidianSetting
        name="历史消息数量"
        desc="发送消息时包含的过去消息数量上限，留空使用默认值 50。"
      >
        <div style={{ marginTop: '8px' }}>
          <ObsidianNumberInput
            value={formData.settings?.contextCount}
            onChange={(n) => updateNumericSetting('contextCount', n)}
          />
        </div>
      </ObsidianSetting>

      <ObsidianSetting name="流式输出">
        <div style={{ marginTop: '4px' }}>
          <ObsidianToggle
            value={!!formData.settings?.streamOutput}
            onChange={(v) =>
              setFormData((prev) => ({
                ...prev,
                settings: { ...prev.settings, streamOutput: v },
              }))
            }
          />
        </div>
      </ObsidianSetting>
      <div
        style={{
          marginTop: '8px',
          marginBottom: '16px',
          borderBottom: '1px solid var(--background-modifier-border)',
        }}
      />

      <ObsidianSetting
        name="自定义参数"
        desc="填写发送给模型的参数字段或 JSON 片段。"
      />
      <div className="zncz-settings-table-container">
        <table className="zncz-settings-table">
          <colgroup>
            <col width="90%" />
            <col width="10%" />
          </colgroup>
          <tbody>
            {customParameters.map((param, idx) => (
              <tr key={idx}>
                <td>
                  {paramList.editingIndex === idx ? (
                    <ObsidianTextInput
                      value={paramList.editingValue}
                      onChange={paramList.setEditingValue}
                    />
                  ) : (
                    <div>{param}</div>
                  )}
                </td>
                <td>
                  <div className="zncz-settings-actions">
                    {paramList.editingIndex === idx ? (
                      <>
                        <button
                          onClick={paramList.commitEdit}
                          className="clickable-icon"
                        >
                          <Check size={16} />
                        </button>
                        <button
                          onClick={paramList.cancelEdit}
                          className="clickable-icon"
                        >
                          <X size={16} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => paramList.startEdit(idx)}
                          className="clickable-icon"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => paramList.remove(idx)}
                          className="clickable-icon"
                        >
                          <Trash size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {paramList.isAdding && (
              <tr>
                <td>
                  <ObsidianTextInput
                    value={paramList.newValue}
                    onChange={paramList.setNewValue}
                  />
                </td>
                <td>
                  <div className="zncz-settings-actions">
                    <button
                      onClick={paramList.commitAdd}
                      className="clickable-icon"
                    >
                      <Check size={16} />
                    </button>
                    <button
                      onClick={paramList.cancelAdd}
                      className="clickable-icon"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>

          <tfoot>
            <tr>
              <td colSpan={2}>
                <button
                  onClick={paramList.startAdd}
                  disabled={paramList.isAdding}
                >
                  添加参数
                </button>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <ObsidianSetting>
        <ObsidianButton
          text={chatModel ? '保存' : '添加'}
          onClick={handleSubmit}
          cta
        />
        <ObsidianButton text="取消" onClick={onClose} />
      </ObsidianSetting>
    </>
  )
}
