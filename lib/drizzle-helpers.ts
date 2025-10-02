// Drizzle where eq helper
export function eq<T>(column: T, value: unknown) {
    return { type: 'eq', column, value };
}
