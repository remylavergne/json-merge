import type { JsonValue } from './engine'

export interface SamplePair {
  nameA: string
  nameB: string
  a: JsonValue
  b: JsonValue
}

export const SAMPLE: SamplePair = {
  nameA: 'app.fr.json',
  nameB: 'app.en.json',
  a: {
    HOME: {
      HEADER: {
        TITLE: 'Bienvenue',
        SUBTITLE: 'Bonjour tout le monde',
      },
      FOOTER: '© 2024 Acme',
    },
    NAV: {
      HOME: 'Accueil',
      ABOUT: 'À propos',
      CONTACT: 'Contact',
    },
    ERRORS: {
      NOT_FOUND: 'Page introuvable',
    },
    FEATURES: ['alpha', 'beta', 'gamma'],
  },
  b: {
    HOME: {
      HEADER: {
        TITLE: 'Welcome',
        SUBTITLE: 'Hello everyone',
        EXTRA: 'New in English',
      },
      FOOTER: '© 2025 Acme',
    },
    NAV: {
      HOME: 'Home',
      ABOUT: 'About',
    },
    ERRORS: {
      NOT_FOUND: 'Page not found',
      UNAUTHORIZED: 'Unauthorized',
    },
    FEATURES: ['alpha', 'beta', 'delta'],
  },
}
