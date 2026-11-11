# Siam

Application de jeu Siam en Vue 3 et TypeScript, destinée à une partie locale à deux joueurs. Il n’y a pas encore d’adversaire contrôlé par l’ordinateur.

## Lancer le jeu

```sh
npm install
npm run dev
```

Le serveur Vite affiche l’adresse locale à ouvrir dans le navigateur.

## Vérification

```sh
npm test
npm run build
```

## Règles intégrées

- Plateau de 5 × 5, trois rochers au centre, cinq animaux par joueur ; les Éléphants commencent.
- À son tour, un joueur effectue une action : faire entrer un animal depuis le bord, avancer d’une case orthogonale, orienter un animal sur place, récupérer un animal situé sur le bord, ou avancer en poussant une chaîne de pièces.
- L’orientation est libre pendant un déplacement simple. Une poussée n’est possible que vers l’avant de l’animal qui l’initie ; aucun animal ne change d’orientation pendant celle-ci.
- Les animaux alignés dans le sens de la poussée fournissent la force ; les animaux orientés à l’opposé l’annulent. Les animaux non opposés peuvent être poussés. Chaque rocher exige une force nette d’au moins un animal. Les animaux éjectés sont remis en réserve.
- Si un rocher quitte le plateau, la partie s’arrête. Le vainqueur est le joueur dont l’animal le plus proche du rocher éjecté est orienté dans le sens de la poussée.
- Variantes facultatives : cases marquées interdites lors des deux premiers tours de chaque joueur ; une seule récupération d’animal par joueur.

La référence des règles est `docs/siam.pdf`.
