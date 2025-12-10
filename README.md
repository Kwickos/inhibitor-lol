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
- **Base de données**: Turso (SQLite distribué)
- **Cache**: Upstash Redis
- **API**: Riot Games API
- **Déploiement**: Vercel

## Déploiement sur Vercel

### 1. Prérequis

Créez des comptes sur :
- [Vercel](https://vercel.com) (hébergement)
- [Turso](https://turso.tech) (base de données)
- [Upstash](https://upstash.com) (Redis cache)
- [Riot Developer Portal](https://developer.riotgames.com) (API key)

### 2. Configuration Turso

```bash
# Installer Turso CLI
brew install tursodatabase/tap/turso

# Se connecter
turso auth login

# Créer une database
turso db create inhibitor-lol

# Obtenir l'URL et le token
turso db show inhibitor-lol --url
turso db tokens create inhibitor-lol
```

### 3. Configuration Upstash

1. Créez un Redis database sur [Upstash Console](https://console.upstash.com)
2. Copiez `UPSTASH_REDIS_REST_URL` et `UPSTASH_REDIS_REST_TOKEN`

### 4. Déploiement Vercel

```bash
# Installer Vercel CLI
npm i -g vercel

# Déployer
vercel
```

Configurez les variables d'environnement dans Vercel Dashboard :

| Variable | Description |
|----------|-------------|
| `RIOT_API_KEY` | Clé API Riot Games |
| `TURSO_DATABASE_URL` | URL de la database Turso |
| `TURSO_AUTH_TOKEN` | Token d'authentification Turso |
| `UPSTASH_REDIS_REST_URL` | URL REST Redis Upstash |
| `UPSTASH_REDIS_REST_TOKEN` | Token Redis Upstash |
| `ENABLE_RATE_LIMIT` | `true` pour activer le rate limiting |

### 5. Initialiser la base de données

```bash
# Pousser le schéma vers Turso
npx drizzle-kit push
```

## Développement local

```bash
# Installer les dépendances
npm install

# Copier les variables d'environnement
cp .env.example .env

# Configurer .env avec vos clés

# Initialiser la DB locale
npx drizzle-kit push

# Lancer le serveur de développement
npm run dev
```

Ouvrez [http://localhost:3000](http://localhost:3000).

## API Endpoints

| Endpoint | Description | Rate Limit |
|----------|-------------|------------|
| `GET /api/health` | Health check | - |
| `GET /api/summoner/[region]/[riotId]` | Profil joueur | 60/min |
| `GET /api/matches/[puuid]` | Historique (cache) | 60/min |
| `GET /api/refresh-matches/[puuid]` | Refresh depuis Riot | 10/min |
| `GET /api/analysis/[puuid]` | Analyse détaillée | 10/min |
| `GET /api/live-game/[region]/[summonerId]` | Partie en cours | 60/min |

## Architecture

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
│   ├── cache.ts               # Cache multi-niveau
│   ├── redis.ts               # Client Upstash Redis
│   ├── db.ts                  # Client Turso/Drizzle
│   ├── rate-limit.ts          # Rate limiting Upstash
│   └── constants/             # Config régions, queues
├── types/                      # Types TypeScript
└── db/                         # Schéma base de données
```

## Coûts estimés

| Trafic | Vercel | Turso | Upstash | Total |
|--------|--------|-------|---------|-------|
| Faible (<1K/mois) | $0 | $0 | $0 | **$0** |
| Moyen (1-10K/mois) | $0 | $0 | $0 | **$0** |
| Élevé (10K+/mois) | $20 | $5 | $4 | **~$29** |

## Licence

MIT
