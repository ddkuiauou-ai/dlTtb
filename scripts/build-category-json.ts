import "dotenv/config";
import fs from "fs";
import path from "path";
import { getPostsByCategory, getAllPosts, getPostsWithVideo, getPostsByYouTube } from "../lib/queries";
import { TimeRange, ALL_TIME_RANGES } from "../lib/types";
import { manifestFsPathForBaseFromPublic } from "./utils/manifest";

const PAGE_SIZE = Number(process.env.PAGE_SIZE ?? 20);

function atomicWriteJson(filepath: string, data: unknown) {
  const tmp = `${filepath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filepath);
}

const categoryName = process.argv[2];
if (!categoryName) {
  console.error("Category name is required. Usage: tsx scripts/build-category-json.ts <categoryName> [<range>]");
  process.exit(1);
}

const requestedRange = process.argv[3] as TimeRange | undefined;
const timeRangesToBuild = requestedRange ? [requestedRange] : ALL_TIME_RANGES;

if (requestedRange && !ALL_TIME_RANGES.includes(requestedRange)) {
  console.error(`Invalid time range: ${requestedRange}`);
  console.log(`Available ranges are: ${ALL_TIME_RANGES.join(", ")}`);
  process.exit(1);
}

async function buildCategory(category: string, range: TimeRange) {
  const outDir = path.join(process.cwd(), "public/data/category", category, "v1", range);
  // 디렉터리를 삭제하고 다시 생성하여 오래된 파일을 정리합니다.
  if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`Building '${category}' pages for range: ${range}...`);

  let page = 1;
  let hasMore = true;
  let totalPosts = 0;

  while (hasMore) {
    console.log(`  - Fetching page ${page} for category '${category}' range ${range}...`);
    
    let posts;
    const options = { page, pageSize: PAGE_SIZE, range };

    if (category === 'all') {
      posts = await getAllPosts(options);
    } else if (category === 'video') {
      posts = await getPostsWithVideo(options);
    } else if (category === 'youtube') {
      posts = await getPostsByYouTube(options);
    } else {
      posts = await getPostsByCategory(category, options);
    }

    if (posts.length > 0) {
      const filePath = path.join(outDir, `page-${page}.json`);
      atomicWriteJson(filePath, {
        page,
        pageSize: PAGE_SIZE,
        category,
        range,
        posts,
      });
      console.log(`Wrote ${filePath}`);
      totalPosts += posts.length;
      page++;
    } else {
      hasMore = false;
    }
  }

  const baseUrl = path.join("/data/category", category, "v1", range);
  const manifestPath = manifestFsPathForBaseFromPublic(
    baseUrl,
    path.join(process.cwd(), "public")
  );

  atomicWriteJson(manifestPath, {
    generatedAt: new Date().toISOString(),
    pageSize: PAGE_SIZE,
    baseDir: baseUrl,
    pages: page - 1,
    lastPage: page - 1,
    totalPosts,
    range,
  });
  console.log(`Wrote manifest for category '${category}' range: ${range}`);
}

async function main() {
  console.log(
    `Starting build for category '${categoryName}', ranges: ${timeRangesToBuild.join(", ")}`
  );
  for (const range of timeRangesToBuild) {
    await buildCategory(categoryName, range);
  }
  console.log(`Finished building category '${categoryName}'.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
