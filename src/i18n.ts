export type Lang = 'en' | 'fr';

const EN = {
  'res.food': 'Food', 'res.wood': 'Wood', 'res.stone': 'Stone', 'res.gold': 'Gold', 'res.pop': 'People',
  'b.castle': 'Castle', 'b.walls': 'Walls', 'b.farm': 'Farm', 'b.lumber': 'Lumber Mill', 'b.mine': 'Mine', 'b.house': 'House', 'b.market': 'Market', 'b.forge': 'Forge',
  'bd.castle': 'Heart of your kingdom. Raises level limits and opens new lands.',
  'bd.walls': 'Proud walls around the keep. +3% to everything per level.',
  'bd.farm': 'Golden fields of grain.', 'bd.lumber': 'Turns forests into planks.', 'bd.mine': 'Stone, with a little gold.',
  'bd.house': 'Cozy homes. Every villager adds +1% production.', 'bd.market': 'Busy stalls full of gold.', 'bd.forge': 'Better tools: +5% to everything per level.',
  'nav.kingdom': 'Kingdom', 'nav.heroes': 'Heroes', 'nav.quests': 'Quests', 'nav.options': 'Options',
  'ui.level': 'Lv {n}', 'ui.upgrade': 'Upgrade', 'ui.build': 'Build', 'ui.collect': 'Collect', 'ui.claim': 'Claim', 'ui.go': 'Go', 'ui.close': 'Close',
  'ui.max': 'Max level', 'ui.needCastle': 'Castle Lv {n}', 'ui.builders': 'Builders busy', 'ui.limit': 'Limit reached', 'ui.notEnough': 'Not enough resources',
  'ui.production': 'Production', 'ui.next': 'Next level', 'ui.time': 'Time', 'ui.upgrading': 'Building…', 'ui.finishNow': 'Finish now',
  'ui.chooseBuilding': 'Build here', 'ui.emptyPlot': 'Empty land', 'ui.unlockLand': 'Discover land', 'ui.unlock': 'Unlock', 'ui.landDesc': 'Push back the clouds and discover new land.',
  'ui.welcomeBack': 'Welcome back!', 'ui.awayFor': 'Your kingdom worked for {t}', 'ui.take': 'Take', 'ui.double': 'x2', 'ui.cap': 'Up to 8h of rest is saved.',
  'ui.boost': 'x2 production', 'ui.boostDesc': '5 minutes of double production', 'ui.boostActive': 'x2 active',
  'ui.watch': 'Watch', 'ui.quest': 'Next goal', 'ui.reward': 'Reward', 'ui.questsDone': '{n} goals completed',
  'ui.heroesTitle': 'Heroes', 'ui.heroLocked': 'Locked', 'ui.heroLevelUp': 'Train', 'ui.heroNew': 'New!',
  'ui.optionsTitle': 'Options', 'ui.sound': 'Sound', 'ui.music': 'Music', 'ui.language': 'Language', 'ui.graphics': 'Graphics',
  'ui.auto': 'Auto', 'ui.high': 'High', 'ui.low': 'Low', 'ui.on': 'On', 'ui.off': 'Off', 'ui.credits': 'Credits', 'ui.reset': 'Reset progress', 'ui.resetConfirm': 'Tap again to erase everything',
  'ui.kingdomTitle': 'Your kingdom', 'ui.era': 'Era {n}', 'ui.stars': '{n} stars: +{p}% production', 'ui.newEra': 'New era',
  'ui.newEraDesc': 'Start a fresh island with your heroes and +{n} stars (each +10% production forever).', 'ui.newEraReq': 'Reach Castle Lv {n} to begin a new era.',
  'ui.buildings': 'Buildings', 'ui.lands': 'Lands {a}/{b}', 'ui.totalRate': 'Per minute',
  'ui.heroUnlocked': 'A new hero joined: {name}!', 'ui.landUnlocked': 'New land discovered!', 'ui.done': 'Done!',
  'ui.autoCollect': 'Collects everything automatically', 'ui.builder': 'One extra builder, faster building', 'ui.starsBonus': 'More stars each new era',
  'ui.bonus': '+{p}% {res}', 'ui.bonusAll': '+{p}% all production',
  'ui.tapToStart': 'Tap to play', 'ui.loading': 'Loading kingdom…',
  'h.mira': 'Mira', 'h.bram': 'Bram', 'h.tova': 'Tova', 'h.lior': 'Lior', 'h.pip': 'Pip', 'h.wren': 'Wren', 'h.bell': 'Old Bell', 'h.ysolde': 'Ysolde',
  'ht.mira': 'Harvest keeper', 'ht.bram': 'Woodwarden', 'ht.tova': 'Stonefinder', 'ht.lior': 'Coin counter', 'ht.pip': 'Steward', 'ht.wren': 'Architect', 'ht.bell': 'Storyteller', 'ht.ysolde': 'Star reader',
  'm.level': '{b} Lv {n}', 'm.built': 'Build a {b}', 'm.regions': 'Discover {n} lands', 'm.era': 'Begin a new era',
  'q.build': 'Build {b}', 'q.buildN': 'Have {n} × {b}', 'q.level': '{b} to Lv {n}', 'q.collect': 'Collect {n} {r}', 'q.regions': 'Discover {n} lands', 'q.population': 'Reach {n} people', 'q.heroes': 'Recruit {n} heroes',
} as const;

