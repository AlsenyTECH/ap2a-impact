// Rappels par email.
//
// Appels possibles :
//  * pg_cron (en-tête x-cle-rappels, comparé à la clé du coffre) : { type: 'hebdo' | 'seances' | 'sms', jour? } → envoi à tous
//    les membres concernés, ou SMS automatiques aux bénéficiaires (heures réglées dans l'application) ;
//  * un membre connecté (jeton de session) : { type, apercu: true } → l'email lui est envoyé à lui seul,
//    même vide, pour voir à quoi il ressemble ; droit « rappels.regler » : envoi à tous ;
//  * droit « membres.gerer » / « partenaires.gerer » : { type: 'invitation', membre_id | acces_id } → lien personnel
//    à usage unique pour choisir son mot de passe (l'inscription libre est fermée) ;
//  * droit « membres.gerer » : { type: 'invitations', membre_ids, canal: 'email' | 'sms' | 'whatsapp' } → invitations
//    groupées ; un membre sans email se connecte avec son téléphone. WhatsApp : les liens sont rendus à
//    l'application, qui ouvre chaque message (pas d'envoi automatique sans l'API WhatsApp Business) ;
//    il faut alors aussi « membres.comptes ». Quotas : 200 invitations par jour et par personne, une par
//    membre toutes les 10 minutes ; SMS vers le Sénégal (+221) seulement ;
//  * droit « membres.comptes » : { type: 'changer_email', membre_id, email } → change l'adresse de connexion ;
//  * droit « rappels.regler » : { type: 'sms_test', telephone } → SMS d'essai (vérifie les crédits Brevo) ;
//  * droit « membres.comptes » : { type: 'reinitialiser_2fa', membre_id } → téléphone perdu.
// Un rôle qui exige la double authentification n'a aucun droit ici tant que la session n'est pas aal2.
//
// Secrets : EXPEDITEUR_EMAIL, et BREVO_API_KEY ou RESEND_API_KEY.
// La clé des appels planifiés est dans le coffre de la base (fonction cle_rappels).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4'

const APP = 'https://ap2a-impact.vercel.app'
const VERT = '#0b7a57'
const OR = '#e9a812'

// Seule l'application appelle cette fonction depuis un navigateur.
const cors = {
  'Access-Control-Allow-Origin': APP,
  Vary: 'Origin',
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
    // Le détail du fournisseur reste dans les journaux du serveur.
    console.error('envoi email refusé', r.status, (await r.text()).slice(0, 500))
    if (brevo && r.status === 401) throw new Error("Brevo ne reconnaît pas la clé API : générez une nouvelle clé API (xkeysib-…) et remplacez le secret BREVO_API_KEY.")
    throw new Error(`Envoi de l'email refusé par le fournisseur (code ${r.status})`)
  }
}

/**
 * SMS en caractères simples (alphabet GSM) : un accent comme « ê » ferait passer
 * le message en Unicode, limité à 70 caractères, donc facturé deux ou trois fois.
 */
export function versGsm(t: string, max = 160) {
  return t
    .replace(/[«»“”]/g, '"').replace(/[’‘]/g, "'").replace(/[–—]/g, '-').replace(/…/g, '...')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E\n]/g, '')
    .slice(0, max)
}

/** Numéro international sans « + » (Sénégal par défaut). */
export function numeroIntl(t: string) {
  let d = t.replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  // « 0771234567 » (habitude d'autres pays) : le 0 initial n'existe pas au Sénégal.
  if (d.length === 10 && d.startsWith('0')) d = d.slice(1)
  if (d.length === 9) d = `221${d}`
  return d
}

async function envoyerSms(numero: string, texte: string, expediteur: string, max = 160) {
  const brevo = secret('BREVO_API_KEY')
  if (!brevo) throw new Error('Les SMS passent par Brevo : secret BREVO_API_KEY manquant')
  const r = await fetch('https://api.brevo.com/v3/transactionalSMS/sms', {
    method: 'POST',
    headers: { 'api-key': brevo, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: expediteur, recipient: numero, content: versGsm(texte, max), type: 'transactional' }),
  })
  if (!r.ok) {
    const detail = (await r.text()).slice(0, 500)
    console.error('envoi SMS refusé', r.status, detail)
    if (r.status === 402 || /credit/i.test(detail)) throw new Error('Crédits SMS Brevo insuffisants : achetez des crédits SMS dans Brevo.')
    if (/addon/i.test(detail)) throw new Error("L'option SMS n'est pas activée sur le compte Brevo.")
    throw new Error(`SMS refusé par le fournisseur (code ${r.status})`)
  }
}

