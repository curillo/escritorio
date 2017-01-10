import * as Path from 'path'
import * as Fs from 'fs'

import { git, IGitExecutionOptions } from './core'
import { getBlobContents } from './show'

import { Repository } from '../../models/repository'
import { WorkingDirectoryFileChange, FileChange, FileStatus } from '../../models/status'
import { DiffType, IRawDiff, IDiff, IImageDiff, Image, FileSummary, DiffHunk } from '../../models/diff'

import { getSubmoduleDetails } from '../../lib/git/submodule'

import { DiffParser } from '../diff-parser'

/**
 *  Defining the list of known extensions we can render inside the app
 */
const imageFileExtensions = new Set([ '.png', '.jpg', '.jpeg', '.gif' ])

/**
 * Render the difference between a file in the given commit and its parent
 *
 * @param commitish A commit SHA or some other identifier that ultimately dereferences
 *                  to a commit.
 */
export function getCommitDiff(repository: Repository, file: FileChange, commitish: string): Promise<IDiff> {

  const args = [ 'log', commitish, '-m', '-1', '--first-parent', '--patch-with-raw', '-z', '--', file.path ]

  return git(args, repository.path, 'getCommitDiff')
    .then(value => diffFromRawDiffOutput(value.stdout))
    .then(diff => convertDiff(repository, file, diff, commitish))
}

/**
 * Render the diff for a file within the repository working directory. The file will be
 * compared against HEAD if it's tracked, if not it'll be compared to an empty file meaning
 * that all content in the file will be treated as additions.
 */
export function getWorkingDirectoryDiff(repository: Repository, file: WorkingDirectoryFileChange): Promise<IDiff> {

  let opts: IGitExecutionOptions | undefined
  let args: Array<string>

  if (file.status === FileStatus.New) {
    // `git diff --no-index` seems to emulate the exit codes from `diff` irrespective of
    // whether you set --exit-code
    //
    // this is the behaviour:
    // - 0 if no changes found
    // - 1 if changes found
    // -   and error otherwise
    //
    // citation in source:
    // https://github.com/git/git/blob/1f66975deb8402131fbf7c14330d0c7cdebaeaa2/diff-no-index.c#L300
    opts = { successExitCodes: new Set([ 0, 1 ]) }
    args = [ 'diff', '--no-index', '--patch-with-raw', '-z', '--', '/dev/null', file.path ]
  } else if (file.status === FileStatus.Renamed) {
    // NB: Technically this is incorrect, the best kind of incorrect.
    // In order to show exactly what will end up in the commit we should
    // perform a diff between the new file and the old file as it appears
    // in HEAD. By diffing against the index we won't show any changes
    // already staged to the renamed file which differs from our other diffs.
    // The closest I got to that was running hash-object and then using
    // git diff <blob> <blob> but that seems a bit excessive.
    args = [ 'diff', '--patch-with-raw', '-z', '--', file.path ]
  } else {
    args = [ 'diff', 'HEAD', '--patch-with-raw', '-z', '--', file.path ]
  }

  return git(args, repository.path, 'getWorkingDirectoryDiff', opts)
    .then(value => diffFromRawDiffOutput(value.stdout))
    .then(diff => convertDiff(repository, file, diff, 'HEAD'))
}

async function getImageDiff(repository: Repository, file: FileChange, commitish: string): Promise<IImageDiff> {
  let current: Image | undefined = undefined
  let previous: Image | undefined = undefined

  // Are we looking at a file in the working directory or a file in a commit?
  if (file instanceof WorkingDirectoryFileChange) {
    // No idea what to do about this, a conflicted binary (presumably) file.
    // Ideally we'd show all three versions and let the user pick but that's
    // a bit out of scope for now.
    if (file.status === FileStatus.Conflicted) {
      return { kind: DiffType.Image }
    }

    // Does it even exist in the working directory?
    if (file.status !== FileStatus.Deleted) {
      current = await getWorkingDirectoryImage(repository, file)
    }

    if (file.status !== FileStatus.New) {
      // If we have file.oldPath that means it's a rename so we'll
      // look for that file.
      previous = await getBlobImage(repository, file.oldPath || file.path, 'HEAD')
    }
  } else {
    // File status can't be conflicted for a file in a commit
    if (file.status !== FileStatus.Deleted) {
      current = await getBlobImage(repository, file.path, commitish)
    }

    // File status can't be conflicted for a file in a commit
    if (file.status !== FileStatus.New) {
      // TODO: commitish^ won't work for the first commit
      //
      // If we have file.oldPath that means it's a rename so we'll
      // look for that file.
      previous = await getBlobImage(repository, file.oldPath || file.path, `${commitish}^`)
    }
  }

  return {
    kind: DiffType.Image,
    previous: previous,
    current: current,
  }
}

/**
 * normalize the line endings in the diff so that the CodeMirror editor
 * will display the unified diff correctly
 */
