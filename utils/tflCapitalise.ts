// utils/tflCapitalise.ts

const TFL_EXCEPTIONS: Record<string, string> = {
  "king's cross st. pancras": "King's Cross St. Pancras",
  "heathrow terminals 2 & 3": "Heathrow Terminals 2 & 3",
  "heathrow terminal 4": "Heathrow Terminal 4",
  "heathrow terminal 5": "Heathrow Terminal 5",
  "o2 centre": "O2 Centre",
  "st. paul's": "St. Paul's",
  "st. james's park": "St. James's Park",
  "shepherd's bush market": "Shepherd's Bush Market",
  "shepherd's bush": "Shepherd's Bush",
  "queen's park": "Queen's Park",
  "earl's court": "Earl's Court",
  "bishop's stortford": "Bishop's Stortford",
  "st pancras international": "St Pancras International",
  "canary wharf": "Canary Wharf",
  "dlr": "DLR",
  "tfl rail": "TfL Rail",
};

const LOWERCASE_WORDS = new Set(['of', 'the', 'and', 'at', 'in', 'on', 'to', 'for', 'a', 'an']);

function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map((word, index) => {
      // Always capitalise first word
      if (index === 0) return capitaliseFirst(word);
      // Preserve lowercase function words
      if (LOWERCASE_WORDS.has(word)) return word;
      return capitaliseFirst(word);
    })
    .join(' ');
}

function capitaliseFirst(word: string): string {
  if (!word) return word;
  // Preserve possessives: "king's" → "King's" not "King'S"
  return word.charAt(0).toUpperCase() + word.slice(1);
}

const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function tflCapitalise(input: string): string {
  if (!input) return '';
  const key = input.toLowerCase().trim();
  // Exact match in exceptions map
  if (TFL_EXCEPTIONS[key]) return TFL_EXCEPTIONS[key];
  // Partial match — check if any exception key is a substring
  for (const [exKey, exValue] of Object.entries(TFL_EXCEPTIONS)) {
    if (key.includes(exKey)) {
      // After escaping, \b breaks on apostrophes — "King's Cross" apostrophe is a
      // non-word char, so \b fires mid-name. Strip \b anchors entirely when the
      // escaped key contains a non-word character.
      const safePattern = /\W/.test(exKey)
        ? escapeRegExp(exKey)
        : `\\b${escapeRegExp(exKey)}\\b`;
      return input.replace(new RegExp(safePattern, 'gi'), exValue);
    }
  }
  // Fallback: standard title case
  return toTitleCase(input);
}
