import {
  Atom,
  FileClock,
  Layers,
  MessageSquarePlus,
  StepBack,
  StepForward,
  SwatchBook,
} from 'lucide-react'
import { App, Notice } from 'obsidian'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'

import { useApp } from '../../contexts/app-context'
import { ChatContainerContext } from '../../contexts/chat-container-context'
import { usePlugin } from '../../contexts/plugin-context'
import { useSettings } from '../../contexts/settings-context'
import { useChatHistory } from '../../hooks/useChatHistory'
import { useContextManager } from '../../hooks/useJsonManagers'
import {
  ChatAssistantMessageGroup,
  ChatMessage,
  ChatUserMessage,
  HandleStreamInput,
} from '../../types/chat'
import { MentionableBlock, MentionableBlockData } from '../../types/mentionable'
import {
  getChatModelProblem,
  notifyChatModelProblem,
} from '../../utils/chat/chatModel'
import {
  countMissingMentionables,
  getMentionableKey,
  serializeMentionable,
} from '../../utils/chat/mentionable'
import { groupAssistantMessages } from '../../utils/chat/message-groups'
import { PromptGenerator } from '../../utils/chat/promptGenerator'
import { reportError } from '../../utils/reportError'
import { ContextManagementModal } from '../modals/ContextManagementModal'
import { HandleSectionModal } from '../modals/HandleSectionModal'
import { TemplateSectionModal } from '../modals/TemplateSectionModal'

import ChatUserInput, { ChatUserInputRef } from './../chat-input/ChatUserInput'
import { editorStateToPlainText } from './../chat-input/editor-state-to-plain-text'
import { ChatListDropdown } from './ChatListDropdown'
import { useAutoScroll } from './useAutoScroll'
import { getPageCount, useChatPagination } from './useChatPagination'
import { useChatStreamManager } from './useChatStreamManager'
import { useCurrentFileSync } from './useCurrentFileSync'
import { useHandleStream } from './useHandleStream'
import { useMentionables } from './useMentionables'
import UserMessageItem from './UserMessageItem'

const getNewInputMessage = (app: App): ChatUserMessage => {
  return {
    role: 'user',
    content: null,
    promptContent: null,
    id: crypto.randomUUID(),
    mentionables: [
      {
        type: 'current-file',
        file: app.workspace.getActiveFile(),
      },
    ],
  }
}

export type ChatRef = {
  openNewChat: (selectedBlock?: MentionableBlockData) => void
  addSelectionToChat: (selectedBlock: MentionableBlockData) => void
  focusMessage: () => void
  startHandleStream: (input: HandleStreamInput) => Promise<void>
}

