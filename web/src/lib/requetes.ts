import { useQuery } from '@tanstack/react-query'
import { supabase, verifier } from './supabase'
import type { Action, Beneficiaire, Cible, Membre, Partenaire, TypeAction, Zone } from './types'

// Référentiels : changent rarement, gardés en cache 10 minutes.
const LONG = 10 * 60 * 1000

export const useZones = () =>
  useQuery({
    queryKey: ['zones'],
    staleTime: LONG,
    queryFn: async () => verifier(await supabase.from('zones').select('*').order('chemin')) as Zone[],
  })

export const useTypesAction = () =>
  useQuery({
    queryKey: ['types_action'],
    staleTime: LONG,
    queryFn: async () => verifier(await supabase.from('types_action').select('*').eq('actif', true).order('id')) as TypeAction[],
  })

export const usePartenaires = () =>
  useQuery({
    queryKey: ['partenaires'],
    staleTime: LONG,
    queryFn: async () => verifier(await supabase.from('partenaires').select('*').order('nom')) as Partenaire[],
  })

export const useMembres = () =>
  useQuery({
    queryKey: ['membres'],
    queryFn: async () => verifier(await supabase.from('membres').select('*').order('nom').order('prenom')) as Membre[],
  })

const CHAMPS_CIBLE = '*, zone:zones(chemin, nom), referent:membres!cibles_referent_id_fkey(prenom, nom)'

export const useCibles = (recherche: string, type: string) =>
  useQuery({
    queryKey: ['cibles', recherche, type],
    queryFn: async () => {
      let q = supabase.from('cibles').select(CHAMPS_CIBLE).order('cree_le', { ascending: false }).limit(200)
      if (type) q = q.eq('type', type)
      const mots = recherche.trim()
      if (mots) {
        // Recherche sur le nom, le prénom ou le téléphone (chiffres seuls).
        const motif = `%${mots.replace(/[%_,()]/g, ' ')}%`
        const chiffres = mots.replace(/\D/g, '')
        q = q.or([`nom.ilike.${motif}`, `prenom.ilike.${motif}`, ...(chiffres.length >= 3 ? [`telephone_normalise.like.%${chiffres}%`] : [])].join(','))
      }
      return verifier(await q) as Cible[]
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
          .select('*, action:actions(id, titre, date_debut, date_fin, statut, responsable_id, cree_par, type:types_action(libelle, code)), apports(*, partenaire:partenaires(nom, sigle)), suivis(*)')
          .eq('cible_id', cibleId)
          .order('ajoute_le', { ascending: false }),
      ) as Beneficiaire[],
  })

const CHAMPS_ACTION = '*, type:types_action(libelle, code), responsable:membres!actions_responsable_id_fkey(prenom, nom), zone:zones(chemin, nom)'

export const useActions = (statut: string) =>
  useQuery({
    queryKey: ['actions', statut],
    queryFn: async () => {
      let q = supabase.from('actions').select(CHAMPS_ACTION).order('date_debut', { ascending: false }).limit(200)
      if (statut) q = q.eq('statut', statut)
      return verifier(await q) as Action[]
    },
  })

export const useAction = (id: string) =>
  useQuery({
    queryKey: ['action', id],
    queryFn: async () => verifier(await supabase.from('actions').select(CHAMPS_ACTION).eq('id', id).single()) as Action,
  })
