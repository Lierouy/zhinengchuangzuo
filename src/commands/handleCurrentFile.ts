import { App, Notice, TFile } from 'obsidian'

import { ChatView } from '../ChatView'
import { CHAT_VIEW_TYPE } from '../constants'
import type ZhinengchuangzuoPlugin from '../main'

import {
  WikiLink,
  buildHandlePrompt,
  collectLinkedContent,
  extractWikiLinks,
} from './handlePrompt'

const DEFAULT_MAX_LINKS = 20
const DEFAULT_MAX_CHARS = 300000

/** Resolves one wiki link, preferring Obsidian's own link resolution. */
function resolveLinkedFile(
  app: App,
  linkRaw: string,
  sourcePath: string,
): TFile | null {
  const linkPath = linkRaw.replace(/^\.\//, '')

  const dest = app.metadataCache.getFirstLinkpathDest(linkPath, sourcePath)
  if (dest instanceof TFile) return dest

  const direct = app.vault.getAbstractFileByPath(linkPath)
  if (direct instanceof TFile) return direct

  const withExtension = app.vault.getAbstractFileByPath(
    linkPath.endsWith('.md') ? linkPath : `${linkPath}.md`,
  )
  return withExtension instanceof TFile ? withExtension : null
}

/** Resolves candidates in order, stopping at `maxLinks` and skipping self. */
function resolveLinkedFiles(
  app: App,
  links: WikiLink[],
  sourceFile: TFile,
  maxLinks: number,
): TFile[] {
  const resolved: TFile[] = []
  for (const link of links) {
    if (resolved.length >= maxLinks) break
    const target = resolveLinkedFile(app, link.raw, sourceFile.path)
    if (
      target &&
      target.path !== sourceFile.path &&
      target.extension === 'md'
    ) {
      resolved.push(target)
    }
  }
  return resolved
}

/**
 * "Handle current file" command: builds a single prompt from the active file
 * plus the notes it links to, then streams the result into the chat view.
 */
export async function handleCurrentFile(
  plugin: ZhinengchuangzuoPlugin,
): Promise<void> {
  if (plugin.handleInProgress) return
  plugin.handleInProgress = true

  try {
    const app = plugin.app
    const file = app.workspace.getActiveFile()
    if (!file) {
      new Notice('No open files are available for handle')
      return
    }

    const fileContent = await app.vault.cachedRead(file)
    const maxLinks = plugin.settings.handleMaxLinks ?? DEFAULT_MAX_LINKS
    const maxChars = plugin.settings.handleMaxChars ?? DEFAULT_MAX_CHARS

    if (fileContent.length > maxChars) {
      new Notice(
        'The current file content exceeds the character limit and cannot be sent',
      )
      return
    }

    const linkedFiles = resolveLinkedFiles(
      app,
      extractWikiLinks(fileContent),
      file,
      maxLinks,
    )
    const { blocks, dropped } = await collectLinkedContent(
      app,
      linkedFiles,
      fileContent.length,
      maxChars,
    )

    if (dropped.length > 0) {
      new Notice(
        `Some associated files have been excluded because they exceed the character limit ${maxChars}`,
      )
    }

    const chatModel = plugin.settings.chatModels.find(
      (model) => model.model === plugin.settings.chatModelId,
    )
    if (!chatModel) {
      new Notice(
        'Please configure the session model, select a session model in the settings',
      )
      return
    }
    if (!plugin.settings.providers.some((p) => p.id === chatModel.providerId)) {
      new Notice('The provider for this model is not configured')
      return
    }

    await openChatAndStream(
      plugin,
      buildHandlePrompt(file.path, fileContent, blocks),
    )
  } catch (error) {
    console.error('Failed to handle file', error)
    new Notice('Handle failed, please check console logs')
  } finally {
    plugin.handleInProgress = false
  }
}

async function openChatAndStream(
  plugin: ZhinengchuangzuoPlugin,
  prompt: string,
): Promise<void> {
  const workspace = plugin.app.workspace
  const existingLeaf = workspace
    .getLeavesOfType(CHAT_VIEW_TYPE)
    .find((leaf) => leaf.view instanceof ChatView)

  if (!existingLeaf) {
    await plugin.openChatView(true)
  } else {
    await workspace.revealLeaf(existingLeaf)
  }

  const leaf = workspace
    .getLeavesOfType(CHAT_VIEW_TYPE)
    .find((candidate) => candidate.view instanceof ChatView)
  if (leaf && leaf.view instanceof ChatView) {
    await leaf.view.startHandleStream(prompt)
  }
}
