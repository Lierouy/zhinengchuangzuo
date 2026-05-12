export class DuplicateTemplateException extends Error {
  constructor(templateName: string) {
    super(`Template with name "${templateName}" already exists`)
    this.name = 'DuplicateTemplateException'
  }
}

export class EmptyTemplateNameException extends Error {
  constructor() {
    super('Template name cannot be empty')
    this.name = 'EmptyTemplateNameException'
  }
}

export class EmptyChatTitleException extends Error {
  constructor() {
    super('Chat title cannot be empty')
    this.name = 'EmptyChatTitleException'
  }
}

export class DuplicateProviderException extends Error {
  constructor(id: string) {
    super(`Provider with ID ${id} already exists`)
    this.name = 'DuplicateProviderException'
  }
}

export class DuplicateChatModelException extends Error {
  constructor(name: string) {
    super(`Chat model with name ${name} already exists`)
    this.name = 'DuplicateChatModelException'
  }
}

export class DuplicatePromptGroupException extends Error {
  constructor(name: string) {
    super(`Prompt group with name ${name} already exists`)
    this.name = 'DuplicatePromptGroupException'
  }
}

export class DuplicatePromptItemException extends Error {
  constructor(name: string) {
    super(`Prompt item with name ${name} already exists`)
    this.name = 'DuplicatePromptItemException'
  }
}
