import { remote } from 'electron'
import * as React from 'react'
import * as Path from 'path'
import * as FSE from 'fs-extra'

import { Dispatcher } from '../../lib/dispatcher'
import { initGitRepository, createCommit, getStatus, getAuthorIdentity } from '../../lib/git'
import { sanitizedRepositoryName } from './sanitized-repository-name'
import { Form } from '../lib/form'
import { TextBox } from '../lib/text-box'
import { Button } from '../lib/button'
import { Row } from '../lib/row'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { writeDefaultReadme } from './write-default-readme'
import { Select } from '../lib/select'
import { Loading } from '../lib/loading'
import { getGitIgnoreNames, writeGitIgnore } from './gitignores'
import { ILicense, getLicenses, writeLicense } from './licenses'
import { getDefaultDir } from '../lib/default-dir'

/** The sentinel value used to indicate no gitignore should be used. */
const NoGitIgnoreValue = 'None'

/** The sentinel value used to indicate no license should be used. */
const NoLicenseValue: ILicense = {
  name: 'None',
  featured: false,
  body: '',
}

interface ICreateRepositoryProps {
  readonly dispatcher: Dispatcher
}

interface ICreateRepositoryState {
  readonly path: string
  readonly name: string

  /** Should the repository be created with a default README? */
  readonly createWithReadme: boolean

  /** Is the repository currently in the process of being created? */
  readonly creating: boolean

  /** The names for the available gitignores. */
  readonly gitIgnoreNames: ReadonlyArray<string> | null

  /** The gitignore to include in the repository. */
  readonly gitIgnore: string

  /** The available licenses. */
  readonly licenses: ReadonlyArray<ILicense> | null

  /** The license to include in the repository. */
  readonly license: string
}

/** The Create New Repository component. */
export class CreateRepository extends React.Component<ICreateRepositoryProps, ICreateRepositoryState> {
  public constructor(props: ICreateRepositoryProps) {
    super(props)

    this.state = {
      path: getDefaultDir(),
      name: '',
      createWithReadme: false,
      creating: false,
      gitIgnoreNames: null,
      gitIgnore: NoGitIgnoreValue,
      licenses: null,
      license: NoLicenseValue.name,
    }
  }

  public async componentDidMount() {
    const gitIgnoreNames = await getGitIgnoreNames()
    this.setState({ ...this.state, gitIgnoreNames })

    const licenses = await getLicenses()
    this.setState({ ...this.state, licenses })
  }

