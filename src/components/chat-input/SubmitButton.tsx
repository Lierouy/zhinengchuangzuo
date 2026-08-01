import { Send } from 'lucide-react'

export function SubmitButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="zncz-chat-user-input-submit-button" onClick={onClick}>
      <div className="zncz-chat-user-input-submit-button-icons">
        <Send size={12} />
      </div>
      <div>发送</div>
    </div>
  )
}
