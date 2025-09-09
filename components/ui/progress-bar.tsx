'use client';

import * as React from "react";

interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number; // 0 to 100
}

const ProgressBar = React.forwardRef<HTMLDivElement, ProgressBarProps>(
  ({ className, value, ...props }, ref) => {
    const progress = Math.max(0, Math.min(100, value || 0));
    return (
      <div
        ref={ref}
        className={`h-1 w-full bg-gray-200 dark:bg-gray-700 ${className}`}
        {...props}
      >
        <div
          className="h-1 bg-blue-600 transition-all duration-300 ease-in-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    );
  }
);
ProgressBar.displayName = "ProgressBar";

export { ProgressBar };
