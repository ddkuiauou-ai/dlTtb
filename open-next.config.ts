import { defineCloudflareConfig } from '@opennextjs/cloudflare';
import staticAssetsIncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache';

// Existing production pages are generated at build time with revalidate=false.
// Store those build results in Workers Static Assets; this store is read-only.
// Do not add ISR/Tag Cache/Queue bindings without changing and validating the
// route contract first. The existing post JSON R2 bucket is a separate service.
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
});
