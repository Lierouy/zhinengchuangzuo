# 项目架构说明文档 (Project Structure)

本页提供了 `src` 文件夹及其子文件夹的详细说明，旨在帮助开发者快速了解项目代码组织结构。

## 核心目录概览

```text
src/
├── components/      # UI 组件层 (React)
├── contexts/        # 状态管理层 (React Context)
├── core/            # LLM 服务核心逻辑 (Provider 模式)
├── database/        # 数据持久化层 (本地 JSON 文件)
├── hooks/           # 自定义 React Hooks
├── settings/        # 插件设置页与配置 Schema
├── types/           # 全局 TypeScript 类型声明
├── utils/           # 通用工具函数
├── ChatView.tsx     # Obsidian 自定义视图容器
├── constants.ts     # 全局常量定义
└── main.ts          # 插件入口文件 (Obsidian Plugin Entry)
```

---

## 详细说明

### 1. `src/components/` — 界面组件

所有 React UI 组件，按功能域划分。

#### 1.1 `chat-input/` — 聊天输入模块

基于 [Lexical] 富文本编辑器构建的输入区域。

| 文件 | 职责 |
|---|---|
| `ChatUserInput.tsx` | 聊天输入框容器组件。管理 `mentionables`（已选文件/图片/块引用）列表、提交逻辑、停止生成按钮、`ModelSelect` 和 `ImageUploadButton` 的布局。通过 `forwardRef` 暴露 `focus()` 方法供外部调用。 |
| `LexicalContentEditable.tsx` | Lexical 编辑器的 DOM 挂载点。接收 `editorRef`、`contentEditableRef`、`onChange`、`onEnter`、`onFocus`、`onMentionNodeMutation`、`onCreateImageMentionables` 等回调，集成各插件。 |
| `LexicalMenu.ts` | Lexical 菜单选项的抽象基类 `MenuOption`，以及 `MenuTextMatch` 类型。 |
| `LexicalTypeaheadMenuPlugin.tsx` | 泛型提及补全弹窗插件（fork 自 `@lexical/react` 的内置插件）。提供按键导航、滚动跟随、正则触发匹配等通用能力。 |
| `editor-state-to-plain-text.ts` | 将 Lexical `SerializedEditorState` 转换为纯文本字符串，用于提取用户输入的真实内容发送给 LLM。 |
| `get-metionable-icon.ts` | 根据 `Mentionable` 类型（file / folder / current-file / block / image）返回对应的 `lucide-react` 图标组件。 |
| `ModelSelect.tsx` | 模型选择下拉菜单。列出所有已启用（`enable=true`）的 `ChatModel`，点击后更新 `chatModelId`。基于 `@radix-ui/react-dropdown-menu` 实现。 |
| `SubmitButton.tsx` | 发送按钮组件，带 `ArrowUp` 图标。 |
| `ImageUploadButton.tsx` | 图片上传按钮组件，点击触发 `<input type="file">`，将选中的图片转为 base64 `MentionableImage`。 |
| `MentionableBadge.tsx` | 输入框上方已选引用文件的徽章组件。根据 `Mentionable` 类型渲染不同的子组件（`FileBadge` / `FolderBadge` / `CurrentFileBadge` / `BlockBadge` / `ImageBadge`），支持删除和点击打开文件。 |

##### Lexical 插件

| 文件 | 职责 |
|---|---|
| `OnEnterPlugin.tsx` | 监听 Enter 键，触发提交（不换行）。 |
| `OnMutationPlugin.tsx` | 监听 DOM 变更，追踪 `MentionNode` 的创建/销毁事件，回调给上层同步 `mentionables` 状态。 |
| `NoFormatPlugin.tsx` | 禁用 Lexical 编辑器的内置格式快捷键（加粗、斜体、下划线等），保持纯文本体验。 |
| `TemplatePlugin.tsx` | 模板插入插件。当输入 `;;` 时弹出模板列表，选中后将模板内容插入编辑器。 |

