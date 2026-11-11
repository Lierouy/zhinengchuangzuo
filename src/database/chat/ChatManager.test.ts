import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createFakeApp } from '../../test/fakes/fakeApp'
import type { SerializedChatMessage } from '../../types/chat'
import { CHAT_DIR, ROOT_DIR } from '../constants'
import { DatabaseException } from '../exception'

import { ChatManager } from './ChatManager'
import { CHAT_SCHEMA_VERSION } from './types'

const DATA_DIR = `${ROOT_DIR}/${CHAT_DIR}`
const chatPath = (id: string): string =>
  `${DATA_DIR}/v${CHAT_SCHEMA_VERSION}_${id}.json`
const indexPath = (): string => `${DATA_DIR}/_index.json`

type IndexFile = {
  schemaVersion: number
  chats: { id: string; title: string }[]
}

const readIndex = (fake: ReturnType<typeof createFakeApp>): IndexFile =>
  JSON.parse(fake.vault.files.get(indexPath()) ?? '{}') as IndexFile

const userMessage = (id: string, content: string): SerializedChatMessage => ({
  role: 'user',
  content: null,
  promptContent: content,
  id,
  mentionables: [],
})

describe('ChatManager', () => {
  let fake: ReturnType<typeof createFakeApp>
  let manager: ChatManager

  beforeEach(() => {
    fake = createFakeApp()
    manager = new ChatManager(fake.app)
  })

  it('creates a conversation file plus an index entry', async () => {
    const chat = await manager.createChat({})

    expect(chat.title).toBe('新会话')
    expect(chat.messages).toEqual([])
    expect(chat.schemaVersion).toBe(CHAT_SCHEMA_VERSION)
    expect(fake.vault.files.has(chatPath(chat.id))).toBe(true)
    expect(fake.vault.writes).toContain(chatPath(chat.id))

    const index = readIndex(fake)
    expect(index.chats).toEqual([
      {
        id: chat.id,
        title: '新会话',
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
      },
    ])
  })

  it('rejects an empty title', async () => {
    await expect(manager.createChat({ title: '   ' })).rejects.toBeInstanceOf(
      DatabaseException,
    )
  })

  it('reads a conversation back and returns null for unknown ids', async () => {
    const chat = await manager.createChat({ title: 'Saved' })

    await expect(manager.findById(chat.id)).resolves.toEqual(chat)
    await expect(manager.findById('missing')).resolves.toBeNull()
  })

  it('renames a conversation and refuses an empty title', async () => {
    const chat = await manager.createChat({})

    const updated = await manager.updateChat(chat.id, { title: 'Renamed' })
    expect(updated?.title).toBe('Renamed')

    await expect(
      manager.updateChat(chat.id, { title: '' }),
    ).rejects.toBeInstanceOf(DatabaseException)
    await expect(
      manager.updateChat('missing', { title: 'x' }),
    ).resolves.toBeNull()
  })

  it('skips the write when messages did not change', async () => {
    const chat = await manager.createChat({})
    const writesBefore = fake.vault.writes.length

    const result = await manager.updateMessages(chat.id, [])

    expect(result).toEqual(chat)
    expect(fake.vault.writes).toHaveLength(writesBefore)
  })

  it('persists changed messages and refreshes the index entry', async () => {
    const chat = await manager.createChat({})
    const messages = [userMessage('u1', 'hello')]

    const updated = await manager.updateMessages(chat.id, messages)

    expect(updated?.messages).toEqual(messages)
    expect(fake.vault.files.get(chatPath(chat.id))).toContain('hello')
    expect(readIndex(fake).chats[0].id).toBe(chat.id)
    await expect(manager.findById(chat.id)).resolves.toMatchObject({ messages })
  })

  it('deletes the file and the index entry', async () => {
    const chat = await manager.createChat({})

    await expect(manager.deleteChat(chat.id)).resolves.toBe(true)
    expect(fake.vault.files.has(chatPath(chat.id))).toBe(false)
    expect(readIndex(fake).chats).toEqual([])
    await expect(manager.deleteChat(chat.id)).resolves.toBe(false)
  })

  it('removes a ghost entry when a conversation file disappeared', async () => {
    const chat = await manager.createChat({})
    fake.vault.files.delete(chatPath(chat.id))

    await expect(manager.listChats()).resolves.toEqual([])
    expect(readIndex(fake).chats).toEqual([])
  })

  it('lists conversations newest first', async () => {
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(1_000)
    const first = await manager.createChat({ title: 'First' })
    now.mockReturnValue(2_000)
    const second = await manager.createChat({ title: 'Second' })
    now.mockRestore()

    const chats = await manager.listChats()

    expect(chats.map((chat) => chat.id)).toEqual([second.id, first.id])
    expect(chats[0].schemaVersion).toBe(CHAT_SCHEMA_VERSION)
  })

  it('rebuilds a corrupt index from the conversation files', async () => {
    const id = 'aaaaaaaa-0000-0000-0000-000000000001'
    const conversation = {
      id,
      title: 'Recovered',
      messages: [],
      createdAt: 1,
      updatedAt: 2,
      schemaVersion: CHAT_SCHEMA_VERSION,
    }
    fake.vault.seed(chatPath(id), JSON.stringify(conversation))
    fake.vault.seed(indexPath(), '{ not json')

    const chats = await manager.listChats()

    expect(chats).toEqual([
      {
        id,
        title: 'Recovered',
        createdAt: 1,
        updatedAt: 2,
        schemaVersion: CHAT_SCHEMA_VERSION,
      },
    ])
    expect(fake.vault.files.get(indexPath())).toContain('Recovered')
  })

  it('ignores files whose names do not match the schema', async () => {
    fake.vault.seed(`${DATA_DIR}/notes.json`, '{}')
    fake.vault.seed(`${DATA_DIR}/v1_zzz.json`, '{}')

    await expect(manager.listChats()).resolves.toEqual([])
  })

  it('re-creates the data folder when it disappears', async () => {
    fake.vault.dirs.clear()
    fake.vault.files.delete(indexPath())

    const chat = await manager.createChat({})

    expect(fake.vault.dirs.has(DATA_DIR)).toBe(true)
    expect(fake.vault.files.has(chatPath(chat.id))).toBe(true)
  })
})
