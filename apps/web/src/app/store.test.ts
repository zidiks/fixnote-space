import { beforeEach, describe, expect, it } from 'vitest'
import { useUi } from './store'

beforeEach(() => useUi.setState({ route: { kind: 'home' }, back: [], forward: [] }))

describe('navigation history', () => {
  it('goes back and forward like a browser', () => {
    const { navigate } = useUi.getState()
    navigate({ kind: 'folder', id: 'x' })
    navigate({ kind: 'note', id: 'a' })
    useUi.getState().goBack()
    expect(useUi.getState().route).toEqual({ kind: 'folder', id: 'x' })
    useUi.getState().goForward()
    expect(useUi.getState().route).toEqual({ kind: 'note', id: 'a' })
  })

  it('drops forward history on a new navigation and ignores repeats', () => {
    const s = useUi.getState()
    s.navigate({ kind: 'folder', id: 'x' })
    s.navigate({ kind: 'folder', id: 'x' })
    useUi.getState().goBack()
    useUi.getState().navigate({ kind: 'home', filter: 'inbox' })
    expect(useUi.getState().forward).toEqual([])
    expect(useUi.getState().back).toEqual([{ kind: 'home' }])
  })

  it('replace does not add a history entry', () => {
    useUi.getState().navigate({ kind: 'note', id: 'x' }, { replace: true })
    expect(useUi.getState().back).toEqual([])
  })
})
