declare module 'app-store-scraper' {
  interface AppResult {
    id: number;
    title: string;
    score: number;
    reviews: number;
    version: string;
    developer: string;
    releaseNotes: string;
    [key: string]: any;
  }

  interface ReviewResult {
    id: string;
    userName: string;
    score: number;
    title: string;
    text: string;
    updated: string;
    [key: string]: any;
  }

  const sort: { RECENT: number; HELPFUL: number };

  function app(opts: { id: string | number; [key: string]: any }): Promise<AppResult>;
  function reviews(opts: { id: string | number; page?: number; sort?: number; country?: string; [key: string]: any }): Promise<ReviewResult[]>;

  export default { app, reviews, sort };
}
