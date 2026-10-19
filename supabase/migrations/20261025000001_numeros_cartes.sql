-- Numéros des cartes : aléatoires, avec caractère de contrôle.
--
-- Avant : AP2A-00001 (membres) et B-00001 (bénéficiaires), des compteurs qui
-- se devinent et révèlent combien de personnes l'association compte.
--
-- Maintenant : T AA - XXXX - XX C, par exemple  B26-7K4M-9QX
--   T    : M (membre) ou B (bénéficiaire)
--   AA   : année d'émission (26 pour 2026)
--   XXXX-XX : 6 caractères tirés au hasard (générateur cryptographique du
--          serveur), soit 32^6 ≈ 1,07 milliard de possibilités
--   C    : caractère de contrôle (Luhn mod 32) : une faute de frappe sur un
--          caractère, ou deux caractères voisins inversés, est détectée.
-- Alphabet de Crockford (base 32) : chiffres et lettres sans I, L, O, U,
-- pour ne jamais confondre 0/O ni 1/I/L à la lecture ou à la saisie.
--
-- Ce numéro identifie la personne ; il n'est pas secret. Ce qui authentifie
-- la carte, c'est le jeton du QR code (122 bits aléatoires), inchangé.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.alphabet_crockford() returns text
language sql immutable as $$ select '0123456789ABCDEFGHJKMNPQRSTVWXYZ' $$;

-- Caractère de contrôle Luhn mod 32 d'une chaîne en alphabet de Crockford.
create or replace function public.cle_luhn32(p text) returns text
language plpgsql immutable set search_path = public as $$
declare
  a text := public.alphabet_crockford();
  facteur int := 2;
  somme int := 0;
  v int;
  i int;
begin
  for i in reverse length(p)..1 loop
    v := strpos(a, substr(p, i, 1)) - 1;
    if v < 0 then raise exception 'Caractère hors alphabet : %', substr(p, i, 1); end if;
    v := v * facteur;
    somme := somme + v / 32 + v % 32;
    facteur := case when facteur = 2 then 1 else 2 end;
  end loop;
  return substr(a, ((32 - somme % 32) % 32) + 1, 1);
end $$;

-- Mise en forme lue sur papier : minuscules, O→0, I/L→1, tirets et espaces retirés.
create or replace function public.normaliser_numero(p text) returns text
language sql immutable as $$
  select translate(upper(regexp_replace(coalesce(p, ''), '[\s-]', '', 'g')), 'OIL', '011')
$$;

-- Le numéro est-il bien formé (caractère de contrôle juste) ?
create or replace function public.numero_valide(p text) returns boolean
language plpgsql immutable set search_path = public as $$
declare
  n text := public.normaliser_numero(p);
begin
  if n !~ '^[MB][0-9]{2}[0-9A-HJKMNP-TV-Z]{7}$' then
    return false;
  end if;
  return public.cle_luhn32(left(n, 9)) = right(n, 1);
end $$;

-- Tirage d'un nouveau numéro (unique parmi les membres et les bénéficiaires).
-- 6 octets du générateur cryptographique ; on garde 5 bits de chacun
-- (256 est multiple de 32 : chaque caractère est parfaitement équiprobable).
create or replace function public.nouveau_numero(p_type text) returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  a text := public.alphabet_crockford();
  octets bytea;
  corps text;
  base text;
  numero text;
  i int;
begin
  if p_type not in ('M', 'B') then raise exception 'Type de numéro inconnu : %', p_type; end if;
  loop
    octets := extensions.gen_random_bytes(6);
    corps := '';
    for i in 0..5 loop
      corps := corps || substr(a, (get_byte(octets, i) & 31) + 1, 1);
    end loop;
    base := p_type || to_char(current_date, 'YY') || corps;
    numero := left(base, 3) || '-' || substr(corps, 1, 4) || '-' || substr(corps, 5, 2) || public.cle_luhn32(base);
    exit when not exists (select 1 from public.membres where numero_adherent = numero)
          and not exists (select 1 from public.cibles where numero_beneficiaire = numero);
  end loop;
  return numero;
end $$;
revoke all on function public.nouveau_numero(text) from public, anon, authenticated;
grant execute on function public.numero_valide(text), public.normaliser_numero(text) to anon, authenticated;

-- Membres : numéro tiré à la création de la fiche.
create or replace function public.attribuer_numero_adherent() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.numero_adherent is null then
    new.numero_adherent := public.nouveau_numero('M');
  end if;
  return new;
end $$;

-- Bénéficiaires : numéro tiré à la première carte (emettre_carte).
create or replace function public.emettre_carte(p_membre uuid default null, p_cible uuid default null)
returns public.cartes language plpgsql security definer set search_path = public as $$
declare
  carte public.cartes;
begin
  if num_nonnulls(p_membre, p_cible) <> 1 then
    raise exception 'Indiquez un membre ou une cible';
  end if;
  if p_membre is not null then
    if not (public.a_permission('membres.gerer') or p_membre = public.mon_membre_id()) then
      raise exception 'Il faut le droit « Gérer les membres » pour émettre la carte d''un autre membre' using errcode = '42501';
    end if;
    update public.cartes set revoquee_le = now() where membre_id = p_membre and revoquee_le is null;
  else
    if not public.voit_cibles() then
      raise exception 'Accès refusé' using errcode = '42501';
    end if;
    if not exists (select 1 from public.cibles where id = p_cible and type = 'personne') then
      raise exception 'Les cartes sont réservées aux personnes' using errcode = '23514';
    end if;
    update public.cibles set numero_beneficiaire = public.nouveau_numero('B')
      where id = p_cible and numero_beneficiaire is null;
    update public.cartes set revoquee_le = now() where cible_id = p_cible and revoquee_le is null;
  end if;
  insert into public.cartes (membre_id, cible_id) values (p_membre, p_cible) returning * into carte;
  return carte;
end;
$$;

-- Les numéros déjà attribués passent au nouveau format (le QR code des cartes
-- imprimées reste valable : il porte le jeton, pas le numéro).
update public.membres set numero_adherent = public.nouveau_numero('M') where numero_adherent !~ '^M[0-9]{2}-';
update public.cibles set numero_beneficiaire = public.nouveau_numero('B')
  where numero_beneficiaire is not null and numero_beneficiaire !~ '^B[0-9]{2}-';
