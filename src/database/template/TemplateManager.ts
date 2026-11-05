import { go as fuzzysortGo } from 'fuzzysort'
import { App, normalizePath } from 'obsidian'

import { AbstractJsonRepository } from '../base'
import { ROOT_DIR, TEMPLATE_DIR } from '../constants'
import {
  DuplicateTemplateException,
  EmptyTemplateNameException,
} from '../exception'

import {
  TEMPLATE_INDEX_SCHEMA_VERSION,
  TEMPLATE_SCHEMA_VERSION,
  Template,
  TemplateMetadata,
} from './types'

const TEMPLATE_INDEX_FILE = '_index.json'

type TemplateIndexFile = {
  schemaVersion: number
  /** Template ids in display order. */
  ids: string[]
}

/**
 * Templates are tiny text records and the `/` menu searches them on every
 * keystroke, so the whole set is kept in memory for the session. Every write
 * goes through this module, which refreshes the shared cache, keeping all
 * `TemplateManager` instances (settings, chat view, typeahead menu) in sync.
 */
let templateCache: Template[] | null = null

export class TemplateManager extends AbstractJsonRepository<Template, string> {
  constructor(app: App) {
    super(app, `${ROOT_DIR}/${TEMPLATE_DIR}`)
  }

  protected generateFileName(template: Template): string {
    // only schema version and ID in filename
    // All metadata (name) is stored inside the JSON file
    return `v${TEMPLATE_SCHEMA_VERSION}_${template.id}.json`
  }

  protected parseFileName(fileName: string): string | null {
    // Parse: v{schemaVersion}_{id}.json
    // Extremely simple and reliable - just get the id
    const regex = new RegExp(
      `^v${TEMPLATE_SCHEMA_VERSION}_([0-9a-f-]+)\\.json$`,
    )
    const match = fileName.match(regex)
    if (!match) return null

    return match[1] // just return the id
  }

  /** Display order lives in a single sidecar file so reordering is one write. */
  private indexFilePath(): string {
    return normalizePath(`${this.dataDir}/${TEMPLATE_INDEX_FILE}`)
  }

  private async readIndexOrder(): Promise<string[]> {
    try {
      const raw = await this.app.vault.adapter.read(this.indexFilePath())
      const parsed = JSON.parse(raw) as Partial<TemplateIndexFile>
      if (
        parsed.schemaVersion === TEMPLATE_INDEX_SCHEMA_VERSION &&
        Array.isArray(parsed.ids)
      ) {
        return parsed.ids
      }
    } catch {
      // Missing or unreadable order file - fall back to the stored sortOrder.
    }
    return []
  }

  private async writeIndexOrder(ids: string[]): Promise<void> {
    await this.ensureDirectory()
    const card: TemplateIndexFile = {
      schemaVersion: TEMPLATE_INDEX_SCHEMA_VERSION,
      ids,
    }
    await this.app.vault.adapter.write(
      this.indexFilePath(),
      JSON.stringify(card, null, 2),
    )
  }

  private async loadCache(): Promise<Template[]> {
    if (templateCache) return templateCache

    const files = await this.listMetadata()
    const loaded = await Promise.all(
      files.map((item) =>
        this.read((item as unknown as { fileName: string }).fileName),
      ),
    )
    const templates = loaded.filter(
      (template): template is Template => template !== null,
    )

    const order = await this.readIndexOrder()
    if (order.length === 0 && templates.length > 0) {
      // First run with the sidecar missing: adopt the legacy sortOrder and
      // persist it so later loads stay consistent.
      templates.sort((a, b) => a.sortOrder - b.sortOrder)
      await this.writeIndexOrder(templates.map((template) => template.id))
    } else {
      const rank = new Map(order.map((id, index) => [id, index]))
      templates.sort(
        (a, b) =>
          (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
            (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER) ||
          a.sortOrder - b.sortOrder ||
          a.name.localeCompare(b.name),
      )
    }

    templateCache = templates
    return templates
  }

  private async replaceCache(templates: Template[]): Promise<void> {
    templateCache = templates
    await this.writeIndexOrder(templates.map((template) => template.id))
  }

  public async createTemplate(
    template: Omit<
      Template,
      'id' | 'sortOrder' | 'createdAt' | 'updatedAt' | 'schemaVersion'
    >,
  ): Promise<Template> {
    if (template.name !== undefined && template.name.length === 0) {
      throw new EmptyTemplateNameException()
    }

    const existingTemplate = await this.findByName(template.name)
    if (existingTemplate) {
      throw new DuplicateTemplateException(template.name)
    }

    const newTemplate: Template = {
      id: crypto.randomUUID(),
      ...template,
      sortOrder: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: TEMPLATE_SCHEMA_VERSION,
    }

    await this.create(newTemplate)
    await this.replaceCache([...(await this.loadCache()), newTemplate])
    return newTemplate
  }

  public async findById(id: string): Promise<Template | null> {
    const templates = await this.loadCache()
    return templates.find((template) => template.id === id) ?? null
  }

  public async findByName(name: string): Promise<Template | null> {
    const templates = await this.loadCache()
    return templates.find((template) => template.name === name) ?? null
  }

  public async updateTemplate(
    id: string,
    updates: Partial<
      Omit<Template, 'id' | 'createdAt' | 'updatedAt' | 'schemaVersion'>
    >,
  ): Promise<Template | null> {
    if (updates.name !== undefined && updates.name.length === 0) {
      throw new EmptyTemplateNameException()
    }

    const template = await this.findById(id)
    if (!template) return null

    if (updates.name && updates.name !== template.name) {
      const existingTemplate = await this.findByName(updates.name)
      if (existingTemplate) {
        throw new DuplicateTemplateException(updates.name)
      }
    }

    const updatedTemplate: Template = {
      ...template,
      ...updates,
      updatedAt: Date.now(),
    }

    await this.update(template, updatedTemplate)
    templateCache = (await this.loadCache()).map((item) =>
      item.id === id ? updatedTemplate : item,
    )
    return updatedTemplate
  }

  public async deleteTemplate(id: string): Promise<boolean> {
    const fileName = `v${TEMPLATE_SCHEMA_VERSION}_${id}.json`
    const exists = await this.app.vault.adapter.exists(
      `${this.dataDir}/${fileName}`,
    )
    if (!exists) return false

    await this.delete(fileName)
    await this.replaceCache(
      (await this.loadCache()).filter((template) => template.id !== id),
    )
    return true
  }

  public async listTemplates(): Promise<TemplateMetadata[]> {
    const templates = await this.loadCache()
    return templates.map((template, index) => ({
      id: template.id,
      name: template.name,
      sortOrder: index,
      schemaVersion: template.schemaVersion,
    }))
  }

  public async reorderTemplates(orderedIds: string[]): Promise<void> {
    const templates = await this.loadCache()
    const byId = new Map(templates.map((template) => [template.id, template]))
    const ordered = orderedIds
      .map((id) => byId.get(id))
      .filter((template): template is Template => template !== undefined)

    // Anything the caller did not mention keeps its relative position at the end.
    const seen = new Set(orderedIds)
    for (const template of templates) {
      if (!seen.has(template.id)) ordered.push(template)
    }

    await this.replaceCache(ordered)
  }

  public async searchTemplates(query: string): Promise<Template[]> {
    const templates = await this.loadCache()
    const results = fuzzysortGo(query, templates, {
      keys: ['name'],
      threshold: 0.2,
      limit: 20,
    })
    return results.map((result) => result.obj)
  }
}
