import { Brain, ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'

import { ObsidianMarkdown } from './ObsidianMarkdown'

type AssistantMessageReasoningProps = {
  reasoning: string
  _hasContentStarted?: boolean
}

export default function AssistantMessageReasoning({
  reasoning,
  _hasContentStarted,
}: AssistantMessageReasoningProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const handleToggle = () => {
    setIsExpanded(!isExpanded)
  }

  return (
    <div className="zncz-assistant-reasoning-container">
      <div className="zncz-assistant-reasoning-header" onClick={handleToggle}>
        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <Brain size={16} />
      </div>
      {isExpanded && (
        <div className="zncz-assistant-reasoning-content">
          <ObsidianMarkdown content={reasoning} scale="xs" />
        </div>
      )}
    </div>
  )
}
