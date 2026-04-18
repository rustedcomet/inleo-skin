/* data/hashtagEntities.js — Canonical entity -> hashtag map.
   When a post body mentions one of these entities (case-insensitive, word
   boundaries enforced by the rules engine), the corresponding tags are
   candidates for suggestion.

   Keep this list hand-curated and boring. The goal isn't to be exhaustive
   — it's to catch the common Hive / LeoFinance / crypto topics that the
   community actually tags. Adding more entries is fine, but prefer
   specific > generic. "hive" is universal enough to live here; "bitcoin"
   and its variants are common enough that they earn a spot too.

   Each key is the lowercase entity to match. Each value is an ORDERED
   array of tags to suggest, highest-priority first. Tags are ALREADY
   lowercased and contain no '#'. */
(function () {
    const NS = (window.InleoSkins = window.InleoSkins || {});

    NS.hashtagEntities = {
        /* Core Hive ecosystem */
        'hive': ['hive', 'hive-engine'],
        'hive-engine': ['hive-engine', 'hive'],
        'leo': ['leofinance', 'leo'],
        'leofinance': ['leofinance', 'leo'],
        'inleo': ['leofinance', 'leo', 'inleo'],
        'hbd': ['hbd', 'hive'],
        'hp': ['hive', 'hivepower'],
        'hive power': ['hive', 'hivepower'],

        /* Majors — surface when the body talks about them */
        'bitcoin': ['bitcoin', 'btc', 'crypto'],
        'btc': ['bitcoin', 'btc', 'crypto'],
        'ethereum': ['ethereum', 'eth', 'crypto'],
        'eth': ['ethereum', 'eth', 'crypto'],
        'solana': ['solana', 'sol', 'crypto'],
        'sol': ['solana', 'sol', 'crypto'],

        /* Meta / category tags triggered by softer language */
        'defi': ['defi', 'crypto'],
        'nft': ['nft', 'crypto'],
        'airdrop': ['airdrop', 'crypto'],
        'staking': ['staking', 'defi'],
        'trading': ['trading', 'crypto'],
        'price analysis': ['trading', 'crypto'],
        'technical analysis': ['trading', 'ta'],
        'market': ['markets', 'crypto'],

        /* Hive-native content genres */
        'threadcast': ['threadcast', 'leofinance'],
        'threadstorm': ['threadcast', 'leofinance'],
        'splinterlands': ['splinterlands', 'gaming'],
        'gaming': ['gaming'],
        'music': ['music'],
        'photography': ['photography'],
        'food': ['food', 'cooking'],
        'travel': ['travel'],
        'fitness': ['fitness', 'health'],
        'mindset': ['mindset', 'selfdevelopment'],

        /* Entertainment & media */
        'movie': ['moviesonleo', 'movies'],
        'movies': ['moviesonleo', 'movies'],
        'film': ['moviesonleo', 'movies'],
        'tv show': ['tvonleo', 'entertainment'],
        'television': ['tvonleo', 'entertainment'],
        'series': ['tvonleo', 'entertainment'],
        'anime': ['anime', 'entertainment'],
        'review': ['review'],
        'book': ['books', 'review'],
        'books': ['books', 'review'],
        'podcast': ['podcast'],

        /* Broader topic buckets */
        'ai': ['ai', 'technology'],
        'artificial intelligence': ['ai', 'technology'],
        'tech': ['technology'],
        'technology': ['technology']
    };
})();
