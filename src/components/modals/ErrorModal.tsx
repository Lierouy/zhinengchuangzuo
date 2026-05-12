import { App } from 'obsidian'

import { ReactModal } from '../common/ReactModal'

type ErrorModalOptions = {
  showSettingsButton?: boolean
}

type ErrorModalComponentProps = {
  app: App
  message: string
  log?: string
  onClose: () => void
  options: ErrorModalOptions
}

export class ErrorModal extends ReactModal<ErrorModalComponentProps> {
  constructor(
    app: App,
    title: string,
    message: string,
    log?: string,
    options: ErrorModalOptions = {},
  ) {
    super({
      app: app,
      Component: ErrorModalComponent,
      props: {
        app,
        message,
        log,
        options,
      },
      options: {
        title,
      },
    })
  }
}

function ErrorModalComponent({
  app,
  message,
  log,
  onClose,
  options,
}: ErrorModalComponentProps) {
  const showLog = log && log !== message
  // 长消息：message 是截短的摘要，只展示完整 log；短消息：只展示 message
  const displayContent = showLog ? log : message

  return (
    <div className="zncz-error-modal-content">
      <pre className="zncz-error-modal-log">{displayContent}</pre>
      <div className="modal-button-container">
        {options.showSettingsButton && (
          <button
            className="mod-cta"
            onClick={() => {
              onClose()
              // @ts-expect-error: setting property exists in Obsidian's App but is not typed
              app.setting.open()
              // @ts-expect-error: setting property exists in Obsidian's App but is not typed
              app.setting.openTabById('zhinengchuangzuo')
            }}
          >
            打开设置
          </button>
        )}
        <button className="mod-cancel" onClick={onClose}>
          取消
        </button>
      </div>
    </div>
  )
}
