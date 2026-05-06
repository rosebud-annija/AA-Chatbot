/**
 * sources.js — Agenda Austria Quellenverzeichnis
 *
 * Jeder Eintrag hat:
 *   keys  — Keywords, die im User-Text gesucht werden (lowercase, Teilstring-Match)
 *   label — Angezeigter Linktext
 *   url   — Ziel-URL auf agendaaustria.at
 *
 * Die erste Übereinstimmung in der Reihenfolge von oben gewinnt.
 * Bitte URLs auf Aktualität prüfen und ggf. auf spezifische Beiträge verlinken.
 */

const SOURCES = [
  {
    keys:  ['steuer', 'abgabe', 'abgabenquote', 'lohnsteuer', 'einkommensteuer',
            'körperschaftsteuer', 'flat tax', 'steuerlast', 'steuersenkung'],
    label: 'Steuern & Abgaben – Agenda Austria',
    url:   'https://agendaaustria.at/themen/steuern/'
  },
  {
    keys:  ['pension', 'pensionsalter', 'pensionsantritt', 'pensionssystem',
            'umlagesystem', 'altersvorsorge', 'pensionslücke', 'lebenserwartung'],
    label: 'Pensionen & Altersvorsorge – Agenda Austria',
    url:   'https://agendaaustria.at/themen/pensionen/'
  },
  {
    keys:  ['wohn', 'miet', 'miete', 'mieten', 'mietpreisbremse', 'mietpreisregulierung',
            'immobili', 'wohnungsmarkt', 'mietwohnung', 'wohnbau'],
    label: 'Wohnen & Mieten – Agenda Austria',
    url:   'https://agendaaustria.at/themen/wohnen/'
  },
  {
    keys:  ['staatsschuld', 'staatsverschuldung', 'schulden', 'defizit',
            'budgetdefizit', 'staatshaushalt', 'zinsen', 'ausgabenbremse'],
    label: 'Staatsfinanzen – Agenda Austria',
    url:   'https://agendaaustria.at/themen/staatsfinanzen/'
  },
  {
    keys:  ['bürokrat', 'buerokratie', 'verwaltung', 'regulierung', 'vorschrift',
            'one-stop', 'behörde', 'beamte', 'verwaltungsaufwand'],
    label: 'Bürokratie & Regulierung – Agenda Austria',
    url:   'https://agendaaustria.at/themen/buerokratie/'
  },
  {
    keys:  ['lohnnebenkosten', 'arbeitgeber', 'arbeitnehmer', 'lohn', 'gehalt',
            'mindestlohn', 'arbeitszeit', 'kündig', 'flexibilisierung', 'kollektivvertrag'],
    label: 'Arbeitsmarkt – Agenda Austria',
    url:   'https://agendaaustria.at/themen/arbeitsmarkt/'
  },
  {
    keys:  ['arbeitslos', 'beschäftigung', 'jobmarkt', 'erwerbsquote'],
    label: 'Arbeitsmarkt – Agenda Austria',
    url:   'https://agendaaustria.at/themen/arbeitsmarkt/'
  },
  {
    keys:  ['wirtschaftswachstum', 'wachstum', 'bip', 'rezession', 'konjunktur',
            'investition', 'innovation', 'gründer', 'startup', 'unternehmen',
            'wettbewerbsfähigkeit', 'produktivität'],
    label: 'Wirtschaft & Wachstum – Agenda Austria',
    url:   'https://agendaaustria.at/themen/wirtschaft/'
  },
  {
    keys:  ['sozialstaat', 'umverteilung', 'sozialhilfe', 'sozialleistung',
            'mindestsicherung', 'transfers', 'sozialausgaben'],
    label: 'Sozialstaat – Agenda Austria',
    url:   'https://agendaaustria.at/themen/sozialstaat/'
  },
  {
    keys:  ['energie', 'strom', 'gas', 'energiepreis', 'energiewende',
            'heizen', 'öl', 'erdgas', 'erneuerbar'],
    label: 'Energie & Klimapolitik – Agenda Austria',
    url:   'https://agendaaustria.at/themen/energie/'
  },
  {
    keys:  ['bildung', 'schule', 'universität', 'hochschule', 'ausbildung', 'pisa'],
    label: 'Bildung – Agenda Austria',
    url:   'https://agendaaustria.at/themen/bildung/'
  },
  {
    keys:  ['gesundheit', 'krankenversicherung', 'spital', 'arzt', 'pharmak', 'kassenmittel'],
    label: 'Gesundheitssystem – Agenda Austria',
    url:   'https://agendaaustria.at/themen/gesundheit/'
  }
];

/**
 * Gibt den ersten passenden Source-Eintrag zurück, oder null.
 * Sucht im übergebenen Text (User-Nachricht oder Bot-Antwort).
 */
function findSource(text) {
  const t = text.toLowerCase();
  for (const source of SOURCES) {
    if (source.keys.some(k => t.includes(k))) {
      return source;
    }
  }
  return null;
}
