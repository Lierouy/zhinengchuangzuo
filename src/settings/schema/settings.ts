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
  try {
    const migratedData = migrateSettings(data as Record<string, unknown>)
    return zhinengchuangzuoSettingsSchema.parse(migratedData)
  } catch (error) {
    console.warn('Invalid settings provided, using defaults:', error)
    return zhinengchuangzuoSettingsSchema.parse({})
  }
}
