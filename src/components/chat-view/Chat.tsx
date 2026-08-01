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
import { v4 as uuidv4 } from 'uuid'

import { useApp } from '../../contexts/app-context'
import { ChatContainerContext } from '../../contexts/chat-container-context'
import { usePlugin } from '../../contexts/plugin-context'
import { useSettings } from '../../contexts/settings-context'
import { getChatModelClient } from '../../core/manager'
import { TemplateManager } from '../../database/template/TemplateManager'
import { useChatHistory } from '../../hooks/useChatHistory'
import {
  AssistantToolMessageGroup,
  ChatAssistantMessage,
  ChatMessage,
  ChatUserMessage,
} from '../../types/chat'
import {
  MentionableBlock,
  MentionableBlockData,
  MentionableCurrentFile,
} from '../../types/mentionable'
import {
  LLMRequestNonStreaming,
  LLMRequestStreaming,
  RequestMessage,
} from '../../types/request'
import {
  getMentionableKey,
  serializeMentionable,
} from '../../utils/chat/mentionable'
import { groupAssistantAndToolMessages } from '../../utils/chat/message-groups'
import { PromptGenerator } from '../../utils/chat/promptGenerator'
import { ModelSettings, buildModelRequest } from '../../utils/model-settings'
import { getOpenFiles } from '../../utils/obsidian'
import { ContextManagementModal } from '../modals/ContextManagementModal'
import { HandleSectionModal } from '../modals/HandleSectionModal'
import { TemplateSectionModal } from '../modals/TemplateSectionModal'

import ChatUserInput, { ChatUserInputRef } from './../chat-input/ChatUserInput'
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
    id: uuidv4(),
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
  addAssistantMessage: (message: ChatAssistantMessage) => void
  startHandleStream: (fileContent: string) => Promise<void>
}

export type ChatProps = {
  selectedBlock?: MentionableBlockData
}

