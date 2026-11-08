import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ItemView, WorkspaceLeaf } from 'obsidian'
import React from 'react'
import { Root, createRoot } from 'react-dom/client'

import Chat, { ChatRef } from './components/chat-view/Chat'
import { CHAT_VIEW_TYPE } from './constants'
import { AppProvider } from './contexts/app-context'
import { ChatViewProvider } from './contexts/chat-view-context'
import { PluginProvider } from './contexts/plugin-context'
import { SettingsProvider } from './contexts/settings-context'
import ZhinengchuangzuoPlugin from './main'
import { HandleStreamInput } from './types/chat'
import { MentionableBlockData } from './types/mentionable'

export class ChatView extends ItemView {
  private root: Root | null = null
  private queryClient: QueryClient | null = null
  private chatRef: React.RefObject<ChatRef | null> = React.createRef()

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: ZhinengchuangzuoPlugin,
  ) {
    super(leaf)
  }

  getViewType() {
    return CHAT_VIEW_TYPE
  }

  override getIcon() {
    return 'user-round-pen'
  }

  getDisplayText() {
    return '助手会话'
  }

  override async onOpen() {
    this.render()
  }

  override async onClose() {
    this.root?.unmount()
    this.root = null
    this.queryClient?.clear()
    this.queryClient = null
  }

  render() {
    if (!this.root) {
      this.root = createRoot(this.containerEl.children[1])
    }

    // Reuse a single QueryClient for the lifetime of the view so caches and
    // in-flight mutations survive re-renders.
    this.queryClient ??= new QueryClient({
      defaultOptions: {
        queries: {
          gcTime: 0, // Immediately garbage collect queries. It prevents memory leak on ChatView close.
        },
        mutations: {
          gcTime: 0, // Immediately garbage collect mutations. It prevents memory leak on ChatView close.
        },
      },
    })

    this.root.render(
      <ChatViewProvider chatView={this}>
        <PluginProvider plugin={this.plugin}>
          <AppProvider app={this.app}>
            <SettingsProvider
              settings={this.plugin.settings}
              setSettings={(newSettings) =>
                this.plugin.setSettings(newSettings)
              }
              addSettingsChangeListener={(listener) =>
                this.plugin.addSettingsChangeListener(listener)
              }
            >
              <QueryClientProvider client={this.queryClient}>
                <React.StrictMode>
                  <Chat ref={this.chatRef} />
                </React.StrictMode>
              </QueryClientProvider>
            </SettingsProvider>
          </AppProvider>
        </PluginProvider>
      </ChatViewProvider>,
    )
  }

  openNewChat(selectedBlock?: MentionableBlockData) {
    this.chatRef.current?.openNewChat(selectedBlock)
  }

  async startHandleStream(input: HandleStreamInput) {
    await this.chatRef.current?.startHandleStream(input)
  }

  addSelectionToChat(selectedBlock: MentionableBlockData) {
    this.chatRef.current?.addSelectionToChat(selectedBlock)
  }

  focusMessage() {
    this.chatRef.current?.focusMessage()
  }
}