/** Seuls les numéros sénégalais (+221, mobiles 7x et fixes 3x) : pas de SMS surtaxés à l'étranger. */
const numeroSenegal = (intl: string) => /^221[37]\d{8}$/.test(intl)

/** Prénom inséré dans un message : lettres, espaces, tirets, apostrophes ; 40 caractères au plus (pas de lien ni de texte piégé). */
const prenomSur = (p: string | null) => (p ?? '').normalize('NFC').replace(/[^\p{L}\p{M} '\-]/gu, '').trim().slice(0, 40) || null

/** Comparaison à temps constant (clé des appels planifiés). */
function egal(a: string, b: string) {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  let d = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return d === 0
}

// Connexion par téléphone : Supabase identifie un compte par une adresse email ; un membre sans
// email reçoit une adresse interne tirée de son numéro. « .invalid » est réservé (RFC 2606) :
// rien ne peut y être envoyé. Même règle dans l'application (web/src/lib/identifiant.ts).
const DOMAINE_TELEPHONE = 'tel.ap2a.invalid'
const emailDeTelephone = (t: string) => `${numeroIntl(t)}@${DOMAINE_TELEPHONE}`
function identifiantLisible(email: string) {
  if (!email.endsWith(`@${DOMAINE_TELEPHONE}`)) return email
  const d = email.split('@')[0]
  const local = d.startsWith('221') && d.length === 12 ? d.slice(3) : `+${d}`
  return local.length === 9 ? local.replace(/^(\d{2})(\d{3})(\d{2})(\d{2})$/, '$1 $2 $3 $4') : local
}

// deno-lint-ignore no-explicit-any
type Service = SupabaseClient<any, 'public', any>

/**
 * Lien personnel à usage unique pour choisir son mot de passe. Court (le jeton seul, dans le « # »
 * de l'adresse) : il tient dans un SMS et ne dépend pas des adresses de redirection de Supabase.
 *
 * Règles (audit) : un compte déjà relié à la fiche reçoit un nouveau lien s'il n'a pas encore de
 * mot de passe ; une fiche sans compte n'obtient qu'un compte NEUF, créé par cette invitation — jamais
 * un compte qui existait déjà (inscription libre, compte d'une autre personne).
 */
async function lienPersonnel(service: Service, email: string, userId: string | null) {
  const actif = async (id: string) => (await service.rpc('compte_active', { p_user: id })).data === true
  let identifiant = email.toLowerCase()
  if (userId) {
    const { data: u } = await service.auth.admin.getUserById(userId)
    if (!u?.user?.email) throw new Error('Compte de connexion introuvable')
    if (await actif(userId)) throw new Error('Son accès est déjà activé')
    identifiant = u.user.email.toLowerCase()
  }
  let existant = false
  let g = await service.auth.admin.generateLink({ type: 'invite', email: identifiant })
  if (g.error && /already|registered|exists/i.test(g.error.message)) {
    existant = true
    g = await service.auth.admin.generateLink({ type: 'recovery', email: identifiant })
  }
  const jeton = g.data?.properties?.hashed_token
  if (g.error || !jeton || !g.data?.user) {
    console.error('generateLink', g.error?.message)
    throw new Error("Lien d'invitation impossible pour le moment")
  }
  const compte = g.data.user
  if (userId && compte.id !== userId) throw new Error('Compte de connexion incohérent : contactez l\'administrateur')
  if (!userId && existant) {
    throw new Error(`Un compte existe déjà avec l'identifiant ${identifiantLisible(identifiant)} sans être relié à cette fiche : l'administrateur doit le vérifier dans Supabase`)
  }
  if (await actif(compte.id)) throw new Error('Son accès est déjà activé')
  const invite = g.data.properties.verification_type === 'invite'
  return { lien: `${APP}/activer#${invite ? 'i' : 'r'}=${jeton}`, userId: compte.id, emailCompte: identifiant, identifiant: identifiantLisible(identifiant) }
}

/** Le compte est-il relié à une autre fiche (membre ou partenaire) que celle-ci ? */
async function reliéAilleurs(service: Service, userId: string, membreId: string | null, accesId: string | null) {
  const [m, a] = await Promise.all([
    service.from('membres').select('prenom, nom').eq('user_id', userId).neq('id', membreId ?? '00000000-0000-0000-0000-000000000000').maybeSingle(),
    service.from('acces_partenaires').select('prenom, nom').eq('user_id', userId).neq('id', accesId ?? '00000000-0000-0000-0000-000000000000').maybeSingle(),
  ])
  const autre = m.data ?? a.data
  return autre ? `${autre.prenom ?? ''} ${autre.nom}`.trim() : null
}

const messageInvitationTexte = (prenom: string | null, identifiant: string, lien: string) =>
  `Bonjour${prenomSur(prenom) ? ` ${prenomSur(prenom)}` : ''}, l'AP2A vous invite à utiliser son application.\n`
  + `Votre identifiant : ${identifiant}\n`
  + `Choisissez votre mot de passe avec ce lien personnel (une seule fois) :\n${lien}`

/** Invitation à créer son compte (membre ou partenaire). */
function emailInvitation(prenom: string | null, lien: string, partenaire: string | null, identifiant?: string) {
  const corps = `<p style="margin:0 0 16px">Bonjour${prenom ? ` ${echapper(prenom)}` : ''},</p>
    <p style="margin:0 0 12px">${partenaire
      ? `L'association AP2A vous donne accès à son application, en tant que partenaire (${echapper(partenaire)}), pour suivre les actions que nous menons ensemble.`
      : `Vous êtes inscrit(e) comme membre de l'AP2A. Vous pouvez maintenant utiliser l'application de l'association : actions, suivis des bénéficiaires, événements, votre carte de membre…`}</p>
    <p style="margin:0 0 12px">Ouvrez ce lien pour <b>choisir votre mot de passe</b> : votre accès sera activé aussitôt.${identifiant ? `<br>Votre identifiant de connexion : <b>${echapper(identifiant)}</b>` : ''}</p>
    ${bouton(lien, 'Créer mon mot de passe')}
    <p style="margin:16px 0 0;font-size:12px;color:#5c6b64">Ce lien est personnel : il ne sert qu'une fois et expire au bout d'un délai limité. Ne le transférez à personne.
      S'il a expiré, demandez au bureau une nouvelle invitation.</p>`
  return { sujet: partenaire ? 'AP2A — Votre accès partenaire' : 'AP2A — Votre accès à l\'application', html: gabarit('Bienvenue dans l\'application AP2A', corps, "Cet email vous a été envoyé par le bureau de l'AP2A. Si vous n'êtes pas concerné(e), vous pouvez l'ignorer.") }
}

const repondre = (corps: unknown, statut = 200) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { ...cors, 'content-type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { type = 'hebdo', apercu = false, membre_id = null, acces_id = null, email: nouvelEmail = null, jour: jourRecu = null, telephone = null, membre_ids = [], canal = 'email' } = await req.json().catch(() => ({}))
    if (!['hebdo', 'seances', 'sms', 'sms_test', 'invitation', 'invitations', 'changer_email', 'reinitialiser_2fa'].includes(type)) return repondre({ erreur: 'Type inconnu' }, 400)
    const jour = typeof jourRecu === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(jourRecu) ? jourRecu : null

    const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    // Le membre a-t-il ce droit (selon son rôle) ?
    const droit = async (membreId: string, permission: string) =>
      (await service.rpc('membre_a_permission', { p_membre: membreId, p: permission })).data === true
    // Les droits de la fiche visée sont-ils tous des droits de l'appelant ?
    const couvre = async (appelant: string, vise: string) => {
      const [a, v] = await Promise.all([service.rpc('droits_membre', { p_membre: appelant }), service.rpc('droits_membre', { p_membre: vise })])
      const mes = new Set((a.data as string[] | null) ?? [])
      // Fiche sans rôle lisible : on refuse (jamais « aucun droit, donc couvert »).
      return !a.error && !v.error && Array.isArray(v.data) && (v.data as string[]).every((d) => mes.has(d))
    }

    // Membre connecté qui appelle (jeton de session), ou null. « mfaOk » : la double authentification
    // exigée par son rôle est validée dans cette session (niveau aal2 du jeton, signé par Supabase).
    const appelant = async () => {
      const jeton = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
      const { data: u } = await service.auth.getUser(jeton)
      if (!u?.user) return null
      const { data: m } = await service.from('membres').select('id, prenom, nom, numero_adherent, actif, role_info:roles!membres_role_id_fkey(mfa_obligatoire)').eq('user_id', u.user.id).maybeSingle()
      if (!m?.actif) return null
      let aal = 'aal1'
      try { aal = JSON.parse(atob(jeton.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).aal ?? 'aal1' } catch { /* jeton illisible : aal1 */ }
      const exige = (m.role_info as unknown as { mfa_obligatoire: boolean } | null)?.mfa_obligatoire === true
      return { id: m.id, prenom: m.prenom, nom: m.nom, nomComplet: `${m.prenom} ${m.nom} (${m.numero_adherent})`, mfaOk: !exige || aal === 'aal2' }
    }
    // Droit de la personne qui appelle : aucun tant que la double authentification exigée n'est pas validée.
    const droitDe = async (moi: { id: string; mfaOk: boolean }, permission: string) => moi.mfaOk && await droit(moi.id, permission)
    // Nombre d'envois récents (quotas).
    const recents = async (filtre: { type?: string; typeLike?: string; par?: string; membre?: string }, minutes: number) => {
      let q = service.from('rappels_envoyes').select('id', { count: 'exact', head: true }).gte('envoye_le', new Date(Date.now() - minutes * 60_000).toISOString())
      if (filtre.type) q = q.eq('type', filtre.type)
      if (filtre.typeLike) q = q.like('type', filtre.typeLike)
      if (filtre.par) q = q.eq('envoye_par', filtre.par)
      if (filtre.membre) q = q.eq('membre_id', filtre.membre).in('statut', ['envoye', 'lien'])
      return (await q).count ?? 0
    }

    // Changer l'adresse de connexion d'un membre dont l'accès est activé : réservé à l'administrateur.
    if (type === 'changer_email') {
      const moi = await appelant()
      if (!moi || !(await droitDe(moi, 'membres.comptes'))) return repondre({ erreur: "Il faut le droit « Gérer les comptes de connexion » pour changer une adresse de connexion" }, 403)
      const email = String(nouvelEmail ?? '').trim().toLowerCase()
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.endsWith('.invalid')) return repondre({ erreur: 'Adresse email invalide' }, 400)
      const { data: m } = await service.from('membres').select('id, user_id, email, prenom, actif').eq('id', membre_id).maybeSingle()
      if (!m) return repondre({ erreur: 'Membre introuvable' }, 404)
      if (!m.actif) return repondre({ erreur: "Réactivez d'abord ce membre" }, 400)
      if (m.id === moi.id || !(await couvre(moi.id, m.id))) return repondre({ erreur: "Vous ne pouvez pas changer l'adresse de connexion de quelqu'un qui a plus de droits que vous (ni la vôtre)" }, 403)
      const { data: autreMembre } = await service.from('membres').select('id').ilike('email', email).neq('id', m.id).maybeSingle()
      const { data: autreAcces } = await service.from('acces_partenaires').select('id').ilike('email', email).maybeSingle()
      if (autreMembre || autreAcces) return repondre({ erreur: 'Cette adresse est déjà utilisée par une autre fiche' }, 400)
      if (m.user_id) {
        const { error } = await service.auth.admin.updateUserById(m.user_id, { email, email_confirm: true })
        if (error) return repondre({ erreur: /already|registered|exists/i.test(error.message) ? 'Cette adresse a déjà un compte dans l\'application' : 'Changement impossible pour le moment' }, 400)
      }
      const { error } = await service.from('membres').update({ email }).eq('id', m.id)
      if (error) return repondre({ erreur: 'Changement impossible pour le moment' }, 400)
      // L'ancienne adresse est prévenue : un changement non voulu se voit tout de suite.
      if (m.email && m.email.toLowerCase() !== email && !m.email.endsWith('.invalid')) {
        const corps = `<p style="margin:0 0 12px">Bonjour${prenomSur(m.prenom) ? ` ${echapper(prenomSur(m.prenom))}` : ''},</p>
          <p style="margin:0 0 12px">L'adresse de connexion de votre compte AP2A vient d'être remplacée par <b>${echapper(email)}</b>, par ${echapper(moi.nomComplet)}.</p>
          <p style="margin:0 0 12px">Si vous n'êtes pas au courant, prévenez <b>immédiatement</b> le président ou l'administrateur de l'association.</p>`
        await envoyer(m.email, "AP2A — L'adresse de connexion de votre compte a changé", gabarit('Changement de votre adresse de connexion', corps,
          "Message de sécurité envoyé automatiquement par l'application AP2A.")).catch((e) => console.error('alerte ancienne adresse', e))
      }
      return repondre({ ok: true })
    }

    // Téléphone perdu : l'administrateur réinitialise la double authentification d'un membre, qui est prévenu.
    if (type === 'reinitialiser_2fa') {
      const moi = await appelant()
      if (!moi || !(await droitDe(moi, 'membres.comptes'))) return repondre({ erreur: "Il faut le droit « Gérer les comptes de connexion » (et votre double authentification validée)" }, 403)
      const { data: m } = await service.from('membres').select('id, user_id, email, prenom, nom').eq('id', membre_id).maybeSingle()
      if (!m?.user_id) return repondre({ erreur: "Ce membre n'a pas de compte de connexion" }, 404)
      if (m.id === moi.id || !(await couvre(moi.id, m.id))) return repondre({ erreur: "Vous ne pouvez pas réinitialiser la double authentification de quelqu'un qui a plus de droits que vous (ni la vôtre)" }, 403)
      const { data: f, error } = await service.auth.admin.mfa.listFactors({ userId: m.user_id })
      if (error) return repondre({ erreur: 'Réinitialisation impossible pour le moment' }, 500)
      for (const facteur of f?.factors ?? []) await service.auth.admin.mfa.deleteFactor({ id: facteur.id, userId: m.user_id })
      // Ses sessions ouvertes sont fermées : il se reconnecte et réactive la double authentification.
      await service.auth.admin.signOut(m.user_id, 'global').catch(() => undefined)
      await service.from('journal').insert({ membre_id: moi.id, auteur_nom: moi.nomComplet, table_nom: 'double_authentification', operation: 'REINITIALISATION', ligne_id: m.id, libelle: `${m.prenom} ${m.nom}` })
      if (m.email && !m.email.endsWith('.invalid')) {
        const corps = `<p style="margin:0 0 12px">Bonjour${prenomSur(m.prenom) ? ` ${echapper(prenomSur(m.prenom))}` : ''},</p>
          <p style="margin:0 0 12px">La double authentification de votre compte AP2A vient d'être réinitialisée par ${echapper(moi.nomComplet)}. À votre prochaine connexion, vous l'activerez à nouveau avec votre téléphone.</p>
          <p style="margin:0 0 12px">Si vous n'avez rien demandé, prévenez <b>immédiatement</b> le président ou l'administrateur de l'association.</p>`
        await envoyer(m.email, 'AP2A — Double authentification réinitialisée', gabarit('Double authentification réinitialisée', corps,
          "Message de sécurité envoyé automatiquement par l'application AP2A.")).catch((e) => console.error('alerte 2fa', e))
      }
      return repondre({ ok: true, facteurs: f?.factors?.length ?? 0 })
    }

    // SMS d'essai : réservé à qui règle les rappels, 5 par jour.
    if (type === 'sms_test') {
      const moi = await appelant()
      if (!moi || !(await droitDe(moi, 'rappels.regler'))) return repondre({ erreur: "Il faut le droit « Régler les rappels » pour envoyer un SMS d'essai" }, 403)
      const numero = numeroIntl(String(telephone ?? ''))
      if (!numeroSenegal(numero)) return repondre({ erreur: 'Numéro sénégalais attendu (77, 78, 76, 70, 75 ou 33…)' }, 400)
      if (await recents({ type: 'sms-test', par: moi.id }, 24 * 60) >= 5) return repondre({ erreur: "5 SMS d'essai par jour au plus" }, 429)
      const { data: r } = await service.from('reglages_rappels').select('sms_expediteur').single()
      const journal = { type: 'sms-test', membre_id: moi.id, email: `+${numero}`, nb: 1, envoye_par: moi.id, envoye_par_nom: moi.nomComplet }
      try {
        await envoyerSms(numero, "AP2A : ceci est un SMS d'essai. Les rappels par SMS fonctionnent.", r?.sms_expediteur ?? 'AP2A')
        await service.from('rappels_envoyes').insert({ ...journal, statut: 'envoye' })
        return repondre({ envoyes: 1, echecs: 0, erreurs: [] })
      } catch (e) {
        await service.from('rappels_envoyes').insert({ ...journal, statut: 'echec', erreur: (e as Error).message })
        return repondre({ envoyes: 0, echecs: 1, erreurs: [(e as Error).message] }, 502)
      }
    }

    // Invitations groupées de membres (email, SMS ou WhatsApp).
    if (type === 'invitations') {
      const moi = await appelant()
      if (!moi || !(await droitDe(moi, 'membres.gerer'))) return repondre({ erreur: 'Il faut le droit « Gérer les membres » pour inviter des membres' }, 403)
      if (!['email', 'sms', 'whatsapp'].includes(canal)) return repondre({ erreur: 'Canal inconnu' }, 400)
      // WhatsApp : les liens d'accès sont remis à la personne qui invite ; il faut le droit sur les comptes.
      if (canal === 'whatsapp' && !(await droitDe(moi, 'membres.comptes'))) {
        return repondre({ erreur: "Les invitations par WhatsApp remettent les liens d'accès à la personne qui invite : il faut le droit « Gérer les comptes de connexion ». Utilisez l'email ou le SMS, ou demandez ce droit à l'administrateur." }, 403)
      }
      const ids = Array.isArray(membre_ids) ? [...new Set(membre_ids.map(String))].slice(0, 100) : []
      if (!ids.length) return repondre({ erreur: 'Aucun membre choisi' }, 400)
      // Quota : 200 invitations par personne et par jour.
      const dejaFaites = await recents({ typeLike: 'invitation%', par: moi.id }, 24 * 60)
      if (dejaFaites + ids.length > 200) return repondre({ erreur: `Quota atteint : 200 invitations par jour (${dejaFaites} déjà envoyées)` }, 429)
      const { data: fiches } = await service.from('membres').select('id, prenom, nom, email, telephone, user_id, actif').in('id', ids)
      const { data: r } = await service.from('reglages_rappels').select('sms_expediteur').single()
      const resultats: { membre_id: string; nom: string; statut: 'envoye' | 'lien' | 'echec'; erreur?: string; lien?: string; message?: string; telephone?: string }[] = []
      let plusDeCredits: string | null = null
      for (const m of fiches ?? []) {
        const nom = `${m.prenom} ${m.nom}`
        const journal = { type: `invitation-${canal}`, membre_id: m.id, nb: 1, envoye_par: moi.id, envoye_par_nom: moi.nomComplet }
        try {
          if (!m.actif) throw new Error('Membre inactif')
          if (m.id === moi.id) throw new Error('Pas vous-même')
          if (!(await couvre(moi.id, m.id))) throw new Error('A plus de droits que vous')
          if (canal === 'email' && !m.email) throw new Error("Pas d'adresse email")
          if (canal !== 'email' && !m.telephone) throw new Error('Pas de numéro de téléphone')
          const tel = m.telephone ? numeroIntl(m.telephone) : null
          if (canal === 'sms' && (!tel || !numeroSenegal(tel))) throw new Error(`Numéro non sénégalais ou invalide (${m.telephone})`)
          if (canal === 'whatsapp' && (!tel || tel.length < 11 || tel.length > 15)) throw new Error(`Numéro invalide (${m.telephone})`)
          if (canal === 'sms' && plusDeCredits) throw new Error(plusDeCredits)
          // Pas deux invitations au même membre en moins de 10 minutes.
          if (await recents({ typeLike: 'invitation%', membre: m.id }, 10) > 0) throw new Error('Déjà invité il y a moins de 10 minutes')
          // Identifiant : son email s'il en a un, sinon son téléphone.
          const { lien, userId, emailCompte, identifiant } = await lienPersonnel(service, m.email ?? emailDeTelephone(m.telephone!), m.user_id)
          const autre = await reliéAilleurs(service, userId, m.id, null)
          if (autre) throw new Error(`Cet identifiant (${identifiant}) sert déjà à ${autre}`)
          // Par email : seulement à l'adresse du compte lui-même.
          if (canal === 'email' && m.email!.toLowerCase() !== emailCompte) {
            throw new Error("L'email de la fiche ne correspond pas à son compte : utilisez « Changer l'adresse de connexion »")
          }
          if (m.user_id !== userId) {
            const { error } = await service.from('membres').update({ user_id: userId }).eq('id', m.id).is('user_id', null)
            if (error) throw new Error('Liaison du compte impossible')
          }
          const message = messageInvitationTexte(m.prenom, identifiant, lien)
          if (canal === 'whatsapp') {
            await service.from('rappels_envoyes').insert({ ...journal, email: `+${tel}`, statut: 'lien' })
            resultats.push({ membre_id: m.id, nom, statut: 'lien', lien, message, telephone: tel! })
            continue
          }
          if (canal === 'email') {
            const { sujet, html } = emailInvitation(m.prenom, lien, null, identifiant)
            await envoyer(emailCompte, sujet, html)
          } else {
            try {
              await envoyerSms(tel!, `AP2A : ${prenomSur(m.prenom) ?? 'Bonjour'}, activez votre acces a l'application. Identifiant : ${identifiant}. Lien personnel (une seule fois) : ${lien}`, r?.sms_expediteur ?? 'AP2A', 320)
            } catch (e) {
              if (/Crédits SMS|option SMS/.test((e as Error).message)) plusDeCredits = (e as Error).message
              throw e
            }
          }
          resultats.push({ membre_id: m.id, nom, statut: 'envoye' })
          await service.from('rappels_envoyes').insert({ ...journal, email: canal === 'email' ? emailCompte : `+${tel}`, statut: 'envoye' })
        } catch (e) {
          resultats.push({ membre_id: m.id, nom, statut: 'echec', erreur: (e as Error).message })
          await service.from('rappels_envoyes').insert({ ...journal, email: (canal === 'email' ? m.email : m.telephone) ?? '—', statut: 'echec', erreur: (e as Error).message })
        }
      }
      return repondre({ resultats })
    }

    // Invitation d'un membre ou d'un partenaire, par email.
    if (type === 'invitation') {
      const moi = await appelant()
      if (!moi) return repondre({ erreur: 'Non autorisé' }, 403)
      if (membre_id && !(await droitDe(moi, 'membres.gerer'))) return repondre({ erreur: 'Il faut le droit « Gérer les membres » pour inviter un membre' }, 403)
      if (!membre_id && !(await droitDe(moi, 'partenaires.gerer'))) return repondre({ erreur: 'Il faut le droit « Gérer les partenaires » pour inviter un partenaire' }, 403)
      let destinataire: { prenom: string | null; email: string | null; user_id: string | null; partenaire: string | null; membre: string | null; acces: string | null } | null = null
      if (membre_id) {
        const { data } = await service.from('membres').select('id, prenom, email, user_id, actif').eq('id', membre_id).maybeSingle()
        if (data?.actif && (data.id === moi.id || !(await couvre(moi.id, data.id)))) return repondre({ erreur: "Vous ne pouvez pas inviter quelqu'un qui a plus de droits que vous" }, 403)
        if (data?.actif) destinataire = { prenom: data.prenom, email: data.email, user_id: data.user_id, partenaire: null, membre: data.id, acces: null }
      } else if (acces_id) {
        const { data } = await service.from('acces_partenaires').select('id, prenom, email, user_id, revoque_le, partenaire:partenaires(nom, sigle)').eq('id', acces_id).maybeSingle()
        const p = data?.partenaire as unknown as { nom: string; sigle: string | null } | null
        if (data && !data.revoque_le) destinataire = { prenom: data.prenom, email: data.email, user_id: data.user_id, partenaire: p?.sigle || p?.nom || 'partenaire', membre: null, acces: data.id }
      }
      if (!destinataire?.email) return repondre({ erreur: 'Personne introuvable ou sans adresse email' }, 400)
      if (destinataire.membre && await recents({ typeLike: 'invitation%', membre: destinataire.membre }, 10) > 0) return repondre({ erreur: 'Déjà invité il y a moins de 10 minutes' }, 429)
      if (await recents({ typeLike: 'invitation%', par: moi.id }, 24 * 60) >= 200) return repondre({ erreur: 'Quota atteint : 200 invitations par jour' }, 429)
      // Lien personnel à usage unique, envoyé seulement à l'adresse du compte lui-même.
      let action: string
      try {
        const l = await lienPersonnel(service, destinataire.email, destinataire.user_id)
        const autre = await reliéAilleurs(service, l.userId, destinataire.membre, destinataire.acces)
        if (autre) throw new Error(`Ce compte sert déjà à ${autre}`)
        if (l.emailCompte !== destinataire.email.toLowerCase()) throw new Error("L'adresse de la fiche ne correspond pas à son compte de connexion")
        if (!destinataire.user_id) {
          const r = destinataire.membre
            ? await service.from('membres').update({ user_id: l.userId }).eq('id', destinataire.membre).is('user_id', null)
            : await service.from('acces_partenaires').update({ user_id: l.userId }).eq('id', destinataire.acces!).is('user_id', null)
          if (r.error) throw new Error('Liaison du compte impossible')
        }
        action = l.lien
      } catch (e) {
        return repondre({ erreur: (e as Error).message }, 400)
      }
      const { sujet, html } = emailInvitation(destinataire.prenom, action, destinataire.partenaire)
      const journal = { type: 'invitation', membre_id: destinataire.membre, email: destinataire.email, nb: 1, envoye_par: moi.id, envoye_par_nom: moi.nomComplet }
      try {
        await envoyer(destinataire.email, sujet, html)
        await service.from('rappels_envoyes').insert({ ...journal, statut: 'envoye' })
        return repondre({ envoyes: 1, echecs: 0, erreurs: [] })
      } catch (e) {
        await service.from('rappels_envoyes').insert({ ...journal, statut: 'echec', erreur: (e as Error).message })
        return repondre({ envoyes: 0, echecs: 1, erreurs: [(e as Error).message] }, 502)
      }
    }

    // Qui appelle ? La tâche planifiée (clé secrète) ou un membre connecté.
    const recue = req.headers.get('x-cle-rappels')
    const cle = recue ? (await service.rpc('cle_rappels')).data as string | null : null
    let pour: string | null = null
    const planifie = !!(cle && recue && egal(recue, cle))
    if (!planifie) {
      const m = await appelant()
      if (!m) return repondre({ erreur: 'Non autorisé' }, 401)
      if (apercu) {
        // Aperçu par email : 10 par heure et par membre (protège le quota d'envoi).
        if (await recents({ typeLike: '%-apercu', membre: m.id }, 60) >= 10) return repondre({ erreur: "10 aperçus par heure au plus : réessayez plus tard" }, 429)
        pour = m.id
      } else {
        if (!(await droitDe(m, 'rappels.regler'))) return repondre({ erreur: "Il faut le droit « Régler les rappels » pour envoyer les rappels à tous" }, 403)
        // Envoi manuel à tous : pas deux fois en une heure.
        if (await recents({ type }, 60) > 0) return repondre({ erreur: 'Ces rappels sont déjà partis il y a moins d\'une heure' }, 429)
        // SMS aux bénéficiaires : seulement pour hier, aujourd'hui ou demain.
        if (jour && Math.abs(Date.parse(jour) - Date.parse(new Date().toISOString().slice(0, 10))) > 86_400_000) {
          return repondre({ erreur: 'Date hors de la plage autorisée' }, 400)
        }
      }
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
        const erreur = plusDeCredits ?? (!numeroSenegal(numero) ? `Numéro non sénégalais ou invalide pour un SMS (${liste[0].telephone_intl})` : null)
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
          if (/Crédits SMS|option SMS/.test((err as Error).message)) plusDeCredits = (err as Error).message
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

    // Nouvel essai d'un lancement planifié (échec ou envoi partiel) : ceux qui ont
    // déjà reçu ce rappel aujourd'hui ne le reçoivent pas une seconde fois.
    const dejaServis = new Set<string>()
    if (planifie) {
      const debut = new Date()
      debut.setUTCHours(0, 0, 0, 0)   // heure de Dakar = UTC
      const { data: faits } = await service.from('rappels_envoyes').select('membre_id')
        .eq('type', type).eq('statut', 'envoye').gte('envoye_le', debut.toISOString())
      for (const f of faits ?? []) if (f.membre_id) dejaServis.add(f.membre_id)
    }

    const bilan = { envoyes: 0, echecs: 0, erreurs: [] as string[] }
    for (const d of destinataires) {
      if (dejaServis.has(d.membre_id)) continue
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
    // Détail technique dans les journaux du serveur seulement.
    console.error('rappels', e)
    return repondre({ erreur: 'Erreur interne : réessayez plus tard' }, 500)
  }
})
