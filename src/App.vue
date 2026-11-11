<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { actionDescription, chooseBotAction, type BotDifficulty } from './ai'
import {
  BOARD_CELLS,
  BOARD_SIZE,
  DIRECTION_ARROWS,
  DIRECTIONS,
  PLAYER_NAMES,
  applyGameAction,
  createGame,
  getLegalActions,
  isEdge,
  isOpeningSquare,
  type Direction,
  type GameAction,
  type GameState,
  type Player,
  type VariantOptions,
} from './game'

type Selection = { kind: 'animal'; index: number } | { kind: 'reserve' } | null
type GameMode = 'local' | 'bot'

const variants = ref<VariantOptions>({ openingSquares: false, oneReturnPerPlayer: false })
const game = ref<GameState>(createGame())
const mode = ref<GameMode>('local')
const difficulty = ref<BotDifficulty>('medium')
const humanPlayer = ref<Player>('elephant')
const selection = ref<Selection>(null)
const chosenFacing = ref<Direction>('south')
const notice = ref('Choisissez un animal en réserve pour le faire entrer.')
const botThinking = ref(false)
const botReason = ref('')
const moveTimings = ref<Array<{ player: Player; thinkingTimeMs: number }>>([])
let botTurnToken = 0
let botTimer: number | undefined
let turnStartedAt = performance.now()

const currentPlayer = computed(() => game.value.turn)
const botPlayer = computed<Player>(() => humanPlayer.value === 'elephant' ? 'rhino' : 'elephant')
const isHumanTurn = computed(() => mode.value === 'local' || currentPlayer.value === humanPlayer.value)
const recentMoves = computed(() => [...game.value.history].reverse())
const legalEntryCells = computed(() => {
  if (selection.value?.kind !== 'reserve') return new Set<number>()
  return new Set(
    getLegalActions(game.value)
      .filter((action): action is Extract<GameAction, { type: 'enter' }> =>
        action.type === 'enter' && action.facing === chosenFacing.value)
      .map((action) => action.to),
  )
})
const replayText = computed(() => {
  const totals = moveTimings.value.reduce(
    (result, move) => {
      result[move.player] += move.thinkingTimeMs
      return result
    },
    { elephant: 0, rhino: 0 },
  )

  return JSON.stringify({
    format: 'siam-replay-v1',
    initialPosition: 'standard',
    mode: mode.value,
    bot: mode.value === 'bot'
      ? { difficulty: difficulty.value, humanPlayer: humanPlayer.value, botPlayer: botPlayer.value }
      : null,
    variants: game.value.variants,
    winner: game.value.winner,
    timing: { unit: 'milliseconds', totals },
    moves: game.value.history.map(({ turn, player, action }, index) => ({
      turn,
      player,
      action,
      thinkingTimeMs: moveTimings.value[index]?.thinkingTimeMs ?? null,
    })),
  }, null, 2)
})
const selectedAnimal = computed(() => {
  if (selection.value?.kind !== 'animal') return null
  const piece = game.value.board[selection.value.index]
  return piece?.kind === 'animal' ? piece : null
})
const canReturnSelected = computed(() =>
  selection.value?.kind === 'animal' &&
  selectedAnimal.value?.owner === currentPlayer.value &&
  isEdge(selection.value.index),
)

function startNewGame(): void {
  cancelBotTurn()
  game.value = createGame(variants.value)
  moveTimings.value = []
  turnStartedAt = performance.now()
  selection.value = null
  chosenFacing.value = 'south'
  botReason.value = ''
  notice.value = 'La partie commence. Les Éléphants jouent en premier.'
  scheduleBotTurn()
}

watch(() => game.value.turn, (player) => {
  chosenFacing.value = player === 'elephant' ? 'south' : 'north'
})

watch(
  () => [mode.value, humanPlayer.value, difficulty.value, game.value.turn, game.value.winner, game.value.history.length],
  () => {
    turnStartedAt = performance.now()
    scheduleBotTurn()
  },
)

function recordAction(action: GameAction, thinkingTimeMs = performance.now() - turnStartedAt): void {
  const player = game.value.turn
  const next = applyGameAction(game.value, action)
  moveTimings.value.push({ player, thinkingTimeMs: Math.max(0, Math.round(thinkingTimeMs)) })
  game.value = next
  turnStartedAt = performance.now()
}

