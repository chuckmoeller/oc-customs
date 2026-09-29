/**
 * Commercial Roof Inspection 9-Tier Capture Taxonomy & Field Checklist Specifications
 *
 * Enforces standardized documentation across field technicians for commercial roof
 * condition assessments, warranty verifications, and solar/coating suitability audits.
 */

export const ROOF_INSPECTION_TIERS = [
  {
    id: 'site-context',
    stepNumber: 1,
    badge: '1',
    label: 'Site Context',
    title: 'Site Context & Building Facade',
    instruction:
      'Capture wide exterior building elevations, primary access points, address plaques, and site surroundings.',
    tips: [
      'Take photos of the building exterior from ground level or parking lot',
      'Include address numbers or building signage for geolocation verification',
      'Document site accessibility and staging areas',
    ],
    framingBox: {
      aspectRatio: '16:9',
      widthPercent: 90,
      heightPercent: 55,
      shape: 'rounded',
      strokeColor: '#3B82F6', // Blue-500
      glowColor: 'rgba(59, 130, 246, 0.4)',
      overlayLabel: 'Building Exterior & Facade Context',
      reticle: false,
    },
    suggestedLabel: 'Site Context',
    multiPhoto: true,
    required: true,
  },
  {
    id: 'roof-overview',
    stepNumber: 2,
    badge: '2',
    label: 'Roof Overview',
    title: 'Roof Overview & Field Layout',
    instruction:
      'Capture broad panoramic/wide field shots showing overall roof layout, elevation levels, and general layout.',
    tips: [
      'Capture sweeping views from elevated points or corners',
      'Show transitions between different roof sections and elevations',
      'Document overall layout and orientation relative to compass directions',
    ],
    framingBox: {
      aspectRatio: '16:9',
      widthPercent: 88,
      heightPercent: 50,
      shape: 'rounded',
      strokeColor: '#10B981', // Emerald-500
      glowColor: 'rgba(16, 185, 129, 0.4)',
      overlayLabel: 'Wide Roof Field Overview',
      reticle: false,
    },
    suggestedLabel: 'Roof Overview',
    multiPhoto: true,
    required: true,
  },
  {
    id: 'membrane',
    stepNumber: 3,
    badge: '3',
    label: 'Membrane Type',
    title: 'Roof Membrane Identification & Seams',
    instruction:
      'Capture close-up details of the roof membrane surface, seam welds/tapes, attachment plates, and manufacturer marks.',
    tips: [
      'Identify membrane material: TPO, EPDM, PVC, Modified Bitumen, or BUR',
      'Show seam laps, hot-air welds, or splice tape joints',
      'Capture any visible manufacturer print or mil thickness markings',
    ],
    framingBox: {
      aspectRatio: '4:3',
      widthPercent: 75,
      heightPercent: 60,
      shape: 'card',
      strokeColor: '#8B5CF6', // Purple-500
      glowColor: 'rgba(139, 92, 246, 0.4)',
      overlayLabel: 'Inspect Membrane & Seams',
      reticle: true,
    },
    suggestedLabel: 'Membrane Identification',
    multiPhoto: true,
    required: true,
  },
  {
    id: 'surface-condition',
    stepNumber: 4,
    badge: '4',
    label: 'Surface Condition',
    title: 'Surface Condition & Weathering Degradation',
    instruction:
      'Document areas of ponding water, UV chalking, punctures, blisters, cracking, granule loss, or biological growth.',
    tips: [
      'Photograph ponding basins and silt marks remaining from dried puddles',
      'Capture surface blistering, unbonded laps, or physical puncture tears',
      'Include a reference object (pen or ruler) next to significant defects',
    ],
    framingBox: {
      aspectRatio: '4:3',
      widthPercent: 80,
      heightPercent: 60,
      shape: 'grid',
      strokeColor: '#EF4444', // Red-500
      glowColor: 'rgba(239, 68, 68, 0.4)',
      overlayLabel: 'Capture Degradation / Defect Area',
      reticle: true,
    },
    suggestedLabel: 'Surface Condition',
    multiPhoto: true,
    required: false,
  },
  {
    id: 'penetrations',
    stepNumber: 5,
    badge: '5',
    label: 'Penetrations',
    title: 'Penetrations, Curbs & Flashings',
    instruction:
      'Capture pipe boots, vent stacks, pitch pockets, conduit supports, skylight curbs, and roof hatch flashings.',
    tips: [
      'Check rubber pipe boot collars for UV embrittlement and cracking',
      'Inspect pitch pockets for sealant shrinkage, cracking, or voiding',
      'Document counter-flashing termination along all curbs',
    ],
    framingBox: {
      aspectRatio: '1:1',
      widthPercent: 70,
      heightPercent: 55,
      shape: 'card',
      strokeColor: '#F59E0B', // Amber-500
      glowColor: 'rgba(245, 158, 11, 0.4)',
      overlayLabel: 'Center Penetration / Curb Flashing',
      reticle: true,
    },
    suggestedLabel: 'Penetration Detail',
    multiPhoto: true,
    required: false,
  },
  {
    id: 'rooftop-equipment',
    stepNumber: 6,
    badge: '6',
    label: 'Rooftop Equipment',
    title: 'Rooftop Units & Mechanical Equipment',
    instruction:
      'Capture RTUs, exhaust fans, refrigeration racks, ductwork runs, gas pipes, electrical conduits, and curb bases.',
    tips: [
      'Inspect vibration isolation pads and equipment curb seals',
      'Document condensate drain lines discharging onto the membrane',
      'Capture clearances under ductwork and conduit sleepers',
    ],
    framingBox: {
      aspectRatio: '16:9',
      widthPercent: 85,
      heightPercent: 55,
      shape: 'rounded',
      strokeColor: '#06B6D4', // Cyan-500
      glowColor: 'rgba(6, 182, 212, 0.4)',
      overlayLabel: 'Mechanical Equipment & Curb Mounting',
      reticle: false,
    },
    suggestedLabel: 'Rooftop Equipment',
    multiPhoto: true,
    required: false,
  },
  {
    id: 'edge-perimeter',
    stepNumber: 7,
    badge: '7',
    label: 'Edge & Perimeter',
    title: 'Edge Metal, Coping & Parapet Walls',
    instruction:
      'Capture coping metal joints, parapet wall flashing, drip edges, gravel stops, termination bars, and masonry.',
    tips: [
      'Inspect coping metal splice joints and cleat securement',
      'Check parapet wall membrane height (min 8 inches recommended)',
      'Document perimeter flashing sealant condition',
    ],
    framingBox: {
      aspectRatio: '16:9',
      widthPercent: 85,
      heightPercent: 52,
      shape: 'grid',
      strokeColor: '#EC4899', // Pink-500
      glowColor: 'rgba(236, 72, 153, 0.4)',
      overlayLabel: 'Parapet / Coping / Edge Metal',
      reticle: false,
    },
    suggestedLabel: 'Perimeter Coping',
    multiPhoto: true,
    required: false,
  },
  {
    id: 'drainage-slope',
    stepNumber: 8,
    badge: '8',
    label: 'Drainage & Slope',
    title: 'Drainage Systems, Scuppers & Slope',
    instruction:
      'Capture primary roof drains, clamping rings, strainer domes, overflow scuppers, gutters, and cricket tapers.',
    tips: [
      'Verify drain clamping rings are securely bolted down',
      'Check that strainer domes are clear of debris, leaves, or gravel',
      'Examine scupper boxes and exterior conductor heads for water paths',
    ],
    framingBox: {
      aspectRatio: '4:3',
      widthPercent: 75,
      heightPercent: 55,
      shape: 'card',
      strokeColor: '#6366F1', // Indigo-500
      glowColor: 'rgba(99, 102, 241, 0.4)',
      overlayLabel: 'Drain / Scupper Assembly',
      reticle: true,
    },
    suggestedLabel: 'Roof Drainage',
    multiPhoto: true,
    required: false,
  },
  {
    id: 'safety-access',
    stepNumber: 9,
    badge: '9',
    label: 'Safety & Access',
    title: 'Safety Equipment, Access Hatches & Walkways',
    instruction:
      'Capture roof access hatches, fixed ladders, safety perimeter railings, walk-pads, tie-off anchors, and trip hazards.',
    tips: [
      'Photograph access hatch locking hardware and weather stripping',
      'Check ladder rungs, grab bars, and safety gate clearances',
      'Document high-traffic walkways around major RTU service doors',
    ],
    framingBox: {
      aspectRatio: '4:3',
      widthPercent: 80,
      heightPercent: 58,
      shape: 'rounded',
      strokeColor: '#F97316', // Orange-500
      glowColor: 'rgba(249, 115, 22, 0.4)',
      overlayLabel: 'Access Hatch / Ladder / Walkway',
      reticle: false,
    },
    suggestedLabel: 'Safety & Access',
    multiPhoto: true,
    required: false,
  },
];

export const ROOF_MEMBRANE_OPTIONS = [
  'TPO (Thermoplastic Polyolefin)',
  'EPDM (Ethylene Propylene Diene Monomer)',
  'PVC (Polyvinyl Chloride)',
  'Modified Bitumen (Mod-Bit)',
  'Built-Up Roof (BUR / Tar & Gravel)',
  'Standing Seam Metal',
  'SPF (Spray Polyurethane Foam)',
  'Coated Roof System',
  'Other / Unknown',
];

export const WARRANTY_STATUS_OPTIONS = [
  'Active - Manufacturer NDL (No Dollar Limit)',
  'Active - Contractor Workmanship',
  'Expired',
  'Unknown / Unverified',
  'No Warranty',
];

export const ROOF_CONDITION_OPTIONS = [
  'Good (Well-maintained, no active leaks)',
  'Fair (Minor wear, aging seams, maintenance required)',
  'Poor (Moderate ponding, surface blisters, potential leaks)',
  'Critical (Active leaks, severe membrane failure, replacement recommended)',
];

export const ROOF_TAXONOMY_MAP = ROOF_INSPECTION_TIERS.reduce((acc, tier) => {
  acc[tier.id] = tier;
  return acc;
}, {});
