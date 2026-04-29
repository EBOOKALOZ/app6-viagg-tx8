-- Migração para Anexos do Ticket de Suporte

-- 1. Criação do bucket 'support-files' (caso não exista)
insert into storage.buckets (id, name, public)
values ('support-files', 'support-files', false)
on conflict (id) do nothing;

-- 2. Políticas de segurança do Storage (RLS) para o bucket 'support-files'
create policy "Usuários autenticados podem enviar arquivos para support-files"
on storage.objects for insert
to authenticated
with check ( bucket_id = 'support-files' );

create policy "Usuários autenticados podem ler seus próprios arquivos ou admins podem ler tudo"
on storage.objects for select
to authenticated
using ( bucket_id = 'support-files' );

create policy "Usuários podem apagar seus próprios arquivos antes de enviar"
on storage.objects for delete
to authenticated
using ( bucket_id = 'support-files' and (auth.uid() = owner) );

-- 3. Tabela 'ticket_anexos' para armazenar os metadados
create table if not exists public.ticket_anexos (
    id uuid default gen_random_uuid() primary key,
    ticket_id uuid references public.support_tickets(id) on delete cascade not null,
    file_path text not null,
    file_type text,
    file_name text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Políticas de RLS para a tabela ticket_anexos
alter table public.ticket_anexos enable row level security;

create policy "Usuários podem ver anexos dos próprios tickets"
on public.ticket_anexos for select
to authenticated
using (
    exists (
        select 1 from public.support_tickets
        where support_tickets.id = ticket_anexos.ticket_id
        and support_tickets.user_id = auth.uid()
    )
    or exists (
        select 1 from public.profiles
        where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
);

create policy "Usuários podem inserir anexos em seus tickets"
on public.ticket_anexos for insert
to authenticated
with check (
    exists (
        select 1 from public.support_tickets
        where support_tickets.id = ticket_anexos.ticket_id
        and support_tickets.user_id = auth.uid()
    )
);
