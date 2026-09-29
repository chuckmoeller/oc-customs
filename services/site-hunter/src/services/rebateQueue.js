import { openDB } from 'idb';

const DB_NAME = 'yield-hunter-db';
const DB_VERSION = 1;
const STORE_NAME = 'pending-audits';

/**
 * @typedef {'standard' | 'nanotech'} MaterialType
 *
 * @typedef {Object} BaselineSystem
 * @property {string} equipment_type
 * @property {string|null} [manufacturer]
 * @property {string|null} [model_number]
 * @property {number|null} [capacity_btu]
 * @property {number|null} [tonnage]
 * @property {number|null} [efficiency_rating]
 * @property {MaterialType} [material_type]
 * @property {number|null} [install_year]
 *
 * @typedef {Object} ProposedECM
 * @property {string} equipment_type
 * @property {string|null} [manufacturer]
 * @property {string|null} [model_number]
 * @property {number|null} [capacity_btu]
 * @property {number|null} [tonnage]
 * @property {number|null} [efficiency_rating]
 * @property {MaterialType} [material_type]
 * @property {string|null} [measure_description]
 *
 * @typedef {Object} NormalizedECMData
 * @property {string} site_id
 * @property {string|null} [utility_program]
 * @property {BaselineSystem} baseline_system
 * @property {ProposedECM} proposed_ecm
 */

/** @returns {Promise<import('idb').IDBPDatabase>} */
function initDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('status', 'status');
      }
    },
  });
}

/**
 * Queue a rebate audit payload for background sync.
 * @param {NormalizedECMData} payload
 * @returns {Promise<number>} the assigned record id
 */
export async function addPendingAudit(payload) {
  const db = await initDB();
  return db.add(STORE_NAME, {
    payload,
    status: 'pending',
    createdAt: Date.now(),
  });
}

/**
 * @returns {Promise<Array<{ id: number, payload: NormalizedECMData, status: string, createdAt: number }>>}
 */
export async function getPendingAudits() {
  const db = await initDB();
  return db.getAllFromIndex(STORE_NAME, 'status', 'pending');
}

/**
 * @param {number} id
 * @returns {Promise<void>}
 */
export async function deletePendingAudit(id) {
  const db = await initDB();
  return db.delete(STORE_NAME, id);
}

/**
 * Mark an audit as permanently invalid so it is not retried by future sync events.
 * @param {number} id
 * @returns {Promise<void>}
 */
export async function markAuditFailed(id) {
  const db = await initDB();
  const record = await db.get(STORE_NAME, id);
  if (!record) return;
  await db.put(STORE_NAME, { ...record, status: 'failed_validation' });
}
