import { ImagePlus } from 'lucide-react'
import { useRef } from 'react'

export function ImageUploadButton({
  onUpload,
  isAtLimit,
  onAtLimit,
}: {
  onUpload: (files: File[]) => void
  isAtLimit: boolean
  onAtLimit?: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    if (files.length > 0) {
      onUpload(files)
    }
    event.target.value = ''
  }

  return (
    <label
      className="zncz-chat-user-input-submit-button"
      onClick={(event) => {
        if (isAtLimit) {
          // 达到上限时阻止 label 默认行为，不弹出文件选择界面，并提示用户
          event.preventDefault()
          onAtLimit?.()
        }
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      <div className="zncz-chat-user-input-submit-button-icons">
        <ImagePlus size={12} />
      </div>
      <div>图片</div>
    </label>
  )
}
