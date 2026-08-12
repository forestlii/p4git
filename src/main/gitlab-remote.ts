import type { GitLabConfig } from '../shared/types'

export function inferGitLabRemote(remoteUrl?: string): Omit<GitLabConfig, 'tokenConfigured'> {
  const remote = remoteUrl?.trim() ?? ''
  const scp = remote.includes('://') ? null : remote.match(/^[^@]+@([^:]+):(.+?)(?:\.git)?\/?$/)
  if (scp) return { baseUrl: `https://${scp[1]}`, projectPath: scp[2].replace(/\.git$/, '') }
  try {
    const parsed = new URL(remote)
    if (!['http:', 'https:', 'ssh:', 'git:'].includes(parsed.protocol)) return { baseUrl: '', projectPath: '' }
    return {
      baseUrl: `${parsed.protocol === 'ssh:' || parsed.protocol === 'git:' ? 'https:' : parsed.protocol}//${parsed.host}`,
      projectPath: decodeURIComponent(parsed.pathname).replace(/^\//, '').replace(/\.git\/?$/, '')
    }
  } catch {
    return { baseUrl: '', projectPath: '' }
  }
}
