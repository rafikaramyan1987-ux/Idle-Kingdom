export type Lang = 'en' | 'fr';

const EN = {
  // items
  'i.wheat': 'Wheat', 'i.corn': 'Corn', 'i.carrot': 'Carrot', 'i.cotton': 'Cotton', 'i.egg': 'Egg', 'i.milk': 'Milk', 'i.wool': 'Wool',
  'i.wood': 'Wood', 'i.stone': 'Stone', 'i.ore': 'Iron ore', 'i.flour': 'Flour', 'i.bread': 'Bread', 'i.cake': 'Cake', 'i.cheese': 'Cheese',
  'i.butter': 'Butter', 'i.cloth': 'Cloth', 'i.banner': 'Banner', 'i.sword': 'Sword', 'i.bow': 'Crossbow', 'i.staff': 'Staff', 'i.shield': 'Shield',
  'i.pie': 'Egg pie', 'i.stew': 'Stew', 'i.hammer': 'Hammer', 'i.nails': 'Nails', 'i.paint': 'Paint', 'i.soldier': 'Soldier', 'i.archer': 'Archer',
  'cat.crops': 'Crops', 'cat.animal': 'Farm', 'cat.materials': 'Materials', 'cat.goods': 'Goods', 'cat.gear': 'Gear', 'cat.tools': 'Tools',
  // buildings
  'b.castle': 'Castle', 'b.walls': 'Walls', 'b.barn': 'Barn', 'b.orders': 'Order board', 'b.field': 'Field', 'b.coop': 'Chicken coop',
  'b.pasture': 'Cow pasture', 'b.sheep': 'Sheep pen', 'b.lumber': 'Lumber mill', 'b.mine': 'Mine', 'b.bakery': 'Bakery', 'b.dairy': 'Dairy',
  'b.forge': 'Forge', 'b.weaver': 'Weaver', 'b.kitchen': 'Kitchen', 'b.barracks': 'Barracks', 'b.market': 'Market',
  // heroes
  'h.knight': 'Sir Aldric', 'h.ranger': 'Wren', 'h.mage': 'Elowen', 'h.rogue': 'Pip', 'h.barbarian': 'Brakka',
  'role.tank': 'Knight · tank', 'role.archer': 'Ranger · archer', 'role.mage': 'Mage', 'role.rogue': 'Rogue', 'role.warrior': 'Barbarian',
  'sk.shieldwall': 'Shield wall', 'sk.volley': 'Volley', 'sk.fireball': 'Fireball', 'sk.shadowstrike': 'Shadow strike', 'sk.whirlwind': 'Whirlwind',
  // nav
  'nav.barn': 'Barn', 'nav.orders': 'Orders', 'nav.heroes': 'Heroes', 'nav.market': 'Market', 'nav.shop': 'Shop',
  // generic
  'ui.level': 'Lv {n}', 'ui.make': 'Make', 'ui.plant': 'Plant', 'ui.feed': 'Feed all', 'ui.collect': 'Collect', 'ui.build': 'Build', 'ui.upgrade': 'Upgrade',
  'ui.deliver': 'Deliver', 'ui.close': 'Close', 'ui.go': 'Go', 'ui.claim': 'Claim', 'ui.buy': 'Buy', 'ui.sell': 'Sell', 'ui.sellAll': 'Sell half',
  'ui.queue': 'Queue', 'ui.ready': 'Ready', 'ui.idle': 'Idle', 'ui.locked': 'Lv {n}', 'ui.needLevel': 'Reach level {n}', 'ui.full': 'Full',
  'ui.finishAd': 'Finish now', 'ui.skip': 'Skip', 'ui.barnFull': 'Barn is full! Sell or upgrade.', 'ui.notEnough': 'Not enough', 'ui.capacity': 'Capacity',
  'ui.barnUpgrade': 'Bigger barn', 'ui.barnUpgradeDesc': '+25 space. Tools come from battles, chests and orders.',
  'ui.buildHere': 'Build here', 'ui.limit': 'Max owned', 'ui.time': 'Time', 'ui.newOrder': 'New order soon',
  'ui.cart': 'Trade cart', 'ui.cartDesc': 'Fill every crate before it leaves for a bonus chest!', 'ui.cartLeaves': 'Leaves in {t}', 'ui.fill': 'Fill',
  'ui.army': 'Army', 'ui.troops': '{s} soldiers · {a} archers', 'ui.power': 'Power', 'ui.train': 'Train', 'ui.star': 'Star up',
  'ui.equip': 'Equip', 'ui.heal': 'Heal', 'ui.hp': 'Health', 'ui.xp': 'XP', 'ui.heroLocked': 'A wandering hero may join later…',
  'ui.weapon': 'Weapon', 'ui.shield': 'Shield', 'ui.bonusProd': '+{p}% {b} speed',
  'ui.camp': 'Skeleton camp', 'ui.campDesc': 'Defeat the camp to discover new land, treasure and ruins.', 'ui.enemies': 'Enemies',
  'ui.yourPower': 'Your squad', 'ui.fight': 'Fight!', 'ui.squad': 'Choose up to 3 heroes', 'ui.weak': 'Your squad looks weaker — bring meals or troops!',
  'ui.battle': 'Battle!', 'ui.raid': 'Skeleton raid!', 'ui.raidIn': 'Raid in {t}', 'ui.victory': 'Victory!', 'ui.defeat': 'Retreat…',
  'ui.defeatDesc': 'No worries — heal your heroes with meals and try again.', 'ui.raidLost': 'They stole a few goods, nothing else.', 'ui.continue': 'Continue', 'ui.speed': 'Speed',
  'ui.ruins': 'Ancient ruins', 'ui.ruinsDesc': 'Restore them for gems and a lovely tower.', 'ui.restore': 'Restore',
  'ui.chest': 'Treasure!', 'ui.open': 'Open',
  'ui.visitor': 'A wandering hero', 'ui.visitorDesc': '{name} wants to join your kingdom.', 'ui.recruit': 'Recruit', 'ui.later': 'Later', 'ui.free': 'Free',
  'ui.castleDesc': 'Higher castle: more taxes, stronger heroes (max hero level {n}).', 'ui.taxes': 'Taxes {n}/min', 'ui.wallsDesc': 'Towers shoot raiders: {n} towers.',
  'ui.market': 'Merchant', 'ui.refreshIn': 'New offers in {t}', 'ui.refresh': 'Refresh', 'ui.sellTab': 'Sell goods', 'ui.buyTab': 'Offers', 'ui.sold': 'Sold',
  'ui.shop': 'Shop', 'ui.boosts': 'Boosts', 'ui.slots': 'Queue slots', 'ui.gear': 'Gear', 'ui.decor': 'Decor', 'ui.skins': 'Castle skins', 'ui.research': 'Research',
  'ui.boost15': 'Speed x2 · 15 min', 'ui.boost5': 'Speed x2 · 5 min', 'ui.freeGems': '+5 gems', 'ui.boostActive': 'x2 {t}',
  'ui.slotDesc': '+1 queue slot', 'ui.decorDesc': '+{p}% order gold', 'ui.owned': 'Owned', 'ui.use': 'Use',
  'r.farming': 'Farming', 'r.industry': 'Industry', 'r.warfare': 'Warfare', 'r.building': 'Building',
  'rd.farming': 'Crops & animals 10% faster', 'rd.industry': 'Factories 10% faster', 'rd.warfare': 'Heroes +10% power', 'rd.building': 'Faster building, +10 barn',
  'd.well': 'Wishing well', 'd.flags': 'Banner pole', 'd.tower': 'Watch tower', 'd.church': 'Chapel',
  's.red': 'Ruby', 's.blue': 'Sapphire', 's.green': 'Emerald', 's.yellow': 'Golden',
  'ui.tasks': 'Daily tasks', 'ui.tasksDesc': 'Complete all for a chest!', 'ui.event': 'Harvest festival', 'ui.eventDesc': 'Earn points from orders, crates, battles and raids. Ends in {t}.',
  'ui.rank': 'Rank', 'ui.you': 'You', 'ui.weeklyReward': 'Last week\'s reward: {n} gems',
  't.harvest': 'Harvest {n} crops', 't.produce': 'Make {n} goods', 't.orders': 'Deliver {n} orders', 't.battles': 'Win {n} battles or raids', 't.chests': 'Open {n} chests',
  'ui.welcomeBack': 'Welcome back!', 'ui.awayFor': 'Away for {t}', 'ui.awayTax': 'Castle taxes', 'ui.awayDone': '{n} products finished while you were away',
  'ui.take': 'Take', 'ui.double': 'x2', 'ui.levelUp': 'Level {n}!', 'ui.unlocked': 'New:', 'ui.awesome': 'Awesome!',
  'ui.optionsTitle': 'Options', 'ui.sound': 'Sound', 'ui.music': 'Music', 'ui.language': 'Language', 'ui.graphics': 'Graphics',
  'ui.auto': 'Auto', 'ui.high': 'High', 'ui.low': 'Low', 'ui.on': 'On', 'ui.off': 'Off', 'ui.credits': 'Credits', 'ui.reset': 'Reset progress', 'ui.resetConfirm': 'Tap again to erase everything',
  'ui.loading': 'Loading kingdom…', 'ui.heroJoined': '{name} joined your heroes!', 'ui.newLand': 'New land discovered!', 'ui.giftT': 'A villager brings a gift!',
  'ui.cartArrived': 'A trade cart arrived!', 'ui.cartLeft': 'The trade cart left.', 'ui.chestDrop': 'A chest appeared!', 'ui.marketNew': 'The merchant has new offers',
  'ui.goal': 'Goal', 'ui.reward': 'Reward', 'ui.taskDone': 'Daily task done!',
  // goals
  'g.plant': 'Plant wheat on a field', 'g.harvest': 'Harvest your wheat', 'g.flour': 'Make flour in the bakery', 'g.bread': 'Bake bread',
  'g.order': 'Deliver an order', 'g.coop': 'Build a chicken coop', 'g.camp': 'Defeat the skeleton camp', 'g.chest': 'Open a treasure chest',
  'g.raid': 'Defend against a raid', 'g.hero': 'Recruit a new hero', 'g.mine': 'Build a mine', 'g.forge': 'Build a forge',
  'g.sword': 'Forge a sword', 'g.barracks': 'Build barracks', 'g.soldier': 'Train a soldier', 'g.camp2': 'Clear a second camp', 'g.daily': 'Finish your daily tasks',
} as const;