##### 图片处理

| 文件 | 职责 |
|---|---|
| `image/ImagePastePlugin.tsx` | 监听粘贴事件，提取剪贴板中的图片并转为 base64 `MentionableImage`。 |
| `image/DragDropPastePlugin.tsx` | 监听拖拽/拖放事件，提取拖入的图片文件并转为 base64 `MentionableImage`。 |

##### 提及 (@mention) 功能

| 文件 | 职责 |
|---|---|
| `mention/MentionNode.ts` | Lexical 自定义 `DecoratorNode`，表示一个已插入的提及引用。携带序列化的 `mentionable` 数据，渲染为文本片段。提供 `$createMentionNode` 和 `$isMentionNode` 工厂/判断函数。 |
| `mention/MentionPlugin.tsx` | 提及补全插件。监听 `@` 输入，调用 `fuzzySearch` 获取匹配的文件/文件夹，通过 `LexicalTypeaheadMenuPlugin` 展示下拉菜单。选中后创建 `MentionNode` 插入光标位置。 |

---

#### 1.2 `chat-view/` — 聊天视图模块

聊天界面的核心视角，包含消息列表、流式响应、Markdown 渲染等。

| 文件 | 职责 |
|---|---|
| `Chat.tsx` | 聊天主组件。管理会话状态（`conversationId` + `chatMessages` 原子更新）、分页（每页 50 条）、消息提交流水线（编译 → 发送 → 流式渲染）、"单独处理"文件、历史会话加载/新建/删除、`ChatUserInput` 与 `ChatListDropdown` 的集成。通过 `useImperativeHandle` 暴露 `openNewChat`、`addSelectionToChat`、`startHandleStream` 等 API 给外部调用。 |
| `ChatListDropdown.tsx` | 历史会话列表下拉菜单。支持 Enter/上下箭头键盘导航、重命名（双击编辑）、删除确认、悬停聚焦。基于 `@radix-ui/react-popover` 实现。 |
| `UserMessageItem.tsx` | 单条用户消息的渲染组件。显示用户输入的文本（通过 `SelectedBlockFold` 支持块引用折叠）、提及的文件徽章、时间戳，支持删除。 |
| `AssistantMessageReasoning.tsx` | AI 回复的思考过程（reasoning）折叠面板。使用 `<details>` 元素实现折叠，只展示最后一行作为摘要。 |
| `LLMResponseInfoPopover.tsx` | LLM 响应元信息弹窗。悬停或点击时展示 token 用量、模型名称、完成时间等统计。基于 `@radix-ui/react-popover` 实现。 |
| `ObsidianMarkdown.tsx` | Markdown 渲染器。将 AI 回复文本解析为 HTML（使用 `react-syntax-highlighter` 做代码高亮），支持流式输出的增量渲染和自动滚动。 |
| `SelectedBlockFold.tsx` | 用户消息中选中块的折叠组件。以文件名 + 行号作为标题，点击展开/折叠块内容。 |
| `useChatStreamManager.ts` | 聊天流式响应管理器 Hook。核心逻辑：根据 `chatModelId` 初始化 `providerClient`、在 stream 循环中逐 chunk 更新 `ChatAssistantMessage`、拦截非标准 XML 标签（如 `<thinking>`）将其内容移至 `reasoning` 字段、错误处理和配置提示。 |
| `useAutoScroll.ts` | 自动滚动 Hook。智能判断用户是否手动上滚（暂停自动滚动），距离底部较近时自动跟随新内容，提供 `forceScrollToBottom` / `forceScrollToTop` 手动控制。 |

---

#### 1.3 `common/` — 通用 UI 组件

Obsidian 风格的通用 UI 封装，供 `settings/` 和 `modals/` 复用。

