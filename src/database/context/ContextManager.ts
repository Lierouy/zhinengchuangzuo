import { App } from 'obsidian'
import { v4 as uuidv4 } from 'uuid'

import { AbstractJsonRepository } from '../base'
import { CONTEXT_DIR, ROOT_DIR } from '../constants'
import {
  DuplicatePromptGroupException,
  DuplicatePromptItemException,
} from '../exception'

import {
  CONTEXT_SCHEMA_VERSION,
  PromptGroup,
  PromptGroupMetadata,
  PromptItem,
} from './types'

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

  public async createGroup(
    group: Omit<
      PromptGroup,
      'id' | 'createdAt' | 'updatedAt' | 'schemaVersion'
    >,
  ): Promise<PromptGroup> {
    // 检查是否与已有组重名
    const duplicate = await this.findGroupByName(group.name)
    if (duplicate) {
      throw new DuplicatePromptGroupException(group.name)
    }

    const newGroup: PromptGroup = {
      id: uuidv4(),
      ...group,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: CONTEXT_SCHEMA_VERSION,
    }

    await this.create(newGroup)
    return newGroup
  }

  public async findById(id: string): Promise<PromptGroup | null> {
    const fileName = `v${CONTEXT_SCHEMA_VERSION}_${id}.json`
    return this.read(fileName)
  }

  public async findGroupByName(name: string): Promise<PromptGroup | null> {
    const groups = await this.listGroups()
    const target = groups.find((meta) => meta.name === name)
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
        throw new DuplicatePromptGroupException(updates.name)
      }
    }

    const updatedGroup: PromptGroup = {
      ...group,
      ...updates,
      updatedAt: Date.now(),
    }

    await this.update(group, updatedGroup)
    return updatedGroup
  }

  public async deleteGroup(id: string): Promise<boolean> {
    const fileName = `v${CONTEXT_SCHEMA_VERSION}_${id}.json`
    const exists = await this.app.vault.adapter.exists(
      `${this.dataDir}/${fileName}`,
    )
    if (!exists) return false

    await this.delete(fileName)
    return true
  }

  public async listGroups(): Promise<PromptGroupMetadata[]> {
    const files = await this.listMetadata()
    const metadataPromises = files.map(async (item) => {
      const fileName = (item as unknown as { fileName: string }).fileName
      const group = await this.read(fileName)
      if (!group) return null
      return {
        id: group.id,
        name: group.name,
        schemaVersion: group.schemaVersion,
      }
    })
    return (await Promise.all(metadataPromises)).filter(
      (m): m is PromptGroupMetadata => m !== null,
    )
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
      throw new DuplicatePromptItemException(item.name)
    }

    const newItem: PromptItem = {
      id: uuidv4(),
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
        throw new DuplicatePromptItemException(updates.name)
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
