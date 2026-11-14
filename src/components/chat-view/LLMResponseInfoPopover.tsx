import * as Popover from '@radix-ui/react-popover'
import {
  Activity,
  ArrowDownFromLine,
  ArrowUpToLine,
  CircleGauge,
  Hourglass,
} from 'lucide-react'

import { ResponseUsage } from '../../types/response'

type LLMResponseInfoProps = {
  usage: ResponseUsage | null
  model: string | null
  /** Local epoch milliseconds; hidden when the message predates this field. */
  createdAt?: number
}

const pad = (value: number): string => String(value).padStart(2, '0')

/** `YYYY-MM-DD | HH:mm:ss` on a 24-hour clock, in the local time zone. */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  return `${day} | ${time}`
}

export default function LLMResponseInfoPopover({
  usage,
  model,
  createdAt,
}: LLMResponseInfoProps) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className="clickable-icon">
          <CircleGauge size={12} />
        </button>
      </Popover.Trigger>
      <Popover.Content
        className="zncz-popover-content zncz-llm-info-content"
        side="bottom"
        sideOffset={3}
        collisionPadding={12}
        avoidCollisions={true}
      >
        <div className="zncz-llm-info-tokens">
          {usage && (
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
              <div className="zncz-llm-info-token-row zncz-llm-info-token-time">
                <Hourglass className="zncz-llm-info-icon--time" />
                <span>时间：</span>
                <span className="zncz-llm-info-token-value">
                  {createdAt === undefined ? '' : formatTimestamp(createdAt)}
                </span>
              </div>
            </div>
          )}
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
    </Popover.Root>
  )
}
