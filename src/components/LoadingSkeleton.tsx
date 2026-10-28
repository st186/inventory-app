import React from 'react';
import { Skeleton, SkeletonListRows, SkeletonSheet, SkeletonStatTiles } from './ui/skeleton';

// Placeholders shown while a screen's code or data loads: grey shapes that match the real
// layout (warm ledger skeletons), never a spinner on a blank screen.

export const LoadingSkeleton: React.FC = () => {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8" role="status" aria-label="Loading" aria-busy="true">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>

      {/* Figures */}
      <SkeletonStatTiles count={4} className="lg:grid-cols-4" />

      {/* Main content */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-3/4" />
        <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    </div>
  );
};

// Compact skeleton for mobile-optimized views
export const CompactLoadingSkeleton: React.FC = () => {
  return (
    <div className="flex flex-col gap-4 px-4 py-4" role="status" aria-label="Loading" aria-busy="true">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-3.5 w-56 max-w-full" />
      </div>
      <SkeletonListRows count={4} />
    </div>
  );
};

// Stand-in for one section of a screen while its code loads (an Analytics tab opened for the
// first time). About the size of a real card, so the page doesn't jump when the tab arrives.
export const SectionSkeleton: React.FC<{ minHeight?: number }> = ({ minHeight = 360 }) => {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 sm:p-5" style={{ minHeight }} aria-busy="true">
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    </div>
  );
};

// Scrim and a sheet-shaped placeholder while a pop-up's code loads (on the phone usually just
// a blink).
export const ModalSkeleton: React.FC = () => {
  return <SkeletonSheet />;
};

// Thin moving bar for "data is still arriving" (a quieter alternative to a full-width banner;
// the screen underneath stays usable). Uses the bunny-progress animation from index.css - the
// same one as the start-up splash in index.html.
export const LoadingBar: React.FC<{ label?: string }> = ({ label = 'Loading data' }) => {
  return (
    <div className="relative h-0.5 w-full overflow-hidden bg-primary-soft" role="progressbar" aria-label={label}>
      <div className="bunny-progress absolute inset-y-0 left-0 w-1/3 bg-primary"></div>
    </div>
  );
};
