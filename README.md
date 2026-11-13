# 智能创作

Obsidian 插件。在侧边栏中与大模型对话，并将当前笔记、文件夹、选中文本和图片作为上下文提交。

| 项目 | 内容 |
| --- | --- |
| 插件 ID | `zhinengchuangzuo` |
| 版本 | 1.1.1 |
| 最低 Obsidian 版本 | 1.11.5 |
| 平台 | 桌面端与移动端（`isDesktopOnly: false`） |
| 许可证 | MIT |

## 功能

### 会话

- 聊天视图位于右侧边栏，可通过左侧功能区图标或命令打开。
- 支持流式输出；生成过程中可点击「停止」中止请求。
- 会话历史支持切换、重命名和删除；删除操作会二次确认。
- 每次打开新会话时可以携带当前选中的文本块。
- 消息操作：复制内容、将内容追加到当前笔记、删除消息；助手消息可查看模型名称与 token 用量。
- 支持折叠查看模型的推理内容（reasoning）。
- 输入框旁的模型选择器可以直接切换当前会话模型；未启用的模型不会出现在列表中。
- 长会话按页展示，可通过标题栏的「前页 / 后页」翻页。

### 上下文

- 在输入框中输入 `@` 可以引用文件、文件夹和当前文件。
- 选中的文本以块引用加入会话，并记录文件名与行号范围。
- 支持粘贴或上传图片，图片随消息一起提交。
- 文件与文件夹合计最多 10 个，文本块最多 5 个，图片最多 5 张。
- 会话设置中可以开启「自动提交当前文件」。

### 预设提示

- 在输入框中输入 `/` 打开预设提示菜单，按名称搜索后插入。
- 预设提示在设置中管理：创建、编辑、删除、排序。
- 「单独处理」功能使用预设提示作为系统提示。

### 上下文系统

- 提示以「提示组」为单位管理，同一时间只有一组生效。
- 单条提示可设置是否启用条件激活（关键词 / 过滤词 / 过滤逻辑）以及连带激活的目标提示。
- 激活的提示按顺序拼接。
- 可以在设置中或聊天视图的「上下文系统」弹窗中编辑。

### 单独处理当前文件

- 命令「单独处理当前文件」会读取当前笔记内容，解析其中的内部链接并附带被链接的内容，然后输出到聊天视图。
- 系统提示来自设置中的「处理提示」。
- 有效链接数量默认 30，当前文件与链接内容的总字数默认 300000。

## 快捷键

| 命令 ID | 名称 | 说明 |
| --- | --- | --- |
| `open-new-chat` | 开启助手会话 | 打开聊天视图并展示最近的会话 |
| `add-selection-to-chat` | 添加选中文本到会话 | 将编辑器中选中的内容加入当前会话 |
| `handle-current-file` | 单独处理当前文件 | 见上文「单独处理当前文件」 |

## 安装

### 手动安装

1. 将 `main.js`、`manifest.json`、`styles.css` 放入 vault 的插件目录：

   ```text
   <vault>/.obsidian/plugins/zhinengchuangzuo/
   ```

2. 在 Obsidian 中打开「设置 → 第三方插件」，关闭安全模式（如尚未关闭）。
3. 在已安装插件列表中找到「智能创作」并启用。

`versions.json` 仅用于发布与更新元数据，日常使用不需要它。

### 从源码构建

参见下方「开发」。

## 快速开始

1. 在设置中新增「提供商」，填写 URL 地址与 API 密钥。
2. 新增「模型」，选择上一步的提供商并填写模型 ID，在「会话」中选中该模型。
3. 通过功能区图标或命令「开启助手会话」打开聊天视图，输入内容后发送。

## 配置

配置项位于「设置 → 第三方插件 → 智能创作」。

| 分区 | 内容 |
| --- | --- |
| 会话 | 会话模型、自动提交当前文件、文件字数上限 |
| 提供商 | 新增 / 编辑 / 删除模型提供商 |
| 模型 | 新增 / 编辑 / 删除会话模型 |
| 预设提示 | 管理 `/` 菜单中的提示 |
| 上下文系统 | 当前生效的提示组、激活提示数量上限、提示组编辑 |
| 单独处理 | 处理提示、有效链接数量、处理字数上限 |
| 其他 | 初始化：还原全部设置并删除所有用户数据 |

### 提供商

支持两种类型：

- OpenAI 兼容。
- Anthropic 兼容。

其他字段：

- **模型思考字段**：当提供商返回的思考内容不在默认字段中时，可指定字段名。
- **去除请求标头**（`noStainless`）：部分提供商或中转接口对默认请求头不兼容时可开启。

API 密钥保存在 Obsidian 的「钥匙串」中，插件不保存明文，只保存该密钥的引用 ID。

### 模型

