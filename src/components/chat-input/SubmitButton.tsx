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
  // While loading, the button either aborts or does nothing — it must never fall through to `onClick` and submit a duplicate message.
  const handleClick = () => {
    if (isLoading) {
      onAbort?.()
      return
    }
    onClick()
  }

  return (
    <div
      className="zncz-chat-user-input-submit-button"
      onClick={handleClick}
      onKeyDown={(evt) => {
        if (evt.key === 'Enter' || evt.key === ' ') {
          evt.preventDefault()
          handleClick()
        }
      }}
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
