# Siam

Application de jeu Siam en Vue 3 et TypeScript, jouable à deux en local ou contre un bot sans connexion.

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
- Mode contre le bot : choisissez votre camp et l’un des trois niveaux. Le bot facile privilégie les coups prometteurs avec une part d’aléatoire ; le niveau moyen anticipe la réponse adverse ; le niveau difficile explore les poussées et réponses possibles sur six demi-coups. Il donne priorité aux victoires immédiates et à leur défense, évite les coups qui offrent immédiatement la victoire à l’adversaire, repère certaines attaques préparatoires qui rendraient la victoire inévitable au coup suivant et privilégie alors les coups qui réduisent ces menaces. Il peut aussi occuper préventivement une case de bord pour bloquer une poussée gagnante, tout en vérifiant que cette défense ne puisse pas être balayée à son tour. Chaque coup du bot est accompagné d’une explication stratégique.

Le générateur d’actions légales et le bot sont définis dans `src/game.ts` et `src/ai.ts`. Le bot réutilise le moteur de règles de la partie pour appliquer et valider chaque coup.

L’export JSON de la partie contient, pour chaque coup, `thinkingTimeMs` en millisecondes et les totaux par joueur dans `timing.totals`. Le temps humain est mesuré entre le début de son tour et le coup légal joué ; le temps du bot mesure uniquement le calcul de décision, hors délai d’animation.

La référence des règles est `docs/siam.pdf`.
