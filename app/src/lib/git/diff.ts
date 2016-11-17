import * as Path from 'path'
import { ChildProcess } from 'child_process'
import * as Fs from 'fs'

import { git, IGitExecutionOptions } from './core'

import { Repository } from '../../models/repository'
import { WorkingDirectoryFileChange, FileChange, FileStatus } from '../../models/status'
import { Diff, Image  } from '../../models/diff'

import { DiffParser } from '../diff-parser'

import { detect, tryConvert } from '../encoding-converter'

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
export async function getCommitDiff(repository: Repository, file: FileChange, commitish: string): Promise<Diff> {
  const args = [ 'log', commitish, '-m', '-1', '--first-parent', '--patch-with-raw', '-z', '--binary', '--', file.path ]

  return await computeDiff(repository, file, args)
}

/**
 * Attempt to convert a given buffer to the appropriate encoding set, or return
 * a UTF-8 encoded string from the buffer if the conversion fails
 */
function tryConvertLocal(buffer: Buffer, charset: string): string {
    const conversion = tryConvert(buffer, charset)
    return conversion.result
      ? conversion.result
      : buffer.toString('utf8')
}

/**
 * Generate the diff model from a set of Git arguments
 *
 * Assumes --binary is provided as a flag, so encoding detection can detect the correct bytes.
 * If not included, UTF-8 bytes will be provided and encoding detection will not work.
 */
async function computeDiff(repository: Repository, file: FileChange, args: string[], options?: IGitExecutionOptions): Promise<Diff> {
  const setBinaryEncoding: (process: ChildProcess) => void = cb => cb.stdout.setEncoding('binary')

  const defaultOptions: IGitExecutionOptions = {
    successExitCodes: new Set([ 0 ]),
    processCallback: setBinaryEncoding
  }

  const opts = Object.assign({ }, defaultOptions, options)
  const result = await git(args, repository.path, opts)

  const binaryDiff = Buffer.from(result.stdout, 'binary')

  const startTime = (performance && performance.now) ? performance.now() : null

  const diffEncoding = detect(binaryDiff)

  const diffSource = diffEncoding.confidence > 50
    ? tryConvertLocal(binaryDiff, diffEncoding.charset)
    : binaryDiff.toString('utf8')

  if (console.debug && startTime) {
    const rawTime = performance.now() - startTime
    if (rawTime > 100) {
     const timeInSeconds = (rawTime / 1000).toFixed(3)
     console.debug(`detecting encodings for ${file.path} (took ${timeInSeconds}s)`)
    }
  }


  const diff = await diffFromRawDiffOutput(diffSource)

  return await attachImageDiff(repository, file, diff)
}

/**
 * Render the diff for a file within the repository working directory. The file will be
 * compared against HEAD if it's tracked, if not it'll be compared to an empty file meaning
 * that all content in the file will be treated as additions.
 */
export async function getWorkingDirectoryDiff(repository: Repository, file: WorkingDirectoryFileChange): Promise<Diff> {

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
    args = [ 'diff', '--no-index', '--patch-with-raw', '-z', '--binary', '--', '/dev/null', file.path ]
  } else if (file.status === FileStatus.Renamed) {
    // NB: Technically this is incorrect, the best kind of incorrect.
    // In order to show exactly what will end up in the commit we should
    // perform a diff between the new file and the old file as it appears
    // in HEAD. By diffing against the index we won't show any changes
    // already staged to the renamed file which differs from our other diffs.
    // The closest I got to that was running hash-object and then using
    // git diff <blob> <blob> but that seems a bit excessive.
    args = [ 'diff', '--patch-with-raw', '-z', '--binary', '--', file.path ]
  } else {
    args = [ 'diff', 'HEAD', '--patch-with-raw', '-z', '--binary', '--', file.path ]
  }

  return await computeDiff(repository, file, args, opts)
}

async function attachImageDiff(repository: Repository, file: FileChange, diff: Diff): Promise<Diff> {

  // already have a text diff, no point trying out this
  if (!diff.isBinary) {
    return diff
  }

  // if unable to find an extension, this will return an empty string
  const extension = Path.extname(file.path)

  // some extension we don't know how to parse, never mind
  if (imageFileExtensions.has(extension)) {

    let current: Image | undefined = undefined
    let previous: Image | undefined = undefined

    if (file.status === FileStatus.New || file.status === FileStatus.Modified) {
      current = await getWorkingDirectoryImage(repository, file)
    }

    if (file.status === FileStatus.Modified
        || file.status === FileStatus.Renamed
        || file.status === FileStatus.Deleted) {
      previous = await getBlobImage(repository, file)
    }

    diff.imageDiff = {
      previous: previous,
      current: current,
    }
  }

  return diff
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
function diffFromRawDiffOutput(result: string): Diff {
  const pieces = result.split('\0')
  const parser = new DiffParser()
  return parser.parse(pieces[pieces.length - 1])
}

export async function getBlobImage(repository: Repository, file: FileChange): Promise<Image> {
  const extension = Path.extname(file.path)
  const contents = await getBlobContents(repository, file)
  const diff: Image =  {
    contents: contents,
    mediaType: getMediaType(extension),
  }
  return diff
}

/**
 * Retrieve the binary contents of a blob from the repository
 *
 * Returns a promise containing the base64 encoded string,
 * as <img> tags support the data URI scheme instead of
 * needing to reference a file:// URI
 *
 * https://en.wikipedia.org/wiki/Data_URI_scheme
 *
 */
async function getBlobContents(repository: Repository, file: FileChange): Promise<string> {

  const successExitCodes = new Set([ 0, 1 ])

  const lsTreeArgs = [ 'ls-tree', 'HEAD', '-z', '--', file.path ]
  const blobRow = await git(lsTreeArgs, repository.path, { successExitCodes })

  // a mixture of whitespace and tab characters here
  // so let's just split on everything interesting
  const blobDetails = blobRow.stdout.split(/\s/)
  const blob = blobDetails[2]

  const catFileArgs = [ 'cat-file', '-p', blob ]

  const setBinaryEncoding: (process: ChildProcess) => void = cb => cb.stdout.setEncoding('binary')

  const blobContents = await git(catFileArgs, repository.path, { successExitCodes, processCallback: setBinaryEncoding })
  const base64Contents = Buffer.from(blobContents.stdout, 'binary').toString('base64')

  return base64Contents
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

    Fs.readFile(path, { encoding: 'binary', flag: 'r' }, (error, data) => {
      if (error) {
        reject(error)
        return
      }
      resolve(Buffer.from(data, 'binary').toString('base64'))
    })
  })
}
