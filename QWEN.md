# Project Overview

This is a Next.js 15 application named "my-v0-project". It serves as a web interface for browsing and interacting with posts crawled from various Korean online communities (e.g., clien.net, damoang.net, ppomppu.co.kr). The application allows users to view posts in a feed, read post details, see comments, and potentially browse posts organized by categories or trends.

The application uses a PostgreSQL database for data storage, managed by Drizzle ORM. The database schema (`lib/schema.ts`) includes tables for posts, post versions, images, embeds, comments, snapshots, trends, sites (sources), and clustering/rotation logic for content curation. Materialized views are used for efficient trend calculations.

The frontend leverages Tailwind CSS for styling, shadcn/ui components (built on Radix UI primitives), and React. It appears to be structured as a modern Next.js App Router application with server components and client components.

Key features indicated by the structure and dependencies:
-   Multi-site post crawling and aggregation.
-   Post content rendering (text, images, embeds).
-   Comment section display.
-   Trending post identification and display (based on view/comment/like deltas).
-   Post categorization and keyword analysis (likely via LLM enrichment).
-   Client-side marking of read posts using localStorage.

# Building and Running

The project uses `pnpm` as its package manager.

**Development:**
1.  Ensure PostgreSQL is running and configured. Set the environment variables `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` based on your `drizzle.config.ts`.
2.  Install dependencies: `pnpm install`
3.  Run the development server: `pnpm run dev`
    *   This command starts the Next.js development server, typically on `http://localhost:3000`.

**Building:**
1.  Prepare data index/build files if needed (specific scripts exist for this).
2.  Build the Next.js application: `pnpm run build`
    *   This compiles the application for production.

**Running (Production):**
1.  After building, start the application: `pnpm run start`
    *   This starts the production server.

**Other Scripts:**
- `pnpm run build:search-index`: Likely builds a search index using Minisearch.
- `pnpm run build:pages`: Builds a JSON file containing posts, possibly for static generation or API use.
- `pnpm run build:home:fresh:24h`: Builds a specific JSON for the home page's "fresh" section based on the last 24 hours.
- `pnpm run build:home`: Alias for `build:home:fresh:24h`.
- `pnpm run trigger:home`: Alias for `build:home`.
- `pnpm run build:category`: Builds a JSON file for category-based post listings.
- `pnpm run lint`: Runs Next.js's built-in linter.
- Database migrations and interactions are likely handled by Drizzle Kit (`drizzle-kit`) and Drizzle ORM (`drizzle-orm`), although specific commands aren't directly listed in `package.json` scripts.

# Development Conventions

-   **Framework:** Next.js 15 (App Router)
-   **Language:** TypeScript
-   **Styling:** Tailwind CSS with a custom color palette defined in `tailwind.config.ts`. Utility function `cn` from `lib/utils.ts` is used for merging Tailwind classes with `clsx` and `tailwind-merge`.
-   **UI Components:** shadcn/ui components, which are customizable and built with Radix UI primitives.
-   **Database:** PostgreSQL with Drizzle ORM. Schema definitions are in `lib/schema.ts`. Drizzle Kit is used for migrations/schema management.
-   **ORM:** Drizzle ORM is used for database interactions.
-   **Data Fetching:** Likely a mix of server-side fetching (for initial page loads) and client-side fetching (for dynamic updates, modals, infinite scrolling) within Next.js App Router patterns.
-   **Routing:** Next.js file-system based routing in the `app` directory. Modals are handled via Parallel Routes (`@modal`).
-   **Component Structure:** Components are organized in the `components` directory. Specific components like `post-card.tsx`, `comment-section.tsx`, `infinite-post-list.tsx` suggest a component-based architecture focused on displaying post-related data.
-   **State Management:** Likely uses React's built-in state management (`useState`, `useEffect`) and potentially React Context or libraries like Zustand (not explicitly seen yet) for global state. Client-side state like "read posts" is managed using `localStorage` (as seen in `app/layout.tsx`).
-   **Search:** Client-side search functionality is implemented using `minisearch`.
-   **Animations:** The `motion` library (likely Framer Motion) is included for animations.
-   **Form Handling:** `react-hook-form` and `zod` are used for form validation and handling.