function cancelBotTurn(): void {
  botTurnToken += 1
  if (botTimer !== undefined) window.clearTimeout(botTimer)
  botTimer = undefined
  botThinking.value = false
}

function scheduleBotTurn(): void {
  cancelBotTurn()
  if (mode.value !== 'bot' || game.value.winner || currentPlayer.value !== botPlayer.value) return

  const token = botTurnToken
  botThinking.value = true
  botReason.value = ''
  selection.value = null
  notice.value = 'Le bot analyse le plateau…'
  botTimer = window.setTimeout(() => {
    if (token !== botTurnToken) return
    try {
      const thinkingStartedAt = performance.now()
      const choice = chooseBotAction(game.value, difficulty.value)
      const thinkingTimeMs = performance.now() - thinkingStartedAt
      if (!choice) {
        notice.value = 'Le bot ne trouve aucun coup légal.'
        return
      }
      recordAction(choice.action, thinkingTimeMs)
      const next = game.value
      botReason.value = choice.reason
      notice.value = next.winner
        ? `${PLAYER_NAMES[next.winner]} remportent la partie !`
        : `Le bot joue : ${actionDescription(choice.action)}.`
    } catch (error) {
      console.error('Échec du tour du bot.', error)
      notice.value = error instanceof Error ? `Le bot n’a pas pu jouer : ${error.message}` : 'Le bot n’a pas pu jouer.'
    } finally {
      botThinking.value = false
      botTimer = undefined
    }
  }, 350)
}

onBeforeUnmount(cancelBotTurn)

function selectReserve(): void {
  if (!isHumanTurn.value || botThinking.value) return
  if (game.value.winner) return
  if (game.value.reserves[currentPlayer.value] === 0) {
    notice.value = 'Vous n’avez plus d’animal en réserve.'
    return
  }
  selection.value = { kind: 'reserve' }
  chosenFacing.value = currentPlayer.value === 'elephant' ? 'south' : 'north'
  notice.value = 'Choisissez une case libre du bord pour entrer, ou poussez depuis le bord.'
}

function selectCell(index: number): void {
  if (!isHumanTurn.value || botThinking.value) return
  if (game.value.winner) return
  if (selection.value?.kind === 'reserve') {
    try {
      recordAction({ type: 'enter', to: index, facing: chosenFacing.value })
      selection.value = null
      notice.value = game.value.winner
        ? `${PLAYER_NAMES[game.value.winner]} remportent la partie !`
        : 'Animal entré. À l’autre joueur.'
    } catch (error) {
      notice.value = messageForError(error)
    }
    return
  }

  if (selection.value?.kind === 'animal') {
    if (index === selection.value.index) {
      selection.value = null
      return
    }
    try {
      recordAction({
        type: 'move',
        from: selection.value.index,
        to: index,
        facing: chosenFacing.value,
      })
      selection.value = null
      notice.value = game.value.winner
        ? `${PLAYER_NAMES[game.value.winner]} remportent la partie !`
        : 'Coup joué. À l’autre joueur.'
    } catch (error) {
      const piece = game.value.board[index]
      if (piece?.kind === 'animal' && piece.owner === currentPlayer.value) {
        selection.value = { kind: 'animal', index }
        chosenFacing.value = piece.facing
        notice.value = 'Animal sélectionné. Choisissez une action.'
      } else {
        notice.value = messageForError(error)
      }
    }
    return
  }

  const piece = game.value.board[index]
  if (piece?.kind === 'animal' && piece.owner === currentPlayer.value) {
    selection.value = { kind: 'animal', index }
    chosenFacing.value = piece.facing
    notice.value = 'Animal sélectionné. Déplacez-le, orientez-le ou récupérez-le du bord.'
  }
}

function messageForError(error: unknown): string {
  return error instanceof Error ? error.message : 'Une erreur inattendue est survenue.'
}

function playRotation(): void {
  if (!isHumanTurn.value || botThinking.value) return
  if (selection.value?.kind !== 'animal') return
  try {
    recordAction({ type: 'rotate', at: selection.value.index, facing: chosenFacing.value })
    selection.value = null
    notice.value = 'Orientation modifiée. À l’autre joueur.'
  } catch (error) {
    notice.value = messageForError(error)
  }
}