const Chat = forwardRef<ChatRef, ChatProps>((props, ref) => {
  const app = useApp()
  const plugin = usePlugin()
  const { settings, setSettings } = useSettings()

  const containerRef = useRef<HTMLDivElement>(null)

  const {
    createOrUpdateConversation,
    deleteConversation,
    getChatMessagesById,
    updateConversationTitle,
    chatList,
  } = useChatHistory()
  const promptGenerator = useMemo(() => {
    return new PromptGenerator(app, settings)
  }, [app, settings])

  const templateManager = useMemo(() => new TemplateManager(app), [app])

  const [inputMessage, setInputMessage] = useState<ChatUserMessage>(() => {
    const newMessage = getNewInputMessage(app)
    if (props.selectedBlock) {
      newMessage.mentionables = [
        ...newMessage.mentionables,
        {
          type: 'block',
          ...props.selectedBlock,
        },
      ]
    }
    return newMessage
  })
  const [addedBlockKey, setAddedBlockKey] = useState<string | null>(
    props.selectedBlock
      ? getMentionableKey(
          serializeMentionable({
            type: 'block',
            ...props.selectedBlock,
          }),
        )
      : null,
  )
  // Keep addedBlockKey in sync with props.selectedBlock
  useEffect(() => {
    if (props.selectedBlock) {
      const key = getMentionableKey(
        serializeMentionable({ type: 'block', ...props.selectedBlock }),
      )
      setAddedBlockKey(key)
    } else {
      setAddedBlockKey(null)
    }
  }, [props.selectedBlock])
  // 将 conversationId 与 chatMessages 合并为单一 state，
  // 保证切换会话时两者原子更新，避免 React StrictMode 下
  // 自动保存 effect 捕获到中间状态（新 ID + 旧消息）导致数据错误覆盖。
  const [conversationState, setConversationState] = useState<{
    conversationId: string
    chatMessages: ChatMessage[]
  }>(() => ({ conversationId: uuidv4(), chatMessages: [] }))
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

  const [focusedMessageId, setFocusedMessageId] = useState<string | null>(null)
  const [externalStreamActive, setExternalStreamActive] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 50

  const groupedChatMessages: (ChatUserMessage | AssistantToolMessageGroup)[] =
    useMemo(() => {
      return groupAssistantAndToolMessages(chatMessages)
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

  // 消息数变化时：新增 → 跳末页；删除 → 修正页码
  const prevMessageCount = useRef<number>(0)
  useEffect(() => {
    const currLength = groupedChatMessages.length
    const prevLength = prevMessageCount.current
    const delta = currLength - prevLength
    prevMessageCount.current = currLength

    const newTotalPages = Math.max(1, Math.ceil(currLength / PAGE_SIZE))

    if (delta > 0) {
      // 新增消息：自动跳到末页，已位于末页则立即滚动
      if (currentPage < newTotalPages) {
        setCurrentPage(newTotalPages)
      } else {
        forceScrollToBottom()
      }
    } else if (delta < 0 && currentPage > newTotalPages) {
      // 删除消息导致当前页超限
      setCurrentPage(newTotalPages)
    }
  }, [groupedChatMessages.length, currentPage, forceScrollToBottom])

  // Smart scrolling based on page position (skip on message deletion)
  const prevScrollLen = useRef<number>(0)
  useEffect(() => {
    const currLen = groupedChatMessages.length
    const isDecrease = currLen < prevScrollLen.current
    prevScrollLen.current = currLen
    // 消息减少时不滚动，避免删除操作触发意外跳转
    if (isDecrease) return

    const localTotalPages = Math.max(1, Math.ceil(currLen / PAGE_SIZE))
    // Wait two frames for React to render all messages in this page
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (currentPage === localTotalPages) {
          // Last page (newest messages): scroll to bottom
          forceScrollToBottom()
        } else {
          // History pages: scroll to top
          forceScrollToTop()
        }
      })
    })
  }, [
    currentPage,
    forceScrollToBottom,
    forceScrollToTop,
    groupedChatMessages.length,
  ])

  const { abortActiveStreams, submitChatMutation, registerAbortController } =
    useChatStreamManager({
      setChatMessages,
      autoScrollToBottom,
      promptGenerator,
    })

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
          setSettings,
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

          const useStreaming = !!baseRequest.stream

          if (useStreaming) {
            const responseStream = await providerClient.streamResponse(
              model,
              baseRequest as LLMRequestStreaming,
              { signal: abortController.signal },
            )

            let assistantMessage: ChatAssistantMessage | null = null
            for await (const chunk of responseStream) {
              if (abortController.signal.aborted) break

              if (!assistantMessage) {
                assistantMessage = {
                  id: `assistant-${Date.now()}`,
                  role: 'assistant',
                  content: '',
                  metadata: {
                    usage: {
                      prompt_tokens: 0,
                      completion_tokens: 0,
                      total_tokens: 0,
                    },
                    model: model.model,
                  },
                }
                if (isMounted.current) {
                  const assistant = assistantMessage
                  setChatMessages((prev) => [...prev, assistant])
                }
              }

              const contentChunk = chunk.choices[0]?.delta?.content ?? ''
              assistantMessage.content += contentChunk
              const reasoningChunk = chunk.choices[0]?.delta?.reasoning
              if (reasoningChunk)
                assistantMessage.reasoning =
                  (assistantMessage.reasoning ?? '') + reasoningChunk

              const currentUsage = assistantMessage.metadata?.usage ?? {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0,
              }
              assistantMessage.metadata = {
                ...assistantMessage.metadata,
                usage: {
                  prompt_tokens:
                    chunk.usage?.prompt_tokens ?? currentUsage.prompt_tokens,
                  completion_tokens:
                    chunk.usage?.completion_tokens ??
                    currentUsage.completion_tokens,
                  total_tokens:
                    chunk.usage?.total_tokens ?? currentUsage.total_tokens,
                },
              }

              if (isMounted.current) {
                const assistant = assistantMessage
                setChatMessages((prev) => {
                  const newMessages = [...prev]
                  const idx = newMessages.findIndex(
                    (m) => m.id === assistant.id,
                  )
                  if (idx !== -1) newMessages[idx] = { ...assistant }
                  return newMessages
                })
              }

              autoScrollToBottom()
            }
          } else {
            const nonStreamResponse = await providerClient.generateResponse(
              model,
              baseRequest as LLMRequestNonStreaming,
              { signal: abortController.signal },
            )
            const choice = nonStreamResponse.choices?.[0]
            const assistantMessage: ChatAssistantMessage = {
              id: `assistant-${Date.now()}`,
              role: 'assistant',
              content: choice?.message?.content ?? '',
              reasoning: choice?.message?.reasoning ?? undefined,
              metadata: {
                usage: nonStreamResponse.usage ?? {
                  prompt_tokens: 0,
                  completion_tokens: 0,
                  total_tokens: 0,
                },
                model: nonStreamResponse.model,
              },
            }
            if (isMounted.current)
              setChatMessages((prev) => [...prev, assistantMessage])
            autoScrollToBottom()
          }
        } finally {
          unregister()
          if (isMounted.current) setExternalStreamActive(false)
        }
      } catch (e) {
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
      setSettings,
      templateManager,
    ],
  )

  const registerChatUserInputRef = (
    id: string,
    ref: ChatUserInputRef | null,
  ) => {
    if (ref) {
      chatUserInputRefs.current.set(id, ref)
    } else {
      chatUserInputRefs.current.delete(id)
    }
  }

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
        const initialGrouped = groupAssistantAndToolMessages(conversation)
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
    setConversationState({ conversationId: uuidv4(), chatMessages: [] })
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
                currentFileRaw && settings.chatOptions.includeCurrentFileContent
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
        _conversationId: currentConversationId,
      })
    },
    [
      submitChatMutation,
      currentConversationId,
      promptGenerator,
      abortActiveStreams,
      setChatMessages,
      settings.chatOptions.includeCurrentFileContent,
    ],
  )

  useEffect(() => {
    setFocusedMessageId(inputMessage.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 组件初始化时自动加载最近的历史会话（只执行一次）
  const hasLoadedInitialConversation = useRef(false)
  useEffect(() => {
    if (chatList.length > 0 && !hasLoadedInitialConversation.current) {
      hasLoadedInitialConversation.current = true
      // 取第一个就是最近的会话
      const recentConversation = chatList[0]
      handleLoadConversation(recentConversation.id)
    }
  }, [chatList, handleLoadConversation])

  useEffect(() => {
    const updateConversationAsync = async () => {
      try {
        if (chatMessages.length > 0) {
          createOrUpdateConversation(currentConversationId, chatMessages)
        }
      } catch (error) {
        new Notice('Failed to save chat history')
        console.error('Failed to save chat history', error)
      }
    }
    updateConversationAsync()
  }, [currentConversationId, chatMessages, createOrUpdateConversation])

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

      setAddedBlockKey(getMentionableKey(serializeMentionable(mentionable)))

      if (focusedMessageId === inputMessage.id) {
        setInputMessage((prevInputMessage) => {
          const mentionableKey = getMentionableKey(
            serializeMentionable(mentionable),
          )
          // Check if mentionable already exists
          if (
            prevInputMessage.mentionables.some(
              (m) =>
                getMentionableKey(serializeMentionable(m)) === mentionableKey,
            )
          ) {
            return prevInputMessage
          }
          return {
            ...prevInputMessage,
            mentionables: [...prevInputMessage.mentionables, mentionable],
          }
        })
      } else {
        setChatMessages((prevChatHistory) =>
          prevChatHistory.map((message) => {
            if (message.id === focusedMessageId && message.role === 'user') {
              const mentionableKey = getMentionableKey(
                serializeMentionable(mentionable),
              )
              // Check if mentionable already exists
              if (
                message.mentionables.some(
                  (m) =>
                    getMentionableKey(serializeMentionable(m)) ===
                    mentionableKey,
                )
              ) {
                return message
              }
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
    addAssistantMessage: (message: ChatAssistantMessage) => {
      setChatMessages((prev) => [...prev, message])
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
          {currentPageMessages.map((messageOrGroup, _index) =>
            !Array.isArray(messageOrGroup) ? (
              <UserMessageItem
                key={messageOrGroup.id}
                message={messageOrGroup}
                isLoading={submitChatMutation.isPending || externalStreamActive}
                onDelete={(id) => {
                  setChatMessages((prev) => {
                    const newMessages = prev.filter((m) => m.id !== id)
                    const newTotalPages = Math.max(
                      1,
                      Math.ceil(
                        groupAssistantAndToolMessages(newMessages).length /
                          PAGE_SIZE,
                      ),
                    )
                    if (currentPage > newTotalPages) {
                      setTimeout(() => setCurrentPage(newTotalPages), 0)
                    }
                    return newMessages
                  })
                }}
              />
            ) : (
              messageOrGroup.map((msg) => (
                <UserMessageItem
                  key={msg.id}
                  message={msg}
                  isLoading={
                    submitChatMutation.isPending || externalStreamActive
                  }
                  onDelete={(id) => {
                    setChatMessages((prev) => {
                      const newMessages = prev.filter((m) => m.id !== id)
                      const newTotalPages = Math.max(
                        1,
                        Math.ceil(
                          groupAssistantAndToolMessages(newMessages).length /
                            PAGE_SIZE,
                        ),
                      )
                      if (currentPage > newTotalPages) {
                        setTimeout(() => setCurrentPage(newTotalPages), 0)
                      }
                      return newMessages
                    })
                  }}
                />
              ))
            ),
          )}
        </div>
        <ChatUserInput
          key={inputMessage.id} // this is needed to clear the editor when the user submits a new message
          ref={(ref) => registerChatUserInputRef(inputMessage.id, ref)}
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
            setInputMessage(getNewInputMessage(app))
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
          isLoading={submitChatMutation.isPending || externalStreamActive}
          onAbort={abortActiveStreams}
        />
      </div>
    </ChatContainerContext.Provider>
  )
})

Chat.displayName = 'Chat'
export default Chat
