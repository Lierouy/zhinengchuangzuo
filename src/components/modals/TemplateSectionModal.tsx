import { App } from 'obsidian'

import ZhinengchuangzuoPlugin from '../../main'
import { ReactModal } from '../common/ReactModal'
import { TemplateSection } from '../settings/sections/TemplateSection'

type TemplateSectionProps = {
  app: App
  plugin: ZhinengchuangzuoPlugin
}

export class TemplateSectionModal extends ReactModal<TemplateSectionProps> {
  constructor(app: App, plugin: ZhinengchuangzuoPlugin) {
    super({
      app: app,
      Component: TemplateSection,
      props: {
        app,
        plugin,
      },
    })
    this.modalEl.style.width = '720px'
  }
}
