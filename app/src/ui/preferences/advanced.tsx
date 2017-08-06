import * as React from 'react'
import { DialogContent } from '../dialog'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { LinkButton } from '../lib/link-button'
import { Row } from '../../ui/lib/row'
import { SamplesURL } from '../../lib/stats'
import { Select } from '../lib/select'
import { getAvailableEditors } from '../lib/available-editors'

interface IAdvancedPreferencesProps {
  readonly isOptedOut: boolean
  readonly confirmRepoRemoval: boolean
  readonly onOptOutSet: (checked: boolean) => void
  readonly onConfirmRepoRemovalSet: (checked: boolean) => void
  readonly onSelectedEditorChanged: (editor: string) => void
}

interface IAdvancedPreferencesState {
  readonly reportingOptOut: boolean
  readonly availableEditors?: ReadonlyArray<string>
  readonly selectedEditor?: string
  readonly confirmRepoRemoval: boolean
}

export class Advanced extends React.Component<
  IAdvancedPreferencesProps,
  IAdvancedPreferencesState
> {
  public constructor(props: IAdvancedPreferencesProps) {
    super(props)

    this.state = {
      reportingOptOut: this.props.isOptedOut,
      confirmRepoRemoval: this.props.confirmRepoRemoval,
    }
  }

  public async componentDidMount() {
    const availableEditors = await getAvailableEditors()
    this.setState({ availableEditors })
  }

  private onReportingOptOutChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = !event.currentTarget.checked

    this.setState({ reportingOptOut: value })
    this.props.onOptOutSet(value)
  }

  private onConfirmRepoRemovalChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked

    this.setState({ confirmRepoRemoval: value })
    this.props.onConfirmRepoRemovalSet(value)
  }

  private onSelectedEditorChanged = (
    event: React.FormEvent<HTMLSelectElement>
  ) => {
    const value = event.currentTarget.value
    this.props.onSelectedEditorChanged(value)
  }

  public reportDesktopUsageLabel() {
    return (
      <span>
        Help GitHub Desktop improve by submitting{' '}
        <LinkButton uri={SamplesURL}>anonymous usage data</LinkButton>
      </span>
    )
  }

  public render() {
    const options = this.state.availableEditors || []

    return (
      <DialogContent>
        <Row>
          <Select
            label={__DARWIN__ ? 'External Editor' : 'External editor'}
            value={this.state.selectedEditor}
            onChange={this.onSelectedEditorChanged}
          >
            {options.map(n =>
              <option key={n} value={n}>
                {n}
              </option>
            )}
          </Select>
        </Row>
        <Row>
          <Checkbox
            label={this.reportDesktopUsageLabel()}
            value={
              this.state.reportingOptOut ? CheckboxValue.Off : CheckboxValue.On
            }
            onChange={this.onReportingOptOutChanged}
          />
        </Row>
        <Row>
          <Checkbox
            label="Show confirmation dialog before removing repositories"
            value={
              this.state.confirmRepoRemoval
                ? CheckboxValue.On
                : CheckboxValue.Off
            }
            onChange={this.onConfirmRepoRemovalChanged}
          />
        </Row>
      </DialogContent>
    )
  }
}
