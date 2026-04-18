/* data/hashtagRules.js — Rule-based, deterministic scoring engine for
   the composer hashtag assistant.

   Design goals:
   - No AI, no network, no surprises.
   - Entity matches (from hashtagEntities.js) are the highest signal.
   - Short posts should still produce something usable; long posts
     should reward repeated mentions without drowning in dupes.
   - Score is relative, not absolute — callers take the top N.

   Shape of the returned array:
     [{ tag: 'leofinance', score: 12, sources: ['leo', 'leofinance'] }, ...]
   sorted by score descending. */
(function () {
    const NS = (window.InleoSkins = window.InleoSkins || {});
    const entities = NS.hashtagEntities || {};

    /* Weight each mention of an entity gives to each of its mapped tags.
       The first mapped tag is the "primary" and gets full weight;
       secondary tags decay so the engine doesn't over-recommend generic
       buckets like 'crypto' every time. */
    const PRIMARY_WEIGHT = 10;
    const SECONDARY_WEIGHT = 4;
    const TERTIARY_WEIGHT = 2;

    /* Cap per-entity contribution so a post that says "bitcoin" 50 times
       doesn't blow out the scoring curve. */
    const MAX_COUNT_PER_ENTITY = 4;

    /* Tags explicit in the text (e.g. the user wrote "#foo") get this
       bonus — if they bothered to type it themselves, it's the strongest
       signal we can get. */
    const EXPLICIT_BONUS = 25;

    function escapeRegex(s) {
        return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /* Precompile an entity -> regex map. Word boundaries on both sides so
       "eth" doesn't match "ether" and "hp" doesn't match "happy". For
       multi-word entities, allow flexible whitespace between words. */
    const entityRegexCache = new Map();
    function getEntityRegex(entity) {
        if (entityRegexCache.has(entity)) return entityRegexCache.get(entity);
        const parts = entity.split(/\s+/).map(escapeRegex).join('\\s+');
        const re = new RegExp(`(?<![a-z0-9])${parts}(?![a-z0-9])`, 'gi');
        entityRegexCache.set(entity, re);
        return re;
    }

    /* Find already-typed #hashtags in the composer body. These short-
       circuit the scoring: we don't want to recommend something the user
       already wrote, and we boost aliases of it. */
    function extractExplicitTags(text) {
        const found = new Set();
        const re = /#([a-z0-9][a-z0-9\-_]{1,39})/gi;
        let m;
        while ((m = re.exec(text)) !== null) {
            found.add(m[1].toLowerCase());
        }
        return found;
    }

    /* The main engine. Returns scored candidate tags. Deduped by tag,
       sources accumulated so the UI can explain "why this tag?". */
    function score(text, { blockedTags = [], alwaysInclude = [] } = {}) {
        const scores = new Map(); // tag -> { tag, score, sources:Set }

        function add(tag, weight, source) {
            if (!tag) return;
            const t = tag.toLowerCase();
            if (blockedTags.includes(t)) return;
            let entry = scores.get(t);
            if (!entry) {
                entry = { tag: t, score: 0, sources: new Set() };
                scores.set(t, entry);
            }
            entry.score += weight;
            if (source) entry.sources.add(source);
        }

        const explicit = extractExplicitTags(text);
        explicit.forEach(t => add(t, EXPLICIT_BONUS, 'typed'));

        /* Entity sweep. For each known entity, count occurrences (capped),
           then fan out weight to its mapped tags. */
        for (const entity of Object.keys(entities)) {
            const re = getEntityRegex(entity);
            re.lastIndex = 0;
            let count = 0;
            while (re.exec(text) !== null) {
                count++;
                if (count >= MAX_COUNT_PER_ENTITY) break;
            }
            if (count === 0) continue;

            const mapped = entities[entity] || [];
            mapped.forEach((tag, i) => {
                const base = i === 0 ? PRIMARY_WEIGHT : i === 1 ? SECONDARY_WEIGHT : TERTIARY_WEIGHT;
                add(tag, base * count, entity);
            });
        }

        /* ---- Word-extraction layer ----
           Extract significant words from the text and suggest them as
           hashtags. This catches ad-hoc topics like "Matrix", "review",
           "movie" that aren't in the entity map. Lower weight than entity
           matches so curated entities always rank higher. */
        const WORD_WEIGHT = 3;
        const MIN_WORD_LEN = 3;
        const MAX_WORD_TAGS = 8;
        const STOP_WORDS = new Set([
            /* English stop words — common enough to never be useful tags */
            'the','and','for','are','but','not','you','all','can','had',
            'her','was','one','our','out','has','his','how','its','may',
            'new','now','old','see','way','who','did','get','let','say',
            'she','too','use','this','that','with','have','from','they',
            'been','each','make','like','long','look','many','over','such',
            'take','than','them','then','very','when','come','made','find',
            'here','know','more','also','back','been','will','into','just',
            'only','some','what','your','about','could','after','other',
            'which','their','there','would','these','than','been','call',
            'first','being','those','still','every','should','where','much',
            'while','does','most','both','next','going','really','think',
            'want','well','were','went','keep','last','same','need','never',
            /* Contractions & fragments */
            'don','isn','didn','won','can','couldn','wouldn','shouldn',
            /* Common post phrasing */
            'just','post','thread','today','yesterday','tomorrow','check',
            'heres','here','guys','hey','hello','good','great','best',
            'think','thoughts','talking','talk','thing','things','gonna',
            'gonna','gotta','getting','trying','doing','making','having',
            'looking','reading','writing','watching','playing','using',
            'sure','right','even','still','yeah','yes','please','thanks'
        ]);

        /* Tokenize: split on non-alpha-numeric, keep only meaningful words. */
        const wordCounts = new Map();
        const wordTokens = text.toLowerCase().split(/[^a-z0-9]+/);
        for (const w of wordTokens) {
            if (w.length < MIN_WORD_LEN) continue;
            if (STOP_WORDS.has(w)) continue;
            if (/^\d+$/.test(w)) continue; /* Pure numbers */
            wordCounts.set(w, (wordCounts.get(w) || 0) + 1);
        }

        /* Sort by frequency (descending), then alphabetically. */
        const wordCandidates = Array.from(wordCounts.entries())
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

        let wordTagsAdded = 0;
        for (const [word] of wordCandidates) {
            if (wordTagsAdded >= MAX_WORD_TAGS) break;
            /* Skip if this word is already a scored tag from entities. */
            if (scores.has(word)) continue;
            /* Skip if blocked. */
            if (blockedTags.includes(word)) continue;
            add(word, WORD_WEIGHT, 'word');
            wordTagsAdded++;
        }

        /* Always-include tags — user preference. Score them high enough to
           always be in the final slate, but not so high they eclipse real
           contextual hits when ranked in the chip list. */
        alwaysInclude.forEach(t => add(t, PRIMARY_WEIGHT, 'pinned'));

        /* Convert to sorted array. Sets -> arrays for serialization. */
        const out = [];
        scores.forEach(e => out.push({
            tag: e.tag,
            score: e.score,
            sources: Array.from(e.sources)
        }));
        out.sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag));
        return out;
    }

    NS.hashtagRules = { score, extractExplicitTags };
})();
