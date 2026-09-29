import { useState, useRef, useCallback } from 'react';
import { generatePhotoLabel, stampLabelOnPhoto } from '../utils/imageUtils.js';

export function useSupportingPhotos({ capturePhoto, stopCamera, equipmentNumber }) {
  const [supportingPhotos, setSupportingPhotos] = useState([]);
  const [supportingLabel, setSupportingLabel] = useState('');
  const [nameplateLabel, setNameplateLabel] = useState('');
  const [syncDone, setSyncDone] = useState(false);
  const supportingFileRef = useRef(null);

  const handleAddSupportingPhoto = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const photoNumber = generatePhotoLabel(equipmentNumber, supportingPhotos.length);
        const userNote = supportingLabel.trim() ? ` (${supportingLabel})` : '';
        const label = photoNumber + userNote;
        const stampedBase64 = await stampLabelOnPhoto(reader.result, photoNumber);
        setSupportingPhotos((prev) => [...prev, { base64: stampedBase64, label }]);
        setSupportingLabel('');
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    },
    [equipmentNumber, supportingPhotos.length, supportingLabel]
  );

  const handleTakeSupportingPhoto = useCallback(async () => {
    const base64 = capturePhoto();
    if (!base64) return;
    stopCamera();
    const photoNumber = generatePhotoLabel(equipmentNumber, supportingPhotos.length);
    const userNote = supportingLabel.trim() ? ` (${supportingLabel})` : '';
    const label = photoNumber + userNote;
    const stampedBase64 = await stampLabelOnPhoto(base64, photoNumber);
    setSupportingPhotos((prev) => [...prev, { base64: stampedBase64, label }]);
    setSupportingLabel('');
  }, [capturePhoto, stopCamera, equipmentNumber, supportingPhotos.length, supportingLabel]);

  const handleRemoveSupportingPhoto = useCallback((index) => {
    setSupportingPhotos((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const reset = useCallback(() => {
    setSupportingPhotos([]);
    setSupportingLabel('');
    setNameplateLabel('');
    setSyncDone(false);
  }, []);

  return {
    supportingPhotos,
    setSupportingPhotos,
    supportingLabel,
    setSupportingLabel,
    nameplateLabel,
    setNameplateLabel,
    syncDone,
    setSyncDone,
    supportingFileRef,
    handleAddSupportingPhoto,
    handleTakeSupportingPhoto,
    handleRemoveSupportingPhoto,
    reset,
  };
}
