import {
  BOARD_CELLS,
  BOARD_SIZE,
  DIRECTIONS,
  DIRECTION_DELTAS,
  applyGameAction,
  coordinates,
  getLegalActions,
  isEdge,
  inwardDirections,
  type Direction,
  type GameAction,
  type GameState,
  type Player,
} from './game'

export type BotDifficulty = 'easy' | 'medium' | 'hard'
export type BotChoice = { action: GameAction; reason: string }

const WIN_SCORE = 100_000

function other(player: Player): Player {
  return player === 'elephant' ? 'rhino' : 'elephant'
}

function nextIndex(index: number, direction: Direction): number | null {
  const { row, col } = coordinates(index)
  const delta = DIRECTION_DELTAS[direction]
  const nextRow = row + delta.row
  const nextCol = col + delta.col
  if (nextRow < 0 || nextRow >= BOARD_SIZE || nextCol < 0 || nextCol >= BOARD_SIZE) {
    return null
  }
  return nextRow * BOARD_SIZE + nextCol
}

function distanceToEdge(index: number): number {
  const { row, col } = coordinates(index)
  return Math.min(row, col, BOARD_SIZE - 1 - row, BOARD_SIZE - 1 - col)
}

function pushPotential(state: GameState, player: Player): number {
  let best = 0
  const considerPush = (start: number, direction: Direction, initiator: Player): void => {
    const chain: number[] = []
    let cursor: number | null = start
    let force = 1
    while (cursor !== null && state.board[cursor] !== null) {
      chain.push(cursor)
      const piece = state.board[cursor]
      if (piece?.kind === 'animal') {
        if (piece.facing === direction) force += 1
        if (piece.facing === DIRECTIONS[(DIRECTIONS.indexOf(direction) + 2) % DIRECTIONS.length]) force -= 1
      }
      cursor = nextIndex(cursor, direction)
    }

    const rocks = chain.filter((index) => state.board[index]?.kind === 'rock')
    if (rocks.length === 0 || force < Math.max(1, rocks.length)) return

    let value = 0
    for (const rock of rocks) {
      let nearestPusher = initiator
      for (const index of chain) {
        if (index === rock) break
        const piece = state.board[index]
        if (piece?.kind === 'animal' && piece.facing === direction) nearestPusher = piece.owner
      }
      const next = nextIndex(rock, direction)
      const progress = next === null
        ? 3 - (BOARD_SIZE - 1 - distanceToEdge(rock))
        : distanceToEdge(rock) - distanceToEdge(next)
      if (nearestPusher === player) value += Math.max(0, progress) * 5 + 1
      else value -= Math.max(0, progress) * 5 + 1
    }
    best = Math.max(best, value)
  }

  for (let index = 0; index < BOARD_CELLS; index += 1) {
    const piece = state.board[index]
    if (piece?.kind !== 'animal' || piece.owner !== player) continue
    for (const direction of DIRECTIONS) {
      const target = nextIndex(index, direction)
      if (target !== null && state.board[target] !== null) considerPush(target, direction, player)
    }
  }

  if (state.reserves[player] > 0) {
    for (let index = 0; index < BOARD_CELLS; index += 1) {
      const row = Math.floor(index / BOARD_SIZE)
      const col = index % BOARD_SIZE
      if (row !== 0 && row !== BOARD_SIZE - 1 && col !== 0 && col !== BOARD_SIZE - 1) continue
      if (state.variants.openingSquares && state.turnsTaken[player] < 2 && col === 2 && (row === 0 || row === BOARD_SIZE - 1)) continue
      if (state.board[index] === null) continue
      for (const inward of inwardDirections(index)) {
        considerPush(index, inward, player)
      }
    }
  }
  return best
}

