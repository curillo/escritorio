import * as React from 'react'

/** The possible values for a Checkbox component. */
export enum CheckboxValue {
  On,
  Off,
  Mixed,
}

interface ICheckboxProps {
  /** The current value of the component. */
  readonly value: CheckboxValue

  /** The function to call on value change. */
  readonly onChange?: (event: React.FormEvent<HTMLInputElement>) => void

  readonly tabIndex?: number
}

/** A checkbox component which supports the mixed value. */
export class Checkbox extends React.Component<ICheckboxProps, void> {
  private onChange(event: React.FormEvent<HTMLInputElement>) {

    console.log(`checkbox says include: ${event.currentTarget.checked}`)

    if (this.props.onChange) {
      this.props.onChange(event)
    }
  }

  public render() {
    const value = this.props.value
    return (
      <input
        tabIndex={this.props.tabIndex}
        type='checkbox'
        onChange={event => this.onChange(event)}
        ref={function(input) {
          if (input) {
            input.indeterminate = value === CheckboxValue.Mixed
            input.checked = value !== CheckboxValue.Off
          }
        }}/>
    )
  }
}
