<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  BOARD_CELLS,
  BOARD_SIZE,
  DIRECTIONS,
  DIRECTION_ARROWS,
  PLAYER_NAMES,
  createGame,
  enterAnimal,
  isEdge,
  isOpeningSquare,
  moveAnimal,
  returnAnimal,
  rotateAnimal,
  type Direction,
  type GameState,
  type VariantOptions,
} from './game'

type Selection = { kind: 'animal'; index: number } | { kind: 'reserve' } | null

const variants = ref<VariantOptions>({ openingSquares: false, oneReturnPerPlayer: false })
const game = ref<GameState>(createGame())
const selection = ref<Selection>(null)
const chosenFacing = ref<Direction>('south')
const notice = ref('Choisissez un animal en réserve pour le faire entrer.')

const currentPlayer = computed(() => game.value.turn)
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
  game.value = createGame(variants.value)
  selection.value = null
  chosenFacing.value = 'south'
  notice.value = 'La partie commence. Les Éléphants jouent en premier.'
}

watch(
  () => game.value.turn,
  (player) => {
    chosenFacing.value = player === 'elephant' ? 'south' : 'north'
  },
)

function selectReserve(): void {
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
  if (game.value.winner) return
  if (selection.value?.kind === 'reserve') {
    try {
      game.value = enterAnimal(game.value, index, chosenFacing.value)
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
      game.value = moveAnimal(game.value, selection.value.index, index, chosenFacing.value)
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
  if (selection.value?.kind !== 'animal') return
  try {
    game.value = rotateAnimal(game.value, selection.value.index, chosenFacing.value)
    selection.value = null
    notice.value = 'Orientation modifiée. À l’autre joueur.'
  } catch (error) {
    notice.value = messageForError(error)
  }
}

function playReturn(): void {
  if (selection.value?.kind !== 'animal') return
  try {
    game.value = returnAnimal(game.value, selection.value.index)
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
  return selection.value?.kind === 'reserve' && isEdge(index) && !pieceAt(index)
}

function canRotate(): boolean {
  return Boolean(selectedAnimal.value && selectedAnimal.value.facing !== chosenFacing.value)
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
      <p class="eyebrow">Jeu de stratégie · 2 joueurs</p>
      <h1>La terre tremble.<br /><span>À vous de pousser.</span></h1>
      <p class="intro-copy">
        Déplacez éléphants et rhinocéros, repoussez les montagnes et faites sortir un rocher du
        plateau pour régner sur Siam.
      </p>
    </section>

    <section class="game-layout" aria-label="Partie de Siam">
      <div class="game-area">
        <div class="turn-banner" :class="`turn-${currentPlayer}`">
          <div class="turn-symbol">{{ currentPlayer === 'elephant' ? '🐘' : '🦏' }}</div>
          <div class="turn-copy">
            <span>{{ game.winner ? 'Partie terminée' : 'À vous de jouer' }}</span>
            <strong>{{ game.winner ? PLAYER_NAMES[game.winner] + ' gagnent !' : PLAYER_NAMES[currentPlayer] }}</strong>
          </div>
          <span class="turn-pill">{{ game.winner ? 'Victoire' : 'Joueur ' + (currentPlayer === 'elephant' ? '1' : '2') }}</span>
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

        <section class="controls-panel" aria-label="Actions">
          <div class="controls-heading">
            <div>
              <p class="eyebrow">Votre tour</p>
              <h2>Quelle sera votre action ?</h2>
            </div>
            <button v-if="selection" class="quiet-button" type="button" @click="cancelSelection">Annuler</button>
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
                  @click="chosenFacing = direction"
                >{{ DIRECTION_ARROWS[direction] }}</button>
              </div>
              <small>Vous pouvez changer de direction en vous déplaçant.</small>
            </div>
            <div class="action-buttons">
              <button class="action-button action-primary" type="button" @click="notice = 'Cliquez sur une case voisine pour déplacer ou pousser.'">
                <span>↗</span> Déplacer / pousser
              </button>
              <button class="action-button" type="button" :disabled="!canRotate()" @click="playRotation">
                <span>⟳</span> Tourner sur place
              </button>
              <button v-if="canReturnSelected" class="action-button" type="button" @click="playReturn">
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
                  @click="chosenFacing = direction"
                >{{ DIRECTION_ARROWS[direction] }}</button>
              </div>
              <small>Sur une case occupée, l’animal doit regarder vers l’intérieur.</small>
            </div>
            <p class="entry-hint">Cliquez une case du bord pour faire entrer l’animal.</p>
          </div>

          <div v-else class="action-buttons action-buttons-start">
            <button class="action-button action-primary" type="button" @click="selectReserve">
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
            <span>Joueur 1 · Blanc</span>
            <strong>Éléphants</strong>
            <small>{{ game.reserves.elephant }} {{ game.reserves.elephant > 1 ? 'animaux' : 'animal' }} en réserve</small>
          </div>
          <span v-if="currentPlayer === 'elephant' && !game.winner" class="active-dot"></span>
        </section>
        <section class="player-card" :class="{ 'player-active': currentPlayer === 'rhino' }">
          <div class="player-avatar avatar-rhino">🦏</div>
          <div class="player-details">
            <span>Joueur 2 · Sombre</span>
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
          <div class="section-title"><span>03</span><h2>Derniers coups</h2></div>
          <ol class="move-history">
            <li v-for="(entry, index) in game.log" :key="`${index}-${entry}`">
              <span>{{ String(game.log.length - index).padStart(2, '0') }}</span>{{ entry }}
            </li>
          </ol>
        </section>
      </aside>
    </section>

    <footer class="footer">
      <span>SIAM · Partie locale à deux joueurs</span>
      <span>Règles adaptées de la notice fournie</span>
    </footer>
  </main>
</template>
