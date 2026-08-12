import { app, safeStorage } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { GitLabConfig, GitLabIssue, GitLabMergeRequest, GitLabOverview, GitLabPipeline } from '../shared/types'
import { inferGitLabRemote } from './gitlab-remote'

interface StoredGitLabConfig {
  baseUrl: string
  projectPath: string
  encryptedToken?: string
}

type StoredConfigs = Record<string, StoredGitLabConfig>

export class GitLabService {
  private readonly filePath = join(app.getPath('userData'), 'gitlab.json')

  async config(repoPath: string, remoteUrl?: string): Promise<GitLabConfig> {
    const configs = await this.read()
    const stored = configs[repoPath.toLowerCase()]
    const inferred = inferGitLabRemote(remoteUrl)
    return {
      baseUrl: stored?.baseUrl || inferred.baseUrl,
      projectPath: stored?.projectPath || inferred.projectPath,
      tokenConfigured: Boolean(stored?.encryptedToken)
    }
  }

  async save(repoPath: string, baseUrl: string, projectPath: string, token?: string, clearToken = false): Promise<GitLabConfig> {
    const configs = await this.read()
    const key = repoPath.toLowerCase()
    const previous = configs[key]
    let encryptedToken = clearToken ? undefined : previous?.encryptedToken
    if (token?.trim()) {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('系统加密存储不可用，无法安全保存 GitLab Token。')
      encryptedToken = safeStorage.encryptString(token.trim()).toString('base64')
    }
    configs[key] = {
      baseUrl: baseUrl.trim().replace(/\/$/, ''),
      projectPath: projectPath.trim().replace(/^\//, '').replace(/\.git$/, ''),
      encryptedToken
    }
    await this.write(configs)
    return this.config(repoPath)
  }

  async overview(repoPath: string, remoteUrl?: string): Promise<GitLabOverview> {
    const config = await this.config(repoPath, remoteUrl)
    this.validate(config)
    const project = encodeURIComponent(config.projectPath)
    const [issues, mergeRequests, pipelines] = await Promise.all([
      this.request<unknown[]>(repoPath, config, `/projects/${project}/issues?state=opened&order_by=updated_at&sort=desc&per_page=50`),
      this.request<unknown[]>(repoPath, config, `/projects/${project}/merge_requests?state=opened&order_by=updated_at&sort=desc&per_page=50`),
      this.request<unknown[]>(repoPath, config, `/projects/${project}/pipelines?order_by=id&sort=desc&per_page=30`)
    ])
    return {
      config,
      issues: issues.map((value) => this.issue(value)),
      mergeRequests: mergeRequests.map((value) => this.mergeRequest(value)),
      pipelines: pipelines.map((value) => this.pipeline(value))
    }
  }

  async createMergeRequest(repoPath: string, remoteUrl: string | undefined, title: string, sourceBranch: string, targetBranch: string, description = ''): Promise<GitLabMergeRequest> {
    const config = await this.config(repoPath, remoteUrl)
    this.validate(config)
    const project = encodeURIComponent(config.projectPath)
    const result = await this.request<unknown>(repoPath, config, `/projects/${project}/merge_requests`, {
      method: 'POST',
      body: JSON.stringify({ title, source_branch: sourceBranch, target_branch: targetBranch, description })
    })
    return this.mergeRequest(result)
  }

  private async request<T>(repoPath: string, config: GitLabConfig, path: string, init: RequestInit = {}): Promise<T> {
    const configs = await this.read()
    const stored = configs[repoPath.toLowerCase()]
    const token = stored?.encryptedToken && safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(Buffer.from(stored.encryptedToken, 'base64'))
      : undefined
    const response = await fetch(`${config.baseUrl}/api/v4${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { 'PRIVATE-TOKEN': token } : {}),
        ...init.headers
      },
      signal: AbortSignal.timeout(30_000)
    })
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 1_000)
      throw new Error(`GitLab API ${response.status}: ${detail || response.statusText}`)
    }
    return response.json() as Promise<T>
  }

  private validate(config: GitLabConfig): void {
    if (!/^https?:\/\//i.test(config.baseUrl) || !config.projectPath) {
      throw new Error('无法从 origin 推断 GitLab 项目，请在 Tools > GitLab 中配置服务地址和项目路径。')
    }
  }

  private issue(value: unknown): GitLabIssue {
    const item = value as Record<string, unknown>
    return {
      iid: Number(item.iid), title: String(item.title ?? ''), state: String(item.state ?? ''),
      webUrl: String(item.web_url ?? ''),
      labels: Array.isArray(item.labels) ? item.labels.map(String) : [],
      assignees: Array.isArray(item.assignees) ? item.assignees.map((assignee) => String((assignee as Record<string, unknown>).name ?? '')) : []
    }
  }

  private mergeRequest(value: unknown): GitLabMergeRequest {
    const item = value as Record<string, unknown>
    const author = item.author as Record<string, unknown> | undefined
    const pipeline = item.head_pipeline as Record<string, unknown> | undefined
    return {
      iid: Number(item.iid), title: String(item.title ?? ''), state: String(item.state ?? ''),
      sourceBranch: String(item.source_branch ?? ''), targetBranch: String(item.target_branch ?? ''),
      author: String(author?.name ?? ''), webUrl: String(item.web_url ?? ''),
      draft: Boolean(item.draft || item.work_in_progress), pipelineStatus: pipeline?.status ? String(pipeline.status) : undefined
    }
  }

  private pipeline(value: unknown): GitLabPipeline {
    const item = value as Record<string, unknown>
    return {
      id: Number(item.id), iid: Number(item.iid ?? item.id), ref: String(item.ref ?? ''),
      sha: String(item.sha ?? ''), status: String(item.status ?? ''), webUrl: String(item.web_url ?? ''),
      updatedAt: String(item.updated_at ?? item.created_at ?? '')
    }
  }

  private async read(): Promise<StoredConfigs> {
    try { return JSON.parse(await readFile(this.filePath, 'utf8')) as StoredConfigs } catch { return {} }
  }

  private async write(configs: StoredConfigs): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    await writeFile(this.filePath, JSON.stringify(configs, null, 2), 'utf8')
  }
}
