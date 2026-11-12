import { Notice } from 'obsidian'

import { ChatView } from '../ChatView'
import { CHAT_VIEW_TYPE } from '../constants'
import { TemplateManager } from '../database/template/TemplateManager'
import type ZhinengchuangzuoPlugin from '../main'
import type { HandleStreamInput } from '../types/chat'
import {
  getChatModelProblem,
  notifyChatModelProblem,
} from '../utils/chat/chatModel'
import { CONSOLE_HINT, reportError } from '../utils/reportError'

import { buildHandlePrompt } from './handlePrompt'
import {
  collectReferenceBlocks,
  resolveHandleReferences,
} from './handleReferences'

const DEFAULT_MAX_LINKS = 30
const DEFAULT_MAX_CHARS = 300000

/** Resolves the preset template picked in settings into the system prompt. */
async function resolveSystemPrompt(
  plugin: ZhinengchuangzuoPlugin,
): Promise<string> {
  const promptId = plugin.settings.handlePromptId
  if (!promptId) return ''
  const template = await new TemplateManager(plugin.app).findById(promptId)
  return template?.content.trim() ?? ''
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
    if (file.extension !== 'md') {
      new Notice('Only markdown notes can be handled')
      return
    }

    const systemPrompt = await resolveSystemPrompt(plugin)
    if (!systemPrompt) {
      new Notice('Select the prompt to use in the settings first')
      return
    }

    const modelProblem = getChatModelProblem(plugin.settings)
    if (modelProblem) {
      notifyChatModelProblem(modelProblem)
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

    const scan = resolveHandleReferences(app, file, maxLinks)
    if (!scan) {
      new Notice('The file is still being indexed, please try again later')
      return
    }

    const { blocks, totalLength, hasMissing } = await collectReferenceBlocks(
      app,
      scan.references,
      fileContent.length,
    )
    if (totalLength > maxChars) {
      new Notice(
        `The current file and its linked contents exceed the character limit ${maxChars}`,
      )
      return
    }

    // Warnings come after the character check: a rejected request should not also
    // report what it will never send, and one run should not stack three notes.
    if (scan.truncated) {
      new Notice(
        `Reached the link limit ${maxLinks}, some links were not included`,
      )
    }
    if (hasMissing) {
      new Notice('The current file has broken links')
    }

    await openChatAndStream(plugin, {
      systemPrompt,
      prompt: buildHandlePrompt(file.path, fileContent, blocks),
    })
  } catch (error) {
    reportError(`Failed to handle the file, ${CONSOLE_HINT}`, error)
  } finally {
    plugin.handleInProgress = false
  }
}

async function openChatAndStream(
  plugin: ZhinengchuangzuoPlugin,
  input: HandleStreamInput,
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
    await leaf.view.startHandleStream(input)
  }
}
