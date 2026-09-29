import { useState } from 'react';
import { getJobByNumber, createJob } from '../services/jobs.js';
import { apiFetch } from '../services/api.js';

export function useQuickExport() {
  const [exportJobName, setExportJobName] = useState('');
  const [exportJobNumber, setExportJobNumber] = useState('');
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState(null);
  const [exportSuccess, setExportSuccess] = useState(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [exportStage, setExportStage] = useState('');
  const [exportBoardMatches, setExportBoardMatches] = useState([]);
  const [exportSelectedBoard, setExportSelectedBoard] = useState(null);
  const [billingPullLoading, setBillingPullLoading] = useState(false);
  const [billingPullMessage, setBillingPullMessage] = useState(null);
  const [photoSortLoading, setPhotoSortLoading] = useState(false);
  const [photoSortMessage, setPhotoSortMessage] = useState(null);

  // Readiness modal & sync pipeline state
  const [showReadinessModal, setShowReadinessModal] = useState(false);
  const [readinessData, setReadinessData] = useState(null);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [readinessError, setReadinessError] = useState(null);
  const [activeJobTarget, setActiveJobTarget] = useState(null);

  const [syncLoading, setSyncLoading] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });
  const [syncStatus, setSyncStatus] = useState('');

  // Shared with handleExportConfirm: find-or-create the Firestore job doc backing
  // this Asana board, so both export and the billing pull talk to the same job record.
  const resolveJobForBoard = async (board) => {
    if (typeof board === 'string') return board;
    const boardId = board.gid || board.id;
    try {
      let firestoreJob = await getJobByNumber(String(boardId));
      if (!firestoreJob) {
        firestoreJob = await createJob({
          jobNumber: String(boardId),
          clientName: board.name || board.clientName,
          asanaProjectGid: String(boardId),
        });
      }
    } catch (e) {
      console.warn('Firestore sync warning in resolveJobForBoard:', e);
    }
    return boardId || board.id || board.gid;
  };

  // Step 1: Search for matching boards
  const handleExportSearch = async () => {
    const searchTerm = exportJobNumber.trim() || exportJobName.trim();
    if (!searchTerm) return;
    setExportLoading(true);
    setExportError(null);
    setExportSuccess(null);
    setShowCelebration(false);
    setExportBoardMatches([]);
    setExportSelectedBoard(null);
    setExportStage('looking-up');

    try {
      const res = await apiFetch(`/api/asana/lookup?q=${encodeURIComponent(searchTerm)}`);
      const data = await res.json();

      if (!res.ok) {
        setExportError(data.error || 'Project not found');
        setExportLoading(false);
        setExportStage('');
        return;
      }

      const boards = data.projects || [];
      if (boards.length === 0) {
        setExportError('No projects found');
        setExportLoading(false);
        setExportStage('');
        return;
      }

      if (boards.length === 1) {
        setExportSelectedBoard(boards[0]);
        setExportBoardMatches([]);
      } else {
        setExportBoardMatches(boards);
      }
      setExportLoading(false);
      setExportStage('');
    } catch (err) {
      setExportError(err.message || 'Search failed');
      setExportLoading(false);
      setExportStage('');
    }
  };

  // Step 2: Fetch Readiness Audit and open modal
  const fetchReadiness = async (jobId, targetGid = null) => {
    setReadinessLoading(true);
    setReadinessError(null);
    try {
      const q = targetGid ? `?projectGid=${encodeURIComponent(targetGid)}` : '';
      const res = await apiFetch(`/api/export/readiness/${jobId}${q}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch readiness');
      setReadinessData(data);
    } catch (err) {
      setReadinessError(err.message || 'Failed to audit export readiness');
    } finally {
      setReadinessLoading(false);
    }
  };

  const handleOpenReadiness = async (boardOrJob) => {
    if (!boardOrJob) return;
    setActiveJobTarget(boardOrJob);
    setShowReadinessModal(true);
    try {
      const targetGid = boardOrJob.gid || boardOrJob.id;
      const jobId = await resolveJobForBoard(boardOrJob);
      await fetchReadiness(jobId, targetGid);
    } catch (err) {
      setReadinessError(err.message);
    }
  };

  // Step 3: Run Background Sync with SSE streaming
  const handleSyncAsana = async (boardOrJob = null) => {
    const target = boardOrJob || activeJobTarget || exportSelectedBoard;
    if (!target) return;
    setSyncLoading(true);
    setSyncStatus('Connecting to Calibrator stream...');
    setSyncProgress({ current: 0, total: 0 });

    try {
      const jobId = await resolveJobForBoard(target);
      const res = await apiFetch(`/api/export/sync/${jobId}?stream=true`, {
        method: 'POST',
        headers: { Accept: 'text/event-stream' },
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Sync failed (${res.status})`);
      }

      const reader = res.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let sepIndex;
          while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
            const rawEvent = buffer.slice(0, sepIndex);
            buffer = buffer.slice(sepIndex + 2);
            const eventMatch = rawEvent.match(/^event: (.+)$/m);
            const dataMatch = rawEvent.match(/^data: (.+)$/m);
            if (!eventMatch || !dataMatch) continue;
            const eventType = eventMatch[1].trim();
            const data = JSON.parse(dataMatch[1]);

            if (eventType === 'progress') {
              setSyncStatus(data.label || 'Syncing...');
              if (data.total) setSyncProgress({ current: data.current, total: data.total });
            } else if (eventType === 'complete') {
              setSyncStatus('Sync complete! Refreshing audit...');
              await fetchReadiness(jobId);
            } else if (eventType === 'error') {
              throw new Error(data.error || 'Sync failed');
            }
          }
        }
      } else {
        // Non-streaming fallback
        await fetchReadiness(jobId);
      }
    } catch (err) {
      setReadinessError(err.message || 'Sync failed');
    } finally {
      setSyncLoading(false);
      setSyncStatus('');
    }
  };

  // Step 4: Export the confirmed board
  const handleExportConfirm = async (board, format = 'excel') => {
    if (!board) return;
    const isCsv = format === 'csv';
    setExportLoading(true);
    setExportError(null);
    setExportSuccess(null);
    setShowCelebration(false);
    setExportBoardMatches([]);
    setExportSelectedBoard(board);
    setExportStage('building');

    try {
      const jobId = await resolveJobForBoard(board);

      setExportStage('downloading');
      const targetGid = board?.gid || board?.id || '';
      const q = targetGid ? `?projectGid=${encodeURIComponent(targetGid)}` : '';
      const endpoint = isCsv ? `/api/export/equipment/${jobId}${q}` : `/api/export/excel/${jobId}${q}`;
      const excelRes = await apiFetch(endpoint);
      if (!excelRes.ok) {
        const errData = await excelRes.json().catch(() => ({}));
        throw new Error(errData.error || `Export failed (${excelRes.status})`);
      }

      const blob = await excelRes.blob();
      const targetName = board.name || board.clientName || 'Project';
      const filename =
        excelRes.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1] ||
        (isCsv
          ? `${targetName}_Equipment_Inventory.csv`
          : `${targetName}_Project_Submission_Form.xlsx`);

      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(dlUrl);

      setExportLoading(false);
      setExportStage('');
      setExportSuccess(`${targetName} exported successfully!`);
      setShowCelebration(true);
      setTimeout(() => setShowCelebration(false), 5000);
    } catch (err) {
      setExportError(err.message || 'Export failed');
      setExportLoading(false);
      setExportStage('');
    }
  };

  // Pull bills from Asana now, ahead of export
  const handlePullBilling = async (board) => {
    if (!board) return;
    setBillingPullLoading(true);
    setBillingPullMessage(null);
    try {
      const jobId = await resolveJobForBoard(board);
      const res = await apiFetch(`/api/billing/import/${jobId}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Pull failed (${res.status})`);

      setBillingPullMessage(
        data.imported > 0
          ? `Pulled ${data.imported} new bill month${data.imported === 1 ? '' : 's'}`
          : (data.message ?? 'No new bills found')
      );

      // Refresh readiness data if modal is open
      if (showReadinessModal) {
        await fetchReadiness(jobId);
      }
    } catch (err) {
      setBillingPullMessage(err.message || 'Pull failed');
    } finally {
      setBillingPullLoading(false);
    }
  };

  // Sort & classify unorganized nameplate photos
  const handleSortPhotos = async (board) => {
    if (!board) return;
    setPhotoSortLoading(true);
    setPhotoSortMessage(null);
    try {
      const jobId = await resolveJobForBoard(board);
      const res = await apiFetch(`/api/asana/sort-photos/${jobId}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Sort failed (${res.status})`);

      setPhotoSortMessage(
        data.tasksCreated > 0
          ? `Sorted ${data.photosProcessed} photo${data.photosProcessed === 1 ? '' : 's'} into ${data.tasksCreated} device${data.tasksCreated === 1 ? '' : 's'}`
          : 'No unsorted nameplate photos found'
      );

      // Refresh readiness if modal is open
      if (showReadinessModal) {
        await fetchReadiness(jobId);
      }
    } catch (err) {
      setPhotoSortMessage(err.message || 'Sort failed');
    } finally {
      setPhotoSortLoading(false);
    }
  };

  return {
    exportJobName,
    setExportJobName,
    exportJobNumber,
    setExportJobNumber,
    exportLoading,
    setExportLoading,
    exportError,
    setExportError,
    exportSuccess,
    setExportSuccess,
    showCelebration,
    setShowCelebration,
    exportStage,
    setExportStage,
    exportBoardMatches,
    setExportBoardMatches,
    exportSelectedBoard,
    setExportSelectedBoard,
    billingPullLoading,
    billingPullMessage,
    setBillingPullMessage,
    photoSortLoading,
    photoSortMessage,
    setPhotoSortMessage,
    handleExportSearch,
    handleExportConfirm,
    handlePullBilling,
    handleSortPhotos,
    // Readiness & Background Sync
    showReadinessModal,
    setShowReadinessModal,
    readinessData,
    readinessLoading,
    readinessError,
    activeJobTarget,
    handleOpenReadiness,
    handleSyncAsana,
    syncLoading,
    syncProgress,
    syncStatus,
  };
}
