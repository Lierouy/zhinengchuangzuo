import { beforeEach, describe, expect, it } from 'vitest'

import { createFakeApp } from '../../test/fakes/fakeApp'
import { CONTEXT_DIR, ROOT_DIR } from '../constants'
import { DatabaseException } from '../exception'

import { ContextManager } from './ContextManager'
import { CONTEXT_SCHEMA_VERSION, type PromptItem } from './types'

const DATA_DIR = `${ROOT_DIR}/${CONTEXT_DIR}`
const groupPath = (id: string): string =>
  `${DATA_DIR}/v${CONTEXT_SCHEMA_VERSION}_${id}.json`
const indexPath = (): string => `${DATA_DIR}/_index.json`

const prompt = (
  name: string,
  overrides: Partial<PromptItem> = {},
): PromptItem => ({
  id: `id-${name}`,
  name,
  content: `content ${name}`,
  enabled: true,
  ...overrides,
})

describe('ContextManager', () => {
  let fake: ReturnType<typeof createFakeApp>
  let manager: ContextManager

  beforeEach(() => {
    fake = createFakeApp()
    manager = new ContextManager(fake.app)
  })

  it('creates a group and exposes it in the index', async () => {
    const group = await manager.createGroup({ name: 'Group', prompts: [] })

    expect(fake.vault.files.has(groupPath(group.id))).toBe(true)
    await expect(manager.findById(group.id)).resolves.toEqual(group)
    await expect(manager.listGroups()).resolves.toEqual([
      { id: group.id, name: 'Group' },
    ])
  })

  it('rejects duplicated group names on create', async () => {
    await manager.createGroup({ name: 'Group', prompts: [] })

    await expect(
      manager.createGroup({ name: 'Group', prompts: [] }),
    ).rejects.toBeInstanceOf(DatabaseException)
  })

  it('rejects renaming a group onto another name', async () => {
    const first = await manager.createGroup({ name: 'First', prompts: [] })
    await manager.createGroup({ name: 'Second', prompts: [] })

    await expect(
      manager.updateGroup(first.id, { name: 'Second' }),
    ).rejects.toBeInstanceOf(DatabaseException)
    await expect(
      manager.updateGroup('missing', { name: 'x' }),
    ).resolves.toBeNull()
  })

  it('refuses duplicate prompt names inside one group', async () => {
    const group = await manager.createGroup({
      name: 'Group',
      prompts: [prompt('P')],
    })

    await expect(
      manager.addPromptItem(group.id, {
        name: 'P',
        content: 'x',
        enabled: true,
      }),
    ).rejects.toBeInstanceOf(DatabaseException)
    await expect(
      manager.addPromptItem('missing', {
        name: 'P',
        content: 'x',
        enabled: true,
      }),
    ).resolves.toBeNull()
  })

  it('clears chain activations that pointed at a deleted prompt', async () => {
    const group = await manager.createGroup({
      name: 'Group',
      prompts: [
        prompt('A', { id: 'a' }),
        prompt('B', { id: 'b', chainActivation: 'a' }),
      ],
    })

    await expect(manager.deletePromptItem(group.id, 'a')).resolves.toBe(true)

    const updated = await manager.findById(group.id)
    expect(updated?.prompts).toHaveLength(1)
    expect(updated?.prompts[0].chainActivation).toBeNull()
    await expect(manager.deletePromptItem(group.id, 'nope')).resolves.toBe(
      false,
    )
  })

  it('updates a prompt while keeping siblings untouched', async () => {
    const group = await manager.createGroup({
      name: 'Group',
      prompts: [prompt('A', { id: 'a' }), prompt('B', { id: 'b' })],
    })

    const updated = await manager.updatePromptItem(group.id, 'a', {
      content: 'new content',
    })

    expect(updated?.content).toBe('new content')
    const stored = await manager.findById(group.id)
    expect(stored?.prompts[1].content).toBe('content B')
    await expect(
      manager.updatePromptItem(group.id, 'missing', { content: 'x' }),
    ).resolves.toBeNull()
  })

  it('fills defaults for groups written by an older version', async () => {
    const id = 'aaaaaaaa-0000-0000-0000-000000000001'
    fake.vault.seed(
      groupPath(id),
      JSON.stringify({
        id,
        name: 'Legacy',
        prompts: [{ id: 'p1', name: 'P', content: 'c' }],
      }),
    )

    const group = await manager.findById(id)

    expect(group?.prompts[0]).toEqual({
      id: 'p1',
      name: 'P',
      content: 'c',
      enabled: true,
      conditionalActivation: false,
      keywords: [],
      filterWords: [],
      filterLogic: 'AND_ANY',
      chainActivation: null,
    })
  })

  it('drops a ghost entry when a group file disappeared', async () => {
    const group = await manager.createGroup({ name: 'Group', prompts: [] })
    fake.vault.files.delete(groupPath(group.id))

    await expect(manager.listGroups()).resolves.toEqual([])
    const card = JSON.parse(fake.vault.files.get(indexPath()) ?? '{}') as {
      groups: unknown[]
    }
    expect(card.groups).toEqual([])
  })

  it('deletes a group and its index entry', async () => {
    const group = await manager.createGroup({ name: 'Group', prompts: [] })

    await expect(manager.deleteGroup(group.id)).resolves.toBe(true)
    expect(fake.vault.files.has(groupPath(group.id))).toBe(false)
    await expect(manager.listGroups()).resolves.toEqual([])
    await expect(manager.deleteGroup(group.id)).resolves.toBe(false)
  })
})
