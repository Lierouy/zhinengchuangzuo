import { App } from 'obsidian'

import { SettingsProvider } from '../../contexts/settings-context'
import ZhinengchuangzuoPlugin from '../../main'
import { ReactModal } from '../common/ReactModal'
import { ContextManagementSection } from '../settings/sections/ContextManagementSection'

type ContextManagementModalContentProps = {
  app: App
  plugin: ZhinengchuangzuoPlugin
  onClose?: () => void
}

function ContextManagementModalContent({
  app,
  plugin,
}: ContextManagementModalContentProps) {
  return (
    <SettingsProvider
      settings={plugin.settings}
      setSettings={(newSettings) => plugin.setSettings(newSettings)}
      addSettingsChangeListener={(listener) =>
        plugin.addSettingsChangeListener(listener)
      }
    >
      <ContextManagementSection app={app} plugin={plugin} showRequired={true} />
    </SettingsProvider>
  )
}

export class ContextManagementModal extends ReactModal<ContextManagementModalContentProps> {
  constructor(app: App, plugin: ZhinengchuangzuoPlugin) {
    super({
      app: app,
      Component: ContextManagementModalContent,
      props: {
        app,
        plugin,
      },
    })
    this.modalEl.style.width = '720px'
  }
}
