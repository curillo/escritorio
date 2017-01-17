import * as React from 'react'
import { List } from '../list'
import { Dispatcher } from '../../lib/dispatcher'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { groupedAndFilteredBranches, BranchListItemModel } from './grouped-and-filtered-branches'
import { BranchListItem } from './branch'
import { TextBox } from '../lib/text-box'
import { Row } from '../lib/row'

const RowHeight = 30

interface IBranchesProps {
  readonly defaultBranch: Branch | null
  readonly currentBranch: Branch | null
  readonly allBranches: ReadonlyArray<Branch>
  readonly recentBranches: ReadonlyArray<Branch>
  readonly dispatcher: Dispatcher
  readonly repository: Repository
}

interface IBranchesState {
  readonly filter: string
  readonly branchItems: ReadonlyArray<BranchListItemModel>
  readonly selectedRow: number
}

export class Branches extends React.Component<IBranchesProps, IBranchesState> {
  private list: List | null = null
  private filterInput: HTMLInputElement | null = null

  public constructor(props: IBranchesProps) {
    super(props)

    this.state = this.createState(props, '', -1)
  }

  private createState(props: IBranchesProps, newFilter: string, newSelectedRow: number): IBranchesState {
    const branchItems = groupedAndFilteredBranches(
      this.props.defaultBranch,
      this.props.currentBranch,
      this.props.allBranches,
      this.props.recentBranches,
      newFilter
    )

    const selectedRow = newSelectedRow < 0 || newSelectedRow >= branchItems.length
      ? branchItems.findIndex(item => item.kind === 'branch')
      : newSelectedRow

    const filter = newFilter

    return { filter, selectedRow, branchItems }
  }

  private receiveProps(nextProps: IBranchesProps) {
    this.setState(this.createState(nextProps, this.state.filter, this.state.selectedRow))
  }

  public componentWillReceiveProps(nextProps: IBranchesProps) {
    this.receiveProps(nextProps)
  }

  private renderRow = (row: number) => {
    const item = this.state.branchItems[row]
    if (item.kind === 'branch') {
      const branch = item.branch
      const commit = branch.tip
      const currentBranchName = this.props.currentBranch ? this.props.currentBranch.name : null
      return <BranchListItem
        name={branch.name}
        isCurrentBranch={branch.name === currentBranchName}
        lastCommitDate={commit ? commit.author.date : null}/>
    } else {
      return <div className='branches-list-content branches-list-label'>{item.label}</div>
    }
  }

  private onRowClick = (row: number) => {
    const item = this.state.branchItems[row]
    if (item.kind !== 'branch') { return }

    const branch = item.branch
    this.props.dispatcher.closeFoldout()
    this.props.dispatcher.checkoutBranch(this.props.repository, branch.nameWithoutRemote)
  }

  private onRowKeyDown = (row: number, event: React.KeyboardEvent<any>) => {
    const list = this.list
    if (!list) { return }

    let focusInput = false
    const firstSelectableRow = list.nextSelectableRow('down', 0)
    const lastSelectableRow = list.nextSelectableRow('up', 0)
    if (event.key === 'ArrowUp' && row === firstSelectableRow) {
      focusInput = true
    } else if (event.key === 'ArrowDown' && row === lastSelectableRow) {
      focusInput = true
    }

    if (focusInput) {
      const input = this.filterInput
      if (input) {
        event.preventDefault()
        input.focus()
      }
    }
  }

  private canSelectRow = (row: number) => {
    const item = this.state.branchItems[row]
    return item.kind === 'branch'
  }

  private onFilterChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const text = event.currentTarget.value
    this.setState(this.createState(this.props, text, this.state.selectedRow))
  }

  private onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const list = this.list
    if (!list) { return }

    if (event.key === 'ArrowDown') {
      if (this.state.branchItems.length > 0) {
        this.setState(this.createState(this.props, this.state.filter, list.nextSelectableRow('down', 0)), () => {
          list.focus()
        })
      }

      event.preventDefault()
    } else if (event.key === 'ArrowUp') {
      if (this.state.branchItems.length > 0) {
        this.setState(this.createState(this.props, this.state.filter, list.nextSelectableRow('up', 0)), () => {
          list.focus()
        })
      }

      event.preventDefault()
    } else if (event.key === 'Escape') {
      if (this.state.filter.length === 0) {
        this.props.dispatcher.closeFoldout()
        event.preventDefault()
      }
    } else if (event.key === 'Enter') {
      this.onRowClick(list.nextSelectableRow('down', 0))
    }
  }

  private storeListRef = (ref: List) => {
    this.list = ref
  }

  private onInputRef = (instance: HTMLInputElement | null) => {
    this.filterInput = instance
  }

  private onSelectionChanged = (row: number) => {
    this.setState(this.createState(this.props, this.state.filter, row))
  }

  public render() {
    return (
      <div id='branches'>
        <Row>
          <TextBox
            type='search'
            autoFocus={true}
            placeholder='Filter'
            onChange={this.onFilterChanged}
            onKeyDown={this.onKeyDown}
            onInputRef={this.onInputRef}/>
        </Row>

        <div className='branches-list-container'>
          <List
            rowCount={this.state.branchItems.length}
            rowRenderer={this.renderRow}
            rowHeight={RowHeight}
            selectedRow={this.state.selectedRow}
            onSelectionChanged={this.onSelectionChanged}
            onRowClick={this.onRowClick}
            onRowKeyDown={this.onRowKeyDown}
            canSelectRow={this.canSelectRow}
            ref={this.storeListRef}
            invalidationProps={this.props}/>
        </div>
      </div>
    )
  }
}
