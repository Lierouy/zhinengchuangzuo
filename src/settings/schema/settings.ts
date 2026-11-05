// 如果需要添加设置迁移，应在 settings.ts 添加 SETTING_MIGRATIONS 数组。
import {
  SETTINGS_SCHEMA_VERSION,
  SettingMigration,
  ZhinengchuangzuoSettings,
  zhinengchuangzuoSettingsSchema,
} from './setting.types'

export const SETTING_MIGRATIONS: SettingMigration[] = []

function migrateSettings(
  data: Record<string, unknown>,
): Record<string, unknown> {
  let currentData = { ...data }
  let currentVersion = (currentData.version as number) ?? 0

  for (const migration of SETTING_MIGRATIONS) {
    if (
      currentVersion >= migration.fromVersion &&
      currentVersion < migration.toVersion &&
      migration.toVersion <= SETTINGS_SCHEMA_VERSION
    ) {
      console.log(
        `Migrating settings from ${migration.fromVersion} to ${migration.toVersion}`,
      )
      currentData = migration.migrate(currentData)
      currentVersion = migration.toVersion
    }
  }

  return currentData
}

export function parseZhinengchuangzuoSettings(
  data: unknown,
): ZhinengchuangzuoSettings {
  // Read the raw version before schema parsing: the schema's `.catch()` would
  // otherwise silently rewrite an old version to the current one, making
  // migrations unreachable.
  const rawVersion =
    data && typeof data === 'object' && 'version' in data
      ? (data as { version?: unknown }).version
      : undefined

  try {
    const migratedData = migrateSettings(data as Record<string, unknown>)
    return zhinengchuangzuoSettingsSchema.parse(migratedData)
  } catch (error) {
    console.warn('Invalid settings provided, using defaults', error)
    if (rawVersion !== undefined && rawVersion !== SETTINGS_SCHEMA_VERSION) {
      console.warn(
        `Settings version could not be migrated to ${SETTINGS_SCHEMA_VERSION}, back to defaults`,
      )
    }
    return zhinengchuangzuoSettingsSchema.parse({})
  }
}
