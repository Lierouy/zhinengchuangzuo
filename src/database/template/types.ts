export const TEMPLATE_SCHEMA_VERSION = 1
export const TEMPLATE_INDEX_SCHEMA_VERSION = 1

export type Template = {
  id: string
  name: string
  content: string
  /** Kept as a tie-break when the order sidecar is missing. */
  sortOrder: number
}

export type TemplateMetadata = {
  id: string
  name: string
}
