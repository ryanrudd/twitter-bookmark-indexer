export interface ClusterResult {
  assignments: number[]; // cluster ID for each point
  centroids: number[][]; // centroid vectors
  iterations: number;
}

// Euclidean distance between two vectors
function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

// Add two vectors
function addVectors(a: number[], b: number[]): number[] {
  return a.map((val, i) => val + (b[i] ?? 0));
}

// Divide vector by scalar
function divideVector(v: number[], scalar: number): number[] {
  return v.map((val) => val / scalar);
}

// Zero vector of given dimension
function zeroVector(dim: number): number[] {
  return new Array(dim).fill(0);
}

// K-means++ initialization for better starting centroids
function initializeCentroids(points: number[][], k: number): number[][] {
  const centroids: number[][] = [];
  const n = points.length;

  // Pick first centroid randomly
  const firstIdx = Math.floor(Math.random() * n);
  const firstPoint = points[firstIdx];
  if (firstPoint) {
    centroids.push([...firstPoint]);
  }

  // Pick remaining centroids with probability proportional to distance squared
  for (let c = 1; c < k; c++) {
    const distances: number[] = [];
    let totalDist = 0;

    for (let i = 0; i < n; i++) {
      const point = points[i];
      if (!point) continue;

      // Find minimum distance to existing centroids
      let minDist = Infinity;
      for (const centroid of centroids) {
        const dist = euclideanDistance(point, centroid);
        if (dist < minDist) minDist = dist;
      }
      distances.push(minDist * minDist); // Square the distance
      totalDist += minDist * minDist;
    }

    // Pick next centroid with probability proportional to distance squared
    let random = Math.random() * totalDist;
    for (let i = 0; i < n; i++) {
      const dist = distances[i] ?? 0;
      random -= dist;
      if (random <= 0) {
        const point = points[i];
        if (point) {
          centroids.push([...point]);
        }
        break;
      }
    }

    // Fallback if we didn't pick one (floating point issues)
    if (centroids.length === c) {
      const idx = Math.floor(Math.random() * n);
      const point = points[idx];
      if (point) {
        centroids.push([...point]);
      }
    }
  }

  return centroids;
}

// Assign each point to nearest centroid
function assignClusters(points: number[][], centroids: number[][]): number[] {
  return points.map((point) => {
    let minDist = Infinity;
    let cluster = 0;

    for (let c = 0; c < centroids.length; c++) {
      const centroid = centroids[c];
      if (!centroid) continue;
      const dist = euclideanDistance(point, centroid);
      if (dist < minDist) {
        minDist = dist;
        cluster = c;
      }
    }

    return cluster;
  });
}

// Compute new centroids from assignments
function computeCentroids(
  points: number[][],
  assignments: number[],
  k: number,
  dim: number
): number[][] {
  const sums: number[][] = Array.from({ length: k }, () => zeroVector(dim));
  const counts: number[] = new Array(k).fill(0);

  for (let i = 0; i < points.length; i++) {
    const cluster = assignments[i];
    const point = points[i];
    if (cluster === undefined || !point) continue;

    const sum = sums[cluster];
    if (sum) {
      sums[cluster] = addVectors(sum, point);
      counts[cluster] = (counts[cluster] ?? 0) + 1;
    }
  }

  return sums.map((sum, c) => {
    const count = counts[c] ?? 0;
    if (count === 0) {
      // Empty cluster - reinitialize with random point
      const randomIdx = Math.floor(Math.random() * points.length);
      const point = points[randomIdx];
      return point ? [...point] : zeroVector(dim);
    }
    return divideVector(sum, count);
  });
}

// Check if assignments changed
function assignmentsEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function kmeans(
  points: number[][],
  k: number,
  maxIterations = 100
): ClusterResult {
  if (points.length === 0) {
    return { assignments: [], centroids: [], iterations: 0 };
  }

  if (k >= points.length) {
    // Each point is its own cluster
    return {
      assignments: points.map((_, i) => i),
      centroids: points.map((p) => [...p]),
      iterations: 1,
    };
  }

  const firstPoint = points[0];
  if (!firstPoint) {
    return { assignments: [], centroids: [], iterations: 0 };
  }

  const dim = firstPoint.length;
  let centroids = initializeCentroids(points, k);
  let assignments = assignClusters(points, centroids);
  let iterations = 1;

  for (let iter = 0; iter < maxIterations; iter++) {
    const newCentroids = computeCentroids(points, assignments, k, dim);
    const newAssignments = assignClusters(points, newCentroids);

    iterations = iter + 1;

    if (assignmentsEqual(assignments, newAssignments)) {
      // Converged
      return { assignments: newAssignments, centroids: newCentroids, iterations };
    }

    centroids = newCentroids;
    assignments = newAssignments;
  }

  return { assignments, centroids, iterations };
}

