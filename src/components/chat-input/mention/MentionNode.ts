/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 * Modified from the original code
 */
import {
  $applyNodeReplacement,
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  type EditorConfig,
  type LexicalEditor,
  type NodeKey,
  type SerializedTextNode,
  type Spread,
  TextNode,
} from 'lexical'

import { SerializedMentionable } from '../../../types/mentionable'

const MENTION_NODE_TYPE = 'mention'
const MENTION_NODE_ATTRIBUTE = 'data-lexical-mention'
const MENTION_NODE_MENTION_NAME_ATTRIBUTE = 'data-lexical-mention-name'
const MENTION_NODE_MENTIONABLE_ATTRIBUTE = 'data-lexical-mentionable'

export type SerializedMentionNode = Spread<
  {
    mentionName: string
    mentionable: SerializedMentionable
  },
  SerializedTextNode
>

function parseMentionableAttribute(
  raw: string | null,
): SerializedMentionable | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && 'type' in parsed) {
      return parsed as SerializedMentionable
    }
    return null
  } catch {
    // Malformed attribute (e.g. pasted from another app) — degrade gracefully.
    return null
  }
}

function $convertMentionElement(
  domNode: HTMLElement,
): DOMConversionOutput | null {
  const textContent = domNode.textContent
  if (textContent === null) return null

  const mentionable = parseMentionableAttribute(
    domNode.getAttribute(MENTION_NODE_MENTIONABLE_ATTRIBUTE),
  )
  // Without a valid mentionable the node cannot be reconstructed; fall back to
  // plain text instead of throwing.
  if (!mentionable) return null

  const mentionName =
    domNode.getAttribute(MENTION_NODE_MENTION_NAME_ATTRIBUTE) ?? textContent

  return {
    node: $createMentionNode(mentionName, mentionable),
  }
}

export class MentionNode extends TextNode {
  __mentionName: string
  __mentionable: SerializedMentionable

  static getType(): string {
    return MENTION_NODE_TYPE
  }

  static clone(node: MentionNode): MentionNode {
    return new MentionNode(node.__mentionName, node.__mentionable, node.__key)
  }
  static importJSON(serializedNode: SerializedMentionNode): MentionNode {
    const node = $createMentionNode(
      serializedNode.mentionName,
      serializedNode.mentionable,
    )
    node.setTextContent(serializedNode.text)
    node.setFormat(serializedNode.format)
    node.setDetail(serializedNode.detail)
    node.setMode(serializedNode.mode)
    node.setStyle(serializedNode.style)
    return node
  }

  constructor(
    mentionName: string,
    mentionable: SerializedMentionable,
    key?: NodeKey,
  ) {
    super(`@${mentionName}`, key)
    this.__mentionName = mentionName
    this.__mentionable = mentionable
  }

  exportJSON(): SerializedMentionNode {
    return {
      ...super.exportJSON(),
      mentionName: this.__mentionName,
      mentionable: this.__mentionable,
      type: MENTION_NODE_TYPE,
      version: 1,
    }
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config)
    dom.className = `zncz-${MENTION_NODE_TYPE}`
    return dom
  }

  exportDOM(editor: LexicalEditor): DOMExportOutput {
    // Use the editor's window to create the element so it works in pop-out windows
    const doc = editor.getRootElement()?.ownerDocument ?? document
    const element = doc.createElement('span')
    element.setAttribute(MENTION_NODE_ATTRIBUTE, 'true')
    element.setAttribute(
      MENTION_NODE_MENTION_NAME_ATTRIBUTE,
      this.__mentionName,
    )
    element.setAttribute(
      MENTION_NODE_MENTIONABLE_ATTRIBUTE,
      JSON.stringify(this.__mentionable),
    )
    element.textContent = this.__text
    return { element }
  }

  static importDOM(): DOMConversionMap | null {
    return {
      span: (domNode: HTMLElement) => {
        if (
          !domNode.hasAttribute(MENTION_NODE_ATTRIBUTE) ||
          !domNode.hasAttribute(MENTION_NODE_MENTION_NAME_ATTRIBUTE) ||
          !domNode.hasAttribute(MENTION_NODE_MENTIONABLE_ATTRIBUTE)
        ) {
          return null
        }
        return {
          conversion: $convertMentionElement,
          priority: 1,
        }
      },
    }
  }

  isTextEntity(): true {
    return true
  }

  canInsertTextBefore(): boolean {
    return false
  }

  canInsertTextAfter(): boolean {
    return false
  }

  getMentionable(): SerializedMentionable {
    return this.__mentionable
  }
}

export function $createMentionNode(
  mentionName: string,
  mentionable: SerializedMentionable,
): MentionNode {
  const mentionNode = new MentionNode(mentionName, mentionable)
  mentionNode.setMode('token').toggleDirectionless()
  return $applyNodeReplacement(mentionNode)
}
