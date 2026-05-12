import { App } from 'obsidian'
import { v4 as uuidv4 } from 'uuid'

import { AbstractJsonRepository } from '../base'
import { CHAT_DIR, ROOT_DIR } from '../constants'
import { EmptyChatTitleException } from '../exception'

import {
  CHAT_SCHEMA_VERSION,
  ChatConversation,
  ChatConversationMetadata,
} from './types'

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
    return `v${chat.schemaVersion}_${chat.id}.json`
  }

  protected parseFileName(fileName: string): string | null {
    // Parse: v{schemaVersion}_{id}.json
    // Extremely simple and reliable - just get the id
    const regex = new RegExp(`^v${CHAT_SCHEMA_VERSION}_([0-9a-f-]+)\\.json$`)
    const match = fileName.match(regex)
    if (!match) return null

    return match[1] // just return the id
  }

  public async createChat(
    initialData: Partial<ChatConversation>,
  ): Promise<ChatConversation> {
    if (initialData.title && initialData.title.length === 0) {
      throw new EmptyChatTitleException()
    }

    const now = Date.now()
    const newChat: ChatConversation = {
      id: uuidv4(),
      title: '新会话',
      messages: [],
      createdAt: now,
      updatedAt: now,
      schemaVersion: CHAT_SCHEMA_VERSION,
      ...initialData,
    }

    await this.create(newChat)
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
      throw new EmptyChatTitleException()
    }

    const updatedChat: ChatConversation = {
      ...chat,
      ...updates,
      updatedAt: Date.now(),
    }

    await this.update(chat, updatedChat)
    return updatedChat
  }

  public async deleteChat(id: string): Promise<boolean> {
    const fileName = `v${CHAT_SCHEMA_VERSION}_${id}.json`
    const exists = await this.app.vault.adapter.exists(
      `${this.dataDir}/${fileName}`,
    )
    if (!exists) return false

    await this.delete(fileName)
    return true
  }

  public async listChats(): Promise<ChatConversationMetadata[]> {
    // Now we need to read every JSON file to get the actual metadata
    // because we don't store title and updatedAt in filename anymore
    // This is still fast enough for a reasonable number of chats
    const files = await this.listMetadata()
    const metadataPromises = files.map(async (item) => {
      // item = id (string) & { fileName: string } from base class
      const fileName = (item as unknown as { fileName: string }).fileName
      const conversation = await this.read(fileName)
      if (!conversation) return null
      return {
        id: conversation.id,
        schemaVersion: conversation.schemaVersion,
        title: conversation.title,
        updatedAt: conversation.updatedAt,
      }
    })
    const metadataList = (await Promise.all(metadataPromises)).filter(
      (m): m is ChatConversationMetadata => m !== null,
    )
    return metadataList.sort((a, b) => b.updatedAt - a.updatedAt)
  }
}
