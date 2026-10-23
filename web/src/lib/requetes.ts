import { CHAMPS_ROLE } from './droits'
import { useQuery } from '@tanstack/react-query'
import { supabase, verifier } from './supabase'
import { normaliser, trier } from './recherche'
import type { Action, Beneficiaire, CategorieCible, Cible, FamilleCible, Membre, Partenaire, ProfilPersonne, TypeAction, Zone } from './types'

// Référentiels : changent rarement, gardés en cache 10 minutes.
const LONG = 10 * 60 * 1000

export const useZones = () =>
  useQuery({
    queryKey: ['zones'],
    staleTime: LONG,
    queryFn: async () => verifier(await supabase.from('zones').select('*').order('chemin')) as Zone[],
  })

// Tous les types, y compris désactivés (anciennes actions) ; le formulaire ne propose que l'actif.
export const useTypesAction = () =>
  useQuery({
    queryKey: ['types_action'],
    staleTime: LONG,
    queryFn: async () => verifier(await supabase.from('types_action').select('*').order('libelle')) as TypeAction[],
  })

export const usePartenaires = () =>
  useQuery({
    queryKey: ['partenaires'],
    staleTime: LONG,
    queryFn: async () => verifier(await supabase.from('partenaires').select('*').order('nom')) as Partenaire[],
  })

// Référentiels des cibles : tout est chargé (y compris l'inactif, pour
// afficher les anciennes fiches) ; les formulaires ne proposent que l'actif.
export const useFamilles = () =>
  useQuery({
    queryKey: ['familles_cible'],
    staleTime: LONG,
    queryFn: async () => verifier(await supabase.from('familles_cible').select('*').order('ordre').order('nom')) as FamilleCible[],
  })

export const useCategories = () =>
  useQuery({
    queryKey: ['categories_cible'],
    staleTime: LONG,
    queryFn: async () => verifier(await supabase.from('categories_cible').select('*').order('ordre').order('libelle')) as CategorieCible[],
  })

export const useProfils = () =>
  useQuery({
    queryKey: ['profils_personne'],
    staleTime: LONG,
    queryFn: async () => verifier(await supabase.from('profils_personne').select('*').order('ordre').order('libelle')) as ProfilPersonne[],
  })

export const useMembres = () =>
  useQuery({
    queryKey: ['membres'],
    queryFn: async () => verifier(await supabase.from('membres').select(`*, ${CHAMPS_ROLE}`).order('nom').order('prenom')) as Membre[],
  })

const CHAMPS_CIBLE = '*, zone:zones(chemin, nom), referent:membres!cibles_referent_id_fkey(prenom, nom, numero_adherent), categorie:categories_cible(libelle, famille:familles_cible(nom))'

export type TriCibles = 'recentes' | 'anciennes' | 'nom' | 'prenom' | 'jeunes' | 'ages' | 'groupe'
const ORDRES: Record<TriCibles, [string, boolean]> = {
  recentes: ['cree_le', false], anciennes: ['cree_le', true], nom: ['nom', true], prenom: ['prenom', true],
  jeunes: ['date_naissance', false], ages: ['date_naissance', true], groupe: ['groupes', true],
}

/**
 * Recherche de cibles, filtrées par nature et/ou par une liste de catégories.
 * La recherche porte sur le nom, le prénom, le téléphone, le métier et les
 * groupes (un membre du « GPF Jigeen » se trouve en tapant « jigeen »).
 */
export const useCibles = (recherche: string, type: string, categories?: number[] | null, tri: TriCibles = 'recentes', ids?: string[] | null, retirees = false) =>
  useQuery({
    queryKey: ['cibles', recherche, type, categories, tri, ids, retirees],
    queryFn: async () => {
      const [colonne, croissant] = ORDRES[tri]
      // Un numéro tapé avec des espaces (« 77 123 45 ») est cherché en chiffres ;
      // sinon chaque mot doit apparaître (sans accents ni majuscules).
      const telephone = /^[\d\s+]+$/.test(recherche.trim()) ? recherche.replace(/\D/g, '').replace(/^(00)?221(?=\d{9}$)/, '') : ''
      const mots = telephone ? [telephone] : normaliser(recherche).replace(/[%_,()]/g, ' ').split(/\s+/).filter(Boolean)
      const requete = (lot?: string[]) => {
        let q = supabase.from('cibles').select(CHAMPS_CIBLE).order(colonne, { ascending: croissant, nullsFirst: false }).order('nom').limit(300)
        if (type) q = q.eq('type', type)
        if (categories) q = q.in('categorie_id', categories)
        if (lot) q = q.in('id', lot)
        // Cibles retirées : absentes des listes et des recherches, sauf si on les demande.
        else q = retirees ? q.not('retiree_le', 'is', null) : q.is('retiree_le', null)
        for (const mot of mots) q = q.like('recherche', `%${mot}%`)
        return q
      }
      if (!ids) return verifier(await requete()) as Cible[]
      // Personnes d'un import : lues par lots de 100 (longueur d'adresse), puis triées.
      const lots = Array.from({ length: Math.ceil(ids.length / 100) }, (_, i) => ids.slice(i * 100, i * 100 + 100))
      const toutes = (await Promise.all(lots.map(async (lot) => verifier(await requete(lot)) as Cible[]))).flat()
      return trier(toutes, (c) => (c as unknown as Record<string, string | number | null>)[colonne], croissant ? 'asc' : 'desc')
    },
  })

export const useCible = (id: string) =>
  useQuery({
    queryKey: ['cible', id],
    queryFn: async () => verifier(await supabase.from('cibles').select(CHAMPS_CIBLE).eq('id', id).single()) as Cible,
  })

/** Parcours d'une cible : les actions dont elle a bénéficié et ce qu'elle y a reçu. */
export const useParcours = (cibleId: string) =>
  useQuery({
    queryKey: ['parcours', cibleId],
    queryFn: async () =>
      verifier(
        await supabase
          .from('beneficiaires')
          .select('*, action:actions(id, titre, date_debut, date_fin, statut, responsable_id, cree_par, type:types_action(libelle, code)), apports(*, partenaire:partenaires(nom, sigle)), suivis(*), via:cibles!beneficiaires_via_collectif_id_fkey(id, nom)')
          .eq('cible_id', cibleId)
          .order('ajoute_le', { ascending: false }),
      ) as Beneficiaire[],
  })

const CHAMPS_ACTION = '*, type:types_action(libelle, code), responsable:membres!actions_responsable_id_fkey(prenom, nom, numero_adherent), zone:zones(chemin, nom), seances(count)'

export const useActions = (statut: string) =>
  useQuery({
    queryKey: ['actions', statut],
    queryFn: async () => {
      // Des plus récentes aux plus anciennes.
      let q = supabase.from('actions').select(CHAMPS_ACTION).order('date_debut', { ascending: false }).order('cree_le', { ascending: false }).limit(500)
      if (statut) q = q.eq('statut', statut)
      return verifier(await q) as Action[]
    },
  })

export const useAction = (id: string) =>
  useQuery({
    queryKey: ['action', id],
    queryFn: async () => verifier(await supabase.from('actions').select(CHAMPS_ACTION).eq('id', id).single()) as Action,
  })
