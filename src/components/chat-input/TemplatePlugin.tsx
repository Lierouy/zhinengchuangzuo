import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { clsx } from 'clsx'
import {
  $createParagraphNode,
  $createTextNode,
  COMMAND_PRIORITY_NORMAL,
  LexicalEditor,
  TextNode,
} from 'lexical'
import { useCallback, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { Template } from '../../database/template/types'
import { useTemplateManager } from '../../hooks/useJsonManagers'

import { MenuOption } from './LexicalMenu'
import {
  LexicalTypeaheadMenuPlugin,
  useBasicTypeaheadTriggerMatch,
} from './LexicalTypeaheadMenuPlugin'
import { TEMPLATE_TRIGGER, isOtherTriggerActive } from './typeahead-triggers'

class TemplateTypeaheadOption extends MenuOption {
  name: string
  template: Template

  constructor(name: string, template: Template) {
    super(name)
    this.name = name
    this.template = template
  }
}

function TemplateMenuItem({
  index,
  isSelected,
  onClick,
  onMouseEnter,
  option,
}: {
  index: number
  isSelected: boolean
  onClick: () => void
  onMouseEnter: () => void
  option: TemplateTypeaheadOption
}) {
  return (
    <li
      key={option.key}
      tabIndex={-1}
      className={clsx('item', isSelected && 'selected')}
      ref={(el) => option.setRefElement(el)}
      role="option"
      aria-selected={isSelected}
      id={`typeahead-item-${index}`}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
    >
      <div className="zncz-template-menu-item">
        <div className="text">{option.name}</div>
      </div>
    </li>
  )
}

export default function TemplatePlugin() {
  const [editor] = useLexicalComposerContext()
  const templateManager = useTemplateManager()

  const [searchResults, setSearchResults] = useState<Template[]>([])
  // Monotonic request id: a slow earlier search must never overwrite the
  // results of a newer query.
  const searchRequestIdRef = useRef(0)

  // Always do a fresh search immediately when query changes
  // This guarantees we always get the latest templates
  const handleQueryChange = useCallback(
    async (newQuery: string | null) => {
      const requestId = ++searchRequestIdRef.current

      if (newQuery == null) {
        setSearchResults([])
        return
      }

      const results = await templateManager.searchTemplates(newQuery)
      if (requestId !== searchRequestIdRef.current) return
      setSearchResults(results)
    },
    [templateManager],
  )

  const options = useMemo(
    () =>
      searchResults.map(
        (result) => new TemplateTypeaheadOption(result.name, result),
      ),
    [searchResults],
  )

  const checkForSlashTriggerMatch = useBasicTypeaheadTriggerMatch(
    TEMPLATE_TRIGGER,
    { minLength: 0 },
  )

  const checkForTriggerMatch = useCallback(
    (text: string, currentEditor: LexicalEditor) => {
      // Explicitly yield to the mention trigger instead of relying on
      // registration order.
      if (isOtherTriggerActive(text, TEMPLATE_TRIGGER)) return null
      return checkForSlashTriggerMatch(text, currentEditor)
    },
    [checkForSlashTriggerMatch],
  )

  const onSelectOption = useCallback(
    (
      selectedOption: TemplateTypeaheadOption,
      nodeToRemove: TextNode | null,
      closeMenu: () => void,
    ) => {
      editor.update(() => {
        const content = selectedOption.template.content
        // 按 \n 拆分为多个段落，避免换行符嵌入单个 TextNode 导致编辑时滚动跳动
        const lines = content.split('\n')
        if (nodeToRemove && lines.length > 0) {
          // 第一行：直接替换 /xxx 文本内容，不改变 DOM 结构，彻底避免段落嵌套
          nodeToRemove.setTextContent(lines[0])
          // 其余行：作为独立段落插入到当前段落后方
          const parentParagraph = nodeToRemove.getParent()
          if (parentParagraph) {
            let prevNode:
              typeof parentParagraph | ReturnType<typeof $createParagraphNode> =
              parentParagraph
            for (let i = 1; i < lines.length; i++) {
              const paragraph = $createParagraphNode()
              paragraph.append($createTextNode(lines[i]))
              prevNode.insertAfter(paragraph)
              prevNode = paragraph
            }
            prevNode.getLastDescendant()?.selectEnd()
          }
        }
        closeMenu()
      })
    },
    [editor],
  )

  return (
    <LexicalTypeaheadMenuPlugin<TemplateTypeaheadOption>
      onQueryChange={handleQueryChange}
      onSelectOption={onSelectOption}
      triggerFn={checkForTriggerMatch}
      options={options}
      commandPriority={COMMAND_PRIORITY_NORMAL}
      menuRenderFn={(
        anchorElementRef,
        { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex },
      ) =>
        anchorElementRef.current && searchResults.length
          ? createPortal(
              <div className="zncz-popover">
                <ul>
                  {options.map((option, i: number) => (
                    <TemplateMenuItem
                      index={i}
                      isSelected={selectedIndex === i}
                      onClick={() => {
                        setHighlightedIndex(i)
                        selectOptionAndCleanUp(option)
                      }}
                      onMouseEnter={() => {
                        setHighlightedIndex(i)
                      }}
                      key={option.key}
                      option={option}
                    />
                  ))}
                </ul>
              </div>,
              anchorElementRef.current,
            )
          : null
      }
    />
  )
}