// Elbow method to suggest optimal k
export function suggestK(points: number[][], maxK = 10): number {
  if (points.length <= 3) return Math.max(1, points.length);

  const maxClusters = Math.min(maxK, Math.floor(points.length / 2));
  const inertias: number[] = [];

  for (let k = 1; k <= maxClusters; k++) {
    const result = kmeans(points, k, 50);
    let inertia = 0;

    for (let i = 0; i < points.length; i++) {
      const assignment = result.assignments[i];
      const point = points[i];
      if (assignment === undefined || !point) continue;

      const centroid = result.centroids[assignment];
      if (!centroid) continue;

      const dist = euclideanDistance(point, centroid);
      inertia += dist * dist;
    }

    inertias.push(inertia);
  }

  // Find elbow using second derivative
  let bestK = 2;
  let maxSecondDerivative = 0;

  for (let i = 1; i < inertias.length - 1; i++) {
    const prev = inertias[i - 1] ?? 0;
    const curr = inertias[i] ?? 0;
    const next = inertias[i + 1] ?? 0;
    const secondDerivative = prev - 2 * curr + next;
    if (secondDerivative > maxSecondDerivative) {
      maxSecondDerivative = secondDerivative;
      bestK = i + 1;
    }
  }

  return bestK;
}

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "must", "shall", "can", "to", "of", "in",
  "for", "on", "with", "at", "by", "from", "as", "into", "through",
  "during", "before", "after", "above", "below", "between", "under",
  "again", "further", "then", "once", "here", "there", "when", "where",
  "why", "how", "all", "each", "few", "more", "most", "other", "some",
  "such", "no", "nor", "not", "only", "own", "same", "so", "than",
  "too", "very", "just", "and", "but", "if", "or", "because", "until",
  "while", "this", "that", "these", "those", "it", "its", "i", "you",
  "he", "she", "we", "they", "what", "which", "who", "whom", "his",
  "her", "my", "your", "our", "their", "me", "him", "us", "them",
  "rt", "https", "http", "com", "co", "amp", "www", "like", "get",
  "got", "just", "now", "new", "one", "two", "first", "last", "way",
  "even", "well", "also", "back", "after", "use", "make", "good",
  "know", "take", "see", "come", "think", "look", "want", "give",
  "day", "time", "year", "people", "thing", "man", "woman", "child",
  "world", "life", "hand", "part", "place", "case", "week", "company",
  "system", "program", "question", "work", "government", "number",
  "night", "point", "home", "water", "room", "mother", "area", "money",
  "story", "fact", "month", "lot", "right", "study", "book", "eye",
  "job", "word", "business", "issue", "side", "kind", "head", "house",
  "service", "friend", "father", "power", "hour", "game", "line",
  "end", "member", "law", "car", "city", "community", "name", "really",
  "team", "minute", "idea", "kid", "body", "information", "nothing",
  "ago", "lead", "social", "whether", "call", "gonna", "actually",
  "still", "something", "need", "feel", "become", "lot", "say", "goes",
  "going", "much", "things", "doesn", "wasn", "didn", "won", "isn",
  "aren", "don", "haven", "couldn", "wouldn", "shouldn", "can",
  "let", "doing", "being", "having", "made", "said", "getting",
  "always", "never", "maybe", "every", "another", "many", "any",
  "great", "long", "little", "own", "old", "big", "high", "small",
  "large", "next", "early", "young", "important", "public", "bad",
  "real", "best", "better", "sure", "free", "true", "whole"
]);

function extractWords(text: string): string[] {
  return (text.toLowerCase().match(/\b[a-z]{4,}\b/g) || [])
    .filter((w) => !STOP_WORDS.has(w) && !/^\d+$/.test(w));
}

// Find the tweet closest to the centroid (most representative)
function findCentralText(
  points: number[][],
  texts: string[],
  assignments: number[],
  centroid: number[],
  clusterId: number
): string | null {
  let bestDist = Infinity;
  let bestText: string | null = null;

  for (let i = 0; i < points.length; i++) {
    if (assignments[i] !== clusterId) continue;

    const point = points[i];
    if (!point) continue;

    let dist = 0;
    for (let j = 0; j < point.length; j++) {
      const diff = (point[j] ?? 0) - (centroid[j] ?? 0);
      dist += diff * diff;
    }

    if (dist < bestDist) {
      bestDist = dist;
      bestText = texts[i] ?? null;
    }
  }

  return bestText;
}

// Get cluster labels by showing representative tweet snippets
export function getClusterLabels(
  points: number[][],
  texts: string[],
  assignments: number[],
  k: number,
  centroids?: number[][]
): string[] {
  const labels: string[] = [];

  for (let c = 0; c < k; c++) {
    const clusterIndices = assignments
      .map((a, i) => (a === c ? i : -1))
      .filter((i) => i >= 0);

    if (clusterIndices.length === 0) {
      labels.push(`Empty cluster`);
      continue;
    }

    // Try to find most representative tweet
    let representativeText: string | null = null;

    if (centroids && centroids[c]) {
      representativeText = findCentralText(
        points,
        texts,
        assignments,
        centroids[c],
        c
      );
    }

    // Fallback to first tweet in cluster
    if (!representativeText && clusterIndices[0] !== undefined) {
      representativeText = texts[clusterIndices[0]] ?? null;
    }

    if (representativeText) {
      // Clean up and truncate
      const cleaned = representativeText
        .replace(/https?:\/\/\S+/g, "") // Remove URLs
        .replace(/\s+/g, " ") // Normalize whitespace
        .trim();
      const snippet = cleaned.length > 60
        ? cleaned.slice(0, 57) + "..."
        : cleaned;
      labels.push(snippet || `Cluster ${c + 1}`);
    } else {
      labels.push(`Cluster ${c + 1}`);
    }
  }

  return labels;
}
