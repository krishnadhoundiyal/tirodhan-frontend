import type { ReactNode } from 'react';
import { Redirect } from 'expo-router';
import { previewCatalogue } from '../lib/runtime';

export default function AuthRoute({ children }: { children: ReactNode }) {
  return previewCatalogue ? <Redirect href="/(product)/(tabs)" /> : children;
}
