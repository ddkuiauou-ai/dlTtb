# Project Overview

This is a Next.js project that appears to be a web application for aggregating and displaying content from various online forums. It uses a PostgreSQL database with Drizzle ORM to manage the data. The frontend is built with React, TypeScript, and Tailwind CSS.

## Key Technologies

*   **Framework:** Next.js
*   **Language:** TypeScript
*   **Database:** PostgreSQL with Drizzle ORM
*   **Styling:** Tailwind CSS
*   **UI Components:** Shadcn UI

# Building and Running

## Prerequisites

*   Node.js
*   pnpm
*   PostgreSQL

## Installation

1.  Install dependencies:
    ```bash
    pnpm install
    ```

2.  Set up the database:
    *   Create a PostgreSQL database.
    *   Create a `.env.local` file and add the database connection string:
        ```
        DATABASE_URL="postgresql://user:password@host:port/database"
        ```

3.  Run database migrations:
    ```bash
    pnpm drizzle-kit generate
    pnpm drizzle-kit migrate
    ```

## Running the application

*   **Development:**
    ```bash
    pnpm dev
    ```

*   **Production:**
    ```bash
    pnpm build
    pnpm start
    ```

# Development Guidelines

This section outlines the coding styles, database management, documentation, and other conventions for this project.

## General Principles (일반 원칙)

*   **File Paths**: Always use absolute paths when specifying file paths for operations.
*   **Markdown Documents**: Create or modify documents within the `doc/` directory.

## Task Handling (작업 요청 처리)

*   **Documentation**: When requested to document something, select the appropriate file from the three listed below to add the content.
*   **Feature Implementation**: When implementing features, place the code in the appropriate folder (`app/`, `components/`, `hooks/`, `lib/`) considering the project structure.

## Documentation Guidelines (문서화 지침)

Maintain the header structure of each document and use appropriate heading levels (`#`, `##`, `###`). Provide code blocks with language specification (e.g., `tsx`, `ts`, `yaml`).

1.  **UI Documentation (`doc/ui.md`)**: Descriptions of components and hooks.
2.  **Specification Documentation (`doc/spec.md`)**: Design for SSG, JSON, and APIs.
3.  **Service Documentation (`doc/service.md`)**: Deployment, CI/CD, and service philosophy.

## Coding Style & Database

*   **Coding Style**: The project uses the default Next.js ESLint and Prettier configurations.
*   **Database**: The database schema is managed with Drizzle ORM. To make changes to the schema, modify `lib/schema.ts` and then run the migration commands.

# Future Improvements (TODO)

*   **Testing**: There are no explicit test scripts in `package.json`. Testing scripts and instructions need to be added.
*   **Contribution Guidelines**: Formal contribution guidelines need to be established.
