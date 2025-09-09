import path from 'path';

/**
 * Derive manifest relative URL path from a JSON base URL.
 * - Home: /data/home/v1/<range>/<section>[/*] -> /data/home/v1/<range>/manifest.json
 * - Category: /data/category/<slug>/v1 -> /data/category/<slug>/manifest.json
 */
export function manifestRelPathForBase(base: string): string {
  const parts = (base || '').split('/').filter(Boolean);
  const iHome = parts.indexOf('home');
  if (iHome >= 0) {
    const iV1 = parts.indexOf('v1', iHome);
    const range = parts[iV1 + 1];
    return `/${['data', 'home', 'v1', range, 'manifest.json'].join('/')}`;
  }
  const iCategory = parts.indexOf('category');
  if (iCategory >= 0) {
    const slug = parts[iCategory + 1];
    return `/${['data', 'category', slug, 'manifest.json'].join('/')}`;
  }
  // Fallback: strip trailing segment
  const trimmed = parts.slice(0, -1);
  return `/${[...trimmed, 'manifest.json'].join('/')}`;
}

/**
 * Absolute filesystem path for manifest under the given public directory.
 */
export function manifestFsPathForBaseFromPublic(base: string, publicDirAbs: string): string {
  const rel = manifestRelPathForBase(base);
  return path.join(publicDirAbs, rel);
}

export default {
  manifestRelPathForBase,
  manifestFsPathForBaseFromPublic,
};

