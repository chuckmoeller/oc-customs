import { create } from "zustand";
import { openDB } from "idb";

const DB_NAME = "site-hunter-offline";
const DB_VERSION = 1;

// Initialize IndexedDB
async function initDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Queued images store
      if (!db.objectStoreNames.contains("queuedImages")) {
        const imageStore = db.createObjectStore("queuedImages", { keyPath: "id", autoIncrement: true });
        imageStore.createIndex("status", "status");
        imageStore.createIndex("createdAt", "createdAt");
      }

      // Queued analysis store
      if (!db.objectStoreNames.contains("queuedAnalysis")) {
        const analysisStore = db.createObjectStore("queuedAnalysis", { keyPath: "id", autoIncrement: true });
        analysisStore.createIndex("status", "status");
        analysisStore.createIndex("scanId", "scanId");
      }

      // Failed syncs for retry
      if (!db.objectStoreNames.contains("failedSyncs")) {
        const failedStore = db.createObjectStore("failedSyncs", { keyPath: "id", autoIncrement: true });
        failedStore.createIndex("retryCount", "retryCount");
        failedStore.createIndex("lastRetried", "lastRetried");
      }
    },
  });
}

// Create Zustand store for offline queue state
export const useOfflineQueue = create((set, get) => ({
  isOnline: navigator.onLine,
  queuedImages: [],
  queuedAnalysis: [],
  failedSyncs: [],
  syncInProgress: false,

  // Initialize online/offline detection
  initOnlineDetection: () => {
    const handleOnline = () => set({ isOnline: true });
    const handleOffline = () => set({ isOnline: false });

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Also check connectivity periodically
    const interval = setInterval(async () => {
      try {
        // Try to fetch a lightweight endpoint
        const response = await fetch("/ping", { method: "HEAD", cache: "no-store" });
        set({ isOnline: response.ok });
      } catch {
        set({ isOnline: false });
      }
    }, 30000); // Check every 30 seconds

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  },

  // Add image to offline queue
  addImageToQueue: async (base64, metadata) => {
    try {
      const db = await initDB();
      const id = await db.add("queuedImages", {
        base64,
        metadata: {
          ...metadata,
          timestamp: new Date().toISOString(),
        },
        status: "pending",
        createdAt: Date.now(),
        syncedAt: null,
      });

      // Update local state
      set((state) => ({
        queuedImages: [
          ...state.queuedImages,
          {
            id,
            status: "pending",
            metadata,
            createdAt: Date.now(),
          },
        ],
      }));

      return id;
    } catch (error) {
      console.error("Failed to add image to queue:", error);
      throw error;
    }
  },

  // Add analysis to queue
  addAnalysisToQueue: async (scanId, imageBase64, provider = "gemini") => {
    try {
      const db = await initDB();
      const id = await db.add("queuedAnalysis", {
        scanId,
        imageBase64,
        provider,
        status: "pending",
        createdAt: Date.now(),
        processedAt: null,
      });

      set((state) => ({
        queuedAnalysis: [
          ...state.queuedAnalysis,
          {
            id,
            scanId,
            status: "pending",
            createdAt: Date.now(),
          },
        ],
      }));

      return id;
    } catch (error) {
      console.error("Failed to add analysis to queue:", error);
      throw error;
    }
  },

  // Get all pending items from queue
  getSyncableItems: async () => {
    try {
      const db = await initDB();
      const images = await db.getAllFromIndex("queuedImages", "status", "pending");
      const analysis = await db.getAllFromIndex("queuedAnalysis", "status", "pending");

      return { images, analysis };
    } catch (error) {
      console.error("Failed to get syncable items:", error);
      return { images: [], analysis: [] };
    }
  },

  // Mark image as synced
  markImageSynced: async (id) => {
    try {
      const db = await initDB();
      const item = await db.get("queuedImages", id);
      if (item) {
        await db.put("queuedImages", {
          ...item,
          status: "synced",
          syncedAt: Date.now(),
        });
      }

      set((state) => ({
        queuedImages: state.queuedImages.filter((img) => img.id !== id),
      }));
    } catch (error) {
      console.error("Failed to mark image as synced:", error);
    }
  },

  // Mark analysis as synced
  markAnalysisSynced: async (id) => {
    try {
      const db = await initDB();
      const item = await db.get("queuedAnalysis", id);
      if (item) {
        await db.put("queuedAnalysis", {
          ...item,
          status: "processed",
          processedAt: Date.now(),
        });
      }

      set((state) => ({
        queuedAnalysis: state.queuedAnalysis.filter((a) => a.id !== id),
      }));
    } catch (error) {
      console.error("Failed to mark analysis as synced:", error);
    }
  },

  // Mark item as failed sync
  markSyncFailed: async (itemId, itemType) => {
    try {
      const db = await initDB();
      const store = itemType === "image" ? "queuedImages" : "queuedAnalysis";
      const item = await db.get(store, itemId);

      if (item) {
        const retryCount = (item.retryCount || 0) + 1;
        await db.put(store, {
          ...item,
          status: "failed",
          retryCount,
          lastRetried: Date.now(),
        });
      }
    } catch (error) {
      console.error("Failed to mark sync as failed:", error);
    }
  },

  // Get queue status
  getQueueStatus: () => {
    const state = get();
    return {
      totalPendingImages: state.queuedImages.length,
      totalPendingAnalysis: state.queuedAnalysis.length,
      total: state.queuedImages.length + state.queuedAnalysis.length,
      isOnline: state.isOnline,
      syncInProgress: state.syncInProgress,
    };
  },

  // Set sync in progress
  setSyncInProgress: (inProgress) => set({ syncInProgress: inProgress }),

  // Load queue from IndexedDB (call on app startup)
  loadQueueFromDB: async () => {
    try {
      const db = await initDB();
      const images = await db.getAllFromIndex("queuedImages", "status", "pending");
      const analysis = await db.getAllFromIndex("queuedAnalysis", "status", "pending");

      set({
        queuedImages: images.map((img) => ({
          id: img.id,
          status: img.status,
          metadata: img.metadata,
          createdAt: img.createdAt,
        })),
        queuedAnalysis: analysis.map((a) => ({
          id: a.id,
          scanId: a.scanId,
          status: a.status,
          createdAt: a.createdAt,
        })),
      });
    } catch (error) {
      console.error("Failed to load queue from DB:", error);
    }
  },

  // Get full image base64 from IndexedDB by ID (not stored in Zustand to save memory)
  getImageBase64: async (id) => {
    try {
      const db = await initDB();
      const item = await db.get("queuedImages", id);
      return item?.base64 || null;
    } catch (error) {
      console.error("Failed to get image base64:", error);
      return null;
    }
  },

  // Clear all queued items
  clearQueue: async () => {
    try {
      const db = await initDB();
      await db.clear("queuedImages");
      await db.clear("queuedAnalysis");
      set({ queuedImages: [], queuedAnalysis: [] });
    } catch (error) {
      console.error("Failed to clear queue:", error);
    }
  },
}));
