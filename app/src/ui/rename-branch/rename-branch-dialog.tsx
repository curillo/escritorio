import * as React from 'react'

import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { sanitizedBranchName } from '../../lib/sanitize-branch'
import { TextBox } from '../lib/text-box'
import { Row } from '../lib/row'
import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import {
  renderBranchNameWarning,
  renderBranchHasRemoteWarning,
  renderStashWillBeLostWarning,
} from '../lib/branch-name-warnings'
import { IStashEntry } from '../../models/stash-entry'

interface IRenameBranchProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly branch: Branch
  readonly stash: IStashEntry | null
}

interface IRenameBranchState {
  readonly newName: string
  /**
   * Whether or not the component is currently processing the rename.
   * When this is set the dialog will be considered busy and the dialog
   * buttons will be disabled.
   */
  readonly renaming: boolean
}

export class RenameBranch extends React.Component<
  IRenameBranchProps,
  IRenameBranchState
> {
  public constructor(props: IRenameBranchProps) {
    super(props)

    this.state = { newName: props.branch.name, renaming: false }
  }

  public render() {
    const disabled =
      !this.state.newName.length || /^\s*$/.test(this.state.newName)
    return (
      <Dialog
        id="rename-branch"
        title={__DARWIN__ ? 'Rename Branch' : 'Rename branch'}
        loading={this.state.renaming}
        disabled={this.state.renaming}
        onDismissed={this.cancel}
        onSubmit={this.renameBranch}
      >
        <DialogContent>
          <Row>
            <TextBox
              label="Name"
              autoFocus={true}
              value={this.state.newName}
              onValueChanged={this.onNameChange}
            />
          </Row>
          {renderBranchNameWarning(
            this.state.newName,
            sanitizedBranchName(this.state.newName)
          )}
          {renderBranchHasRemoteWarning(this.props.branch)}
          {renderStashWillBeLostWarning(this.props.stash)}
        </DialogContent>

        <DialogFooter>
          <ButtonGroup>
            <Button type="submit" disabled={disabled}>
              Rename {this.props.branch.name}
            </Button>
            <Button onClick={this.cancel}>Cancel</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }

  private onNameChange = (name: string) => {
    this.setState({ newName: name })
  }

  private cancel = () => {
    this.props.dispatcher.closePopup()
  }

  private renameBranch = async () => {
    this.setState({ renaming: true })
    const name = sanitizedBranchName(this.state.newName)
    await this.props.dispatcher.renameBranch(
      this.props.repository,
      this.props.branch,
      name
    )

    this.props.dispatcher.closePopup()
  }
}
