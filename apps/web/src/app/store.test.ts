import { beforeEach, describe, expect, it } from 'vitest'
import {
  clampListWidth,
  isListRoute,
  LIST_WIDTH,
  listOf,
  type Route,
  readPersisted,
  useUi,
} from './store'

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

describe('the list beside an open note (notes layout)', () => {
  it('is the route itself when the route is a list', () => {
    expect(listOf({ kind: 'folder', id: 'f' }, [])).toEqual({ kind: 'folder', id: 'f' })
    expect(listOf({ kind: 'today' }, [{ kind: 'folder', id: 'f' }])).toEqual({ kind: 'today' })
  })

  it('is the last list in the history while a note or another screen is open', () => {
    const back: Route[] = [
      { kind: 'folder', id: 'a' },
      { kind: 'home', filter: 'inbox' },
      { kind: 'note', id: '1' },
      { kind: 'tidy' },
    ]
    expect(listOf({ kind: 'note', id: '2' }, back)).toEqual({ kind: 'home', filter: 'inbox' })
  })

  it('is Home when no list was visited', () => {
    expect(listOf({ kind: 'note', id: '1' }, [{ kind: 'overview' }])).toEqual({ kind: 'home' })
  })

  it('follows Back and Forward', () => {
    const s = useUi.getState()
    s.navigate({ kind: 'folder', id: 'a' })
    s.navigate({ kind: 'note', id: '1' })
    s.navigate({ kind: 'folder', id: 'b' })
    s.navigate({ kind: 'note', id: '2' })
    const list = () => listOf(useUi.getState().route, useUi.getState().back)
    expect(list()).toEqual({ kind: 'folder', id: 'b' })
    useUi.getState().goBack()
    useUi.getState().goBack()
    expect(useUi.getState().route).toEqual({ kind: 'note', id: '1' })
    expect(list()).toEqual({ kind: 'folder', id: 'a' })
  })

  it('tells lists from other routes', () => {
    expect(isListRoute({ kind: 'home' })).toBe(true)
    expect(isListRoute({ kind: 'today' })).toBe(true)
    expect(isListRoute({ kind: 'note', id: 'x' })).toBe(false)
    expect(isListRoute({ kind: 'overview' })).toBe(false)
  })
})

describe('layout kept on this device', () => {
  it('asks everyone who has not chosen: new installs and earlier users alike', () => {
    expect(readPersisted(undefined)).toEqual({})
    expect(useUi.getInitialState().layout).toBeNull()
    // Used before the choice existed: settings stored, no layout among them.
    expect(readPersisted({ theme: 'dark', noteView: 'list' })).toEqual({
      theme: 'dark',
      noteView: 'list',
      layout: null,
    })
    expect(readPersisted({ layout: null }).layout).toBeNull()
  })

  it('keeps a stored choice and drops an unknown one', () => {
    expect(readPersisted({ layout: 'notes' }).layout).toBe('notes')
    expect(readPersisted({ layout: 'assistant' }).layout).toBe('assistant')
    expect(readPersisted({ layout: 'grid' }).layout).toBeNull()
  })

  it('brings the list width back into range', () => {
    expect(readPersisted({ listWidth: 9000 }).listWidth).toBe(LIST_WIDTH.max)
    expect(readPersisted({ listWidth: 'x' }).listWidth).toBe(LIST_WIDTH.initial)
    expect(clampListWidth(100)).toBe(LIST_WIDTH.min)
    expect(clampListWidth(300.4)).toBe(300)
    useUi.getState().setListWidth(1000)
    expect(useUi.getState().listWidth).toBe(LIST_WIDTH.max)
  })
})
