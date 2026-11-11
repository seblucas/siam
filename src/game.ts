export const BOARD_SIZE = 5
export const BOARD_CELLS = BOARD_SIZE * BOARD_SIZE
export const PIECES_PER_PLAYER = 5

export type Player = 'elephant' | 'rhino'
export type Direction = 'north' | 'east' | 'south' | 'west'
export type Piece = { kind: 'rock' } | { kind: 'animal'; owner: Player; facing: Direction }
export type VariantOptions = {
  openingSquares: boolean
  oneReturnPerPlayer: boolean
}

export type GameState = {
  board: Array<Piece | null>
  reserves: Record<Player, number>
  turnsTaken: Record<Player, number>
  returnsUsed: Record<Player, number>
  turn: Player
  winner: Player | null
  variants: VariantOptions
  log: string[]
}

export const DIRECTIONS: Direction[] = ['north', 'east', 'south', 'west']

export const DIRECTION_DELTAS: Record<Direction, { row: number; col: number }> = {
  north: { row: -1, col: 0 },
  east: { row: 0, col: 1 },
  south: { row: 1, col: 0 },
  west: { row: 0, col: -1 },
}

export const DIRECTION_ARROWS: Record<Direction, string> = {
  north: '↑',
  east: '→',
  south: '↓',
  west: '←',
}

export const PLAYER_NAMES: Record<Player, string> = {
  elephant: 'Éléphants',
  rhino: 'Rhinocéros',
}

export function opponentOf(player: Player): Player {
  return player === 'elephant' ? 'rhino' : 'elephant'
}

export function createGame(variants: VariantOptions = {
  openingSquares: false,
  oneReturnPerPlayer: false,
}): GameState {
  const board: Array<Piece | null> = Array(BOARD_CELLS).fill(null)
  for (const col of [1, 2, 3]) board[2 * BOARD_SIZE + col] = { kind: 'rock' }

  return {
    board,
    reserves: { elephant: PIECES_PER_PLAYER, rhino: PIECES_PER_PLAYER },
    turnsTaken: { elephant: 0, rhino: 0 },
    returnsUsed: { elephant: 0, rhino: 0 },
    turn: 'elephant',
    winner: null,
    variants: { ...variants },
    log: ['La partie commence. Les Éléphants jouent en premier.'],
  }
}

export function coordinates(index: number): { row: number; col: number } {
  return { row: Math.floor(index / BOARD_SIZE), col: index % BOARD_SIZE }
}

export function indexAt(row: number, col: number): number | null {
  if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return null
  return row * BOARD_SIZE + col
}

export function isEdge(index: number): boolean {
  const { row, col } = coordinates(index)
  return row === 0 || row === BOARD_SIZE - 1 || col === 0 || col === BOARD_SIZE - 1
}

export function isOpeningSquare(index: number): boolean {
  const { row, col } = coordinates(index)
  return col === 2 && (row === 0 || row === BOARD_SIZE - 1)
}

function assertCanPlay(state: GameState): Player {
  if (state.winner) throw new Error('La partie est terminée. Lancez une nouvelle partie.')
  return state.turn
}

function assertOpeningAllowed(state: GameState, player: Player, destination: number): void {
  if (
    state.variants.openingSquares &&
    state.turnsTaken[player] < 2 &&
    isOpeningSquare(destination)
  ) {
    throw new Error('Pendant vos deux premiers tours, cette case est interdite.')
  }
}

function finishTurn(state: GameState, player: Player, message: string): GameState {
  const next = {
    ...state,
    reserves: { ...state.reserves },
    turnsTaken: { ...state.turnsTaken, [player]: state.turnsTaken[player] + 1 },
    returnsUsed: { ...state.returnsUsed },
    log: [message, ...state.log].slice(0, 12),
  }
  if (!next.winner) next.turn = opponentOf(player)
  return next
}

function step(index: number, direction: Direction): number | null {
  const { row, col } = coordinates(index)
  const delta = DIRECTION_DELTAS[direction]
  return indexAt(row + delta.row, col + delta.col)
}

function inwardDirection(index: number): Direction {
  const { row, col } = coordinates(index)
  if (row === 0) return 'south'
  if (row === BOARD_SIZE - 1) return 'north'
  if (col === 0) return 'east'
  return 'west'
}

function pushChain(
  state: GameState,
  player: Player,
  firstIndex: number,
  direction: Direction,
  initiatorFacing: Direction,
): { board: Array<Piece | null>; reserves: Record<Player, number>; winner: Player | null } {
  const chain: number[] = []
  let cursor: number | null = firstIndex
  while (cursor !== null && state.board[cursor] !== null) {
    chain.push(cursor)
    cursor = step(cursor, direction)
  }

  const delta = DIRECTION_DELTAS[direction]
  const animals = chain
    .map((index) => state.board[index])
    .filter((piece): piece is Extract<Piece, { kind: 'animal' }> => piece?.kind === 'animal')
  const force =
    (initiatorFacing === direction ? 1 : 0) +
    animals.filter((animal) => animal.facing === direction).length -
    animals.filter((animal) => animal.facing === oppositeDirection(direction)).length
  const rockCount = chain.filter((index) => state.board[index]?.kind === 'rock').length

  if (force < Math.max(1, rockCount)) {
    throw new Error('Poussée impossible : les forces en présence ne sont pas suffisantes.')
  }

  const board = [...state.board]
  const reserves = { ...state.reserves }
  let winner: Player | null = null

  for (const index of chain) board[index] = null
  for (const index of chain) {
    const piece = state.board[index]
    if (!piece) continue
    const destination = indexAt(
      coordinates(index).row + delta.row,
      coordinates(index).col + delta.col,
    )
    if (destination === null) {
      if (piece.kind === 'rock') {
        const rockPosition = chain.indexOf(index)
        const nearestPusher = [...chain.slice(0, rockPosition)].reverse()
          .map((pusherIndex) => state.board[pusherIndex])
          .find((pusher) => pusher?.kind === 'animal' && pusher.facing === direction)
        winner = nearestPusher?.kind === 'animal' ? nearestPusher.owner : player
      } else {
        reserves[piece.owner] += 1
      }
    } else {
      board[destination] = piece
    }
  }

  return { board, reserves, winner }
}