| 文件 | 职责 |
|---|---|
| `ObsidianSetting.tsx` | Obsidian 风格的设置行容器（`div.setting`），接受 `name`、`desc`、`required` 等属性。 |
| `ObsidianTextInput.tsx` | Obsidian 风格的文本输入框。 |
| `ObsidianTextArea.tsx` | Obsidian 风格的多行文本域。 |
| `ObsidianDropdown.tsx` | Obsidian 风格的下拉选择框。 |
| `ObsidianToggle.tsx` | Obsidian 风格的开关组件。 |
| `ObsidianButton.tsx` | Obsidian 风格的按钮，支持 `cta`（主操作按钮）样式。 |
| `ReactModal.tsx` | 通用 React 弹窗基类。继承 Obsidian `Modal`，在 `onOpen` 中挂载 React 组件树，在 `onClose` 中卸载。 |

---

#### 1.4 `modals/` — 弹窗组件

| 文件 | 职责 |
|---|---|
| `ConfirmModal.tsx` | 确认对话框。显示标题、消息和确认/取消两个按钮，返回 Promise 等待用户选择。 |
| `ErrorModal.tsx` | 错误弹窗。显示错误标题和消息，可选展示原始错误栈（rawError），可选跳转到设置页面。 |
| `HandleSectionModal.tsx` | "单独处理"功能弹窗。提供文本输入区和 Prompt 编辑器，让用户设置自定义处理指令。 |
| `HandlePromptEditorModal.tsx` | 处理 Prompt 编辑器弹窗。使用 Lexical 编辑器输入处理指令。 |
| `TemplateSectionModal.tsx` | 预设提示模板管理弹窗。显示模板列表，支持添加/编辑/删除模板条目。 |
| `TemplateFormModal.tsx` | 模板表单弹窗。填写模板名称和内容，校验通过后保存。 |
| `ContextManagementModal.tsx` | 上下文管理系统弹窗。管理 Prompt 分组（PromptGroup）的创建、删除、选择。 |
| `PromptGroupManageModal.tsx` | 单个 Prompt 分组的管理弹窗。展示该组下的所有 PromptItem，支持增删改、启用/禁用。 |
| `PromptItemFormModal.tsx` | Prompt 条目表单弹窗。填写名称、内容、条件激活规则（关键词、过滤词、过滤逻辑、连带激活）等属性。 |

---

#### 1.5 `settings/` — 设置页面

| 文件 | 职责 |
|---|---|
| `SettingsTabRoot.tsx` | 设置面板根组件。组合所有设置分区（供应商、模型、会话、处理、模板、上下文、杂项）。 |

##### 1.5.1 `sections/` — 设置分区

| 文件 | 职责 |
|---|---|
| `ProvidersSection.tsx` | 供应商管理分区。列出所有 `LLMProvider`，显示名称和类型标签，支持添加/编辑/删除供应商。 |
| `ModelsSection.tsx` | 模型管理分区。列出所有 `ChatModel`，显示名称和所属供应商，支持启用/禁用、添加/编辑/删除模型。 |
| `ChatSection.tsx` | 会话设置分区。选择默认会话模型、开关自动提交当前文件、配置文件字数上限。 |
| `HandleSection.tsx` | 处理功能设置分区。编辑"单独处理"所用的 Prompt 指令。 |
| `TemplateSection.tsx` | 模板设置分区。管理模板条目，支持添加/编辑/删除。 |
| `ContextManagementSection.tsx` | 上下文管理设置分区。选择当前激活的 Prompt 分组及其提示数量上限。 |
| `EtcSection.tsx` | 杂项设置分区。 |

##### 1.5.2 `modals/` — 设置页弹窗

| 文件 | 职责 |
|---|---|
| `AddChatModelModal.tsx` | 添加/编辑 ChatModel 的表单弹窗。包含供应商选择、模型名称（唯一标识）、模型 ID（API 调用 ID）、temperature/topP/maxTokens/contextCount/streamOutput/自定义参数等设置。创建时有重复名称检查。 |
| `ProviderFormModal.tsx` | 添加/编辑 LLMProvider 的表单弹窗。包含供应商类型选择、名称（唯一标识）、URL 地址、API 密钥、思考字段设置、以及根据 `PROVIDER_TYPES_INFO` 动态渲染的额外设置项（如 "无请求标头" 开关）。 |

