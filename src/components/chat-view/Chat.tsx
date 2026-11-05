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
import { getChatModelClient } from '../../core/manager'
import { TemplateManager } from '../../database/template/TemplateManager'
import { useChatHistory } from '../../hooks/useChatHistory'
import {
  ChatAssistantMessageGroup,
  ChatMessage,
  ChatUserMessage,
} from '../../types/chat'
import {
  MentionableBlock,
  MentionableBlockData,
  MentionableCurrentFile,
} from '../../types/mentionable'
import { RequestMessage } from '../../types/request'
import {
  getMentionableKey,
  serializeMentionable,
} from '../../utils/chat/mentionable'
import { groupAssistantMessages } from '../../utils/chat/message-groups'
import { PromptGenerator } from '../../utils/chat/promptGenerator'
import { runCompletion } from '../../utils/llm/completion'
import { ModelSettings, buildModelRequest } from '../../utils/model-settings'
import { getOpenFiles } from '../../utils/obsidian'
import { ContextManagementModal } from '../modals/ContextManagementModal'
import { HandleSectionModal } from '../modals/HandleSectionModal'
import { TemplateSectionModal } from '../modals/TemplateSectionModal'

import ChatUserInput, {
  ChatUserInputRef,
  MAX_BLOCK_COUNT,
} from './../chat-input/ChatUserInput'
import { editorStateToPlainText } from './../chat-input/editor-state-to-plain-text'
import { ChatListDropdown } from './ChatListDropdown'
import { useAutoScroll } from './useAutoScroll'
import { useChatStreamManager } from './useChatStreamManager'
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
  startHandleStream: (fileContent: string) => Promise<void>
}