function oppositeDirection(direction: Direction): Direction {
  return DIRECTIONS[(DIRECTIONS.indexOf(direction) + 2) % DIRECTIONS.length]
}

export function moveAnimal(
  state: GameState,
  from: number,
  to: number,
  newFacing: Direction,
): GameState {
  const player = assertCanPlay(state)
  const animal = state.board[from]
  if (!animal || animal.kind !== 'animal' || animal.owner !== player) {
    throw new Error('Sélectionnez un de vos animaux.')
  }
  const fromCoordinates = coordinates(from)
  const toCoordinates = coordinates(to)
  const rowDistance = toCoordinates.row - fromCoordinates.row
  const colDistance = toCoordinates.col - fromCoordinates.col
  if (Math.abs(rowDistance) + Math.abs(colDistance) !== 1) {
    throw new Error('Un animal se déplace d’une seule case, sans diagonale.')
  }
  assertOpeningAllowed(state, player, to)

  const direction: Direction =
    rowDistance === -1 ? 'north' :
      rowDistance === 1 ? 'south' :
        colDistance === 1 ? 'east' : 'west'
  const target = state.board[to]
  let board: Array<Piece | null>
  let reserves = { ...state.reserves }
  let winner: Player | null = null

  if (target) {
    if (newFacing !== direction) {
      throw new Error('Pour pousser, votre animal doit regarder dans le sens du déplacement.')
    }
    const pushed = pushChain(state, player, to, direction, newFacing)
    board = pushed.board
    reserves = pushed.reserves
    winner = pushed.winner
  } else {
    board = [...state.board]
  }

  board[from] = null
  board[to] = { ...animal, facing: newFacing }
  const next = finishTurn(
    { ...state, board, reserves, winner },
    player,
    `${PLAYER_NAMES[player]} avancent d’une case.`,
  )
  return next
}

export function enterAnimal(
  state: GameState,
  destination: number,
  facing: Direction,
): GameState {
  const player = assertCanPlay(state)
  if (!isEdge(destination)) throw new Error('Un animal doit entrer par une case du bord.')
  if (state.reserves[player] === 0) throw new Error('Vous n’avez plus d’animal en réserve.')
  assertOpeningAllowed(state, player, destination)

  const target = state.board[destination]
  let board: Array<Piece | null>
  let reserves = { ...state.reserves, [player]: state.reserves[player] - 1 }
  let winner: Player | null = null

  if (target) {
    const inward = inwardDirection(destination)
    if (facing !== inward) {
      throw new Error('Pour entrer en poussant, orientez votre animal vers l’intérieur du plateau.')
    }
    const stateWithReserveUsed = {
      ...state,
      reserves: { ...state.reserves, [player]: state.reserves[player] - 1 },
    }
    const pushed = pushChain(stateWithReserveUsed, player, destination, inward, facing)
    board = pushed.board
    reserves = pushed.reserves
    winner = pushed.winner
  } else {
    board = [...state.board]
  }

  board[destination] = { kind: 'animal', owner: player, facing }
  const next = finishTurn(
    { ...state, board, reserves, winner },
    player,
    `${PLAYER_NAMES[player]} entrent sur le plateau.`,
  )
  return next
}

export function rotateAnimal(
  state: GameState,
  index: number,
  facing: Direction,
): GameState {
  const player = assertCanPlay(state)
  const animal = state.board[index]
  if (!animal || animal.kind !== 'animal' || animal.owner !== player) {
    throw new Error('Sélectionnez un de vos animaux.')
  }
  if (animal.facing === facing) throw new Error('Cet animal regarde déjà dans cette direction.')
  const board = [...state.board]
  board[index] = { ...animal, facing }
  return finishTurn(
    { ...state, board },
    player,
    `${PLAYER_NAMES[player]} changent l’orientation d’un animal.`,
  )
}

export function returnAnimal(state: GameState, index: number): GameState {
  const player = assertCanPlay(state)
  const animal = state.board[index]
  if (!animal || animal.kind !== 'animal' || animal.owner !== player) {
    throw new Error('Sélectionnez un de vos animaux.')
  }
  if (!isEdge(index)) throw new Error('Seul un animal placé sur le bord peut quitter le plateau.')
  if (state.variants.oneReturnPerPlayer && state.returnsUsed[player] > 0) {
    throw new Error('La variante autorise une seule sortie par joueur.')
  }

  const board = [...state.board]
  board[index] = null
  const next = finishTurn(
    { ...state, board, reserves: { ...state.reserves, [player]: state.reserves[player] + 1 } },
    player,
    `${PLAYER_NAMES[player]} récupèrent un animal en réserve.`,
  )
  next.returnsUsed[player] += 1
  return next
}
