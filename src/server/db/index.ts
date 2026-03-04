// Re-export the db instance from connection (no circular dependency)
export { db } from './connection.js';

// Re-export all domain CRUD functions
export * from './workspaces.js';
export * from './projects.js';
export * from './tasks.js';
export * from './comments.js';
export * from './dependencies.js';
