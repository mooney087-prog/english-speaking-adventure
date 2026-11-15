create extension if not exists pgcrypto;
create table if not exists public.speaking_students (
 id uuid primary key default gen_random_uuid(),
 code text unique not null,
 pin_hash text not null,
 full_name text not null,
 nickname text not null,
 last_seen timestamptz,
 completed_at timestamptz,
 certificate_at timestamptz
);
create table if not exists public.speaking_events (
 student_id uuid references public.speaking_students(id) on delete cascade,
 stage int check(stage between 0 and 4),
 kind text check(kind in ('listen_word','record_word','listen_sentence','record_sentence')),
 item int not null check(item >= 0),
 created_at timestamptz default now(),
 primary key(student_id,stage,kind,item),
 check ((kind in ('listen_word','record_word') and item<10) or (kind in ('listen_sentence','record_sentence') and item<5))
);
create table if not exists public.speaking_recordings (
 id uuid primary key,
 student_id uuid not null references public.speaking_students(id) on delete cascade,
 stage int not null check(stage between 0 and 4),
 kind text not null check(kind in ('record_word','record_sentence')),
 item int not null,
 object_path text not null,
 created_at timestamptz not null default now(),
 check ((kind='record_word' and item between 0 and 9) or (kind='record_sentence' and item between 0 and 4))
);
alter table public.speaking_students enable row level security;
alter table public.speaking_events enable row level security;
alter table public.speaking_recordings enable row level security;
revoke all on public.speaking_students,public.speaking_events,public.speaking_recordings from anon,authenticated;
grant all on public.speaking_students,public.speaking_events,public.speaking_recordings to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('speaking-audio','speaking-audio',false,2097152,array['audio/webm','audio/mp4','audio/ogg','audio/wav','audio/x-m4a'])
on conflict(id) do update set public=false,file_size_limit=2097152,allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.save_speaking_recording(
 p_id uuid,p_student uuid,p_stage int,p_kind text,p_item int,p_path text
) returns void language plpgsql security definer set search_path=public as $$
begin
 insert into speaking_recordings(id,student_id,stage,kind,item,object_path)
 values(p_id,p_student,p_stage,p_kind,p_item,p_path) on conflict(id) do nothing;
 insert into speaking_events(student_id,stage,kind,item)
 values(p_student,p_stage,p_kind,p_item) on conflict do nothing;
end $$;
revoke all on function public.save_speaking_recording(uuid,uuid,int,text,int,text) from public,anon,authenticated;
grant execute on function public.save_speaking_recording(uuid,uuid,int,text,int,text) to service_role;
