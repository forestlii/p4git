import { describe, expect, it } from 'vitest'
import { inferGitLabRemote } from './gitlab-remote'

describe('inferGitLabRemote', () => {
  it('understands self-hosted HTTPS and SSH GitLab remotes', () => {
    expect(inferGitLabRemote('https://git.devcloud.ztgame.com/Xcards/client.git/')).toEqual({
      baseUrl: 'https://git.devcloud.ztgame.com',
      projectPath: 'Xcards/client'
    })
    expect(inferGitLabRemote('git@git.devcloud.ztgame.com:Xcards/client.git')).toEqual({
      baseUrl: 'https://git.devcloud.ztgame.com',
      projectPath: 'Xcards/client'
    })
    expect(inferGitLabRemote('ssh://git@gitlab.example.com:2222/group/subgroup/project.git')).toEqual({
      baseUrl: 'https://gitlab.example.com:2222',
      projectPath: 'group/subgroup/project'
    })
  })

  it('rejects local paths and unrelated URL schemes', () => {
    expect(inferGitLabRemote('C:\\repo')).toEqual({ baseUrl: '', projectPath: '' })
    expect(inferGitLabRemote('file:///repo')).toEqual({ baseUrl: '', projectPath: '' })
  })
})
