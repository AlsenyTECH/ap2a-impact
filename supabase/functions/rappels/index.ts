// Rappels par email.
//
// Appels possibles :
//  * pg_cron (en-tête x-cle-rappels, comparé à la clé du coffre) : { type: 'hebdo' | 'seances' } → envoi à tous les membres concernés ;
//  * un membre connecté (jeton de session) : { type, apercu: true } → l'email lui est envoyé à lui seul,
//    même vide, pour voir à quoi il ressemble ; un administrateur peut aussi déclencher l'envoi à tous.
//
// Secrets : EXPEDITEUR_EMAIL, et BREVO_API_KEY ou RESEND_API_KEY.
// La clé des appels planifiés est dans le coffre de la base (fonction cle_rappels).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const APP = 'https://ap2a-impact.vercel.app'
const VERT = '#0b7a57'
const OR = '#e9a812'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface LigneSuivi { cible_id: string; nom: string; telephone: string | null; action: string; echeance: number; date_prevue: string; retard: number; charge?: string }
interface LigneSeance { action_id: string; action: string; numero: number; theme: string | null; heure_debut: string | null; heure_fin: string | null; lieu: string | null; inscrits: number }
interface Destinataire { membre_id: string; prenom: string; email: string; suivis?: LigneSuivi[]; retards?: LigneSuivi[]; seances?: LigneSeance[] }

const echapper = (t: unknown) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const dateFr = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' })
const heure = (h: string | null) => (h ? h.slice(0, 5).replace(':', 'h') : '')

function gabarit(titre: string, corps: string) {
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#f3f4f0;font-family:Arial,Helvetica,sans-serif;color:#13211b">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden">
    <tr><td style="background:#0c2a20;padding:18px 24px;color:#ffffff">
      <div style="font-size:18px;font-weight:bold">AP2A</div>
      <div style="font-size:12px;color:#b9cdc4">Association Parcelles Assainies en Action</div>
    </td></tr>
    <tr><td style="padding:24px">
      <h1 style="margin:0 0 12px;font-size:20px">${titre}</h1>
      ${corps}
    </td></tr>
    <tr><td style="padding:16px 24px;border-top:1px solid #e2e6df;font-size:11px;color:#5c6b64">
      Vous recevez cet email car vous êtes membre de l'AP2A. Pour ne plus le recevoir, ouvrez l'application,
      cliquez sur votre nom en bas du menu et désactivez les rappels.
    </td></tr>
  </table></td></tr></table></body></html>`
}

const bouton = (lien: string, texte: string) =>
  `<p style="margin:20px 0 4px"><a href="${lien}" style="display:inline-block;background:${VERT};color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">${texte}</a></p>`

function tableauSuivis(lignes: LigneSuivi[], avecCharge = false) {
  const rangs = lignes.map((l) => {
    const etat = l.retard > 0
      ? `<span style="color:#b42318;font-weight:bold">${l.retard} j de retard</span>`
      : l.retard === 0 ? `<span style="color:${OR};font-weight:bold">aujourd'hui</span>` : `le ${dateFr(l.date_prevue)}`
    return `<tr>
      <td style="padding:10px 8px;border-bottom:1px solid #eef1ec">
        <a href="${APP}/cibles/${l.cible_id}" style="color:#13211b;font-weight:bold;text-decoration:none">${echapper(l.nom)}</a>
        ${l.telephone ? `<br><a href="tel:${echapper(l.telephone.replace(/\s/g, ''))}" style="color:${VERT};font-size:13px">${echapper(l.telephone)}</a>` : ''}
        <div style="font-size:12px;color:#5c6b64">${echapper(l.action)} · suivi à ${l.echeance} mois${avecCharge && l.charge ? ` · ${echapper(l.charge)}` : ''}</div>
      </td>
      <td style="padding:10px 8px;border-bottom:1px solid #eef1ec;font-size:13px;text-align:right;white-space:nowrap">${etat}</td>
    </tr>`
  }).join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px">${rangs}</table>`
}