function evaluate(state: GameState, perspective: Player): number {
  if (state.winner) return state.winner === perspective ? WIN_SCORE : -WIN_SCORE

  let score = 0
  const sign = (player: Player) => player === perspective ? 1 : -1
  const rocks: number[] = []
  for (let index = 0; index < BOARD_CELLS; index += 1) {
    if (state.board[index]?.kind === 'rock') rocks.push(index)
  }

  for (const rock of rocks) {
    score += (BOARD_SIZE - 1 - distanceToEdge(rock)) * 1.5
  }

  const opponent = other(perspective)
  const ownPushes = pushPotential(state, perspective)
  const opponentPushes = pushPotential(state, opponent)
  score += ownPushes * (state.turn === perspective ? 1.25 : 0.65)
  score -= opponentPushes * (state.turn === opponent ? 1.4 : 0.7)

  for (let index = 0; index < BOARD_CELLS; index += 1) {
    const piece = state.board[index]
    if (piece?.kind !== 'animal') continue
    const playerSign = sign(piece.owner)
    const nearestRockDistance = rocks.reduce(
      (nearest, rock) => {
        const a = coordinates(index)
        const b = coordinates(rock)
        return Math.min(nearest, Math.abs(a.row - b.row) + Math.abs(a.col - b.col))
      },
      BOARD_SIZE * 2,
    )
    score += playerSign * (2.5 - nearestRockDistance * 0.45)
  }

  score += (state.reserves[perspective] - state.reserves[other(perspective)]) * 0.35
  return score
}

function describeReason(
  before: GameState,
  action: GameAction,
  after: GameState,
  player: Player,
): string {
  if (after.winner === player) return 'Je pousse un rocher hors du plateau : c’est la condition de victoire.'

  const cell = (index: number) => `${String.fromCharCode(65 + (index % BOARD_SIZE))}${Math.floor(index / BOARD_SIZE) + 1}`
  const directions: Record<Direction, string> = {
    north: 'nord',
    east: 'l’est',
    south: 'sud',
    west: 'l’ouest',
  }

  const beforeRockProgress = before.board.reduce(
    (total, piece, index) => total + (piece?.kind === 'rock' ? BOARD_SIZE - 1 - distanceToEdge(index) : 0),
    0,
  )
  const afterRockProgress = after.board.reduce(
    (total, piece, index) => total + (piece?.kind === 'rock' ? BOARD_SIZE - 1 - distanceToEdge(index) : 0),
    0,
  )
  const progress = afterRockProgress - beforeRockProgress

  if (progress > 0) {
    return 'Je pousse les rochers vers le bord : une montagne plus proche de la sortie est plus facile à expulser.'
  }

  if (action.type === 'enter') {
    return `Je fais entrer un animal en ${cell(action.to)}, orienté vers ${directions[action.facing]}, pour renforcer ma présence près des rochers.`
  }
  if (action.type === 'rotate') {
    return `Je réoriente l’animal en ${cell(action.at)} vers ${directions[action.facing]} pour modifier l’équilibre des forces sur une future poussée.`
  }
  if (action.type === 'return') {
    return `Je récupère l’animal en ${cell(action.at)} : il retourne en réserve et pourra entrer à un endroit plus utile.`
  }

  const targetPiece = before.board[action.to]
  if (targetPiece?.kind === 'rock') {
    return `Je pousse le rocher de ${cell(action.to)} vers ${directions[action.facing]} pour le rapprocher d’une sortie.`
  }
  if (targetPiece?.kind === 'animal' && targetPiece.owner !== player) {
    return 'Je conteste la position adverse et modifie l’alignement des forces autour des rochers.'
  }
  return `Je déplace un animal de ${cell(action.from)} vers ${cell(action.to)} pour mieux soutenir une poussée lors des prochains tours.`
}

function entersBesideRock(state: GameState, action: GameAction): boolean {
  if (action.type !== 'enter') return false
  const forward = nextIndex(action.to, action.facing)
  return forward !== null && state.board[forward]?.kind === 'rock'
}

function rankActions(
  state: GameState,
  limit: number,
): Array<{ action: GameAction; state: GameState; score: number }> {
  const ranked = getLegalActions(state).map((action) => {
    const next = applyGameAction(state, action)
    return { action, state: next, score: evaluate(next, state.turn) }
  })
  ranked.sort((a, b) => b.score - a.score)
  const tactical = ranked.filter(({ action, state: next }) =>
    next.winner !== null ||
    (action.type === 'move' && state.board[action.to] !== null) ||
    (action.type === 'enter' && state.board[action.to] !== null) ||
    (action.type === 'enter' && entersBesideRock(state, action)),
  )
  return [...new Set([...ranked.slice(0, limit), ...tactical])]
}

type TranspositionEntry = {
  depth: number
  score: number
  bound: 'exact' | 'lower' | 'upper'
}

