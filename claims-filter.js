// claims-filter.js — AI Claims Governance Filter
// Scans AI-generated content for prohibited phrases before display.
// Phase 1.5: Blocklist enforcement, disclaimer injection.

const CLAIMS_BLOCKLIST = [
  // Outcome guarantees
  /guaranteed?\s+results?/i,
  /100%\s+(effective|guaranteed|proven)/i,
  /you\s+will\s+(definitely|certainly|absolutely)\s+(lose|gain|achieve)/i,

  // Weight/body promises
  /lose\s+\d+\s*(lbs?|pounds?|kg|kilos?)\s+in\s+\d+\s*(days?|weeks?)/i,
  /drop\s+\d+\s*(lbs?|pounds?|kg|kilos?)/i,
  /burn\s+off\s+(that|your)\s+meal/i,
  /get\s+skinny/i,
  /bikini\s+body/i,
  /shred\s+fat\s+fast/i,

  // Medical claims
  /\b(cure|cures|curing)\b/i,
  /\b(treat|treats|treating)\s+(disease|illness|condition|disorder)/i,
  /\bdiagnose[sd]?\b/i,
  /clinically\s+proven/i,
  /doctor[\s-]recommended/i,
  /medical[\s-]grade/i,
  /FDA[\s-]approved/i,

  // Supplement / product claims
  /miracle\s+(supplement|pill|food|ingredient)/i,
  /secret\s+(formula|ingredient|trick)/i,
  /detox\b/i,
  /cleanse\s+your\s+(body|system)/i,

  // Extreme language
  /never\s+feel\s+hungry/i,
  /eliminate\s+all\s+(fat|carbs|sugar)/i,
  /zero[\s-]calorie\s+diet/i,
  /starvation/i,
];

/**
 * Scans text for prohibited claims. Returns array of matches or empty array if clean.
 */
function scanForProhibitedClaims(text) {
  if (!text) return [];
  const matches = [];
  for (const pattern of CLAIMS_BLOCKLIST) {
    const match = text.match(pattern);
    if (match) {
      matches.push({ pattern: pattern.source, matched: match[0] });
    }
  }
  return matches;
}

/**
 * Filters AI-generated text, replacing prohibited phrases with safe alternatives.
 * Returns the cleaned text.
 */
function filterAIClaims(text) {
  if (!text) return text;
  let filtered = text;

  // Replace specific prohibited patterns with safer alternatives
  const replacements = [
    [/guaranteed?\s+results?/gi, "potential progress"],
    [/lose\s+(\d+)\s*(lbs?|pounds?|kg|kilos?)\s+in\s+(\d+)\s*(days?|weeks?)/gi, "work toward your weight goals"],
    [/burn\s+off\s+(that|your)\s+meal/gi, "support your activity level"],
    [/clinically\s+proven/gi, "research-supported"],
    [/miracle\s+(supplement|pill|food|ingredient)/gi, "helpful $1"],
    [/detox\b/gi, "support your wellness"],
    [/cleanse\s+your\s+(body|system)/gi, "support your $1"],
    [/get\s+skinny/gi, "reach your fitness goals"],
    [/shred\s+fat\s+fast/gi, "work toward your body composition goals"],
    [/never\s+feel\s+hungry/gi, "help manage hunger"],
    [/eliminate\s+all\s+(fat|carbs|sugar)/gi, "manage your $1 intake"],
  ];

  for (const [pattern, replacement] of replacements) {
    filtered = filtered.replace(pattern, replacement);
  }

  return filtered;
}

/**
 * Wraps AI-generated content with disclaimer and runs it through the claims filter.
 * Use this as the final step before displaying any AI output.
 */
function prepareAIContent(rawText, options = {}) {
  const filtered = filterAIClaims(rawText);
  const showDisclaimer = options.disclaimer !== false;

  if (showDisclaimer && typeof getAIDisclaimer === "function") {
    return filtered + "\n" + getAIDisclaimer();
  }
  return filtered;
}
