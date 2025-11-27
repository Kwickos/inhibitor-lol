# Inhibitor.lol

Application de suivi de statistiques pour League of Legends construite avec Next.js 16.

## Fonctionnalités

- **Recherche de joueur** - Recherchez n'importe quel joueur par Riot ID sur toutes les régions
- **Profil** - Statistiques ranked, taux de victoire et informations de tier
- **Historique des matchs** - Cartes détaillées avec icônes de champions, KDA et statistiques
- **Analyse de performance** - Analyse approfondie avec :
  - Métriques de performance (Win Rate, KDA, Kill Participation)
  - Visualisation des tendances récentes
  - Identification des forces et faiblesses
  - Suggestions d'amélioration personnalisées
  - Performance par rôle
  - Statistiques des champions les plus joués
- **Filtrage par queue** - Filtrer l'analyse par Solo/Duo ou Flex
- **Détection de partie en cours** - Voir quand un joueur est en game

## Stack technique

- **Framework**: Next.js 16 (App Router)
- **Styling**: Tailwind CSS
- **Composants UI**: shadcn/ui
- **Animations**: Framer Motion
- **Base de données**: PostgreSQL avec Drizzle ORM
- **Cache**: Redis
- **API**: Riot Games API

## Installation

### Prérequis

- Node.js 18+
- Base de données PostgreSQL
- Instance Redis
- Clé API Riot Games

### Variables d'environnement

Créez un fichier `.env` avec les variables suivantes :

```env
RIOT_API_KEY=votre_clé_api_riot
DATABASE_URL=votre_connection_string_postgresql
REDIS_URL=votre_connection_string_redis
```

### Lancement

```bash
# Installer les dépendances
npm install

# Appliquer le schéma de base de données
npx drizzle-kit push

# Lancer le serveur de développement
npm run dev
```

Ouvrez [http://localhost:3000](http://localhost:3000) pour voir l'application.

## Structure du projet

```
src/
├── app/
│   ├── [region]/[riotId]/     # Pages de profil joueur
│   └── api/                    # Routes API
├── components/
│   ├── ui/                     # Composants shadcn/ui
│   ├── icons/                  # Icônes du jeu (rôles)
│   └── ...                     # Composants fonctionnels
├── lib/
│   ├── riot-api.ts            # Client API Riot
│   ├── cache.ts               # Utilitaires de cache
│   └── constants/             # Config régions, queues
├── types/                      # Types TypeScript
└── db/                         # Schéma base de données
```

## Licence

MIT