const PAGE_SIZE = 50

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
  } = useChatHistory()
  const promptGenerator = useMemo(() => {
    return new PromptGenerator(app, settings)
  }, [app, settings])

  const templateManager = useMemo(() => new TemplateManager(app), [app])

  const [inputMessage, setInputMessage] = useState<ChatUserMessage>(() =>
    getNewInputMessage(app),
  )
  const [addedBlockKey, setAddedBlockKey] = useState<string | null>(null)
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
  const [externalStreamActive, setExternalStreamActive] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)

  const groupedChatMessages: (ChatUserMessage | ChatAssistantMessageGroup)[] =
    useMemo(() => {
      return groupAssistantMessages(chatMessages)
    }, [chatMessages])

  // 计算总页数
  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(groupedChatMessages.length / PAGE_SIZE))
  }, [groupedChatMessages])

  // 获取当前页的消息
  const currentPageMessages = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE
    const endIndex = startIndex + PAGE_SIZE
    return groupedChatMessages.slice(startIndex, endIndex)
  }, [groupedChatMessages, currentPage])

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

  // Mounted flag to avoid state updates after unmount
  const isMounted = useRef(true)
  useEffect(() => {
    // 在 effect 体内显式重置为 true：
    // React StrictMode 会执行 mount → cleanup → mount 周期，
    // cleanup 会把 isMounted.current 设为 false，而 useRef(true) 只在
    // 第一次挂载时初始化，第二次挂载不会重新赋值，导致它永远是 false。
    // 在 effect 体内设置可确保每次（重新）挂载后都是 true。
    isMounted.current = true
    return () => {
      isMounted.current = false
    }
  }, [])

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

  // Single follow-and-scroll effect: on new messages jump to the last page
  // (the page change re-runs this effect and performs the scroll); on page
  // changes scroll to bottom for the last page or to top for history pages.
  // Deletions never scroll; the clamp effect below handles their page count.
  const prevMessageCount = useRef<number>(0)
  useEffect(() => {
    const currLength = groupedChatMessages.length
    const prevLength = prevMessageCount.current
    prevMessageCount.current = currLength
    if (currLength < prevLength) return

    if (currLength > prevLength && currentPage < totalPages) {
      setCurrentPage(totalPages)
      return
    }

    // Wait two frames for React to render all messages in this page
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (currentPage === totalPages) {
          forceScrollToBottom()
        } else {
          forceScrollToTop()
        }
      })
    })
  }, [
    currentPage,
    totalPages,
    groupedChatMessages.length,
    forceScrollToBottom,
    forceScrollToTop,
  ])

  // 页码超出总页数时（例如删除消息后）自动收敛，避免空白页
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const { abortActiveStreams, submitChatMutation, registerAbortController } =
    useChatStreamManager({
      setChatMessages,
      autoScrollToBottom,
      promptGenerator,
    })

  const isBusy = submitChatMutation.isPending || externalStreamActive

  // Deleting a message may shrink the page count; clamp the page afterwards
  // instead of scheduling a state update from inside a state updater.
  const handleDeleteMessage = useCallback(
    (id: string) => {
      setChatMessages((prev) => prev.filter((m) => m.id !== id))
    },
    [setChatMessages],
  )

  // Start a streaming assistant message for handle of `fileContent`.
  const startHandleStream = useCallback(
    async (fileContent: string) => {
      try {
        abortActiveStreams()
        if (isMounted.current) setExternalStreamActive(true)

        // Derive provider client and model using existing utility
        const { providerClient, model } = getChatModelClient({
          modelId: settings.chatModelId,
          settings,
        })

        if (!providerClient || !model) {
          new Notice('Please add a model in settings first')
          if (isMounted.current) setExternalStreamActive(false)
          return
        }

        const abortController = new AbortController()
        const unregister = registerAbortController(abortController)

        try {
          const rawSettings: ModelSettings = model.settings ?? {}
          const handlePromptId: string = settings.handlePromptId
          let handlePrompt = ''
          if (handlePromptId) {
            const template = await templateManager.findById(handlePromptId)
            if (template) {
              handlePrompt = template.content.trim()
            }
          }
          if (!handlePrompt) {
            new Notice('Select the prompt to use in the settings first')
            if (isMounted.current) setExternalStreamActive(false)
            return
          }
          const messages: RequestMessage[] = [
            { role: 'system' as const, content: handlePrompt },
            { role: 'user', content: fileContent },
          ]

          const { baseRequest } = buildModelRequest(
            model,
            rawSettings,
            messages,
          )

          await runCompletion({
            providerClient,
            model,
            request: baseRequest,
            signal: abortController.signal,
            onUpdate: (assistantMessage) => {
              if (!isMounted.current) return
              setChatMessages((prev) => {
                const idx = prev.findIndex((m) => m.id === assistantMessage.id)
                if (idx === -1) return [...prev, assistantMessage]
                const next = [...prev]
                next[idx] = assistantMessage
                return next
              })
            },
            onScroll: autoScrollToBottom,
          })
        } finally {
          unregister()
          if (isMounted.current) setExternalStreamActive(false)
        }
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return
        console.error('StartHandleStream failed', e)
        new Notice('Unable to start file processing, please check the console')
        if (isMounted.current) setExternalStreamActive(false)
      }
    },
    [
      abortActiveStreams,
      registerAbortController,
      setChatMessages,
      autoScrollToBottom,
      settings,
      templateManager,
    ],
  )

  const handleLoadConversation = useCallback(
    async (conversationId: string) => {
      try {
        abortActiveStreams()
        const conversation = await getChatMessagesById(conversationId)
        if (!conversation) {
          throw new Error('Conversation not found')
        }
        if (!isMounted.current) return
        // 原子更新：conversationId 和 chatMessages 在同一次 setState 中更新，
        // 避免 React StrictMode 下两次独立 setState 产生中间状态被自动保存捕获。
        setConversationState({ conversationId, chatMessages: conversation })
        // 默认打开最后一页
        const initialGrouped = groupAssistantMessages(conversation)
        const initialTotalPages = Math.max(
          1,
          Math.ceil(initialGrouped.length / PAGE_SIZE),
        )
        if (isMounted.current) {
          setCurrentPage(initialTotalPages)
          setAddedBlockKey(null)
          const newInputMessage = getNewInputMessage(app)
          setInputMessage(newInputMessage)
          setFocusedMessageId(newInputMessage.id)
        }
      } catch (error) {
        new Notice('Failed to load conversation')
        console.error('Failed to load conversation', error)
      }
    },
    [app, abortActiveStreams, getChatMessagesById],
  )

  const handleNewChat = (selectedBlock?: MentionableBlockData) => {
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
      setAddedBlockKey(
        getMentionableKey(serializeMentionable(mentionableBlock)),
      )
    } else {
      setAddedBlockKey(null)
    }
    setInputMessage(newInputMessage)
    setFocusedMessageId(newInputMessage.id)
    abortActiveStreams()
  }

  const includeCurrentFileContent =
    settings.chatOptions.includeCurrentFileContent

  const handleUserMessageSubmit = useCallback(
    async ({ inputChatMessages }: { inputChatMessages: ChatMessage[] }) => {
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
              return {
                ...message,
                promptContent,
              }
            } catch (err) {
              new Notice(
                err instanceof Error
                  ? err.message
                  : 'The file content exceeds the limit and cannot be sent',
              )
              throw err
            }
          } else if (message.role === 'user' && message.promptContent) {
            return {
              ...message,
              promptContent: null,
            }
          }
          return message
        }),
      )

      setChatMessages(compiledMessages)

      submitChatMutation.mutate({
        chatMessages: compiledMessages,
      })
    },
    [
      submitChatMutation,
      promptGenerator,
      abortActiveStreams,
      setChatMessages,
      includeCurrentFileContent,
    ],
  )

  // 组件初始化时自动加载最近的历史会话（只执行一次）
  const hasLoadedInitialConversation = useRef(false)
  useEffect(() => {
    if (chatList.length > 0 && !hasLoadedInitialConversation.current) {
      hasLoadedInitialConversation.current = true
      // 取第一个就是最近的会话
      const recentConversation = chatList[0]
      void handleLoadConversation(recentConversation.id)
    }
  }, [chatList, handleLoadConversation])

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
        new Notice('Failed to save chat history')
        console.error('Failed to save chat history', error)
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

  // Updates the currentFile of the focused message (input or chat history)
  // This happens when active file changes or focused message changes
  const handleActiveLeafChange = useCallback(() => {
    const activeFile = app.workspace.getActiveFile()

    // If there's no active file or no open markdown files, remove any
    // existing `current-file` mentionables from the input or focused message.
    const openFiles = getOpenFiles(app)
    const noRealFileOpen = !activeFile || openFiles.length === 0

    if (noRealFileOpen) {
      // Remove current-file mentionables from inputMessage
      setInputMessage((prev) => ({
        ...prev,
        mentionables: prev.mentionables.filter(
          (m) => m.type !== 'current-file',
        ),
      }))

      // Also remove from focused history message if it's a user message
      if (focusedMessageId && inputMessage.id !== focusedMessageId) {
        setChatMessages((prevChatHistory) =>
          prevChatHistory.map((message) =>
            message.id === focusedMessageId && message.role === 'user'
              ? {
                  ...message,
                  mentionables: message.mentionables.filter(
                    (m) => m.type !== 'current-file',
                  ),
                }
              : message,
          ),
        )
      }

      return
    }

    const mentionable: Omit<MentionableCurrentFile, 'id'> = {
      type: 'current-file',
      file: activeFile,
    }

    if (!focusedMessageId) return
    if (inputMessage.id === focusedMessageId) {
      setInputMessage((prevInputMessage) => ({
        ...prevInputMessage,
        mentionables: [
          mentionable,
          ...prevInputMessage.mentionables.filter(
            (mentionable) => mentionable.type !== 'current-file',
          ),
        ],
      }))
    } else {
      setChatMessages((prevChatHistory) =>
        prevChatHistory.map((message) =>
          message.id === focusedMessageId && message.role === 'user'
            ? {
                ...message,
                mentionables: [
                  mentionable,
                  ...message.mentionables.filter(
                    (mentionable) => mentionable.type !== 'current-file',
                  ),
                ],
              }
            : message,
        ),
      )
    }
  }, [app, focusedMessageId, inputMessage.id, setChatMessages])

  useEffect(() => {
    app.workspace.on('active-leaf-change', handleActiveLeafChange)
    app.workspace.on('layout-change', handleActiveLeafChange)
    return () => {
      app.workspace.off('active-leaf-change', handleActiveLeafChange)
      app.workspace.off('layout-change', handleActiveLeafChange)
    }
  }, [app.workspace, handleActiveLeafChange])

  useImperativeHandle(ref, () => ({
    openNewChat: (selectedBlock?: MentionableBlockData) =>
      handleNewChat(selectedBlock),
    addSelectionToChat: (selectedBlock: MentionableBlockData) => {
      const mentionable: Omit<MentionableBlock, 'id'> = {
        type: 'block',
        ...selectedBlock,
      }

      const mentionableKey = getMentionableKey(
        serializeMentionable(mentionable),
      )

      // 当前输入框或聚焦消息中是否已存在该 block
      const existsInInput =
        focusedMessageId === inputMessage.id &&
        inputMessage.mentionables.some(
          (m) => getMentionableKey(serializeMentionable(m)) === mentionableKey,
        )
      const existsInHistory =
        focusedMessageId !== inputMessage.id &&
        chatMessages.some(
          (message) =>
            message.id === focusedMessageId &&
            message.role === 'user' &&
            message.mentionables.some(
              (m) =>
                getMentionableKey(serializeMentionable(m)) === mentionableKey,
            ),
        )

      if (existsInInput || existsInHistory) {
        return
      }

      // 限制 block 数量，超出上限时提示
      const blockCount =
        focusedMessageId === inputMessage.id
          ? inputMessage.mentionables.filter((m) => m.type === 'block').length
          : ((
              chatMessages.find(
                (message) =>
                  message.id === focusedMessageId && message.role === 'user',
              ) as ChatUserMessage | undefined
            )?.mentionables.filter((m) => m.type === 'block').length ?? 0)
      if (blockCount >= MAX_BLOCK_COUNT) {
        new Notice(`Up to ${MAX_BLOCK_COUNT} excerpts are allowed to be added`)
        return
      }

      setAddedBlockKey(mentionableKey)

      if (focusedMessageId === inputMessage.id) {
        setInputMessage((prevInputMessage) => ({
          ...prevInputMessage,
          mentionables: [...prevInputMessage.mentionables, mentionable],
        }))
      } else {
        setChatMessages((prevChatHistory) =>
          prevChatHistory.map((message) => {
            if (message.id === focusedMessageId && message.role === 'user') {
              return {
                ...message,
                mentionables: [...message.mentionables, mentionable],
              }
            }
            return message
          }),
        )
      }
    },
    focusMessage: () => {
      if (!focusedMessageId) return
      chatUserInputRefs.current.get(focusedMessageId)?.focus()
    },
    startHandleStream: async (fileContent: string) => {
      await startHandleStream(fileContent)
    },
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
                new TemplateSectionModal(app).open()
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
            setAddedBlockKey(null)
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
          addedBlockKey={addedBlockKey}
          isLoading={isBusy}
          onAbort={abortActiveStreams}
        />
      </div>
    </ChatContainerContext.Provider>
  )
})

Chat.displayName = 'Chat'
export default Chat