function playReturn(): void {
  if (!isHumanTurn.value || botThinking.value) return
  if (selection.value?.kind !== 'animal') return
  try {
    recordAction({ type: 'return', at: selection.value.index })
    selection.value = null
    notice.value = 'Animal récupéré en réserve. À l’autre joueur.'
  } catch (error) {
    notice.value = messageForError(error)
  }
}

function cancelSelection(): void {
  selection.value = null
  notice.value = 'Sélection annulée.'
}

function pieceAt(index: number) {
  return game.value.board[index]
}

function animalAt(index: number) {
  const piece = pieceAt(index)
  return piece?.kind === 'animal' ? piece : null
}

function animalArrow(index: number): string {
  const animal = animalAt(index)
  return animal ? DIRECTION_ARROWS[animal.facing] : ''
}

function cellLabel(index: number): string {
  const piece = pieceAt(index)
  if (piece?.kind === 'rock') return 'Région montagneuse'
  if (piece?.kind === 'animal') return `${PLAYER_NAMES[piece.owner]}, orienté ${piece.facing}`
  return `Case vide ${Math.floor(index / BOARD_SIZE) + 1}, ${index % BOARD_SIZE + 1}`
}

function isSelected(index: number): boolean {
  return selection.value?.kind === 'animal' && selection.value.index === index
}

function isEntryCell(index: number): boolean {
  return legalEntryCells.value.has(index)
}

function canRotate(): boolean {
  return Boolean(selectedAnimal.value && selectedAnimal.value.facing !== chosenFacing.value)
}

function formatCell(index: number): string {
  return `${String.fromCharCode(65 + (index % BOARD_SIZE))}${Math.floor(index / BOARD_SIZE) + 1}`
}

function formatAction(action: GameAction): string {
  const directionNames: Record<Direction, string> = {
    north: 'nord',
    east: 'est',
    south: 'sud',
    west: 'ouest',
  }
  switch (action.type) {
    case 'enter':
      return `Entrée en ${formatCell(action.to)}, orienté ${directionNames[action.facing]}`
    case 'move':
      return `Déplacement ${formatCell(action.from)} → ${formatCell(action.to)}, orienté ${directionNames[action.facing]}`
    case 'rotate':
      return `Rotation en ${formatCell(action.at)}, vers ${directionNames[action.facing]}`
    case 'return':
      return `Récupération en ${formatCell(action.at)}`
  }
}

function playerDisplayName(player: Player): string {
  if (mode.value === 'bot' && player === botPlayer.value) return `Bot (${PLAYER_NAMES[player]})`
  return PLAYER_NAMES[player]
}

async function copyReplay(): Promise<void> {
  try {
    await navigator.clipboard.writeText(replayText.value)
    notice.value = 'Déroulé complet copié. Vous pouvez le coller dans votre message.'
  } catch (error) {
    console.error('Impossible de copier le déroulé dans le presse-papiers.', error)
    notice.value = 'Copie automatique impossible : sélectionnez et copiez le texte du déroulé ci-dessous.'
    const transcript = document.querySelector<HTMLTextAreaElement>('.replay-text')
    transcript?.focus()
    transcript?.select()
  }
}

</script>