---

### 2. `src/core/` — LLM 服务层

采用 Provider 模式封装不同 AI 供应商的 API 调用。

| 文件 | 职责 |
|---|---|
| `base.ts` | 抽象基类 `BaseLLMProvider<T>`，定义所有供应商需实现的方法：`generateResponse`（非流式）、`streamResponse`（流式）、`getModelProvider`。内置 `tokenize` 工具方法。 |
| `openaiProvider.ts` | OpenAI 兼容供应商。自动检测 `noStainless` 配置来决定使用标准 `openai` SDK 还是 `NoStainlessOpenAI`（无请求标头版本）。支持 `stream: true` 的 SSE 流式响应和扩展参数注入。 |
| `anthropicProvider.ts` | Anthropic 兼容供应商。封装 `@anthropic-ai/sdk`，类似支持 `noStainless` 切换、流式响应和扩展参数。 |
| `googleProvider.ts` | Google 兼容供应商。封装 `@google/genai` SDK，类似支持 `noStainless` 切换、流式响应和扩展参数。 |
| `manager.ts` | 供应商管理器。核心函数 `getProviderClient`（根据 `providerId` 找到配置并实例化 Provider 客户端）和 `getChatModelClient`（根据 `chatModelId` 找到 `ChatModel`，再找其所属的 Provider 客户端）。 |
| `openaiMessageAdapter.ts` | 消息格式适配器。将内部消息格式转为 OpenAI 兼容的请求消息格式，处理 `system`、`user`、`assistant` 角色的转换。 |
| `exception.ts` | LLM 相关异常类：`LLMAPIKeyNotSetException`、`LLMAPIKeyInvalidException`、`LLMBaseUrlNotSetException`、`LLMModelNotFoundException`。 |
| `NoStainlessOpenAI.ts` | 无请求标头版 OpenAI 客户端。不使用 `stainless` 库的默认请求头，适用于对请求头敏感的中转服务。 |
| `NoStainlessAnthropic.ts` | 无请求标头版 Anthropic 客户端。 |
| `NoUserAgentGoogle.ts` | 无 User-Agent 版 Google 客户端。 |

---

### 3. `src/contexts/` — 状态管理

通过 React Context API 提供依赖注入和全局状态共享。

| 文件 | 职责 |
|---|---|
| `app-context.tsx` | 注入 Obsidian `App` 实例，让深层组件无需逐层传 prop 即可访问 Vault API、Workspace 等。 |
| `plugin-context.tsx` | 注入插件主实例 `ZhinengchuangzuoPlugin`，供子组件调用 `plugin.setSettings` 等。 |
| `settings-context.tsx` | 注入插件设置 `settings` 及其更新函数 `setSettings`，所有需要读写配置的组件通过 `useSettings()` 获取。 |
| `chat-view-context.tsx` | 管理当前聊天窗口的局部状态。 |

---

### 4. `src/database/` — 数据持久化

所有数据以 JSON 文件形式存储在插件目录下（`user_data/`）。

| 文件 | 职责 |
|---|---|
| `base.ts` | 数据库基类 `JsonDatabase<T>`。封装 Obsidian Vault Adapter 的文件 I/O，递归创建目录，将 JS 对象序列化为 JSON 文件存储。 |
| `constants.ts` | 数据库根目录常量：`chats/`、`contexts/`、`templates/`。 |
| `exception.ts` | 数据库相关异常：`DuplicateChatModelException`、`DuplicateProviderException`。 |

##### 4.1 `chat/` — 聊天记录管理

