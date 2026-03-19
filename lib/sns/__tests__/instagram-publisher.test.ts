import { describe, it, expect } from 'vitest'

// Test the module can be imported without errors
describe('instagram-publisher', () => {
  it('exports publishSingleImage', async () => {
    const mod = await import('../instagram-publisher')
    expect(typeof mod.publishSingleImage).toBe('function')
  })
  it('exports publishCarousel', async () => {
    const mod = await import('../instagram-publisher')
    expect(typeof mod.publishCarousel).toBe('function')
  })
  it('exports publishDraft', async () => {
    const mod = await import('../instagram-publisher')
    expect(typeof mod.publishDraft).toBe('function')
  })
})
