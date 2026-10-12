import { useState } from 'react'
import { CloudOff, Loader2, RefreshCw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { oublierEchecs, synchroniser, useHorsLigne } from '@/lib/horsligne'

/** Bandeau d'état du réseau : hors connexion, envois en attente, envois refusés. */
export function BandeauHorsLigne() {
  const { file, echecs, enLigne, synchro } = useHorsLigne()
  const [detail, setDetail] = useState(false)
  if (enLigne && !file.length && !echecs.length) return null
  return (
    <>
      {!enLigne || file.length ? (
        <div className={`no-print flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm ${enLigne ? 'bg-[#e3eefb] text-[#0b4f94]' : 'bg-[#3a3a3a] text-white'}`}>
          {synchro ? <Loader2 className="size-4 animate-spin" /> : enLigne ? <RefreshCw className="size-4" /> : <CloudOff className="size-4" />}
          <span className="flex-1">
            {!enLigne ? <><b>Hors connexion.</b> Vous pouvez continuer : consultation, appel, scan des cartes, suivis. </> : null}
            {file.length ? <><b>{file.length}</b> enregistrement{file.length > 1 ? 's' : ''} en attente{enLigne ? (synchro ? ' — envoi en cours…' : '') : ', envoyé' + (file.length > 1 ? 's' : '') + ' au retour du réseau'}.</> : null}
          </span>
          {file.length ? <button className="underline underline-offset-2" onClick={() => setDetail(true)}>Voir</button> : null}
          {enLigne && file.length && !synchro ? <button className="font-semibold underline underline-offset-2" onClick={() => synchroniser()}>Envoyer maintenant</button> : null}
        </div>
      ) : null}
      {echecs.length ? (
        <div className="no-print flex flex-wrap items-center gap-3 bg-[#fbe6e6] px-4 py-2 text-sm text-[#a32b2b]">
          <TriangleAlert className="size-4" />
          <span className="flex-1"><b>{echecs.length}</b> enregistrement{echecs.length > 1 ? 's' : ''} fait{echecs.length > 1 ? 's' : ''} hors connexion {echecs.length > 1 ? 'ont été refusés' : 'a été refusé'} (droits, action clôturée…).</span>
          <button className="underline underline-offset-2" onClick={() => setDetail(true)}>Voir</button>
        </div>
      ) : null}
      <Dialog open={detail} onOpenChange={setDetail}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enregistrements faits hors connexion</DialogTitle>
            <DialogDescription>Ils sont gardés dans ce téléphone et envoyés dans l'ordre dès que le réseau revient.</DialogDescription>
          </DialogHeader>
          {file.length ? (
            <div className="space-y-1">
              <div className="text-sm font-semibold">En attente ({file.length})</div>
              {file.map((x) => (
                <div key={x.id} className="flex justify-between gap-2 rounded-lg bg-muted/50 px-3 py-1.5 text-sm">
                  <span className="min-w-0 truncate">{x.libelle}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{new Date(x.cree_le).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </div>
          ) : null}
          {echecs.length ? (
            <div className="space-y-1">
              <div className="text-sm font-semibold text-destructive">Refusés ({echecs.length})</div>
              {echecs.map((x) => (
                <div key={x.id} className="rounded-lg bg-[#fbe6e6]/60 px-3 py-1.5 text-sm">
                  <div>{x.libelle}</div>
                  <div className="text-xs text-muted-foreground">{x.erreur}</div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">Refaites ces saisies une fois connecté si elles sont toujours utiles.</p>
              <Button size="sm" variant="secondary" onClick={() => { oublierEchecs(); setDetail(false) }}>J'ai compris, effacer cette liste</Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
