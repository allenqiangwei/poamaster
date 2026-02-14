declare module 'app-store-scraper' {
  interface ReviewResult {
    id: string;
    userName: string;
    score: number;
    title: string;
    text: string;
    updated: string;
  }

  interface ReviewOptions {
    id: string;
    page?: number;
    sort?: number;
    country?: string;
  }

  const sort: { RECENT: number; HELPFUL: number };
  function reviews(options: ReviewOptions): Promise<ReviewResult[]>;

  export default { reviews, sort };
}
