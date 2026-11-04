import { ChevronDown, ChevronRight, Clipboard } from 'lucide-react'
import { useState } from 'react'

import { MentionableBlock } from '../../types/mentionable'

import { ObsidianMarkdown } from './ObsidianMarkdown'

type SelectedBlockFoldProps = {
  block: MentionableBlock
}

export function SelectedBlockFold({ block }: SelectedBlockFoldProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="zncz-selected-block-container">
      <div
        className="zncz-selected-block-header"
        onClick={() => setIsExpanded((expanded) => !expanded)}
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
      {isExpanded && block.content && (
        <div className="zncz-selected-block-content">
          <ObsidianMarkdown content={block.content} scale="xs" />
        </div>
      )}
    </div>
  )
}
