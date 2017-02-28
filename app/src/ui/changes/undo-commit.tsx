import * as React from 'react'

import { Commit } from '../../models/commit'
import { RichText } from '../lib/rich-text'
import { RelativeTime } from '../relative-time'
import { Button } from '../lib/button'

interface IUndoCommitProps {
  /** The function to call when the Undo button is clicked. */
  readonly onUndo: () => void

  /** The commit to undo. */
  readonly commit: Commit

  readonly emoji: Map<string, string>
}

/** The Undo Commit component. */
export class UndoCommit extends React.Component<IUndoCommitProps, void> {
  public render() {
    const authorDate = this.props.commit.author.date
    return (
      <div id='undo-commit'>
        <div className='commit-info'>
          <div className='ago'>Committed <RelativeTime date={authorDate} /></div>
          <RichText emoji={this.props.emoji} className='summary'>{this.props.commit.summary}</RichText>
        </div>
        <div className='actions'>
          <Button type='submit' onClick={this.props.onUndo}>Undo</Button>
        </div>
      </div>
    )
  }
}
