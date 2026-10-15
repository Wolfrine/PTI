/** Read-only menu projection. menuText remains the complete, unmodified saved record. */
export interface MenuItem {
  id: string;
  text: string;
  uncertain: boolean;
}
export interface MenuSection {
  id: string;
  title: string;
  items: MenuItem[];
  note: boolean;
}
export interface MenuView { source: string; sections: MenuSection[]; }

export const uncertainReading = (text: string) => /\b(verify|unreadable|unclear|uncertain|unknown|unidentified|mystery)\b|\?/.test(text.toLowerCase());

/** Split explicit list separators only; commas, slashes, 'and' and annotation semicolons stay together. */
export function splitMenuItems(text: string): string[] {
  const parts: string[] = [];
  let start = 0, depth = 0, quote = '';
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quote) { if (char === quote) quote = ''; continue; }
    if (char === '“') { quote = '”'; continue; }
    if (char === '"') { quote = '"'; continue; }
    if ('([{'.includes(char)) depth++;
    else if (')]}'.includes(char)) depth = Math.max(0, depth - 1);
    else if (char === ';' && depth === 0) { parts.push(text.slice(start,index).trim()); start = index + 1; }
  }
  parts.push(text.slice(start).trim());
  return parts.filter(Boolean);
}

export function parseMenu(source: string): MenuView {
  const groups: {title: string; lines: string[]}[] = [];
  let active: {title: string; lines: string[]} | undefined;
  const lines = source.split(/\r?\n/);
  const legacyBlocks = /\r?\n[ \t]*\r?\n/.test(source);
  let blockStart = true;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line.trim()) { active?.lines.push(line); blockStart = true; continue; }
    const heading = /^([^:;\n]{1,75}):(?:\s|$)(.*)$/.exec(line.trim());
    if (heading && !/^https?$/i.test(heading[1])) {
      active = { title: heading[1].trim(), lines: [heading[2]] };
      groups.push(active);
    } else if (legacyBlocks && blockStart && lines[index + 1]?.trim()) {
      active = { title: line.trim(), lines: [] };
      groups.push(active);
    } else {
      if (!active) { active = {title: '',lines: []}; groups.push(active); }
      active.lines.push(line);
    }
    blockStart = false;
  }
  return {source,sections: groups.map((group,index) => ({
    id: `menu-section-${index}`,
    title: group.title,
    note: /^(notes?|open question|reading|clarification)\b/i.test(group.title),
    items: splitMenuItems(group.lines.join('\n')).map((text,item) => ({id: `menu-item-${index}-${item}`,text,uncertain: uncertainReading(text)}))
  })).filter(section => section.title || section.items.length)};
}

export function filterMenu(view: MenuView, query: string): MenuSection[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return view.sections;
  return view.sections.map(section => ({...section,items: section.title.toLocaleLowerCase().includes(needle) ? section.items : section.items.filter(item => item.text.toLocaleLowerCase().includes(needle))})).filter(section => section.items.length);
}
