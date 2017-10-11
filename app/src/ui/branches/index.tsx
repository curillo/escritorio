import * as React from 'react'
import { Dispatcher } from '../../lib/dispatcher'
import { FoldoutType, PopupType } from '../../lib/app-state'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { BranchList } from './branch-list'
import { Account } from '../../models/account'
import { TabBar } from '../tab-bar'
import { BranchesTab } from '../../models/branches-tab'
import { assertNever } from '../../lib/fatal-error'
import { enablePreviewFeatures } from '../../lib/feature-flag'
import { IPullRequest } from '../../models/pull-request'
import { PullRequestList } from './pull-request-list'
import { PullRequestsLoading } from './pull-requests-loading'
import { NoPullRequests } from './no-pull-requests'

interface IBranchesProps {
  readonly defaultBranch: Branch | null
  readonly currentBranch: Branch | null
  readonly allBranches: ReadonlyArray<Branch>
  readonly recentBranches: ReadonlyArray<Branch>
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly account: Account | null
  readonly selectedTab: BranchesTab
  readonly pullRequests: ReadonlyArray<IPullRequest> | null
}

interface IBranchesState {
  readonly selectedBranch: Branch | null
  readonly filterText: string
}

/** The Branches list component. */
export class Branches extends React.Component<IBranchesProps, IBranchesState> {
  public constructor(props: IBranchesProps) {
    super(props)

    this.state = {
      selectedBranch: props.currentBranch,
      filterText: '',
    }
  }

  private onItemClick = (item: Branch) => {
    this.checkoutBranch(item.nameWithoutRemote)
  }

  private checkoutBranch(branch: string) {
    this.props.dispatcher.closeFoldout(FoldoutType.Branch)

    const currentBranch = this.props.currentBranch

    if (!currentBranch || currentBranch.name !== branch) {
      this.props.dispatcher.checkoutBranch(this.props.repository, branch)
    }
  }

  private onFilterKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      if (this.state.filterText.length === 0) {
        this.props.dispatcher.closeFoldout(FoldoutType.Branch)
        event.preventDefault()
      }
    }
  }

  private onFilterTextChanged = (filterText: string) => {
    this.setState({ filterText })
  }

  private onSelectionChanged = (selectedBranch: Branch) => {
    this.setState({ selectedBranch })
  }

  private renderTabBar() {
    if (!this.props.account) {
      return null
    }

    if (!enablePreviewFeatures()) {
      return null
    }

    let countElement = null
    if (this.props.pullRequests) {
      countElement = (
        <span className="count">{this.props.pullRequests.length}</span>
      )
    }

    return (
      <TabBar
        onTabClicked={this.onTabClicked}
        selectedIndex={this.props.selectedTab}
      >
        <span>Branches</span>
        <span className="pull-request-tab">
          {__DARWIN__ ? 'Pull Requests' : 'Pull requests'}

          {countElement}
        </span>
      </TabBar>
    )
  }

  private renderSelectedTab() {
    const tab = this.props.selectedTab
    switch (tab) {
      case BranchesTab.Branches:
        return (
          <BranchList
            defaultBranch={this.props.defaultBranch}
            currentBranch={this.props.currentBranch}
            allBranches={this.props.allBranches}
            recentBranches={this.props.recentBranches}
            onItemClick={this.onItemClick}
            filterText={this.state.filterText}
            onFilterKeyDown={this.onFilterKeyDown}
            onFilterTextChanged={this.onFilterTextChanged}
            selectedBranch={this.state.selectedBranch}
            onSelectionChanged={this.onSelectionChanged}
          />
        )

      case BranchesTab.PullRequests: {
        const pullRequests = this.props.pullRequests
        if (pullRequests) {
          if (pullRequests.length > 0) {
            return (
              <PullRequestList
                pullRequests={pullRequests}
                onPullRequestClicked={this.onPullRequestClicked}
                onDismiss={this.onDismiss}
              />
            )
          } else {
            const repo = this.props.repository
            const name = repo.gitHubRepository
              ? repo.gitHubRepository.fullName
              : repo.name
            const isOnDefaultBranch =
              this.props.defaultBranch &&
              this.props.currentBranch &&
              this.props.defaultBranch.name === this.props.currentBranch.name
            return (
              <NoPullRequests
                repositoryName={name}
                isOnDefaultBranch={!!isOnDefaultBranch}
                onCreateBranch={this.onCreateBranch}
                onCreatePullRequest={this.onCreatePullRequest}
              />
            )
          }
        } else {
          return <PullRequestsLoading />
        }
      }
    }

    return assertNever(tab, `Unknown Branches tab: ${tab}`)
  }

  public render() {
    return (
      <div className="branches-container">
        {this.renderTabBar()}
        {this.renderSelectedTab()}
      </div>
    )
  }

  private onCreateBranch = () => {
    this.props.dispatcher.closeFoldout(FoldoutType.Branch)
    this.props.dispatcher.showPopup({
      type: PopupType.CreateBranch,
      repository: this.props.repository,
    })
  }

  private onCreatePullRequest = () => {
    this.props.dispatcher.closeFoldout(FoldoutType.Branch)
    this.props.dispatcher.createPullRequest(this.props.repository)
  }

  private onTabClicked = (tab: BranchesTab) => {
    this.props.dispatcher.changeBranchesTab(tab)
  }

  private onPullRequestClicked = (pullRequest: IPullRequest) => {
    const gitHubRepository = this.props.repository.gitHubRepository
    if (!gitHubRepository) {
      return log.error(
        `We shouldn't be checking out a PR on a repository that doesn't have a GitHub repository.`
      )
    }

    const head = pullRequest.head
    const isRefInThisRepo = head.repo.clone_url === gitHubRepository.cloneURL
    if (isRefInThisRepo) {
      this.checkoutBranch(head.ref)
    } else {
      // TODO: It's in a fork so we'll need to do ... something.
    }
  }

  private onDismiss = () => {
    this.props.dispatcher.closeFoldout(FoldoutType.Branch)
  }
}
