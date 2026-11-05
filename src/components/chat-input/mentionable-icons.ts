import { Clipboard, FileIcon, FolderClosedIcon, ImageIcon } from 'lucide-react'

import { Mentionable } from '../../types/mentionable'

type MentionableIcon = typeof FileIcon

/**
 * Icon per mentionable type. Kept as a lookup table rather than a helper so the
 * render path reads as "pick an existing component", not "create one".
 */
export const MENTIONABLE_ICONS: Record<
  Mentionable['type'],
  MentionableIcon | null
> = {
  file: FileIcon,
  folder: FolderClosedIcon,
  'current-file': FileIcon,
  block: Clipboard,
  image: ImageIcon,
}
