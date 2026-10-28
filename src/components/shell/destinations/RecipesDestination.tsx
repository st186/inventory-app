// SOP recipe sheets (components/recipes): the capture list under Production → Recipes (or Me for
// the kitchen crew), and the review / standards / costs page under More. `?sheet=R-04` opens one
// sheet. Under the Production tab the shell's header and tabs already sit above it.
import { lazy } from 'react';
import { useShell } from '../ShellContext';

const RecipesPage = lazy(() => import('../../recipes/RecipesPage').then((m) => ({ default: m.RecipesPage })));
const RecipesReviewPage = lazy(() => import('../../recipes/RecipesReviewPage').then((m) => ({ default: m.RecipesReviewPage })));

export function RecipesDestination({ mode, params, withHeader }: { mode: 'capture' | 'review'; params: Record<string, string>; withHeader: boolean }) {
  const { user } = useShell();
  const sheet = params.sheet || null;
  if (mode === 'review') return <RecipesReviewPage initialSheetId={sheet} />;
  return <RecipesPage header={withHeader} employeeId={user.employeeId} initialSheetId={sheet} />;
}
