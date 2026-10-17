import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useCounterStore } from './counter'

describe('counter store', () => {
  beforeEach(() => setActivePinia(createPinia()))
  it('updates derived state and resets the count', () => {
    const store = useCounterStore()
    store.increment()
    store.increment()
    expect(store.count).toBe(2)
    expect(store.doubled).toBe(4)
    store.reset()
    expect(store.count).toBe(0)
    expect(store.doubled).toBe(0)
  })
})
