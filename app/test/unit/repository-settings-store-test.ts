/* eslint-disable no-sync */

import * as FS from 'fs'
import * as Path from 'path'
import { GitProcess } from 'dugite'
import { expect } from 'chai'

import { RepositorySettingsStore } from '../../src/lib/stores'
import { setupEmptyRepository } from '../helpers/repositories'
import { getStatus } from '../../src/lib/git'
import { Repository } from '../../src/models/repository'
import { pathExists } from '../../src/lib/file-system'

describe('RepositorySettingsStore', () => {
  it('can create a gitignore file', async () => {
    const repo = await setupEmptyRepository()
    const path = repo.path
    const sut = new RepositorySettingsStore(repo)

    // Create git ignore file
    await sut.saveGitIgnore('node_modules\n')

    // Make sure file exists on FS
    const exists = await pathExists(`${path}/.gitignore`)

    expect(exists).is.true
  })

  it('can ignore a file in a repository', async () => {
    const repo = await setupEmptyRepository()
    const sut = new RepositorySettingsStore(repo)
    const path = repo.path

    // Ignore txt files
    await sut.saveGitIgnore('*.txt\n')
    await GitProcess.exec(['add', '.gitignore'], path)
    await GitProcess.exec(['commit', '-m', 'create the ignore file'], path)

    // Create a txt file
    const file = Path.join(repo.path, 'a.txt')

    FS.writeFileSync(file, 'thrvbnmerkl;,iuw')

    // Check status of repo
    const status = await getStatus(repo)
    const files = status.workingDirectory.files

    expect(files.length).to.equal(0)
  })

  describe('autocrlf and safecrlf', () => {
    let repo: Repository
    let sut: RepositorySettingsStore

    beforeEach(async () => {
      repo = await setupEmptyRepository()
      sut = new RepositorySettingsStore(repo)

      await GitProcess.exec(
        ['config', '--local', 'core.autocrlf', 'true'],
        repo.path
      )
      await GitProcess.exec(
        ['config', '--local', 'core.safecrlf', 'true'],
        repo.path
      )
    })

    it('appends newline to file', async () => {
      const path = repo.path

      await sut.saveGitIgnore('node_modules')
      await GitProcess.exec(['add', '.gitignore'], path)

      const commit = await GitProcess.exec(
        ['commit', '-m', 'create the ignore file'],
        path
      )
      const contents = await sut.readGitIgnore()

      expect(commit.exitCode).to.equal(0)
      expect(contents!.endsWith('\r\n'))
    })
  })
})
