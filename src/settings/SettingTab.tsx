import { App, PluginSettingTab } from 'obsidian'
import { Root, createRoot } from 'react-dom/client'

import { SettingsTabRoot } from '../components/settings/SettingsTabRoot'
import { AppProvider } from '../contexts/app-context'
import { SettingsProvider } from '../contexts/settings-context'
import ZhinengchuangzuoPlugin from '../main'

export class ZhinengchuangzuoSettingTab extends PluginSettingTab {
  plugin: ZhinengchuangzuoPlugin
  private root: Root | null = null

  constructor(app: App, plugin: ZhinengchuangzuoPlugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  override display(): void {
    const { containerEl } = this
    // `display()` can run again without a preceding `hide()`, which would leave
    // the previous React tree mounted on a detached container with its
    // listeners still attached.
    this.hide()
    containerEl.empty()

    this.root = createRoot(containerEl)
    this.root.render(
      <SettingsProvider
        settings={this.plugin.settings}
        setSettings={(newSettings) => this.plugin.setSettings(newSettings)}
        addSettingsChangeListener={(listener) =>
          this.plugin.addSettingsChangeListener(listener)
        }
      >
        <AppProvider app={this.app}>
          <SettingsTabRoot app={this.app} plugin={this.plugin} />
        </AppProvider>
      </SettingsProvider>,
    )
  }

  override hide(): void {
    if (this.root) {
      this.root.unmount()
      this.root = null
    }
  }
}
