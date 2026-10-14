-- Comptes, sessions, inscriptions aux cours, progression. Données minimales : l'e-mail, un mot de passe haché, les cours suivis.

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null check (length(email) <= 254),
  -- Adresse en minuscules : unicité insensible à la casse, sans extension.
  email_normalized text not null unique check (length(email_normalized) <= 254),
  password_hash text not null,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

-- On ne stocke jamais le jeton lui-même, seulement son empreinte SHA-256 : une fuite de la base ne donne aucune session valide.
create table sessions (
  token_hash bytea primary key check (octet_length(token_hash) = 32),
  user_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index sessions_user_id_idx on sessions (user_id);
create index sessions_expires_at_idx on sessions (expires_at);

create table enrollments (
  user_id uuid not null references users (id) on delete cascade,
  course_id text not null check (course_id ~ '^[a-z0-9-]{1,40}$'),
  enrolled_at timestamptz not null default now(),
  primary key (user_id, course_id)
);
-- Le compteur d'inscrits par cours parcourt cet index, pas la table entière.
create index enrollments_course_id_idx on enrollments (course_id);

create table progress (
  user_id uuid not null references users (id) on delete cascade,
  course_id text not null check (course_id ~ '^[a-z0-9-]{1,40}$'),
  data jsonb not null,
  -- Numéro de version : sert à refuser une écriture faite à partir d'une version périmée (deux appareils).
  version integer not null check (version >= 1),
  updated_at timestamptz not null default now(),
  primary key (user_id, course_id)
);
