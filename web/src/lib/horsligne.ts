import { useSyncExternalStore } from 'react'
import { get, set } from 'idb-keyval'
import { supabase } from './supabase'

/**
 * Mode hors connexion : les enregistrements faits sans réseau (appel,
 * scan des cartes, pointage, suivis) sont gardés dans le téléphone
 * (IndexedDB) puis envoyés dans l'ordre dès que le réseau revient.
 * Les règles d'accès de la base s'appliquent à l'envoi, comme d'habitude.
 */
export type Operation =
  | { kind: 'upsert'; table: string; valeurs: Record<string, unknown>[]; onConflict: string; ignoreDuplicates?: boolean }
  | { kind: 'insert'; table: string; valeurs: Record<string, unknown> }
  | { kind: 'update'; table: string; valeurs: Record<string, unknown>; filtre: Record<string, string> }
  | { kind: 'delete'; table: string; filtre: Record<string, string> }

export interface EnAttente { id: string; cree_le: string; libelle: string; op: Operation; erreur?: string }

const CLE = 'ap2a-file-attente'
let file: EnAttente[] = []
let echecs: EnAttente[] = []
let enLigne = typeof navigator === 'undefined' ? true : navigator.onLine
let synchro = false
// Après un envoi réussi : rafraîchir les données affichées.
let apresEnvoi: () => void = () => undefined
const abonnes = new Set<() => void>()
let instantane = { file, echecs, enLigne, synchro }
const prevenir = () => { instantane = { file, echecs, enLigne, synchro }; abonnes.forEach((f) => f()) }
const sauver = () => set(CLE, { file, echecs }).catch(() => undefined)

/** Erreur de réseau (pas de connexion), à distinguer d'un refus de la base. */
export const estErreurReseau = (e: unknown) => {
  const m = String((e as { message?: string })?.message ?? e)
  return !navigator.onLine || /Failed to fetch|NetworkError|Load failed|network|fetch failed/i.test(m)
}

async function jouer(op: Operation) {
  const t = supabase.from(op.table)
  const r = op.kind === 'upsert' ? await t.upsert(op.valeurs, { onConflict: op.onConflict, ignoreDuplicates: op.ignoreDuplicates })
    : op.kind === 'insert' ? await t.insert(op.valeurs)
    : op.kind === 'update' ? await Object.entries(op.filtre).reduce((q, [k, v]) => q.eq(k, v), t.update(op.valeurs))
    : await Object.entries(op.filtre).reduce((q, [k, v]) => q.eq(k, v), t.delete())
  if (r.error) throw r.error
}

/**
 * Exécute l'opération si possible ; sans réseau, la met en file d'attente.
 * Renvoie « envoye » ou « en_attente ». Une erreur de la base est remontée.
 */
export async function executer(libelle: string, op: Operation): Promise<'envoye' | 'en_attente'> {
  if (navigator.onLine && !file.length) {
    try {
      await jouer(op)
      return 'envoye'
    } catch (e) {
      if (!estErreurReseau(e)) throw e
    }
  }
  file = [...file, { id: crypto.randomUUID(), cree_le: new Date().toISOString(), libelle, op }]
  prevenir()
  await sauver()
  if (navigator.onLine) synchroniser()
  return 'en_attente'
}

/** Envoie la file dans l'ordre ; s'arrête au premier problème de réseau. */
export async function synchroniser(apres: () => void = apresEnvoi) {
  if (synchro || !file.length || !navigator.onLine) return
  synchro = true
  prevenir()
  try {
    while (file.length) {
      const [premier] = file
      try {
        await jouer(premier.op)
      } catch (e) {
        if (estErreurReseau(e)) break
        // Refusé par la base (droits, action clôturée…) : mis de côté pour le montrer.
        echecs = [...echecs, { ...premier, erreur: String((e as { message?: string })?.message ?? e) }]
      }
      file = file.slice(1)
      await sauver()
      prevenir()
    }
  } finally {
    synchro = false
    prevenir()
    apres()
  }
}

export function oublierEchecs() {
  echecs = []
  prevenir()
  sauver()
}

/** Vide tout (déconnexion) : rien ne doit rester sur un téléphone partagé. */
export const nbEnAttente = () => file.length

export async function viderHorsLigne() {
  file = []
  echecs = []
  prevenir()
  await sauver()
}

export async function initialiserHorsLigne(apres: () => void) {
  apresEnvoi = apres
  const garde = await get<{ file: EnAttente[]; echecs: EnAttente[] }>(CLE).catch(() => undefined)
  if (garde) { file = garde.file ?? []; echecs = garde.echecs ?? [] }
  prevenir()
  const changer = () => { enLigne = navigator.onLine; prevenir(); if (enLigne) synchroniser(apres) }
  window.addEventListener('online', changer)
  window.addEventListener('offline', changer)
  // Filet de sécurité : nouvel essai régulier tant qu'il reste des envois.
  setInterval(() => { if (file.length) synchroniser(apres) }, 30_000)
  synchroniser(apres)
}

export const useHorsLigne = () => useSyncExternalStore(
  (f) => { abonnes.add(f); return () => abonnes.delete(f) },
  () => instantane,
)
