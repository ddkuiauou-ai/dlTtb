import "dotenv/config";
import fs from "fs";
import path from "path";
import { getAllPosts } from "../lib/queries";
import { TimeRange, ALL_TIME_RANGES } from "../lib/types";
import { manifestFsPathForBaseFromPublic } from "./utils/manifest";

const PAGE_SIZE = Number(process.env.PAGE_SIZE ?? 20);

// build-main-json.ts에서 가져온 안전한 파일 쓰기 유틸리티
function atomicWriteJson(filepath: string, data: unknown) {
  const tmp = `${filepath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filepath);
}

// 커맨드 라인에서 시간 범위(range) 인자 파싱
const requestedRange = process.argv[2] as TimeRange | undefined;
const timeRangesToBuild = requestedRange ? [requestedRange] : ALL_TIME_RANGES;

if (requestedRange && !ALL_TIME_RANGES.includes(requestedRange)) {
  console.error(`Invalid time range: ${requestedRange}`);
  console.log(`Available ranges are: ${ALL_TIME_RANGES.join(", ")}`);
  process.exit(1);
}

async function buildAllPosts(range: TimeRange) {
  const outDir = path.join(process.cwd(), "public/data/all/v1", range);
  // 디렉터리를 삭제하고 다시 생성하여 오래된 파일을 정리합니다.
  if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`Building 'all' pages for range: ${range}...`);

  // Fetch page 1 to get its post count for the manifest, but don't write the file.
  const firstPagePosts = await getAllPosts({
    page: 1,
    pageSize: PAGE_SIZE,
    range,
  });

  let page = 2;
  let hasMore = true;
  let paginatedPostsCount = 0;

  // Only proceed to fetch subsequent pages if page 1 had a full page of results.
  if (firstPagePosts.length < PAGE_SIZE) {
    hasMore = false;
  }

  while (hasMore) {
    console.log(`  - Fetching page ${page} for range ${range}...`);
    const posts = await getAllPosts({
      page,
      pageSize: PAGE_SIZE,
      range,
    });

    if (posts.length > 0) {
      const filePath = path.join(outDir, `page-${page}.json`);
      atomicWriteJson(filePath, {
        page,
        pageSize: PAGE_SIZE,
        range,
        posts,
      });
      console.log(`Wrote ${filePath}`);
      paginatedPostsCount += posts.length;
      page++;
      if (posts.length < PAGE_SIZE) {
        hasMore = false;
      }
    } else {
      hasMore = false;
    }
  }

  const totalPosts = firstPagePosts.length + paginatedPostsCount;
  const totalPages = Math.ceil(totalPosts / PAGE_SIZE);

  const baseUrl = path.join("/data/all/v1", range);
  const manifestPath = manifestFsPathForBaseFromPublic(
    baseUrl,
    path.join(process.cwd(), "public")
  );

  atomicWriteJson(manifestPath, {
    generatedAt: new Date().toISOString(),
    pageSize: PAGE_SIZE,
    baseDir: baseUrl,
    pages: totalPages,
    totalPosts,
    range,
  });
  console.log(`Wrote manifest for range: ${range}`);
}

async function main() {
  console.log(
    `Starting build for 'all' posts, ranges: ${timeRangesToBuild.join(", ")}`
  );
  for (const range of timeRangesToBuild) {
    await buildAllPosts(range);
  }
  console.log("Finished building 'all' posts.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});