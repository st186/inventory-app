import * as React from "react";

import { cn } from "./utils";
import { controlClasses, useFieldControlProps } from "./field";

// Multi-line text: same look as Input, at least 96 px tall, grows with its content where the
// browser supports it.
const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentPropsWithoutRef<"textarea">>(function Textarea({ className, ...rest }, ref) {
  const props = useFieldControlProps(rest);
  return (
    <textarea
      ref={ref}
      data-slot="textarea"
      className={cn(controlClasses, "read-only:bg-surface-2 field-sizing-content h-auto min-h-24 resize-none py-3", className)}
      {...props}
    />
  );
});

export { Textarea };
