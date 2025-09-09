import "dotenv/config";
import fs from "fs";
import path from "path";
import { getPostsByKeyword, getTopKeywords } from "../lib/queries";
import { TimeRange, ALL_TIME_RANGES } from "../lib/types";
import { manifestFsPathForBaseFromPublic } from "./utils/manifest";

const PAGE_SIZE = Number(process.env.PAGE_SIZE ?? 20);
const TOP_N_KEYWORDS = 50;

function atomicWriteJson(filepath: string, data: unknown) {
  const tmp = `${filepath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filepath);
}

const requestedRange = process.argv[2] as TimeRange | undefined;
// As requested, default to 7d range
const timeRangesToBuild = requestedRange ? [requestedRange] : (['1w'] as TimeRange[]);

if (requestedRange && !ALL_TIME_RANGES.includes(requestedRange)) {
  console.error(`Invalid time range: ${requestedRange}`);
  console.log(`Available ranges are: ${ALL_TIME_RANGES.join(", ")}`);
  process.exit(1);
}

async function buildKeyword(keyword: string, range: TimeRange) {
  const slug = encodeURIComponent(keyword);
  const outDir = path.join(process.cwd(), "public/data/keywords", slug, "v1", range);
  // 디렉터리를 삭제하고 다시 생성하여 오래된 파일을 정리합니다.
  if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`Building keyword '${keyword}' pages for range: ${range}...`);

  let page = 1;
  let hasMore = true;
  let totalPosts = 0;

  while (hasMore) {
    console.log(`  - Fetching page ${page} for keyword '${keyword}' range ${range}...`);
    const posts = await getPostsByKeyword(keyword, {
      page,
      pageSize: PAGE_SIZE,
      range,
    });

    if (posts.length > 0) {
      const filePath = path.join(outDir, `page-${page}.json`);
      atomicWriteJson(filePath, {
        page,
        pageSize: PAGE_SIZE,
        keyword,
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

  const baseUrl = path.join("/data/keywords", slug, "v1", range);
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
    keyword,
    range,
  });
  console.log(`Wrote manifest for keyword '${keyword}' range: ${range}`);
}

async function main() {
  console.log(`Fetching top ${TOP_N_KEYWORDS} keywords...`);
  const keywords = await getTopKeywords(TOP_N_KEYWORDS);
  console.log(`Found ${keywords.length} keywords to process.`);

  const manifest = {
    keywords: keywords.map((k) => k.keyword).filter(Boolean) as string[],
    slugMap: keywords.reduce((acc, { keyword }) => {
      if (keyword) {
        acc[keyword] = encodeURIComponent(keyword);
      }
      return acc;
    }, {} as Record<string, string>),
  };

  for (const { keyword } of keywords) {
    if (!keyword) continue;
    console.log(
      `Starting build for keyword '${keyword}', ranges: ${timeRangesToBuild.join(", ")}`
    );
    for (const range of timeRangesToBuild) {
      await buildKeyword(keyword, range);
    }
  }

  const manifestDir = path.join(process.cwd(), "public/data/keywords");
  if (!fs.existsSync(manifestDir)) {
    fs.mkdirSync(manifestDir, { recursive: true });
  }
  const manifestPath = path.join(manifestDir, "manifest.json");
  atomicWriteJson(manifestPath, manifest);
  console.log(`Wrote global keyword manifest to ${manifestPath}`);

  console.log("Finished building all keyword pages.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});