function stateKey(state: GameState): string {
  const board = state.board.map((piece) => {
    if (piece?.kind === 'rock') return 'r'
    if (piece?.kind === 'animal') {
      return `${piece.owner === 'elephant' ? 'e' : 'h'}${DIRECTIONS.indexOf(piece.facing)}`
    }
    return '.'
  }).join('')
  return [
    board,
    state.turn,
    state.reserves.elephant,
    state.reserves.rhino,
    state.turnsTaken.elephant,
    state.turnsTaken.rhino,
    state.returnsUsed.elephant,
    state.returnsUsed.rhino,
    Number(state.variants.openingSquares),
    Number(state.variants.oneReturnPerPlayer),
  ].join(':')
}

function minimax(
  state: GameState,
  depth: number,
  perspective: Player,
  alpha: number,
  beta: number,
  branchLimit: number,
  transpositions: Map<string, TranspositionEntry>,
): number {
  if (depth === 0 || state.winner) return evaluate(state, perspective)

  const originalAlpha = alpha
  const originalBeta = beta
  const key = `${stateKey(state)}:${depth}:${perspective}`
  const entry = transpositions.get(key)
  if (entry) {
    if (entry.bound === 'exact') return entry.score
    if (entry.bound === 'lower') alpha = Math.max(alpha, entry.score)
    else beta = Math.min(beta, entry.score)
    if (alpha >= beta) return entry.score
  }

  const maximizing = state.turn === perspective
  const candidates = rankActions(state, branchLimit)
  if (candidates.length === 0) return evaluate(state, perspective)

  let best: number
  if (maximizing) {
    best = -Infinity
    for (const candidate of candidates) {
      best = Math.max(best, minimax(
        candidate.state, depth - 1, perspective, alpha, beta, branchLimit, transpositions,
      ))
      alpha = Math.max(alpha, best)
      if (beta <= alpha) break
    }
  } else {
    best = Infinity
    for (const candidate of candidates) {
      best = Math.min(best, minimax(
        candidate.state, depth - 1, perspective, alpha, beta, branchLimit, transpositions,
      ))
      beta = Math.min(beta, best)
      if (beta <= alpha) break
    }
  }

  const bound = best <= originalAlpha ? 'upper' : best >= originalBeta ? 'lower' : 'exact'
  transpositions.set(key, { depth, score: best, bound })
  return best
}

function hasImmediateWin(state: GameState, player: Player): boolean {
  if (state.turn !== player || state.winner) return false
  return getLegalActions(state).some((action) => applyGameAction(state, action).winner === player)
}

function forcedWinThreatCount(state: GameState, player: Player): number {
  if (state.turn !== player || state.winner) return 0
  const defender = other(player)
  return getLegalActions(state).filter((action) => {
    const afterAttack = applyGameAction(state, action)
    if (afterAttack.winner === player) return true
    if (afterAttack.winner) return false

    return !getLegalActions(afterAttack).some((defense) => {
      const afterDefense = applyGameAction(afterAttack, defense)
      return afterDefense.winner === defender || !hasImmediateWin(afterDefense, player)
    })
  }).length
}

function findEdgePushDefense(state: GameState, player: Player): GameAction | null {
  const opponent = other(player)
  const opponentTurn = { ...state, turn: opponent }
  const legalEntries = getLegalActions(state).filter(
    (action): action is Extract<GameAction, { type: 'enter' }> => action.type === 'enter',
  )
  if (legalEntries.length === 0) return null
  const threats: Array<{ action: GameAction; landing: number }> = []

  for (const attack of getLegalActions(opponentTurn)) {
    if (attack.type !== 'move') continue
    let cursor: number | null = attack.to
    const edgeLandings: number[] = []
    while (cursor !== null && state.board[cursor] !== null) {
      if (state.board[cursor]?.kind === 'rock') {
        const landing = nextIndex(cursor, attack.facing)
        if (landing !== null && isEdge(landing)) edgeLandings.push(landing)
      }
      cursor = nextIndex(cursor, attack.facing)
    }
    if (edgeLandings.length === 0) continue

    const afterAttack = applyGameAction(opponentTurn, attack)
    if (afterAttack.winner) continue
    if (!edgeLandings.some((landing) => afterAttack.board[landing]?.kind === 'rock')) continue
    const hasSafeDefense = getLegalActions(afterAttack).some((defense) => {
      const afterDefense = applyGameAction(afterAttack, defense)
      return afterDefense.winner === player || !hasImmediateWin(afterDefense, opponent)
    })
    if (hasSafeDefense) continue

    for (const landing of edgeLandings) {
      const facing = DIRECTIONS[(DIRECTIONS.indexOf(attack.facing) + 2) % DIRECTIONS.length]
      const entry = legalEntries.find((action) => action.to === landing && action.facing === facing)
      if (!entry) continue
      const afterEntry = applyGameAction(state, entry)
      if (afterEntry.winner === opponent) continue
      const opponentCanStillAttack = getLegalActions(afterEntry).some(
        (action) => JSON.stringify(action) === JSON.stringify(attack),
      )
      if (!opponentCanStillAttack && !hasImmediateWin(afterEntry, opponent)) {
        threats.push({ action: entry, landing })
      }
    }
  }

  threats.sort((a, b) => a.landing - b.landing)
  return threats[0]?.action ?? null
}

