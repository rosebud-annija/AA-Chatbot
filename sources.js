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
    url:   'https://www.agenda-austria.at/topics/staatsbudget-finanzen/steuern-abgaben/'
  },
  {
    keys:  ['pension', 'pensionsalter', 'pensionsantritt', 'pensionssystem',
            'umlagesystem', 'altersvorsorge', 'pensionslücke', 'lebenserwartung'],
    label: 'Pensionen – Agenda Austria',
    url:   'https://www.agenda-austria.at/topics/soziales/pensionen/'
  },
  {
    keys:  ['wohn', 'miet', 'miete', 'mieten', 'mietpreisbremse', 'mietpreisregulierung',
            'immobili', 'wohnungsmarkt', 'mietwohnung', 'wohnbau'],
    label: 'Wohnen & Mieten – Agenda Austria',
    url:   'https://www.agenda-austria.at/topics/soziales/wohnen/'
  },
  {
    keys:  ['staatsschuld', 'staatsverschuldung', 'schuldenlast', 'defizit',
            'budgetdefizit', 'zinsen', 'ausgabenbremse'],
    label: 'Staatsschulden – Agenda Austria',
    url:   'https://www.agenda-austria.at/topics/staatsbudget-finanzen/staatsschulden/'
  },
  {
    keys:  ['staatshaushalt', 'bundesbudget', 'budget', 'staatsausgaben', 'budgetkrise'],
    label: 'Staatshaushalt – Agenda Austria',
    url:   'https://www.agenda-austria.at/topics/staatsbudget-finanzen/staatshaushalt/'
  },
  {
    keys:  ['bürokrat', 'buerokratie', 'verwaltung', 'regulierung', 'vorschrift',
            'one-stop', 'behörde', 'beamte', 'verwaltungsaufwand'],
    label: 'Wettbewerbsfähigkeit – Agenda Austria',
    url:   'https://www.agenda-austria.at/topics/wirtschaft-standort/wettbewerbsfaehigkeit/'
  },
  {
    keys:  ['lohnnebenkosten', 'arbeitgeber', 'arbeitnehmer', 'lohn', 'gehalt',
            'mindestlohn', 'arbeitszeit', 'kündig', 'flexibilisierung', 'kollektivvertrag',
            'beschäftigung', 'erwerbsquote'],
    label: 'Beschäftigung – Agenda Austria',
    url:   'https://www.agenda-austria.at/topics/arbeit-wohlstand/beschaeftigung/'
  },
  {
    keys:  ['arbeitslos', 'jobmarkt', 'arbeitslosenquote'],
    label: 'Arbeitslosigkeit – Agenda Austria',
    url:   'https://www.agenda-austria.at/topics/arbeit-wohlstand/arbeitslosigkeit/'
  },
  {
    keys:  ['wirtschaftswachstum', 'wachstum', 'bip', 'rezession', 'konjunktur',
            'investition', 'innovation', 'gründer', 'startup', 'unternehmen',
            'wettbewerbsfähigkeit', 'produktivität'],
    label: 'Wirtschaft & Standort – Agenda Austria',
    url:   'https://www.agenda-austria.at/topics/wirtschaft-standort/wettbewerbsfaehigkeit/'
  },
  {
    keys:  ['sozialstaat', 'umverteilung', 'sozialhilfe', 'sozialleistung',
            'mindestsicherung', 'transfers', 'sozialausgaben'],
    label: 'Sozialstaat – Agenda Austria',
    url:   'https://www.agenda-austria.at/topics/soziales/sozialstaat/'
  },
  {
    keys:  ['armut', 'verteilung', 'ungleichheit', 'einkommensverteilung'],
    label: 'Armut & Verteilung – Agenda Austria',
    url:   'https://www.agenda-austria.at/topics/soziales/armut-verteilung/'
  },
  {
    keys:  ['energie', 'strom', 'gas', 'energiepreis', 'energiewende',
            'heizen', 'öl', 'erdgas', 'erneuerbar'],
    label: 'Energie – Agenda Austria',
    url:   'https://www.agenda-austria.at/topics/energie-klima/energie/'
  },
  {
    keys:  ['bildung', 'schule', 'universität', 'hochschule', 'ausbildung', 'pisa'],
    label: 'Bildung – Agenda Austria',
    url:   'https://www.agenda-austria.at/topics/zukunft/bildung/'
  },
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
