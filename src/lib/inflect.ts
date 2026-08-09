// Rule-based Italian noun/adjective inflection for display on word cards.
// Covers the regular patterns (the large majority); a few irregular plurals
// (e.g. -co/-go alternations) may be approximate — shown as a learning aid.

const VOWEL_END = /[aeiou]$/i;
const ACCENTED_END = /[àèéìíòóùú]$/i;

/** -io nouns whose i is stressed, so the plural doubles it (zio → zii). */
const STRESSED_IO = new Set([
  'zio', 'addio', 'brusio', 'mormorio', 'pendio', 'rinvio', 'invio', 'ronzio',
  'fruscio', 'leggio', 'natio', 'pio', 'rio', 'oblio', 'desio', 'scalpiccio',
]);

/** Feminine singular of an -o/-e adjective (rosso→rossa, grande→grande). */
function femSingular(lemma: string): string {
  if (lemma.endsWith('o')) return lemma.slice(0, -1) + 'a';
  return lemma; // -e adjectives are gender-invariant in the singular
}

/** Italian plural of a word given its final vowel + (for nouns) gender. */
function pluralize(word: string, feminine: boolean): string {
  const w = word;
  if (ACCENTED_END.test(w)) return w; // città → città
  if (w.endsWith('i')) return w; // crisi → crisi
  if (!VOWEL_END.test(w)) return w; // foreign/consonant endings: film → film

  const last = w.slice(-1);
  const stem = w.slice(0, -1);

  // -io: the plural keeps a single i when that i is unstressed (formaggio →
  // formaggi, figlio → figli, occhio → occhi) and doubles it when it carries
  // the stress (zio → zii). Stress isn't recoverable from the spelling, so the
  // stressed ones — a short, mostly closed list — are named here.
  if (w.endsWith('io')) return STRESSED_IO.has(w) ? stem + 'i' : stem;

  if (last === 'o') return stem + 'i'; // libro → libri
  if (last === 'e') return stem + 'i'; // cane → cani, grande → grandi
  if (last === 'a') {
    // -ca/-ga keep the hard sound: amica → amiche, riga → righe
    if (w.endsWith('ca')) return w.slice(0, -2) + 'che';
    if (w.endsWith('ga')) return w.slice(0, -2) + 'ghe';
    return feminine ? stem + 'e' : stem + 'i'; // casa → case, (m) problema → problemi
  }
  return w;
}

export interface NounForms {
  singular: string;
  plural: string;
}

export function nounForms(lemma: string, gender: 'm' | 'f' | null): NounForms {
  return { singular: lemma, plural: pluralize(lemma, gender === 'f') };
}

export interface AdjectiveForms {
  /** true = 4 distinct forms (-o type); false = 2 forms (-e type) */
  fourForms: boolean;
  m_sg: string;
  f_sg: string;
  m_pl: string;
  f_pl: string;
}

export function adjectiveForms(lemma: string): AdjectiveForms {
  if (lemma.endsWith('o')) {
    const fSg = femSingular(lemma);
    return {
      fourForms: true,
      m_sg: lemma,
      f_sg: fSg,
      m_pl: pluralize(lemma, false), // rossi
      f_pl: pluralize(fSg, true), // rosse
    };
  }
  // -e (and other) adjectives: same for both genders, plural in -i
  const pl = pluralize(lemma, false);
  return { fourForms: false, m_sg: lemma, f_sg: lemma, m_pl: pl, f_pl: pl };
}
