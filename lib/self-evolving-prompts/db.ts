/**
 * Database connection pool configuration for Self-Evolving Prompts
 * Uses the existing Prisma client with raw SQL queries for performance
 */

import { PrismaClient } from '@prisma/client';

// Use the global Prisma client instance
let prisma: PrismaClient;

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient();
} else {
  // In development, use a global variable to prevent multiple instances
  if (!(global as any).prisma) {
    (global as any).prisma = new PrismaClient();
  }
  prisma = (global as any).prisma;
}

export { prisma };

/**
 * Execute a raw SQL query with parameters
 * Provides a consistent interface for raw queries
 */
export async function executeQuery<T = any>(
  query: string,
  params: any[] = []
): Promise<T[]> {
  return prisma.$queryRawUnsafe<T[]>(query, ...params);
}

/**
 * Execute a raw SQL command (INSERT, UPDATE, DELETE)
 * Returns the number of affected rows
 */
export async function executeCommand(
  command: string,
  params: any[] = []
): Promise<number> {
  const result = await prisma.$executeRawUnsafe(command, ...params);
  return result;
}

/**
 * Execute multiple queries in a transaction
 */
export async function executeTransaction<T>(
  callback: (tx: PrismaClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(callback);
}

/**
 * Health check for database connection
 */
export async function checkConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database connection check failed:', error);
    return false;
  }
}

/**
 * Close database connection
 * Should be called when shutting down the application
 */
export async function closeConnection(): Promise<void> {
  await prisma.$disconnect();
}
