import { PromptGroupMetadata, PromptItem } from '../../database/context/types'

/** Shared by the inline checks and the pre-save validation below. */
export const EMPTY_GROUP_NAME_MESSAGE = 'Prompt group name cannot be empty'

/**
 * A pending edit recorded while the modal is open. Nothing is written to disk
 * until 保存, which is also what makes 取消 a real rollback.
 */
export type GroupOp =
  | { kind: 'create'; tempKey: string; name: string }
  | { kind: 'rename'; id: string; name: string }
  | { kind: 'delete'; id: string; name: string }

/**
 * One row of the table: either a group that exists on disk (`id`) or a group
 * that is only pending creation (`id === null`, `key` is a local temp key).
 */
export type GroupRow = {
  key: string
  id: string | null
  name: string
}

/** Projects the saved groups plus the pending operations into table rows. */
export function applyOps(
  initialGroups: PromptGroupMetadata[],
  ops: GroupOp[],
): GroupRow[] {
  const rows: GroupRow[] = initialGroups.map((group) => ({
    key: group.id,
    id: group.id,
    name: group.name,
  }))

  for (const op of ops) {
    if (op.kind === 'create') {
      rows.push({ key: op.tempKey, id: null, name: op.name })
      continue
    }

    if (op.kind === 'rename') {
      const row = rows.find((candidate) => candidate.key === op.id)
      if (row) row.name = op.name
      continue
    }

    const index = rows.findIndex((candidate) => candidate.key === op.id)
    if (index !== -1) rows.splice(index, 1)
  }

  return rows
}

/**
 * Checks the table as it would look after the operations have been replayed.
 * Running this first means a rejected name never leaves the disk half updated.
 */
export function findGroupNameError(rows: GroupRow[]): string | null {
  const seen = new Set<string>()
  for (const row of rows) {
    const name = row.name.trim()
    if (!name) return EMPTY_GROUP_NAME_MESSAGE
    if (seen.has(name)) return `Prompt group with name ${name} already exists`
    seen.add(name)
  }
  return null
}

/** The slice of ContextManager that saving needs, so the replay stays testable. */
export type PromptGroupRepository = {
  createGroup(group: { name: string; prompts: PromptItem[] }): Promise<unknown>
  updateGroup(id: string, updates: { name: string }): Promise<unknown>
  deleteGroup(id: string): Promise<boolean>
}

export type ReplayResult = {
  /** Groups that were actually removed from the disk. */
  deletedIds: string[]
  /** The operation that stopped the replay, with the error it raised. */
  failed: { op: GroupOp; error: unknown } | null
  /** Operations that were not applied, the failed one included. */
  remaining: GroupOp[]
}

/**
 * Replays the log against the repository, stopping at the first error. The
 * caller keeps `remaining` so the user can fix the problem and save again.
 */
export async function replayOps(
  repository: PromptGroupRepository,
  ops: GroupOp[],
): Promise<ReplayResult> {
  const deletedIds: string[] = []

  for (let index = 0; index < ops.length; index++) {
    const op = ops[index]
    try {
      if (op.kind === 'create') {
        await repository.createGroup({ name: op.name, prompts: [] })
      } else if (op.kind === 'rename') {
        await repository.updateGroup(op.id, { name: op.name })
      } else {
        await repository.deleteGroup(op.id)
        deletedIds.push(op.id)
      }
    } catch (error) {
      return { deletedIds, failed: { op, error }, remaining: ops.slice(index) }
    }
  }

  return { deletedIds, failed: null, remaining: [] }
}
