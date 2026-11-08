export const CONTEXT_SCHEMA_VERSION = 1
export const CONTEXT_INDEX_SCHEMA_VERSION = 1

/** One entry of the context index card; never contains prompt bodies. */
export type PromptGroupIndexEntry = {
  id: string
  name: string
}

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
}

/** The list view only needs the fields stored on the index card. */
export type PromptGroupMetadata = PromptGroupIndexEntry
