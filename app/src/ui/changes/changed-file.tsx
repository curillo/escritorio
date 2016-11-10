import * as React from 'react'

import { FileStatus } from '../../models/status'
import { Octicon, OcticonSymbol } from '../octicons'
import { showContextualMenu } from '../main-process-proxy'
import { Checkbox, CheckboxValue } from './checkbox'
import { assertNever } from '../../lib/fatal-error'

interface IChangedFileProps {
  path: string
  status: FileStatus
  oldPath?: string
  include: boolean | null
  onIncludeChanged: (include: boolean) => void
  onDiscardChanges: () => void
}

/** a changed file in the working directory for a given repository */
export class ChangedFile extends React.Component<IChangedFileProps, void> {

  private static mapStatus(status: FileStatus): string {
    switch (status) {
      case FileStatus.New: return 'New'
      case FileStatus.Modified: return 'Modified'
      case FileStatus.Deleted: return 'Deleted'
      case FileStatus.Renamed: return 'Renamed'
      case FileStatus.Conflicted: return 'Conflicted'
      case FileStatus.Copied: return 'Copied'
    }

    return assertNever(status, `Unknown file status ${status}`)
  }

  private handleChange(event: React.FormEvent<HTMLInputElement>) {
    const include = event.currentTarget.checked
    console.log(`changed-file says include: ${include}`)
    this.props.onIncludeChanged(include)
  }

  private get checkboxValue(): CheckboxValue {
    if (this.props.include === true) {
      return CheckboxValue.On
    } else if (this.props.include === false) {
      return CheckboxValue.Off
    } else {
      return CheckboxValue.Mixed
    }
  }

  public renderPathLabel() {
    const props: React.HTMLProps<HTMLLabelElement> = {
      className: 'path',
      title: this.props.path,
    }

    if (this.props.status === FileStatus.Renamed && this.props.oldPath) {
      return (
        <label {...props}>
          {this.props.oldPath} <Octicon symbol={OcticonSymbol.arrowRight} /> {this.props.path}
        </label>
      )
    } else {
      return <label {...props}>{this.props.path}</label>
    }
  }

  public render() {
    const fileStatus = ChangedFile.mapStatus(this.props.status)

    return (
      <div className='changed-file' onContextMenu={e => this.onContextMenu(e)}>

        <Checkbox
          // The checkbox doesn't need to be tab reachable since we emulate
          // checkbox behavior on the list item itself, ie hitting space bar
          // while focused on a row will toggle selection.
          tabIndex={-1}
          value={this.checkboxValue}
          onChange={event => {
            debugger
            console.log(`event handler gets ${event.currentTarget.checked}`)
            this.handleChange(event)
          }}/>

        {this.renderPathLabel()}

        <div className={'status status-' + fileStatus.toLowerCase()} title={fileStatus}>
          <Octicon symbol={iconForStatus(this.props.status)} />
        </div>
      </div>
    )
  }

  private onContextMenu(event: React.MouseEvent<any>) {
    event.preventDefault()

    if (!__WIN32__) {
      const item = {
        label: 'Discard Changes',
        action: () => this.props.onDiscardChanges(),
      }
      showContextualMenu([ item ])
    }
  }
}

function iconForStatus(status: FileStatus): OcticonSymbol {

  switch (status) {
    case FileStatus.New: return OcticonSymbol.diffAdded
    case FileStatus.Modified: return OcticonSymbol.diffModified
    case FileStatus.Deleted: return OcticonSymbol.diffRemoved
    case FileStatus.Renamed: return OcticonSymbol.diffRenamed
    case FileStatus.Conflicted: return OcticonSymbol.alert
    case FileStatus.Copied: return OcticonSymbol.diffAdded
  }

  return assertNever(status, `Unknown file status ${status}`)
}
