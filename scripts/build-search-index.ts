// scripts/build-search-index.ts
import "dotenv/config";

import fs from 'fs/promises';
import path from 'path';
import MiniSearch from 'minisearch';
import { getAllPostsForSearch } from '../lib/queries';

async function buildSearchIndex() {
  console.log('Starting to build search index...');

  // 1. Fetch all posts
  const documents = await getAllPostsForSearch();
  console.log(`Fetched ${documents.length} documents to index.`);

  // 2. Create a minisearch instance
  const miniSearch = new MiniSearch({
    fields: ['title', 'content', 'keywords'], // fields to index for full-text search
    storeFields: ['id', 'title', 'image'], // fields to store in the index and return with search results
    idField: 'id',
  });

  // 3. Add documents to the index
  miniSearch.addAll(documents);
  console.log('Finished indexing documents.');

  // 4. Serialize the index to a JSON string
  const json = JSON.stringify(miniSearch);

  // 5. Write the index to a file
  const publicDir = path.join(process.cwd(), 'public', 'data');
  await fs.mkdir(publicDir, { recursive: true });
  const indexPath = path.join(publicDir, 'search-index.json');
  await fs.writeFile(indexPath, json);

  console.log(`Search index successfully created at: ${indexPath}`);
}

buildSearchIndex().catch(err => {
  console.error('Failed to build search index:', err);
  process.exit(1);
});