function emailHebdo(d: Destinataire) {
  const suivis = d.suivis ?? []
  const retards = d.retards ?? []
  const enRetard = suivis.filter((s) => s.retard > 0).length
  let corps = `<p style="margin:0 0 16px">Bonjour ${echapper(d.prenom)},</p>`
  if (suivis.length) {
    corps += `<p style="margin:0 0 12px">Vous avez <b>${suivis.length} suivi${suivis.length > 1 ? 's' : ''}</b> à faire cette semaine${enRetard ? `, dont <b style="color:#b42318">${enRetard} en retard</b>` : ''}.
      Un appel suffit : demandez à la personne ce qu'elle est devenue, puis renseignez sa situation.</p>${tableauSuivis(suivis)}`
  } else {
    corps += `<p style="margin:0 0 12px">Aucun suivi à faire pour vous cette semaine. Merci !</p>`
  }
  if (retards.length) {
    corps += `<h2 style="margin:28px 0 8px;font-size:16px">Retards de plus de 15 jours (toute l'association)</h2>
      <p style="margin:0 0 8px;font-size:13px;color:#5c6b64">En tant que gestionnaire, vous pouvez relancer le chargé du suivi ou le confier à quelqu'un d'autre.</p>
      ${tableauSuivis(retards, true)}`
  }
  corps += bouton(`${APP}/suivis`, 'Ouvrir mes suivis')
  const sujet = suivis.length
    ? `${suivis.length} suivi${suivis.length > 1 ? 's' : ''} à faire cette semaine${enRetard ? ` (${enRetard} en retard)` : ''}`
    : retards.length ? `${retards.length} suivi(s) en retard dans l'association` : 'Vos suivis de la semaine'
  return { sujet: `AP2A — ${sujet}`, html: gabarit('Vos suivis de la semaine', corps), nb: suivis.length + retards.length }
}

function emailSeances(d: Destinataire) {
  const seances = d.seances ?? []
  let corps = `<p style="margin:0 0 16px">Bonjour ${echapper(d.prenom)},</p>`
  if (!seances.length) corps += `<p>Aucune séance prévue aujourd'hui.</p>`
  for (const s of seances) {
    corps += `<div style="border:1px solid #e2e6df;border-radius:10px;padding:14px 16px;margin:0 0 12px">
      <div style="font-weight:bold;font-size:15px">${echapper(s.action)}</div>
      <div style="font-size:14px;margin-top:4px">Séance ${s.numero}${s.theme ? ` — ${echapper(s.theme)}` : ''}</div>
      <div style="font-size:13px;color:#5c6b64;margin-top:4px">
        ${s.heure_debut ? `🕘 ${heure(s.heure_debut)}${s.heure_fin ? ` – ${heure(s.heure_fin)}` : ''}` : ''}
        ${s.lieu ? ` · 📍 ${echapper(s.lieu)}` : ''} · ${s.inscrits} inscrit(s)
      </div>
      ${bouton(`${APP}/actions/${s.action_id}`, "Faire l'appel")}
    </div>`
  }
  const sujet = !seances.length ? "Aucune séance aujourd'hui" : seances.length === 1
    ? `Séance ${seances[0].numero} aujourd'hui${seances[0].heure_debut ? ` à ${heure(seances[0].heure_debut)}` : ''} — pensez à faire l'appel`
    : `${seances.length} séances aujourd'hui — pensez à faire l'appel`
  return { sujet: `AP2A — ${sujet}`, html: gabarit("Séances d'aujourd'hui", corps), nb: seances.length }
}

