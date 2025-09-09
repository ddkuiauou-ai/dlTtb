
import "dotenv/config";
import fs from "fs";
import path from "path";
import { getAllPosts, getPostDetail } from "../lib/queries";

function atomicWriteJson(filepath: string, data: unknown) {
  const tmp = `${filepath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filepath);
}

async function buildAllPosts() {
  const outDir = path.join(process.cwd(), "public/data/posts/v1");
  // 디렉터리를 삭제하고 다시 생성하여 오래된 파일을 정리합니다.
  if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`Building all post pages...`);

  const allPosts = await getAllPosts({ page: 1, pageSize: 10000 }); // Assuming there are less than 10000 posts

  for (const post of allPosts) {
    const postDetails = await getPostDetail(post.id);
    if (postDetails) {
      const filePath = path.join(outDir, `${post.id}.json`);
      atomicWriteJson(filePath, postDetails);
      console.log(`Wrote ${filePath}`);
    }
  }

  const manifestPath = path.join(outDir, "manifest.json");
  atomicWriteJson(manifestPath, {
    generatedAt: new Date().toISOString(),
    ids: allPosts.map((p) => p.id),
  });
  console.log(`Wrote manifest for all posts.`);
}

async function main() {
  console.log(`Starting build for all posts.`);
  await buildAllPosts();
  console.log("Finished building all posts.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
