import { TFile, TFolder } from 'obsidian'

/**
 * `path` is the stable identity of a mentionable: a file that was renamed,
 * moved or deleted resolves to `null` while its path is kept, so history
 * prompts can still tell the model that the target is gone instead of silently
 * dropping it.
 */
export type MentionableFile = {
  type: 'file'
  file: TFile | null
  path: string
}
export type MentionableFolder = {
  type: 'folder'
  folder: TFolder | null
  path: string
}
export type MentionableCurrentFile = {
  type: 'current-file'
  file: TFile | null
}
export type MentionableBlockData = {
  content: string
  file: TFile
  path: string
  startLine: number
  endLine: number
}
export type MentionableBlock = {
  type: 'block'
  content: string
  file: TFile | null
  path: string
  startLine: number
  endLine: number
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
