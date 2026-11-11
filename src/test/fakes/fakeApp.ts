import type { App, DataAdapter, TFile, TFolder } from 'obsidian'
import { TFile as TFileMock, TFolder as TFolderMock } from 'obsidian'

/**
 * In-memory stand-in for Obsidian's vault adapter.
 *
 * Every repository in `src/database` reaches the filesystem through
 * `app.vault.adapter`, so this is enough to exercise the real managers without
 * an Obsidian instance. `list()` throws for a missing folder on purpose: the
 * repositories rely on `ensureDirectory()` re-creating a deleted tree.
 */
export type FakeVault = {
  files: Map<string, string>
  dirs: Set<string>
  /** Paths passed to `write`, in order, so tests can assert on writes. */
  writes: string[]
  seed: (path: string, data: string) => void
}

export type FakeApp = {
  app: App
  vault: FakeVault
  secrets: Map<string, string>
}

export function makeTFile(path: string): TFile {
  const file = new TFileMock()
  file.path = path
  file.name = path.slice(path.lastIndexOf('/') + 1)
  const dot = file.name.lastIndexOf('.')
  file.basename = dot === -1 ? file.name : file.name.slice(0, dot)
  file.extension = dot === -1 ? '' : file.name.slice(dot + 1)
  return file
}

export function makeTFolder(path: string): TFolder {
  const folder = new TFolderMock()
  folder.path = path
  folder.name = path.slice(path.lastIndexOf('/') + 1)
  return folder
}

function ensureParentDirs(dirs: Set<string>, path: string): void {
  const segments = path.split('/')
  segments.pop()
  let current = ''
  for (const segment of segments) {
    if (!segment) continue
    current = current ? `${current}/${segment}` : segment
    dirs.add(current)
  }
}

export function createFakeApp(
  initialFiles: Record<string, string> = {},
): FakeApp {
  const files = new Map<string, string>(Object.entries(initialFiles))
  const dirs = new Set<string>()
  const writes: string[] = []
  const secrets = new Map<string, string>()

  const seed = (path: string, data: string): void => {
    ensureParentDirs(dirs, path)
    files.set(path, data)
  }
  for (const [path, data] of files) seed(path, data)

  const adapter = {
    async exists(path: string): Promise<boolean> {
      return files.has(path) || dirs.has(path)
    },
    async read(path: string): Promise<string> {
      const data = files.get(path)
      if (data === undefined) throw new Error(`ENOENT: ${path}`)
      return data
    },
    async write(path: string, data: string): Promise<void> {
      writes.push(path)
      files.set(path, data)
    },
    async remove(path: string): Promise<void> {
      files.delete(path)
    },
    async mkdir(path: string): Promise<void> {
      dirs.add(path)
    },
    async list(path: string): Promise<{ files: string[]; folders: string[] }> {
      if (!dirs.has(path)) throw new Error(`ENOENT: ${path}`)
      const prefix = `${path}/`
      const childFiles: string[] = []
      const childFolders = new Set<string>()

      for (const filePath of files.keys()) {
        if (!filePath.startsWith(prefix)) continue
        const rest = filePath.slice(prefix.length)
        const slash = rest.indexOf('/')
        if (slash === -1) childFiles.push(filePath)
        else childFolders.add(`${path}/${rest.slice(0, slash)}`)
      }
      for (const dir of dirs) {
        if (!dir.startsWith(prefix)) continue
        if (!dir.slice(prefix.length).includes('/')) childFolders.add(dir)
      }

      return { files: childFiles, folders: [...childFolders] }
    },
  } as unknown as DataAdapter

  const vault = {
    adapter,
    getFiles: () => [...files.keys()].map(makeTFile),
    getMarkdownFiles: () =>
      [...files.keys()].filter((path) => path.endsWith('.md')).map(makeTFile),
    getFileByPath: (path: string) => (files.has(path) ? makeTFile(path) : null),
    getFolderByPath: (path: string) =>
      dirs.has(path) ? makeTFolder(path) : null,
    on: () => ({}),
    offref: () => {},
    cachedRead: async (file: TFile) => files.get(file.path) ?? '',
    read: async (file: TFile) => {
      const data = files.get(file.path)
      if (data === undefined) throw new Error(`ENOENT: ${file.path}`)
      return data
    },
  }

  const app = {
    vault,
    workspace: {
      getActiveFile: () => null,
      getLeavesOfType: () => [],
      getRightLeaf: () => null,
      revealLeaf: async () => {},
      on: () => ({}),
      offref: () => {},
    },
    metadataCache: {
      getFileCache: () => null,
      getFirstLinkpathDest: () => null,
      on: () => ({}),
    },
    secretStorage: {
      getSecret: (id: string) => secrets.get(id) ?? null,
      setSecret: (id: string, value: string) => {
        secrets.set(id, value)
      },
    },
    fileManager: {
      processFrontMatter: async () => {},
    },
  } as unknown as App

  return {
    app,
    vault: { files, dirs, writes, seed },
    secrets,
  }
}