  private onPathChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const path = event.currentTarget.value
    this.setState({ ...this.state, path })
  }

  private onNameChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const name = event.currentTarget.value
    this.setState({ ...this.state, name })
  }

  private showFilePicker = () => {
    const directory: string[] | null = remote.dialog.showOpenDialog({ properties: [ 'createDirectory', 'openDirectory' ] })
    if (!directory) { return }

    const path = directory[0]

    this.setState({ ...this.state, path })
  }

  private ensureDirectory(directory: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        FSE.ensureDir(directory, (err) => {
          if (err) {
            return reject(err)
          }

          return resolve()
        })
    })
  }

  private createRepository = async () => {
    const fullPath = Path.join(this.state.path, sanitizedRepositoryName(this.state.name))

    try {
      await this.ensureDirectory(fullPath)
    } catch (ex) {
      console.error(ex)
      return this.props.dispatcher.postError(ex)
    }

    this.setState({ ...this.state, creating: true })

    try {
      await initGitRepository(fullPath)
    } catch (ex) {
      this.setState({ ...this.state, creating: false })
      console.error(ex)
      return this.props.dispatcher.postError(ex)
    }

    const repositories = await this.props.dispatcher.addRepositories([ fullPath ])
    if (repositories.length < 1) { return }

    const repository = repositories[0]

    let createInitialCommit = false
    if (this.state.createWithReadme) {
      createInitialCommit = true

      try {
        await writeDefaultReadme(fullPath, this.state.name)
      } catch (e) {
        console.error(e)

        this.props.dispatcher.postError(e)
      }
    }

    const gitIgnore = this.state.gitIgnore
    if (gitIgnore !== NoGitIgnoreValue) {
      createInitialCommit = true

      try {
        await writeGitIgnore(fullPath, gitIgnore)
      } catch (e) {
        console.error(e)

        this.props.dispatcher.postError(e)
      }
    }

    const licenseName = (this.state.license === NoLicenseValue.name ? null : this.state.license)
    const license = (this.state.licenses || []).find(l => l.name === licenseName)

    if (license) {
      createInitialCommit = true

      try {
        const author = await getAuthorIdentity(repository)

        await writeLicense(fullPath, license, {
          fullname: author ? author.name : '',
          email: author ? author.email : '',
          year: (new Date()).getFullYear().toString(),
          description: '',
          project: this.state.name,
        })
      } catch (e) {
        console.error(e)

        this.props.dispatcher.postError(e)
      }
    }

    if (createInitialCommit) {
      try {
        const status = await getStatus(repository)
        const wd = status.workingDirectory
        const files = wd.files
        if (files.length > 0) {
          await createCommit(repository, 'Initial commit', files)
        }
      } catch (e) {
        console.error(e)

        this.props.dispatcher.postError(e)
      }
    }

    this.setState({ ...this.state, creating: false })

    this.props.dispatcher.selectRepository(repository)
    this.props.dispatcher.closeFoldout()
  }


  private onCreateWithReadmeChange = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({ ...this.state, createWithReadme: event.currentTarget.checked })
  }

  private renderError() {
    const sanitizedName = sanitizedRepositoryName(this.state.name)
    if (this.state.name === sanitizedName) { return null }

    return (
      <div>Will be created as {sanitizedName}</div>
    )
  }

  private onGitIgnoreChange = (event: React.FormEvent<HTMLSelectElement>) => {
    const gitIgnore = event.currentTarget.value
    this.setState({ ...this.state, gitIgnore })
  }

  private onLicenseChange = (event: React.FormEvent<HTMLSelectElement>) => {
    const license = event.currentTarget.value
    this.setState({ ...this.state, license })
  }

  private renderGitIgnores() {
    const gitIgnores = this.state.gitIgnoreNames || []
    const options = [ NoGitIgnoreValue, ...gitIgnores ]

    return (
      <Select
        label='Git Ignore'
        value={this.state.gitIgnore}
        onChange={this.onGitIgnoreChange}
      >
        {options.map(n => <option key={n} value={n}>{n}</option>)}
      </Select>
    )
  }

  private renderLicenses() {
    const licenses = this.state.licenses || []
    const options = [ NoLicenseValue, ...licenses ]

    return (
      <Select
        label='License'
        value={this.state.license}
        onChange={this.onLicenseChange}
      >
        {options.map(l => <option key={l.name} value={l.name}>{l.name}</option>)}
      </Select>
    )
  }

  public render() {
    const disabled = this.state.path.length === 0 || this.state.name.length === 0 || this.state.creating
    return (
      <Form>
        <TextBox
          value={this.state.name}
          label='Name'
          placeholder='repository name'
          onChange={this.onNameChanged}
          autoFocus />

        {this.renderError()}

        <Row>
          <TextBox
            value={this.state.path}
            label='Local Path'
            placeholder='repository path'
            onChange={this.onPathChanged} />
          <Button onClick={this.showFilePicker}>Choose…</Button>
        </Row>

        <Checkbox
          label='Initialize this repository with a README'
          value={this.state.createWithReadme ? CheckboxValue.On : CheckboxValue.Off}
          onChange={this.onCreateWithReadmeChange} />

        {this.renderGitIgnores()}

        {this.renderLicenses()}

        <hr />

        <Button type='submit' disabled={disabled} onClick={this.createRepository}>
          Create Repository
        </Button>

        {this.state.creating ? <Loading /> : null}
      </Form>
    )
  }
}
