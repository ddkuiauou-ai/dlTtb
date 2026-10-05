import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import test from "node:test";
import { Client } from "pg";
import { validateHomeFeedGeneration } from "../home-feed-generation";

const database = process.env.HOME_FEED_FIXTURE_DATABASE;
const repository = process.cwd();

test("actual home JSON builder publishes complete fixture generations without predicted SSR exclusions", { skip: !database, timeout: 60000 }, async () => {
  assert.ok(database?.endsWith("_fixture"), "HOME_FEED_FIXTURE_DATABASE must name a dedicated *_fixture database");
  const host = process.env.HOME_FEED_FIXTURE_HOST ?? "127.0.0.1";
  const port = Number(process.env.HOME_FEED_FIXTURE_PORT ?? 5432);
  const user = process.env.HOME_FEED_FIXTURE_USER ?? process.env.USER;
  const password = process.env.HOME_FEED_FIXTURE_PASSWORD;
  const client = new Client({ host, port, user, password, database, connectionTimeoutMillis: 5000 });
  const schema = `home_feed_${randomUUID().replaceAll("-", "")}`;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "home-feed-builder-"));
  const output = path.join(directory, "public/data/home/v1/24h/fresh");
  let schemaCreated = false;
  try {
    await client.connect();
    assert.equal((await client.query("SELECT current_database() AS name")).rows[0].name, database);
    await client.query(`CREATE SCHEMA ${schema}`);
    schemaCreated = true;
    await client.query(`SET search_path TO ${schema}`);
    await client.query(`
      CREATE TABLE posts (id text PRIMARY KEY, url text, title text, site text, board text, comment_count integer, like_count integer, view_count integer, timestamp timestamptz, content text, is_deleted boolean);
      CREATE TABLE sites (id text, board text, name text);
      CREATE TABLE mv_post_trends_30m (post_id text, hot_score integer);
      CREATE TABLE post_images (post_id text, url text);
      CREATE TABLE post_embeds (post_id text, type text, thumbnail text, url text);
      CREATE TABLE cluster_posts (post_id text, cluster_id text);
      CREATE TABLE clusters (id text, size integer);
      INSERT INTO sites VALUES ('fixture', 'board', 'Fixture');
    `);
    const seed = async (count: number) => {
      await client.query("TRUNCATE posts");
      await client.query(`INSERT INTO posts SELECT 'post-' || n, 'https://example.test/' || n, 'Fixture ' || n, 'fixture', 'board', 0, 0, 1000 - n, NOW() - INTERVAL '1 minute', '', FALSE FROM generate_series(0, $1::integer - 1) AS n`, [count]);
    };
    const build = async () => {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(process.execPath, ["--import", path.join(repository, "node_modules/tsx/dist/loader.mjs"), path.join(repository, "scripts/build-main-json.ts")], {
          cwd: directory,
          env: { ...process.env, NODE_ENV: "production", POSTGRES_HOST: host, POSTGRES_PORT: String(port), POSTGRES_USER: user, POSTGRES_PASSWORD: password ?? "", POSTGRES_DB: database, PGOPTIONS: `-c search_path=${schema} -c default_transaction_read_only=on`, RANGE: "24h", SECTION: "fresh", PAGE_SIZE: "20", MAX_PAGES: "10" },
          stdio: ["ignore", "pipe", "pipe"],
        });
        let output = "";
        child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
        child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
        const timeout = setTimeout(() => { child.kill(); reject(new Error("Fixture builder timed out")); }, 25000);
        child.on("error", (error) => { clearTimeout(timeout); reject(error); });
        child.on("exit", (code) => {
          clearTimeout(timeout);
          if (code === 0) resolve(); else reject(new Error(`Fixture builder failed (${code}): ${output}`));
        });
      });
      return validateHomeFeedGeneration(output);
    };

    await seed(65);
    const first = await build();
    assert.equal(first.seedPolicy, "live-seed-dedupe");
    assert.equal(first.lastPage, 5);
    const ids = Array.from({ length: first.pages }, (_, index) => JSON.parse(fs.readFileSync(path.join(output, `page-${index + 2}.json`), "utf8")).posts).flat().map((post: { id: string }) => post.id);
    assert.deepEqual(ids, Array.from({ length: 65 }, (_, index) => `post-${index}`));
    const actualSeedIds = new Set(ids.slice(0, 36));
    const actualUpperIds = new Set(["post-40", "post-41", "post-42", "post-55", "post-56", "post-57", "post-58", "post-59", "post-60"]);
    const appended = ids.filter((id: string) => !actualSeedIds.has(id) && !actualUpperIds.has(id));
    assert.equal(appended.length, 20);
    assert.ok(appended.includes("post-36"));

    await seed(3);
    const second = await build();
    assert.equal(second.lastPage, 2);
    assert.deepEqual(fs.readdirSync(output).sort(), ["manifest.json", "page-2.json"]);
    await seed(0);
    const empty = await build();
    assert.equal(empty.lastPage, 1);
    assert.equal(empty.hasMore, false);
    assert.deepEqual(fs.readdirSync(output), ["manifest.json"]);
  } finally {
    if (schemaCreated) await client.query(`DROP SCHEMA ${schema} CASCADE`);
    await client.end();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