function formatLineEnding(text: string): string {
  if (text.endsWith('\n')) {
    return text
  } else if (text.endsWith('\r')) {
    return text + '\n'
  } else {
    return text + '\r\n'
  }
}

function diffMatchesSubmoduleChange(hunk: DiffHunk): boolean {
  // for any sort of submodule change, the first line should match this format
  const line = hunk.lines[1]
  const match = /[\+\-]Subproject commit ([a-z0-9]{40})/.exec(line.text)
  // no need to look at the found hash, just looking for the equivalent format
  if (match) {
    return true
  }
  return false
}

export async function convertDiff(repository: Repository, file: FileChange, diff: IRawDiff, commitish: string): Promise<IDiff> {
  if (diff.isBinary) {
    const extension = Path.extname(file.path)

    // some extension we don't know how to parse, never mind
    if (!imageFileExtensions.has(extension)) {
      return {
        kind: DiffType.Binary,
      }
    } else {
      return getImageDiff(repository, file, commitish)
    }
  }

  if (diff.hunks.length === 1) {

    const hunk = diff.hunks[0]

    if (hunk.lines.length <= 3) {

      const maybeSubmodule = diffMatchesSubmoduleChange(hunk)

      if (maybeSubmodule) {

        // TODO: what about renaming a submodule? Would that be handled here?
        const result = await getSubmoduleDetails(repository, file, commitish)

        if (result) {
          const name = Path.basename(file.path)
          const type = result.type
          const from = result.from
          const to = result.to

          const changes = from && to
            ? await getSubmoduleDiff(repository, file, from, to)
            : undefined

          return {
            kind: DiffType.Submodule,
            type,
            from,
            to,
            name,
            changes,
          }
        }
      }
    }
  }

  let diffText = ''
  diff.hunks.forEach(hunk => {
    hunk.lines.forEach(l => diffText += formatLineEnding(l.text))
  })

  return {
    kind: DiffType.Text,
    text: diffText,
    hunks: diff.hunks,
  }
}

/**
 * Map a given file extension to the related data URL media type
 */
function getMediaType(extension: string) {
  if (extension === '.png') {
    return 'image/png'
  }
  if (extension === '.jpg' || extension === '.jpeg') {
    return 'image/jpg'
  }
  if (extension === '.gif') {
    return 'image/gif'
  }

  // fallback value as per the spec
  return 'text/plain'
}

/**
 * Utility function used by get(Commit|WorkingDirectory)Diff.
 *
 * Parses the output from a diff-like command that uses `--path-with-raw`
 */
function diffFromRawDiffOutput(result: string): IRawDiff {
  const pieces = result.split('\0')
  const parser = new DiffParser()
  return parser.parse(pieces[pieces.length - 1])
}

export async function getBlobImage(repository: Repository, path: string, commitish: string): Promise<Image> {
  const extension = Path.extname(path)
  const contents = await getBlobContents(repository, commitish, path)
  const diff: Image =  {
    contents: contents.toString('base64'),
    mediaType: getMediaType(extension),
  }
  return diff
}

export async function getWorkingDirectoryImage(repository: Repository, file: FileChange): Promise<Image> {
  const extension = Path.extname(file.path)
  const contents = await getWorkingDirectoryContents(repository, file)
  const diff: Image =  {
    contents: contents,
    mediaType: getMediaType(extension),
  }
  return diff
}

function tryParseInt(text: string): number | undefined {
  const value = parseInt(text, 10)
  return isNaN(value) ? undefined : value
}

export async function getSubmoduleDiff(repository: Repository, file: FileChange, from: string, to: string): Promise<ReadonlyArray<FileSummary>> {
  const args = [ 'diff', '--numstat', '-z', `${from}..${to}` ]
  const submodulePath = Path.join(repository.path, file.path)

  const diffStats = await git(args, submodulePath, 'getSubmoduleDiff')
  const output = diffStats.stdout

  const results: Array<FileSummary> = [ ]

  const lines = output.split('\0')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const entries = line.split('\t')

    if (entries.length === 3) {
      const added = tryParseInt(entries[0])
      const removed = tryParseInt(entries[1])
      const path = entries[2].trim().replace('\0', '')

      results.push(new FileSummary(path, added, removed))
    }
  }

  return results
}

/**
 * Retrieve the binary contents of a blob from the working directory
 *
 * Returns a promise containing the base64 encoded string,
 * as <img> tags support the data URI scheme instead of
 * needing to reference a file:// URI
 *
 * https://en.wikipedia.org/wiki/Data_URI_scheme
 *
 */
async function getWorkingDirectoryContents(repository: Repository, file: FileChange): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const path = Path.join(repository.path, file.path)

    Fs.readFile(path, { flag: 'r' }, (error, buffer) => {
      if (error) {
        reject(error)
        return
      }
      resolve(buffer.toString('base64'))
    })
  })
}
