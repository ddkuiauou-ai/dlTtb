// Drizzle where eq helper
export function eq(column: any, value: any) {
    return { type: 'eq', column, value };
}
