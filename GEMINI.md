# GEMINI.md - Project Context

This file provides context for AI assistants to understand and effectively assist with this project.

## Project Overview

This is a **Next.js 15** web application named "Isshoo" (이슈), a sophisticated Korean community post aggregator. It fetches posts from various online communities, ranks them based on engagement and trends, and displays them in a unified, interactive feed.

The key technologies and architectural patterns are:

*   **Framework**: Next.js 15 (App Router) with TypeScript.
*   **Deployment**: Static Site Generation (SSG). The `next.config.mjs` specifies `output: "export"`, and a series of build scripts in the `scripts/` directory pre-render data into JSON files.
*   **Database**: PostgreSQL, managed with **Drizzle ORM**. The schema is defined in `lib/schema.ts` and includes tables for posts, comments, sites, user activity, and AI-driven content enrichment.
*   **UI & Styling**: The UI is built with React 19, styled with **Tailwind CSS**, and uses **shadcn/ui** for its component library. Animations are handled by **Framer Motion**.
*   **Authentication**: User authentication is managed by **Clerk**.
*   **Data & Ranking**: The application features a complex data pipeline.
    *   `lib/schema.ts` defines materialized views (`mv_post_trends_30m`, `mv_post_trends_agg`) for tracking post engagement over time.
    *   `lib/queries.ts` contains sophisticated SQL queries for ranking posts based on factors like hotness, recency, and site-specific normalization.
    *   The main page (`app/(feed)/page.tsx`) statically pre-renders multiple sections ("Rising", "Spotlight", "Today's Issues") by fetching data from these queries.

## Building and Running

The project uses `pnpm` as its package manager.

### Development

To run the local development server:

```bash
pnpm dev
```

This will start the server on `http://localhost:5005`.

### Static Build

The project is a static site. The build process involves two main steps:

1.  **Pre-building Data:** A series of scripts generate JSON data files that the static pages will consume. These can be run individually or in parallel.

    ```bash
    # Run all data-building scripts in parallel (recommended)
    ./build-parallel.sh

    # Or run all scripts via pnpm
    pnpm build:data
    ```

2.  **Building the Next.js Site:** This command generates the final static HTML, CSS, and JS files.

    ```bash
    pnpm build
    ```

The final exported site will be in the `out/` directory.

### Testing

To run the test suite:

```bash
pnpm test
```

## Development Conventions

*   **File Structure**: The project follows standard Next.js App Router conventions.
    *   `app/`: Contains the pages and layouts.
    *   `components/`: Contains React components, with `components/ui/` for shadcn components.
    *   `lib/`: Contains core application logic, including database schema (`schema.ts`), queries (`queries.ts`), and utilities.
    *   `scripts/`: Contains TypeScript scripts used for the static data generation process.
*   **Database**: All database schema changes should be managed through Drizzle Kit. The configuration is in `drizzle.config.ts`.
*   **Styling**: Use Tailwind CSS utility classes. New UI elements should be built using `shadcn/ui` components as a base where possible.
*   **Linting**: The project uses ESLint. Run `pnpm lint` to check for issues.