const Chat = forwardRef<ChatRef>((_props, ref) => {
  const app = useApp()
  const plugin = usePlugin()
  const { settings } = useSettings()

  const containerRef = useRef<HTMLDivElement>(null)

  const {
    createOrUpdateConversation,
    saveNow,
    deleteConversation,
    getChatMessagesById,
    updateConversationTitle,
    chatList,
    refreshChatList,
    cancelPendingSaves,
  } = useChatHistory()

  const contextManager = useContextManager()
  const promptGenerator = useMemo(
    () => new PromptGenerator(app, settings, contextManager),
    [app, settings, contextManager],
  )

  const [inputMessage, setInputMessage] = useState<ChatUserMessage>(() =>
    getNewInputMessage(app),
  )

  // "Highlight this badge" is an event, not a value: adding the same excerpt
  // again must re-trigger the highlight, so each request carries a fresh seq.
  const [mentionableHighlight, setMentionableHighlight] = useState<{
    key: string
    seq: number
  } | null>(null)
  const highlightSeqRef = useRef(0)
  const highlightMentionable = useCallback((key: string | null) => {
    if (!key) {
      setMentionableHighlight(null)
      return
    }
    highlightSeqRef.current += 1
    setMentionableHighlight({ key, seq: highlightSeqRef.current })
  }, [])

  // 将 conversationId 与 chatMessages 合并为单一 state，
  // 保证切换会话时两者原子更新，避免 React StrictMode 下
  // 自动保存 effect 捕获到中间状态（新 ID + 旧消息）导致数据错误覆盖。
  const [conversationState, setConversationState] = useState<{
    conversationId: string
    chatMessages: ChatMessage[]
  }>(() => ({ conversationId: crypto.randomUUID(), chatMessages: [] }))
  const currentConversationId = conversationState.conversationId
  const chatMessages = conversationState.chatMessages

  // 兼容原有代码：setChatMessages 只更新消息，保留当前 ID
  const setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>> =
    useCallback(
      (action) =>
        setConversationState((prev) => ({
          ...prev,
          chatMessages:
            typeof action === 'function' ? action(prev.chatMessages) : action,
        })),
      [],
    )

  const [focusedMessageId, setFocusedMessageId] = useState<string | null>(
    inputMessage.id,
  )

  const groupedChatMessages: (ChatUserMessage | ChatAssistantMessageGroup)[] =
    useMemo(() => groupAssistantMessages(chatMessages), [chatMessages])

  const chatUserInputRefs = useRef<Map<string, ChatUserInputRef>>(new Map())
  const chatMessagesRef = useRef<HTMLDivElement>(null)

  // Stable across keystrokes: an inline arrow would make React detach and
  // reattach the ref on every render, churning the Map.
  const inputRefCallback = useMemo(
    () => (ref: ChatUserInputRef | null) => {
      if (ref) {
        chatUserInputRefs.current.set(inputMessage.id, ref)
      } else {
        chatUserInputRefs.current.delete(inputMessage.id)
      }
    },
    [inputMessage.id],
  )

  // Clear input refs on unmount to avoid memory leaks
  useEffect(() => {
    const refs = chatUserInputRefs.current
    return () => {
      refs.clear()
    }
  }, [])

  const { autoScrollToBottom, forceScrollToBottom, forceScrollToTop } =
    useAutoScroll({
      scrollContainerRef: chatMessagesRef,
    })

  const { currentPage, setCurrentPage, totalPages, currentPageMessages } =
    useChatPagination({
      groupedMessages: groupedChatMessages,
      forceScrollToBottom,
      forceScrollToTop,
    })

  const { abortActiveStreams, submitChatMutation, registerAbortController } =
    useChatStreamManager({
      setChatMessages,
      autoScrollToBottom,
      promptGenerator,
    })

  const { startHandleStream, handleStreamActive } = useHandleStream({
    settings,
    setChatMessages,
    autoScrollToBottom,
    abortActiveStreams,
    registerAbortController,
  })

  const isBusy = submitChatMutation.isPending || handleStreamActive

  // Stop whatever is still running when the view closes. React ignores late
  // state updates after unmount, so no mounted flag is needed.
  useEffect(() => () => abortActiveStreams(), [abortActiveStreams])

  useCurrentFileSync({
    app,
    focusedMessageId,
    inputMessageId: inputMessage.id,
    setInputMessage,
    setChatMessages,
  })

  const { addSelectionToChat } = useMentionables({
    chatMessages,
    inputMessage,
    focusedMessageId,
    setInputMessage,
    setChatMessages,
    highlightMentionable,
  })

  const handleDeleteMessage = useCallback(
    (id: string) => {
      setChatMessages((prev) => prev.filter((m) => m.id !== id))
    },
    [setChatMessages],
  )

  const handleLoadConversation = useCallback(
    async (conversationId: string) => {
      try {
        abortActiveStreams()
        const conversation = await getChatMessagesById(conversationId)
        if (!conversation) {
          // The conversation was removed (a reset, or another window) after it
          // was listed, so there is nothing to open.
          new Notice('Failed to load conversation')
          return
        }
        // 原子更新：conversationId 和 chatMessages 在同一次 setState 中更新，
        // 避免 React StrictMode 下两次独立 setState 产生中间状态被自动保存捕获。
        setConversationState({ conversationId, chatMessages: conversation })
        // 默认打开最后一页
        setCurrentPage(
          getPageCount(groupAssistantMessages(conversation).length),
        )
        highlightMentionable(null)
        const newInputMessage = getNewInputMessage(app)
        setInputMessage(newInputMessage)
        setFocusedMessageId(newInputMessage.id)
      } catch (error) {
        reportError('Failed to load conversation', error)
      }
    },
    [
      app,
      abortActiveStreams,
      getChatMessagesById,
      highlightMentionable,
      setCurrentPage,
    ],
  )

  const handleNewChat = useCallback(
    (selectedBlock?: MentionableBlockData) => {
      // 原子更新：同时重置 conversationId 和 chatMessages
      setConversationState({
        conversationId: crypto.randomUUID(),
        chatMessages: [],
      })
      setCurrentPage(1)

      const newInputMessage = getNewInputMessage(app)
      if (selectedBlock) {
        const mentionableBlock: MentionableBlock = {
          type: 'block',
          ...selectedBlock,
        }
        newInputMessage.mentionables = [
          ...newInputMessage.mentionables,
          mentionableBlock,
        ]
        highlightMentionable(
          getMentionableKey(serializeMentionable(mentionableBlock)),
        )
      } else {
        highlightMentionable(null)
      }

      setInputMessage(newInputMessage)
      setFocusedMessageId(newInputMessage.id)
      abortActiveStreams()
    },
    [app, abortActiveStreams, highlightMentionable, setCurrentPage],
  )

  const includeCurrentFileContent =
    settings.chatOptions.includeCurrentFileContent

  const handleUserMessageSubmit = useCallback(
    async ({ inputChatMessages }: { inputChatMessages: ChatMessage[] }) => {
      // Without a usable model the request can only fail. Stop before any state
      // change so the message is not appended and the text stays in the input.
      // A stale selection is reported too instead of silently switching models:
      // sending with a model the user did not pick could cost real money.
      const modelProblem = getChatModelProblem(settings)
      if (modelProblem) {
        notifyChatModelProblem(modelProblem)
        throw new Error('No chat model selected')
      }

      abortActiveStreams()

      const lastMessage = inputChatMessages.at(-1)
      if (lastMessage?.role !== 'user') {
        throw new Error('Last message is not a user message')
      }

      const compiledMessages = await Promise.all(
        inputChatMessages.map(async (message) => {
          if (message.role === 'user' && message.id === lastMessage.id) {
            try {
              const currentFileRaw = message.mentionables.find(
                (m) => m.type === 'current-file',
              )?.file
              const currentFile =
                currentFileRaw && includeCurrentFileContent
                  ? currentFileRaw
                  : undefined

              const { promptContent } =
                await promptGenerator.compileUserMessagePrompt({
                  message,
                  currentFile,
                  isLatest: true,
                })
              return { ...message, promptContent }
            } catch (err) {
              new Notice(
                err instanceof Error
                  ? err.message
                  : 'The file content exceeds the limit and cannot be sent',
              )
              throw err
            }
          } else if (message.role === 'user' && message.promptContent) {
            return { ...message, promptContent: null }
          }
          return message
        }),
      )

      setChatMessages(compiledMessages)
      submitChatMutation.mutate({ chatMessages: compiledMessages })
    },
    [
      submitChatMutation,
      promptGenerator,
      abortActiveStreams,
      setChatMessages,
      includeCurrentFileContent,
      settings,
    ],
  )

  // 组件初始化时自动加载最近的历史会话（只执行一次）
  const hasLoadedInitialConversation = useRef(false)
  useEffect(() => {
    if (chatList.length > 0 && !hasLoadedInitialConversation.current) {
      hasLoadedInitialConversation.current = true
      // 取第一个就是最近的会话
      void handleLoadConversation(chatList[0].id)
    }
  }, [chatList, handleLoadConversation])

  // A full reset deletes every conversation, so drop the in-memory one too:
  // keeping it would let the next save write the deleted conversation back.
  useEffect(() => {
    return plugin.onDataReset(() => {
      abortActiveStreams()
      // A save that is still waiting for its debounce window belongs to the
      // conversation that was just deleted; letting it run would recreate it.
      cancelPendingSaves()
      setConversationState({
        conversationId: crypto.randomUUID(),
        chatMessages: [],
      })
      setInputMessage(getNewInputMessage(app))
      setFocusedMessageId(null)
      setCurrentPage(1)
      highlightMentionable(null)
      void refreshChatList()
    })
  }, [
    plugin,
    app,
    abortActiveStreams,
    cancelPendingSaves,
    refreshChatList,
    setCurrentPage,
    highlightMentionable,
  ])

  // While a response is streaming, `chatMessages` changes on every token.
  // Serialising and comparing the whole conversation that often is pure
  // waste, so the save waits until the stream finishes.
  const latestConversationRef = useRef({
    conversationId: currentConversationId,
    messages: chatMessages,
  })
  latestConversationRef.current = {
    conversationId: currentConversationId,
    messages: chatMessages,
  }
  const pendingStreamingSaveRef = useRef(false)

  useEffect(() => {
    if (chatMessages.length === 0) return

    if (isBusy) {
      pendingStreamingSaveRef.current = true
      return
    }

    pendingStreamingSaveRef.current = false
    let cancelled = false
    createOrUpdateConversation(currentConversationId, chatMessages).catch(
      (error) => {
        if (cancelled) return
        reportError('Failed to save chat history', error)
      },
    )

    return () => {
      cancelled = true
    }
  }, [currentConversationId, chatMessages, createOrUpdateConversation, isBusy])

  // Closing the view mid-stream would otherwise drop the deferred save, so
  // force one final write. Reads the latest state through a ref because the
  // cleanup closure is from the first render.
  useEffect(() => {
    return () => {
      if (!pendingStreamingSaveRef.current) return
      pendingStreamingSaveRef.current = false
      const { conversationId, messages } = latestConversationRef.current
      if (messages.length === 0) return
      saveNow(conversationId, messages).catch((error: unknown) => {
        console.error('Failed to save chat history', error)
      })
    }
  }, [saveNow])

  useImperativeHandle(ref, () => ({
    openNewChat: (selectedBlock?: MentionableBlockData) =>
      handleNewChat(selectedBlock),
    addSelectionToChat,
    focusMessage: () => {
      if (!focusedMessageId) return
      chatUserInputRefs.current.get(focusedMessageId)?.focus()
    },
    startHandleStream,
  }))

  return (
    <ChatContainerContext.Provider value={containerRef}>
      <div className="zncz-chat-container" ref={containerRef}>
        <div className="zncz-chat-header">
          <div className="zncz-chat-header-buttons-left">
            <button
              onClick={() => handleNewChat()}
              className="clickable-icon"
              aria-label="新会话"
            >
              <MessageSquarePlus size={18} />
            </button>

            <ChatListDropdown
              chatList={chatList}
              currentConversationId={currentConversationId}
              onSelect={async (conversationId) => {
                if (conversationId === currentConversationId) return
                await handleLoadConversation(conversationId)
              }}
              onDelete={async (conversationId) => {
                await deleteConversation(conversationId)
                if (conversationId === currentConversationId) {
                  const nextConversation = chatList.find(
                    (chat) => chat.id !== conversationId,
                  )
                  if (nextConversation) {
                    void handleLoadConversation(nextConversation.id)
                  } else {
                    handleNewChat()
                  }
                }
              }}
              onUpdateTitle={async (conversationId, newTitle) => {
                await updateConversationTitle(conversationId, newTitle)
              }}
            >
              <FileClock size={18} />
            </ChatListDropdown>

            <button
              onClick={() => {
                new ContextManagementModal(app, plugin).open()
              }}
              className="clickable-icon"
              aria-label="上下文系统"
            >
              <Layers size={18} />
            </button>

            <button
              onClick={() => {
                new TemplateSectionModal(app, plugin).open()
              }}
              className="clickable-icon"
              aria-label="预设提示"
            >
              <SwatchBook size={18} />
            </button>

            <button
              onClick={() => {
                new HandleSectionModal(app, plugin).open()
              }}
              className="clickable-icon"
              aria-label="单独处理"
            >
              <Atom size={18} />
            </button>
          </div>

          <div className="zncz-chat-header-buttons-right">
            {/* 分页控制 */}
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              className="clickable-icon"
              aria-label="前页"
              disabled={currentPage <= 1}
              style={{
                opacity: currentPage <= 1 ? 0.5 : 1,
                cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
              }}
            >
              <StepBack size={18} />
            </button>

            {/* 页数显示 */}
            <div className="zncz-chat-header-pagenumber">
              {currentPage}/{totalPages}
            </div>
            <button
              onClick={() =>
                setCurrentPage(Math.min(totalPages, currentPage + 1))
              }
              className="clickable-icon"
              aria-label="后页"
              disabled={currentPage >= totalPages}
              style={{
                opacity: currentPage >= totalPages ? 0.5 : 1,
                cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
              }}
            >
              <StepForward size={18} />
            </button>
          </div>
        </div>
        <div className="zncz-chat-messages" ref={chatMessagesRef}>
          {currentPageMessages.map((messageOrGroup) =>
            !Array.isArray(messageOrGroup) ? (
              <UserMessageItem
                key={messageOrGroup.id}
                message={messageOrGroup}
                isLoading={isBusy}
                onDelete={handleDeleteMessage}
              />
            ) : (
              messageOrGroup.map((msg) => (
                <UserMessageItem
                  key={msg.id}
                  message={msg}
                  isLoading={isBusy}
                  onDelete={handleDeleteMessage}
                />
              ))
            ),
          )}
        </div>
        <ChatUserInput
          key={inputMessage.id} // this is needed to clear the editor when the user submits a new message
          ref={inputRefCallback}
          initialSerializedEditorState={inputMessage.content}
          onChange={(content) => {
            setInputMessage((prevInputMessage) => ({
              ...prevInputMessage,
              content,
            }))
          }}
          onSubmit={async (content) => {
            const hasText = editorStateToPlainText(content).trim() !== ''
            const hasImages = inputMessage.mentionables.some(
              (m) => m.type === 'image',
            )
            const hasSelectedBlocks = inputMessage.mentionables.some(
              (m) => m.type === 'block',
            )

            if (!hasText && !hasImages && !hasSelectedBlocks) return

            // Mentions captured before a delete/rename still hold the old
            // reference; reading it would fail the whole request, so stop here
            // and let the user drop the bad badges.
            const missingCount = countMissingMentionables(
              inputMessage.mentionables,
              app,
            )
            if (missingCount > 0) {
              new Notice(
                `There are ${missingCount} files no longer exist, please remove them`,
              )
              return
            }

            try {
              await handleUserMessageSubmit({
                inputChatMessages: [
                  ...chatMessages,
                  { ...inputMessage, content },
                ],
              })
            } catch {
              // Error already shown by handleUserMessageSubmit, keep input content
              return
            }
            const nextInputMessage = getNewInputMessage(app)
            setInputMessage(nextInputMessage)
            highlightMentionable(null)
            setFocusedMessageId(nextInputMessage.id)
          }}
          onFocus={() => {
            setFocusedMessageId(inputMessage.id)
          }}
          mentionables={inputMessage.mentionables}
          setMentionables={(mentionables) => {
            setInputMessage((prevInputMessage) => ({
              ...prevInputMessage,
              mentionables,
            }))
          }}
          autoFocus
          highlightRequest={mentionableHighlight}
          isLoading={isBusy}
          onAbort={abortActiveStreams}
        />
      </div>
    </ChatContainerContext.Provider>
  )
})

Chat.displayName = 'Chat'
export default Chat
