import { Clipboard, FileIcon, FolderClosedIcon, ImageIcon } from 'lucide-react'

import { Mentionable } from '../../types/mentionable'

export const getMentionableIcon = (mentionable: Mentionable) => {
  switch (mentionable.type) {
    case 'file':
      return FileIcon
    case 'folder':
      return FolderClosedIcon
    case 'current-file':
      return FileIcon
    case 'block':
      return Clipboard
    case 'image':
      return ImageIcon
    default:
      return null
  }
}
