import {uncertainReading} from './menu';

export type FoodArtKey = 'breakfast'|'drinks'|'soup'|'snacks'|'chaat'|'south-indian'|'noodles'|'pasta'|'curry'|'breads'|'sweets'|'fruit'|'setting';
/** Decorative family motifs, never recipe, ingredient, vendor or dietary evidence. */
export function foodArt(text: string, category = ''): {key: FoodArtKey; src: string; uncertain: boolean} {
  const uncertain = uncertainReading(text);
  const match = (value: string): FoodArtKey | undefined => {
    if (/\b(soups?|manchow)\b/i.test(value)) return 'soup';
    if (/\b(tea|coffee|milk|drinks?|beverages?|juices?|chaas|shikanji|mojito|lemonade|lagoon|water)\b/i.test(value)) return 'drinks';
    if (/\b(dosa|idli|uttapam|vada|south indian|sambar)\b/i.test(value)) return 'south-indian';
    if (/\b(noodles|hakka|chinese|manchurian|chilli|fried rice)\b/i.test(value)) return 'noodles';
    if (/\b(pasta|pizza|italian)\b/i.test(value)) return 'pasta';
    if (/\b(jalebi|sweets|desserts?|halwa|brownie|ice cream|rasmalai|chamcham|jamun|waffles?|mawa bati|chhena|shahi toast)\b|^sweet$/i.test(value)) return 'sweets';
    if (/\bchilla\b/i.test(value)) return 'setting';
    if (/\b(fruits?|pineapple|watermelon)\b/i.test(value)) return 'fruit';
    if (/\b(naan|roti|bread|paratha|kulcha|pulao|rice)\b/i.test(value)) return 'breads';
    if (/\b(chaat|pani puri|golgappa|papdi|bhalla)\b/i.test(value)) return 'chaat';
    if (/\b(snacks?|starters?|savoury|cutlet|jhalmuri|fries|balls|kebab|tikka|cigar|garlic stick|dabeli|pav bhaji|barbecue)\b/i.test(value)) return 'snacks';
    if (/\b(breakfast|poha|dhokla|sandwich|bhature)\b/i.test(value)) return 'breakfast';
    if (/\b(curry|main|mains|lunch|dinner|reception|paneer|dal|sabzi|vegetable|kofta|kadhi|saag|gobhi|matar)\b/i.test(value)) return 'curry';
    return undefined;
  };
  // A written category supplies a family cue only; it never identifies an unreadable dish or its recipe.
  const key = uncertain ? 'setting' : match(text) || match(category) || 'setting';
  return {key,src:`/art/food/${key}.webp`,uncertain};
}
