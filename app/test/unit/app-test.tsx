import * as chai from 'chai'
const expect = chai.expect

import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as TestUtils from 'react-addons-test-utils'

import { App } from '../../src/ui/app'
import {
  Dispatcher,
  AppStore,
  GitHubUserStore,
  CloningRepositoriesStore,
  EmojiStore,
  IssuesStore,
} from '../../src/lib/dispatcher'
import { InMemoryDispatcher } from '../in-memory-dispatcher'
import { TestGitHubUserDatabase } from '../test-github-user-database'
import { TestStatsDatabase } from '../test-stats-database'
import { TestIssuesDatabase } from '../test-issues-database'
import { StatsStore } from '../../src/lib/stats'

describe('<App />', () => {
  let appStore: AppStore | null = null
  let dispatcher: Dispatcher | null = null
  let statsStore: StatsStore | null = null

  beforeEach(async () => {
    const db = new TestGitHubUserDatabase()
    await db.reset()

    const issuesDb = new TestIssuesDatabase()
    await issuesDb.reset()

    appStore = new AppStore(new GitHubUserStore(db), new CloningRepositoriesStore(), new EmojiStore(), new IssuesStore(issuesDb))

    const statsDb = new TestStatsDatabase()
    await statsDb.reset()
    statsStore = new StatsStore(statsDb)

    dispatcher = new InMemoryDispatcher(appStore)
  })

  it('renders', () => {
    const app = TestUtils.renderIntoDocument(
      <App dispatcher={dispatcher!} appStore={appStore!} statsStore={statsStore!}/>
    ) as React.Component<any, any>
    const node = ReactDOM.findDOMNode(app)
    expect(node).not.to.equal(null)
  })
})
