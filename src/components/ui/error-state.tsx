import * as React from "react";
import { RotateCw } from "lucide-react@0.487.0";

import { Button } from "./button";
import { Callout } from "./callout";
import { useT } from "../../utils/i18n";

// Something failed to load: a danger callout with what went wrong and a Retry button.
// Replaces bare red text and the old full-width error strip.
//
//   {error ? <ErrorState body={error.message} onRetry={reload} retrying={loading} /> : ...}

export type ErrorStateProps = {
  /** Default: "Couldn't load this". */
  title?: React.ReactNode;
  /** What happened / what to do. Default: "Check the internet and try again." */
  body?: React.ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  /** Shows the spinner in the Retry button. */
  retrying?: boolean;
  className?: string;
};

function ErrorState({ title, body, onRetry, retryLabel, retrying, className }: ErrorStateProps) {
  const { t } = useT();
  return (
    <Callout
      tone="danger"
      live
      className={className}
      title={title ?? t("error.title")}
      action={
        onRetry ? (
          <Button variant="secondary" size="sm" leadingIcon={<RotateCw />} loading={retrying} onClick={onRetry}>
            {retryLabel ?? t("common.retry")}
          </Button>
        ) : undefined
      }
    >
      {body ?? t("error.body")}
    </Callout>
  );
}

export { ErrorState };
