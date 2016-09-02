import { ipcRenderer } from 'electron'
import User, { IUser } from '../../models/user'
import Repository, { IRepository } from '../../models/repository'
import { WorkingDirectoryFileChange } from '../../models/status'
import guid from '../guid'
import { IHistorySelection, RepositorySection, Popup, IAppError } from '../app-state'
import { Action } from './actions'
import AppStore from './app-store'
import GitUserStore from './git-user-store'
import { CloningRepositoriesStore, CloningRepository } from './cloning-repositories-store'
import { URLActionType } from '../parse-url'
import { Branch } from '../local-git-operations'
import { IAPIUser } from '../../lib/api'

/**
 * Extend Error so that we can create new Errors with a callstack different from
 * the callsite.
 */
class IPCError extends Error {
  public readonly message: string
  public readonly stack: string

  public constructor(name: string, message: string, stack: string) {
    super(name)
    this.name = name
    this.message = message
    this.stack = stack
  }
}

interface IResult<T> {
  type: 'result'
  readonly result: T
}

interface IError {
  type: 'error'
  readonly error: Error
}

type IPCResponse<T> = IResult<T> | IError

/**
 * The Dispatcher acts as the hub for state. The StateHub if you will. It
 * decouples the consumer of state from where/how it is stored.
 */
export class Dispatcher {
  private appStore: AppStore
  private gitUserStore: GitUserStore
  private cloningRepositoriesStore: CloningRepositoriesStore

  public constructor(appStore: AppStore, gitUserStore: GitUserStore, cloningRepositoriesStore: CloningRepositoriesStore) {
    this.appStore = appStore
    this.gitUserStore = gitUserStore
    this.cloningRepositoriesStore = cloningRepositoriesStore

    ipcRenderer.on('shared/did-update', (event, args) => this.onSharedDidUpdate(event, args))
  }

  public async loadInitialState(): Promise<void> {
    const users = await this.loadUsers()
    const repositories = await this.loadRepositories()
    this.appStore._loadFromSharedProcess(users, repositories)
  }

  private dispatchToSharedProcess<T>(action: Action): Promise<T> {
    return this.send(action.name, action)
  }

  private send<T>(name: string, args: Object): Promise<T> {
    let resolve: ((value: T) => void) | null = null
    let reject: ((error: Error) => void) | null = null
    const promise = new Promise<T>((_resolve, _reject) => {
      resolve = _resolve
      reject = _reject
    })

    const requestGuid = guid()
    ipcRenderer.once(`shared/response/${requestGuid}`, (event: any, args: any[]) => {
      const response: IPCResponse<T> = args[0]
      if (response.type === 'result') {
        resolve!(response.result)
      } else {
        const errorInfo = response.error
        const error = new IPCError(errorInfo.name, errorInfo.message, errorInfo.stack || '')
        if (__DEV__) {
          console.error(`Error from IPC in response to ${name}:`)
          console.error(error)
        }

        reject!(error)
      }
    })

    ipcRenderer.send('shared/request', [ { guid: requestGuid, name, args } ])
    return promise
  }

  private onSharedDidUpdate(event: Electron.IpcRendererEvent, args: any[]) {
    const state: {repositories: ReadonlyArray<IRepository>, users: ReadonlyArray<IUser>} = args[0].state
    const inflatedUsers = state.users.map(User.fromJSON)
    const inflatedRepositories = state.repositories.map(Repository.fromJSON)
    this.appStore._loadFromSharedProcess(inflatedUsers, inflatedRepositories)
  }

  /** Get the users */
  private async loadUsers(): Promise<ReadonlyArray<User>> {
    const json = await this.dispatchToSharedProcess<ReadonlyArray<IUser>>({ name: 'get-users' })
    return json.map(User.fromJSON)
  }

  /** Get the repositories the user has added to the app. */
  private async loadRepositories(): Promise<ReadonlyArray<Repository>> {
    const json = await this.dispatchToSharedProcess<ReadonlyArray<IRepository>>({ name: 'get-repositories' })
    return json.map(Repository.fromJSON)
  }

