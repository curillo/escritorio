import * as React from 'react'

import List from '../list'
import RepositoryListItem from './repository-list-item'
import Repository from '../../models/repository'
import { groupRepositories, RepositoryListItem as RepositoryListItemModel, Repositoryish } from './group-repositories'
import { Dispatcher, CloningRepository } from '../../lib/dispatcher'

interface IRepositoriesListProps {
  readonly selectedRepository: Repositoryish | null
  readonly onSelectionChanged: (repository: Repositoryish) => void
  readonly dispatcher: Dispatcher
  readonly loading: boolean
  readonly repositories: ReadonlyArray<Repository>
  readonly cloningRepositories: ReadonlyArray<CloningRepository>
}

const RowHeight = 42

/** The list of user-added repositories. */
export default class RepositoriesList extends React.Component<IRepositoriesListProps, void> {
  private renderRow(groupedItems: ReadonlyArray<RepositoryListItemModel>, row: number) {
    const item = groupedItems[row]
    if (item.kind === 'repository') {
      return <RepositoryListItem key={row}
                                 repository={item.repository}
                                 dispatcher={this.props.dispatcher} />
    } else {
      return <div key={row} className='repository-group-label'>{item.label}</div>
    }
  }

  private selectedRow(groupedItems: ReadonlyArray<RepositoryListItemModel>): number {
    const selectedRepository = this.props.selectedRepository
    if (!selectedRepository) { return -1 }

    return groupedItems.findIndex(item => {
      if (item.kind === 'repository') {
        const repository = item.repository
        if (repository instanceof Repository && selectedRepository instanceof Repository) {
          return repository.id === selectedRepository.id
        } else {
          return repository === selectedRepository
        }
      } else {
        return false
      }
    })
  }

  private onSelectionChanged(groupedItems: ReadonlyArray<RepositoryListItemModel>, row: number) {
    const item = groupedItems[row]
    if (item.kind === 'repository') {
      this.props.onSelectionChanged(item.repository)
    }
  }

  private canSelectRow(groupedItems: ReadonlyArray<RepositoryListItemModel>, row: number) {
    const item = groupedItems[row]
    return item.kind === 'repository'
  }

  public render() {
    if (this.props.loading) {
      return <Loading/>
    }

    if (this.props.repositories.length < 1) {
      return <NoRepositories/>
    }

    const allRepositories: ReadonlyArray<Repositoryish> = [
      ...this.props.repositories,
      ...this.props.cloningRepositories,
    ]
    const grouped = groupRepositories(allRepositories)
    return (
      <List id='repository-list'
            rowCount={grouped.length}
            rowHeight={RowHeight}
            rowRenderer={row => this.renderRow(grouped, row)}
            selectedRow={this.selectedRow(grouped)}
            onSelectionChanged={row => this.onSelectionChanged(grouped, row)}
            canSelectRow={row => this.canSelectRow(grouped, row)}
            invalidationProps={this.props.repositories}/>
    )
  }
}

function Loading() {
  return <div className='sidebar-message'>Loading…</div>
}

function NoRepositories() {
  return <div className='sidebar-message'>No repositories</div>
}
