import { App } from 'obsidian'

import ZhinengchuangzuoPlugin from '../../main'

import { ChatSection } from './sections/ChatSection'
import { ContextManagementSection } from './sections/ContextManagementSection'
import { EtcSection } from './sections/EtcSection'
import { HandleSection } from './sections/HandleSection'
import { ModelsSection } from './sections/ModelsSection'
import { ProvidersSection } from './sections/ProvidersSection'
import { TemplateSection } from './sections/TemplateSection'

type SettingsTabRootProps = {
  app: App
  plugin: ZhinengchuangzuoPlugin
}

export function SettingsTabRoot({ app, plugin }: SettingsTabRootProps) {
  return (
    <>
      <ProvidersSection app={app} plugin={plugin} />
      <ModelsSection app={app} plugin={plugin} />
      <ChatSection />
      <HandleSection app={app} />
      <TemplateSection app={app} />
      <ContextManagementSection app={app} plugin={plugin} />
      <EtcSection app={app} plugin={plugin} />
    </>
  )
}