| 选项 | 说明 |
| --- | --- |
| 名称 | 用于在设置与模型选择器中显示 |
| 提供商 | 选择该模型所属的提供商 |
| 模型 ID | 调用 API 时使用的模型标识 |
| 采样温度 | 对应 `temperature` |
| 核心采样 | 对应 `top_p` |
| 输出词元数量 | 对应 `max_tokens`，留空由提供商决定 |
| 历史消息数量 | 发送请求时包含的历史消息条数 |
| 流式输出 | 是否使用流式响应 |
| 自定义参数 | 追加到请求顶层的键值或 JSON 片段 |

模型可以单独启用或停用；停用的模型不会出现在模型选择器中，也不会被用于发送请求。

## 数据存储

插件的所有数据都在插件目录内：

```text
<vault>/.obsidian/plugins/zhinengchuangzuo/
├── main.js
├── manifest.json
├── styles.css
└── user_data/
    ├── config.json
    ├── config.json.bak        # 配置无法解析或发生迁移时生成
    ├── chats/
    │   ├── _index.json
    │   └── v1_<id>.json
    ├── contexts/
    │   ├── _index.json
    │   └── v1_<id>.json
    └── templates/
        ├── _index.json
        └── v1_<id>.json
```

说明：

- `config.json` 是插件设置。文件无法解析时，插件会保留 `config.json.bak` 并以默认值启动。
- `chats/`、`contexts/`、`templates/` 下的 `_index.json` 是派生索引，可由对应目录中的记录文件重建。
- 设置中的「初始化」会删除整个 `user_data` 目录。
- 因为数据位于插件目录内，删除插件目录（包括在 Obsidian 中卸载插件）会一并删除会话、提示组和模板。需要保留时请自行备份。

## 开发

### 环境

- Node.js：见 `.nvmrc`（当前为 24.11.1）
- npm

### 脚本

```bash
npm install
npm run dev           # esbuild watch，输出 main.js
npm run build         # tsc --noEmit + 生产构建
npm run lint:check    # prettier + eslint
npm run lint:fix
npm run type:check    # tsc --noEmit
npm run test          # vitest run
npm run test:watch
npm run test:coverage
npm run verify        # lint + type check + test
npm run version <x.y.z>  # 更新 manifest.json / versions.json / package.json
```

### 构建

`esbuild.config.mjs` 以 `src/main.ts` 为唯一入口，输出 CommonJS 格式的 `main.js`：

- `obsidian`、CodeMirror 包和 Node 内置模块作为外部依赖，不打入产物。
- 生产构建会启用压缩与 tree shaking，并生成 `meta.json` 构建元数据。
- 测试文件不会被包含：esbuild 只从入口文件开始解析依赖图。

`main.js` 在仓库中被跟踪，因此源码改动后需要重新构建并提交产物。

### 目录结构

```text
src/
├── main.ts              # 插件入口：注册视图、命令、设置
├── ChatView.tsx         # 聊天视图容器
├── commands/            # 命令实现
├── components/          # 聊天界面、设置页、弹窗与通用组件
├── contexts/            # React Context（app / settings / chat 等）
├── core/                # LLM 提供商适配与消息格式转换
├── database/            # 基于 vault adapter 的 JSON 持久化层
├── hooks/               # 通用 React hooks
├── settings/            # 设置页入口与 zod schema
├── types/               # 共享类型
├── utils/               # 提示词、模型参数、mention 序列化等
└── test/                # 测试用 mock 与 fake app
```

### 测试

测试使用 Vitest，不依赖 Obsidian 运行环境。

- 默认使用 Node 环境；组件测试在文件开头用 `// @vitest-environment happy-dom` 切换到 DOM 环境。
- `obsidian` 包只有类型声明，`vitest.config.mts` 会将其别名到 `src/test/mocks/obsidian.ts`。新增使用的 Obsidian API 需要同步补充到该文件，否则导入会失败。
- mock 中的 UI 组件（`ButtonComponent`、`Setting` 等）在 DOM 环境下会创建真实元素，便于组件测试进行点击、输入与断言。
- `src/test/fakes/fakeApp.ts` 提供内存版 vault adapter，数据库层的 manager 直接基于它测试，不需要 mock 整个 Obsidian。
- 测试文件与被测代码放在同一目录，命名为 `*.test.ts` / `*.test.tsx`，因此同时受 `tsc --noEmit` 与 ESLint 检查。
- Lexical 相关逻辑不做编辑器挂载测试，改为测试纯函数（`cleanupEditorState`、`$findNodesOfType`、触发字符解析）以及 headless 编辑器下的 `MentionNode` 序列化往返。依赖真实布局、选区或输入法的行为（菜单定位、contenteditable 输入）留给手动验证。

### 持续集成

`.github/workflows/ci.yml` 配置为手动触发（`workflow_dispatch`），推送与 Pull Request 不会自动运行。在仓库的 Actions 页面选择 `CI` 工作流并点击运行，它依次执行：

1. `npm ci`
2. `npm run lint:check`
3. `npm run type:check`
4. `npm run test:coverage`
5. `npm run build`

本地对应的检查命令是 `npm run verify`（不含构建）。
自动化测试基于 Node 与 happy-dom，不包含真实 Obsidian、移动端、真实网络请求与输入法行为。

## 许可证

MIT，详见 [LICENSE](./LICENSE)。
