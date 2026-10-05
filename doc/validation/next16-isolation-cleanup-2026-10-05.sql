BEGIN;
DO $$ BEGIN
 IF current_database() <> 'iss_web_fixture' OR current_user <> 'fixture' THEN RAISE EXCEPTION 'Only owned fixture DB'; END IF;
END $$;
DELETE FROM keyword_trends WHERE keyword='next16-fixture';
DELETE FROM posts WHERE id='upgrade-fixture-001';
DELETE FROM sites WHERE id='upgrade-fixture' AND board='news';
REFRESH MATERIALIZED VIEW mv_post_trends_30m;
REFRESH MATERIALIZED VIEW mv_post_trends_agg;
COMMIT;
SELECT json_build_object(
 'posts',(SELECT count(*) FROM posts),
 'post_rotation',(SELECT count(*) FROM post_rotation),
 'cluster_rotation',(SELECT count(*) FROM cluster_rotation),
 'fixture_sites',(SELECT count(*) FROM sites WHERE id='upgrade-fixture'),
 'fixture_keywords',(SELECT count(*) FROM keyword_trends WHERE keyword='next16-fixture'),
 'builder_schemas',(SELECT count(*) FROM information_schema.schemata WHERE schema_name LIKE 'home_feed_%')
);
