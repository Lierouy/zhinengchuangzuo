import { $createParagraphNode, $getRoot, createEditor } from 'lexical'
import { describe, expect, it } from 'vitest'

import type { SerializedMentionable } from '../../../types/mentionable'
import { $findNodesOfType } from '../../../utils/chat/lexical'

import { $createMentionNode, MentionNode } from './MentionNode'
import type { SerializedMentionNode } from './MentionNode'

const mentionable: SerializedMentionable = {
  type: 'file',
  file: 'notes/a.md',
}

const createTestEditor = () =>
  createEditor({ namespace: 'mention-node-test', nodes: [MentionNode] })

describe('MentionNode', () => {
  it('serializes the mention name and its mentionable', () => {
    const editor = createTestEditor()
    const captured: SerializedMentionNode[] = []

    editor.update(() => {
      const node = $createMentionNode('a.md', mentionable)
      captured.push(node.exportJSON())
    })

    expect(captured).toHaveLength(1)
    expect(captured[0]).toMatchObject({
      type: 'mention',
      version: 1,
      mentionName: 'a.md',
      mentionable,
      text: '@a.md',
    })
  })

  it('restores a node from its serialized form', () => {
    const editor = createTestEditor()
    const captured: {
      mentionable: SerializedMentionable
      text: string
      type: string
    }[] = []

    editor.update(() => {
      const json = $createMentionNode('a.md', mentionable).exportJSON()
      const restored = MentionNode.importJSON(json)
      captured.push({
        mentionable: restored.getMentionable(),
        text: restored.getTextContent(),
        type: restored.getType(),
      })
    })

    expect(captured).toHaveLength(1)
    expect(captured[0]).toEqual({
      mentionable,
      text: '@a.md',
      type: 'mention',
    })
  })

  it('falls back to the mention name when the serialized text is missing', () => {
    const editor = createTestEditor()
    const captured: string[] = []

    editor.update(() => {
      const json = $createMentionNode('a.md', mentionable).exportJSON()
      const withoutText = { ...json } as Partial<SerializedMentionNode>
      delete withoutText.text
      captured.push(
        MentionNode.importJSON(
          withoutText as SerializedMentionNode,
        ).getTextContent(),
      )
    })

    expect(captured[0]).toBe('@a.md')
  })

  it('clones without sharing the mutable fields', () => {
    const editor = createTestEditor()
    const captured: { mentionable: SerializedMentionable; text: string }[] = []

    editor.update(() => {
      const original = $createMentionNode('a.md', mentionable)
      const clone = MentionNode.clone(original)
      captured.push({
        mentionable: clone.getMentionable(),
        text: clone.getTextContent(),
      })
    })

    expect(captured[0]).toEqual({ mentionable, text: '@a.md' })
  })

  it('is a non-splittable text entity', () => {
    const editor = createTestEditor()
    const checks: boolean[][] = []

    editor.update(() => {
      const node = $createMentionNode('a.md', mentionable)
      checks.push([
        node.isTextEntity(),
        node.canInsertTextBefore(),
        node.canInsertTextAfter(),
      ])
    })

    expect(checks[0]).toEqual([true, false, false])
  })

  it('is found in the attached tree but not when detached', () => {
    const editor = createTestEditor()
    const found: string[][] = []

    editor.update(() => {
      const root = $getRoot()
      root.clear()
      const paragraph = $createParagraphNode()
      paragraph.append($createMentionNode('a.md', mentionable))
      root.append(paragraph)
      $createMentionNode('detached.md', mentionable)

      found.push(
        $findNodesOfType(MentionNode).map((node) => node.getTextContent()),
      )
    })

    expect(found).toHaveLength(1)
    expect(found[0]).toEqual(['@a.md'])
  })
})
