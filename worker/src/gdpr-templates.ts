import type { CompanyInfo, DecryptedPII } from './scripts/_types.js'

export interface GdprBrokerInfo {
  name: string
  gdpr_lang?: string | null
  audience?: 'private' | 'professional' | 'both' | null
}

export interface GdprEmail {
  subject: string
  text: string
}

type Lang = 'fr' | 'en' | 'de' | 'es' | 'it' | 'nl' | 'pl'
const SUPPORTED: Lang[] = ['fr', 'en', 'de', 'es', 'it', 'nl', 'pl']

function normalizeLang(lang?: string | null): Lang {
  const l = (lang ?? '').toLowerCase()
  return (SUPPORTED as string[]).includes(l) ? (l as Lang) : 'en'
}

function formatAddress(pii: DecryptedPII): string {
  const a = pii.currentAddress
  return [a.street, [a.zip, a.city].filter(Boolean).join(' ').trim(), a.state, a.country]
    .filter(Boolean)
    .join(', ')
}

interface TemplateContext {
  name: string
  address: string
  dob: string
  brokerName: string
  companyBlock: string
}

interface CompanyLabels {
  heading: string
  name: string
  siren: string
  siret: string
  legalForm: string
}

const COMPANY_LABELS: Record<Lang, CompanyLabels> = {
  fr: { heading: 'Entreprise associée', name: 'Raison sociale', siren: 'SIREN', siret: 'SIRET', legalForm: 'Forme juridique' },
  en: { heading: 'Associated company', name: 'Company name', siren: 'SIREN', siret: 'SIRET', legalForm: 'Legal form' },
  de: { heading: 'Zugehöriges Unternehmen', name: 'Firmenname', siren: 'SIREN', siret: 'SIRET', legalForm: 'Rechtsform' },
  es: { heading: 'Empresa asociada', name: 'Razón social', siren: 'SIREN', siret: 'SIRET', legalForm: 'Forma jurídica' },
  it: { heading: 'Azienda associata', name: 'Ragione sociale', siren: 'SIREN', siret: 'SIRET', legalForm: 'Forma giuridica' },
  nl: { heading: 'Gekoppeld bedrijf', name: 'Bedrijfsnaam', siren: 'SIREN', siret: 'SIRET', legalForm: 'Rechtsvorm' },
  pl: { heading: 'Powiązana firma', name: 'Nazwa firmy', siren: 'SIREN', siret: 'SIRET', legalForm: 'Forma prawna' },
}

/** Localized company block, or '' when no company data. Leads with a blank line for inlining after the address. */
function buildCompanyBlock(lang: Lang, company?: CompanyInfo): string {
  if (!company) return ''
  const L = COMPANY_LABELS[lang]
  const lines = [`${L.name} : ${company.name}`]
  if (company.siren) lines.push(`${L.siren} : ${company.siren}`)
  if (company.siret) lines.push(`${L.siret} : ${company.siret}`)
  if (company.legalForm) lines.push(`${L.legalForm} : ${company.legalForm}`)
  return `\n\n${L.heading} :\n${lines.map(l => `- ${l}`).join('\n')}`
}

type Template = (ctx: TemplateContext) => GdprEmail