export type Key = keyof typeof EN;

const FR: Record<Key, string> = {
  'res.food': 'Nourriture', 'res.wood': 'Bois', 'res.stone': 'Pierre', 'res.gold': 'Or', 'res.pop': 'Habitants',
  'b.castle': 'Château', 'b.walls': 'Remparts', 'b.farm': 'Ferme', 'b.lumber': 'Scierie', 'b.mine': 'Mine', 'b.house': 'Maison', 'b.market': 'Marché', 'b.forge': 'Forge',
  'bd.castle': 'Le cœur du royaume. Augmente les niveaux max et ouvre de nouvelles terres.',
  'bd.walls': 'De fiers remparts autour du donjon. +3 % à tout par niveau.',
  'bd.farm': 'Des champs de blé dorés.', 'bd.lumber': 'Transforme les forêts en planches.', 'bd.mine': 'De la pierre, et un peu d’or.',
  'bd.house': 'Des foyers douillets. Chaque habitant ajoute +1 % de production.', 'bd.market': 'Des étals animés pleins d’or.', 'bd.forge': 'De meilleurs outils : +5 % à tout par niveau.',
  'nav.kingdom': 'Royaume', 'nav.heroes': 'Héros', 'nav.quests': 'Quêtes', 'nav.options': 'Options',
  'ui.level': 'Niv {n}', 'ui.upgrade': 'Améliorer', 'ui.build': 'Construire', 'ui.collect': 'Récolter', 'ui.claim': 'Réclamer', 'ui.go': 'Aller', 'ui.close': 'Fermer',
  'ui.max': 'Niveau max', 'ui.needCastle': 'Château niv {n}', 'ui.builders': 'Bâtisseurs occupés', 'ui.limit': 'Limite atteinte', 'ui.notEnough': 'Ressources insuffisantes',
  'ui.production': 'Production', 'ui.next': 'Niveau suivant', 'ui.time': 'Durée', 'ui.upgrading': 'En chantier…', 'ui.finishNow': 'Terminer',
  'ui.chooseBuilding': 'Construire ici', 'ui.emptyPlot': 'Terrain libre', 'ui.unlockLand': 'Découvrir', 'ui.unlock': 'Débloquer', 'ui.landDesc': 'Chassez les nuages et découvrez de nouvelles terres.',
  'ui.welcomeBack': 'Bon retour !', 'ui.awayFor': 'Votre royaume a travaillé {t}', 'ui.take': 'Prendre', 'ui.double': 'x2', 'ui.cap': 'Jusqu’à 8 h de repos sont comptées.',
  'ui.boost': 'Production x2', 'ui.boostDesc': '5 minutes de production doublée', 'ui.boostActive': 'x2 actif',
  'ui.watch': 'Voir', 'ui.quest': 'Prochain objectif', 'ui.reward': 'Récompense', 'ui.questsDone': '{n} objectifs accomplis',
  'ui.heroesTitle': 'Héros', 'ui.heroLocked': 'Verrouillé', 'ui.heroLevelUp': 'Entraîner', 'ui.heroNew': 'Nouveau !',
  'ui.optionsTitle': 'Options', 'ui.sound': 'Sons', 'ui.music': 'Musique', 'ui.language': 'Langue', 'ui.graphics': 'Graphismes',
  'ui.auto': 'Auto', 'ui.high': 'Élevés', 'ui.low': 'Bas', 'ui.on': 'Oui', 'ui.off': 'Non', 'ui.credits': 'Crédits', 'ui.reset': 'Effacer la partie', 'ui.resetConfirm': 'Touchez encore pour tout effacer',
  'ui.kingdomTitle': 'Votre royaume', 'ui.era': 'Ère {n}', 'ui.stars': '{n} étoiles : +{p} % de production', 'ui.newEra': 'Nouvelle ère',
  'ui.newEraDesc': 'Recommencez une île avec vos héros et +{n} étoiles (chacune +10 % de production pour toujours).', 'ui.newEraReq': 'Atteignez le château niv {n} pour une nouvelle ère.',
  'ui.buildings': 'Bâtiments', 'ui.lands': 'Terres {a}/{b}', 'ui.totalRate': 'Par minute',
  'ui.heroUnlocked': 'Un nouveau héros arrive : {name} !', 'ui.landUnlocked': 'Nouvelle terre découverte !', 'ui.done': 'Terminé !',
  'ui.autoCollect': 'Récolte tout automatiquement', 'ui.builder': 'Un bâtisseur en plus, chantiers plus rapides', 'ui.starsBonus': 'Plus d’étoiles à chaque ère',
  'ui.bonus': '+{p} % {res}', 'ui.bonusAll': '+{p} % de toute la production',
  'ui.tapToStart': 'Touchez pour jouer', 'ui.loading': 'Chargement du royaume…',
  'h.mira': 'Mira', 'h.bram': 'Bram', 'h.tova': 'Tova', 'h.lior': 'Lior', 'h.pip': 'Pip', 'h.wren': 'Wren', 'h.bell': 'Vieille Cloche', 'h.ysolde': 'Ysolde',
  'ht.mira': 'Gardienne des moissons', 'ht.bram': 'Garde-forêt', 'ht.tova': 'Trouveuse de pierres', 'ht.lior': 'Compteur d’écus', 'ht.pip': 'Intendant', 'ht.wren': 'Architecte', 'ht.bell': 'Conteuse', 'ht.ysolde': 'Liseuse d’étoiles',
  'm.level': '{b} niv {n}', 'm.built': 'Construire : {b}', 'm.regions': 'Découvrir {n} terres', 'm.era': 'Commencer une nouvelle ère',
  'q.build': 'Construire : {b}', 'q.buildN': 'Avoir {n} × {b}', 'q.level': '{b} au niv {n}', 'q.collect': 'Récolter {n} {r}', 'q.regions': 'Découvrir {n} terres', 'q.population': 'Atteindre {n} habitants', 'q.heroes': 'Recruter {n} héros',
};

let lang: Lang = 'en';

export function detectLang(): Lang {
  const l = (navigator.languages?.[0] ?? navigator.language ?? 'en').toLowerCase();
  return l.startsWith('fr') ? 'fr' : 'en';
}

export function setLang(l: Lang): void {
  lang = l;
  document.documentElement.lang = l;
}

export function getLang(): Lang {
  return lang;
}

export function t(k: Key, vars?: Record<string, string | number>): string {
  let s: string = (lang === 'fr' ? FR[k] : EN[k]) ?? EN[k] ?? k;
  if (vars) for (const [name, v] of Object.entries(vars)) s = s.replace(`{${name}}`, String(v));
  return s;
}