  /**
   * Add the repositories at the given paths. If a path isn't a repository, then
   * this will post an error to that affect.
   */
  public async addRepositories(paths: ReadonlyArray<string>): Promise<ReadonlyArray<Repository>> {
    const validatedPaths = new Array<string>()
    for (const path of paths) {
      const validatedPath = await this.appStore._validatedRepositoryPath(path)
      if (validatedPath) {
        validatedPaths.push(validatedPath)
      } else {
        this.postError({ name: 'add-repository', message: `${path} isn't a git repository.` })
      }
    }

    const json = await this.dispatchToSharedProcess<ReadonlyArray<IRepository>>({ name: 'add-repositories', paths: validatedPaths })
    const addedRepositories = json.map(Repository.fromJSON)
    for (const repository of addedRepositories) {
      this.refreshGitHubRepositoryInfo(repository)
    }

    return addedRepositories
  }

  /** Remove the repositories represented by the given IDs from local storage. */
  public async removeRepositories(repositories: ReadonlyArray<Repository | CloningRepository>): Promise<void> {
    const localRepositories = repositories.filter(r => r instanceof Repository) as ReadonlyArray<Repository>
    const cloningRepositories = repositories.filter(r => r instanceof CloningRepository) as ReadonlyArray<CloningRepository>
    cloningRepositories.forEach(r => {
      this.cloningRepositoriesStore.remove(r)
    })

    const repositoryIDs = localRepositories.map(r => r.id)
    await this.dispatchToSharedProcess<ReadonlyArray<number>>({ name: 'remove-repositories', repositoryIDs })
  }

  /** Request the user approve our OAuth request. This will open their browser. */
  public requestOAuth(): Promise<void> {
    return this.dispatchToSharedProcess<void>({ name: 'request-oauth' })
  }

  /** Refresh the associated GitHub repository. */
  public async refreshGitHubRepositoryInfo(repository: Repository): Promise<void> {
    const refreshedRepository = await this.appStore._repositoryWithRefreshedGitHubRepository(repository)
    if (refreshedRepository === repository) { return }

    return this.dispatchToSharedProcess<void>({ name: 'update-github-repository', repository: refreshedRepository })
  }

  /** Load the history for the repository. */
  public loadHistory(repository: Repository): Promise<void> {
    return this.appStore._loadHistory(repository)
  }

  /** Load the next batch of history for the repository. */
  public loadNextHistoryBatch(repository: Repository): Promise<void> {
    return this.appStore._loadNextHistoryBatch(repository)
  }

  /** Load the changed files for the current history selection. */
  public loadChangedFilesForCurrentSelection(repository: Repository): Promise<void> {
    return this.appStore._loadChangedFilesForCurrentSelection(repository)
  }

  /** Change the history selection. */
  public changeHistorySelection(repository: Repository, selection: IHistorySelection): Promise<void> {
    return this.appStore._changeHistorySelection(repository, selection)
  }

  /** Select the repository. */
  public selectRepository(repository: Repository | CloningRepository): Promise<void> {
    return this.appStore._selectRepository(repository)
  }

  /** Load the working directory status. */
  public loadStatus(repository: Repository): Promise<void> {
    return this.appStore._loadStatus(repository)
  }

  /** Change the selected section in the repository. */
  public changeRepositorySection(repository: Repository, section: RepositorySection): Promise<void> {
    return this.appStore._changeRepositorySection(repository, section)
  }

  /** Change the currently selected file in Changes. */
  public changeChangesSelection(repository: Repository, selectedFile: WorkingDirectoryFileChange | null): Promise<void> {
    return this.appStore._changeChangesSelection(repository, selectedFile)
  }

