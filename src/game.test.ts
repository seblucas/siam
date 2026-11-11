import { describe, expect, it } from 'vitest'
import {
  createGame,
  enterAnimal,
  moveAnimal,
  returnAnimal,
  rotateAnimal,
  type GameState,
} from './game'

function stateWithPieces(
  pieces: Record<number, { kind: 'rock' } | { kind: 'animal'; owner: 'elephant' | 'rhino'; facing: 'north' | 'east' | 'south' | 'west' }>,
): GameState {
  const state = createGame()
  state.board = Array(25).fill(null)
  for (const [index, piece] of Object.entries(pieces)) state.board[Number(index)] = piece
  state.reserves = { elephant: 4, rhino: 4 }
  return state
}

describe('Siam game rules', () => {
  it('starts with three central rocks and elephants to move', () => {
    const state = createGame()
    expect(state.turn).toBe('elephant')
    expect(state.board.filter((piece) => piece?.kind === 'rock')).toHaveLength(3)
    expect(state.reserves).toEqual({ elephant: 5, rhino: 5 })
  })

  it('allows an animal to enter from an empty edge and toggles the turn', () => {
    const next = enterAnimal(createGame(), 0, 'south')
    expect(next.board[0]).toEqual({ kind: 'animal', owner: 'elephant', facing: 'south' })
    expect(next.reserves.elephant).toBe(4)
    expect(next.turn).toBe('rhino')
  })

  it('moves orthogonally and can change facing while moving', () => {
    const state = stateWithPieces({ 6: { kind: 'animal', owner: 'elephant', facing: 'north' } })
    const next = moveAnimal(state, 6, 7, 'east')
    expect(next.board[7]).toEqual({ kind: 'animal', owner: 'elephant', facing: 'east' })
    expect(next.board[6]).toBeNull()
  })

  it('rejects diagonal movement', () => {
    const state = stateWithPieces({ 6: { kind: 'animal', owner: 'elephant', facing: 'east' } })
    expect(() => moveAnimal(state, 6, 12, 'south')).toThrow('sans diagonale')
  })

  it('requires an animal facing the push direction to push', () => {
    const state = stateWithPieces({
      6: { kind: 'animal', owner: 'elephant', facing: 'north' },
      7: { kind: 'rock' },
    })
    expect(() => moveAnimal(state, 6, 7, 'north')).toThrow('regarder dans le sens')
    expect(state.board[7]).toEqual({ kind: 'rock' })
  })

  it('lets an aligned animal push a rock one square', () => {
    const state = stateWithPieces({
      6: { kind: 'animal', owner: 'elephant', facing: 'east' },
      7: { kind: 'rock' },
    })
    const next = moveAnimal(state, 6, 7, 'east')
    expect(next.board[7]).toEqual({ kind: 'animal', owner: 'elephant', facing: 'east' })
    expect(next.board[8]).toEqual({ kind: 'rock' })
  })

  it('requires matching force to push multiple rocks', () => {
    const state = stateWithPieces({
      5: { kind: 'animal', owner: 'elephant', facing: 'east' },
      6: { kind: 'rock' },
      7: { kind: 'rock' },
    })
    expect(() => moveAnimal(state, 5, 6, 'east')).toThrow('ne sont pas suffisantes')
  })

  it('does not allow animals facing against the push to be pushed', () => {
    const state = stateWithPieces({
      6: { kind: 'animal', owner: 'elephant', facing: 'east' },
      7: { kind: 'animal', owner: 'rhino', facing: 'west' },
    })
    expect(() => moveAnimal(state, 6, 7, 'east')).toThrow('ne sont pas suffisantes')
  })

  it('lets an opposing player’s aligned animal help push rocks', () => {
    const state = stateWithPieces({
      5: { kind: 'animal', owner: 'elephant', facing: 'east' },
      6: { kind: 'rock' },
      7: { kind: 'rock' },
      8: { kind: 'animal', owner: 'rhino', facing: 'east' },
    })
    const next = moveAnimal(state, 5, 6, 'east')
    expect(next.board[8]).toEqual({ kind: 'rock' })
    expect(next.board[9]).toEqual({ kind: 'animal', owner: 'rhino', facing: 'east' })
  })

  it('returns animals pushed off the board to their owner’s reserve', () => {
    const state = stateWithPieces({
      3: { kind: 'animal', owner: 'elephant', facing: 'east' },
      4: { kind: 'animal', owner: 'rhino', facing: 'east' },
    })
    const next = moveAnimal(state, 3, 4, 'east')
    expect(next.board[4]).toEqual({ kind: 'animal', owner: 'elephant', facing: 'east' })
    expect(next.reserves.rhino).toBe(5)
  })

  it('can enter by pushing inward from an occupied edge', () => {
    const state = stateWithPieces({
      0: { kind: 'animal', owner: 'rhino', facing: 'south' },
    })
    const next = enterAnimal(state, 0, 'south')
    expect(next.board[0]).toEqual({ kind: 'animal', owner: 'elephant', facing: 'south' })
    expect(next.board[5]).toEqual({ kind: 'animal', owner: 'rhino', facing: 'south' })
  })

  it('returns an animal from the edge to its reserve', () => {
    const state = stateWithPieces({ 0: { kind: 'animal', owner: 'elephant', facing: 'south' } })
    const next = returnAnimal(state, 0)
    expect(next.board[0]).toBeNull()
    expect(next.reserves.elephant).toBe(5)
  })

  it('spends a turn to rotate in place', () => {
    const state = stateWithPieces({ 12: { kind: 'animal', owner: 'elephant', facing: 'north' } })
    const next = rotateAnimal(state, 12, 'east')
    expect(next.board[12]).toEqual({ kind: 'animal', owner: 'elephant', facing: 'east' })
    expect(next.turn).toBe('rhino')
  })

  it('declares victory when a rock leaves the board and credits the nearest aligned player', () => {
    const state = stateWithPieces({
      3: { kind: 'animal', owner: 'elephant', facing: 'east' },
      4: { kind: 'rock' },
    })
    const next = moveAnimal(state, 3, 4, 'east')
    expect(next.winner).toBe('elephant')
    expect(next.board[4]).toEqual({ kind: 'animal', owner: 'elephant', facing: 'east' })
    expect(next.board[3]).toBeNull()
  })

  it('applies the marked-square opening variant for each player’s first two turns', () => {
    const state = createGame({ openingSquares: true, oneReturnPerPlayer: false })
    expect(() => enterAnimal(state, 2, 'south')).toThrow('deux premiers tours')
  })

  it('enforces the one-return-per-player variant', () => {
    const state = stateWithPieces({ 0: { kind: 'animal', owner: 'elephant', facing: 'south' } })
    state.variants.oneReturnPerPlayer = true
    state.returnsUsed.elephant = 1
    expect(() => returnAnimal(state, 0)).toThrow('une seule sortie')
  })
})