function findPreemptiveEdgePushDefense(state: GameState, player: Player): GameAction | null {
  const opponent = other(player)
  const opponentTurn = { ...state, turn: opponent }
  const hasNextTurnEdgeThreat = getLegalActions(opponentTurn).some((attack) => {
    const afterAttack = applyGameAction(opponentTurn, attack)
    return !afterAttack.winner &&
      hasImmediateWin({ ...afterAttack, turn: opponent }, opponent)
  })
  if (!hasNextTurnEdgeThreat) return null

  const safeActions = getLegalActions(state).filter((action) => {
    const afterAction = applyGameAction(state, action)
    if (afterAction.winner === opponent || hasImmediateWin(afterAction, opponent)) return false

    return getLegalActions(afterAction).every((attack) => {
      const afterAttack = applyGameAction(afterAction, attack)
      if (afterAttack.winner === opponent) return false
      if (!hasImmediateWin({ ...afterAttack, turn: opponent }, opponent)) return true

      return getLegalActions(afterAttack).some((defense) => {
        const afterDefense = applyGameAction(afterAttack, defense)
        return afterDefense.winner !== opponent && !hasImmediateWin(afterDefense, opponent)
      })
    })
  })

  const occupiedEdgeEntries = safeActions.filter(
    (action) => {
      if (action.type !== 'enter') return false
      const piece = state.board[action.to]
      return piece?.kind === 'animal' && piece.owner === opponent
    },
  )
  const candidates = occupiedEdgeEntries.length > 0 ? occupiedEdgeEntries : safeActions

  return candidates
    .map((action) => ({ action, score: evaluate(applyGameAction(state, action), player) }))
    .sort((a, b) => b.score - a.score)[0]?.action ?? null
}

function findFlankDefenseEntry(state: GameState, player: Player): GameAction | null {
  const opponent = other(player)
  const legalEntries = getLegalActions(state).filter(
    (action): action is Extract<GameAction, { type: 'enter' }> => action.type === 'enter',
  )
  const candidates: Array<{ action: GameAction; force: number }> = []

  for (let index = 0; index < BOARD_CELLS; index += 1) {
    const piece = state.board[index]
    if (piece?.kind !== 'animal' || piece.owner !== opponent) continue

    const direction = piece.facing
    const chain: number[] = []
    let cursor = nextIndex(index, direction)
    let force = 1
    while (cursor !== null && state.board[cursor] !== null) {
      chain.push(cursor)
      const pushed = state.board[cursor]
      if (pushed?.kind === 'animal') {
        if (pushed.facing === direction) force += 1
        if (pushed.facing === DIRECTIONS[(DIRECTIONS.indexOf(direction) + 2) % DIRECTIONS.length]) force -= 1
      }
      cursor = nextIndex(cursor, direction)
    }

    const rocks = chain.filter((cell) => state.board[cell]?.kind === 'rock')
    if (rocks.length === 0 || force < Math.max(1, rocks.length)) continue

    const perpendicular: Direction[] =
      direction === 'north' || direction === 'south' ? ['east', 'west'] : ['north', 'south']
    for (const rock of rocks) {
      let edgeTarget = rock
      let next = nextIndex(edgeTarget, direction)
      while (next !== null) {
        edgeTarget = next
        next = nextIndex(edgeTarget, direction)
      }

      for (const sideDirection of perpendicular) {
        const side = nextIndex(edgeTarget, sideDirection)
        if (side === null || !isEdge(side) || state.board[side] !== null) continue
        const oppositeSide = nextIndex(
          edgeTarget,
          DIRECTIONS[(DIRECTIONS.indexOf(sideDirection) + 2) % DIRECTIONS.length],
        )
        const oppositeDefender = oppositeSide === null ? null : state.board[oppositeSide]
        if (oppositeDefender?.kind === 'animal' && oppositeDefender.owner === player) continue
        const facing = DIRECTIONS[(DIRECTIONS.indexOf(sideDirection) + 2) % DIRECTIONS.length]
        const entry = legalEntries.find(
          (action) => action.to === side && action.facing === facing,
        )
        if (entry) {
          const afterEntry = applyGameAction(state, entry)
          if (afterEntry.winner !== opponent && !hasImmediateWin(afterEntry, opponent)) {
            candidates.push({ action: entry, force })
          }
        }
      }
    }
  }

  candidates.sort((a, b) => b.force - a.force)
  return candidates[0]?.action ?? null
}

