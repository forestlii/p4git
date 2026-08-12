import { app } from 'electron'
import { access, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { DEFAULT_APPEARANCE } from '../shared/types'
import type { AppSettings, AppearanceSettings } from '../shared/types'

const defaults: AppSettings = { recentRepositories: [] }
const beyondCompareCandidates = [
  'C:\\Program Files\\Beyond Compare 5\\BCompare.exe',
  'C:\\Program Files\\Beyond Compare 4\\BCompare.exe'
]

async function discoveredDiffTool(enabled: boolean): Promise<string | undefined> {
  if (!enabled || process.platform !== 'win32') return undefined
  for (const candidate of beyondCompareCandidates) {
    if (await access(candidate).then(() => true).catch(() => false)) return candidate
  }
  return undefined
}

function appearance(value: Partial<AppearanceSettings> | undefined): AppearanceSettings {
  const scale = Number(value?.fontScale)
  const workspacePaneWidth = Number(value?.workspacePaneWidth)
  const detailPaneHeight = Number(value?.detailPaneHeight)
  const logPaneHeight = Number(value?.logPaneHeight)
  return {
    ...DEFAULT_APPEARANCE,
    ...value,
    theme: value?.theme === 'light' || value?.theme === 'dark' ? value.theme : 'classic',
    density: value?.density === 'comfortable' ? 'comfortable' : 'compact',
    fontScale: Number.isFinite(scale) ? Math.min(1.35, Math.max(.85, scale)) : 1,
    showToolbarLabels: value?.showToolbarLabels !== false,
    workspacePaneWidth: Number.isFinite(workspacePaneWidth) ? Math.min(650, Math.max(180, workspacePaneWidth)) : 292,
    detailPaneHeight: Number.isFinite(detailPaneHeight) ? Math.min(600, Math.max(100, detailPaneHeight)) : 260,
    logPaneHeight: Number.isFinite(logPaneHeight) ? Math.min(500, Math.max(80, logPaneHeight)) : 140,
    tableColumnWidths: value?.tableColumnWidths && typeof value.tableColumnWidths === 'object' ? value.tableColumnWidths : {}
  }
}

export class SettingsStore {
  private readonly filePath = join(app.getPath('userData'), 'settings.json')

  async get(): Promise<AppSettings> {
    try {
      const raw = await readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<AppSettings>
      const diffToolAutoDiscover = parsed.diffToolAutoDiscover !== false
      const diffToolPath = typeof parsed.diffToolPath === 'string' ? parsed.diffToolPath : await discoveredDiffTool(diffToolAutoDiscover)
      return {
        ...defaults,
        ...parsed,
        gitPath: typeof parsed.gitPath === 'string' ? parsed.gitPath : undefined,
        diffToolPath,
        diffToolArguments: typeof parsed.diffToolArguments === 'string' ? parsed.diffToolArguments : undefined,
        diffToolAutoDiscover,
        mergeToolPath: typeof parsed.mergeToolPath === 'string' ? parsed.mergeToolPath : undefined,
        mergeToolArguments: typeof parsed.mergeToolArguments === 'string' ? parsed.mergeToolArguments : undefined,
        appearance: appearance(parsed.appearance),
        lastRepository: typeof parsed.lastRepository === 'string' ? parsed.lastRepository : undefined,
        bookmarks: Array.isArray(parsed.bookmarks)
          ? parsed.bookmarks.filter((item): item is string => typeof item === 'string').slice(0, 50)
          : [],
        locationHistory: Array.isArray(parsed.locationHistory)
          ? parsed.locationHistory.filter((item): item is string => typeof item === 'string').slice(0, 20)
          : [],
        recentRepositories: Array.isArray(parsed.recentRepositories)
          ? parsed.recentRepositories.filter((item): item is string => typeof item === 'string')
          : []
      }
    } catch {
      return { ...defaults, diffToolPath: await discoveredDiffTool(true), diffToolAutoDiscover: true }
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
