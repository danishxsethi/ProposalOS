/**
 * Test setup and utilities for deep-localization-cross-tenant-intelligence
 */

import { initializePool, resetDatabase, closePool } from '../db/connection';

/**
 * Global test setup
 */
export async function setupTests(): Promise<void> {
  // Initialize database connection
  initializePool();

  // Reset database to clean state
  await resetDatabase();
}

/**
 * Global test teardown
 */
export async function teardownTests(): Promise<void> {
  // Close database connection
  await closePool();
}

/**
 * Setup for each test
 */
export async function setupEachTest(): Promise<void> {
  // Initialize pool if not already done
  initializePool();
  // Reset database before each test
  await resetDatabase();
}

/**
 * Teardown for each test
 */
export async function teardownEachTest(): Promise<void> {
  // No cleanup needed per test
}
