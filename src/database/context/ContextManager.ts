import { App, normalizePath } from 'obsidian'

import { AbstractJsonRepository } from '../base'
import { CONTEXT_DIR, ROOT_DIR } from '../constants'
import { duplicatePromptGroup, duplicatePromptItem } from '../exception'

import {
  CONTEXT_INDEX_SCHEMA_VERSION,
  CONTEXT_SCHEMA_VERSION,
  PromptGroup,
  PromptGroupIndexEntry,
  PromptGroupMetadata,
  PromptItem,
} from './types'

const CONTEXT_INDEX_FILE = '_index.json'

type ContextIndexFile = {
  schemaVersion: number
  groups: PromptGroupIndexEntry[]
}

const toIndexEntry = (group: PromptGroup): PromptGroupIndexEntry => ({
  id: group.id,
  name: group.name,
})

export class ContextManager extends AbstractJsonRepository<
  PromptGroup,
  string
> {
  constructor(app: App) {
    super(app, `${ROOT_DIR}/${CONTEXT_DIR}`)
  }

  protected generateFileName(group: PromptGroup): string {
    return `v${CONTEXT_SCHEMA_VERSION}_${group.id}.json`
  }

  protected parseFileName(fileName: string): string | null {
    const regex = new RegExp(`^v${CONTEXT_SCHEMA_VERSION}_([0-9a-f-]+)\\.json$`)
    const match = fileName.match(regex)
    if (!match) return null
    return match[1]
  }

  /**
   * The index card holds only id + name, so duplicate-name checks and group
   * listings never have to read prompt bodies. It is derived data and can be
   * rebuilt from the group files at any time.
   */
  private indexFilePath(): string {
    return normalizePath(`${this.dataDir}/${CONTEXT_INDEX_FILE}`)
  }

  private async readIndex(): Promise<PromptGroupIndexEntry[]> {
    try {
      const raw = await this.app.vault.adapter.read(this.indexFilePath())
      const parsed = JSON.parse(raw) as Partial<ContextIndexFile>
      if (
        parsed.schemaVersion === CONTEXT_INDEX_SCHEMA_VERSION &&
        Array.isArray(parsed.groups)
      ) {
        return parsed.groups
      }
    } catch {
      // Missing or unreadable card - fall through and rebuild it.
    }
    return this.rebuildIndex()
  }

  private async writeIndex(groups: PromptGroupIndexEntry[]): Promise<void> {
    await this.ensureDirectory()
    const card: ContextIndexFile = {
      schemaVersion: CONTEXT_INDEX_SCHEMA_VERSION,
      groups,
    }
    await this.app.vault.adapter.write(
      this.indexFilePath(),
      JSON.stringify(card, null, 2),
    )
  }

  private async rebuildIndex(): Promise<PromptGroupIndexEntry[]> {
    const files = await this.listMetadata()
    const groups = await Promise.all(
      files.map((item) => this.read(item.fileName)),
    )
    const entries = groups
      .filter((group): group is PromptGroup => group !== null)
      .map(toIndexEntry)
    await this.writeIndex(entries)
    return entries
  }

  private async upsertIndexEntry(group: PromptGroup): Promise<void> {
    const groups = await this.readIndex()
    const entry = toIndexEntry(group)
    await this.writeIndex([entry, ...groups.filter((g) => g.id !== entry.id)])
  }

  private async removeIndexEntry(id: string): Promise<void> {
    const groups = await this.readIndex()
    const remaining = groups.filter((group) => group.id !== id)
    if (remaining.length === groups.length) return
    await this.writeIndex(remaining)
  }

  public async createGroup(
    group: Omit<
      PromptGroup,
      'id' | 'createdAt' | 'updatedAt' | 'schemaVersion'
    >,
  ): Promise<PromptGroup> {
    // 检查是否与已有组重名
    const duplicate = await this.findGroupByName(group.name)
    if (duplicate) {
      throw duplicatePromptGroup(group.name)
    }

    const newGroup: PromptGroup = {
      id: crypto.randomUUID(),
      ...group,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: CONTEXT_SCHEMA_VERSION,
    }

    await this.create(newGroup)
    await this.upsertIndexEntry(newGroup)
    return newGroup
  }

  public async findById(id: string): Promise<PromptGroup | null> {
    const fileName = `v${CONTEXT_SCHEMA_VERSION}_${id}.json`
    return this.read(fileName)
  }

  public async findGroupByName(name: string): Promise<PromptGroup | null> {
    // Only the index card is read here; the matched group is loaded on demand.
    const groups = await this.readIndex()
    const target = groups.find((group) => group.name === name)
    if (!target) return null
    return this.findById(target.id)
  }

  public async updateGroup(
    id: string,
    updates: Partial<
      Omit<PromptGroup, 'id' | 'createdAt' | 'updatedAt' | 'schemaVersion'>
    >,
  ): Promise<PromptGroup | null> {
    const group = await this.findById(id)
    if (!group) return null

    // 编辑时，如果名称被修改，检查是否与其他组重名
    if (updates.name && updates.name !== group.name) {
      const duplicate = await this.findGroupByName(updates.name)
      if (duplicate) {
        throw duplicatePromptGroup(updates.name)
      }
    }

    const updatedGroup: PromptGroup = {
      ...group,
      ...updates,
      updatedAt: Date.now(),
    }

    await this.update(group, updatedGroup)
    await this.upsertIndexEntry(updatedGroup)
    return updatedGroup
  }

  public async deleteGroup(id: string): Promise<boolean> {
    const fileName = `v${CONTEXT_SCHEMA_VERSION}_${id}.json`
    const exists = await this.app.vault.adapter.exists(
      `${this.dataDir}/${fileName}`,
    )
    if (!exists) return false

    await this.delete(fileName)
    await this.removeIndexEntry(id)
    return true
  }

  public async listGroups(): Promise<PromptGroupMetadata[]> {
    const groups = await this.readIndex()
    return groups.map((group) => ({
      ...group,
      schemaVersion: CONTEXT_SCHEMA_VERSION,
    }))
  }

  public async addPromptItem(
    groupId: string,
    item: Omit<PromptItem, 'id'>,
  ): Promise<PromptItem | null> {
    const group = await this.findById(groupId)
    if (!group) return null

    // 检查是否与同组内已有提示重名
    const duplicate = group.prompts.find((p) => p.name === item.name)
    if (duplicate) {
      throw duplicatePromptItem(item.name)
    }

    const newItem: PromptItem = {
      id: crypto.randomUUID(),
      ...item,
    }

    const updatedPrompts = [...group.prompts, newItem]
    await this.updateGroup(groupId, { prompts: updatedPrompts })
    return newItem
  }

  public async updatePromptItem(
    groupId: string,
    itemId: string,
    updates: Partial<Omit<PromptItem, 'id'>>,
  ): Promise<PromptItem | null> {
    const group = await this.findById(groupId)
    if (!group) return null

    const index = group.prompts.findIndex((p) => p.id === itemId)
    if (index === -1) return null

    // 编辑时，如果名称被修改，检查是否与同组内其他提示重名
    if (updates.name && updates.name !== group.prompts[index].name) {
      const duplicate = group.prompts.find(
        (p) => p.id !== itemId && p.name === updates.name,
      )
      if (duplicate) {
        throw duplicatePromptItem(updates.name)
      }
    }

    const updatedPrompts = [...group.prompts]
    updatedPrompts[index] = { ...updatedPrompts[index], ...updates }

    await this.updateGroup(groupId, { prompts: updatedPrompts })
    return updatedPrompts[index]
  }

  public async deletePromptItem(
    groupId: string,
    itemId: string,
  ): Promise<boolean> {
    const group = await this.findById(groupId)
    if (!group) return false

    const index = group.prompts.findIndex((p) => p.id === itemId)
    if (index === -1) return false

    const updatedPrompts = group.prompts.filter((p) => p.id !== itemId)
    await this.updateGroup(groupId, { prompts: updatedPrompts })
    return true
  }
}
