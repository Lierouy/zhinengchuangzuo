import { beforeEach, describe, expect, it } from 'vitest'

import { createFakeApp } from '../../test/fakes/fakeApp'
import { ROOT_DIR, TEMPLATE_DIR } from '../constants'
import { DatabaseException } from '../exception'

import { TemplateManager } from './TemplateManager'
import { TEMPLATE_SCHEMA_VERSION } from './types'

const DATA_DIR = `${ROOT_DIR}/${TEMPLATE_DIR}`
const templatePath = (id: string): string =>
  `${DATA_DIR}/v${TEMPLATE_SCHEMA_VERSION}_${id}.json`
const indexPath = (): string => `${DATA_DIR}/_index.json`

const legacyTemplate = (id: string, name: string, sortOrder: number): string =>
  JSON.stringify({ id, name, content: `content ${name}`, sortOrder })

describe('TemplateManager', () => {
  let fake: ReturnType<typeof createFakeApp>
  let manager: TemplateManager

  beforeEach(() => {
    fake = createFakeApp()
    manager = new TemplateManager(fake.app)
  })

  it('creates a template and persists the display order', async () => {
    const template = await manager.createTemplate({
      name: 'Email',
      content: 'hi',
    })

    expect(fake.vault.files.has(templatePath(template.id))).toBe(true)
    expect(fake.vault.files.get(indexPath())).toContain(template.id)
    await expect(manager.listTemplates()).resolves.toEqual([
      { id: template.id, name: 'Email' },
    ])
  })

  it('rejects empty and duplicated names', async () => {
    await expect(
      manager.createTemplate({ name: '   ', content: '' }),
    ).rejects.toBeInstanceOf(DatabaseException)

    await manager.createTemplate({ name: 'Email', content: '' })
    await expect(
      manager.createTemplate({ name: 'Email', content: '' }),
    ).rejects.toBeInstanceOf(DatabaseException)
  })

  it('adopts the legacy sortOrder on first load and writes the order file', async () => {
    const firstId = 'aaaaaaaa-0000-0000-0000-000000000001'
    const secondId = 'bbbbbbbb-0000-0000-0000-000000000002'
    fake.vault.seed(
      templatePath(firstId),
      legacyTemplate(firstId, 'Second', 20),
    )
    fake.vault.seed(
      templatePath(secondId),
      legacyTemplate(secondId, 'First', 10),
    )

    const templates = await manager.listTemplates()

    expect(templates.map((template) => template.name)).toEqual([
      'First',
      'Second',
    ])
    expect(fake.vault.files.get(indexPath())).toContain(secondId)
  })

  it('reorders templates and appends the ids the caller forgot', async () => {
    const a = await manager.createTemplate({ name: 'A', content: '' })
    const b = await manager.createTemplate({ name: 'B', content: '' })
    const c = await manager.createTemplate({ name: 'C', content: '' })

    await manager.reorderTemplates([c.id, a.id])

    await expect(manager.listTemplates()).resolves.toEqual([
      { id: c.id, name: 'C' },
      { id: a.id, name: 'A' },
      { id: b.id, name: 'B' },
    ])
  })

  it('updates a template and validates the new name', async () => {
    const template = await manager.createTemplate({ name: 'A', content: 'old' })
    await manager.createTemplate({ name: 'B', content: '' })

    const updated = await manager.updateTemplate(template.id, {
      content: 'new',
    })
    expect(updated?.content).toBe('new')

    await expect(
      manager.updateTemplate(template.id, { name: 'B' }),
    ).rejects.toBeInstanceOf(DatabaseException)
    await expect(
      manager.updateTemplate(template.id, { name: '  ' }),
    ).rejects.toBeInstanceOf(DatabaseException)
    await expect(
      manager.updateTemplate('missing', { content: 'x' }),
    ).resolves.toBeNull()
  })

  it('deletes a template from disk and from the ordered index', async () => {
    const template = await manager.createTemplate({ name: 'A', content: '' })

    await expect(manager.deleteTemplate(template.id)).resolves.toBe(true)
    expect(fake.vault.files.has(templatePath(template.id))).toBe(false)
    await expect(manager.listTemplates()).resolves.toEqual([])
    await expect(manager.deleteTemplate(template.id)).resolves.toBe(false)
  })

  it('drops a cached template that was deleted outside the manager', async () => {
    const template = await manager.createTemplate({ name: 'A', content: '' })
    await expect(manager.findById(template.id)).resolves.not.toBeNull()

    fake.vault.files.delete(templatePath(template.id))

    await expect(manager.findById(template.id)).resolves.toBeNull()
  })

  it('finds templates by fuzzy name', async () => {
    await manager.createTemplate({ name: 'Alpha', content: '' })
    await manager.createTemplate({ name: 'Beta', content: '' })

    const results = await manager.searchTemplates('alp')

    expect(results.map((template) => template.name)).toEqual(['Alpha'])
  })
})
