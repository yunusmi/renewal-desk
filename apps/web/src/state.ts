import { createContext, useContext } from 'react';
import { QueryClient } from '@tanstack/react-query';
import type { User } from './api/client';
export const cache = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: true } },
});
export const AuthContext = createContext<User | null>(null);
export function useUser() {
  return useContext(AuthContext)!;
}
