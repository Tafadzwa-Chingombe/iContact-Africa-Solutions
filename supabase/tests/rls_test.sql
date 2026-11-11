\set ON_ERROR_STOP 0
grant all on all tables in schema public, storage to anon, authenticated;
insert into auth.users (id,email,raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a','admin@x.co','{"full_name":"Tafadzwa"}'),
 ('00000000-0000-0000-0000-0000000000c1','c1@x.co','{"full_name":"Client One","company":"One Ltd"}'),
 ('00000000-0000-0000-0000-0000000000c2','c2@x.co','{"full_name":"Client Two"}');
update profiles set role='admin' where email='admin@x.co';
insert into projects (id,client_id,name) values
 ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-0000000000c1','C1 site'),
 ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-0000000000c2','C2 site');
insert into invoices (client_id,number,amount,status) values
 ('00000000-0000-0000-0000-0000000000c1','INV-1',100,'unpaid'),
 ('00000000-0000-0000-0000-0000000000c1','INV-2',50,'draft'),
 ('00000000-0000-0000-0000-0000000000c2','INV-3',70,'unpaid');
insert into files (id,project_id,name,storage_path,needs_approval,approval) values
 ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','proof.png','11111111-1111-1111-1111-111111111111/proof.png',true,'pending'),
 ('44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111','doc.pdf','11111111-1111-1111-1111-111111111111/doc.pdf',false,'none');
insert into storage.objects (bucket_id,name) values
 ('portal-files','11111111-1111-1111-1111-111111111111/proof.png'),
 ('portal-files','22222222-2222-2222-2222-222222222222/c2.png'),
 ('portal-files','invoices/00000000-0000-0000-0000-0000000000c1/inv1.pdf'),
 ('portal-files','invoices/00000000-0000-0000-0000-0000000000c2/inv3.pdf');

\echo '===== AS CLIENT 1 ====='
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
\echo 'profiles visible (expect 1):'
select count(*) from profiles;
\echo 'projects visible (expect C1 site):'
select name from projects;
\echo 'invoices visible (expect INV-1 only):'
select number from invoices;
\echo 'self-promote to admin (expect ERROR):'
update profiles set role='admin' where id=auth.uid();
\echo 'update own name (expect UPDATE 1):'
update profiles set full_name='C One' where id=auth.uid();
\echo 'insert project (expect ERROR rls):'
insert into projects (client_id,name) values (auth.uid(),'hack');
\echo 'change project progress (expect UPDATE 0):'
update projects set progress=100;
\echo 'approve pending proof (expect UPDATE 1):'
update files set approval='approved' where id='33333333-3333-3333-3333-333333333333';
select approval, approved_at is not null as stamped from files where id='33333333-3333-3333-3333-333333333333';
\echo 'rename file (expect ERROR):'
update files set name='x' where id='33333333-3333-3333-3333-333333333333';
\echo 'approve non-approval file (expect UPDATE 0):'
update files set approval='approved' where id='44444444-4444-4444-4444-444444444444';
\echo 'upload file record to own project (expect INSERT 0 1):'
insert into files (project_id,uploaded_by,name,storage_path) values ('11111111-1111-1111-1111-111111111111',auth.uid(),'logo.svg','11111111-1111-1111-1111-111111111111/logo.svg');
\echo 'upload file record to C2 project (expect ERROR):'
insert into files (project_id,uploaded_by,name,storage_path) values ('22222222-2222-2222-2222-222222222222',auth.uid(),'x','22222222-2222-2222-2222-222222222222/x');
\echo 'open ticket + message (expect ok):'
insert into tickets (id,client_id,subject) values ('55555555-5555-5555-5555-555555555555',auth.uid(),'Help');
insert into ticket_messages (ticket_id,author_id,body) values ('55555555-5555-5555-5555-555555555555',auth.uid(),'hi');
\echo 'open ticket pre-closed / for someone else (expect 2 ERRORs):'
insert into tickets (client_id,subject,status) values (auth.uid(),'x','closed');
insert into tickets (client_id,subject) values ('00000000-0000-0000-0000-0000000000c2','x');
\echo 'close own ticket (expect UPDATE 0):'
update tickets set status='closed';
\echo 'storage objects visible (expect own proof + own invoice):'
select name from storage.objects order by name;
\echo 'storage upload to own project (ok), invoices (ERROR), C2 (ERROR), junk path (ERROR):'
insert into storage.objects (bucket_id,name) values ('portal-files','11111111-1111-1111-1111-111111111111/new.png');
insert into storage.objects (bucket_id,name) values ('portal-files','invoices/00000000-0000-0000-0000-0000000000c1/fake.pdf');
insert into storage.objects (bucket_id,name) values ('portal-files','22222222-2222-2222-2222-222222222222/x.png');
insert into storage.objects (bucket_id,name) values ('portal-files','not-a-uuid/x.png');
\echo 'enquiries readable (expect 0):'
select count(*) from enquiries;

\echo '===== AS CLIENT 2 ====='
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c2';
\echo 'see C1 ticket/messages/files (expect 0 0 0):'
select (select count(*) from tickets),(select count(*) from ticket_messages),(select count(*) from files);
\echo 'post into C1 ticket (expect ERROR):'
insert into ticket_messages (ticket_id,author_id,body) values ('55555555-5555-5555-5555-555555555555',auth.uid(),'snoop');

\echo '===== AS ANON ====='
reset request.jwt.claim.sub; set role anon;
\echo 'submit enquiry (expect INSERT 0 1), read (expect 0):'
insert into enquiries (name,email,message) values ('Lead','l@x.co','need a site');
select count(*) from enquiries;
\echo 'read projects (expect 0):'
select count(*) from projects;

\echo '===== AS ADMIN ====='
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
\echo 'counts profiles/projects/invoices/enquiries/objects (expect 3 2 3 1 5):'
select (select count(*) from profiles),(select count(*) from projects),(select count(*) from invoices),(select count(*) from enquiries),(select count(*) from storage.objects);
\echo 'admin resets proof to pending + updates project (expect UPDATE 1 x2):'
update files set approval='pending', approved_at=null where id='33333333-3333-3333-3333-333333333333';
update projects set stage='design', progress=40 where name='C1 site';
\echo 'ticket updated_at touched by message:'
reset role;
select updated_at > created_at as touched from tickets;

\echo '===== BLOG ====='
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
\echo 'admin creates draft, published and scheduled posts (expect INSERT 0 3):'
insert into posts (slug,title,content,status,published_at,author_id) values
 ('draft-post','Draft','x','draft',null,auth.uid()),
 ('live-post','Live','# Hello','published',null,auth.uid()),
 ('future-post','Future','x','published', now() + interval '7 days', auth.uid());
\echo 'published_at auto-set on live post (expect t):'
select published_at is not null from posts where slug='live-post';
\echo 'bad slug rejected (expect ERROR check constraint):'
insert into posts (slug,title) values ('Bad Slug!','x');
\echo 'admin sees all posts (expect 3):'
select count(*) from posts;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
\echo 'client sees only live post (expect live-post):'
select slug from posts;
\echo 'client cannot write posts (expect ERROR rls, UPDATE 0):'
insert into posts (slug,title) values ('hack','x');
update posts set title='hacked';
reset request.jwt.claim.sub; set role anon;
\echo 'anon sees only live post (expect live-post):'
select slug from posts;
\echo 'anon cannot write posts (expect ERROR rls):'
insert into posts (slug,title) values ('anon','x');
\echo 'blog image upload: anon (expect ERROR rls):'
insert into storage.objects (bucket_id,name) values ('blog-images','covers/x.png');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
\echo 'blog image upload: admin (expect INSERT 0 1):'
insert into storage.objects (bucket_id,name) values ('blog-images','covers/x.png');
reset role;

\echo '===== CAREERS (jobs) ====='
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
\echo 'admin creates draft + published jobs (expect INSERT 0 2):'
insert into jobs (title, status, closes_on) values ('Draft role','draft', current_date + 30), ('Live role','published', current_date + 30);
\echo 'title too short rejected (expect ERROR check):'
insert into jobs (title) values ('x');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
\echo 'client sees only published (expect Live role) and cannot write (expect ERROR, UPDATE 0):'
select title from jobs;
insert into jobs (title) values ('hack role');
update jobs set title = 'hacked';
reset request.jwt.claim.sub; set role anon;
\echo 'anon sees only published (expect Live role) and cannot write (expect ERROR):'
select title from jobs;
insert into jobs (title) values ('anon role');
reset role;

\echo '===== ANALYTICS (page_views) ====='
set role anon;
\echo 'anon records a view (expect INSERT 0 1):'
insert into page_views (id, session_id, path, device) values ('11111111-1111-1111-1111-111111111111', 'sess-aaaaaaaa', '/index.html', 'desktop');
\echo 'anon cannot back-date a view (expect ERROR rls):'
insert into page_views (session_id, path, created_at) values ('sess-bbbbbbbb', '/x', now() - interval '1 day');
\echo 'anon cannot read views (expect 0):'
select count(*) from page_views;
\echo 'anon heartbeat works for its own row only (expect no error):'
select pv_ping('11111111-1111-1111-1111-111111111111', 'sess-aaaaaaaa');
\echo 'anon cannot run the dashboard (expect ERROR permission denied):'
select analytics_summary(30);
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
\echo 'client cannot read views or the dashboard (expect 0, then ERROR Admins only):'
select count(*) from page_views;
select analytics_summary(30);
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
\echo 'admin dashboard (expect views 1, visitors 1, live 1):'
select s->'views' views, s->'visitors' visitors, s->'live' live from analytics_summary(30) s;
\echo 'admin live list (expect 1 row /index.html):'
select path, pages from analytics_live();
\echo 'admin can store a Zoho-only invoice with no portal client (expect INSERT 0 1):'
insert into invoices (number, amount, source, zoho_invoice_id, customer_name) values ('INV-Z-1', 50, 'zoho', 'z1', 'Walk-in Ltd');
\echo 'duplicate Zoho id rejected (expect ERROR duplicate key):'
insert into invoices (number, amount, source, zoho_invoice_id) values ('INV-Z-2', 50, 'zoho', 'z1');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
\echo 'client cannot see unlinked Zoho invoice (expect 0):'
select count(*) from invoices where zoho_invoice_id = 'z1';
reset role;

\echo '===== ACADEMY ====='
reset role;
insert into auth.users (id,email,raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000000d1','s1@x.co','{"full_name":"Student One","role":"student"}'),
 ('00000000-0000-0000-0000-0000000000e9','evil@x.co','{"full_name":"Evil","role":"admin"}');
\echo 'invite metadata: student honoured, admin ignored (expect s1=student, evil=client):'
select email, role from profiles where email in ('s1@x.co','evil@x.co') order by email desc;
insert into courses (id,slug,title,status,price) values
 ('aaaaaaaa-0000-0000-0000-000000000001','seo-basics','SEO Basics','published',40),
 ('aaaaaaaa-0000-0000-0000-000000000002','draft-course','Draft Course','draft',30);
insert into lessons (id,course_id,title,sort_order,is_preview,video_url,body) values
 ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Welcome',0,true,'https://youtu.be/x','free'),
 ('bbbbbbbb-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','Keyword research',1,false,'https://youtu.be/secret','paid'),
 ('bbbbbbbb-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000002','Draft lesson',0,true,null,'draft');
insert into enrollments (course_id,user_id,status,amount,pay_method) values
 ('aaaaaaaa-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000d1','active',40,'ecocash');

set role anon;
\echo 'anon catalogue (expect seo-basics only, 2 lessons, 1 preview):'
select slug, lesson_count, preview_count from course_catalog();
\echo 'anon curriculum titles (expect Welcome + Keyword research; only Welcome has an id):'
select title, lesson_id is not null as has_id from course_curriculum('seo-basics');
\echo 'anon curriculum of a draft (expect 0 rows):'
select count(*) from course_curriculum('draft-course');
\echo 'anon lesson content (expect Welcome only):'
select title from lessons;
\echo 'anon can request a place on a published course (expect INSERT 0 1):'
insert into academy_orders (course_id,full_name,email,pay_method,pay_reference) values ('aaaaaaaa-0000-0000-0000-000000000001','New Student','new@x.co','ecocash','MP123');
\echo 'anon cannot order a draft course or pre-approve (expect 2x ERROR rls):'
insert into academy_orders (course_id,full_name,email,pay_method) values ('aaaaaaaa-0000-0000-0000-000000000002','X Y','x@x.co','bank');
insert into academy_orders (course_id,full_name,email,pay_method,status) values ('aaaaaaaa-0000-0000-0000-000000000001','X Y','x@x.co','bank','approved');
\echo 'anon cannot read orders or enrolments (expect 0, 0):'
select count(*) from academy_orders; select count(*) from enrollments;

set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
\echo 'not-enrolled client sees preview only (expect Welcome) and cannot enrol itself (expect ERROR rls):'
select title from lessons;
insert into enrollments (course_id,user_id) values ('aaaaaaaa-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1');
\echo 'not-enrolled client cannot mark a paid lesson complete (expect ERROR rls):'
insert into lesson_progress (user_id,lesson_id) values ('00000000-0000-0000-0000-0000000000c1','bbbbbbbb-0000-0000-0000-000000000002');

set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
\echo 'enrolled student sees both lessons of seo-basics, not the draft (expect Keyword research, Welcome):'
select title from lessons order by title;
\echo 'student sees own enrolment only (expect 1) and no orders (expect 0):'
select count(*) from enrollments; select count(*) from academy_orders;
\echo 'student marks a lesson complete (expect INSERT 0 1) but not for someone else (expect ERROR rls):'
insert into lesson_progress (user_id,lesson_id) values ('00000000-0000-0000-0000-0000000000d1','bbbbbbbb-0000-0000-0000-000000000002');
insert into lesson_progress (user_id,lesson_id) values ('00000000-0000-0000-0000-0000000000c1','bbbbbbbb-0000-0000-0000-000000000001');
\echo 'student cannot edit courses or lessons, or promote themselves (expect UPDATE 0, UPDATE 0, ERROR):'
update courses set price = 0;
update lessons set title = 'hacked';
update profiles set role = 'admin' where id = auth.uid();

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
\echo 'admin sees all courses, lessons, orders (expect 2, 3, 1):'
select count(*) from courses; select count(*) from lessons; select count(*) from academy_orders;
\echo 'admin curriculum of a draft (expect 1):'
select count(*) from course_curriculum('draft-course');
reset role;