| 文件 | 职责 |
|---|---|
| `ChatManager.ts` | 聊天记录管理器。使用 UUID 标识每个会话，提供 `createOrUpdate`、`delete`、`findAll`、`findById` 等 CRUD 方法。 |
| `types.ts` | 聊天会话元数据类型 `ChatConversationMetadata`（id、title、schemaVersion、createdAt、updatedAt）。 |

##### 4.2 `template/` — 模板管理

| 文件 | 职责 |
|---|---|
| `TemplateManager.ts` | 模板管理器。管理预设提示词模板的 CRUD，每个模板含 `id`（UUID）、`name`、`content`、`sortOrder`。 |
| `types.ts` | 模板类型 `Template` 和 `TemplateMetadata`。 |

##### 4.3 `context/` — 上下文管理

| 文件 | 职责 |
|---|---|
| `ContextManager.ts` | 上下文管理器。管理 Prompt 分组（`PromptGroup`）及组内 `PromptItem` 的 CRUD。支持条件激活规则（关键词匹配、过滤词、逻辑关系、连带激活链）。 |
| `types.ts` | 上下文类型：`PromptItem`（id/UUID、name、content、enabled、conditionalActivation、keywords、filterWords、filterLogic、chainActivation）、`PromptGroup`（id/UUID、name、prompts[]）、`FilterLogic`（AND_ANY / AND_ALL / NOT_ALL / NOT_ANY）。 |

---

### 5. `src/hooks/` — 自定义 Hooks

| 文件 | 职责 |
|---|---|
| `useChatHistory.ts` | 聊天历史 Hook。封装 `ChatManager`、`ContextManager`、`TemplateManager` 的常用操作，提供 `createOrUpdateConversation`、`deleteConversation`、`getChatMessagesById`、`updateConversationTitle`、`chatList` 等能力。 |
| `useJsonManagers.ts` | JSON 管理器初始化 Hook。在组件挂载时创建 `ChatManager`、`TemplateManager`、`ContextManager` 实例。 |

---

### 6. `src/settings/` — 插件设置

| 文件 | 职责 |
|---|---|
| `SettingTab.tsx` | Obsidian 设置面板的桥接层。继承 `PluginSettingTab`，在 `display()` 中用 React 18 `createRoot` 挂载 `<SettingsProvider>` 和 `<SettingsTabRoot>`，在 `hide()` 中卸载。 |
| `schema/setting.types.ts` | 设置的类型定义与 Zod 校验 Schema。核心字段：`providers`、`chatModels`、`chatModelId`、`selectedPromptGroupId`、`handlePrompt`、`chatOptions`。通过 `SETTINGS_SCHEMA_VERSION` 管理版本。 |
| `schema/settings.ts` | 设置的默认值与迁移逻辑。随版本号迭代对旧配置做兼容迁移。 |

---

### 7. `src/types/` — 全局类型定义

| 文件 | 职责 |
|---|---|
| `chat.ts` | 聊天消息类型：`ChatUserMessage`（Lexical 编辑器状态 + Prompt 内容 + mentionables）、`ChatAssistantMessage`（回复内容 + reasoning + token 用量）、`AssistantToolMessageGroup`（连续 assistant 消息的分组）、序列化版本。 |
| `chat-model.types.ts` | 模型配置类型 `ChatModel`。核心字段：`providerId`、`id`（API 调用 ID）、`model`（唯一标识名）、`providerType`、`enable` 和 `settings`（temperature / topP / contextCount / maxTokens / streamOutput / customParameters）。使用 Zod `discriminatedUnion` 按 `providerType` 区分。 |
| `mentionable.ts` | 提及类型：`Mentionable` 联合类型（file / folder / current-file / block / image）及其序列化版本 `SerializedMentionable`。`MentionableBlockData` 是选中块的数据结构（content + file + lines）。 |
| `provider.types.ts` | 供应商类型 `LLMProvider`。核心字段：`type`（openai-compatible / anthropic-compatible / google-compatible）、`id`（唯一标识名）、`baseUrl`、`apiKey`、`customReasoningField`、`additionalSettings`。 |
| `request.ts` | LLM 请求类型：`LLMRequest`（temperature / topP / maxTokens / stream）、`LLMRequestStreaming` / `LLMRequestNonStreaming`、`RequestMessage`（role + content）、`ContentPart`（text 或 image_url 片段）。 |
| `response.ts` | LLM 响应类型：`LLMResponse`、`LLMStreamChunk`（含 `delta` 的 `content` / `reasoning`）、`ResponseChoice`、`ResponseMessage`、`ResponseUsage`（token 统计）。 |

