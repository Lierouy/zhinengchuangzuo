import { Clipboard, File, FolderClosed, Image } from 'lucide-react'

import { Mentionable } from '../../types/mentionable'

type MentionableIcon = typeof File

/**
 * Icon per mentionable type. Kept as a lookup table rather than a helper so the
 * render path reads as "pick an existing component", not "create one".
 */
export const MENTIONABLE_ICONS: Record<
  Mentionable['type'],
  MentionableIcon | null
> = {
  file: File,
  folder: FolderClosed,
  'current-file': File,
  block: Clipboard,
  image: Image,
}
