import isEqual from 'lodash.isequal'
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

const arrayLength = (value: unknown): number =>
  Array.isArray(value) ? value.length : 0

/** True when parsing replaced a non-empty provider/model list with an empty one. */
function lostSettingsEntries(
  raw: Record<string, unknown>,
  parsed: ZhinengchuangzuoSettings,
): boolean {
  return (
    (arrayLength(raw.providers) > 0 && parsed.providers.length === 0) ||
    (arrayLength(raw.chatModels) > 0 && parsed.chatModels.length === 0)
  )
}

export default class ZhinengchuangzuoPlugin extends Plugin {
  override settings!: ZhinengchuangzuoSettings
  settingsChangeListeners: ((newSettings: ZhinengchuangzuoSettings) => void)[] =
    []
  private dataResetListeners: (() => void)[] = []
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
  /** Raw settings file, or `null` when it does not exist. Throws on bad JSON. */
  private async readSettingsFile(): Promise<Record<string, unknown> | null> {
    const filePath = this.settingsFilePath
    if (!(await this.app.vault.adapter.exists(filePath))) return null
    const content = await this.app.vault.adapter.read(filePath)
    return JSON.parse(content) as Record<string, unknown>
  }

  /** Keeps the previous file so normalization can never destroy it silently. */
  private async backupSettingsFile(): Promise<void> {
    const filePath = this.settingsFilePath
    if (!(await this.app.vault.adapter.exists(filePath))) return
    const content = await this.app.vault.adapter.read(filePath)
    await this.app.vault.adapter.write(`${filePath}.bak`, content)
  }

  override async loadData(): Promise<Record<string, unknown>> {
    try {
      return (await this.readSettingsFile()) ?? {}
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

  /**
   * Loads and normalizes the settings. The file is only rewritten when parsing
   * actually changed something, and never without keeping a backup first: the
   * schema replaces invalid arrays wholesale, so an unconditional write could
   * silently drop providers or models.
   */
  async loadSettings() {
    let raw: Record<string, unknown> | null = null
    let unreadable = false
    try {
      raw = await this.readSettingsFile()
    } catch (error) {
      unreadable = true
      console.error('Failed to parse settings', error)
    }

    const parsed = parseZhinengchuangzuoSettings(raw ?? {})
    this.settings = parsed

    if (unreadable) {
      await this.backupSettingsFile()
      await this.saveData(parsed)
      new Notice(
        'The settings file could not be read, backup was saved as config.json.bak',
      )
      return
    }

    // First run: create the file so it is easy to find and edit.
    if (raw === null) {
      await this.saveData(parsed)
      return
    }

    // Key order is irrelevant: only a real change should touch the file.
    if (isEqual(parsed, raw)) return

    await this.backupSettingsFile()
    await this.saveData(parsed)

    if (lostSettingsEntries(raw, parsed)) {
      new Notice(
        'Providers or models could not be read and were reset, backup was saved as config.json.bak',
      )
    }
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

  /** Subscribes to the "all user data was deleted" reset. */
  onDataReset(listener: () => void): () => void {
    this.dataResetListeners.push(listener)
    return () => {
      this.dataResetListeners = this.dataResetListeners.filter(
        (l) => l !== listener,
      )
    }
  }

  /** Tells open views that their cached data no longer exists on disk. */
  emitDataReset(): void {
    for (const listener of [...this.dataResetListeners]) {
      try {
        listener()
      } catch (error) {
        console.error('Data reset listener failed', error)
      }
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
