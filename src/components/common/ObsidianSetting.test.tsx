// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ObsidianSetting } from './ObsidianSetting'

describe('ObsidianSetting', () => {
  it('renders the name, description and children inside the row', () => {
    const { container } = render(
      <ObsidianSetting name="API key" desc="Used for requests">
        <span>child content</span>
      </ObsidianSetting>,
    )

    expect(screen.getByText('API key')).toBeInTheDocument()
    expect(screen.getByText('Used for requests')).toBeInTheDocument()
    expect(screen.getByText('child content')).toBeInTheDocument()
    expect(container.querySelector('.setting-item')).not.toBeNull()
  })

  it('applies the custom class and the required marker', () => {
    const { container } = render(
      <ObsidianSetting name="Field" className="custom-setting" required>
        <span>child</span>
      </ObsidianSetting>,
    )

    const settingEl = container.querySelector('.custom-setting')
    expect(settingEl).not.toBeNull()
    expect(settingEl).toHaveClass('setting-item')
    expect(container.querySelector('.zncz-settings-required')).not.toBeNull()
  })

  it('survives a missing name and description', () => {
    const { container } = render(
      <ObsidianSetting>
        <span>only child</span>
      </ObsidianSetting>,
    )

    expect(screen.getByText('only child')).toBeInTheDocument()
    expect(container.querySelector('.setting-item')).not.toBeNull()
  })
})
