import {
  Armchair,
  Box,
  Camera,
  ChefHat,
  Coffee,
  Flame,
  Lamp,
  Mic,
  Refrigerator,
  Snowflake,
  Store,
  Table2,
  Utensils,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const RULES: [RegExp, LucideIcon][] = [
  [/parrill|grill|plancha/i, Flame],
  [/congel|freez/i, Snowflake],
  [/refrig|fridge|heladera/i, Refrigerator],
  [/silla|chair/i, Armchair],
  [/mesa de trabajo|worktable|workbench/i, ChefHat],
  [/mesa|table/i, Table2],
  [/utensil|herramient|tool/i, Utensils],
  [/freidor|fryer|cocina|stove|campana|hood/i, ChefHat],
  [/caf[eé]|espresso|molino|grinder/i, Coffee],
  [/solda|weld|compres/i, Wrench],
  [/c[aá]mara|camera/i, Camera],
  [/micr[oó]fon|microphone/i, Mic],
  [/ilumin|light|l[aá]mpara/i, Lamp],
  [/mostrador|counter|estanter|shelv/i, Store],
];

export function resourceIcon(category: string): LucideIcon {
  return RULES.find(([re]) => re.test(category))?.[1] ?? Box;
}
