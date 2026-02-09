# 🌍 i18n Workflow — Crowdin Integration

## 🚀 Quick Start

### 1. Setup Crowdin CLI

```bash
# Install Crowdin CLI globally
npm i -g @crowdin/cli

# Or use npx
npx crowdin --version
```

### 2. Configure Environment

Créer un fichier `.env` à la racine :

```bash
CROWDIN_PROJECT_ID=your_project_id
CROWDIN_TOKEN=your_personal_token
```

**Obtenir les credentials :**
1. Aller sur https://crowdin.com/project/smuppy/settings#api
2. Copier le Project ID
3. Générer un Personal Access Token

### 3. Premier Upload

```bash
# Upload source files (EN) vers Crowdin
npm run crowdin:upload
```

## 🔄 Workflow Quotidien

### Scénario 1: J'ajoute des nouvelles clés dans le code

```bash
# 1. Extraire les nouvelles clés
npm run i18n:extract

# 2. Upload vers Crowdin
npm run crowdin:upload

# 3. Les traducteurs reçoivent une notification
```

### Scénario 2: Je veux récupérer les traductions

```bash
# Download toutes les langues
npm run crowdin:download

# Ou sync complet (upload + download)
npm run crowdin:sync
```

### Scénario 3: Je veux vérifier l'état

```bash
# Voir le % de complétion
npm run i18n:check
```

## 📁 Structure

```
src/i18n/
├── config.ts                    # Configuration i18next
├── locales/
│   ├── en/                      # Source (upload vers Crowdin)
│   │   ├── auth.json
│   │   ├── common.json
│   │   └── ...
│   ├── fr/                      # Traduits (download depuis Crowdin)
│   ├── es/                      # Traduits
│   ├── pt-BR/                   # Traduits
│   └── ar/                      # Traduits
└── _backup/                     # Backup automatique
```

## 🛠️ Scripts Disponibles

| Commande | Description |
|----------|-------------|
| `npm run crowdin:upload` | Upload fichiers EN vers Crowdin |
| `npm run crowdin:download` | Download traductions depuis Crowdin |
| `npm run crowdin:sync` | Upload + Download |
| `npm run i18n:extract` | Extraire clés du code source |
| `npm run i18n:check` | Vérifier complétion |

## 👥 Pour les Traducteurs (sur Crowdin)

### Accès
1. Inviter les traducteurs sur le projet Crowdin
2. Leur envoyer le lien : `https://crowdin.com/project/smuppy`

### Interface Crowdin
- **Editor** : Vue côte-à-côte EN → Langue cible
- **Suggestions** : Traduction automatique (DeepL/Google)
- **Comments** : Discuter des traductions
- **Screenshots** : Voir le contexte visuel

### Workflow Traducteur
1. Recevoir notification email (nouvelles strings)
2. Se connecter sur Crowdin
3. Traduire dans l'éditeur
4. Sauvegarder
5. Le développeur download (`npm run crowdin:download`)

## 🎯 Best Practices

### Naming des clés
```typescript
// ✅ Bon
auth:login:title
auth:login:button
feed:createPost:placeholder

// ❌ Mauvais
title_login
login_button
```

### Interpolation
```typescript
// ✅ Utiliser des variables claires
t('auth:codeExpiresIn', { time: '5:00' })
t('feed:likedBy', { name: 'John', count: 5 })
```

### Pluriels
```json
{
  "minute_one": "{{count}} minute",
  "minute_other": "{{count}} minutes"
}
```

```typescript
t('common:minute', { count: 5 })  // "5 minutes"
```

## 🔧 Configuration Avancée

### crowdin.yml

```yaml
project_id: "123456"
api_token: "YOUR_TOKEN"
base_path: "."

preserve_hierarchy: true

files:
  - source: "/src/i18n/locales/en/*.json"
    translation: "/src/i18n/locales/%two_letters_code%/%original_file_name%"
    
    # Mappage des codes langues
    languages_mapping:
      two_letters_code:
        "pt-BR": "pt-BR"  # Exception pour le brésilien
    
    # Options
    update_option: "update_as_unapproved"  # Nouvelles strings = non approuvées
    
    # Exporter seulement les strings approuvées
    export_only_approved: true
```

### CI/CD Integration

`.github/workflows/i18n.yml` :
```yaml
name: i18n Sync

on:
  push:
    branches: [main]
    paths:
      - 'src/i18n/locales/en/**'

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Upload to Crowdin
        uses: crowdin/github-action@v1
        with:
          upload_sources: true
          download_translations: false
        env:
          CROWDIN_PROJECT_ID: ${{ secrets.CROWDIN_PROJECT_ID }}
          CROWDIN_TOKEN: ${{ secrets.CROWDIN_TOKEN }}
```

## 🐛 Troubleshooting

### "Authentication failed"
```bash
# Vérifier les variables d'environnement
echo $CROWDIN_PROJECT_ID
echo $CROWDIN_TOKEN

# Ou utiliser un fichier .env
source .env
```

### "File not found"
```bash
# Vérifier la structure
ls src/i18n/locales/en/

# Regénérer les fichiers manquants
npm run i18n:extract
```

### Conflits de merge sur les JSON
```bash
# Toujours prendre la version Crowdin (source de vérité)
npm run crowdin:download
```

## 📊 Monitoring

### Dashboard Crowdin
- Progression globale par langue
- Activité des traducteurs
- Strings non traduites
- Suggestions de la communauté

### Alertes
- Notification Slack/Email quand nouvelles strings
- Rapport hebdomadaire de complétion
- Alertes si langue < 80%

## 💡 Astuces

1. **Screenshots** : Uploader des captures d'écran sur Crowdin pour le contexte
2. **Glossaire** : Définir des termes clés (ex: "Peak", "Vibe", "Fan")
3. **TM (Translation Memory)** : Réutiliser les traductions existantes
4. **MT (Machine Translation)** : Activer DeepL comme suggestion

## 📞 Support

- Crowdin Docs : https://support.crowdin.com/
- Crowdin API : https://developer.crowdin.com/
- i18next Docs : https://www.i18next.com/