const TEMPLATES: Record<Lang, Template> = {
  fr: ({ name, address, dob, brokerName, companyBlock }) => ({
    subject: 'Demande d’effacement de données personnelles — RGPD Article 17 (GDPR)',
    text: `Madame, Monsieur,

Conformément à l’article 17 du Règlement Général sur la Protection des Données (RGPD/GDPR), je demande l’effacement de toutes mes données personnelles détenues par ${brokerName}.

Personne concernée :
- Nom : ${name}
- Date de naissance : ${dob}
- Adresse : ${address}${companyBlock}

Merci de supprimer ces données de vos bases et de cesser tout traitement les concernant, puis de me confirmer la suppression par retour d’email. Le RGPD prévoit un traitement sous 30 jours.

Cordialement,
${name}`,
  }),
  en: ({ name, address, dob, brokerName, companyBlock }) => ({
    subject: 'Personal data erasure request — GDPR Article 17',
    text: `Dear Data Protection Officer,

Under Article 17 of the General Data Protection Regulation (GDPR), I request the erasure of all my personal data held by ${brokerName}.

Data subject:
- Name: ${name}
- Date of birth: ${dob}
- Address: ${address}${companyBlock}

Please delete this data from your records, cease any processing of it, and confirm the deletion by reply email. The GDPR requires this within 30 days.

Kind regards,
${name}`,
  }),
  de: ({ name, address, dob, brokerName, companyBlock }) => ({
    subject: 'Antrag auf Löschung personenbezogener Daten — DSGVO Artikel 17 (GDPR)',
    text: `Sehr geehrte Damen und Herren,

gemäß Artikel 17 der Datenschutz-Grundverordnung (DSGVO/GDPR) beantrage ich die Löschung aller von ${brokerName} gespeicherten personenbezogenen Daten zu meiner Person.

Betroffene Person:
- Name: ${name}
- Geburtsdatum: ${dob}
- Anschrift: ${address}${companyBlock}

Bitte löschen Sie diese Daten aus Ihren Beständen, stellen Sie jede Verarbeitung ein und bestätigen Sie mir die Löschung per Antwort-E-Mail. Die DSGVO sieht eine Frist von 30 Tagen vor.

Mit freundlichen Grüßen,
${name}`,
  }),
  es: ({ name, address, dob, brokerName, companyBlock }) => ({
    subject: 'Solicitud de supresión de datos personales — RGPD Artículo 17 (GDPR)',
    text: `Estimados señores,

De conformidad con el artículo 17 del Reglamento General de Protección de Datos (RGPD/GDPR), solicito la supresión de todos mis datos personales en poder de ${brokerName}.

Interesado:
- Nombre: ${name}
- Fecha de nacimiento: ${dob}
- Dirección: ${address}${companyBlock}

Les ruego eliminen estos datos de sus registros, cesen cualquier tratamiento de los mismos y me confirmen la supresión por correo. El RGPD establece un plazo de 30 días.

Atentamente,
${name}`,
  }),
  it: ({ name, address, dob, brokerName, companyBlock }) => ({
    subject: 'Richiesta di cancellazione dei dati personali — GDPR Articolo 17',
    text: `Spettabile Titolare del trattamento,

ai sensi dell’articolo 17 del Regolamento Generale sulla Protezione dei Dati (GDPR), chiedo la cancellazione di tutti i miei dati personali detenuti da ${brokerName}.

Interessato:
- Nome: ${name}
- Data di nascita: ${dob}
- Indirizzo: ${address}${companyBlock}

Vi prego di eliminare questi dati dai vostri archivi, di cessare ogni trattamento e di confermarmi la cancellazione via email. Il GDPR prevede un termine di 30 giorni.

Cordiali saluti,
${name}`,
  }),
  nl: ({ name, address, dob, brokerName, companyBlock }) => ({
    subject: 'Verzoek tot wissen van persoonsgegevens — AVG Artikel 17 (GDPR)',
    text: `Geachte functionaris voor gegevensbescherming,

Op grond van artikel 17 van de Algemene Verordening Gegevensbescherming (AVG/GDPR) verzoek ik om verwijdering van al mijn persoonsgegevens die door ${brokerName} worden bewaard.

Betrokkene:
- Naam: ${name}
- Geboortedatum: ${dob}
- Adres: ${address}${companyBlock}

Verwijder deze gegevens uit uw bestanden, staak elke verwerking ervan en bevestig de verwijdering per e-mail. De AVG schrijft een termijn van 30 dagen voor.

Met vriendelijke groet,
${name}`,
  }),
  pl: ({ name, address, dob, brokerName, companyBlock }) => ({
    subject: 'Żądanie usunięcia danych osobowych — RODO Artykuł 17 (GDPR)',
    text: `Szanowni Państwo,

na podstawie artykułu 17 Ogólnego Rozporządzenia o Ochronie Danych (RODO/GDPR) żądam usunięcia wszystkich moich danych osobowych przetwarzanych przez ${brokerName}.

Osoba, której dane dotyczą:
- Imię i nazwisko: ${name}
- Data urodzenia: ${dob}
- Adres: ${address}${companyBlock}

Proszę o usunięcie tych danych z Państwa zbiorów, zaprzestanie ich przetwarzania oraz potwierdzenie usunięcia w wiadomości zwrotnej. RODO przewiduje termin 30 dni.

Z poważaniem,
${name}`,
  }),
}

export function buildGdprEmail(broker: GdprBrokerInfo, pii: DecryptedPII): GdprEmail {
  const lang = normalizeLang(broker.gdpr_lang)
  // Company data is only relevant to brokers that actually hold business data.
  const includeCompany = broker.audience === 'professional' || broker.audience === 'both'
  const companyBlock = includeCompany ? buildCompanyBlock(lang, pii.company) : ''
  return TEMPLATES[lang]({
    name: `${pii.firstName} ${pii.lastName}`.trim(),
    address: formatAddress(pii),
    dob: pii.dob,
    brokerName: broker.name,
    companyBlock,
  })
}
