import { useState, useRef, useCallback } from 'react';
import { base64ToBlob, uploadScanImage } from '../services/storage.js';
import { createScan } from '../services/scans.js';
import { getJobByNumber, createJob } from '../services/jobs.js';
import { apiFetch } from '../services/api.js';
import { isHeicImage, ensureJpegImage } from '../utils/imageUtils.js';

export function useJobPhotos({
  capturePhoto,
  stopCamera,
  loadedJob,
  setLoadedJob,
  jobNumber,
  jobName,
  asanaProject,
  setError,
}) {
  const [jobPhotos, setJobPhotos] = useState([]);
  const [jobPhotoLabel, setJobPhotoLabel] = useState('');
  const [jobPhotoCategory, setJobPhotoCategory] = useState('');
  const [jobPhotoSubcategory, setJobPhotoSubcategory] = useState('');
  const [savingJobPhotos, setSavingJobPhotos] = useState(false);
  const jobPhotoFileRef = useRef(null);

  const handleAddJobPhoto = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        let base64 = reader.result;
        if (isHeicImage(base64) || file.name?.toLowerCase().endsWith('.heic') || file.name?.toLowerCase().endsWith('.heif')) {
          base64 = await ensureJpegImage(base64);
        }
        const label = jobPhotoLabel.trim() || `Photo ${jobPhotos.length + 1}`;
        const cat = jobPhotoCategory || 'Uncategorized';
        const subcat = jobPhotoSubcategory || '';
        setJobPhotos((prev) => [
          ...prev,
          { base64, label, category: cat, subcategory: subcat },
        ]);
        setJobPhotoLabel('');
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    },
    [jobPhotoLabel, jobPhotos.length, jobPhotoCategory, jobPhotoSubcategory]
  );

  const handleTakeJobPhoto = useCallback(() => {
    const base64 = capturePhoto();
    if (!base64) return;
    stopCamera();
    const label = jobPhotoLabel.trim() || `Photo ${jobPhotos.length + 1}`;
    const cat = jobPhotoCategory || 'Uncategorized';
    const subcat = jobPhotoSubcategory || '';
    setJobPhotos((prev) => [...prev, { base64, label, category: cat, subcategory: subcat }]);
    setJobPhotoLabel('');
  }, [
    capturePhoto,
    stopCamera,
    jobPhotoLabel,
    jobPhotos.length,
    jobPhotoCategory,
    jobPhotoSubcategory,
  ]);

  const handleRemoveJobPhoto = useCallback((index) => {
    setJobPhotos((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSaveJobPhotos = useCallback(async () => {
    if (jobPhotos.length === 0) return null;
    setSavingJobPhotos(true);

    try {
      let job = loadedJob;
      if (!job || !job.id) {
        const existingJob = await getJobByNumber(jobNumber.trim());
        if (existingJob) {
          job = existingJob;
        } else {
          job = await createJob({
            clientName: jobName.trim(),
            jobNumber: jobNumber.trim(),
            asanaProjectGid: asanaProject?.gid || null,
          });
        }
        setLoadedJob(job);
      }

      for (const photo of jobPhotos) {
        const blob = base64ToBlob(photo.base64);
        const imageData = await uploadScanImage(blob);
        await createScan({
          image: imageData,
          provider: 'manual',
          model: null,
          analysisResult: { category: photo.category, label: photo.label, type: 'job-photo' },
          jobNumber: jobNumber.trim(),
          equipmentType: photo.category,
          status: 'completed',
        });
      }

      const targetProjectGid = asanaProject?.gid || job.asana?.projectGid;
      if (targetProjectGid) {
        try {
          const photoGroups = jobPhotos.reduce((groups, photo) => {
            const key = `${photo.category}|||${photo.subcategory || ''}`;
            (groups[key] = groups[key] || []).push(photo);
            return groups;
          }, {});

          for (const [key, photos] of Object.entries(photoGroups)) {
            const [cat, subcat] = key.split('|||');
            const response = await apiFetch('/api/asana/sync-photos', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                projectGid: targetProjectGid,
                category: cat,
                subcategory: subcat || null,
                photos: photos.map((p) => ({ base64: p.base64, label: p.label })),
              }),
            });
            if (!response.ok) {
              const err = await response.json();
              console.warn('[job-photos] Asana sync warning:', err.error);
            }
          }
        } catch (syncErr) {
          console.warn('[job-photos] Asana sync failed (photos saved locally):', syncErr.message);
        }
      }

      setJobPhotos([]);
      setJobPhotoLabel('');
      setJobPhotoCategory('');
      setJobPhotoSubcategory('');
    } catch (err) {
      console.error('Save job photos error:', err);
      setError(err.message);
    } finally {
      setSavingJobPhotos(false);
    }
  }, [jobPhotos, loadedJob, setLoadedJob, jobNumber, jobName, asanaProject, setError]);

  return {
    jobPhotos,
    setJobPhotos,
    jobPhotoLabel,
    setJobPhotoLabel,
    jobPhotoCategory,
    setJobPhotoCategory,
    jobPhotoSubcategory,
    setJobPhotoSubcategory,
    savingJobPhotos,
    jobPhotoFileRef,
    handleAddJobPhoto,
    handleTakeJobPhoto,
    handleRemoveJobPhoto,
    handleSaveJobPhotos,
  };
}
