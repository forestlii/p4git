import { app } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import type { AppSettings } from '../shared/types'

const defaults: AppSettings = { recentRepositories: [] }

export class SettingsStore {
  private readonly filePath = join(app.getPath('userData'), 'settings.json')

  async get(): Promise<AppSettings> {
    try {
      const raw = await readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<AppSettings>
      return {
        ...defaults,
        ...parsed,
        recentRepositories: Array.isArray(parsed.recentRepositories)
          ? parsed.recentRepositories.filter((item): item is string => typeof item === 'string')
          : []
      }
    } catch {
      return { ...defaults }
    }
  }

  async update(patch: Partial<AppSettings>): Promise<AppSettings> {
    const next = { ...(await this.get()), ...patch }
    await mkdir(dirname(this.filePath), { recursive: true })
    await writeFile(this.filePath, JSON.stringify(next, null, 2), 'utf8')
    return next
  }

  async rememberRepository(repoPath: string): Promise<void> {
    const settings = await this.get()
    const recentRepositories = [
      repoPath,
      ...settings.recentRepositories.filter((item) => item !== repoPath)
    ].slice(0, 8)
    await this.update({ recentRepositories, lastRepository: repoPath })
  }
}
