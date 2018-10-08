import { expect } from 'chai'
import { toPlatformCase } from '../../src/lib/platform-case'

describe('string to platform case', () => {
  it('converts lower string to detected platform text case', () => {
    if (__DARWIN__) {
      const result = toPlatformCase(' this should be title case.')
      expect(result).to.equal(' This Should Be Title Case.')
    } else {
      const result = toPlatformCase(' this should be sentence case.')
      expect(result).to.equal(' This should be sentence case.')
    }
  })
  it('converts title cased string to detected platform text case', () => {
    if (__DARWIN__) {
      const result = toPlatformCase(' This Should Be Title Case.')
      expect(result).to.equal(' This Should Be Title Case.')
    } else {
      const result = toPlatformCase(' This Should Be Sentence Case.')
      expect(result).to.equal(' This should be sentence case.')
    }
  })
  it('converts sentence cased string to detected platform text case', () => {
    if (__DARWIN__) {
      const result = toPlatformCase(' This should be title case.')
      expect(result).to.equal(' This Should Be Title Case.')
    } else {
      const result = toPlatformCase(' This should be sentence case.')
      expect(result).to.equal(' This should be sentence case.')
    }
  })
  it('converts upper string to detected platform text case', () => {
    if (__DARWIN__) {
      const result = toPlatformCase(' THIS SHOULD BE TITLE CASE.')
      expect(result).to.equal(' This Should Be Title Case.')
    } else {
      const result = toPlatformCase(' THIS SHOULD BE SENTENCE CASE.')
      expect(result).to.equal(' This should be sentence case.')
    }
  })
  it('handles special case words to detected platform text case', () => {
    if (__DARWIN__) {
      const result = toPlatformCase(
        'Open _in_ External Editor. Show _in your File Manager_'
      )
      expect(result).to.equal(
        'Open in External Editor. Show in your File Manager'
      )
    } else {
      const result = toPlatformCase(
        'Open _in_ External Editor. Show _in your File Manager_'
      )
      expect(result).to.equal(
        'Open in external editor. Show in your File Manager'
      )
    }
  })
  it('handles extra special case words to detected platform text case', () => {
    if (__DARWIN__) {
      const result = toPlatformCase('We Love _GitHub_!')
      expect(result).to.equal('We Love GitHub!')
    } else {
      const result = toPlatformCase('We love _GitHub_!')
      expect(result).to.equal('We love GitHub!')
    }
  })
})
