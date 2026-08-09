// Topic (theme) buckets — the second axis words are grouped by, alongside the
// word class. Same shape as POS in italian.ts: a fixed key list the DB, the AI
// prompts and the UI all share. Keys are stable; labels are UI text.

import type { Ionicons } from '@expo/vector-icons';

export const TOPIC_VALUES = [
  'food',
  'family',
  'home',
  'body',
  'clothing',
  'travel',
  'city',
  'nature',
  'animals',
  'work',
  'school',
  'technology',
  'sports',
  'time',
  'numbers',
  'emotions',
  'communication',
  'daily',
  'other',
] as const;
export type Topic = (typeof TOPIC_VALUES)[number];

export const TOPIC_LABELS: Record<Topic, string> = {
  food: 'Food & drink',
  family: 'Family & people',
  home: 'Home',
  body: 'Body & health',
  clothing: 'Clothes',
  travel: 'Travel & transport',
  city: 'City & places',
  nature: 'Nature & weather',
  animals: 'Animals',
  work: 'Work & money',
  school: 'School & study',
  technology: 'Technology',
  sports: 'Sports & free time',
  time: 'Time & dates',
  numbers: 'Numbers & quantity',
  emotions: 'Feelings & character',
  communication: 'Speaking & communication',
  daily: 'Daily life',
  other: 'Other',
};

type IconName = keyof typeof Ionicons.glyphMap;

export const TOPIC_ICONS: Record<Topic, IconName> = {
  food: 'restaurant-outline',
  family: 'people-outline',
  home: 'home-outline',
  body: 'fitness-outline',
  clothing: 'shirt-outline',
  travel: 'airplane-outline',
  city: 'business-outline',
  nature: 'leaf-outline',
  animals: 'paw-outline',
  work: 'briefcase-outline',
  school: 'school-outline',
  technology: 'laptop-outline',
  sports: 'football-outline',
  time: 'time-outline',
  numbers: 'calculator-outline',
  emotions: 'happy-outline',
  communication: 'chatbubbles-outline',
  daily: 'sunny-outline',
  other: 'ellipsis-horizontal',
};

export function isTopic(value: unknown): value is Topic {
  return typeof value === 'string' && (TOPIC_VALUES as readonly string[]).includes(value);
}

/** Label for a possibly-missing topic (words added before topics existed). */
export function topicLabel(topic: string | null | undefined): string {
  return isTopic(topic) ? TOPIC_LABELS[topic] : 'No topic';
}
