import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'

import { useOwnerDocument } from '../../contexts/chat-container-context'
import { useSettings } from '../../contexts/settings-context'

export function ModelSelect() {
  const { settings, setSettings } = useSettings()
  const [isOpen, setIsOpen] = useState(false)
  const ownerDocument = useOwnerDocument()
  const enabledChatModels = settings.chatModels.filter(
    ({ enable }) => enable ?? true,
  )
  const hasModels = enabledChatModels.length > 0
  const currentModel = hasModels
    ? settings.chatModels.find((m) => m.model === settings.chatModelId)
    : null
  const displayText =
    hasModels && currentModel ? currentModel.model : '前往设置界面添加模型'

  return (
    <DropdownMenu.Root open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenu.Trigger className="zncz-chat-input-model-select">
        <div className="zncz-chat-input-model-select__model-name">
          {displayText}
        </div>
        <div className="zncz-chat-input-model-select__icon">
          {isOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        </div>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal container={ownerDocument.body}>
        <DropdownMenu.Content
          className="zncz-popover"
          sideOffset={3}
          collisionPadding={4}
          avoidCollisions={true}
        >
          <ul>
            {hasModels ? (
              enabledChatModels.map((chatModelOption) => (
                <DropdownMenu.Item
                  key={chatModelOption.model}
                  onSelect={() => {
                    setSettings({
                      ...settings,
                      chatModelId: chatModelOption.model,
                    })
                  }}
                  asChild
                >
                  <li>{chatModelOption.model}</li>
                </DropdownMenu.Item>
              ))
            ) : (
              <li style={{ color: 'var(--text-muted)' }}>
                前往设置界面添加模型
              </li>
            )}
          </ul>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