export type Key = keyof typeof EN;

const FR: Record<Key, string> = {
  'i.wheat': 'Blé', 'i.corn': 'Maïs', 'i.carrot': 'Carotte', 'i.cotton': 'Coton', 'i.egg': 'Œuf', 'i.milk': 'Lait', 'i.wool': 'Laine',
  'i.wood': 'Bois', 'i.stone': 'Pierre', 'i.ore': 'Minerai', 'i.flour': 'Farine', 'i.bread': 'Pain', 'i.cake': 'Gâteau', 'i.cheese': 'Fromage',
  'i.butter': 'Beurre', 'i.cloth': 'Tissu', 'i.banner': 'Bannière', 'i.sword': 'Épée', 'i.bow': 'Arbalète', 'i.staff': 'Bâton', 'i.shield': 'Bouclier',
  'i.pie': 'Tourte', 'i.stew': 'Ragoût', 'i.hammer': 'Marteau', 'i.nails': 'Clous', 'i.paint': 'Peinture', 'i.soldier': 'Soldat', 'i.archer': 'Archer',
  'cat.crops': 'Récoltes', 'cat.animal': 'Ferme', 'cat.materials': 'Matériaux', 'cat.goods': 'Produits', 'cat.gear': 'Équipement', 'cat.tools': 'Outils',
  'b.castle': 'Château', 'b.walls': 'Remparts', 'b.barn': 'Grange', 'b.orders': 'Tableau des commandes', 'b.field': 'Champ', 'b.coop': 'Poulailler',
  'b.pasture': 'Pré aux vaches', 'b.sheep': 'Bergerie', 'b.lumber': 'Scierie', 'b.mine': 'Mine', 'b.bakery': 'Boulangerie', 'b.dairy': 'Laiterie',
  'b.forge': 'Forge', 'b.weaver': 'Tisserand', 'b.kitchen': 'Cuisine', 'b.barracks': 'Caserne', 'b.market': 'Marché',
  'h.knight': 'Sire Aldric', 'h.ranger': 'Wren', 'h.mage': 'Elowen', 'h.rogue': 'Pip', 'h.barbarian': 'Brakka',
  'role.tank': 'Chevalier · tank', 'role.archer': 'Rôdeuse · tir', 'role.mage': 'Mage', 'role.rogue': 'Voleur', 'role.warrior': 'Barbare',
  'sk.shieldwall': 'Mur de boucliers', 'sk.volley': 'Volée', 'sk.fireball': 'Boule de feu', 'sk.shadowstrike': 'Frappe de l’ombre', 'sk.whirlwind': 'Tourbillon',
  'nav.barn': 'Grange', 'nav.orders': 'Commandes', 'nav.heroes': 'Héros', 'nav.market': 'Marché', 'nav.shop': 'Boutique',
  'ui.level': 'Niv {n}', 'ui.make': 'Fabriquer', 'ui.plant': 'Planter', 'ui.feed': 'Nourrir', 'ui.collect': 'Récolter', 'ui.build': 'Construire', 'ui.upgrade': 'Améliorer',
  'ui.deliver': 'Livrer', 'ui.close': 'Fermer', 'ui.go': 'Aller', 'ui.claim': 'Réclamer', 'ui.buy': 'Acheter', 'ui.sell': 'Vendre', 'ui.sellAll': 'Vendre la moitié',
  'ui.queue': 'File', 'ui.ready': 'Prêt', 'ui.idle': 'Libre', 'ui.locked': 'Niv {n}', 'ui.needLevel': 'Atteignez le niveau {n}', 'ui.full': 'Plein',
  'ui.finishAd': 'Terminer', 'ui.skip': 'Passer', 'ui.barnFull': 'La grange est pleine ! Vendez ou agrandissez.', 'ui.notEnough': 'Pas assez', 'ui.capacity': 'Capacité',
  'ui.barnUpgrade': 'Agrandir la grange', 'ui.barnUpgradeDesc': '+25 places. Les outils viennent des combats, coffres et commandes.',
  'ui.buildHere': 'Construire ici', 'ui.limit': 'Maximum atteint', 'ui.time': 'Durée', 'ui.newOrder': 'Nouvelle commande bientôt',
  'ui.cart': 'Charrette', 'ui.cartDesc': 'Remplissez toutes les caisses avant son départ pour un coffre bonus !', 'ui.cartLeaves': 'Part dans {t}', 'ui.fill': 'Remplir',
  'ui.army': 'Armée', 'ui.troops': '{s} soldats · {a} archers', 'ui.power': 'Puissance', 'ui.train': 'Entraîner', 'ui.star': 'Étoile +',
  'ui.equip': 'Équiper', 'ui.heal': 'Soigner', 'ui.hp': 'Santé', 'ui.xp': 'XP', 'ui.heroLocked': 'Un héros errant pourrait vous rejoindre…',
  'ui.weapon': 'Arme', 'ui.shield': 'Bouclier', 'ui.bonusProd': '+{p} % vitesse {b}',
  'ui.camp': 'Camp de squelettes', 'ui.campDesc': 'Battez le camp pour découvrir des terres, des trésors et des ruines.', 'ui.enemies': 'Ennemis',
  'ui.yourPower': 'Votre escouade', 'ui.fight': 'Combattre !', 'ui.squad': 'Choisissez jusqu’à 3 héros', 'ui.weak': 'Votre escouade semble plus faible — apportez des repas ou des troupes !',
  'ui.battle': 'Combat !', 'ui.raid': 'Raid de squelettes !', 'ui.raidIn': 'Raid dans {t}', 'ui.victory': 'Victoire !', 'ui.defeat': 'Repli…',
  'ui.defeatDesc': 'Pas de souci — soignez vos héros avec des repas et réessayez.', 'ui.raidLost': 'Ils ont volé quelques produits, rien de plus.', 'ui.continue': 'Continuer', 'ui.speed': 'Vitesse',
  'ui.ruins': 'Ruines anciennes', 'ui.ruinsDesc': 'Restaurez-les pour des gemmes et une jolie tour.', 'ui.restore': 'Restaurer',
  'ui.chest': 'Trésor !', 'ui.open': 'Ouvrir',
  'ui.visitor': 'Un héros errant', 'ui.visitorDesc': '{name} veut rejoindre votre royaume.', 'ui.recruit': 'Recruter', 'ui.later': 'Plus tard', 'ui.free': 'Gratuit',
  'ui.castleDesc': 'Château plus haut : plus d’impôts, héros plus forts (niveau max {n}).', 'ui.taxes': 'Impôts {n}/min', 'ui.wallsDesc': 'Les tours tirent sur les pillards : {n} tours.',
  'ui.market': 'Marchand', 'ui.refreshIn': 'Nouvelles offres dans {t}', 'ui.refresh': 'Renouveler', 'ui.sellTab': 'Vendre', 'ui.buyTab': 'Offres', 'ui.sold': 'Vendu',
  'ui.shop': 'Boutique', 'ui.boosts': 'Bonus', 'ui.slots': 'Places de file', 'ui.gear': 'Équipement', 'ui.decor': 'Décor', 'ui.skins': 'Château', 'ui.research': 'Recherche',
  'ui.boost15': 'Vitesse x2 · 15 min', 'ui.boost5': 'Vitesse x2 · 5 min', 'ui.freeGems': '+5 gemmes', 'ui.boostActive': 'x2 {t}',
  'ui.slotDesc': '+1 place de file', 'ui.decorDesc': '+{p} % d’or des commandes', 'ui.owned': 'Possédé', 'ui.use': 'Utiliser',
  'r.farming': 'Agriculture', 'r.industry': 'Industrie', 'r.warfare': 'Guerre', 'r.building': 'Construction',
  'rd.farming': 'Cultures et animaux 10 % plus rapides', 'rd.industry': 'Ateliers 10 % plus rapides', 'rd.warfare': 'Héros +10 % de puissance', 'rd.building': 'Construction plus rapide, +10 grange',
  'd.well': 'Puits à vœux', 'd.flags': 'Mât de bannière', 'd.tower': 'Tour de guet', 'd.church': 'Chapelle',
  's.red': 'Rubis', 's.blue': 'Saphir', 's.green': 'Émeraude', 's.yellow': 'Doré',
  'ui.tasks': 'Tâches du jour', 'ui.tasksDesc': 'Terminez-les toutes pour un coffre !', 'ui.event': 'Fête des moissons', 'ui.eventDesc': 'Gagnez des points avec les commandes, caisses, combats et raids. Fin dans {t}.',
  'ui.rank': 'Rang', 'ui.you': 'Vous', 'ui.weeklyReward': 'Récompense de la semaine passée : {n} gemmes',
  't.harvest': 'Récolter {n} cultures', 't.produce': 'Fabriquer {n} produits', 't.orders': 'Livrer {n} commandes', 't.battles': 'Gagner {n} combats ou raids', 't.chests': 'Ouvrir {n} coffres',
  'ui.welcomeBack': 'Bon retour !', 'ui.awayFor': 'Absent pendant {t}', 'ui.awayTax': 'Impôts du château', 'ui.awayDone': '{n} produits terminés pendant votre absence',
  'ui.take': 'Prendre', 'ui.double': 'x2', 'ui.levelUp': 'Niveau {n} !', 'ui.unlocked': 'Nouveau :', 'ui.awesome': 'Génial !',
  'ui.optionsTitle': 'Options', 'ui.sound': 'Sons', 'ui.music': 'Musique', 'ui.language': 'Langue', 'ui.graphics': 'Graphismes',
  'ui.auto': 'Auto', 'ui.high': 'Élevés', 'ui.low': 'Bas', 'ui.on': 'Oui', 'ui.off': 'Non', 'ui.credits': 'Crédits', 'ui.reset': 'Effacer la partie', 'ui.resetConfirm': 'Touchez encore pour tout effacer',
  'ui.loading': 'Chargement du royaume…', 'ui.heroJoined': '{name} rejoint vos héros !', 'ui.newLand': 'Nouvelle terre découverte !', 'ui.giftT': 'Un villageois apporte un cadeau !',
  'ui.cartArrived': 'Une charrette est arrivée !', 'ui.cartLeft': 'La charrette est repartie.', 'ui.chestDrop': 'Un coffre est apparu !', 'ui.marketNew': 'Le marchand a de nouvelles offres',
  'ui.goal': 'Objectif', 'ui.reward': 'Récompense', 'ui.taskDone': 'Tâche du jour terminée !',
  'g.plant': 'Plantez du blé dans un champ', 'g.harvest': 'Récoltez votre blé', 'g.flour': 'Faites de la farine', 'g.bread': 'Cuisez du pain',
  'g.order': 'Livrez une commande', 'g.coop': 'Construisez un poulailler', 'g.camp': 'Battez le camp de squelettes', 'g.chest': 'Ouvrez un coffre',
  'g.raid': 'Défendez un raid', 'g.hero': 'Recrutez un héros', 'g.mine': 'Construisez une mine', 'g.forge': 'Construisez une forge',
  'g.sword': 'Forgez une épée', 'g.barracks': 'Construisez la caserne', 'g.soldier': 'Entraînez un soldat', 'g.camp2': 'Battez un deuxième camp', 'g.daily': 'Finissez vos tâches du jour',
};

let lang: Lang = 'en';

export function detectLang(): Lang {
  // First supported language in the browser's preference list (fr-FR, fr-CA, fr-BE… -> French).
  const list = [...(navigator.languages ?? []), navigator.language ?? ''].map((l) => l.toLowerCase());
  for (const l of list) {
    if (l.startsWith('fr')) return 'fr';
    if (l.startsWith('en')) return 'en';
  }
  return 'en';
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

/** For dynamic keys built at runtime (item ids etc.). */
export function tk(k: string, vars?: Record<string, string | number>): string {
  return k in EN ? t(k as Key, vars) : k;
}
