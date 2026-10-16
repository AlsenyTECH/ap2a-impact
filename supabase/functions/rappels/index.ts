// Rappels par email.
//
// Appels possibles :
//  * pg_cron (en-tête x-cle-rappels, comparé à la clé du coffre) : { type: 'hebdo' | 'seances' | 'sms', jour? } → envoi à tous
//    les membres concernés, ou SMS automatiques aux bénéficiaires (heures réglées dans l'application) ;
//  * un membre connecté (jeton de session) : { type, apercu: true } → l'email lui est envoyé à lui seul,
//    même vide, pour voir à quoi il ressemble ; droit « rappels.regler » : envoi à tous ;
//  * droit « membres.gerer » / « partenaires.gerer » : { type: 'invitation', membre_id | acces_id } → invitation ;
//  * droit « membres.comptes » : { type: 'changer_email', membre_id, email } → change l'adresse de connexion ;
//  * droit « rappels.regler » : { type: 'sms_test', telephone } → SMS d'essai (vérifie les crédits Brevo).
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
interface Destinataire { membre_id: string; prenom: string; email: string; suivis?: LigneSuivi[]; retards?: LigneSuivi[]; seances?: LigneSeance[]; seuil?: number; fenetre?: number; jour?: string }
interface RappelSms { cible_id: string; telephone_intl: string; objet: string; objet_id: string; sms: string }

const echapper = (t: unknown) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const dateFr = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' })
const heure = (h: string | null) => (h ? h.slice(0, 5).replace(':', 'h') : '')

const PIED_RAPPELS = `Vous recevez cet email car vous êtes membre de l'AP2A. Pour ne plus le recevoir, ouvrez l'application,
      cliquez sur votre nom en bas du menu et désactivez les rappels.`

function gabarit(titre: string, corps: string, pied = PIED_RAPPELS) {
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
      ${pied}
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
  // Fenêtre réglée dans l'application (7 jours par défaut).
  const n = d.fenetre ?? 7
  const periode = n === 7 ? 'cette semaine' : n === 1 ? "d'ici demain" : `dans les ${n} prochains jours`
  let corps = `<p style="margin:0 0 16px">Bonjour ${echapper(d.prenom)},</p>`
  if (suivis.length) {
    corps += `<p style="margin:0 0 12px">Vous avez <b>${suivis.length} suivi${suivis.length > 1 ? 's' : ''}</b> à faire ${periode}${enRetard ? `, dont <b style="color:#b42318">${enRetard} en retard</b>` : ''}.
      Un appel suffit : demandez à la personne ce qu'elle est devenue, puis renseignez sa situation.</p>${tableauSuivis(suivis)}`
  } else {
    corps += `<p style="margin:0 0 12px">Aucun suivi à faire pour vous ${periode}. Merci !</p>`
  }
  if (retards.length) {
    corps += `<h2 style="margin:28px 0 8px;font-size:16px">Retards de plus de ${d.seuil ?? 15} jours (toute l'association)</h2>
      <p style="margin:0 0 8px;font-size:13px;color:#5c6b64">En tant que gestionnaire, vous pouvez relancer le chargé du suivi ou le confier à quelqu'un d'autre.</p>
      ${tableauSuivis(retards, true)}`
  }
  corps += bouton(`${APP}/suivis`, 'Ouvrir mes suivis')
  const sujet = suivis.length
    ? `${suivis.length} suivi${suivis.length > 1 ? 's' : ''} à faire ${periode}${enRetard ? ` (${enRetard} en retard)` : ''}`
    : retards.length ? `${retards.length} suivi(s) en retard dans l'association` : n === 7 ? 'Vos suivis de la semaine' : 'Vos prochains suivis'
  return { sujet: `AP2A — ${sujet}`, html: gabarit(n === 7 ? 'Vos suivis de la semaine' : 'Vos prochains suivis', corps), nb: suivis.length + retards.length }
}

function emailSeances(d: Destinataire) {
  const seances = d.seances ?? []
  const quand = d.jour && d.jour > new Date().toISOString().slice(0, 10) ? 'demain' : "aujourd'hui"
  let corps = `<p style="margin:0 0 16px">Bonjour ${echapper(d.prenom)},</p>`
  if (!seances.length) corps += `<p>Aucune séance prévue ${quand}.</p>`
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
  const sujet = !seances.length ? `Aucune séance ${quand}` : seances.length === 1
    ? `Séance ${seances[0].numero} ${quand}${seances[0].heure_debut ? ` à ${heure(seances[0].heure_debut)}` : ''} — pensez à faire l'appel`
    : `${seances.length} séances ${quand} — pensez à faire l'appel`
  return { sujet: `AP2A — ${sujet}`, html: gabarit(quand === 'demain' ? 'Séances de demain' : "Séances d'aujourd'hui", corps), nb: seances.length }
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

/**
 * SMS en caractères simples (alphabet GSM) : un accent comme « ê » ferait passer
 * le message en Unicode, limité à 70 caractères, donc facturé deux ou trois fois.
 */
export function versGsm(t: string) {
  return t
    .replace(/[«»“”]/g, '"').replace(/[’‘]/g, "'").replace(/[–—]/g, '-').replace(/…/g, '...')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E\n]/g, '')
    .slice(0, 160)
}

