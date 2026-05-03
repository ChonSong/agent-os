import { createContext, useContext, useState } from 'react';

type Locale = 'en' | 'zh';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type I18n = Record<string, any>;

const en: I18n = {};

export interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: I18n;
}

export const I18nContext = createContext<I18nContextValue>({
  locale: 'en',
  setLocale: () => {},
  t: en,
});

export function useI18n() {
  return useContext(I18nContext);
}
