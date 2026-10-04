# Public webpage import

Asterloom extracts a single public page into reviewable source text. It uses Mozilla Readability 0.6.0 for article detection and Linkedom for inert HTML parsing. This is stronger article extraction, not a guarantee that every URL contains accessible material. Mozilla documents Readability as the parser used by Firefox Reader View and explicitly distinguishes article detection from HTML sanitization. See the [official Readability API and security notes](https://github.com/mozilla/readability).

The importer retains readable headings, ordered and unordered list items, code blocks with indentation, and table rows with separated cells. It excludes navigation, page footers, executable elements, forms, and explicitly hidden elements. A regular table gets a Markdown header separator only when its first row explicitly uses column header cells or a table header section. Merged cells, multiple header rows, nested tables and uneven rows are shown as separately labeled rows with a warning; they do not become a guessed rectangular dataset. Visual layout is simplified. Text in images, interactive controls, diagrams, canvas, embeds, and CSS-generated content is not reconstructed. Imported text remains source material to review, including any malicious instructions the page itself contains.

Returned title, byline, publication time, language and site name are publisher-supplied metadata, not verified facts. The final fetched URL is the provenance URL. A page's declared canonical URL is stored separately and never fetched or substituted for provenance.

## Integration

```js
import {extractWebPage} from './web-extraction.mjs';
const page = extractWebPage(alreadyFetchedHtml, {
  url: validatedFinalResponseUrl,
  maxCharacters: 1_000_000,
});
```

The function is synchronous and performs no network requests. It returns:

- `title`, `text`: plain strings; never render them with `innerHTML`.
- `metadata`: `url` when supplied, `extractor` (`mozilla-readability` or `visible-text`), `contentStatus` (`extracted`, `partial`, or `needs-assistance`), `headings` (up to 100 `{level,text}` entries), `truncated`, and available `byline`, `publishedTime`, `siteName`, `language`, `declaredCanonicalUrl`.
- `warnings`: specific, human-readable limitations.
- `needsAssistance`: true for missing text, detected login/challenge pages, thin script shells, or a very short restricted excerpt. When true, `instructions` explains manual browser access and permitted copy/upload alternatives. Do not turn this result into a successful imported learning source.

A longer public excerpt with a subscription signal is returned as `partial` with a warning. Detection is heuristic: review the imported preview even when no warning appears. The parser never retrieves hidden JSON-LD article bodies to fill missing content.

The module limits HTML input to 8 MiB, extracted text to at most 1,000,000 characters, article detection to 50,000 elements, and fallback traversal depth/work. Oversized HTML throws a bounded error with status 413 and code `WEB_PAGE_TOO_LARGE`. Existing server URL fetching remains responsible for public-IP restrictions, DNS pinning, redirect validation, HTTP errors, response limits and timeouts.

## Deliberate limits

Scripts and resource loaders never run. Links are not recursively crawled. Login sessions, subscriptions, browser verification, CAPTCHAs, private networks and access controls are not bypassed. NotebookLM/YouTube/Drive assisted paths keep their existing specialized instructions. PDF and supported document links still go through their format-specific importers. For content inaccessible to a public static request, the user can supply a document, transcript, saved HTML file, or copied text they are allowed to reuse.

## Verification

`node --test server/web-extraction.test.mjs` covers navigation noise, metadata/provenance, headings, lists, code whitespace, tables, HTML fragments, login/paywall/challenge detection, script-only pages, hidden and malicious elements, and size limits. Tests use fixtures and make no external requests. A separate manual read-only smoke extracted the public MDN Map page and Node.js filesystem documentation with code blocks and headings; it does not imply universal website compatibility.
