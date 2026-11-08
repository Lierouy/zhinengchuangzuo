import { App } from 'obsidian'

import { SettingsProvider } from '../../contexts/settings-context'
import ZhinengchuangzuoPlugin from '../../main'
import { ReactModal } from '../common/ReactModal'
import { HandleSection } from '../settings/sections/HandleSection'

type HandleSectionModalContentProps = {
  plugin: ZhinengchuangzuoPlugin
}

function HandleSectionModalContent({ plugin }: HandleSectionModalContentProps) {
  return (
    <SettingsProvider
      settings={plugin.settings}
      setSettings={(newSettings) => plugin.setSettings(newSettings)}
      addSettingsChangeListener={(listener) =>
        plugin.addSettingsChangeListener(listener)
      }
    >
      <HandleSection plugin={plugin} showRequired={true} />
    </SettingsProvider>
  )
}

export class HandleSectionModal extends ReactModal<HandleSectionModalContentProps> {
  constructor(app: App, plugin: ZhinengchuangzuoPlugin) {
    super({
      app: app,
      Component: HandleSectionModalContent,
      props: {
        plugin,
      },
    })
    this.modalEl.style.width = '720px'
  }
}
