import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { getJobByNumber } from '../services/jobs.js';
import { apiFetch } from '../services/api.js';
import { CATEGORIES } from '../constants/categories.js';

const COLD_SUBCATS = [
  'Refrigerator',
  'Cooler',
  'Freezer',
  'Evaporator',
  'Condenser',
  'Unit Cooler',
  'Walk-In Cooler',
  'Walk-In Freezer',
  'Reach-In Cooler',
  'Reach-In Freezer',
  'Ice Machine',
  'Display Case',
];
const HVAC_SUBCATS = [
  'Rooftop Unit',
  'Split System',
  'Air Handler',
  'Chiller',
  'Boiler',
  'Heat Pump',
  'Fan Coil',
  'VRF/VRV',
  'Cooling Tower',
  'Condenser',
];

const ACTIVE_PROJECT_KEY = 'activeProjectGid';

export function useJobContext({ setError }) {
  const [jobNumber, setJobNumber] = useState('');
  const [jobName, setJobName] = useState('');
  const [loadedJob, setLoadedJob] = useState(null);
  const [loadingJob, setLoadingJob] = useState(false);
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [boardMatches, setBoardMatches] = useState([]);
  const [showBoardPicker, setShowBoardPicker] = useState(false);
  const [asanaProject, setAsanaProject] = useState(null);
  const [asanaSections, setAsanaSections] = useState([]);
  const [cachedBoards, setCachedBoards] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('asanaProjects') || '[]');
    } catch {
      return [];
    }
  });
  const [selectedCategoryItem, setSelectedCategoryItem] = useState(null);
  const [equipmentNumber, setEquipmentNumber] = useState(1);
  const boardIdRef = useRef(null);
  const asanaSectionsRef = useRef(asanaSections);

  useEffect(() => {
    asanaSectionsRef.current = asanaSections;
  }, [asanaSections]);

  useEffect(() => {
    if (boardIdRef.current) {
      localStorage.setItem(`equipNum_${boardIdRef.current}`, String(equipmentNumber));
    }
  }, [equipmentNumber]);

  // Preload Asana project list on startup for offline use
  useEffect(() => {
    apiFetch('/api/asana/projects')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.projects?.length) {
          setCachedBoards(data.projects);
          localStorage.setItem('asanaProjects', JSON.stringify(data.projects));
        }
      })
      .catch(() => {});
  }, []);

  const isAsanaMode = asanaSections.length > 0;

  const categoryOptions = useMemo(
    () => (isAsanaMode ? [...new Set(asanaSections.map((c) => c.name))] : Object.keys(CATEGORIES)),
    [isAsanaMode, asanaSections]
  );

  const subcategoryOptions = useMemo(() => {
    if (!isAsanaMode) return CATEGORIES[category] || [];

    if (selectedCategoryItem) {
      const n = selectedCategoryItem.name.toLowerCase();
      // Try exact or partial match against hardcoded CATEGORIES keys first
      const matchedKey = Object.keys(CATEGORIES).find((k) => {
        const kl = k.toLowerCase();
        return kl === n || n.includes(kl);
      });
      if (matchedKey) return CATEGORIES[matchedKey];

      // Fall back to domain type lists based on section name
      if (
        /cold|refriger|cooler|freezer|walk|evaporator|condensing|condenser|ice machine/i.test(n)
      ) {
        return COLD_SUBCATS;
      }
      if (/hvac|rooftop|rtu|split|chiller|boiler|air handler|vrf|vrv/i.test(n)) {
        return HVAC_SUBCATS;
      }
    }

    // Last resort: show existing task names from the section
    return [...new Set((selectedCategoryItem?.tasks || []).map((t) => t.name))];
  }, [isAsanaMode, selectedCategoryItem, category]);

  const selectBoard = useCallback((project, categories) => {
    const projectGid = project.gid;
    setAsanaProject(project);
    setJobName(project.name || '');
    setJobNumber(projectGid);
    setShowBoardPicker(false);
    setBoardMatches([]);

    boardIdRef.current = projectGid;
    const savedNum = localStorage.getItem(`equipNum_${projectGid}`);
    setEquipmentNumber(savedNum ? parseInt(savedNum, 10) : 1);

    // Async Firestore restore — wins over localStorage if higher (handles multi-device)
    getJobByNumber(projectGid)
      .then((existingJob) => {
        if (existingJob) {
          setLoadedJob(existingJob);
          if (existingJob.nextPhotoNumber && existingJob.nextPhotoNumber > 1) {
            const localNum = savedNum ? parseInt(savedNum, 10) : 1;
            const best = Math.max(localNum, existingJob.nextPhotoNumber);
            setEquipmentNumber(best);
            localStorage.setItem(`equipNum_${projectGid}`, String(best));
          }
        }
      })
      .catch(() => {});

    if (categories && categories.length > 0) {
      setAsanaSections(categories);
      setCategory('');
      setSubcategory('');
      setSelectedCategoryItem(null);
    }

    setLoadedJob({
      clientName: project.name,
      jobNumber: project.gid,
      asana: {
        projectGid: project.gid,
      },
    });

    try {
      localStorage.setItem(
        `asanaProject_${project.gid}`,
        JSON.stringify({ board: project, categories: categories || [] })
      );
      localStorage.setItem(ACTIVE_PROJECT_KEY, project.gid);
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  // Restore the last-loaded job board on mount so a page reload (or PWA
  // relaunch) doesn't strand a field tech who already prepped their board
  // at the office and lost signal — see the offline-first design in
  // CLAUDE.md. Only the active *selection* needs this; cachedBoards (the
  // full searchable list) already persists on its own.
  useEffect(() => {
    let activeGid;
    try {
      activeGid = localStorage.getItem(ACTIVE_PROJECT_KEY);
      if (!activeGid) return;
      const cached = JSON.parse(localStorage.getItem(`asanaProject_${activeGid}`));
      if (cached?.board) {
        selectBoard(cached.board, cached.categories || []);
      }
    } catch {
      /* localStorage unavailable or corrupt cache entry — start fresh */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLoadJob = useCallback(
    async (searchOverride) => {
      const searchTerm = searchOverride || jobNumber.trim() || jobName.trim();
      if (!searchTerm) return;
      setLoadingJob(true);
      setBoardMatches([]);
      setShowBoardPicker(false);

      // Optimistic UI: if cachedBoards has a unique match, render its name immediately
      // and any cached categories. The /lookup call below refreshes with fresh data.
      const isIdSearch = /^\d+$/.test(searchTerm);
      const searchLower = searchTerm.toLowerCase();
      const optimisticMatches = isIdSearch
        ? cachedBoards.filter((b) => String(b.gid) === searchTerm)
        : cachedBoards.filter((b) => b.name.toLowerCase().includes(searchLower));
      let optimisticBoardId = null;
      if (optimisticMatches.length === 1) {
        let optimisticCategories = [];
        try {
          const cached = JSON.parse(
            localStorage.getItem(`asanaProject_${optimisticMatches[0].gid}`)
          );
          if (cached?.categories) optimisticCategories = cached.categories;
        } catch {
          /* skip */
        }
        selectBoard(optimisticMatches[0], optimisticCategories);
        optimisticBoardId = optimisticMatches[0].gid;
      }

      try {
        const res = await apiFetch(`/api/asana/lookup?q=${encodeURIComponent(searchTerm)}`);
        const data = await res.json();

        if (!res.ok) {
          // Don't tear down optimistic UI on a transient server error
          if (!optimisticBoardId) {
            setError(data.error || 'Project not found');
            setLoadedJob(null);
            setJobName('');
            setAsanaProject(null);
          }
          setLoadingJob(false);
          return;
        }

        const projects = data.projects || [];

        if (projects.length === 1) {
          selectBoard(projects[0], data.categories || []);
          try {
            localStorage.setItem(
              `asanaProject_${projects[0].gid}`,
              JSON.stringify({ board: projects[0], categories: data.categories || [] })
            );
          } catch {
            /* skip */
          }
        } else if (projects.length > 1) {
          // Server returned multiple matches — tear down any optimistic single-project UI
          if (optimisticBoardId) {
            setAsanaProject(null);
            setJobName(searchTerm);
          }
          setBoardMatches(projects);
          setShowBoardPicker(true);
        }
      } catch {
        // Offline fallback
        const isId = /^\d+$/.test(searchTerm);
        const searchLower = searchTerm.toLowerCase();

        let matches;
        if (isId) {
          matches = cachedBoards.filter((b) => String(b.gid) === searchTerm);
        } else {
          matches = cachedBoards.filter((b) => b.name.toLowerCase().includes(searchLower));
        }

        if (matches.length === 0) {
          setError(`Offline — no cached projects matching "${searchTerm}"`);
          setLoadingJob(false);
          return;
        }

        if (matches.length === 1) {
          const cacheKey = `asanaProject_${matches[0].gid}`;
          try {
            const cached = JSON.parse(localStorage.getItem(cacheKey));
            if (cached) {
              selectBoard(cached.board, cached.categories || []);
              setLoadingJob(false);
              return;
            }
          } catch {
            /* fall through */
          }
          selectBoard(matches[0], []);
        } else {
          setBoardMatches(matches);
          setShowBoardPicker(true);
        }
      } finally {
        setLoadingJob(false);
      }
    },
    [jobNumber, jobName, cachedBoards, selectBoard, setError]
  );

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(ACTIVE_PROJECT_KEY);
    } catch {
      /* localStorage unavailable */
    }
    boardIdRef.current = null;
    setEquipmentNumber(1);
    setJobNumber('');
    setJobName('');
    setLoadedJob(null);
    setAsanaProject(null);
    setBoardMatches([]);
    setShowBoardPicker(false);
    setAsanaSections([]);
    setSelectedCategoryItem(null);
    setCategory('');
    setSubcategory('');
  }, []);

  return {
    jobNumber,
    setJobNumber,
    jobName,
    setJobName,
    loadedJob,
    setLoadedJob,
    loadingJob,
    category,
    setCategory,
    subcategory,
    setSubcategory,
    boardMatches,
    setBoardMatches,
    showBoardPicker,
    setShowBoardPicker,
    asanaProject,
    setAsanaProject,
    asanaSections,
    setAsanaSections,
    selectedCategoryItem,
    setSelectedCategoryItem,
    equipmentNumber,
    setEquipmentNumber,
    boardIdRef,
    asanaSectionsRef,
    isAsanaMode,
    categoryOptions,
    subcategoryOptions,
    handleLoadJob,
    selectBoard,
    reset,
  };
}
