import { describe, expect, it } from 'vitest'
import { chooseBotAction } from './ai'
import {
  applyGameAction,
  createGame,
  enterAnimal,
  getLegalActions,
  moveAnimal,
  returnAnimal,
  rotateAnimal,
  type GameAction,
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

  it('enumerates actions that all pass through the game rules', () => {
    const state = createGame()
    const actions = getLegalActions(state)
    expect(actions.length).toBeGreaterThan(0)
    for (const action of actions) {
      expect(() => applyGameAction(state, action)).not.toThrow()
    }
  })

  it('allows an animal to enter from an empty edge and toggles the turn', () => {
    const next = enterAnimal(createGame(), 0, 'south')
    expect(next.board[0]).toEqual({ kind: 'animal', owner: 'elephant', facing: 'south' })
    expect(next.reserves.elephant).toBe(4)
    expect(next.turn).toBe('rhino')
  })

  it('records each exact action in order so a game can be replayed', () => {
    let state = createGame({ openingSquares: true, oneReturnPerPlayer: false })
    state = enterAnimal(state, 0, 'east')
    state = enterAnimal(state, 24, 'west')
    state = rotateAnimal(state, 0, 'south')

    expect(state.history).toEqual([
      { turn: 1, player: 'elephant', action: { type: 'enter', to: 0, facing: 'east' }, summary: 'Éléphants entrent sur le plateau.' },
      { turn: 2, player: 'rhino', action: { type: 'enter', to: 24, facing: 'west' }, summary: 'Rhinocéros entrent sur le plateau.' },
      { turn: 3, player: 'elephant', action: { type: 'rotate', at: 0, facing: 'south' }, summary: 'Éléphants changent l’orientation d’un animal.' },
    ])

    const replay = state.history.reduce(
      (replayed, record) => applyGameAction(replayed, record.action),
      createGame(state.variants),
    )
    expect(replay.board).toEqual(state.board)
    expect(replay.turn).toBe(state.turn)
    expect(replay.reserves).toEqual(state.reserves)
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

  it('does not allow changing orientation as part of a push', () => {
    const state = stateWithPieces({
      12: { kind: 'animal', owner: 'elephant', facing: 'south' },
      13: { kind: 'rock' },
    })
    const push = { type: 'move', from: 12, to: 13, facing: 'east' } as const

    expect(() => applyGameAction(state, push)).toThrow('regarder dans le sens')
    expect(getLegalActions(state)).not.toContainEqual(push)
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

  it('finds an immediate winning push at every bot difficulty', () => {
    const state = stateWithPieces({
      3: { kind: 'animal', owner: 'elephant', facing: 'east' },
      4: { kind: 'rock' },
    })
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      const choice = chooseBotAction(state, difficulty, () => 0)
      expect(choice).not.toBeNull()
      expect(applyGameAction(state, choice!.action).winner).toBe('elephant')
      if (difficulty === 'medium') {
        expect(choice!.reason).toContain('condition de victoire')
      }
    }
  })

  it('blocks an opponent’s immediate winning push at the hard level', () => {
    const state = stateWithPieces({
      3: { kind: 'animal', owner: 'elephant', facing: 'east' },
      4: { kind: 'rock' },
      8: { kind: 'animal', owner: 'rhino', facing: 'north' },
    })
    state.turn = 'rhino'

    const opponentTurn = { ...state, turn: 'elephant' as const }
    expect(getLegalActions(opponentTurn).some((action) => applyGameAction(opponentTurn, action).winner === 'elephant')).toBe(true)
    const choice = chooseBotAction(state, 'hard')
    expect(choice).not.toBeNull()
    const next = applyGameAction(state, choice!.action)
    expect(getLegalActions(next).some((action) => applyGameAction(next, action).winner === 'elephant')).toBe(false)
    expect(choice!.reason).toContain('menace de victoire immédiate')
  })

  it('keeps bot actions legal when a rock push is available', () => {
    const state = stateWithPieces({
      12: { kind: 'animal', owner: 'rhino', facing: 'east' },
      13: { kind: 'rock' },
    })
    state.turn = 'rhino'

    const push: GameAction = { type: 'move', from: 12, to: 13, facing: 'east' }
    expect(getLegalActions(state)).toContainEqual(push)
    expect(applyGameAction(state, push).board[14]).toEqual({ kind: 'rock' })

    const choice = chooseBotAction(state, 'hard')
    expect(choice).not.toBeNull()
    expect(getLegalActions(state)).toContainEqual(choice!.action)
  })

  it('allows a flank entry to prepare a lateral rock defense', () => {
    let state = createGame()
    const opening = [
      { type: 'enter', to: 2, facing: 'south' },
      { type: 'enter', to: 1, facing: 'east' },
      { type: 'enter', to: 2, facing: 'south' },
      { type: 'enter', to: 1, facing: 'south' },
      { type: 'enter', to: 2, facing: 'south' },
    ] as const
    for (const action of opening) state = applyGameAction(state, action)
    const flankEntry = getLegalActions(state).find(
      (action) =>
        action.type === 'enter' &&
        ((action.to === 23 && action.facing === 'west') ||
          (action.to === 21 && action.facing === 'east')),
    )
    expect(flankEntry).toBeDefined()
    const defended = applyGameAction(state, flankEntry!)
    const humanPush = getLegalActions(defended).find(
      (action) => action.type === 'move' && action.from === 12 && action.to === 17,
    )
    expect(humanPush).toBeDefined()
    const pushed = applyGameAction(defended, humanPush!)
    const botDefense = getLegalActions(pushed).find(
      (action) =>
        action.type === 'move' &&
        ((action.from === 23 && action.to === 22 && action.facing === 'west') ||
          (action.from === 21 && action.to === 22 && action.facing === 'east')),
    )
    expect(botDefense).toBeDefined()
    expect(applyGameAction(pushed, botDefense!).winner).toBeNull()
  })

  it('analyzes the reported attack over the full setup and defense sequence', () => {
    let state = createGame()
    const moves = [
      { type: 'enter', to: 2, facing: 'south' },
      { type: 'enter', to: 22, facing: 'north' },
      { type: 'enter', to: 2, facing: 'south' },
      { type: 'enter', to: 14, facing: 'west' },
      { type: 'enter', to: 2, facing: 'south' },
      { type: 'enter', to: 23, facing: 'west' },
      { type: 'enter', to: 23, facing: 'north' },
    ] as const
    for (const action of moves) state = applyGameAction(state, action)

    const botTurnEight = chooseBotAction(state, 'hard')
    expect(botTurnEight).not.toBeNull()
    state = applyGameAction(state, botTurnEight!.action)
    state = applyGameAction(state, { type: 'enter', to: 21, facing: 'north' })

    const botTurnTen = chooseBotAction(state, 'hard')
    expect(botTurnTen).not.toBeNull()
    state = applyGameAction(state, botTurnTen!.action)
    state = applyGameAction(state, { type: 'move', from: 2, to: 7, facing: 'south' })

    const botTurnTwelve = chooseBotAction(state, 'hard')
    expect(botTurnTwelve).not.toBeNull()
    state = applyGameAction(state, botTurnTwelve!.action)
    expect(
      getLegalActions(state).some((action) => applyGameAction(state, action).winner === 'elephant'),
    ).toBe(false)
  }, 30000)

  it('does not allow the elephant to win immediately in the latest reported replay', () => {
    let state = createGame()
    const playReplayAction = (action: GameAction): boolean => {
      const legalAction = getLegalActions(state).find(
        (candidate) => JSON.stringify(candidate) === JSON.stringify(action),
      )
      if (!legalAction) return false
      state = applyGameAction(state, legalAction)
      return true
    }
    const botTurn = (): void => {
      const choice = chooseBotAction(state, 'hard')
      expect(choice).not.toBeNull()
      state = applyGameAction(state, choice!.action)
      expect(
        getLegalActions(state).some((action) => applyGameAction(state, action).winner === 'elephant'),
      ).toBe(false)
    }

    expect(playReplayAction({ type: 'enter', to: 2, facing: 'south' })).toBe(true)
    botTurn()
    expect(playReplayAction({ type: 'enter', to: 2, facing: 'south' })).toBe(true)
    botTurn()
    expect(playReplayAction({ type: 'enter', to: 2, facing: 'south' })).toBe(true)
    botTurn()

    const seventhMoveWasLegal = playReplayAction({ type: 'move', from: 2, to: 7, facing: 'south' })
    if (seventhMoveWasLegal) {
      botTurn()
      const ninthMoveWasLegal = playReplayAction({ type: 'move', from: 17, to: 22, facing: 'south' })
      expect(ninthMoveWasLegal && state.winner === 'elephant').toBe(false)
    }
  }, 60000)

  it('checks the suggested D4 defense against the latest replay attack', () => {
    let state = createGame()
    const replay = [
      { type: 'enter', to: 2, facing: 'south' },
      { type: 'enter', to: 1, facing: 'east' },
      { type: 'enter', to: 2, facing: 'south' },
      { type: 'enter', to: 23, facing: 'west' },
      { type: 'enter', to: 2, facing: 'south' },
      { type: 'enter', to: 14, facing: 'west' },
      { type: 'enter', to: 23, facing: 'north' },
    ] as const
    for (const action of replay) state = applyGameAction(state, action)

    const suggestedMove = { type: 'move', from: 18, to: 17, facing: 'west' } as const
    expect(getLegalActions(state)).toContainEqual(suggestedMove)
    const countForcedElephantWins = (position: GameState): number =>
      getLegalActions(position).filter((elephantAction) => {
        const afterElephant = applyGameAction(position, elephantAction)
        if (afterElephant.winner === 'elephant') return true
        return !getLegalActions(afterElephant).some((rhinoAction) => {
          const afterRhino = applyGameAction(afterElephant, rhinoAction)
          return afterRhino.winner === 'rhino' ||
            !getLegalActions(afterRhino).some(
              (reply) => applyGameAction(afterRhino, reply).winner === 'elephant',
            )
        })
      }).length
    const afterSuggestedMove = applyGameAction(state, suggestedMove)
    const botOpeningMove = { type: 'enter', to: 1, facing: 'south' } as const
    const previousThreatCount = countForcedElephantWins(applyGameAction(state, botOpeningMove))
    expect(countForcedElephantWins(afterSuggestedMove)).toBeLessThan(previousThreatCount)

    const botChoice = chooseBotAction(state, 'hard')
    expect(botChoice).not.toBeNull()
    const afterBotMove = applyGameAction(state, botChoice!.action)
    expect(getLegalActions(afterBotMove).some(
      (action) => applyGameAction(afterBotMove, action).winner === 'elephant',
    )).toBe(false)
  }, 30000)

  it('rejects the lateral pushes shown in the two recent replays', () => {
    let state = createGame()
    const opening: GameAction[] = [
      { type: 'enter', to: 2, facing: 'south' },
      { type: 'enter', to: 1, facing: 'east' },
      { type: 'enter', to: 2, facing: 'south' },
      { type: 'enter', to: 23, facing: 'west' },
      { type: 'enter', to: 2, facing: 'south' },
    ]
    for (const action of opening) {
      expect(getLegalActions(state)).toContainEqual(action)
      state = applyGameAction(state, action)
    }

    const a3Entry: GameAction = { type: 'enter', to: 10, facing: 'east' }
    expect(getLegalActions(state)).toContainEqual(a3Entry)
    const firstReplayPosition = applyGameAction(state, a3Entry)
    const eastPush: GameAction = { type: 'move', from: 12, to: 13, facing: 'east' }
    expect(firstReplayPosition.board[12]).toEqual({
      kind: 'animal',
      owner: 'elephant',
      facing: 'south',
    })
    expect(getLegalActions(firstReplayPosition)).not.toContainEqual(eastPush)
    expect(() => applyGameAction(firstReplayPosition, eastPush)).toThrow('regarder dans le sens')

    const d3Entry: GameAction = { type: 'enter', to: 14, facing: 'west' }
    expect(getLegalActions(state)).toContainEqual(d3Entry)
    const secondReplayPosition = applyGameAction(state, d3Entry)
    const westPush: GameAction = { type: 'move', from: 12, to: 11, facing: 'west' }
    expect(getLegalActions(secondReplayPosition)).not.toContainEqual(westPush)
    expect(() => applyGameAction(secondReplayPosition, westPush)).toThrow('regarder dans le sens')
  })

  it('does not repeat the losing turn-twelve push from the latest replay', () => {
    let state = createGame()
    const replay: GameAction[] = [
      { type: 'enter', to: 2, facing: 'south' },
      { type: 'enter', to: 1, facing: 'east' },
      { type: 'enter', to: 2, facing: 'south' },
      { type: 'enter', to: 23, facing: 'west' },
      { type: 'enter', to: 23, facing: 'north' },
      { type: 'enter', to: 21, facing: 'east' },
      { type: 'move', from: 2, to: 7, facing: 'south' },
      { type: 'enter', to: 4, facing: 'west' },
      { type: 'move', from: 23, to: 18, facing: 'north' },
      { type: 'move', from: 13, to: 12, facing: 'west' },
      { type: 'rotate', at: 11, facing: 'west' },
      { type: 'move', from: 12, to: 11, facing: 'west' },
    ]
    for (let index = 0; index < 9; index += 1) {
      const action = replay[index]
      expect(getLegalActions(state)).toContainEqual(action)
      state = applyGameAction(state, action)
    }

    expect(state.turn).toBe('rhino')
    expect(state.board[13]).toEqual({ kind: 'animal', owner: 'rhino', facing: 'west' })
    const turnTen = replay[9]
    expect(getLegalActions(state)).toContainEqual(turnTen)
    const turnTenChoice = chooseBotAction(state, 'hard')
    expect(turnTenChoice).not.toBeNull()
    expect(getLegalActions(state)).toContainEqual(turnTenChoice!.action)
    state = applyGameAction(state, turnTen)
    const turnEleven = replay[10]
    expect(getLegalActions(state)).toContainEqual(turnEleven)
    state = applyGameAction(state, turnEleven)
    const turnTwelveChoice = chooseBotAction(state, 'hard')
    expect(turnTwelveChoice).not.toBeNull()
    expect(turnTwelveChoice!.action).not.toEqual(replay[11])
    expect(applyGameAction(state, turnTwelveChoice!.action).winner).not.toBe('elephant')
    const turnTwelve = replay[11]
    expect(getLegalActions(state)).toContainEqual(turnTwelve)
    expect(applyGameAction(state, turnTwelve).winner).toBe('elephant')
  }, 30000)

  it('prepares the B5 rhino to prevent the elephant from winning on the edge', () => {
    let state = createGame()
    const replay: GameAction[] = [
      { type: 'enter', to: 2, facing: 'south' },
      { type: 'enter', to: 1, facing: 'east' },
      { type: 'enter', to: 2, facing: 'south' },
      { type: 'enter', to: 23, facing: 'west' },
      { type: 'enter', to: 23, facing: 'north' },
      { type: 'enter', to: 21, facing: 'east' },
      { type: 'move', from: 2, to: 7, facing: 'south' },
      { type: 'enter', to: 4, facing: 'west' },
      { type: 'rotate', at: 23, facing: 'west' },
      { type: 'move', from: 18, to: 17, facing: 'west' },
      { type: 'move', from: 7, to: 12, facing: 'south' },
      { type: 'move', from: 1, to: 6, facing: 'north' },
      { type: 'rotate', at: 12, facing: 'east' },
      { type: 'enter', to: 14, facing: 'west' },
      { type: 'rotate', at: 17, facing: 'west' },
    ]
    for (const action of replay) {
      expect(getLegalActions(state)).toContainEqual(action)
      state = applyGameAction(state, action)
    }

    const directMove: GameAction = { type: 'move', from: 21, to: 20, facing: 'north' }
    expect(state.board[21]).toEqual({ kind: 'animal', owner: 'rhino', facing: 'east' })
    expect(state.board[20]).toBeNull()
    expect(getLegalActions(state)).toContainEqual(directMove)
    const attackPosition = { ...state, turn: 'elephant' as const }
    const edgePush = applyGameAction(attackPosition, { type: 'move', from: 17, to: 16, facing: 'west' })
    expect(
      getLegalActions({ ...edgePush, turn: 'elephant' }).some(
        (action) => applyGameAction({ ...edgePush, turn: 'elephant' }, action).winner === 'elephant',
      ),
    ).toBe(true)
    const choice = chooseBotAction(state, 'hard')
    expect(choice?.action).toEqual({ type: 'rotate', at: 21, facing: 'north' })

    const elephantAttack: GameAction = { type: 'move', from: 17, to: 16, facing: 'west' }
    let afterDefense = applyGameAction(state, choice!.action)
    expect(getLegalActions(afterDefense)).toContainEqual(elephantAttack)
    afterDefense = applyGameAction(afterDefense, elephantAttack)
    const dislodgeElephant: GameAction = { type: 'move', from: 21, to: 16, facing: 'north' }
    expect(getLegalActions(afterDefense)).toContainEqual(dislodgeElephant)
    afterDefense = applyGameAction(afterDefense, dislodgeElephant)
    expect(
      getLegalActions(afterDefense).some((action) => applyGameAction(afterDefense, action).winner === 'elephant'),
    ).toBe(false)

    let directDefense = applyGameAction(state, directMove)
    directDefense = applyGameAction(directDefense, elephantAttack)
    const redirectRock: GameAction = { type: 'move', from: 20, to: 15, facing: 'north' }
    expect(getLegalActions(directDefense)).toContainEqual(redirectRock)
    directDefense = applyGameAction(directDefense, redirectRock)
    expect(
      getLegalActions(directDefense).some((action) => applyGameAction(directDefense, action).winner === 'elephant'),
    ).toBe(false)

    let losingChoice = applyGameAction(state, { type: 'rotate', at: 21, facing: 'south' })
    losingChoice = applyGameAction(losingChoice, elephantAttack)
    expect(
      getLegalActions(losingChoice).some((defense) => {
        const afterDefense = applyGameAction(losingChoice, defense)
        return !getLegalActions(afterDefense).some(
          (action) => applyGameAction(afterDefense, action).winner === 'elephant',
        )
      }),
    ).toBe(false)
  }, 30000)

  it('anticipates the reported southward rock push before it reaches the edge', () => {
    let state = createGame()
    const replay: GameAction[] = [
      { type: 'enter', to: 2, facing: 'south' },
      { type: 'enter', to: 1, facing: 'east' },
      { type: 'enter', to: 2, facing: 'south' },
      { type: 'enter', to: 23, facing: 'west' },
      { type: 'move', from: 2, to: 7, facing: 'south' },
      { type: 'enter', to: 10, facing: 'east' },
      { type: 'rotate', at: 12, facing: 'east' },
      { type: 'enter', to: 14, facing: 'west' },
      { type: 'enter', to: 21, facing: 'east' },
    ]
    for (const action of replay) {
      expect(getLegalActions(state)).toContainEqual(action)
      state = applyGameAction(state, action)
    }

    const turnTenChoice = chooseBotAction(state, 'hard')
    expect(turnTenChoice).not.toBeNull()
    state = applyGameAction(state, turnTenChoice!.action)

    const elephantSetup: GameAction = { type: 'rotate', at: 12, facing: 'south' }
    expect(getLegalActions(state)).toContainEqual(elephantSetup)
    state = applyGameAction(state, elephantSetup)
    const turnTwelveChoice = chooseBotAction(state, 'hard')
    expect(turnTwelveChoice).not.toBeNull()
    state = applyGameAction(state, turnTwelveChoice!.action)

    const elephantPush: GameAction = { type: 'move', from: 7, to: 12, facing: 'south' }
    if (getLegalActions(state).some((action) => JSON.stringify(action) === JSON.stringify(elephantPush))) {
      state = applyGameAction(state, elephantPush)
      const turnFourteenChoice = chooseBotAction(state, 'hard')
      expect(turnFourteenChoice).not.toBeNull()
      state = applyGameAction(state, turnFourteenChoice!.action)
      expect(
        getLegalActions(state).some((action) => applyGameAction(state, action).winner === 'elephant'),
      ).toBe(false)
    }
  }, 30000)

  it('confirms the reported position has no safe reply after the rock reaches E3', () => {
    let state = createGame()
    const replay: GameAction[] = [
      { type: 'enter', to: 2, facing: 'south' },
      { type: 'enter', to: 1, facing: 'east' },
      { type: 'enter', to: 2, facing: 'south' },
      { type: 'enter', to: 23, facing: 'west' },
      { type: 'move', from: 2, to: 7, facing: 'south' },
      { type: 'enter', to: 10, facing: 'east' },
      { type: 'rotate', at: 12, facing: 'east' },
      { type: 'enter', to: 1, facing: 'south' },
      { type: 'move', from: 12, to: 13, facing: 'east' },
    ]
    for (const action of replay) {
      expect(getLegalActions(state)).toContainEqual(action)
      state = applyGameAction(state, action)
    }

    const winningPush: GameAction = { type: 'move', from: 13, to: 14, facing: 'east' }
    const elephantTurn = { ...state, turn: 'elephant' as const }
    expect(getLegalActions(elephantTurn)).toContainEqual(winningPush)
    expect(applyGameAction(elephantTurn, winningPush).winner).toBe('elephant')
    const safeReplies = getLegalActions(state).filter((action) => {
      const afterAction = applyGameAction(state, action)
      return !getLegalActions(afterAction).some(
        (reply) => applyGameAction(afterAction, reply).winner === 'elephant',
      )
    })
    expect(safeReplies).toHaveLength(0)
    expect(getLegalActions(state)).not.toContainEqual({ type: 'enter', to: 14, facing: 'west' })
  })

  it('occupies E3 before the elephant can push the rock out', () => {
    let state = createGame()
    const replay: GameAction[] = [
      { type: 'enter', to: 2, facing: 'south' },
      { type: 'enter', to: 1, facing: 'east' },
      { type: 'enter', to: 2, facing: 'south' },
      { type: 'enter', to: 23, facing: 'west' },
      { type: 'move', from: 2, to: 7, facing: 'south' },
      { type: 'enter', to: 10, facing: 'east' },
      { type: 'rotate', at: 12, facing: 'east' },
    ]
    for (const action of replay) {
      expect(getLegalActions(state)).toContainEqual(action)
      state = applyGameAction(state, action)
    }

    const defense: GameAction = { type: 'enter', to: 14, facing: 'west' }
    expect(getLegalActions(state)).toContainEqual(defense)
    const botChoice = chooseBotAction(state, 'hard')
    expect(botChoice?.action).toEqual(defense)
    const afterDefense = applyGameAction(state, botChoice!.action)
    const nextElephantAttack: GameAction = { type: 'move', from: 12, to: 13, facing: 'east' }
    expect(getLegalActions(afterDefense)).not.toContainEqual(nextElephantAttack)
  }, 30000)

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