/** Numéro international sans « + » (Sénégal par défaut). */
export function numeroIntl(t: string) {
  let d = t.replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.length === 9) d = `221${d}`
  return d
}

async function envoyerSms(numero: string, texte: string, expediteur: string) {
  const brevo = secret('BREVO_API_KEY')
  if (!brevo) throw new Error('Les SMS passent par Brevo : secret BREVO_API_KEY manquant')
  const r = await fetch('https://api.brevo.com/v3/transactionalSMS/sms', {
    method: 'POST',
    headers: { 'api-key': brevo, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: expediteur, recipient: numero, content: versGsm(texte), type: 'transactional' }),
  })
  if (!r.ok) {
    const detail = (await r.text()).slice(0, 300)
    if (r.status === 402 || /credit/i.test(detail)) throw new Error(`Crédits SMS Brevo insuffisants : achetez des crédits SMS dans Brevo. Détail : ${detail}`)
    throw new Error(`SMS refusé (${r.status}) : ${detail}`)
  }
}

/** Invitation à créer son compte (membre ou partenaire). */
function emailInvitation(prenom: string | null, email: string, partenaire: string | null) {
  const corps = `<p style="margin:0 0 16px">Bonjour${prenom ? ` ${echapper(prenom)}` : ''},</p>
    <p style="margin:0 0 12px">${partenaire
      ? `L'association AP2A vous donne accès à son application, en tant que partenaire (${echapper(partenaire)}), pour suivre les actions que nous menons ensemble.`
      : `Vous êtes inscrit(e) comme membre de l'AP2A. Vous pouvez maintenant utiliser l'application de l'association : actions, suivis des bénéficiaires, événements, votre carte de membre…`}</p>
    <p style="margin:0 0 6px"><b>Pour créer votre accès :</b></p>
    <ol style="margin:0 0 12px;padding-left:20px;line-height:1.7">
      <li>Ouvrez l'application avec le bouton ci-dessous ;</li>
      <li>choisissez <b>« Première connexion »</b> ;</li>
      <li>saisissez cette adresse : <b>${echapper(email)}</b> ;</li>
      <li>choisissez un mot de passe, puis confirmez avec le lien reçu par email.</li>
    </ol>
    ${bouton(APP, "Ouvrir l'application")}
    <p style="margin:16px 0 0;font-size:12px;color:#5c6b64">Sur téléphone, vous pouvez ensuite l'ajouter à l'écran d'accueil comme une application.</p>`
  return { sujet: partenaire ? 'AP2A — Votre accès partenaire' : 'AP2A — Votre accès à l\'application', html: gabarit('Bienvenue dans l\'application AP2A', corps, "Cet email vous a été envoyé par le bureau de l'AP2A. Si vous n'êtes pas concerné(e), vous pouvez l'ignorer.") }
}

