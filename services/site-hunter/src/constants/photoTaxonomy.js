/**
 * Structured Asset Photo Taxonomy & Framing Geometry
 *
 * Enforces a standardized multi-step asset capture workflow across
 * Fieldy workers and Site Hunter PWA.
 */

export const ASSET_TAXONOMY_STEPS = [
  {
    id: 'nameplate',
    label: 'Nameplate',
    badge: '',
    stepNumber: 1,
    required: true,
    multiPhoto: false,
    title: 'Equipment Nameplate / Data Badge',
    instruction: 'Capture a clear scan of the model number, serial number, and electrical specs.',
    tips: [
      'Fill 70%+ of the viewfinder box with the tag',
      'Hold camera steady and parallel to the plate surface',
      'Avoid harsh direct glare, shadow occlusions, or flash reflections',
    ],
    framingBox: {
      aspectRatio: '3:2',
      widthPercent: 82,
      heightPercent: 48,
      shape: 'card',
      strokeColor: '#22C55E', // Green-500
      glowColor: 'rgba(34, 197, 94, 0.4)',
      overlayLabel: 'Align Nameplate Tag Inside Card Box',
      reticle: true,
    },
    suggestedLabel: 'Nameplate',
  },
  {
    id: 'overview',
    label: 'Overview (Optional)',
    badge: 'a',
    stepNumber: 2,
    required: false,
    multiPhoto: true,
    title: 'Unit Overview & Surrounding Context',
    instruction:
      'Capture one or more wide shots showing the entire unit, mounting context, and rooftop clearance.',
    tips: [
      'Take multiple angles if needed (North/South elevations, curb transitions)',
      'Include curb, adjacent units, and safety disconnect switch',
      'Ensure the entire physical footprint is within the frame',
    ],
    framingBox: {
      aspectRatio: '16:9',
      widthPercent: 88,
      heightPercent: 55,
      shape: 'rounded',
      strokeColor: '#3B82F6', // Blue-500
      glowColor: 'rgba(59, 130, 246, 0.4)',
      overlayLabel: 'Wide Equipment Context',
      reticle: false,
    },
    suggestedLabel: 'Overview',
  },
  {
    id: 'electrical',
    label: 'Electrical Disconnect (Optional)',
    badge: 'b',
    stepNumber: 3,
    required: false,
    multiPhoto: true,
    title: 'Electrical Disconnect Switch / Panel',
    instruction:
      'Capture one or more photos of the safety disconnect switch, breaker ratings, or separate panel.',
    tips: [
      'Inspect MCA (Minimum Circuit Ampacity) and MOCP label',
      'Take photos of both the exterior handle and interior panel/wiring if accessible',
      'Capture breaker ratings or disconnect box',
    ],
    framingBox: {
      aspectRatio: '4:3',
      widthPercent: 78,
      heightPercent: 62,
      shape: 'grid',
      strokeColor: '#EAB308', // Yellow-500
      glowColor: 'rgba(234, 179, 8, 0.4)',
      overlayLabel: 'Align Disconnect / Electrical Panel',
      reticle: false,
    },
    suggestedLabel: 'Electrical',
  },
];

/**
 * Reserved for future release when VLM analysis of compressors, coils & line-sets is enabled.
 */
export const FUTURE_MECHANICAL_STEP = {
  id: 'mechanical',
  label: 'Mechanical & Piping (Future)',
  badge: 'c',
  stepNumber: 4,
  required: false,
  title: 'Compressor, Coils & Line Sets',
  instruction:
    'Capture the compressor model tag, fan motors, coil condition, and refrigerant lines.',
  suggestedLabel: 'Mechanical',
};

export const TAXONOMY_MAP = {
  ...ASSET_TAXONOMY_STEPS.reduce((acc, step) => {
    acc[step.id] = step;
    return acc;
  }, {}),
  mechanical: FUTURE_MECHANICAL_STEP,
};
