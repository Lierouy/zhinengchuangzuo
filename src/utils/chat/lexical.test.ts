import type { SerializedEditorState } from 'lexical'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  TextNode,
  createEditor,
} from 'lexical'
import { describe, expect, it } from 'vitest'

import { $findNodesOfType, cleanupEditorState } from './lexical'

const textNode = (text: string, extra: Record<string, unknown> = {}) => ({
  type: 'text',
  text,
  detail: 0,
  format: 1,
  mode: 'normal',
  style: '',
  version: 1,
  ...extra,
})

describe('cleanupEditorState', () => {
  it('keeps only the structural fields and mutates the input in place', () => {
    const state = {
      root: {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [textNode('hello')],
            direction: null,
            format: '',
            indent: 0,
            version: 1,
            textFormat: 0,
            textStyle: '',
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        version: 1,
      },
    } as unknown as SerializedEditorState

    const result = cleanupEditorState(state)

    expect(result).toBe(state)
    expect(result.root).toEqual({
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', text: 'hello' }],
        },
      ],
    })
  })

  it('keeps a non-zero indent and drops a zero one', () => {
    const state = {
      root: {
        type: 'root',
        children: [
          { type: 'paragraph', children: [], indent: 0, version: 1 },
          { type: 'paragraph', children: [], indent: 3, version: 1 },
        ],
        indent: 0,
      },
    } as unknown as SerializedEditorState

    cleanupEditorState(state)

    expect(state.root).toEqual({
      type: 'root',
      children: [
        { type: 'paragraph', children: [] },
        { type: 'paragraph', children: [], indent: 3 },
      ],
    })
  })

  it('reduces linebreak nodes to their type', () => {
    const state = {
      root: {
        type: 'root',
        children: [
          {
            type: 'linebreak',
            text: '',
            mode: 'normal',
            version: 1,
            format: 0,
          },
        ],
      },
    } as unknown as SerializedEditorState

    cleanupEditorState(state)

    expect(state.root).toEqual({
      type: 'root',
      children: [{ type: 'linebreak' }],
    })
  })

  it('recurses into nested children', () => {
    const state = {
      root: {
        type: 'root',
        children: [
          {
            type: 'list',
            version: 1,
            children: [
              {
                type: 'listitem',
                version: 1,
                children: [textNode('nested', { style: 'color: red' })],
              },
            ],
          },
        ],
      },
    } as unknown as SerializedEditorState

    cleanupEditorState(state)

    expect(state.root).toEqual({
      type: 'root',
      children: [
        {
          type: 'list',
          children: [
            {
              type: 'listitem',
              children: [{ type: 'text', text: 'nested' }],
            },
          ],
        },
      ],
    })
  })
})

describe('$findNodesOfType', () => {
  it('walks the attached tree and skips detached nodes', () => {
    const editor = createEditor({ namespace: 'lexical-test' })
    const found: string[][] = []

    editor.update(() => {
      const root = $getRoot()
      root.clear()
      const paragraph = $createParagraphNode()
      paragraph.append($createTextNode('one'), $createTextNode('two'))
      root.append(paragraph)
      $createTextNode('detached')

      found.push(
        $findNodesOfType(TextNode).map((node) => node.getTextContent()),
      )
    })

    expect(found).toHaveLength(1)
    expect(found[0]).toEqual(['one', 'two'])
  })

  it('returns only instances of the requested class', () => {
    const editor = createEditor({ namespace: 'lexical-test' })
    const found: number[] = []

    editor.update(() => {
      const root = $getRoot()
      root.clear()
      root.append($createParagraphNode().append($createTextNode('text')))
      found.push($findNodesOfType(TextNode).length)
    })

    expect(found[0]).toBe(1)
  })
})