const repondre = (corps: unknown, statut = 200) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { ...cors, 'content-type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { type = 'hebdo', apercu = false, membre_id = null, acces_id = null, email: nouvelEmail = null, jour: jourRecu = null, telephone = null } = await req.json().catch(() => ({}))
    if (!['hebdo', 'seances', 'sms', 'sms_test', 'invitation', 'changer_email'].includes(type)) return repondre({ erreur: 'Type inconnu' }, 400)
    const jour = typeof jourRecu === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(jourRecu) ? jourRecu : null

    const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    // Le membre a-t-il ce droit (selon son rôle) ?
    const droit = async (membreId: string, permission: string) =>
      (await service.rpc('membre_a_permission', { p_membre: membreId, p: permission })).data === true
    // Les droits de la fiche visée sont-ils tous des droits de l'appelant ?
    const couvre = async (appelant: string, vise: string) => {
      const [a, v] = await Promise.all([service.rpc('droits_membre', { p_membre: appelant }), service.rpc('droits_membre', { p_membre: vise })])
      const mes = new Set((a.data as string[] | null) ?? [])
      return !a.error && !v.error && ((v.data as string[] | null) ?? []).every((d) => mes.has(d))
    }

    // Changer l'adresse de connexion d'un membre dont l'accès est activé : réservé à l'administrateur.
    if (type === 'changer_email') {
      const jeton = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
      const { data: u } = await service.auth.getUser(jeton)
      const { data: moi } = u?.user ? await service.from('membres').select('id, role, actif').eq('user_id', u.user.id).maybeSingle() : { data: null }
      if (!moi?.actif || !(await droit(moi.id, 'membres.comptes'))) return repondre({ erreur: "Il faut le droit « Gérer les comptes de connexion » pour changer une adresse de connexion" }, 403)
      const email = String(nouvelEmail ?? '').trim().toLowerCase()
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return repondre({ erreur: 'Adresse email invalide' }, 400)
      const { data: m } = await service.from('membres').select('id, user_id, email').eq('id', membre_id).maybeSingle()
      if (!m) return repondre({ erreur: 'Membre introuvable' }, 404)
      if (m.id === moi.id || !(await couvre(moi.id, m.id))) return repondre({ erreur: "Vous ne pouvez pas changer l'adresse de connexion de quelqu'un qui a plus de droits que vous (ni la vôtre)" }, 403)
      const { data: autreMembre } = await service.from('membres').select('id').eq('email', email).neq('id', m.id).maybeSingle()
      const { data: autreAcces } = await service.from('acces_partenaires').select('id').eq('email', email).maybeSingle()
      if (autreMembre || autreAcces) return repondre({ erreur: 'Cette adresse est déjà utilisée par une autre fiche' }, 400)
      if (m.user_id) {
        const { error } = await service.auth.admin.updateUserById(m.user_id, { email, email_confirm: true })
        if (error) return repondre({ erreur: /already|registered|exists/i.test(error.message) ? 'Cette adresse a déjà un compte dans l\'application' : error.message }, 400)
      }
      const { error } = await service.from('membres').update({ email }).eq('id', m.id)
      if (error) return repondre({ erreur: error.message }, 400)
      return repondre({ ok: true })
    }

    // SMS d'essai : réservé à l'administrateur.
    if (type === 'sms_test') {
      const jeton = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
      const { data: u } = await service.auth.getUser(jeton)
      const { data: moi } = u?.user ? await service.from('membres').select('id, role, actif').eq('user_id', u.user.id).maybeSingle() : { data: null }
      if (!moi?.actif || !(await droit(moi.id, 'rappels.regler'))) return repondre({ erreur: "Il faut le droit « Régler les rappels » pour envoyer un SMS d'essai" }, 403)
      const numero = numeroIntl(String(telephone ?? ''))
      if (numero.length < 11 || numero.length > 15) return repondre({ erreur: 'Numéro de téléphone invalide' }, 400)
      const { data: r } = await service.from('reglages_rappels').select('sms_expediteur').single()
      try {
        await envoyerSms(numero, "AP2A : ceci est un SMS d'essai. Les rappels par SMS fonctionnent.", r?.sms_expediteur ?? 'AP2A')
        await service.from('rappels_envoyes').insert({ type: 'sms-test', membre_id: moi.id, email: `+${numero}`, nb: 1, statut: 'envoye' })
        return repondre({ envoyes: 1, echecs: 0, erreurs: [] })
      } catch (e) {
        await service.from('rappels_envoyes').insert({ type: 'sms-test', membre_id: moi.id, email: `+${numero}`, nb: 1, statut: 'echec', erreur: (e as Error).message })
        return repondre({ envoyes: 0, echecs: 1, erreurs: [(e as Error).message] }, 502)
      }
    }

    // Invitation d'un membre ou d'un partenaire : réservée au bureau.
    if (type === 'invitation') {
      const jeton = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
      const { data: u } = await service.auth.getUser(jeton)
      const { data: moi } = u?.user ? await service.from('membres').select('id, role, actif').eq('user_id', u.user.id).maybeSingle() : { data: null }
      if (!moi?.actif) return repondre({ erreur: 'Non autorisé' }, 403)
      if (membre_id && !(await droit(moi.id, 'membres.gerer'))) return repondre({ erreur: 'Il faut le droit « Gérer les membres » pour inviter un membre' }, 403)
      if (!membre_id && !(await droit(moi.id, 'partenaires.gerer'))) return repondre({ erreur: 'Il faut le droit « Gérer les partenaires » pour inviter un partenaire' }, 403)
      let destinataire: { prenom: string | null; email: string | null; user_id: string | null; partenaire: string | null; membre: string | null } | null = null
      if (membre_id) {
        const { data } = await service.from('membres').select('id, prenom, email, user_id, actif').eq('id', membre_id).maybeSingle()
        if (data?.actif && !(await couvre(moi.id, data.id))) return repondre({ erreur: "Vous ne pouvez pas inviter quelqu'un qui a plus de droits que vous" }, 403)
        if (data?.actif) destinataire = { prenom: data.prenom, email: data.email, user_id: data.user_id, partenaire: null, membre: data.id }
      } else if (acces_id) {
        const { data } = await service.from('acces_partenaires').select('prenom, email, user_id, revoque_le, partenaire:partenaires(nom, sigle)').eq('id', acces_id).maybeSingle()
        const p = data?.partenaire as unknown as { nom: string; sigle: string | null } | null
        if (data && !data.revoque_le) destinataire = { prenom: data.prenom, email: data.email, user_id: data.user_id, partenaire: p?.sigle || p?.nom || 'partenaire', membre: null }
      }
      if (!destinataire?.email) return repondre({ erreur: 'Personne introuvable ou sans adresse email' }, 400)
      if (destinataire.user_id) return repondre({ erreur: 'Son accès est déjà activé' }, 400)
      const { sujet, html } = emailInvitation(destinataire.prenom, destinataire.email, destinataire.partenaire)
      try {
        await envoyer(destinataire.email, sujet, html)
        await service.from('rappels_envoyes').insert({ type: 'invitation', membre_id: destinataire.membre, email: destinataire.email, nb: 1, statut: 'envoye' })
        return repondre({ envoyes: 1, echecs: 0, erreurs: [] })
      } catch (e) {
        await service.from('rappels_envoyes').insert({ type: 'invitation', membre_id: destinataire.membre, email: destinataire.email, nb: 1, statut: 'echec', erreur: (e as Error).message })
        return repondre({ envoyes: 0, echecs: 1, erreurs: [(e as Error).message] }, 502)
      }
    }

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
      else if (!(await droit(m.id, 'rappels.regler'))) return repondre({ erreur: "Il faut le droit « Régler les rappels » pour envoyer les rappels à tous" }, 403)
    }

    // SMS automatiques aux bénéficiaires (avec leur accord) : pas d'aperçu.
    if (type === 'sms') {
      if (pour) return repondre({ erreur: 'Pas d\'aperçu pour les SMS : utilisez le SMS d\'essai' }, 400)
      const { data: r } = await service.from('reglages_rappels').select('sms_expediteur').single()
      const { data: lignes, error: e } = await service.rpc('donnees_rappels_sms', jour ? { p_jour: jour } : {})
      if (e) throw e
      // Un même texte vers un même numéro (plusieurs suivis, fiches qui partagent un
      // téléphone) ne part qu'une fois ; chaque rappel couvert est noté au journal.
      const groupes = new Map<string, RappelSms[]>()
      for (const l of (lignes ?? []) as RappelSms[]) {
        const cle = `${numeroIntl(l.telephone_intl)}|${l.sms}`
        groupes.set(cle, [...(groupes.get(cle) ?? []), l])
      }
      const noter = (liste: RappelSms[], statut: 'envoye' | 'echec', erreur?: string) =>
        service.from('rappels_cibles').insert(liste.map((l) => ({ cible_id: l.cible_id, objet: l.objet, objet_id: l.objet_id, canal: 'sms', statut, erreur: erreur ?? null })))
      const bilan = { envoyes: 0, echecs: 0, erreurs: [] as string[] }
      let plusDeCredits: string | null = null
      for (const [cle, liste] of groupes) {
        const numero = cle.split('|')[0]
        const erreur = plusDeCredits ?? (numero.length < 11 || numero.length > 15 ? `Numéro invalide pour un SMS (${liste[0].telephone_intl})` : null)
        if (erreur) {
          bilan.echecs++
          await noter(liste, 'echec', erreur)
          continue
        }
        try {
          await envoyerSms(numero, liste[0].sms, r?.sms_expediteur ?? 'AP2A')
          bilan.envoyes++
          await noter(liste, 'envoye')
        } catch (err) {
          bilan.echecs++
          bilan.erreurs.push((err as Error).message)
          await noter(liste, 'echec', (err as Error).message)
          // Plus de crédits : les suivants sont notés en échec (boutons manuels dans l'application).
          if (/Crédits SMS/.test((err as Error).message)) plusDeCredits = (err as Error).message
        }
      }
      return repondre(bilan, bilan.echecs && !bilan.envoyes ? 502 : 200)
    }

    const { data, error } = await service.rpc('donnees_rappels_jour', { p_type: type, p_membre: pour, p_jour: type === 'seances' ? jour : null })
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