---

### 8. `src/utils/` — 工具函数

| 文件 | 职责 |
|---|---|
| `obsidian.ts` | Obsidian API 封装：文件读写（`readTFileContent` / `readMultipleTFiles`）、文件夹遍历（`getNestedFiles`）、选中块数据获取（`getMentionableBlockData`）、文件距离计算（`calculateFileDistance`）、Markdown 文件打开（`openMarkdownFile`）。 |
| `fuzzy-search.ts` | 模糊搜索引擎。当用户输入 `@` 时搜索 Vault 中的 `.md` 文件和文件夹，使用 `fuzzysort` 按路径和名称双键匹配，boost 机制优先展示最近修改或邻近当前文件的结果。 |
| `model-settings.ts` | 模型设置工具。`buildModelRequest` 从 `ChatModel` 构建 `LLMRequest`（含 temperature / topP / maxTokens、`customParameters` 的 JSON 解析注入）；`sanitizeModelSettings` 清理无效设置项。 |

##### 8.1 `chat/` — 聊天工具

| 文件 | 职责 |
|---|---|
| `mentionable.ts` | Mentionable 序列化/反序列化/去重 key/显示名，统一处理所有类型（file / folder / current-file / block / image）的转换逻辑。 |
| `message-groups.ts` | 消息分组函数。将连续的 `assistant` 消息合并为 `AssistantToolMessageGroup`，user 消息保持不变，用于分页计算和渲染。 |
| `promptGenerator.ts` | 提示词生成器 `PromptGenerator`。编译用户消息提示（读取文件/文件夹/块内容、处理图片 base64）、生成系统消息（基于条件激活规则匹配 `PromptItem`）、构建最终请求消息数组（system + currentFile + chatHistory）。 |

##### 8.2 `llm/` — LLM 工具

| 文件 | 职责 |
|---|---|
| `image.ts` | 图片处理。`fileToMentionableImage` 将 `File` 对象转为 base64 编码的 `MentionableImage`。 |
| `request.ts` | 请求构建工具。`finalizeRequest` 最终化请求对象、`extractUsage` 提取 token 用量、`handleRequestError` 处理 API 异常（如 401 API Key 异常）。 |

---

## 重要入口文件

| 文件 | 职责 |
|---|---|
| **`src/main.ts`** | Obsidian 插件入口。注册视图（`ChatView`）、添加命令（打开视图、右键"Ask LLM"、"Summarize current file"、"通过智能创作处理"文件）、加载/保存设置、处理设置迁移。 |
| **`src/ChatView.tsx`** | Obsidian 自定义视图容器。继承 `ItemView`，在 `onOpen` 中用 React 18 `createRoot` 挂载 `<AppProvider>` → `<PluginProvider>` → `<SettingsProvider>` → `<Chat>` 组件树，在 `onClose` 中卸载。 |
| **`src/constants.ts`** | 全局常量定义。`CHAT_VIEW_TYPE` 视图 ID、`PROVIDER_TYPES_INFO` 供应商类型描述表（label、required 字段、`COMMON_ADDITIONAL_SETTINGS` 共享定义）、`DEFAULT_PROVIDERS` 和 `DEFAULT_CHAT_MODELS` 默认空数组。 |
