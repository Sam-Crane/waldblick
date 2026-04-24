// GPS averaging helpers.
//
// A single navigator.geolocation.getCurrentPosition reading under forest
// canopy is typically ±15–30 m. Holding still for 30 seconds and
// averaging the stream improves that 2–3×. We use inverse-variance
// weighting so tight fixes dominate the mean.

export type GpsSample = {
  lat: number;
  lng: number;
  accuracy: number; // metres
  at: number; // ms since epoch
};

export type AveragedFix = {
  lat: number;
  lng: number;
  accuracy: number; // metres (1σ of the weighted mean)
  samples: number;
};

// Weighted mean by 1/accuracy². Inverse-variance weighting is the
// maximum-likelihood estimate when each sample's error is Gaussian with
// stddev = accuracy, which is a reasonable assumption for GPS.
export function averagePositions(samples: GpsSample[]): AveragedFix {
  if (samples.length === 0) throw new Error('no_samples');
  if (samples.length === 1) {
    const s = samples[0];
    return { lat: s.lat, lng: s.lng, accuracy: s.accuracy, samples: 1 };
  }

  // Weight = 1 / accuracy² (smaller accuracy = larger weight).
  // Guard against any zero-accuracy reports from buggy drivers.
  const weights = samples.map((s) => 1 / Math.max(s.accuracy, 0.1) ** 2);
  const totalW = weights.reduce((a, b) => a + b, 0);

  const lat = samples.reduce((sum, s, i) => sum + s.lat * weights[i], 0) / totalW;
  const lng = samples.reduce((sum, s, i) => sum + s.lng * weights[i], 0) / totalW;

  // Accuracy of the weighted mean: σ_mean ≈ 1 / sqrt(Σ weights) under
  // the independent-Gaussian assumption. Clamp to min 1 m to avoid
  // reporting unrealistic certainty.
  const accuracy = Math.max(1, 1 / Math.sqrt(totalW));

  return { lat, lng, accuracy, samples: samples.length };
}

// Trim outliers: drop any sample whose coordinate sits further than
// `threshold` metres from the running median. Cheap robust filter that
// removes the occasional wild jump from a GPS hiccup.
export function trimOutliers(samples: GpsSample[], thresholdM = 60): GpsSample[] {
  if (samples.length < 4) return samples;
  // Median lat/lng as a rough center.
  const sortedLat = [...samples].sort((a, b) => a.lat - b.lat);
  const sortedLng = [...samples].sort((a, b) => a.lng - b.lng);
  const mid = Math.floor(samples.length / 2);
  const center = { lat: sortedLat[mid].lat, lng: sortedLng[mid].lng };

  // Convert threshold to degrees (approx — center-latitude scale).
  const dLat = thresholdM / 111_000;
  const dLng = thresholdM / (111_000 * Math.cos((center.lat * Math.PI) / 180));
  return samples.filter(
    (s) => Math.abs(s.lat - center.lat) <= dLat && Math.abs(s.lng - center.lng) <= dLng,
  );
}
