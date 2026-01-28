# Smuppy E2E Testing

Ce projet utilise deux frameworks de test E2E:
- **Maestro** - Tests rapides en YAML, parfait pour les tests manuels
- **Detox** - Tests robustes en TypeScript, parfait pour CI/CD

## Installation

### Maestro
```bash
# macOS
brew install maestro

# Vérifier l'installation
maestro --version
```

### Detox
```bash
# Dépendances déjà installées via npm
npm install

# Pour iOS, installer les outils Xcode
xcode-select --install
brew tap wix/brew
brew install applesimutils
```

## Structure des tests

```
├── .maestro/
│   ├── config.yaml           # Configuration Maestro
│   └── flows/                 # Tests Maestro en YAML
│       ├── 01-auth-signup.yaml
│       ├── 02-auth-login.yaml
│       ├── 03-feed-navigation.yaml
│       ├── 04-profile-screen.yaml
│       ├── 05-post-interaction.yaml
│       ├── 06-peaks-feed.yaml
│       ├── 07-search.yaml
│       └── 08-settings.yaml
├── e2e/
│   ├── jest.config.js        # Config Jest pour Detox
│   ├── utils/
│   │   └── testHelpers.ts    # Fonctions utilitaires
│   └── __tests__/            # Tests Detox en TypeScript
│       ├── auth.test.ts
│       ├── feeds.test.ts
│       ├── profile.test.ts
│       └── fullFlow.test.ts
└── .detoxrc.js               # Configuration Detox
```

## Lancer les tests

### Maestro (Tests rapides)

```bash
# Tous les tests
npm run test:e2e

# Tests spécifiques
npm run test:e2e:auth      # Auth flows
npm run test:e2e:feed      # Feed navigation
npm run test:e2e:profile   # Profile tests
npm run test:e2e:peaks     # Peaks tests

# Mode interactif (pour debug)
maestro studio

# Enregistrer un nouveau flow
maestro record .maestro/flows/new-test.yaml
```

### Detox (Tests CI/CD)

```bash
# 1. Build l'app
npm run test:detox:build:ios     # iOS
npm run test:detox:build:android # Android

# 2. Lancer les tests
npm run test:detox:ios           # iOS
npm run test:detox:android       # Android

# Tests spécifiques
npx detox test -c ios.sim.debug e2e/__tests__/auth.test.ts
```

## Écrire de nouveaux tests

### Maestro (YAML)

```yaml
appId: com.smuppy.app
name: "Mon nouveau test"
---
- launchApp
- tapOn: "Bouton"
- assertVisible: "Texte attendu"
- inputText:
    id: "input-id"
    text: "Mon texte"
```

### Detox (TypeScript)

```typescript
import { device, element, by, expect } from 'detox';

describe('Mon test', () => {
  it('should do something', async () => {
    await element(by.id('button')).tap();
    await expect(element(by.text('Expected'))).toBeVisible();
  });
});
```

## Bonnes pratiques

1. **Ajouter des testID** aux composants React Native:
   ```tsx
   <TouchableOpacity testID="login-button">
   ```

2. **Utiliser des testID cohérents**:
   - `{screen}-{element}` ex: `profile-edit-button`
   - `{action}-button` ex: `login-button`, `save-button`

3. **Tests indépendants**: Chaque test doit pouvoir s'exécuter seul

4. **Screenshots pour debug**: Utiliser `takeScreenshot('name')` dans Detox

## CI/CD

### GitHub Actions

```yaml
- name: Run Maestro E2E Tests
  run: npm run test:e2e:ci
  
- name: Upload test results
  uses: actions/upload-artifact@v3
  with:
    name: e2e-results
    path: test-results/
```

## Dépannage

### Maestro
- `maestro hierarchy` - Voir la hiérarchie des éléments
- `maestro studio` - Mode debug interactif

### Detox
- Ajouter `--loglevel trace` pour plus de logs
- `device.takeScreenshot('debug')` pour capturer l'écran
