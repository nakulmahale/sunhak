import axios from 'axios';

/**
 * GDELT Article interface based on API response
 */
interface GDELTArticle {
  title: string;
  sourcecountry?: string;
  url: string;
  [key: string]: any;
}

/**
 * OSINT Service: Fetches real-world signals using GDELT and other free APIs.
 */
class OSINTService {
    GDELT_BASE_URL: string;
    constructor() {
        this.GDELT_BASE_URL = 'https://api.gdeltproject.org/api/v2/doc/doc';
    }

    /**
     * Fetches raw article list from GDELT based on a query.
     */
    async fetchGDELTData(query: string, timespan = '24h'): Promise<GDELTArticle[]> {
        try {
            const params = {
                query: query,
                mode: 'artlist',
                maxresults: 5,
                format: 'json',
                timespan: timespan,
                sort: 'relevance'
            };
            const response = await axios.get(this.GDELT_BASE_URL, { params });
            return response.data.articles || [];
        } catch (error: any) {
            console.error(`GDELT Fetch Error (${query}):`, error.message);
            return [];
        }
    }

    async getMilitarySignals() {
        // Query for military operations and maneuvers
        const signals = await this.fetchGDELTData('military (maneuvers OR deployment OR "troop movement")');
        return signals.map((s: GDELTArticle) => ({
            category: 'Military',
            title: s.title,
            source: s.sourcecountry || 'International',
            url: s.url,
            relevance_score: 0.8
        }));
    }

    async getProtestSentiments() {
        // Query for civil unrest and protests
        const signals = await this.fetchGDELTData('protest (demonstration OR unrest OR riot)');
        return signals.map((s: GDELTArticle) => ({
            category: 'Sentiment/Protest',
            title: s.title,
            source: s.sourcecountry || 'Local Feed',
            url: s.url,
            relevance_score: 0.7
        }));
    }

    async getEconomicSignals() {
        // Query for trade signals, commodities, and sanctions
        const signals = await this.fetchGDELTData('trade (sanctions OR "oil gas" OR "commodity prices")');
        return signals.map((s: GDELTArticle) => ({
            category: 'Economic/Trade',
            title: s.title,
            source: s.sourcecountry || 'Reuters/Financial',
            url: s.url,
            relevance_score: 0.85
        }));
    }

    /**
     * Aggregates all tactical signals.
     */
    async getAllTacticalSignals() {
        const [military, protests, economics] = await Promise.all([
            this.getMilitarySignals(),
            this.getProtestSentiments(),
            this.getEconomicSignals()
        ]);

        return [...military, ...protests, ...economics];
    }
}

const osintService = new OSINTService();
export default osintService;