export type DatabaseErrorCode =
  | 'duplicate-template'
  | 'empty-template-name'
  | 'empty-chat-title'
  | 'duplicate-provider'
  | 'duplicate-chat-model'
  | 'duplicate-prompt-group'
  | 'duplicate-prompt-item'

/**
 * One error type for every repository-level failure; the `code` decides how
 * the UI reacts, which keeps the exception family from growing one class per
 * message.
 */
export class DatabaseException extends Error {
  constructor(
    public readonly code: DatabaseErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'DatabaseException'
  }
}

export function isDatabaseError(
  error: unknown,
  code: DatabaseErrorCode,
): error is DatabaseException {
  return error instanceof DatabaseException && error.code === code
}

/** Message-only helpers keep the call sites short. */
export const duplicateTemplate = (name: string) =>
  new DatabaseException(
    'duplicate-template',
    `Template with name "${name}" already exists`,
  )

export const emptyTemplateName = () =>
  new DatabaseException('empty-template-name', 'Template name cannot be empty')

export const emptyChatTitle = () =>
  new DatabaseException('empty-chat-title', 'Chat title cannot be empty')

export const duplicateProvider = (id: string) =>
  new DatabaseException(
    'duplicate-provider',
    `Provider with ID ${id} already exists`,
  )

export const duplicateChatModel = (name: string) =>
  new DatabaseException(
    'duplicate-chat-model',
    `Chat model with name ${name} already exists`,
  )

export const duplicatePromptGroup = (name: string) =>
  new DatabaseException(
    'duplicate-prompt-group',
    `Prompt group with name ${name} already exists`,
  )

export const duplicatePromptItem = (name: string) =>
  new DatabaseException(
    'duplicate-prompt-item',
    `Prompt item with name ${name} already exists`,
  )
