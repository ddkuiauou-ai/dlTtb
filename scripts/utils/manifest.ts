import path from 'path';

/**
 * Derive manifest relative URL path from a JSON base URL.
 * - Home: /data/home/v1/<range>/<section>[/*] -> /data/home/v1/<range>/<section>/manifest.json
 * - Category: /data/category/<slug>/v1/<range> -> /data/category/<slug>/v1/<range>/manifest.json
 */
export function manifestRelPathForBase(base: string): string {
  const parts = (base || '').split('/').filter(Boolean);
  // No special logic, just append manifest.json to the base path.
  // The base path from build scripts already contains the full structured path.
  return `/${[...parts, 'manifest.json'].join('/')}`;
}

/**
 * Absolute filesystem path for manifest under the given public directory.
 */
export function manifestFsPathForBaseFromPublic(base: string, publicDirAbs: string): string {
  const rel = manifestRelPathForBase(base);
  // rel starts with '/', remove it for path.join
  return path.join(publicDirAbs, rel.substring(1));
}

export default {
  manifestRelPathForBase,
  manifestFsPathForBaseFromPublic,
};

