"use client";

import type { PropsWithChildren } from "react";
import { useRouter } from "next/navigation";
import {
  ClerkProvider as ReactClerkProvider,
} from "@clerk/clerk-react";

const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
let missingKeyWarningLogged = false;

export function ClientClerkProvider({ children }: PropsWithChildren): JSX.Element {
  const router = useRouter();

  if (!publishableKey) {
    if (process.env.NODE_ENV !== "production" && !missingKeyWarningLogged) {
      missingKeyWarningLogged = true;
      console.warn("Clerk publishable key is not configured. Authentication is disabled.");
    }
    return <>{children}</>;
  }

  return (
    <ReactClerkProvider
      publishableKey={publishableKey}
      routerPush={(to) => router.push(to)}
      routerReplace={(to) => router.replace(to)}
      routerBack={() => router.back()}
      routerNavigate={(to) => router.push(to)}
    >
      {children}
    </ReactClerkProvider>
  );
}
