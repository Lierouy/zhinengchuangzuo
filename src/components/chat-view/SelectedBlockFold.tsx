import { ChevronDown, ChevronRight, Clipboard } from 'lucide-react'
import { useState } from 'react'

import { MentionableBlock } from '../../types/mentionable'
import { readTFileContent } from '../../utils/obsidian'

import { ObsidianMarkdown } from './ObsidianMarkdown'

type SelectedBlockFoldProps = {
  block: MentionableBlock
}

export function SelectedBlockFold({ block }: SelectedBlockFoldProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [content, setContent] = useState<string | null>(null)

  // 加载选中的块内容
  const loadContent = async () => {
    if (content) return
    try {
      const fileContent = await readTFileContent(block.file, block.file.vault)
      const blockContent = fileContent
        .split('\n')
        .slice(block.startLine - 1, block.endLine)
        .join('\n')
      setContent(blockContent)
    } catch (e) {
      console.error('Failed to load block content', e)
      setContent('')
    }
  }

  return (
    <div className="zncz-selected-block-container">
      <div
        className="zncz-selected-block-header"
        onClick={() => {
          if (!isExpanded) {
            loadContent()
          }
          setIsExpanded(!isExpanded)
        }}
      >
        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <Clipboard size={16} />
        <span className="zncz-selected-block-filename">{block.file.name}</span>
        <span
          className="zncz-selected-block-filename"
          style={{ color: 'var(--text-muted)' }}
        >
          {block.startLine !== block.endLine
            ? ` (${block.startLine}-${block.endLine})`
            : ` (${block.startLine})`}
        </span>
      </div>
      {isExpanded && content && (
        <div className="zncz-selected-block-content">
          <ObsidianMarkdown content={content} scale="xs" />
        </div>
      )}
    </div>
  )
}
