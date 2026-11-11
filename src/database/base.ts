import { App, normalizePath } from 'obsidian'

import { ensureFolderExists } from '../utils/obsidian'

const getBaseName = (filePath: string): string => {
  const normalized = normalizePath(filePath)
  return normalized.slice(normalized.lastIndexOf('/') + 1)
}

export abstract class AbstractJsonRepository<T, M> {
  protected dataDir: string
  protected app: App
  private ensureDirPromise: Promise<void> | null = null

  constructor(app: App, dataDir: string) {
    this.app = app
    this.dataDir = normalizePath(dataDir)
  }

  /**
   * Lazily creates the data directory. Every filesystem operation awaits this
   * so a `create()` can never race the initial `mkdir`. The folder is also
   * re-created when it disappears while the plugin is running: a data reset
   * deletes the whole `user_data` tree, and listing a missing folder throws.
   */
  protected async ensureDirectory(): Promise<void> {
    if (this.ensureDirPromise) {
      await this.ensureDirPromise
      if (await this.app.vault.adapter.exists(this.dataDir)) return
      this.ensureDirPromise = null
    }
    this.ensureDirPromise = this.createDirectory()
    await this.ensureDirPromise
  }

  private async createDirectory(): Promise<void> {
    await ensureFolderExists(this.app, this.dataDir.split('/'))
  }

  // Each subclass implements how to generate a file name from a data row.
  protected abstract generateFileName(row: T): string

  // Each subclass implements how to parse a file name into metadata.
  protected abstract parseFileName(fileName: string): M | null

  public async create(row: T): Promise<void> {
    await this.ensureDirectory()
    const fileName = this.generateFileName(row)
    const filePath = normalizePath(`${this.dataDir}/${fileName}`)
    const content = JSON.stringify(row, null, 2)

    if (await this.app.vault.adapter.exists(filePath)) {
      throw new Error(`The file ${filePath} already exists`)
    }

    await this.app.vault.adapter.write(filePath, content)
  }

  public async update(oldRow: T, newRow: T): Promise<void> {
    await this.ensureDirectory()
    const oldFileName = this.generateFileName(oldRow)
    const newFileName = this.generateFileName(newRow)
    const content = JSON.stringify(newRow, null, 2)

    if (oldFileName === newFileName) {
      // Simple update - filename hasn't changed
      const filePath = normalizePath(`${this.dataDir}/${oldFileName}`)
      await this.app.vault.adapter.write(filePath, content)
    } else {
      // Filename has changed - create new file and delete old one
      const newFilePath = normalizePath(`${this.dataDir}/${newFileName}`)
      await this.app.vault.adapter.write(newFilePath, content)
      await this.delete(oldFileName)
    }
  }

  // List metadata for all records by parsing file names.
  public async listMetadata(): Promise<{ metadata: M; fileName: string }[]> {
    await this.ensureDirectory()
    const files = await this.app.vault.adapter.list(this.dataDir)
    return files.files
      .map((filePath) => getBaseName(filePath))
      .filter((fileName) => fileName.endsWith('.json'))
      .map((fileName): { metadata: M; fileName: string } | null => {
        const metadata = this.parseFileName(fileName)
        if (metadata === null) return null
        return { metadata: metadata as M, fileName }
      })
      .filter((entry): entry is { metadata: M; fileName: string } => !!entry)
  }

  public async read(fileName: string): Promise<T | null> {
    await this.ensureDirectory()
    const filePath = normalizePath(`${this.dataDir}/${fileName}`)
    if (!(await this.app.vault.adapter.exists(filePath))) return null

    const content = await this.app.vault.adapter.read(filePath)
    return JSON.parse(content) as T
  }

  public async delete(fileName: string): Promise<void> {
    await this.ensureDirectory()
    const filePath = normalizePath(`${this.dataDir}/${fileName}`)
    if (await this.app.vault.adapter.exists(filePath)) {
      await this.app.vault.adapter.remove(filePath)
    }
  }
}
