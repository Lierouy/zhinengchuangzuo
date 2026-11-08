import {
  Editor,
  MarkdownFileInfo,
  MarkdownView,
  Notice,
  Plugin,
  normalizePath,
} from 'obsidian'

import { ChatView } from './ChatView'
import { handleCurrentFile } from './commands/handleCurrentFile'
import { CHAT_VIEW_TYPE } from './constants'
import { ROOT_DIR } from './database/constants'
import {
  ZhinengchuangzuoSettings,
  zhinengchuangzuoSettingsSchema,
} from './settings/schema/setting.types'
import { parseZhinengchuangzuoSettings } from './settings/schema/settings'
import { ZhinengchuangzuoSettingTab } from './settings/SettingTab'
import { MentionableBlockData } from './types/mentionable'
import { ensureFolderExists, getMentionableBlockData } from './utils/obsidian'

export default class ZhinengchuangzuoPlugin extends Plugin {
  override settings!: ZhinengchuangzuoSettings
  settingsChangeListeners: ((newSettings: ZhinengchuangzuoSettings) => void)[] =
    []
  handleInProgress = false

  private get settingsFilePath(): string {
    return normalizePath(`${ROOT_DIR}/config.json`)
  }

  override async onload() {
    await this.loadSettings()

    this.registerView(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, this))

    // This creates an icon in the left ribbon.
    this.addRibbonIcon('brain', '智能创作', () => this.openChatView())

    // This adds a simple command that can be triggered anywhere
    this.addCommand({
      id: 'open-new-chat',
      name: '开启智能助手会话',
      callback: () => this.openChatView(false),
    })

    this.addCommand({
      id: 'add-selection-to-chat',
      name: '添加选中文本到会话',
      editorCallback: (
        editor: Editor,
        ctx: MarkdownView | MarkdownFileInfo,
      ) => {
        void this.addSelectionToChat(editor, ctx as MarkdownView)
      },
    })

    // Command: Handle current file
    this.addCommand({
      id: 'handle-current-file',
      name: '单独处理当前文件',
      callback: () => handleCurrentFile(this),
    })
    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(new ZhinengchuangzuoSettingTab(this.app, this))
  }

  // Save settings in user_data folder instead of plugin root
  override async loadData(): Promise<Record<string, unknown>> {
    const filePath = this.settingsFilePath
    try {
      if (!(await this.app.vault.adapter.exists(filePath))) {
        return {}
      }
      const content = await this.app.vault.adapter.read(filePath)
      return JSON.parse(content) as Record<string, unknown>
    } catch (e) {
      console.error('Failed to load settings', e)
      return {}
    }
  }

  override async saveData(data: Record<string, unknown>): Promise<void> {
    const filePath = this.settingsFilePath

    await ensureFolderExists(this.app, filePath.split('/').slice(0, -1))

    const content = JSON.stringify(data, null, 2)
    await this.app.vault.adapter.write(filePath, content)
  }

  async loadSettings() {
    this.settings = parseZhinengchuangzuoSettings(await this.loadData())
    await this.saveData(this.settings) // Save updated settings
  }

  async setSettings(newSettings: ZhinengchuangzuoSettings) {
    const validationResult =
      zhinengchuangzuoSettingsSchema.safeParse(newSettings)

    if (!validationResult.success) {
      new Notice(`Invalid settings:
${validationResult.error.issues.map((v) => v.message).join('\n')}`)
      return
    }

    this.settings = newSettings
    await this.saveData(newSettings)
    this.settingsChangeListeners.forEach((listener) => listener(newSettings))
  }

  addSettingsChangeListener(
    listener: (newSettings: ZhinengchuangzuoSettings) => void,
  ) {
    this.settingsChangeListeners.push(listener)
    return () => {
      this.settingsChangeListeners = this.settingsChangeListeners.filter(
        (l) => l !== listener,
      )
    }
  }

  async openChatView(openNewChat = false) {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView)
    const editor = view?.editor
    if (!view || !editor) {
      await this.activateChatView(undefined, openNewChat)
      return
    }
    const selectedBlockData = await getMentionableBlockData(editor, view)
    await this.activateChatView(selectedBlockData ?? undefined, openNewChat)
  }

  /**
   * Opens (or focuses) the chat view and optionally starts a new conversation.
   * The selected block is passed imperatively through `ChatRef` so it can never
   * leak into a later open when the view already exists.
   */
  async activateChatView(
    selectedBlock?: MentionableBlockData,
    openNewChat = false,
  ) {
    let leaf = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0]

    await (leaf ?? this.app.workspace.getRightLeaf(false))?.setViewState({
      type: CHAT_VIEW_TYPE,
      active: true,
    })

    // Re-acquire after setViewState (React may have remounted the component)
    leaf = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0]

    if (leaf && leaf.view instanceof ChatView) {
      if (openNewChat) {
        leaf.view.openNewChat(selectedBlock)
      } else if (selectedBlock) {
        leaf.view.addSelectionToChat(selectedBlock)
      }
      await this.app.workspace.revealLeaf(leaf)
      return
    }

    await this.app.workspace.revealLeaf(
      this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0],
    )
  }

  async addSelectionToChat(editor: Editor, view: MarkdownView) {
    const data = await getMentionableBlockData(editor, view)
    if (!data) return

    const leaves = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)
    if (leaves.length === 0 || !(leaves[0].view instanceof ChatView)) {
      await this.activateChatView(data)
      return
    }

    // bring leaf to foreground (uncollapse sidebar if it's collapsed)
    await this.app.workspace.revealLeaf(leaves[0])

    const chatView = leaves[0].view
    chatView.addSelectionToChat(data)
    chatView.focusMessage()
  }
}
