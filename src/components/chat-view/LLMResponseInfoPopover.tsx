import * as Popover from '@radix-ui/react-popover'
import {
  Activity,
  ArrowDownFromLine,
  ArrowUpDown,
  ArrowUpToLine,
  CircleGauge,
} from 'lucide-react'

import { ResponseUsage } from '../../types/response'

type LLMResponseInfoProps = {
  usage: ResponseUsage | null
  model: string | null
}

export default function LLMResponseInfoPopover({
  usage,
  model,
}: LLMResponseInfoProps) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className="clickable-icon">
          <CircleGauge size={12} />
        </button>
      </Popover.Trigger>
      {usage ? (
        <Popover.Content
          className="zncz-popover-content zncz-llm-info-content"
          side="bottom"
          sideOffset={3}
          collisionPadding={12}
          avoidCollisions={true}
        >
          <div className="zncz-llm-info-tokens">
            <div className="zncz-llm-info-tokens-grid">
              <div className="zncz-llm-info-token-row">
                <ArrowUpToLine className="zncz-llm-info-icon--input" />
                <span>输入：</span>
                <span className="zncz-llm-info-token-value">
                  {usage.prompt_tokens}
                </span>
              </div>
              <div className="zncz-llm-info-token-row">
                <ArrowDownFromLine className="zncz-llm-info-icon--output" />
                <span>输出：</span>
                <span className="zncz-llm-info-token-value">
                  {usage.completion_tokens}
                </span>
              </div>
              <div className="zncz-llm-info-token-row zncz-llm-info-token-total">
                <ArrowUpDown className="zncz-llm-info-icon--total" />
                <span>合计：</span>
                <span className="zncz-llm-info-token-value">
                  {usage.total_tokens}
                </span>
              </div>
            </div>
            {model && (
              <div className="zncz-llm-info-footer-row">
                <Activity className="zncz-llm-info-icon--footer" />
                <span>模型：</span>
                <span className="zncz-llm-info-model zncz-llm-info-footer-value">
                  {model}
                </span>
              </div>
            )}
          </div>
        </Popover.Content>
      ) : (
        <Popover.Content className="zncz-popover-content">
          <div>该模型无法统计数据</div>
        </Popover.Content>
      )}
    </Popover.Root>
  )
}
