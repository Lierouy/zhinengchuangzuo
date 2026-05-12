import { TFile, TFolder } from 'obsidian'

export type MentionableFile = {
  type: 'file'
  file: TFile
}
export type MentionableFolder = {
  type: 'folder'
  folder: TFolder
}
export type MentionableCurrentFile = {
  type: 'current-file'
  file: TFile | null
}
export type MentionableBlockData = {
  content: string
  file: TFile
  startLine: number
  endLine: number
}
export type MentionableBlock = MentionableBlockData & {
  type: 'block'
}
export type MentionableImage = {
  type: 'image'
  name: string
  mimeType: string
  data: string // base64
}
export type Mentionable =
  | MentionableFile
  | MentionableFolder
  | MentionableCurrentFile
  | MentionableBlock
  | MentionableImage
export type SerializedMentionableFile = {
  type: 'file'
  file: string
}
export type SerializedMentionableFolder = {
  type: 'folder'
  folder: string
}
export type SerializedMentionableCurrentFile = {
  type: 'current-file'
  file: string | null
}
export type SerializedMentionableBlock = {
  type: 'block'
  content: string
  file: string
  startLine: number
  endLine: number
}
export type SerializedMentionableImage = MentionableImage
export type SerializedMentionable =
  | SerializedMentionableFile
  | SerializedMentionableFolder
  | SerializedMentionableCurrentFile
  | SerializedMentionableBlock
  | SerializedMentionableImage
