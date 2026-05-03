import { createContext, useContext } from 'react';

export interface PageHeaderContextValue {
  setAfterTitle: (content: React.ReactNode) => void;
  setEnd: (content: React.ReactNode) => void;
}

const PageHeaderContext = createContext<PageHeaderContextValue>({
  setAfterTitle: () => {},
  setEnd: () => {},
});

export const usePageHeader = () => useContext(PageHeaderContext);

export function PageHeaderProvider({ children }: { children: React.ReactNode }) {
  return <PageHeaderContext.Provider value={{ setAfterTitle: () => {}, setEnd: () => {} }}>{children}</PageHeaderContext.Provider>;
}
