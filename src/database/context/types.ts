export const CONTEXT_SCHEMA_VERSION = 1

export type FilterLogic = 'AND_ANY' | 'AND_ALL' | 'NOT_ALL' | 'NOT_ANY'

export type PromptItem = {
  id: string
  name: string
  content: string
  enabled: boolean
  /** 是否根据条件激活，默认 false（无条件激活） */
  conditionalActivation?: boolean
  /** 触发关键词，空格分隔，默认 [] */
  keywords?: string[]
  /** 逻辑过滤词，空格分隔，默认 [] */
  filterWords?: string[]
  /** 过滤词逻辑，默认 'AND_ANY' */
  filterLogic?: FilterLogic
  /** 连带激活的目标提示 ID，null 表示不连带，默认 null */
  chainActivation?: string | null
}

export type PromptGroup = {
  id: string
  name: string
  prompts: PromptItem[]
  createdAt: number
  updatedAt: number
  schemaVersion: number
}

export type PromptGroupMetadata = {
  id: string
  name: string
  schemaVersion: number
}
