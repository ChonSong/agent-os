import { createContext, useContext } from 'react';

type Locale = 'en' | 'zh';

export type I18n = Record<string, unknown>;

const en: I18n = {};

/**
 * Translation proxy factory — creates a nested Proxy chain where each
 * namespace is cached (same object reference every time).  Unknown keys
 * return safe fallback strings, so `t.common.clear` never throws.
 */
function createI18n(_locale: Locale): I18n {
  const cache = new Map<string, I18n>();

  function getNs(ns: string): I18n {
    let result = cache.get(ns);
    if (!result) {
      result = new Proxy({}, {
        get(_target, key: string) {
          if (key === 'toString') return () => `[i18n ${ns}]`;
          if (key === 'then') return undefined; // guard against Promise-like
          const val = (en[ns] as Record<string, unknown>)?.[key];
          if (typeof val === 'string') return val;
          if (typeof val === 'object' && val !== null) {
            const sub = val as I18n;
            if (cache.has(`${ns}.${key}`)) return cache.get(`${ns}.${key}`)!;
            const cached = new Proxy({}, {
              get(_t, k: string) {
                if (k === 'toString') return () => `[i18n ${ns}.${k}]`;
                if (k === 'then') return undefined;
                const v = (sub as Record<string, unknown>)?.[k];
                return typeof v === 'string' ? v : `${ns}.${key}.${k}`;
              },
            });
            cache.set(`${ns}.${key}`, cached);
            return cached;
          }
          // Human-readable fallback for unknown keys
          return key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
        },
      });
      cache.set(ns, result);
    }
    return result;
  }

  return new Proxy({}, {
    get(_target, ns: string) {
      if (ns === 'toString') return () => '[i18n root]';
      if (ns === 'then') return undefined;
      return getNs(ns);
    },
  });
}

export interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: I18n;
}

// Pre-built safe i18n (same object used as React context default)
const safeI18n = createI18n('en');

export const I18nContext = createContext<I18nContextValue>({
  locale: 'en',
  setLocale: () => {},
  t: safeI18n,
});

export function useI18n() {
  return useContext(I18nContext);
}
