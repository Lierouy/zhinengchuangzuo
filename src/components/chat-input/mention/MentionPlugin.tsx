/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 * Modified from the original code
 */
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { clsx } from 'clsx'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_NORMAL,
  ParagraphNode,
  TextNode,
} from 'lexical'
import { JSX, useCallback, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

import { Mentionable } from '../../../types/mentionable'
import {
  getMentionableName,
  getPathBasename,
  serializeMentionable,
} from '../../../utils/chat/mentionable'
import { SearchableMentionable } from '../../../utils/fuzzy-search'
import { MENTIONABLE_ICONS } from '../../chat-input/mentionable-icons'
import { MenuOption, MenuTextMatch, PUNCTUATION } from '../LexicalMenu'
import { LexicalTypeaheadMenuPlugin } from '../LexicalTypeaheadMenuPlugin'
import { MENTION_TRIGGER, isOtherTriggerActive } from '../typeahead-triggers'

import { $createMentionNode } from './MentionNode'

const TRIGGERS = MENTION_TRIGGER

// Chars we expect to see in a mention (non-space, non-punctuation).
const VALID_CHARS = '[^' + TRIGGERS + PUNCTUATION + '\\s]'

// Non-standard series of chars. Each series must be preceded and followed by
// a valid char.
const VALID_JOINS =
  '(?:' +
  '\\.[ |$]|' + // E.g. "r. " in "Mr. Smith"
  ' |' + // E.g. " " in "Josh Duck"
  '[' +
  PUNCTUATION +
  ']|' + // E.g. "-' in "Salier-Hellendag"
  ')'

const LENGTH_LIMIT = 65

const AtSignMentionsRegex = new RegExp(
  `(^|\\s|\\()([${TRIGGERS}]((?:${VALID_CHARS}${VALID_JOINS}){0,${LENGTH_LIMIT}}))$`,
)

// 50 is the longest alias length limit.
const ALIAS_LENGTH_LIMIT = 45

// Regex used to match alias.
const AtSignMentionsRegexAliasRegex = new RegExp(
  `(^|\\s|\\()([${TRIGGERS}]((?:${VALID_CHARS}){0,${ALIAS_LENGTH_LIMIT}}))$`,
)

// At most, 15 suggestions are shown in the popup.
const SUGGESTION_LIST_LENGTH_LIMIT = 15

function checkForAtSignMentions(
  text: string,
  minMatchLength: number,
): MenuTextMatch | null {
  let match = AtSignMentionsRegex.exec(text)

  if (match === null) {
    match = AtSignMentionsRegexAliasRegex.exec(text)
  }
  if (match !== null) {
    // The strategy ignores leading whitespace but we need to know it's
    // length to add it to the leadOffset
    const maybeLeadingWhitespace = match[1]

    const matchingString = match[3]
    if (matchingString.length >= minMatchLength) {
      return {
        leadOffset: match.index + maybeLeadingWhitespace.length,
        matchingString,
        replaceableString: match[2],
      }
    }
  }
  return null
}

function getPossibleQueryMatch(text: string): MenuTextMatch | null {
  return checkForAtSignMentions(text, 0)
}

class MentionTypeaheadOption extends MenuOption {
  name: string
  mentionable: Mentionable

  constructor(result: SearchableMentionable) {
    // `SearchableMentionable` is a closed union; the exhaustive switch keeps
    // `name`/`mentionable` definitely assigned when a new variant is added.
    switch (result.type) {
      case 'file':
        super(result.path)
        this.name = getPathBasename(result.path)
        this.mentionable = result
        break
      case 'folder':
        super(result.path)
        this.name = getPathBasename(result.path)
        this.mentionable = result
        break
      default: {
        const exhaustiveCheck: never = result
        throw new Error(
          `Unsupported mentionable type: ${JSON.stringify(exhaustiveCheck)}`,
        )
      }
    }
  }
}

function MentionsTypeaheadMenuItem({
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
  option: MentionTypeaheadOption
}) {
  const className = clsx('item', isSelected && 'selected')

  const Icon = MENTIONABLE_ICONS[option.mentionable.type]
  return (
    <li
      key={option.key}
      tabIndex={-1}
      className={className}
      ref={(el) => option.setRefElement(el)}
      role="option"
      aria-selected={isSelected}
      id={`typeahead-item-${index}`}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
    >
      {Icon && <Icon size={14} className="zncz-popover-item-icon" />}
      <span className="text">{option.name}</span>
      {option.mentionable.type === 'folder' && (
        <span className="text zncz-mention-popover-folder-path">
          {option.mentionable.path}
        </span>
      )}
    </li>
  )
}

export default function NewMentionsPlugin({
  searchResultByQuery,
  mentionLimitReached,
}: {
  searchResultByQuery: (query: string) => SearchableMentionable[]
  mentionLimitReached: boolean
}): JSX.Element | null {
  const [editor] = useLexicalComposerContext()

  const [queryString, setQueryString] = useState<string | null>(null)

  const results = useMemo(() => {
    if (queryString == null) return []
    return searchResultByQuery(queryString)
  }, [queryString, searchResultByQuery])

  const options = useMemo(
    () =>
      results
        .map((result) => new MentionTypeaheadOption(result))
        .slice(0, SUGGESTION_LIST_LENGTH_LIMIT),
    [results],
  )

  const onSelectOption = useCallback(
    (
      selectedOption: MentionTypeaheadOption,
      nodeToReplace: TextNode | null,
      closeMenu: () => void,
    ) => {
      editor.update(() => {
        const mentionNode = $createMentionNode(
          getMentionableName(selectedOption.mentionable),
          serializeMentionable(selectedOption.mentionable),
        )

        if (nodeToReplace) {
          nodeToReplace.replace(mentionNode)
        } else {
          // No query text node to replace (e.g. the trigger was consumed or the
          // selection moved). Insert at the current selection so the mention is
          // never silently dropped.
          const selection = $getSelection()
          if ($isRangeSelection(selection)) {
            selection.insertNodes([mentionNode])
          } else {
            // Root only accepts element nodes, so append to the last paragraph
            // (creating one when the document is empty).
            const root = $getRoot()
            const lastChild = root.getLastChild()
            if (lastChild instanceof ParagraphNode) {
              lastChild.append(mentionNode)
            } else {
              const paragraph = $createParagraphNode()
              paragraph.append(mentionNode)
              root.append(paragraph)
            }
          }
        }

        const spaceNode = $createTextNode(' ')
        mentionNode.insertAfter(spaceNode)

        spaceNode.select()
        closeMenu()
      })
    },
    [editor],
  )

  const checkForMentionMatch = useCallback(
    (text: string) => {
      if (mentionLimitReached) {
        // 文件/文件夹引用数量已达上限，不再弹出 @ 菜单
        return null
      }
      // Explicitly yield to the template trigger instead of relying on
      // registration order.
      if (isOtherTriggerActive(text, MENTION_TRIGGER)) {
        return null
      }
      return getPossibleQueryMatch(text)
    },
    [mentionLimitReached],
  )

  return (
    <LexicalTypeaheadMenuPlugin<MentionTypeaheadOption>
      onQueryChange={setQueryString}
      onSelectOption={onSelectOption}
      triggerFn={checkForMentionMatch}
      options={options}
      commandPriority={COMMAND_PRIORITY_NORMAL}
      menuRenderFn={(
        anchorElementRef,
        { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex },
      ) =>
        anchorElementRef.current && results.length
          ? createPortal(
              <div className="zncz-popover zncz-mention-popover">
                <ul>
                  {options.map((option, i: number) => (
                    <MentionsTypeaheadMenuItem
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
