import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { NyxLogo } from '../components/NyxLogo.js'

describe('NyxLogo', () => {
  it('renders an SVG without crashing', () => {
    const { container } = render(<NyxLogo />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('uses default size 32', () => {
    const { container } = render(<NyxLogo />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('32')
    expect(svg.getAttribute('height')).toBe('32')
  })

  it('accepts custom size', () => {
    const { container } = render(<NyxLogo size={48} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('48')
    expect(svg.getAttribute('height')).toBe('48')
  })

  it('generates unique gradient IDs when rendered multiple times', () => {
    const { container: c1 } = render(<NyxLogo />)
    const { container: c2 } = render(<NyxLogo />)
    const id1 = c1.querySelector('linearGradient')?.id
    const id2 = c2.querySelector('linearGradient')?.id
    expect(id1).toBeTruthy()
    expect(id2).toBeTruthy()
    expect(id1).not.toBe(id2)
  })
})
