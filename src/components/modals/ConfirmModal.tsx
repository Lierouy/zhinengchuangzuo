import { App } from 'obsidian'
import { useState } from 'react'

import { CONSOLE_HINT, reportError } from '../../utils/reportError'
import { ReactModal } from '../common/ReactModal'

export type ConfirmModalOptions = {
  title: string
  message: string
  ctaText?: string
  onConfirm: () => void | Promise<void>
  onCancel?: () => void
}

type ConfirmModalComponentProps = {
  message: string
  ctaText?: string
  onConfirm: () => void | Promise<void>
  onCancel?: () => void
  onClose: () => void
}

export class ConfirmModal extends ReactModal<ConfirmModalComponentProps> {
  constructor(app: App, options: ConfirmModalOptions) {
    super({
      app: app,
      Component: ConfirmModalComponent,
      props: {
        message: options.message,
        ctaText: options.ctaText,
        onConfirm: options.onConfirm,
        onCancel: options.onCancel,
      },
      options: {
        title: options.title,
      },
    })
  }
}

function ConfirmModalComponent({
  message,
  ctaText,
  onConfirm,
  onCancel,
  onClose,
}: ConfirmModalComponentProps) {
  const [isPending, setIsPending] = useState(false)

  const handleConfirm = async () => {
    if (isPending) return
    setIsPending(true)
    try {
      await onConfirm()
      onClose()
    } catch (error) {
      reportError(`Operation failed, ${CONSOLE_HINT}`, error)
      setIsPending(false)
    }
  }

  return (
    <div>
      <div style={{ whiteSpace: 'pre-wrap' }}>{message}</div>
      <div className="modal-button-container">
        <button
          className="mod-warning"
          onClick={() => void handleConfirm()}
          disabled={isPending}
        >
          {ctaText ?? 'Confirm'}
        </button>
        <button
          className="mod-cancel"
          onClick={() => {
            onClose()
            onCancel?.()
          }}
          disabled={isPending}
        >
          取消
        </button>
      </div>
    </div>
  )
}