/** Lit un secret en tolérant accents, majuscules et espaces dans son nom (« EXPÉDITEUR_EMAIL »…). */
function secret(nom: string) {
  const simple = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s-]+/g, '_').toUpperCase()
  const exact = Deno.env.get(nom)
  // Valeur collée avec des guillemets ou des espaces : on les retire.
  const propre = (v?: string) => v?.trim().replace(/^["'«\s]+|["'»\s]+$/g, '') || undefined
  if (exact) return propre(exact)
  return propre(Object.entries(Deno.env.toObject()).find(([k]) => simple(k) === nom)?.[1])
}

async function envoyer(a: string, sujet: string, html: string) {
  const expediteur = secret('EXPEDITEUR_EMAIL')
  if (!expediteur) throw new Error('Secret EXPEDITEUR_EMAIL manquant')
  const brevo = secret('BREVO_API_KEY')
  const resend = secret('RESEND_API_KEY')
  if (brevo?.startsWith('xsmtpsib-')) {
    throw new Error("BREVO_API_KEY contient une clé SMTP (xsmtpsib-…). Il faut une clé API (xkeysib-…) : Brevo → SMTP & API → onglet « Clés API ».")
  }
  const r = brevo
    ? await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': brevo, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender: { name: 'AP2A', email: expediteur }, to: [{ email: a }], subject: sujet, htmlContent: html }),
    })
    : resend
    ? await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${resend}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: `AP2A <${expediteur}>`, to: [a], subject: sujet, html }),
    })
    : null
  if (!r) throw new Error('Aucun service d\'envoi configuré (BREVO_API_KEY ou RESEND_API_KEY)')
  if (!r.ok) {
    const detail = (await r.text()).slice(0, 300)
    if (brevo && r.status === 401) {
      throw new Error(`Brevo ne reconnaît pas la clé API (elle commence par « ${brevo.slice(0, 8)}… », ${brevo.length} caractères). Générez une nouvelle clé API (xkeysib-…) et remplacez le secret BREVO_API_KEY. Détail : ${detail}`)
    }
    throw new Error(`Envoi refusé (${r.status}) : ${detail}`)
  }
}

const repondre = (corps: unknown, statut = 200) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { ...cors, 'content-type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { type = 'hebdo', apercu = false } = await req.json().catch(() => ({}))
    if (type !== 'hebdo' && type !== 'seances') return repondre({ erreur: 'Type inconnu' }, 400)

    const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

    // Qui appelle ? La tâche planifiée (clé secrète) ou un membre connecté.
    const recue = req.headers.get('x-cle-rappels')
    const cle = recue ? (await service.rpc('cle_rappels')).data as string | null : null
    let pour: string | null = null
    if (!(cle && recue === cle)) {
      const jeton = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
      const { data: u } = await service.auth.getUser(jeton)
      if (!u?.user) return repondre({ erreur: 'Non autorisé' }, 401)
      const { data: m } = await service.from('membres').select('id, role, actif').eq('user_id', u.user.id).maybeSingle()
      if (!m?.actif) return repondre({ erreur: 'Non autorisé' }, 403)
      if (apercu) pour = m.id
      else if (m.role !== 'admin') return repondre({ erreur: "Seul un administrateur peut envoyer les rappels à tous" }, 403)
    }

    const { data, error } = await service.rpc('donnees_rappels', { p_type: type, p_membre: pour })
    if (error) throw error
    const destinataires = (data ?? []) as Destinataire[]
    // Aperçu sans séance aujourd'hui : on envoie quand même un email, pour voir la présentation.
    if (pour && !destinataires.length) {
      const { data: m } = await service.from('membres').select('id, prenom, email').eq('id', pour).single()
      if (!m?.email) return repondre({ erreur: "Votre fiche membre n'a pas d'adresse email" }, 400)
      destinataires.push({ membre_id: m.id, prenom: m.prenom, email: m.email, suivis: [], retards: [], seances: [] })
    }

    const bilan = { envoyes: 0, echecs: 0, erreurs: [] as string[] }
    for (const d of destinataires) {
      const { sujet, html, nb } = type === 'hebdo' ? emailHebdo(d) : emailSeances(d)
      try {
        await envoyer(d.email, apercu ? `[Aperçu] ${sujet}` : sujet, html)
        bilan.envoyes++
        await service.from('rappels_envoyes').insert({ type: apercu ? `${type}-apercu` : type, membre_id: d.membre_id, email: d.email, nb, statut: 'envoye' })
      } catch (e) {
        bilan.echecs++
        bilan.erreurs.push(`${d.email} : ${(e as Error).message}`)
        await service.from('rappels_envoyes').insert({ type: apercu ? `${type}-apercu` : type, membre_id: d.membre_id, email: d.email, nb, statut: 'echec', erreur: (e as Error).message })
      }
    }
    return repondre(bilan, bilan.echecs && !bilan.envoyes ? 502 : 200)
  } catch (e) {
    return repondre({ erreur: (e as Error).message }, 500)
  }
})
