/**
 * Centralized logging utility with environment-based controls
 * 
 * Usage:
 * - import { logger } from './utils/logger';
 * - logger.info('Message', data);
 * - logger.debug('Debug info', data);
 * - logger.warn('Warning', data);
 * - logger.error('Error', error);
 * 
 * Set DEBUG_MODE=true in production to enable debug logs
 */

// Check if we're in development mode or if debug is explicitly enabled
const isDevelopment = import.meta.env.MODE === 'development';
const isDebugEnabled = import.meta.env.VITE_DEBUG_MODE === 'true' || localStorage.getItem('DEBUG_MODE') === 'true';

// Enable debug mode in development or when explicitly enabled
const DEBUG = isDevelopment || isDebugEnabled;

// Prefix emojis for different log types
const PREFIX = {
  info: 'ℹ️',
  debug: '🔍',
  warn: '⚠️',
  error: '❌',
  success: '✅',
  data: '📦',
  api: '🌐',
  db: '💾',
  user: '👤',
  store: '🏪',
  production: '🏭',
  inventory: '📦',
  sales: '💰',
  analytics: '📊',
};

class Logger {
  /**
   * Info logs - always shown
   */
  info(message: string, ...args: any[]) {
    console.log(`${PREFIX.info} ${message}`, ...args);
  }

  /**
   * Success logs - always shown
   */
  success(message: string, ...args: any[]) {
    console.log(`${PREFIX.success} ${message}`, ...args);
  }

  /**
   * Warning logs - always shown
   */
  warn(message: string, ...args: any[]) {
    console.warn(`${PREFIX.warn} ${message}`, ...args);
  }

  /**
   * Error logs - always shown
   */
  error(message: string, error?: any, ...args: any[]) {
    console.error(`${PREFIX.error} ${message}`, error, ...args);
  }

  /**
   * Debug logs - only shown in development or when DEBUG_MODE is enabled
   */
  debug(message: string, ...args: any[]) {
    if (DEBUG) {
      console.log(`${PREFIX.debug} ${message}`, ...args);
    }
  }

  /**
   * Context-specific debug logs
   */
  debugUser(message: string, ...args: any[]) {
    if (DEBUG) {
      console.log(`${PREFIX.user} ${message}`, ...args);
    }
  }

  debugStore(message: string, ...args: any[]) {
    if (DEBUG) {
      console.log(`${PREFIX.store} ${message}`, ...args);
    }
  }

  debugProduction(message: string, ...args: any[]) {
    if (DEBUG) {
      console.log(`${PREFIX.production} ${message}`, ...args);
    }
  }

  debugInventory(message: string, ...args: any[]) {
    if (DEBUG) {
      console.log(`${PREFIX.inventory} ${message}`, ...args);
    }
  }

  debugSales(message: string, ...args: any[]) {
    if (DEBUG) {
      console.log(`${PREFIX.sales} ${message}`, ...args);
    }
  }

  debugAnalytics(message: string, ...args: any[]) {
    if (DEBUG) {
      console.log(`${PREFIX.analytics} ${message}`, ...args);
    }
  }

  debugApi(message: string, ...args: any[]) {
    if (DEBUG) {
      console.log(`${PREFIX.api} ${message}`, ...args);
    }
  }

  debugDb(message: string, ...args: any[]) {
    if (DEBUG) {
      console.log(`${PREFIX.db} ${message}`, ...args);
    }
  }

  /**
   * Enable debug mode at runtime
   */
  enableDebug() {
    localStorage.setItem('DEBUG_MODE', 'true');
    console.log('🔍 Debug mode enabled. Refresh the page to see debug logs.');
  }

  /**
   * Disable debug mode at runtime
   */
  disableDebug() {
    localStorage.removeItem('DEBUG_MODE');
    console.log('🔕 Debug mode disabled. Refresh the page.');
  }

  /**
   * Check if debug mode is enabled
   */
  isDebugEnabled() {
    return DEBUG;
  }
}

// Export singleton instance
export const logger = new Logger();

// Make logger available globally for console debugging
if (typeof window !== 'undefined') {
  (window as any).logger = logger;
}
