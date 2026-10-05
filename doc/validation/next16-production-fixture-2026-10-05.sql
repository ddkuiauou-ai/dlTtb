BEGIN;
DO $$ BEGIN
  IF current_database() <> 'iss_web_fixture' OR current_user <> 'fixture' THEN
    RAISE EXCEPTION 'Only the owned upgrade fixture database may be seeded';
  END IF;
  IF EXISTS (SELECT 1 FROM posts) THEN
    RAISE EXCEPTION 'Fixture posts must be empty before representative seed';
  END IF;
END $$;
INSERT INTO sites(id,board,name,board_name,url) VALUES ('upgrade-fixture','news','Upgrade Fixture','Fixture Board','https://example.invalid');
INSERT INTO posts(id,post_id,site,board,url,title,author,timestamp,content,content_html,content_hash,category,view_count,like_count,comment_count,is_deleted)
VALUES ('upgrade-fixture-001','upgrade-fixture-001','upgrade-fixture','news','https://example.invalid/posts/upgrade-fixture-001','Next16 업그레이드 검증 글','Fixture Author',now()-interval '1 minute','Next16 fixture content body','<p>Next16 fixture content body</p>','next16-fixture-v1','news',100,2,1,false);
INSERT INTO post_enrichment(post_id,fused_categories,fused_keywords) VALUES ('upgrade-fixture-001','["news"]'::jsonb,'["next16-fixture"]'::jsonb);
INSERT INTO post_comments(id,post_id,path,depth,author,content,content_html,timestamp,like_count,is_deleted)
VALUES ('upgrade-fixture-comment-001','upgrade-fixture-001','upgrade-fixture-comment-001',0,'Fixture Commenter','Fixture comment body','<p>Fixture comment body</p>',now(),1,false);
INSERT INTO keyword_trends(keyword,range_label,window_start,window_end,count)
SELECT 'next16-fixture',label,now()-interval '30 minutes',now(),1 FROM unnest(ARRAY['3h','6h','24h','1w']) label;
COMMIT;
SELECT count(*) AS posts FROM posts;
SELECT count(*) AS post_rotation FROM post_rotation;
SELECT count(*) AS cluster_rotation FROM cluster_rotation;
