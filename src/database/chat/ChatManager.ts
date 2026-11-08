import isEqual from 'lodash.isequal'
import { App, normalizePath } from 'obsidian'

import { AbstractJsonRepository } from '../base'
import { CHAT_DIR, ROOT_DIR } from '../constants'
import { emptyChatTitle } from '../exception'

import {
  CHAT_INDEX_SCHEMA_VERSION,
  CHAT_SCHEMA_VERSION,
  ChatConversation,
  ChatConversationMetadata,
  ChatIndexEntry,
} from './types'

const CHAT_INDEX_FILE = '_index.json'

type ChatIndexFile = {
  schemaVersion: number
  chats: ChatIndexEntry[]
}

const toIndexEntry = (chat: ChatConversation): ChatIndexEntry => ({
  id: chat.id,
  title: chat.title,
  createdAt: chat.createdAt,
  updatedAt: chat.updatedAt,
})

export const toChatMetadata = (
  chat: ChatConversation,
): ChatConversationMetadata => ({
  id: chat.id,
  title: chat.title,
  createdAt: chat.createdAt,
  updatedAt: chat.updatedAt,
  schemaVersion: chat.schemaVersion,
})

export class ChatManager extends AbstractJsonRepository<
  ChatConversation,
  string
> {
  constructor(app: App) {
    super(app, `${ROOT_DIR}/${CHAT_DIR}`)
  }

  protected generateFileName(chat: ChatConversation): string {
    // only schema version and ID in filename
    // All metadata (title, updatedAt) is stored inside the JSON file
    // No more parsing issues from filename regardless of what title contains
    return `v${CHAT_SCHEMA_VERSION}_${chat.id}.json`
  }

  protected parseFileName(fileName: string): string | null {
    // Parse: v{schemaVersion}_{id}.json
    // Extremely simple and reliable - just get the id
    const regex = new RegExp(`^v${CHAT_SCHEMA_VERSION}_([0-9a-f-]+)\\.json$`)
    const match = fileName.match(regex)
    if (!match) return null

    return match[1] // just return the id
  }

  /**
   * The index card is derived data: it can always be rebuilt from the
   * conversation files, so a missing or corrupt card is never fatal.
   */
  private indexFilePath(): string {
    return normalizePath(`${this.dataDir}/${CHAT_INDEX_FILE}`)
  }

  private async readIndex(): Promise<ChatIndexEntry[]> {
    try {
      const raw = await this.app.vault.adapter.read(this.indexFilePath())
      const parsed = JSON.parse(raw) as Partial<ChatIndexFile>
      if (
        parsed.schemaVersion === CHAT_INDEX_SCHEMA_VERSION &&
        Array.isArray(parsed.chats)
      ) {
        return this.reconcileIndex(parsed.chats)
      }
    } catch {
      // Missing or unreadable card - fall through and rebuild it.
    }
    return this.rebuildIndex()
  }

  /**
   * Keeps the index in sync with the conversation files, so chats added,
   * deleted or restored outside the plugin do not become ghosts or stay
   * invisible. The stored order is preserved and new entries are appended.
   */
  private async reconcileIndex(
    stored: ChatIndexEntry[],
  ): Promise<ChatIndexEntry[]> {
    const files = await this.listMetadata()
    const byId = new Map(files.map((item) => [item.metadata, item.fileName]))
    const kept = stored.filter((entry) => byId.has(entry.id))
    if (kept.length === files.length) return kept

    const known = new Set(kept.map((entry) => entry.id))
    const added: ChatIndexEntry[] = []
    for (const [id, fileName] of byId) {
      if (known.has(id)) continue
      const chat = await this.read(fileName)
      if (!chat) continue
      added.push(toIndexEntry(chat))
      known.add(id)
    }

    const next = [...kept, ...added]
    await this.writeIndex(next)
    return next
  }

  private async writeIndex(chats: ChatIndexEntry[]): Promise<void> {
    await this.ensureDirectory()
    const card: ChatIndexFile = {
      schemaVersion: CHAT_INDEX_SCHEMA_VERSION,
      chats,
    }
    await this.app.vault.adapter.write(
      this.indexFilePath(),
      JSON.stringify(card, null, 2),
    )
  }

  private async rebuildIndex(): Promise<ChatIndexEntry[]> {
    const files = await this.listMetadata()
    const conversations = await Promise.all(
      files.map((item) => this.read(item.fileName)),
    )
    const chats = conversations
      .filter((chat): chat is ChatConversation => chat !== null)
      .map(toIndexEntry)
    await this.writeIndex(chats)
    return chats
  }

  private async upsertIndexEntry(chat: ChatConversation): Promise<void> {
    const chats = await this.readIndex()
    const entry = toIndexEntry(chat)
    await this.writeIndex([entry, ...chats.filter((c) => c.id !== entry.id)])
  }

  private async removeIndexEntry(id: string): Promise<void> {
    const chats = await this.readIndex()
    const remaining = chats.filter((c) => c.id !== id)
    if (remaining.length === chats.length) return
    await this.writeIndex(remaining)
  }

  public async createChat(
    initialData: Partial<ChatConversation>,
  ): Promise<ChatConversation> {
    if (
      initialData.title !== undefined &&
      initialData.title.trim().length === 0
    ) {
      throw emptyChatTitle()
    }

    const now = Date.now()
    const newChat: ChatConversation = {
      id: crypto.randomUUID(),
      title: '新会话',
      messages: [],
      createdAt: now,
      updatedAt: now,
      schemaVersion: CHAT_SCHEMA_VERSION,
      ...initialData,
    }

    await this.create(newChat)
    await this.upsertIndexEntry(newChat)
    return newChat
  }

  public async findById(id: string): Promise<ChatConversation | null> {
    // generateFileName only needs id and schemaVersion
    const fileName = `v${CHAT_SCHEMA_VERSION}_${id}.json`
    return this.read(fileName)
  }

  public async updateChat(
    id: string,
    updates: Partial<
      Omit<ChatConversation, 'id' | 'createdAt' | 'updatedAt' | 'schemaVersion'>
    >,
  ): Promise<ChatConversation | null> {
    const chat = await this.findById(id)
    if (!chat) return null

    if (updates.title !== undefined && updates.title.length === 0) {
      throw emptyChatTitle()
    }

    const updatedChat: ChatConversation = {
      ...chat,
      ...updates,
      updatedAt: Date.now(),
    }

    await this.update(chat, updatedChat)
    await this.upsertIndexEntry(updatedChat)
    return updatedChat
  }

  /**
   * Message-only save: reads the conversation once, compares, and writes.
   * Returns the stored conversation (unchanged if nothing differed).
   */
  public async updateMessages(
    id: string,
    messages: ChatConversation['messages'],
  ): Promise<ChatConversation | null> {
    const chat = await this.findById(id)
    if (!chat) return null
    if (isEqual(chat.messages, messages)) return chat

    const updatedChat: ChatConversation = {
      ...chat,
      messages,
      updatedAt: Date.now(),
    }
    await this.update(chat, updatedChat)
    await this.upsertIndexEntry(updatedChat)
    return updatedChat
  }

  public async deleteChat(id: string): Promise<boolean> {
    const fileName = `v${CHAT_SCHEMA_VERSION}_${id}.json`
    const exists = await this.app.vault.adapter.exists(
      `${this.dataDir}/${fileName}`,
    )
    if (!exists) return false

    await this.delete(fileName)
    await this.removeIndexEntry(id)
    return true
  }

  public async listChats(): Promise<ChatConversationMetadata[]> {
    const chats = await this.readIndex()
    return chats
      .map((chat) => ({ ...chat, schemaVersion: CHAT_SCHEMA_VERSION }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }
}
