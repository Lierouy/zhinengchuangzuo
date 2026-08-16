import { Ban, Send } from 'lucide-react'

export function SubmitButton({
  onClick,
  isLoading = false,
  onAbort,
}: {
  onClick: () => void
  isLoading?: boolean
  onAbort?: () => void
}) {
  return (
    <div
      className="zncz-chat-user-input-submit-button"
      onClick={isLoading && onAbort ? onAbort : onClick}
      style={
        isLoading
          ? {
              color: 'var(--text-normal)',
              backgroundColor: 'var(--blockquote-border-color)',
              borderRadius: 'var(--radius-s)',
            }
          : undefined
      }
    >
      <div className="zncz-chat-user-input-submit-button-icons">
        {isLoading ? <Ban size={12} /> : <Send size={12} />}
      </div>
      <div>{isLoading ? '停止' : '发送'}</div>
    </div>
  )
}
