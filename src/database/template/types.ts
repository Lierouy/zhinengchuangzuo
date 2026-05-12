export const TEMPLATE_SCHEMA_VERSION = 1

export type Template = {
  id: string
  name: string
  content: string
  sortOrder: number
  createdAt: number
  updatedAt: number
  schemaVersion: number
}

export type TemplateMetadata = {
  id: string
  name: string
  sortOrder: number
  schemaVersion: number
}
