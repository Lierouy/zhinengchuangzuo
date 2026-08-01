import fuzzysort from 'fuzzysort'
import { App } from 'obsidian'
import { v4 as uuidv4 } from 'uuid'

import { AbstractJsonRepository } from '../base'
import { ROOT_DIR, TEMPLATE_DIR } from '../constants'
import {
  DuplicateTemplateException,
  EmptyTemplateNameException,
} from '../exception'

import { TEMPLATE_SCHEMA_VERSION, Template, TemplateMetadata } from './types'

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
      id: uuidv4(),
      ...template,
      sortOrder: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: TEMPLATE_SCHEMA_VERSION,
    }

    await this.create(newTemplate)
    return newTemplate
  }

  public async findById(id: string): Promise<Template | null> {
    const fileName = `v${TEMPLATE_SCHEMA_VERSION}_${id}.json`
    return this.read(fileName)
  }

  public async findByName(name: string): Promise<Template | null> {
    // Need to search through all templates since name is not in filename anymore
    const allTemplates = await this.listTemplates()
    const targetMetadata = allTemplates.find((meta) => meta.name === name)
    if (!targetMetadata) return null

    return this.findById(targetMetadata.id)
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
    return updatedTemplate
  }

  public async deleteTemplate(id: string): Promise<boolean> {
    const fileName = `v${TEMPLATE_SCHEMA_VERSION}_${id}.json`
    const exists = await this.app.vault.adapter.exists(
      `${this.dataDir}/${fileName}`,
    )
    if (!exists) return false

    await this.delete(fileName)
    return true
  }

  public async listTemplates(): Promise<TemplateMetadata[]> {
    // Now we need to read every JSON file to get the actual metadata
    // because we don't store name in filename anymore
    const files = await this.listMetadata()
    const metadataPromises = files.map(async (item) => {
      // item = id (string) & { fileName: string } from base class
      const fileName = (item as unknown as { fileName: string }).fileName
      const template = await this.read(fileName)
      if (!template) return null
      return {
        id: template.id,
        name: template.name,
        sortOrder: template.sortOrder,
        schemaVersion: template.schemaVersion,
      }
    })
    const metadataList = (await Promise.all(metadataPromises)).filter(
      (m): m is TemplateMetadata => m !== null,
    )
    metadataList.sort((a, b) => a.sortOrder - b.sortOrder)
    return metadataList
  }

  public async reorderTemplates(orderedIds: string[]): Promise<void> {
    for (let i = 0; i < orderedIds.length; i++) {
      const oldTemplate = await this.findById(orderedIds[i])
      if (oldTemplate) {
        const newTemplate = {
          ...oldTemplate,
          sortOrder: i,
          updatedAt: Date.now(),
        }
        await this.update(oldTemplate, newTemplate)
      }
    }
  }

  public async searchTemplates(query: string): Promise<Template[]> {
    const allMetadata = await this.listTemplates()
    const results = fuzzysort.go(query, allMetadata, {
      keys: ['name'],
      threshold: 0.2,
      limit: 20,
      all: true,
    })

    const templates = (
      await Promise.all(
        results.map(async (result) => {
          const fileName = `v${TEMPLATE_SCHEMA_VERSION}_${result.obj.id}.json`
          return this.read(fileName)
        }),
      )
    ).filter((template): template is Template => template !== null)

    return templates
  }
}
