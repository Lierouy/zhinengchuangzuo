import { describe, expect, it, vi } from 'vitest'

import type { PromptGroupMetadata } from '../../database/context/types'

import {
  EMPTY_GROUP_NAME_MESSAGE,
  type GroupOp,
  type PromptGroupRepository,
  applyOps,
  findGroupNameError,
  replayOps,
} from './promptGroupOps'

const groups: PromptGroupMetadata[] = [
  { id: 'g1', name: 'One' },
  { id: 'g2', name: 'Two' },
]

describe('applyOps', () => {
  it('projects creations, renames and deletions in order', () => {
    const ops: GroupOp[] = [
      { kind: 'create', tempKey: 'tmp-1', name: 'New' },
      { kind: 'rename', id: 'g1', name: 'Renamed' },
      { kind: 'delete', id: 'g2', name: 'Two' },
    ]

    expect(applyOps(groups, ops)).toEqual([
      { key: 'g1', id: 'g1', name: 'Renamed' },
      { key: 'tmp-1', id: null, name: 'New' },
    ])
  })

  it('ignores operations that target a missing group', () => {
    const ops: GroupOp[] = [
      { kind: 'rename', id: 'nope', name: 'x' },
      { kind: 'delete', id: 'nope', name: 'x' },
    ]

    expect(applyOps(groups, ops)).toEqual([
      { key: 'g1', id: 'g1', name: 'One' },
      { key: 'g2', id: 'g2', name: 'Two' },
    ])
  })

  it('does not mutate the input rows', () => {
    applyOps(groups, [{ kind: 'rename', id: 'g1', name: 'Renamed' }])
    expect(groups[0].name).toBe('One')
  })
})

describe('findGroupNameError', () => {
  it('accepts unique non-empty names', () => {
    expect(
      findGroupNameError([
        { key: 'g1', id: 'g1', name: 'One' },
        { key: 'tmp', id: null, name: 'Two' },
      ]),
    ).toBeNull()
  })

  it('rejects empty names and duplicates', () => {
    expect(findGroupNameError([{ key: 'g1', id: 'g1', name: '   ' }])).toBe(
      EMPTY_GROUP_NAME_MESSAGE,
    )
    expect(
      findGroupNameError([
        { key: 'g1', id: 'g1', name: 'Same' },
        { key: 'tmp', id: null, name: ' Same ' },
      ]),
    ).toBe('Prompt group with name Same already exists')
  })
})

describe('replayOps', () => {
  const createRepository = (
    failing: string | null = null,
  ): {
    repository: PromptGroupRepository
    calls: string[]
  } => {
    const calls: string[] = []
    const repository: PromptGroupRepository = {
      async createGroup(group) {
        calls.push(`create:${group.name}`)
        if (failing === `create:${group.name}`) throw new Error('boom')
        return group
      },
      async updateGroup(id, updates) {
        calls.push(`update:${id}:${updates.name}`)
        if (failing === `update:${id}`) throw new Error('boom')
        return updates
      },
      async deleteGroup(id) {
        calls.push(`delete:${id}`)
        if (failing === `delete:${id}`) throw new Error('boom')
        return true
      },
    }
    return { repository, calls }
  }

  const ops: GroupOp[] = [
    { kind: 'create', tempKey: 'tmp-1', name: 'New' },
    { kind: 'rename', id: 'g1', name: 'Renamed' },
    { kind: 'delete', id: 'g2', name: 'Two' },
  ]

  it('applies every operation and reports nothing left', async () => {
    const { repository, calls } = createRepository()

    const result = await replayOps(repository, ops)

    expect(calls).toEqual(['create:New', 'update:g1:Renamed', 'delete:g2'])
    expect(result).toEqual({ deletedIds: ['g2'], failed: null, remaining: [] })
  })

  it('stops at the first failure and keeps the rest for a retry', async () => {
    const { repository, calls } = createRepository('update:g1')

    const result = await replayOps(repository, ops)

    expect(calls).toEqual(['create:New', 'update:g1:Renamed'])
    expect(result.failed?.op).toEqual(ops[1])
    expect(result.remaining).toEqual(ops.slice(1))
    expect(result.deletedIds).toEqual([])
  })

  it('keeps the deletions that already succeeded', async () => {
    const { repository } = createRepository('delete:g2')

    const result = await replayOps(repository, [
      { kind: 'delete', id: 'g1', name: 'One' },
      { kind: 'delete', id: 'g2', name: 'Two' },
    ])

    expect(result.deletedIds).toEqual(['g1'])
    expect(result.failed?.op.kind).toBe('delete')
  })

  it('does not touch the repository for an empty log', async () => {
    const createGroup = vi.fn(async () => ({}))
    const result = await replayOps(
      { createGroup, updateGroup: vi.fn(), deleteGroup: vi.fn() },
      [],
    )

    expect(createGroup).not.toHaveBeenCalled()
    expect(result).toEqual({ deletedIds: [], failed: null, remaining: [] })
  })
})
