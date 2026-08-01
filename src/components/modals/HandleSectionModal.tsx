import { App } from 'obsidian'
import _React from 'react'

import { SettingsProvider } from '../../contexts/settings-context'
import ZhinengchuangzuoPlugin from '../../main'
import { ReactModal } from '../common/ReactModal'
import { HandleSection } from '../settings/sections/HandleSection'

type HandleSectionModalContentProps = {
  app: App
  plugin: ZhinengchuangzuoPlugin
  onClose?: () => void
}

function HandleSectionModalContent({
  app,
  plugin,
}: HandleSectionModalContentProps) {
  return (
    <SettingsProvider
      settings={plugin.settings}
      setSettings={(newSettings) => plugin.setSettings(newSettings)}
      addSettingsChangeListener={(listener) =>
        plugin.addSettingsChangeListener(listener)
      }
    >
      <HandleSection app={app} showRequired={true} />
    </SettingsProvider>
  )
}

type HandleSectionModalProps = {
  app: App
  plugin: ZhinengchuangzuoPlugin
}

export class HandleSectionModal extends ReactModal<HandleSectionModalProps> {
  constructor(app: App, plugin: ZhinengchuangzuoPlugin) {
    super({
      app: app,
      Component: HandleSectionModalContent,
      props: {
        app,
        plugin,
      },
    })
    this.modalEl.style.width = '720px'
  }
}
