import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';

// Opt in explicitly; never inherit a business connection from .env.
test('fixture projections reach actual home queries with correct empty/stale/suppressed/deleted behavior', {
  skip: process.env.HOME_FEED_CONSUMER_FIXTURE !== '1',
}, async (t) => {
  assert.equal(process.env.POSTGRES_HOST, '127.0.0.1');
  assert.equal(process.env.POSTGRES_PORT, '55442');
  assert.equal(process.env.POSTGRES_USER, 'fixture');
  assert.equal(process.env.POSTGRES_DB, 'iss_web_fixture');
  const fixture = new Pool({ host: process.env.POSTGRES_HOST, port: 55442, user: 'fixture', database: 'iss_web_fixture' });
  const { getMainPagePosts, getClusterTopPosts } = await import('../../../lib/queries');
  const { db } = await import('../../../lib/db');
  const prefix = `consumer-${randomUUID()}`;
  const id = (name: string) => `${prefix}-${name}`;
  const activeCluster = randomUUID();
  const staleCluster = randomUUID();
  const suppressedCluster = randomUUID();
  const deletedCluster = randomUUID();
  const futureCluster = randomUUID();
  const ids = ['active', 'old-post', 'stale', 'suppressed', 'deleted', 'future'].map(id);
  try {
    const now = (await fixture.query("SELECT to_timestamp(floor(extract(epoch FROM now())/600)*600) AS w")).rows[0].w as Date;
    for (const name of ['active', 'old-post', 'stale', 'suppressed', 'deleted', 'future']) {
      await fixture.query(`INSERT INTO posts(id,post_id,site,board,url,title,content_hash,timestamp,is_deleted,view_count)
        VALUES($1,$1,'fixture','feed','https://example.invalid/'||$1,$1,$1,$2,$3,100)`,
      [id(name), new Date(now.getTime() - (name === 'old-post' ? 90 * 86400000 : 3600000)), name === 'deleted']);
      const end = new Date(now.getTime() + (name === 'stale' ? -40 * 86400000 : name === 'future' ? 86400000 : 0));
      await fixture.query(`INSERT INTO post_trends(post_id,window_start,window_end,view_delta,comment_delta,like_delta,dislike_delta,hot_score)
        VALUES($1,$2,$3,15,0,0,0,15)`, [id(name), new Date(end.getTime() - 1800000), end]);
    }
    for (const [cluster, name, offset] of [
      [activeCluster, 'active', 0], [staleCluster, 'stale', -40 * 86400000],
      [suppressedCluster, 'suppressed', 0], [deletedCluster, 'deleted', 0], [futureCluster, 'future', 86400000],
    ] as const) {
      await fixture.query('INSERT INTO clusters(id,representative_post_id,title,size) VALUES($1,$2,$2,1)', [cluster, id(name)]);
      await fixture.query('INSERT INTO cluster_posts(cluster_id,post_id,is_representative) VALUES($1,$2,true)', [cluster, id(name)]);
      const end = new Date(now.getTime() + offset);
      await fixture.query(`INSERT INTO cluster_trends(cluster_id,window_start,window_end,view_delta,comment_delta,like_delta,dislike_delta,hot_score)
        VALUES($1,$2,$3,15,0,0,0,15)`, [cluster, new Date(end.getTime() - 1800000), end]);
    }
    await fixture.query("INSERT INTO post_rotation(post_id,window_label,suppressed_until) VALUES($1,'24h',now()+interval '1 hour')", [id('suppressed')]);
    await fixture.query("INSERT INTO cluster_rotation(cluster_id,window_label,suppressed_until) VALUES($1,'24h',now()+interval '1 hour')", [suppressedCluster]);
    await fixture.query(`INSERT INTO post_snapshots(post_id,timestamp,view_count)
      VALUES($1,$2,100),($1,$3,115),($1,$4,999)`, [id('active'), new Date(now.getTime() - 1200000), now, new Date(now.getTime() + 600000)]);
    await fixture.query('REFRESH MATERIALIZED VIEW mv_post_trends_30m');
    await fixture.query('REFRESH MATERIALIZED VIEW mv_post_trends_agg');

    await t.test('fixed materialized views expose the expected delta and exclude future input', async () => {
      const fresh = await fixture.query('SELECT view_delta FROM mv_post_trends_30m WHERE post_id=$1', [id('active')]);
      assert.equal(fresh.rows[0].view_delta, 15);
      const future = await fixture.query('SELECT count(*)::int AS n FROM mv_post_trends_agg WHERE post_id=$1', [id('future')]);
      assert.equal(future.rows[0].n, 0);
    });
    await t.test('cluster consumers include only current eligible representatives', async () => {
      const posts = await getClusterTopPosts({ range: '24h', pageSize: 20, perSiteCap: 20 });
      assert.deepEqual(posts.map(post => post.id), [id('active')]);
    });
    await t.test('ranked consumers use activity time and exclude stale, deleted and suppressed posts', async () => {
      const posts = await getMainPagePosts({ range: '24h', mode: 'ranked', pageSize: 20, perSiteCap: 20 });
      assert.deepEqual(new Set(posts.map(post => post.id)), new Set([id('active'), id('old-post')]));
      assert.ok(posts.every(post => post.title && post.timestamp && post.url));
    });
    await t.test('fresh consumers retain valid current originals even without current ranked activity', async () => {
      const posts = await getMainPagePosts({ range: '24h', mode: 'fresh', pageSize: 20, perSiteCap: 20 });
      assert.deepEqual(new Set(posts.map(post => post.id)), new Set(['active', 'stale', 'suppressed', 'future'].map(id)));
    });
    await fixture.query('DELETE FROM post_trends WHERE post_id=ANY($1::text[])', [ids]);
    await fixture.query('DELETE FROM cluster_trends WHERE cluster_id=ANY($1::uuid[])', [[activeCluster, staleCluster, suppressedCluster, deletedCluster, futureCluster]]);
    await fixture.query('REFRESH MATERIALIZED VIEW mv_post_trends_agg');
    await t.test('no current projections produce an explicit empty result', async () => {
      assert.deepEqual(await getMainPagePosts({ range: '24h', mode: 'ranked' }), []);
      assert.deepEqual(await getClusterTopPosts({ range: '24h' }), []);
    });
  } finally {
    await fixture.query('DELETE FROM clusters WHERE id=ANY($1::uuid[])', [[activeCluster, staleCluster, suppressedCluster, deletedCluster, futureCluster]]);
    await fixture.query('DELETE FROM posts WHERE id=ANY($1::text[])', [ids]);
    await fixture.query('REFRESH MATERIALIZED VIEW mv_post_trends_30m');
    await fixture.query('REFRESH MATERIALIZED VIEW mv_post_trends_agg');
    await fixture.end();
    await db.$client.end();
  }
});
