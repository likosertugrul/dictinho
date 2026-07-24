// Rule-based conjugator for REGULAR Italian verbs (-are/-ere/-ire).
// Fallback for user-added verbs that aren't in the base lexicon (those get
// AI-generated tables). Irregular verbs will be wrong here — the base lexicon
// covers the common irregulars, and Faz 2+ adds AI enrichment for the rest.

import type { Auxiliary, Person, Tense } from '@/lib/italian';
import { PERSONS } from '@/lib/italian';

type Forms = Record<Person, string>;

const ENDINGS: Record<'are' | 'ere' | 'ire', Record<string, Forms>> = {
  are: {
    presente: { io: 'o', tu: 'i', lui_lei: 'a', noi: 'iamo', voi: 'ate', loro: 'ano' },
    imperfetto: { io: 'avo', tu: 'avi', lui_lei: 'ava', noi: 'avamo', voi: 'avate', loro: 'avano' },
    futuro_semplice: { io: 'erò', tu: 'erai', lui_lei: 'erà', noi: 'eremo', voi: 'erete', loro: 'eranno' },
    condizionale_presente: { io: 'erei', tu: 'eresti', lui_lei: 'erebbe', noi: 'eremmo', voi: 'ereste', loro: 'erebbero' },
    congiuntivo_presente: { io: 'i', tu: 'i', lui_lei: 'i', noi: 'iamo', voi: 'iate', loro: 'ino' },
  },
  ere: {
    presente: { io: 'o', tu: 'i', lui_lei: 'e', noi: 'iamo', voi: 'ete', loro: 'ono' },
    imperfetto: { io: 'evo', tu: 'evi', lui_lei: 'eva', noi: 'evamo', voi: 'evate', loro: 'evano' },
    futuro_semplice: { io: 'erò', tu: 'erai', lui_lei: 'erà', noi: 'eremo', voi: 'erete', loro: 'eranno' },
    condizionale_presente: { io: 'erei', tu: 'eresti', lui_lei: 'erebbe', noi: 'eremmo', voi: 'ereste', loro: 'erebbero' },
    congiuntivo_presente: { io: 'a', tu: 'a', lui_lei: 'a', noi: 'iamo', voi: 'iate', loro: 'ano' },
  },
  ire: {
    presente: { io: 'o', tu: 'i', lui_lei: 'e', noi: 'iamo', voi: 'ite', loro: 'ono' },
    imperfetto: { io: 'ivo', tu: 'ivi', lui_lei: 'iva', noi: 'ivamo', voi: 'ivate', loro: 'ivano' },
    futuro_semplice: { io: 'irò', tu: 'irai', lui_lei: 'irà', noi: 'iremo', voi: 'irete', loro: 'iranno' },
    condizionale_presente: { io: 'irei', tu: 'iresti', lui_lei: 'irebbe', noi: 'iremmo', voi: 'ireste', loro: 'irebbero' },
    congiuntivo_presente: { io: 'a', tu: 'a', lui_lei: 'a', noi: 'iamo', voi: 'iate', loro: 'ano' },
  },
};

const PARTICIPLE_ENDING = { are: 'ato', ere: 'uto', ire: 'ito' } as const;

// essere-verb passato prossimo auxiliaries per person (masculine sg/pl display)
const ESSERE_AUX: Forms = { io: 'sono', tu: 'sei', lui_lei: 'è', noi: 'siamo', voi: 'siete', loro: 'sono' };
const AVERE_AUX: Forms = { io: 'ho', tu: 'hai', lui_lei: 'ha', noi: 'abbiamo', voi: 'avete', loro: 'hanno' };

export function isConjugatableVerb(lemma: string): boolean {
  return /(are|ere|ire)$/.test(lemma.trim().toLowerCase());
}

/**
 * Conjugate a REGULAR verb for the given tense. Returns null if the lemma
 * doesn't look like an Italian infinitive.
 */
export function conjugateRegular(
  lemma: string,
  tense: Tense,
  auxiliary: Auxiliary = 'avere',
): Forms | null {
  const inf = lemma.trim().toLowerCase();
  const match = inf.match(/(are|ere|ire)$/);
  if (!match) return null;
  const ending = match[1] as 'are' | 'ere' | 'ire';
  const stem = inf.slice(0, -3);

  if (tense === 'passato_prossimo') {
    const participleBase = stem + PARTICIPLE_ENDING[ending];
    const aux = auxiliary === 'essere' ? ESSERE_AUX : AVERE_AUX;
    const out = {} as Forms;
    for (const p of PERSONS) {
      // essere verbs: masculine agreement — plural persons take -i
      const participle =
        auxiliary === 'essere' && (p === 'noi' || p === 'voi' || p === 'loro')
          ? participleBase.slice(0, -1) + 'i'
          : participleBase;
      out[p] = `${aux[p]} ${participle}`;
    }
    return out;
  }

  const endings = ENDINGS[ending][tense];
  if (!endings) return null;
  const out = {} as Forms;
  for (const p of PERSONS) out[p] = stem + endings[p];
  return out;
}