export function chooseBotAction(
  state: GameState,
  difficulty: BotDifficulty,
  random: () => number = Math.random,
): BotChoice | null {
  if (state.winner) return null
  const player = state.turn
  const actions = getLegalActions(state)
  if (actions.length === 0) return null

  const ranked = actions.map((action) => {
    const next = applyGameAction(state, action)
    return { action, state: next, score: evaluate(next, player) }
  }).sort((a, b) => b.score - a.score)

  const immediateWin = ranked.find(({ state: next }) => next.winner === player)
  if (immediateWin) {
    return {
      action: immediateWin.action,
      reason: 'Je pousse un rocher hors du plateau : c’est la condition de victoire.',
    }
  }

  const opponent = other(player)
  const isUnderImmediateThreat = ranked.some(({ state: next }) => hasImmediateWin(next, opponent))
  const nonLosingMoves = ranked.filter(({ state: next }) => next.winner !== opponent)
  const safeAgainstImmediateWin = isUnderImmediateThreat
    ? nonLosingMoves.filter(({ state: next }) => !hasImmediateWin(next, opponent))
    : nonLosingMoves
  const searchRanked = safeAgainstImmediateWin.length > 0
    ? safeAgainstImmediateWin
    : nonLosingMoves.length > 0 ? nonLosingMoves : ranked
  const edgeDefense = difficulty === 'hard' ? findEdgePushDefense(state, player) : null
  if (edgeDefense) {
    const afterEntry = applyGameAction(state, edgeDefense)
    const isSweptAlongWithTheRock = edgeDefense.type === 'enter' &&
      getLegalActions(afterEntry).some((setup) => {
        if (setup.type !== 'rotate') return false
        const afterSetup = applyGameAction(afterEntry, setup)
        return getLegalActions(afterSetup).some((response) => {
          const afterResponse = applyGameAction(afterSetup, response)
          const defendedAnimal = afterSetup.board[edgeDefense.to]
          const animalAfterResponse = afterResponse.board[edgeDefense.to]
          if (
            defendedAnimal?.kind !== 'animal' ||
            animalAfterResponse?.kind !== 'animal' ||
            animalAfterResponse.owner !== player ||
            animalAfterResponse.facing !== defendedAnimal.facing
          ) return false
          return getLegalActions(afterResponse).some((attack) => {
            if (attack.type !== 'move') return false
            const defendedSquare = afterResponse.board[edgeDefense.to]
            if (defendedSquare?.kind !== 'animal' || defendedSquare.owner !== player) return false
            const afterAttack = applyGameAction(afterResponse, attack)
            const swept = afterAttack.board[edgeDefense.to]?.kind === 'rock' &&
              afterAttack.reserves[player] > afterResponse.reserves[player]
            return swept
          })
        })
      })
    if (!isSweptAlongWithTheRock) {
      return {
        action: edgeDefense,
        reason: 'Je protège le bord contre une poussée qui laisserait un rocher à portée de sortie.',
      }
    }
  }

  if (difficulty === 'hard' && !isUnderImmediateThreat) {
    const preemptiveEdgeDefense = findPreemptiveEdgePushDefense(state, player)
    if (preemptiveEdgeDefense) {
      const pushedPiece = preemptiveEdgeDefense.type === 'enter'
        ? state.board[preemptiveEdgeDefense.to]
        : null
      return {
        action: preemptiveEdgeDefense,
        reason: pushedPiece?.kind === 'animal' && pushedPiece.owner === opponent
          ? 'Je repousse l’animal adverse du bord et occupe sa case pour bloquer une poussée.'
          : 'Je prépare une défense contre le rocher que l’adversaire peut pousser vers le bord au prochain tour.',
      }
    }
  }

  if (difficulty === 'hard' && !isUnderImmediateThreat) {
    const flankDefense = findFlankDefenseEntry(state, player)
    if (flankDefense) {
      return {
        action: flankDefense,
        reason: 'Je prépare une poussée latérale pour dévier un rocher si l’adversaire le rapproche du bord.',
      }
    }
  }

  let selected = searchRanked[0]
  let reducesForcedThreats = false
  if (difficulty === 'easy') {
    const topScore = searchRanked[0].score
    const reasonableMoves = searchRanked.filter((candidate) => candidate.score >= topScore - 5).slice(0, 6)
    selected = reasonableMoves[Math.floor(random() * reasonableMoves.length)]
  } else {
    const depth = difficulty === 'medium' ? 2 : 6
    const branchLimit = difficulty === 'medium' ? 16 : 4
    let rootCandidates = difficulty === 'medium'
      ? searchRanked
      : isUnderImmediateThreat ? searchRanked : rankActions(state, 12)
    if (edgeDefense) {
      const edgeCandidate = rootCandidates.find(
        ({ action }) => JSON.stringify(action) === JSON.stringify(edgeDefense),
      ) ?? ranked.find(({ action }) => JSON.stringify(action) === JSON.stringify(edgeDefense))
      if (edgeCandidate && !rootCandidates.includes(edgeCandidate)) {
        rootCandidates = [...rootCandidates, edgeCandidate]
      }
    }
    const safeRootMoves = rootCandidates.filter(
      ({ state: next }) => next.winner !== opponent && !hasImmediateWin(next, opponent),
    )
    let rootMoves = safeRootMoves.length > 0
      ? safeRootMoves
      : difficulty === 'hard' ? searchRanked.slice(0, 12) : searchRanked
    if (difficulty === 'hard' && rootMoves.length > 1) {
      const scoredThreats = rootMoves.map((candidate) => ({
        candidate,
        threats: forcedWinThreatCount(candidate.state, opponent),
      }))
      const fewestThreats = Math.min(...scoredThreats.map(({ threats }) => threats))
      reducesForcedThreats = fewestThreats < Math.max(...scoredThreats.map(({ threats }) => threats))
      rootMoves = scoredThreats
        .filter(({ threats }) => threats === fewestThreats)
        .map(({ candidate }) => candidate)
    }
    const transpositions = new Map<string, TranspositionEntry>()
    let bestValue = -Infinity
    for (const candidate of rootMoves) {
      const value = minimax(
        candidate.state,
        depth - 1,
        player,
        bestValue,
        Infinity,
        branchLimit,
        transpositions,
      )
      if (value > bestValue) {
        bestValue = value
        selected = candidate
      }
    }
  }

  const blocksThreat =
    selected.state.winner !== player &&
    selected.state.winner !== opponent &&
    !hasImmediateWin(selected.state, opponent) &&
    ranked.some((candidate) => hasImmediateWin(candidate.state, opponent))
  const reason = blocksThreat
    ? 'Je neutralise une menace de victoire immédiate avant qu’un rocher ne sorte du plateau.'
    : reducesForcedThreats
      ? 'Je réduis le nombre d’attaques préparatoires qui pourraient rendre la victoire inévitable au tour suivant.'
      : describeReason(state, selected.action, selected.state, player)

  const searchNote = difficulty === 'medium'
    ? 'J’ai comparé ce coup aux principales réponses possibles de l’adversaire pour choisir une position plus sûre.'
    : difficulty === 'hard'
      ? 'J’ai évalué plusieurs suites de coups afin de privilégier une position favorable à plus long terme.'
      : ''

  return { action: selected.action, reason: [reason, searchNote].filter(Boolean).join(' ') }
}

export function actionDescription(action: GameAction): string {
  const cell = (index: number) => `${String.fromCharCode(65 + (index % BOARD_SIZE))}${Math.floor(index / BOARD_SIZE) + 1}`
  switch (action.type) {
    case 'enter': return `entrée en ${cell(action.to)}`
    case 'move': return `déplacement de ${cell(action.from)} vers ${cell(action.to)}`
    case 'rotate': return `orientation en ${cell(action.at)}`
    case 'return': return `récupération en ${cell(action.at)}`
  }
}
