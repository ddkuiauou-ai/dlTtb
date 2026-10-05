import path from "node:path";
import { validateHomeFeedGeneration } from "./utils/home-feed-generation";

// This command only reads generated files; it does not import queries or DB setup.
const directory = path.resolve(process.argv[2] ?? "public/data/home/v1/24h/fresh");
try {
  const manifest = validateHomeFeedGeneration(directory);
  console.log(`Validated home feed ${manifest.range}/${manifest.section}: ${manifest.pages} JSON pages, lastPage=${manifest.lastPage}, hasMore=${manifest.hasMore}, generatedAt=${manifest.generatedAt}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