<template>
  <main class="page-shell">
    <header class="topbar">
      <a class="brand" href="#" @click.prevent="startNewGame">
        <span class="brand-mark">S</span>
        <span><strong>SIAM</strong><small>Le royaume des géants</small></span>
      </a>
      <button class="text-button" type="button" @click="startNewGame">Nouvelle partie ↗</button>
    </header>

    <section class="intro">
      <p class="eyebrow">Jeu de stratégie · {{ mode === 'bot' ? 'contre le bot' : '2 joueurs' }}</p>
      <h1>La terre tremble.<br /><span>À vous de pousser.</span></h1>
      <p class="intro-copy">
        Déplacez éléphants et rhinocéros, repoussez les montagnes et faites sortir un rocher du
        plateau pour régner sur Siam.
      </p>
    </section>

    <section class="game-settings" aria-label="Configuration de la partie">
      <label class="setting-field">
        <span>Mode de jeu</span>
        <select v-model="mode" @change="startNewGame">
          <option value="local">Deux joueurs</option>
          <option value="bot">Contre le bot</option>
        </select>
      </label>
      <label v-if="mode === 'bot'" class="setting-field">
        <span>Niveau du bot</span>
        <select v-model="difficulty">
          <option value="easy">Facile</option>
          <option value="medium">Moyen · explique ses coups</option>
          <option value="hard">Difficile</option>
        </select>
      </label>
      <label v-if="mode === 'bot'" class="setting-field">
        <span>Vous jouez</span>
        <select v-model="humanPlayer" @change="startNewGame">
          <option value="elephant">Éléphants · premier joueur</option>
          <option value="rhino">Rhinocéros · second joueur</option>
        </select>
      </label>
      <p v-if="mode === 'bot'" class="bot-mode-note">Partie locale, sans connexion. Le niveau moyen détaille les raisons de ses décisions.</p>
    </section>

    <section class="game-layout" aria-label="Partie de Siam">
      <div class="game-area">
        <div class="turn-banner" :class="`turn-${currentPlayer}`">
          <div class="turn-symbol">{{ currentPlayer === 'elephant' ? '🐘' : '🦏' }}</div>
          <div class="turn-copy">
            <span>{{ game.winner ? 'Partie terminée' : botThinking ? 'Le bot réfléchit' : isHumanTurn ? 'À vous de jouer' : 'Tour du bot' }}</span>
            <strong>{{ game.winner ? PLAYER_NAMES[game.winner] + ' gagnent !' : PLAYER_NAMES[currentPlayer] }}</strong>
          </div>
          <span class="turn-pill">{{ game.winner ? 'Victoire' : mode === 'bot' && currentPlayer === botPlayer ? 'BOT' : 'Joueur ' + (currentPlayer === 'elephant' ? '1' : '2') }}</span>
        </div>

        <div class="board-frame">
          <div class="board-coordinates board-coordinates-top">
            <span v-for="letter in ['A', 'B', 'C', 'D', 'E']" :key="letter">{{ letter }}</span>
          </div>
          <div class="board-with-rows">
            <div class="board-coordinates board-coordinates-side">
              <span v-for="number in [1, 2, 3, 4, 5]" :key="number">{{ number }}</span>
            </div>
            <div class="board" role="grid" aria-label="Plateau de Siam de cinq cases sur cinq">
              <button
                v-for="index in BOARD_CELLS"
                :key="index - 1"
                class="cell"
                :class="{
                  'cell-rock': pieceAt(index - 1)?.kind === 'rock',
                  'cell-selected': isSelected(index - 1),
                  'cell-entry': isEntryCell(index - 1),
                  'cell-marked': variants.openingSquares && isOpeningSquare(index - 1),
                }"
                type="button"
                role="gridcell"
                :disabled="!isHumanTurn || botThinking || Boolean(game.winner)"
                :aria-label="cellLabel(index - 1)"
                @click="selectCell(index - 1)"
              >
                <span v-if="variants.openingSquares && isOpeningSquare(index - 1)" class="mark-x">×</span>
                <span v-if="pieceAt(index - 1)?.kind === 'rock'" class="rock-piece" aria-hidden="true">
                  <svg class="rock-glyph" viewBox="0 0 48 40" focusable="false">
                    <path d="M3 32 14 15l7 8L31 7l14 25a3 3 0 0 1-3 4H6a3 3 0 0 1-3-4Z" />
                    <path class="rock-highlight" d="m14 15 7 8 10-16-5 18H9Z" />
                    <path class="rock-crack" d="m33 24-5 5 4 1-4 5" />
                  </svg>
                  <small>ROCHER</small>
                </span>
                <span
                  v-else-if="animalAt(index - 1)"
                  class="animal-piece"
                  :class="`animal-${animalAt(index - 1)?.owner ?? ''}`"
                  aria-hidden="true"
                >
                  <span class="animal-glyph">{{ animalAt(index - 1)?.owner === 'elephant' ? '🐘' : '🦏' }}</span>
                  <span class="animal-arrow">{{ animalArrow(index - 1) }}</span>
                </span>
                <span v-else-if="isEntryCell(index - 1)" class="entry-arrow" aria-hidden="true">＋</span>
              </button>
            </div>
          </div>
          <div class="board-caption">
            <span><i class="legend-dot legend-rock"></i> Montagne</span>
            <span><i class="legend-dot legend-elephant"></i> Éléphants</span>
            <span><i class="legend-dot legend-rhino"></i> Rhinocéros</span>
          </div>
        </div>

        <div class="status-message" role="status">
          <span class="status-icon">✳</span>
          <span>{{ notice }}</span>
        </div>
        <div v-if="mode === 'bot' && botReason" class="bot-explanation">
          <span class="explanation-icon">✦</span>
          <p><strong>Pourquoi ce coup ?</strong>{{ botReason }}</p>
        </div>

        <section class="controls-panel" aria-label="Actions">
          <div class="controls-heading">
            <div>
              <p class="eyebrow">Votre tour</p>
              <h2>Quelle sera votre action ?</h2>
            </div>
            <button v-if="selection" class="quiet-button" type="button" :disabled="!isHumanTurn || botThinking" @click="cancelSelection">Annuler</button>
          </div>

          <div v-if="selectedAnimal" class="selected-actions">
            <div class="direction-control">
              <span class="control-label">Orientation pour le déplacement</span>
              <div class="direction-buttons" role="group" aria-label="Choisir l’orientation">
                <button
                  v-for="direction in DIRECTIONS"
                  :key="direction"
                  type="button"
                  :class="{ 'direction-active': chosenFacing === direction }"
                  :aria-label="`Orienter vers ${direction}`"
                  :aria-pressed="chosenFacing === direction"
                  :disabled="!isHumanTurn || botThinking"
                  @click="chosenFacing = direction"
                >{{ DIRECTION_ARROWS[direction] }}</button>
              </div>
              <small>Vous pouvez changer de direction en vous déplaçant.</small>
            </div>
            <div class="action-buttons">
              <button class="action-button action-primary" type="button" :disabled="!isHumanTurn || botThinking" @click="notice = 'Cliquez sur une case voisine pour déplacer ou pousser.'">
                <span>↗</span> Déplacer / pousser
              </button>
              <button class="action-button" type="button" :disabled="!canRotate() || !isHumanTurn || botThinking" @click="playRotation">
                <span>⟳</span> Tourner sur place
              </button>
              <button v-if="canReturnSelected" class="action-button" type="button" :disabled="!isHumanTurn || botThinking" @click="playReturn">
                <span>↙</span> Récupérer
              </button>
            </div>
          </div>

          <div v-else-if="selection?.kind === 'reserve'" class="selected-actions">
            <div class="direction-control">
              <span class="control-label">Orientation à l’entrée</span>
              <div class="direction-buttons" role="group" aria-label="Choisir l’orientation">
                <button
                  v-for="direction in DIRECTIONS"
                  :key="direction"
                  type="button"
                  :class="{ 'direction-active': chosenFacing === direction }"
                  :aria-label="`Orienter vers ${direction}`"
                  :aria-pressed="chosenFacing === direction"
                  :disabled="!isHumanTurn || botThinking"
                  @click="chosenFacing = direction"
                >{{ DIRECTION_ARROWS[direction] }}</button>
              </div>
              <small>Sur une case occupée, l’animal doit regarder vers l’intérieur.</small>
            </div>
            <p class="entry-hint">Cliquez une case du bord pour faire entrer l’animal.</p>
          </div>

          <div v-else class="action-buttons action-buttons-start">
            <button class="action-button action-primary" type="button" :disabled="!isHumanTurn || botThinking" @click="selectReserve">
              <span>＋</span> Faire entrer un animal
              <small>{{ game.reserves[currentPlayer] }} en réserve</small>
            </button>
            <span class="action-hint">ou sélectionnez l’un de vos animaux sur le plateau</span>
          </div>
        </section>
      </div>

      <aside class="side-panel">
        <section class="player-card" :class="{ 'player-active': currentPlayer === 'elephant' }">
          <div class="player-avatar avatar-elephant">🐘</div>
          <div class="player-details">
            <span>{{ mode === 'bot' && botPlayer === 'elephant' ? 'Bot · Blanc' : 'Joueur 1 · Blanc' }}</span>
            <strong>Éléphants</strong>
            <small>{{ game.reserves.elephant }} {{ game.reserves.elephant > 1 ? 'animaux' : 'animal' }} en réserve</small>
          </div>
          <span v-if="currentPlayer === 'elephant' && !game.winner" class="active-dot"></span>
        </section>
        <section class="player-card" :class="{ 'player-active': currentPlayer === 'rhino' }">
          <div class="player-avatar avatar-rhino">🦏</div>
          <div class="player-details">
            <span>{{ mode === 'bot' && botPlayer === 'rhino' ? 'Bot · Sombre' : 'Joueur 2 · Sombre' }}</span>
            <strong>Rhinocéros</strong>
            <small>{{ game.reserves.rhino }} {{ game.reserves.rhino > 1 ? 'animaux' : 'animal' }} en réserve</small>
          </div>
          <span v-if="currentPlayer === 'rhino' && !game.winner" class="active-dot"></span>
        </section>

        <section class="rules-card">
          <div class="section-title"><span>01</span><h2>Les règles essentielles</h2></div>
          <ul class="rules-list">
            <li><span>↔</span><p>Un animal se déplace d’une case, orthogonalement. Il peut changer d’orientation pendant son déplacement.</p></li>
            <li><span>⟳</span><p>Orienter un animal sur place consomme un tour.</p></li>
            <li><span>＋</span><p>Entrez par une case libre du bord ; une entrée occupée peut être poussée vers l’intérieur.</p></li>
            <li><span>⇢</span><p>Pour pousser, votre animal doit regarder dans le sens de la poussée. Les animaux face-à-face se neutralisent ; les rochers exigent une force suffisante.</p></li>
            <li><span>↙</span><p>Un animal sur le bord peut être récupéré et rejoué ensuite.</p></li>
            <li><span>♛</span><p>Le joueur dont l’animal pousse le rocher sortant, en regardant dans le sens de la poussée, gagne.</p></li>
          </ul>
        </section>

        <details class="variants-card">
          <summary><span>02</span><strong>Variantes de la notice</strong><span class="summary-chevron">⌄</span></summary>
          <label class="variant-option">
            <input v-model="variants.openingSquares" type="checkbox" @change="startNewGame" />
            <span><strong>Ouverture prudente</strong><small>Cases marquées interdites pendant les deux premiers tours de chaque joueur.</small></span>
          </label>
          <label class="variant-option">
            <input v-model="variants.oneReturnPerPlayer" type="checkbox" @change="startNewGame" />
            <span><strong>Sortie limitée</strong><small>Un seul animal récupéré du bord par joueur.</small></span>
          </label>
          <p class="variant-footnote">Modifier une variante lance une nouvelle partie.</p>
        </details>

        <section class="history-card">
          <div class="history-heading">
            <div class="section-title"><span>03</span><h2>Derniers coups</h2></div>
            <button class="copy-replay-button" type="button" :disabled="game.history.length === 0" @click="copyReplay">
              Copier la partie
            </button>
          </div>
          <ol class="move-history">
            <li v-for="record in recentMoves" :key="record.turn">
              <span>{{ String(record.turn).padStart(2, '0') }}</span>
              <div>
                <strong>{{ playerDisplayName(record.player) }}</strong>
                <small>{{ formatAction(record.action) }}</small>
              </div>
            </li>
          </ol>
          <p v-if="game.history.length === 0" class="empty-history">Les coups joués apparaîtront ici.</p>
          <details class="replay-details">
            <summary>Voir / copier le déroulé complet ({{ game.history.length }} coups)</summary>
            <textarea class="replay-text" :value="replayText" readonly rows="9" aria-label="Déroulé complet au format JSON"></textarea>
            <p>Copiez ce relevé avec le bouton ci-dessus pour que la partie puisse être rejouée pas à pas.</p>
          </details>
        </section>
      </aside>
    </section>

    <footer class="footer">
      <span>SIAM · Partie locale à deux joueurs</span>
      <span>Règles adaptées de la notice fournie</span>
    </footer>
  </main>
</template>