  /**
   * Commit the changes which were marked for inclusion, using the given commit
   * summary and description.
   */
  public commitIncludedChanges(repository: Repository, summary: string, description: string): Promise<void> {
    return this.appStore._commitIncludedChanges(repository, summary, description)
  }

  /** Change the file's includedness. */
  public changeFileIncluded(repository: Repository, file: WorkingDirectoryFileChange, include: boolean): Promise<void> {
    return this.appStore._changeFileIncluded(repository, file, include)
  }

  /** Change the file's line selection state. */
  public changeFileLineSelection(repository: Repository, file: WorkingDirectoryFileChange, diffSelection: Map<number, boolean>): Promise<void> {
    return this.appStore._changeFileLineSelection(repository, file, diffSelection)
  }

  /** Change the Include All state. */
  public changeIncludeAllFiles(repository: Repository, includeAll: boolean): Promise<void> {
    return this.appStore._changeIncludeAllFiles(repository, includeAll)
  }

  /**
   * Refresh the repository. This would be used, e.g., when the app gains focus.
   */
  public refreshRepository(repository: Repository): Promise<void> {
    return this.appStore._refreshRepository(repository)
  }

  /** Try to find the git user for the repository, SHA, and email. */
  public loadAndCacheUser(repository: Repository, sha: string | null, email: string): Promise<void> {
    return this.gitUserStore._loadAndCacheUser(this.appStore.getState().users, repository, sha, email)
  }

  /** Show the popup. This will close any current popup. */
  public showPopup(popup: Popup, repository: Repository | null): Promise<void> {
    return this.appStore._showPopup(popup, repository)
  }

  /** Close the current popup. */
  public closePopup(): Promise<void> {
    return this.appStore._closePopup()
  }

  /** Create a new branch from the given starting point and check it out. */
  public createBranch(repository: Repository, name: string, startPoint: string): Promise<void> {
    return this.appStore._createBranch(repository, name, startPoint)
  }

  /** Check out the given branch. */
  public checkoutBranch(repository: Repository, name: string): Promise<void> {
    return this.appStore._checkoutBranch(repository, name)
  }

  /** Push the current branch. */
  public push(repository: Repository): Promise<void> {
    return this.appStore._push(repository)
  }

  /** Pull the current branch. */
  public pull(repository: Repository): Promise<void> {
    return this.appStore._pull(repository)
  }

  /** Publish the repository to GitHub with the given properties. */
  public async publishRepository(repository: Repository, name: string, description: string, private_: boolean, account: User, org: IAPIUser | null): Promise<void> {
    await this.appStore._publishRepository(repository, name, description, private_, account, org)
    return this.refreshGitHubRepositoryInfo(repository)
  }

  /** Post the given error. */
  public postError(error: IAppError): Promise<void> {
    return this.appStore._postError(error)
  }

  /** Clear the given error. */
  public clearError(error: IAppError): Promise<void> {
    return this.appStore._clearError(error)
  }

  /** Handle the URL action. Returns whether the shared process handled it. */
  public handleURLAction(action: URLActionType): Promise<boolean> {
    return this.dispatchToSharedProcess<boolean>({ name: 'url-action', action })
  }

  /** Clone the repository to the path. */
  public async clone(url: string, path: string): Promise<void> {
    const cloningRepository = await this.cloningRepositoriesStore.clone(url, path)
    await this.selectRepository(cloningRepository)
    await this.cloningRepositoriesStore.getPromise(cloningRepository)

    const addedRepositories = await this.addRepositories([ path ])
    await this.selectRepository(addedRepositories[0])
  }

  /** Rename the branch to a new name. */
  public renameBranch(repository: Repository, branch: Branch, newName: string): Promise<void> {
    return this.appStore._renameBranch(repository, branch, newName)
  }

  /**
   * Delete the branch. This will delete both the local branch and the remote
   * branch, and then check out the default branch.
   */
  public deleteBranch(repository: Repository, branch: Branch): Promise<void> {
    return this.appStore._deleteBranch(repository, branch)
  }
}
